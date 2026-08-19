import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Factura, FacturaEstado } from './entities/factura.entity';
import { FacturaDetalle } from './entities/factura-detalle.entity';
import { CreateFacturaDto, FormaPagoDto } from './dto/create-factura.dto';
import { ClientesService } from '../clientes/clientes.service';
import { ProductosService } from '../productos/productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { ECFService } from '../ecf/ecf.service';
import { CxCService } from '../cxc/cxc.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';
import { LimitesService } from '../suscripciones/limites.service';
import { EmitirECFUseCase, DatosCompradorECF } from '../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo, ECF } from '../ecf/entities/ecf.entity';
import { ReintentoECFJob } from '../ecf/jobs/reintento-ecf.job';
import { TipoClienteECF } from '../clientes/entities/cliente.entity';
import { S3Service } from '../common/s3/s3.service';
import { CajaService } from '../caja/caja.service';
import { RncService } from '../rnc/rnc.service';
import { reportServiceError } from '../common/observability/sentry';

@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);

  constructor(
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private detalleRepository: Repository<FacturaDetalle>,
    private clientesService:  ClientesService,
    private productosService:  ProductosService,
    private inventarioService: InventarioService,
    private ecfService:        ECFService,
    private cxcService:        CxCService,
    private asientosService:   AsientosAutomaticosService,
    private tenantService:     TenantService,
    private realtimeService:   RealtimeService,
    private limitesService:    LimitesService,
    private emitirECFUseCase:  EmitirECFUseCase,
    private reintentoJob:      ReintentoECFJob,
    @InjectRepository(ECF)
    private ecfRepo:           Repository<ECF>,
    private s3Service:         S3Service,
    private cajaService:       CajaService,
    private rncService:        RncService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  private async generarFolio(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    // Siempre usar secuencia única 'FAC' por empresa.
    // FAC_S${sucursalId} fue eliminado porque comparte el prefijo 'FAC-'
    // con la serie principal y causa colisiones de folio único (empresaId, folio).
    const [row] = await this.dataSource.query<{ numero: number }[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
      [empresaId, 'FAC'],
    );
    return `FAC-${row.numero}`;
  }

  /**
   * Invariantes ARITMÉTICAS de las formas de pago. No son juicios de negocio:
   * son las que garantizan que el arqueo de caja cierre, sin importar qué mande
   * el cliente. Viven aquí y no solo en el POS a propósito.
   *
   *   1. La suma de los montos APLICADOS es exactamente el total de la factura.
   *      `monto` es lo que entra a caja por esa vía — nunca el billete que el
   *      cliente entregó, que va en `montoEntregado`.
   *   2. montoEntregado >= monto: no se puede entregar menos de lo aplicado.
   *   3. Ningún monto aplicado negativo (ni cero).
   *   4. Las vías sin vuelto (todo salvo efectivo=1) no pueden exceder el total:
   *      de una tarjeta no se da cambio, así que el efectivo aplicado saldría
   *      negativo.
   *
   * Lo que NO se valida aquí: que una forma "sobre" porque el efectivo entregado
   * ya cubra el total. Un pago con exceso puede ser legítimo (tarjeta 500 +
   * billete de 2.500 en una venta de 2.035) o un error de registro (FAC-219);
   * son estructuralmente idénticos y solo los separa la magnitud del vuelto, que
   * es un juicio del cajero. El POS pide confirmación explícita en ese caso; el
   * backend no puede pedirla y rechazar rompería cobros válidos en el mostrador.
   *
   * Tolerancia 0.01 = el céntimo de redondeo, la misma que ya usa la UI de
   * Facturas. La propina no forma parte del total de la factura, así que si
   * viene declarada se suma al objetivo.
   */
  private validarFormasPago(
    dto: { formasPago?: FormaPagoDto[]; propina?: number },
    totalFactura: number,
  ): void {
    const formas = dto.formasPago;
    if (!formas?.length) return;
    const r2v = (n: number) => Math.round(n * 100) / 100;

    const negativo = formas.find(f => !(Number(f.monto) > 0));
    if (negativo) {
      throw new BadRequestException(
        `[formasPago] Monto inválido (RD$${Number(negativo.monto).toFixed(2)}) en la forma de pago ` +
        `tipo ${negativo.tipo}: debe ser mayor que cero.`,
      );
    }

    const entregadoInvalido = formas.find(
      f => f.montoEntregado != null && Number(f.montoEntregado) < Number(f.monto),
    );
    if (entregadoInvalido) {
      throw new BadRequestException(
        `[formasPago] montoEntregado (RD$${Number(entregadoInvalido.montoEntregado).toFixed(2)}) ` +
        `no puede ser menor que el monto aplicado ` +
        `(RD$${Number(entregadoInvalido.monto).toFixed(2)}).`,
      );
    }

    const sinVuelto = r2v(formas.filter(f => f.tipo !== 1)
      .reduce((s, f) => s + Number(f.monto ?? 0), 0));
    if (sinVuelto > r2v(totalFactura + 0.01)) {
      throw new BadRequestException(
        `[formasPago] Las formas de pago sin vuelto (tarjeta, transferencia, cheque, vale) ` +
        `suman RD$${sinVuelto.toFixed(2)} y superan el total de la factura ` +
        `(RD$${totalFactura.toFixed(2)}). Solo el efectivo admite cambio — corrige los montos.`,
      );
    }

    const objetivo = r2v(totalFactura + Number(dto.propina ?? 0));
    const aplicado = r2v(formas.reduce((s, f) => s + Number(f.monto ?? 0), 0));
    if (Math.abs(aplicado - objetivo) > 0.01) {
      throw new BadRequestException(
        `[formasPago] Los montos aplicados suman RD$${aplicado.toFixed(2)} y el total ` +
        `${dto.propina ? 'con propina ' : ''}es RD$${objetivo.toFixed(2)} ` +
        `(diferencia RD$${Math.abs(aplicado - objetivo).toFixed(2)}). ` +
        `El monto de cada forma debe ser lo APLICADO a la venta; si el cliente ` +
        `entregó de más, ese billete va en montoEntregado.`,
      );
    }
  }

  async create(dto: CreateFacturaDto, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();
    // La verificación de ingresos se hace en confirmar() cuando el total ya está calculado
    if (dto.clienteId) await this.clientesService.findOne(dto.clienteId);

    const r2 = (n: number) => Math.round(n * 100) / 100;

    const detalles: Partial<FacturaDetalle>[] = [];
    let subtotalBase = 0; // suma de subtotales netos por línea (pre descuento general)

    const productoIds = dto.detalles.map(d => d.productoId).filter((id): id is number => id != null);
    const productosMap = await this.productosService.findByIds(productoIds);

    for (const item of dto.detalles) {
      const producto = item.productoId ? (productosMap.get(item.productoId) ?? null) : null;

      // C-4: revalidar precio contra catálogo (previene manipulación desde localStorage)
      if (producto) {
        const precioBase = Number(item.precioOriginal ?? item.precioUnitario);
        if (precioBase <= 0) {
          throw new BadRequestException(
            `Precio inválido para "${producto.nombre}": debe ser mayor a cero`,
          );
        }
        const costo = Number(producto.costoPromedio ?? 0);
        if (costo > 0 && precioBase < costo) {
          throw new BadRequestException(
            `Precio de "${producto.nombre}" (${precioBase}) no puede ser inferior al costo (${costo.toFixed(2)})`,
          );
        }
      }

      const porcentajeIva = item.porcentajeIva ?? (producto ? Number(producto.porcentajeIva) : 18);

      const dm = Number(item.descuentoMonto ?? 0);
      const dp = Number(item.descuentoPct   ?? 0);

      // ── Contrato de descuento por línea ────────────────────────────────────
      // Convención A — Facturas regular (sin precioOriginal):
      //   precioUnitario = precio BRUTO antes de descuento
      //   descuentoMonto = descuento TOTAL de la línea
      //   subtotal = precioUnitario × cantidad − descuentoMonto
      //
      // Convención B — POS con descuento por ítem (precioOriginal presente):
      //   precioUnitario = precio NETO ya descontado por unidad
      //   precioOriginal = precio BRUTO original por unidad
      //   descuentoMonto = descuento POR UNIDAD (no por línea)
      //   Invariante: precioOriginal − descuentoMonto ≈ precioUnitario (±0.05)
      //   subtotal = precioOriginal × cantidad − descuentoMonto × cantidad
      //            = precioUnitario × cantidad  (descuento ya está en precio)
      let precioRaw: number;
      let descLinea = 0;

      if (item.precioOriginal != null && dm > 0) {
        // Convención B: base desde precioOriginal; descuento = dm × cantidad
        const precioOrig = Number(item.precioOriginal);
        const precioNeto = Number(item.precioUnitario);
        const diff = Math.abs((precioOrig - dm) - precioNeto);
        if (diff > 0.05) {
          throw new BadRequestException(
            `[precio] "${item.descripcion ?? 'ítem'}": ` +
            `precioOriginal (${precioOrig}) − descuentoMonto (${dm}) ≠ precioUnitario (${precioNeto}) ` +
            `(diff=${diff.toFixed(4)}). El precio enviado ya incluye el descuento.`,
          );
        }
        precioRaw = precioOrig * item.cantidad;
        descLinea = r2(dm * item.cantidad);
      } else {
        // Convención A: base desde precioUnitario; descuentoMonto es total de la línea
        precioRaw = Number(item.precioUnitario) * item.cantidad;
        const brutoA = r2(precioRaw);
        if (dm > 0) {
          descLinea = r2(Math.min(dm, brutoA));
        } else if (dp > 0) {
          descLinea = r2(brutoA * (dp / 100));
        }
      }

      const bruto = r2(precioRaw);
      const subtotalLinea = r2(bruto - descLinea);
      subtotalBase += subtotalLinea;

      detalles.push({
        productoId:        producto ? item.productoId : undefined,
        opticaInventarioId: item.opticaInventarioId ?? undefined,
        descripcion:       item.descripcion || producto?.nombre || 'Servicio',
        precioUnitario:    item.precioUnitario,
        cantidad:          item.cantidad,
        porcentajeIva,
        descuentoPct:      dp,
        descuentoMonto:    dm,
        precioOriginal:    item.precioOriginal ?? undefined,
        costoUnitario:     Number(producto?.costoPromedio ?? 0),
        // subtotal, importeIva, total se calculan después (tras distribuir descuento general)
        subtotal:   subtotalLinea,
        importeIva: 0,  // provisional
        total:      0,  // provisional
      });
      // Base sin redondear intermedio para calcular IVA con precisión completa en el segundo loop
      (detalles[detalles.length - 1] as any)._baseRaw = precioRaw - descLinea;
    }

    subtotalBase = r2(subtotalBase);

    // Descuento general sobre el subtotal acumulado
    let descGeneral = 0;
    const dgt = dto.descuentoGeneralTipo;
    const dgv = Number(dto.descuentoGeneralValor ?? 0);
    if (dgt === 'monto' && dgv > 0) {
      descGeneral = r2(Math.min(dgv, subtotalBase));
    } else if (dgt === 'porcentaje' && dgv > 0) {
      descGeneral = r2(subtotalBase * (dgv / 100));
    }
    const baseGravable = r2(subtotalBase - descGeneral);

    // Distribuir descuento general proporcionalmente y recalcular IVA por línea
    let subtotalFactura = 0;
    let ivaFactura = 0;
    for (const d of detalles) {
      const baseRaw: number = (d as any)._baseRaw ?? Number(d.subtotal!);
      const subtotNeto = Number(d.subtotal!);
      // Proporción de este detalle sobre el total pre-desc-general
      const descProp = subtotalBase > 0
        ? r2((subtotNeto / subtotalBase) * descGeneral)
        : 0;
      const subtotFinal = r2(subtotNeto - descProp);
      // IVA sobre base cruda (sin redondeo intermedio) para evitar error de ±1 centavo
      const rawFinal = subtotNeto > 0 ? baseRaw * (subtotFinal / subtotNeto) : subtotFinal;
      const ivaLinea    = r2(rawFinal * (Number(d.porcentajeIva) / 100));
      d.subtotal   = subtotFinal;
      d.importeIva = ivaLinea;
      d.total      = r2(subtotFinal + ivaLinea);
      subtotalFactura += subtotFinal;
      ivaFactura      += ivaLinea;
    }
    subtotalFactura = r2(subtotalFactura);
    ivaFactura      = r2(ivaFactura);

    const folio = await this.generarFolio();

    const moneda     = dto.moneda ?? 'DOP';
    const tipoCambio = dto.tipoCambio ?? 1;
    const totalDOP   = r2(subtotalFactura + ivaFactura);
    // Si es moneda extranjera, totalOriginal = monto en esa moneda; total = DOP
    const totalOriginal = moneda !== 'DOP' ? +(totalDOP / tipoCambio).toFixed(2) : undefined;

    this.validarFormasPago(dto, totalDOP);

    // Si hay formasPago explícitas, derivar tipoPago de ellas (tipo 4 = crédito)
    let tipoPago = dto.tipoPago?.toUpperCase() === 'CREDITO' ? 'CREDITO' : 'CONTADO';
    if (dto.formasPago?.length) {
      tipoPago = dto.formasPago.some(f => f.tipo === 4) ? 'CREDITO' : 'CONTADO';
    }

    // Validar límite de crédito antes de crear la factura
    if (tipoPago === 'CREDITO' && dto.clienteId) {
      const [clienteRow] = await this.dataSource.query<{ limiteCredito: string }[]>(
        `SELECT "limiteCredito" FROM clientes WHERE id = $1 AND "empresaId" = $2`,
        [dto.clienteId, empresaId],
      );
      const limiteCredito = Number(clienteRow?.limiteCredito ?? 0);
      if (limiteCredito > 0) {
        const [saldoRow] = await this.dataSource.query<{ saldo: string }[]>(
          `SELECT COALESCE(SUM("montoPendiente"), 0) AS saldo
           FROM cuentas_por_cobrar
           WHERE "clienteId" = $1 AND "empresaId" = $2
             AND estado NOT IN ('pagada','anulada') AND "montoPendiente" > 0`,
          [dto.clienteId, empresaId],
        );
        const saldoPendiente = Number(saldoRow?.saldo ?? 0);
        if (saldoPendiente + totalDOP > limiteCredito) {
          throw new BadRequestException(
            `Límite de crédito excedido. Límite: RD$${limiteCredito.toLocaleString('es-DO')}, ` +
            `Saldo pendiente: RD$${saldoPendiente.toLocaleString('es-DO')}, ` +
            `Esta factura: RD$${totalDOP.toLocaleString('es-DO')}`,
          );
        }
      }
    }

    const diasCred   = tipoPago === 'CREDITO' ? (dto.diasCredito ?? 30) : 0;
    const fechaVenc  = tipoPago === 'CREDITO'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + diasCred); return d; })()
      : undefined;

    // Retenciones (solo E31, campo aplicaRetenciones)
    const aplicaRetenciones   = dto.aplicaRetenciones ?? false;
    const retieneItbis        = aplicaRetenciones && (dto.retieneItbis ?? false);
    const pctRetItbis         = dto.porcentajeRetencionItbis ?? 30;
    const retieneIsr          = aplicaRetenciones && (dto.retieneIsr ?? false);
    const pctRetIsr           = dto.porcentajeRetencionIsr ?? 10;
    const montoRetItbis       = retieneItbis ? Number((ivaFactura * pctRetItbis / 100).toFixed(2)) : 0;
    const montoRetIsr         = retieneIsr   ? Number((subtotalFactura * pctRetIsr / 100).toFixed(2)) : 0;
    const netoCobrar          = Number((totalDOP - montoRetItbis - montoRetIsr).toFixed(2));
    const sucursalId          = await this.tenantService.resolveSucursalId(dto.sucursalId);

    const factura = this.facturaRepository.create({
      folio,
      fecha: new Date(dto.fecha),
      empresaId,
      clienteId: dto.clienteId,
      usuarioId: usuario.id,
      notas:          dto.notas,
      tipoNcf:        dto.tipoNcf ?? 'E32',
      vendedorId:     dto.vendedorId,
      nombreVendedor: dto.nombreVendedor,
      sucursalId,
      moneda,
      tipoCambio,
      totalOriginal,
      subtotal: subtotalFactura,
      iva:      ivaFactura,
      total:    totalDOP,
      tipoPago,
      diasCredito:     diasCred,
      fechaVencimiento: fechaVenc,
      aplicaRetenciones,
      retieneItbis,
      porcentajeRetencionItbis: pctRetItbis,
      montoRetencionItbis: montoRetItbis,
      retieneIsr,
      porcentajeRetencionIsr: pctRetIsr,
      montoRetencionIsr: montoRetIsr,
      netoCobrar,
      descuentoGeneralTipo:  dto.descuentoGeneralTipo ?? undefined,
      descuentoGeneralValor: Number(dto.descuentoGeneralValor ?? 0) > 0
        ? dto.descuentoGeneralValor
        : undefined,
      // Importe pactado c/ITBIS — solo para el recibo; si no viene, se cae al
      // descuento efectivamente aplicado en base (facturas antiguas / módulo Facturas)
      descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
        ? dto.descuentoGeneralFinal
        : undefined,
      ordenCompraNumero: dto.ordenCompraNumero ?? undefined,
      formasPago: dto.formasPago?.length ? dto.formasPago : undefined,
      rncComprador: dto.rncComprador ?? undefined,
    });

    let savedFactura: Factura;
    try {
      savedFactura = await this.facturaRepository.save(factura as any) as Factura;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Factura.create] save() falló — folio=${folio} empresaId=${empresaId}: ${msg}`);
      throw err; // re-throw para que el filtro HTTP lo procese
    }

    const savedDetalles = this.detalleRepository.create(
      detalles.map((d) => ({ ...d, facturaId: savedFactura.id })),
    );
    try {
      await this.detalleRepository.save(savedDetalles);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Factura.create] detalles.save() falló — facturaId=${savedFactura.id}: ${msg}`);
      throw err;
    }

    this.realtimeService.notify(empresaId, 'factura', 'created', savedFactura.id);
    return this.findOne(savedFactura.id);
  }

  /** Editar factura — solo permitido en estado BORRADOR */
  async update(id: number, dto: CreateFacturaDto) {
    const factura = await this.findOne(id);
    if (factura.estado !== FacturaEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden editar facturas en estado borrador');
    }

    if (dto.clienteId) await this.clientesService.findOne(dto.clienteId);

    const r2u = (n: number) => Math.round(n * 100) / 100;

    const detalles: Partial<FacturaDetalle>[] = [];
    let subtotalBaseU = 0;

    const productoIds = dto.detalles.map(d => d.productoId).filter((id): id is number => id != null);
    const productosMap = await this.productosService.findByIds(productoIds);

    for (const item of dto.detalles) {
      const producto = item.productoId ? (productosMap.get(item.productoId) ?? null) : null;

      // C-4: revalidar precio contra catálogo
      if (producto) {
        const precioBase = Number(item.precioOriginal ?? item.precioUnitario);
        if (precioBase <= 0) {
          throw new BadRequestException(
            `Precio inválido para "${producto.nombre}": debe ser mayor a cero`,
          );
        }
        const costo = Number(producto.costoPromedio ?? 0);
        if (costo > 0 && precioBase < costo) {
          throw new BadRequestException(
            `Precio de "${producto.nombre}" (${precioBase}) no puede ser inferior al costo (${costo.toFixed(2)})`,
          );
        }
      }

      const porcentajeIva = item.porcentajeIva ?? (producto ? Number(producto.porcentajeIva) : 18);

      const dmU = Number(item.descuentoMonto ?? 0);
      const dpU = Number(item.descuentoPct   ?? 0);

      // Mismo contrato A/B que en create() — ver comentario allá
      let precioRawU: number;
      let descLineaU = 0;

      if (item.precioOriginal != null && dmU > 0) {
        // Convención B (POS): base desde precioOriginal; descuento = dm × cantidad
        const precioOrigU = Number(item.precioOriginal);
        const precioNetoU = Number(item.precioUnitario);
        const diffU = Math.abs((precioOrigU - dmU) - precioNetoU);
        if (diffU > 0.05) {
          throw new BadRequestException(
            `[precio] "${item.descripcion ?? 'ítem'}": ` +
            `precioOriginal (${precioOrigU}) − descuentoMonto (${dmU}) ≠ precioUnitario (${precioNetoU}) ` +
            `(diff=${diffU.toFixed(4)}). El precio enviado ya incluye el descuento.`,
          );
        }
        precioRawU = precioOrigU * item.cantidad;
        descLineaU = r2u(dmU * item.cantidad);
      } else {
        // Convención A (Facturas): base desde precioUnitario; descuentoMonto es total de la línea
        precioRawU = Number(item.precioUnitario) * item.cantidad;
        const brutoA = r2u(precioRawU);
        if (dmU > 0) {
          descLineaU = r2u(Math.min(dmU, brutoA));
        } else if (dpU > 0) {
          descLineaU = r2u(brutoA * (dpU / 100));
        }
      }

      const brutoU = r2u(precioRawU);
      const subtotalLineaU = r2u(brutoU - descLineaU);
      subtotalBaseU += subtotalLineaU;

      detalles.push({
        productoId:          producto ? item.productoId : undefined,
        opticaInventarioId:  item.opticaInventarioId ?? undefined,
        descripcion:         item.descripcion || producto?.nombre || 'Servicio',
        precioUnitario:      item.precioUnitario,
        cantidad:            item.cantidad,
        porcentajeIva,
        descuentoPct:        dpU,
        descuentoMonto:      dmU,
        precioOriginal:      item.precioOriginal ?? undefined,
        subtotal:   subtotalLineaU,
        importeIva: 0,
        total:      0,
      });
      (detalles[detalles.length - 1] as any)._baseRaw = precioRawU - descLineaU;
    }

    subtotalBaseU = r2u(subtotalBaseU);

    let descGeneralU = 0;
    const dgtU = dto.descuentoGeneralTipo;
    const dgvU = Number(dto.descuentoGeneralValor ?? 0);
    if (dgtU === 'monto' && dgvU > 0) {
      descGeneralU = r2u(Math.min(dgvU, subtotalBaseU));
    } else if (dgtU === 'porcentaje' && dgvU > 0) {
      descGeneralU = r2u(subtotalBaseU * (dgvU / 100));
    }

    let subtotalFactura = 0;
    let ivaFactura = 0;
    for (const d of detalles) {
      const baseRaw: number = (d as any)._baseRaw ?? Number(d.subtotal!);
      const subtotNeto = Number(d.subtotal!);
      const descProp = subtotalBaseU > 0
        ? r2u((subtotNeto / subtotalBaseU) * descGeneralU)
        : 0;
      const subtotFinal = r2u(subtotNeto - descProp);
      const rawFinal = subtotNeto > 0 ? baseRaw * (subtotFinal / subtotNeto) : subtotFinal;
      const ivaLinea    = r2u(rawFinal * (Number(d.porcentajeIva) / 100));
      d.subtotal   = subtotFinal;
      d.importeIva = ivaLinea;
      d.total      = r2u(subtotFinal + ivaLinea);
      subtotalFactura += subtotFinal;
      ivaFactura      += ivaLinea;
    }
    subtotalFactura = r2u(subtotalFactura);
    ivaFactura      = r2u(ivaFactura);

    const moneda        = dto.moneda ?? 'DOP';
    const tipoCambio    = dto.tipoCambio ?? 1;
    const totalDOP      = r2u(subtotalFactura + ivaFactura);
    const totalOriginal = moneda !== 'DOP' ? +(totalDOP / tipoCambio).toFixed(2) : undefined;

    // Mismas invariantes aritméticas que en create(): editar una factura no
    // puede dejar las formas de pago descuadradas contra el nuevo total.
    this.validarFormasPago(dto, totalDOP);

    let tipoPago = dto.tipoPago?.toUpperCase() === 'CREDITO' ? 'CREDITO' : 'CONTADO';
    if (dto.formasPago?.length) {
      tipoPago = dto.formasPago.some(f => f.tipo === 4) ? 'CREDITO' : 'CONTADO';
    }
    const diasCred  = tipoPago === 'CREDITO' ? (dto.diasCredito ?? 30) : 0;
    const fechaVenc = tipoPago === 'CREDITO'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + diasCred); return d; })()
      : null;

    // Reemplazar detalles — eliminar los viejos e insertar los nuevos
    await this.detalleRepository.delete({ facturaId: id });
    await this.detalleRepository.save(
      this.detalleRepository.create(detalles.map(d => ({ ...d, facturaId: id }))),
    );

    // Actualizar cabecera (folio y empresaId NO cambian)
    await this.facturaRepository.update(id, {
      fecha:           new Date(dto.fecha),
      clienteId:       dto.clienteId,
      notas:           dto.notas ?? null,
      tipoNcf:         dto.tipoNcf ?? factura.tipoNcf,
      vendedorId:      dto.vendedorId ?? null,
      nombreVendedor:  dto.nombreVendedor ?? null,
      moneda,
      tipoCambio,
      totalOriginal:   totalOriginal ?? null,
      subtotal:        subtotalFactura,
      iva:             ivaFactura,
      total:           totalDOP,
      tipoPago,
      diasCredito:     diasCred,
      fechaVencimiento: fechaVenc,
      descuentoGeneralTipo:  dgtU ?? null,
      descuentoGeneralValor: dgvU > 0 ? dgvU : null,
      descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
        ? Number(dto.descuentoGeneralFinal)
        : null,
      ordenCompraNumero:     dto.ordenCompraNumero ?? null,
      formasPago:            dto.formasPago?.length ? dto.formasPago : null,
    } as any);

    this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
    return this.findOne(id);
  }

  /** Subir archivo de Orden de Compra y persistir URL en S3 */
  async subirOrdenCompra(id: number, file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<{ url: string }> {
    const empresaId = this.tenantService.getEmpresaId();
    const factura   = await this.findOne(id);
    const url = await this.s3Service.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      'ordenes-compra',
      empresaId,
    );
    if (!url) throw new BadRequestException('Almacenamiento S3 no configurado');
    await this.facturaRepository.update(
      { id: factura.id, empresaId } as any,
      { ordenCompraUrl: url },
    );
    return { url };
  }

  async findAll(pagination: PaginationDto & {
    estado?: string; desde?: string; hasta?: string; clienteId?: number; vendedorId?: number;
  }) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    const { limit = 10, page = 1, search, estado, desde, hasta, clienteId,
            tipoPago, tipoNcf, montoMin, montoMax, vendedorId } = pagination as any;

    // La entidad Factura solo tiene `ecfId` como columna plana — sin @ManyToOne.
    // Cargamos las facturas primero, luego enriquecemos con datos ECF en una
    // sola consulta adicional (evita el N+1).
    const qb = this.facturaRepository
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'cliente')
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.isActive = :active', { active: true });

    if (sucursalId) qb.andWhere('(f.sucursalId = :sucursalId OR f.sucursalId IS NULL)', { sucursalId });

    if (search) {
      qb.andWhere(
        `(f.folio ILIKE :s
          OR cliente.nombre ILIKE :s
          OR cliente.rfc   ILIKE :s
          OR EXISTS (
            SELECT 1 FROM ecf e
            WHERE e."facturaId" = f.id
              AND e."documentoOrigenTipo" = 'FACTURA'
              AND e.numero ILIKE :s
          ))`,
        { s: `%${search}%` },
      );
    }
    if (estado)    qb.andWhere('f.estado = :estado', { estado });
    if (clienteId) qb.andWhere('f.clienteId = :clienteId', { clienteId });
    if (desde)     qb.andWhere('f.fecha >= :desde', { desde });
    if (hasta)     qb.andWhere('f.fecha <= :hasta', { hasta });
    if (tipoPago)  qb.andWhere('f."tipoPago" = :tipoPago', { tipoPago });
    if (tipoNcf)   qb.andWhere('f."tipoNcf" = :tipoNcf', { tipoNcf });
    if (montoMin != null)  qb.andWhere('f.total >= :montoMin', { montoMin });
    if (montoMax != null)  qb.andWhere('f.total <= :montoMax', { montoMax });
    if (vendedorId != null) qb.andWhere('f."vendedorId" = :vendedorId', { vendedorId });

    const [data, total] = await qb
      .orderBy('f.fecha', 'DESC')
      .addOrderBy('f.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Carga ECF directamente por facturaId (no depende de factura.ecfId)
    const facturaIds = data.map((f: any) => f.id);
    let ecfByFacturaId: Record<number, any> = {};
    if (facturaIds.length > 0) {
      const ecfRows: any[] = await this.facturaRepository.manager.query(
        `SELECT DISTINCT ON ("facturaId")
           "facturaId", id, numero, "estadoDGII", "codigoSeguridad", "qrUrl", "trackId",
           "rncComprador", "razonSocialComprador"
         FROM ecf
         WHERE "facturaId" = ANY($1)
           AND "documentoOrigenTipo" = 'FACTURA'
         ORDER BY "facturaId", "createdAt" DESC`,
        [facturaIds],
      );
      for (const e of ecfRows) {
        ecfByFacturaId[e.facturaId] = e;
      }
    }

    // Enriquecer con nombre de sucursal (query liviana — evita join innecesario)
    const sucursalIds = [...new Set((data as any[]).map((f: any) => f.sucursalId).filter(Boolean))] as number[];
    let sucursalNombreMap: Record<number, string> = {};
    if (sucursalIds.length > 0) {
      const sRows: { id: number; nombre: string }[] = await this.facturaRepository.manager.query(
        `SELECT id, nombre FROM sucursales WHERE id = ANY($1)`,
        [sucursalIds],
      );
      for (const s of sRows) sucursalNombreMap[s.id] = s.nombre;
    }

    const enriched = data.map((f: any) => ({
      ...f,
      ecf:            ecfByFacturaId[f.id] ?? null,
      sucursalNombre: sucursalNombreMap[f.sucursalId] ?? null,
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const factura = await this.facturaRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!factura) throw new NotFoundException(`Factura #${id} no encontrada`);

    // Enriquecer con datos ECF (qrUrl, numero, codigoSeguridad, trackId, respuestaMSeller)
    const ecfRow = await this.facturaRepository.manager.query<any[]>(`
      SELECT id, numero, "estadoDGII", "codigoSeguridad", "qrUrl", "trackId",
             "fechaFirma", "ultimoIntentoEnvio",
             "respuestaMSeller", "respuestaDgii", "jsonEnviado",
             "rncComprador", "razonSocialComprador"
      FROM ecf
      WHERE "facturaId" = $1 AND "isActive" = true
      ORDER BY "createdAt" DESC
      LIMIT 1
    `, [id]);

    return { ...factura, ecf: ecfRow[0] ?? null };
  }

  // ── Búsqueda de facturas para E33/E34 ────────────────────────────────────────
  // Devuelve facturas con e-CF ACEPTADO que sirven como documento de referencia.

  /**
   * Busca e-CFs aceptados para usar como referencia en E33 (Nota Débito) o E34 (Nota Crédito).
   * Según normativa DGII:
   *   - E33 solo puede referenciar E31.
   *   - E34 puede referenciar E31, E32, E41, E43, E44, E45, E46, E47.
   */
  async buscarParaNota(q: string, tipoNota: 'E33' | 'E34' = 'E34') {
    const empresaId = this.tenantService.getEmpresaId();
    if (!q || q.length < 2) return [];

    // Tipos válidos según tipoNota (DGII: E33 solo puede referenciar E31)
    const tiposPermitidos =
      tipoNota === 'E33'
        ? ['E31']
        : ['E31', 'E32', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47'];

    // ── Query principal: FROM facturas (approach original que funcionaba) ──────
    // Buscamos facturas con ECF activo, sin importar estado DGII (excluimos anulado).
    // Usamos el prefijo del eNCF para determinar tipo cuando tipoECFId no resuelve.
    const rows = await this.facturaRepository.manager.query<any[]>(`
      SELECT
        f.id,
        f.folio,
        f.fecha::text                                             AS fecha,
        f.total::numeric                                          AS total,
        f.subtotal::numeric                                       AS subtotal,
        f.iva::numeric                                            AS iva,
        c.id                                                      AS "clienteId",
        c.nombre                                                  AS "clienteNombre",
        c."rncReceptor"                                           AS "clienteRNC",
        e.id                                                      AS "ecfId",
        e.numero                                                  AS "encf",
        e."estadoDGII"                                            AS "estadoEcf",
        COALESCE(t.codigo, SUBSTRING(e.numero, 1, 3))             AS "tipoEcf",
        COALESCE(f.moneda, 'DOP')                                 AS moneda,
        COALESCE(f."tipoCambio", 1)::numeric                      AS "tipoCambio",
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'productoId',     fd."productoId",
              'descripcion',    fd.descripcion,
              'cantidad',       fd.cantidad::numeric,
              'precioUnitario', fd."precioUnitario"::numeric,
              'porcentajeIva',  fd."porcentajeIva"::numeric,
              'importeIva',     fd."importeIva"::numeric,
              'total',          fd.total::numeric
            ) ORDER BY fd.id
          ) FILTER (WHERE fd.id IS NOT NULL),
          '[]'::json
        )                                                         AS detalles
      FROM facturas f
      LEFT JOIN clientes c        ON c.id  = f."clienteId"
      LEFT JOIN ecf e             ON e."facturaId" = f.id AND e."isActive" = true
      LEFT JOIN tipos_ecf t       ON t.id  = e."tipoECFId"
      LEFT JOIN factura_detalles fd ON fd."facturaId" = f.id
      WHERE f."empresaId" = $1
        AND f."isActive"  = true
        AND f.estado IN ('emitida', 'pagada')
        AND e.id IS NOT NULL
        AND COALESCE(t.codigo, SUBSTRING(e.numero, 1, 3)) = ANY($3::text[])
        AND (
          f.folio            ILIKE $2
          OR e.numero        ILIKE $2
          OR c.nombre        ILIKE $2
          OR c."rncReceptor" ILIKE $2
        )
      GROUP BY f.id, f.folio, f.fecha, f.total, f.subtotal, f.iva,
               c.id, c.nombre, c."rncReceptor",
               e.id, e.numero, e."estadoDGII", e."tipoECFId", t.codigo
      ORDER BY f.fecha DESC
      LIMIT 20
    `, [empresaId, `%${q}%`, tiposPermitidos]);

    this.logger.debug(
      `[buscarParaNota] q="${q}" tipoNota=${tipoNota} empresa=${empresaId} → ${rows.length} resultados`,
    );
    return rows;
  }

  // ── Detecta si el pago es inmediato según el campo notas ─────────────────────
  private esPagoInmediato(notas: string | undefined | null): boolean {
    const n = (notas ?? '').toLowerCase();
    // Ventas a crédito nunca son pago inmediato aunque las notas contengan "pos ·"
    if (/cr[eé]dito/.test(n)) return false;
    return /efectivo|tarjeta|transferencia|cheque|pos\s*·/.test(n);
  }

  /**
   * Sugiere el tipo de e-CF basado en el tipo de cliente.
   * Usado en creación de facturas para pre-seleccionar tipoNcf correcto.
   */
  static determinarTipoEcf(tipoCliente: TipoClienteECF | string | undefined): string {
    switch (tipoCliente) {
      case TipoClienteECF.PERSONA_JURIDICA:  return 'E31';
      case TipoClienteECF.PERSONA_FISICA:    return 'E31';
      case TipoClienteECF.CONSUMIDOR_FINAL:  return 'E32';
      case TipoClienteECF.EXTRANJERO:        return 'E46';
      case TipoClienteECF.REGIMEN_ESPECIAL:  return 'E44';
      case TipoClienteECF.GUBERNAMENTAL:     return 'E45';
      default:                               return 'E32';
    }
  }

  /**
   * @param modoSincrono       true = POS (timeout 8s, fallo devuelve PENDIENTE no lanza)
   * @param tipoEcfOverride    tipo de e-CF del POS (sobreescribe el tipoNcf de la factura)
   * @param datosComprador     datos del comprador capturados en POS
   * @param modoContingencia   true = crear e-CF en CONTINGENCIA sin llamar a MSeller
   */
  async cambiarEstado(
    id: number,
    estado: FacturaEstado,
    modoSincrono = false,
    tipoEcfOverride?: number,
    datosComprador?: DatosCompradorECF,
    modoContingencia?: boolean,
  ) {
    const factura = await this.findOne(id);

    // El estado PAGADA solo se alcanza vía flujo de cobro (recibos-cobro / cxc.registrarPago),
    // que actualiza CxC, pagos_cobrados, asiento contable y tesorería. Bloqueamos el atajo manual.
    if (estado === FacturaEstado.PAGADA) {
      throw new BadRequestException(
        'El estado "pagada" se registra a través de un cobro (Recibo de Cobro), no manualmente. ' +
        'Ve a Cuentas por Cobrar → Registrar cobro.',
      );
    }

    const transiciones: Record<FacturaEstado, FacturaEstado[]> = {
      [FacturaEstado.BORRADOR]:  [FacturaEstado.EMITIDA,  FacturaEstado.CANCELADA],
      [FacturaEstado.EMITIDA]:   [FacturaEstado.CANCELADA],
      [FacturaEstado.PAGADA]:    [FacturaEstado.CANCELADA],  // permitir anular facturas pagadas
      [FacturaEstado.CANCELADA]: [],
    };

    if (!transiciones[factura.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${factura.estado}" a "${estado}"`,
      );
    }

    if (estado === FacturaEstado.EMITIDA) {
      // Verificar que hay caja abierta si la factura viene del POS (tiene vendedorId)
      if ((factura as any).vendedorId) {
        const cajaCheck = await this.cajaService.esCajaAbiertaVendedor(
          (factura as any).vendedorId,
          factura.empresaId,
        );
        if (!cajaCheck.ok) {
          const esHuerfana = cajaCheck.mensaje?.startsWith('CAJA_HUERFANA:');
          throw new BadRequestException(
            esHuerfana
              // Extrae solo la parte descriptiva después de "CAJA_HUERFANA:ID:"
              ? cajaCheck.mensaje!.split(':').slice(2).join(':').trim()
              : 'No hay una caja diaria abierta para este vendedor. Abre el turno antes de facturar.',
          );
        }
      }

      // Verificar límite de ingresos ANTES de emitir
      const aviso = await this.limitesService.verificarLimiteIngresos(
        factura.empresaId,
        Number(factura.total),
      ).catch(err => { throw err; }); // deja pasar ForbiddenException con código 402

      const pagoInmediato = this.esPagoInmediato(factura.notas);

      const tipoEcfNum = tipoEcfOverride ?? parseInt(
        (factura.tipoNcf ?? 'E32').replace('E', ''),
        10,
      );

      // E46 (exportaciones): si la factura está en moneda extranjera, pasar OtraMoneda
      const otraMoneda = tipoEcfNum === 46 && factura.moneda && factura.moneda !== 'DOP'
        ? {
            Moneda:     factura.moneda,
            TipoCambio: Number(factura.tipoCambio ?? 1),
            MontoTotal: Number(factura.totalOriginal ?? factura.total),
          }
        : undefined;

      // Fallback: si el RNC está presente pero la razón social es genérica o falta
      // (p.ej. el cajero confirmó antes de que terminara el lookup DGII en el frontend),
      // consultamos DGII aquí para obtener el nombre real del comprador.
      if (datosComprador?.rnc &&
          (!datosComprador.razonSocial || /^consumidor\s+final$/i.test(datosComprador.razonSocial))) {
        const rncDatos = await this.rncService.consultarRNC(datosComprador.rnc).catch(() => null);
        if (rncDatos?.encontrado && rncDatos.nombre) {
          datosComprador = { ...datosComprador, razonSocial: rncDatos.nombre };
        }
      }

      const ecfInput = {
        empresaId:           factura.empresaId,
        documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
        documentoOrigenId:   factura.id,
        tipoEcf:             tipoEcfNum,
        modoSincrono,
        modoContingencia:    modoContingencia === true,
        otraMoneda:          otraMoneda as any,
        datosComprador,
      };

      // 1a. Descontar stock de inventario óptico si aplica
      for (const detalle of factura.detalles) {
        if (!(detalle as any).opticaInventarioId) continue;
        await this.dataSource.query(
          `UPDATE op_inventario SET "stockActual" = GREATEST(0, "stockActual" - $1), "updatedAt" = NOW() WHERE id = $2`,
          [Number(detalle.cantidad), (detalle as any).opticaInventarioId],
        ).catch((err: unknown) => {
          this.logger.warn(
            `[Factura] descuento stock óptico id=${(detalle as any).opticaInventarioId} falló (no bloquea emisión): ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
          // TIPO B: la factura ya se emitió — reportar a Sentry SIN romper el flujo.
          reportServiceError(err, 'factura_descuento_stock_optico', {
            facturaId:          String(factura.id),
            empresaId:          String(factura.empresaId ?? ''),
            folio:              factura.folio,
            opticaInventarioId: String((detalle as any).opticaInventarioId ?? ''),
          });
        });
      }

      // 1. Salida de inventario — no bloquear emisión si falla (ej. stock ya ajustado manualmente)
      const almacenIdCtx = this.tenantService.getAlmacenId() ?? undefined;
      for (const detalle of factura.detalles) {
        if (!detalle.productoId) continue;
        await this.inventarioService.registrarSalida(
          detalle.productoId,
          Number(detalle.cantidad),
          factura.usuarioId,
          `Factura emitida: ${factura.folio}`,
          factura.folio,
          almacenIdCtx,
        ).catch((err: unknown) => {
          this.logger.warn(
            `[Factura] registrarSalida para ${factura.folio} falló (no bloquea emisión): ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
          // TIPO B: la factura ya se emitió — reportar a Sentry SIN romper el flujo.
          reportServiceError(err, 'factura_registrar_salida_inventario', {
            facturaId:  String(factura.id),
            empresaId:  String(factura.empresaId ?? ''),
            folio:      factura.folio,
            productoId: String(detalle.productoId ?? ''),
          });
        });
      }

      // 2. CxC — solo si tipoPago === 'CREDITO' (contado nunca genera CxC)
      const esCredito = (factura as any).tipoPago === 'CREDITO';
      const diasCred  = Number((factura as any).diasCredito ?? 0);
      if (esCredito) {
        const dias = diasCred > 0 ? diasCred : 30;
        // Si hay retenciones la CxC es por el netoCobrar (no el total bruto)
        await this.cxcService.crear(factura.id, factura.usuarioId, dias);
        if (diasCred > 0) {
          const fv = new Date();
          fv.setDate(fv.getDate() + dias);
          await this.facturaRepository.update(factura.id, { fechaVencimiento: fv } as any);
        }
      }

      // 3. Asiento contable — no bloquear emisión si la empresa no tiene cuentas configuradas
      const aplicaRet   = (factura as any).aplicaRetenciones === true;
      const retItbis    = aplicaRet ? Number((factura as any).montoRetencionItbis ?? 0) : 0;
      const retIsr      = aplicaRet ? Number((factura as any).montoRetencionIsr   ?? 0) : 0;
      const netoCobrar  = aplicaRet ? Number((factura as any).netoCobrar ?? factura.total) : Number(factura.total);
      await this.asientosService.asientoFacturaEmitida(
        factura.id,
        Number(factura.total),
        Number(factura.subtotal),
        Number(factura.iva),
        factura.folio,
        factura.usuarioId,
        aplicaRet ? { retItbis, retIsr, netoCobrar } : undefined,
      ).catch((err: unknown) => {
        this.logger.warn(
          `[Factura] asientoFacturaEmitida para ${factura.folio} falló (no bloquea emisión): ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
        // TIPO B: la factura ya se emitió — reportar a Sentry SIN romper el flujo.
        reportServiceError(err, 'factura_asiento_contable', {
          facturaId: String(factura.id),
          empresaId: String(factura.empresaId ?? ''),
          folio:     factura.folio,
        });
      });

      // 4. Estado provisional: EMITIDA siempre (PAGADA se sella en el paso 6, después
      //    de confirmar la emisión del e-CF). Así, si DGII rechaza, la factura queda
      //    en EMITIDA (recuperable/reintentable) y NUNCA en PAGADA-sin-e-CF-válido.
      await this.facturaRepository.update(id, { estado: FacturaEstado.EMITIDA });
      this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);

      // 4b. Actualizar cache de ingresos del mes en suscripción
      this.limitesService.actualizarCacheIngresos(factura.empresaId).catch(() => null);

      // 5. Emitir e-CF
      if (modoSincrono) {
        // POS: awaitar el e-CF (timeout 8s ya manejado en el use case).
        // Si falla, NO fingir éxito: devolver { ecfEmitido:false, ecfError } para que
        // el frontend muestre el aviso obligatorio al cajero y Sentry registre el fallo.
        const ecfResult = await this.emitirECFUseCase.execute(ecfInput).catch(async err => {
          this.logger.error(
            `[ECF-POS] Fallo al emitir e-CF para ${factura.folio} ` +
            `[${err?.code ?? err?.constructor?.name ?? 'Error'}]: ${err?.message}`,
          );
          reportServiceError(err, 'ecf_pos_sincrono', {
            folio:     factura.folio,
            empresaId: String(factura.empresaId ?? ''),
            tipoEcf:   String(ecfInput.tipoEcf ?? ''),
          });
          const facturaActual = await this.findOne(id).catch(() => null);
          return { ...(facturaActual ?? {}), ecfEmitido: false, ecfError: err?.message ?? 'Error al emitir e-CF' };
        });

        // 6. Linkear ecfId + sellar PAGADA (solo si CONTADO y emisión exitosa).
        //    Si ecfEmitido === false (DGII rechazó o error), la factura queda EMITIDA.
        const ecfEmitidoOk = (ecfResult as any)?.ecfEmitido !== false;
        if (ecfEmitidoOk) {
          const ecfIdPOS = (ecfResult as any)?.ecf?.id;
          const posPatch: Record<string, unknown> = {};
          if (ecfIdPOS) posPatch.ecfId = ecfIdPOS;
          if (!esCredito) posPatch.estado = FacturaEstado.PAGADA;
          if (Object.keys(posPatch).length) {
            await this.facturaRepository.update(id, posPatch as any);
            this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
          }
        }

        return ecfResult;
      }

      // Non-POS: fire-and-forget — sellar PAGADA en el .then() una vez que el e-CF
      // haya procesado (no antes), para la misma garantía que el flujo POS.
      this.emitirECFUseCase.execute(ecfInput)
        .then(async result => {
          const updates: Record<string, unknown> = {};
          if (result?.ecf?.id) updates.ecfId = result.ecf.id;
          // CONTADO: sellar PAGADA ahora que la emisión no lanzó
          if (!esCredito) updates.estado = FacturaEstado.PAGADA;
          if (Object.keys(updates).length) {
            await this.facturaRepository.update(id, updates as any);
            if (!esCredito) this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
          }
        })
        .catch(async (err) => {
          // SIEMPRE loggear como ERROR para que sea visible (nunca silencioso).
          // La factura queda EMITIDA — no PAGADA con e-CF rechazado.
          this.logger.error(
            `[ECF] Fallo al emitir e-CF para ${factura.folio} ` +
            `[${err?.code ?? err?.constructor?.name ?? 'Error'}]: ${err?.message}`,
          );
          // TIPO B (patrón #1): igualar el path POS — reportar a Sentry SIN romper.
          // La factura ya está EMITIDA; el fallo del e-CF non-POS no debe quedar invisible.
          reportServiceError(err, 'ecf_non_pos', {
            facturaId: String(id),
            empresaId: String(factura.empresaId ?? ''),
            folio:     factura.folio,
            tipoEcf:   String(ecfInput.tipoEcf ?? ''),
          });
          // Intentar linkear el ECF si fue creado antes del fallo de MSeller
          try {
            const ecfCreado = await this.facturaRepository.manager
              .createQueryBuilder()
              .select(['e.id'])
              .from('ecf', 'e')
              .where('e."facturaId" = :id AND e."documentoOrigenTipo" = :tipo', {
                id,
                tipo: 'FACTURA',
              })
              .orderBy('e."createdAt"', 'DESC')
              .limit(1)
              .getRawOne();
            if (ecfCreado?.e_id) {
              await this.facturaRepository.update(id, { ecfId: ecfCreado.e_id });
            }
          } catch (linkErr: unknown) {
            this.logger.warn(
              `[ECF] No se pudo linkear ecfId a factura ${id}: ` +
              `${linkErr instanceof Error ? linkErr.message : String(linkErr)}`,
            );
          }
        });

      return this.findOne(id);
    }

    if (estado === FacturaEstado.CANCELADA && factura.estado === FacturaEstado.EMITIDA) {
      for (const detalle of factura.detalles) {
        if (!detalle.productoId) continue;
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          Number(detalle.cantidad),
          factura.usuarioId,
          `Cancelación factura: ${factura.folio}`,
          factura.folio,
        );
      }

      // Anular CxC vinculada (si la factura era a crédito)
      await this.cxcService.anularPorFacturaId(id).catch(err =>
        this.logger.warn(
          `Cancelación factura #${id}: no se pudo anular CxC — ${(err as Error).message}`,
        ),
      );
    }

    await this.facturaRepository.update(id, { estado });
    this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const factura = await this.findOne(id);
    if (factura.estado !== FacturaEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar facturas en estado borrador');
    }
    await this.facturaRepository.update(id, { isActive: false });
    return { message: `Factura ${factura.folio} eliminada` };
  }

  /**
   * Busca facturas emitidas/pagadas sin e-CF asociado y los emite uno a uno.
   * Útil para recuperar facturas creadas antes de configurar MSeller.
   */
  async recuperarEcfFacturasSinComprobante(usuario: any) {
    const empresaId = this.tenantService.getEmpresaId();

    // Facturas activas en estado emitida/pagada sin ECF creado (JOIN LEFT + IS NULL)
    const facturasSinEcf: Factura[] = await this.facturaRepository
      .createQueryBuilder('f')
      .leftJoin(
        'ecf', 'e',
        'e."facturaId" = f.id AND e."documentoOrigenTipo" = \'FACTURA\'',
      )
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.estado IN (:...estados)', { estados: ['emitida', 'pagada'] })
      .andWhere('f.isActive = :active', { active: true })
      .andWhere('e.id IS NULL')
      .select(['f.id', 'f.folio', 'f.tipoNcf', 'f.empresaId'])
      .getMany();

    this.logger.log(
      `Recuperación e-CF: ${facturasSinEcf.length} factura(s) sin comprobante ` +
      `en empresa #${empresaId}`,
    );

    const resultados: Array<{
      facturaId: number; folio: string; estado: string; encf?: string; error?: string;
    }> = [];

    for (const factura of facturasSinEcf) {
      try {
        const tipoEcfNum = parseInt((factura.tipoNcf ?? 'E32').replace('E', ''), 10);
        const result = await this.emitirECFUseCase.execute({
          empresaId:           factura.empresaId ?? empresaId,
          documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
          documentoOrigenId:   factura.id,
          tipoEcf:             tipoEcfNum,
          modoSincrono:        false,
        });
        if (result?.ecf?.id) {
          await this.facturaRepository.update(factura.id, { ecfId: result.ecf.id });
        }
        resultados.push({ facturaId: factura.id, folio: factura.folio, estado: 'OK', encf: result.encf });
        this.logger.log(`Recuperado: ${factura.folio} → ${result.encf} (${result.estado})`);
      } catch (err: any) {
        resultados.push({
          facturaId: factura.id,
          folio:     factura.folio,
          estado:    'ERROR',
          error:     err?.message ?? 'Error desconocido',
        });
        this.logger.warn(`No se pudo emitir e-CF para ${factura.folio}: ${err?.message}`);
      }
      // Rate limiting para no saturar MSeller
      await new Promise<void>(r => setTimeout(r, 600));
    }

    return {
      empresaId,
      totalEncontradas: facturasSinEcf.length,
      procesadas:       resultados.length,
      exitosas:         resultados.filter(r => r.estado === 'OK').length,
      errores:          resultados.filter(r => r.estado === 'ERROR').length,
      resultados,
    };
  }

  /**
   * Emite e-CF para una sola factura que ya está EMITIDA o PAGADA pero no
   * tiene comprobante. Llamado por el botón "Emitir e-CF" en la UI.
   */
  async emitirEcfIndividual(id: number, usuario: any, confirmaRncNoVigente = false) {
    const empresaId = this.tenantService.getEmpresaId();
    const factura   = await this.findOne(id);

    if (!['emitida', 'pagada'].includes(factura.estado)) {
      throw new BadRequestException(
        `Solo se puede emitir el comprobante fiscal para facturas EMITIDAS o PAGADAS. ` +
        `Estado actual: ${factura.estado}`,
      );
    }

    // PRINCIPIO: si la factura YA tiene un comprobante, NUNCA se genera uno nuevo.
    // Se reconcilia/reenvía el MISMO (misma lógica que el cron de reintento) para no
    // duplicar la emisión ante DGII cuando el original sí se procesó pero se perdió la respuesta.
    const existente = await this.ecfRepo.findOne({
      where: { facturaId: factura.id, documentoOrigenTipo: DocumentoOrigenTipo.FACTURA, empresaId },
      order: { createdAt: 'DESC' },
    });

    if (existente) {
      this.logger.log(
        `Emitir manual: factura ${factura.folio} ya tiene comprobante ${existente.numero} ` +
        `(${existente.estadoDGII}) — se reconcilia/reenvía, NO se genera uno nuevo`,
      );
      const resultado = await this.reintentoJob.procesarUno(existente);

      // Consulta no concluyente → no se pudo confirmar nada. Fail-safe: no reenviar
      // ni marcar estado; avisar al cajero en sus términos (sin nombrar infraestructura).
      if (resultado === 'sin_confirmar') {
        throw new ServiceUnavailableException(
          'No se pudo confirmar el estado del comprobante fiscal en este momento. ' +
          'La factura quedó pendiente; reinténtalo en unos minutos.',
        );
      }

      const rec = await this.ecfRepo.findOne({ where: { id: existente.id }, relations: ['tipoECF'] });
      if (rec?.id) await this.facturaRepository.update(id, { ecfId: rec.id });
      return this.emitirECFUseCase.resultadoDe(rec!, true);
    }

    // Sin comprobante previo → primera emisión (ÚNICO caso que genera un eNCF nuevo).
    const tipoEcfNum = parseInt((factura.tipoNcf ?? 'E32').replace('E', ''), 10);

    // E31/E44/E45 exigen RNC del comprador. Si el cliente seleccionado no tiene RNC
    // en su perfil pero la factura tiene rncComprador (capturado en el POS al cobrar),
    // lo pasamos como datosComprador para que el builder lo use sin fallar.
    // La razón social se resuelve desde el RNC vía RncService (caché 24h, mismo mecanismo
    // que el modal del POS) — sin necesidad de columna razonSocialComprador en facturas.
    const clienteRnc = (factura as any).cliente?.rncReceptor ?? (factura as any).cliente?.rfc;
    let datosCompradorIndividual: DatosCompradorECF | undefined;
    if ([31, 44, 45].includes(tipoEcfNum) && !clienteRnc && (factura as any).rncComprador) {
      const rncFactura = String((factura as any).rncComprador);
      const rncDatos   = await this.rncService.consultarRNC(rncFactura).catch(() => null);
      datosCompradorIndividual = {
        rnc:         rncFactura,
        razonSocial: rncDatos?.encontrado && rncDatos.nombre ? rncDatos.nombre : undefined,
      };
    }

    // La confirmación de RNC no vigente viaja aunque no haya otros datos del
    // comprador — que es el caso normal aquí: el cliente ya tiene su RNC en la
    // ficha, así que el bloque de arriba no llega a construir nada.
    if (confirmaRncNoVigente) {
      datosCompradorIndividual = {
        ...(datosCompradorIndividual ?? {}),
        confirmaRncNoVigente: true,
      };
    }

    try {
      const result = await this.emitirECFUseCase.execute({
        empresaId:           factura.empresaId ?? empresaId,
        documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
        documentoOrigenId:   factura.id,
        tipoEcf:             tipoEcfNum,
        modoSincrono:        false,
        datosComprador:      datosCompradorIndividual,
      });

      if (result?.ecf?.id) {
        await this.facturaRepository.update(id, { ecfId: result.ecf.id });
      }
      return result;
    } catch (err: any) {
      // Sanear el error hacia el usuario: nunca exponer nombres de infraestructura.
      // El detalle técnico ya quedó en el log/estado del e-CF para diagnóstico.
      if (err?.code === 'ECF_VALIDACION') {
        throw new BadRequestException(
          `El comprobante fiscal fue rechazado por validación. ` +
          `Revisa los datos de la factura (RNC, montos, tipo) e intenta de nuevo.`,
        );
      }
      if (err?.code === 'ECF_COMUNICACION') {
        throw new ServiceUnavailableException(
          'No se pudo emitir el comprobante fiscal en este momento. Reinténtalo en unos minutos.',
        );
      }
      if (err?.code === 'ECF_CONFIG_FALTANTE') {
        throw new BadRequestException(
          'La configuración de comprobantes fiscales está incompleta. Contacta al administrador.',
        );
      }
      throw err;
    }
  }

  // ── Duplicar factura ─────────────────────────────────────────────────────────

  async duplicar(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const original  = await this.facturaRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!original) throw new NotFoundException(`Factura #${id} no encontrada`);

    const folio = await this.generarFolio();

    const nuevaGuardada = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId,
        folio,
        fecha:       new Date(),
        estado:      FacturaEstado.BORRADOR,
        clienteId:   original.clienteId,
        moneda:      original.moneda,
        tipoCambio:  original.tipoCambio,
        tipoNcf:     original.tipoNcf,
        tipoPago:    original.tipoPago,
        diasCredito: original.diasCredito,
        subtotal:    original.subtotal,
        iva:         original.iva,
        total:       original.total,
        notas:       original.notas,
        usuarioId:   userId,
      } as any) as any,
    ) as unknown as Factura;

    if (original.detalles?.length) {
      await this.detalleRepository.save(
        original.detalles.map(d => ({
          facturaId:      nuevaGuardada.id,
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          cantidad:       d.cantidad,
          precioUnitario: d.precioUnitario,
          porcentajeIva:  d.porcentajeIva,
          importeIva:     d.importeIva,
          subtotal:       d.subtotal,
          total:          d.total,
        })) as any,
      );
    }

    this.logger.log(`Factura #${id} duplicada → nueva factura #${nuevaGuardada.id} (${folio})`);
    this.realtimeService.notify(empresaId, 'factura', 'created', nuevaGuardada.id);

    return this.facturaRepository.findOne({
      where: { id: nuevaGuardada.id },
      relations: ['cliente', 'detalles', 'detalles.producto'],
    });
  }

  async resumenPorEstado() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.facturaRepository
      .createQueryBuilder('f')
      .select('f.estado', 'estado')
      .addSelect('COUNT(f.id)', 'cantidad')
      .addSelect('SUM(f.total)', 'montoTotal')
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.isActive = :active', { active: true })
      .groupBy('f.estado')
      .getRawMany();
  }

  /**
   * Facturas con saldo pendiente de cobro (para selector en Recibos de Cobro).
   * Consulta cuentas_por_cobrar para obtener montoPendiente real.
   */
  async getPendientesCobro(clienteId?: number): Promise<any[]> {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();

    const params: any[] = [empresaId];
    let idx = 2;

    let sql = `
      SELECT
        f.id,
        f.folio          AS numero,
        f.total,
        cxc."montoPendiente" AS saldo,
        cxc."montoPagado",
        f.moneda,
        f."clienteId",
        f."sucursalId",
        c.nombre         AS "clienteNombre"
      FROM cuentas_por_cobrar cxc
      JOIN facturas f ON f.id = cxc."facturaId"
      LEFT JOIN clientes c ON c.id = f."clienteId"
      WHERE cxc."empresaId" = $1
        AND cxc."isActive"  = true
        AND cxc."montoPendiente" > 0
        AND cxc.estado NOT IN ('pagada', 'anulada')
        AND f."isActive" = true
    `;

    if (clienteId) {
      sql += ` AND f."clienteId" = $${idx}`;
      params.push(clienteId);
      idx++;
    }

    if (sucursalId) {
      sql += ` AND (f."sucursalId" = $${idx} OR f."sucursalId" IS NULL)`;
      params.push(sucursalId);
      idx++;
    }

    sql += ` ORDER BY f.fecha DESC, f."createdAt" DESC LIMIT 200`;

    return this.dataSource.query(sql, params);
  }
}
