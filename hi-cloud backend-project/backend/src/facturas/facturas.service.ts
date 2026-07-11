import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Factura, FacturaEstado } from './entities/factura.entity';
import { FacturaDetalle } from './entities/factura-detalle.entity';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { ClientesService } from '../clientes/clientes.service';
import { ProductosService } from '../productos/productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { ECFService } from '../ecf/ecf.service';
import { CxCService } from '../cxc/cxc.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { User } from '../users/users.entity';
import { LimitesService } from '../suscripciones/limites.service';
import { EmitirECFUseCase, DatosCompradorECF } from '../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../ecf/entities/ecf.entity';
import { TipoClienteECF } from '../clientes/entities/cliente.entity';
import { S3Service } from '../common/s3/s3.service';

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
    private s3Service:         S3Service,
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
      const porcentajeIva = item.porcentajeIva ?? (producto ? Number(producto.porcentajeIva) : 18);

      // Descuento por línea: monto fijo tiene precedencia; pct se aplica solo si monto = 0
      const bruto = r2(Number(item.precioUnitario) * item.cantidad);
      let descLinea = 0;
      const dm = Number(item.descuentoMonto ?? 0);
      const dp = Number(item.descuentoPct   ?? 0);
      if (dm > 0) {
        descLinea = r2(Math.min(dm, bruto));
      } else if (dp > 0) {
        descLinea = r2(bruto * (dp / 100));
      }
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
      const subtotNeto = Number(d.subtotal!);
      // Proporción de este detalle sobre el total pre-desc-general
      const descProp = subtotalBase > 0
        ? r2((subtotNeto / subtotalBase) * descGeneral)
        : 0;
      const subtotFinal = r2(subtotNeto - descProp);
      const ivaLinea    = r2(subtotFinal * (Number(d.porcentajeIva) / 100));
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
      const porcentajeIva = item.porcentajeIva ?? (producto ? Number(producto.porcentajeIva) : 18);

      const brutoU = r2u(Number(item.precioUnitario) * item.cantidad);
      let descLineaU = 0;
      const dmU = Number(item.descuentoMonto ?? 0);
      const dpU = Number(item.descuentoPct   ?? 0);
      if (dmU > 0) {
        descLineaU = r2u(Math.min(dmU, brutoU));
      } else if (dpU > 0) {
        descLineaU = r2u(brutoU * (dpU / 100));
      }
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
      const subtotNeto = Number(d.subtotal!);
      const descProp = subtotalBaseU > 0
        ? r2u((subtotNeto / subtotalBaseU) * descGeneralU)
        : 0;
      const subtotFinal = r2u(subtotNeto - descProp);
      const ivaLinea    = r2u(subtotFinal * (Number(d.porcentajeIva) / 100));
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
        '(f.folio ILIKE :s OR cliente.nombre ILIKE :s OR cliente.rfc ILIKE :s)',
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
           "facturaId", id, numero, "estadoDGII", "codigoSeguridad", "qrUrl", "trackId"
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
             "respuestaMSeller", "respuestaDgii", "jsonEnviado"
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

    const transiciones: Record<FacturaEstado, FacturaEstado[]> = {
      [FacturaEstado.BORRADOR]:  [FacturaEstado.EMITIDA,  FacturaEstado.CANCELADA],
      [FacturaEstado.EMITIDA]:   [FacturaEstado.PAGADA,   FacturaEstado.CANCELADA],
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
        const hoy = fechaHoyRD();
        const [cajaAbierta] = await this.dataSource.query<{ id: number }[]>(`
          SELECT id FROM cierres_caja
          WHERE "empresaId" = $1 AND DATE(fecha) = $2
            AND estado = 'abierta' AND "vendedorId" = $3 LIMIT 1
        `, [factura.empresaId, hoy, (factura as any).vendedorId]).catch(() => []);

        if (!cajaAbierta) {
          throw new BadRequestException(
            'No hay una caja diaria abierta para este vendedor. Abre el turno antes de facturar.',
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
      });

      // 4. Actualizar estado de la factura
      // Contado → siempre PAGADA al emitir (pago se recibe en el acto)
      // Crédito → EMITIDA (pendiente de cobro)
      const estadoFinal = !esCredito ? FacturaEstado.PAGADA : FacturaEstado.EMITIDA;
      await this.facturaRepository.update(id, { estado: estadoFinal });
      this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);

      // 4b. Actualizar cache de ingresos del mes en suscripción
      this.limitesService.actualizarCacheIngresos(factura.empresaId).catch(() => null);

      // 5. Emitir e-CF
      if (modoSincrono) {
        // POS: awaitar el e-CF (timeout 8s ya manejado en el use case, nunca lanza)
        return this.emitirECFUseCase.execute(ecfInput).catch(err => {
          this.logger.warn(`e-CF POS fallido para ${factura.folio}: ${err?.message}`);
          return null;
        });
      }

      // Non-POS: fire-and-forget — actualizar factura.ecfId si tiene éxito o falla
      this.emitirECFUseCase.execute(ecfInput)
        .then(result => {
          if (result?.ecf?.id) {
            return this.facturaRepository.update(id, { ecfId: result.ecf.id });
          }
        })
        .catch(async (err) => {
          // SIEMPRE loggear como ERROR para que sea visible (nunca silencioso)
          this.logger.error(
            `[ECF] Fallo al emitir e-CF para ${factura.folio} ` +
            `[${err?.code ?? err?.constructor?.name ?? 'Error'}]: ${err?.message}`,
          );
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
  async emitirEcfIndividual(id: number, usuario: any) {
    const empresaId = this.tenantService.getEmpresaId();
    const factura   = await this.findOne(id);

    if (!['emitida', 'pagada'].includes(factura.estado)) {
      throw new BadRequestException(
        `Solo se puede emitir e-CF para facturas EMITIDAS o PAGADAS. Estado actual: ${factura.estado}`,
      );
    }

    const tipoEcfNum = parseInt((factura.tipoNcf ?? 'E32').replace('E', ''), 10);

    const result = await this.emitirECFUseCase.execute({
      empresaId:           factura.empresaId ?? empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
      documentoOrigenId:   factura.id,
      tipoEcf:             tipoEcfNum,
      modoSincrono:        false,
    });

    if (result?.ecf?.id) {
      await this.facturaRepository.update(id, { ecfId: result.ecf.id });
    }

    return result;
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
