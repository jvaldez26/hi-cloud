import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Compra, CompraEstado } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';
import { CreateCompraDto } from './dto/create-compra.dto';
import { PrevisualizarCompraDto } from './dto/previsualizar-compra.dto';
import { UpdateNcfProveedorDto } from './dto/update-ncf-proveedor.dto';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { ProductosService } from '../productos/productos.service';
import { ProductoProveedorService } from '../productos/producto-proveedor.service';
import { InventarioService } from '../inventario/inventario.service';
import { ValoracionStockService, convertirADOP } from '../valoracion-stock/valoracion-stock.service';
import { CxPService } from '../cxp/cxp.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { GastosImportacionService } from '../gastos-importacion/gastos-importacion.service';
import { calcularTotalesConDescuento } from '../common/calculo/descuento-documento';
import { reportServiceError } from '../common/observability/sentry';
import { XlinkPublicarService } from '../xlink/xlink-publicar.service';
import { XlinkTipoDocumento } from '../xlink/entities/xlink-documento.entity';

const ITBIS_DEFAULT = 18;

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra)
    private compraRepository: Repository<Compra>,
    @InjectRepository(CompraDetalle)
    private detalleRepository:  Repository<CompraDetalle>,
    private proveedoresService: ProveedoresService,
    private productosService:   ProductosService,
    private productoProveedorSvc: ProductoProveedorService,
    private inventarioService:  InventarioService,
    private valoracionService:  ValoracionStockService,
    private cxpService:         CxPService,
    private asientosService:         AsientosAutomaticosService,
    private tenantService:           TenantService,
    private realtimeService:         RealtimeService,
    private gastosImportacionService: GastosImportacionService,
    @InjectDataSource() private ds:  DataSource,
    private xlinkPublicar: XlinkPublicarService,
  ) {}

  /**
   * COMMIT — conversión de moneda en compras (2026-09-20). Sin esto, una
   * compra en USD/EUR sin tasa (o con tasa 1, el default de la columna)
   * pasaba en silencio: el backend trataba el monto extranjero como si
   * fuera DOP. tipoCambio=1 se rechaza también cuando moneda≠DOP porque es
   * exactamente ese default silencioso — una compra en USD a la par nunca
   * es la intención real.
   */
  private validarMonedaTipoCambio(moneda: string | undefined, tipoCambio: number | undefined): void {
    if (!moneda || moneda === 'DOP') return;
    if (!tipoCambio || tipoCambio === 1) {
      throw new BadRequestException(
        `La compra está en ${moneda} pero no tiene una tasa de cambio válida. ` +
        `Ingresa la tasa RD$/${moneda} del día de la compra antes de guardar.`,
      );
    }
  }

  private async generarFolio(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const prefijo   = 'COM-';
    // Secuencia única por empresa — no por sucursal — para evitar colisión de folios
    return generarNumeroSecuencial(this.ds, 'compras', 'folio', '^COM-[0-9]+$', prefijo, 1, empresaId, 'COM');
  }

  /**
   * Líneas y totales de una compra a partir del DTO.
   *
   * Vive aparte porque la usan `create` y `update`. Duplicarla sería repetir la
   * aritmética fiscal —subtotal sobre lo facturado, ITBIS por línea y
   * `costoUnitarioReal`, que es lo que alimenta el AVCO al recibir— en dos
   * sitios que luego se separan. Es exactamente la deuda que este repo ya paga
   * en otros módulos.
   */
  private async calcularDetalles(dto: CreateCompraDto): Promise<{
    detallesData: Partial<CompraDetalle>[];
    subtotalCompra: number;
    itbisCompra: number;
    descuentoCompra: number;
    descuentoGeneralMonto: number;
    subtotalCompraDOP: number;
    itbisCompraDOP: number;
  }> {
    this.validarMonedaTipoCambio(dto.moneda, dto.tipoCambio);

    const productoIds = dto.detalles.map(d => d.productoId);
    const productosMap = await this.productosService.findByIds(productoIds);

    // Pase 1: validar cada línea y dejarla lista para el motor de descuento
    // general (misma validación de siempre — negativo / mayor al bruto —,
    // ANTES de que el reparto del general entre en juego).
    const preLineas = dto.detalles.map(item => {
      const producto = productosMap.get(item.productoId);
      if (!producto) throw new NotFoundException(`Producto #${item.productoId} no encontrado`);
      const porcentajeItbis  = item.porcentajeItbis ?? ITBIS_DEFAULT;
      const cantidadFact     = Number(item.cantidad);
      const cantidadBon      = Number(item.cantidadBonificada ?? 0);
      const cantidadTot      = Number((cantidadFact + cantidadBon).toFixed(4));

      // Precio 0 = bonificación pura (entra al inventario sin costo).
      // Rechazar solo si además no hay unidades (línea completamente vacía).
      if (Number(item.precioUnitario) === 0 && cantidadTot <= 0) {
        throw new BadRequestException(
          `El producto #${item.productoId} tiene precio 0 y ninguna unidad. Elimina la línea o ingresa la cantidad recibida.`,
        );
      }

      // Importe BRUTO sobre lo FACTURADO (las bonificadas son gratis, nunca entran aquí)
      const importeBruto = Number((cantidadFact * Number(item.precioUnitario)).toFixed(2));

      // Descuento de línea: lo persistido es SIEMPRE el monto. Si no viene
      // monto pero sí % (el frontend enlaza ambos inputs, pero por si llega
      // solo uno), se deriva aquí — nunca al revés, el % es solo ayuda de captura.
      const descuentoMonto = item.descuentoMonto != null
        ? Number(item.descuentoMonto)
        : item.descuentoPct
          ? Number((importeBruto * (Number(item.descuentoPct) / 100)).toFixed(4))
          : 0;

      if (descuentoMonto < 0) {
        throw new BadRequestException(`El descuento del producto #${item.productoId} no puede ser negativo.`);
      }
      if (descuentoMonto > importeBruto) {
        throw new BadRequestException(
          `El descuento del producto #${item.productoId} (${descuentoMonto.toFixed(2)}) supera el importe de la línea (${importeBruto.toFixed(2)}).`,
        );
      }
      // % guardado se recalcula desde el monto persistido — es derivado, no autoritativo.
      const descuentoPct = importeBruto > 0
        ? Number(((descuentoMonto / importeBruto) * 100).toFixed(2))
        : 0;

      return { item, producto, porcentajeItbis, cantidadFact, cantidadBon, cantidadTot, descuentoMonto, descuentoPct };
    });

    // Pase 2: descuento general — mismo motor que factura/cotización/
    // pro-forma/pre-factura (common/calculo/descuento-documento.ts). Reparte
    // proporcionalmente sobre el subtotal YA neto de línea y recalcula el
    // ITBIS de cada línea con SU PROPIA tasa (nunca una tasa promedio).
    const totalesDoc = calcularTotalesConDescuento(
      preLineas.map(p => ({
        cantidad:       p.cantidadFact,
        precioUnitario: Number(p.item.precioUnitario),
        descuentoMonto: p.descuentoMonto,
        porcentajeIva:  p.porcentajeItbis,
      })),
      {
        tipo: dto.descuentoGeneralTipo, valor: dto.descuentoGeneralValor,
        aplicarSobre: dto.descuentoGeneralAplicarSobre as 'subtotal' | 'total' | undefined,
      },
    );

    // Pase 3: cerrar cada línea con su subtotal/ITBIS FINAL (línea + general),
    // el costo real para AVCO sobre ese neto, y su equivalente en DOP.
    const detallesData: Partial<CompraDetalle>[] = preLineas.map((p, i) => {
      const { item, producto, porcentajeItbis, cantidadFact, cantidadBon, cantidadTot, descuentoMonto, descuentoPct } = p;
      const linea = totalesDoc.lineas[i];
      const subtotal     = linea.subtotal;
      const importeItbis = linea.importeIva;
      const total        = linea.total;

      // Costo real = pago NETO de AMBOS descuentos ÷ unidades que entran al
      // inventario (pagadas + bonificadas) — para AVCO. El descuento general
      // también baja el costo unitario, igual que el de línea; la
      // bonificación sigue decidiendo cuántas unidades lo reciben.
      const costoUnitarioReal = cantidadTot > 0
        ? Number((subtotal / cantidadTot).toFixed(4))
        : Number(item.precioUnitario);

      // Conversión a DOP (2026-09-20) — el frontend nunca convierte, envía
      // precioUnitario en la moneda de la compra tal cual; el backend
      // convierte aquí, en el mismo punto donde ya calculaba costoUnitarioReal
      // y los totales, antes de que cualquiera de los dos llegue a AVCO o al
      // asiento. subtotal/importeItbis/total arriba NO se tocan — siguen en
      // la moneda original para conciliar con la factura del proveedor.
      const costoUnitarioRealDOP = convertirADOP(costoUnitarioReal, dto.moneda, dto.tipoCambio);

      return {
        productoId:        item.productoId,
        descripcion:       item.descripcion ?? producto.nombre,
        precioUnitario:    item.precioUnitario,
        cantidad:          cantidadFact,
        cantidadBonificada: cantidadBon,
        cantidadTotal:     cantidadTot,
        porcentajeItbis,
        descuentoPct,
        descuentoMonto,
        subtotal,
        importeItbis,
        total,
        costoUnitarioReal,
        costoUnitarioRealDOP,
        destinoItbis:       item.destinoItbis ?? undefined,
        destinoItbisMotivo: item.destinoItbisMotivo ?? undefined,
      };
    });

    const subtotalCompra       = totalesDoc.subtotal;
    const itbisCompra          = totalesDoc.iva;
    const descuentoGeneralMonto = totalesDoc.descuentoGeneral;
    const descuentoCompra      = Number((preLineas.reduce((s, p) => s + p.descuentoMonto, 0) + descuentoGeneralMonto).toFixed(2));

    // DOP: se suma línea por línea (cada una ya redondeada) para llegar
    // EXACTAMENTE al mismo total que guardará create()/update() — no una
    // conversión de "total × tasa" en un solo paso.
    const subtotalCompraDOP = detallesData.reduce(
      (s, d) => s + Number(convertirADOP(d.subtotal!, dto.moneda, dto.tipoCambio).toFixed(2)), 0,
    );
    const itbisCompraDOP = detallesData.reduce(
      (s, d) => s + Number(convertirADOP(d.importeItbis!, dto.moneda, dto.tipoCambio).toFixed(2)), 0,
    );

    return { detallesData, subtotalCompra, itbisCompra, descuentoCompra, descuentoGeneralMonto, subtotalCompraDOP, itbisCompraDOP };
  }

  /**
   * Anti-duplicado de comprobante de proveedor: el mismo RNC (no el
   * proveedorId — dos proveedores distintos pueden compartir RNC, ver
   * project_rnc_compartido_clientes) con el mismo numeroFacturaProveedor no
   * puede tener dos compras activas a la vez en la misma empresa.
   *
   * Sin índice único todavía (decisión explícita: primero medir cuántos
   * duplicados existen hoy en producción). El pg_advisory_xact_lock serializa
   * el check+insert dentro de la MISMA transacción — sin él, dos requests
   * concurrentes pueden pasar ambas el SELECT antes de que ninguna termine el
   * INSERT. Debe llamarse con el EntityManager de una transacción activa: el
   * lock se libera solo al terminar esa transacción (commit o rollback).
   */
  private async assertNcfNoDuplicado(
    manager: EntityManager,
    empresaId: number,
    proveedorId: number,
    numeroFacturaProveedor: string | null | undefined,
    excluirCompraId?: number,
  ): Promise<void> {
    if (!numeroFacturaProveedor) return;

    const [proveedor] = await manager.query(
      `SELECT rnc FROM proveedores WHERE id = $1 AND "empresaId" = $2`,
      [proveedorId, empresaId],
    );
    if (!proveedor?.rnc) return; // sin RNC no hay con qué cruzar entre proveedores

    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `ncf:${empresaId}:${proveedor.rnc}:${numeroFacturaProveedor}`,
    ]);

    const params: unknown[] = [empresaId, proveedor.rnc, numeroFacturaProveedor];
    let excluirSql = '';
    if (excluirCompraId) {
      params.push(excluirCompraId);
      excluirSql = `AND c.id <> $${params.length}`;
    }
    const [duplicado] = await manager.query(
      `SELECT c.id, c.folio FROM compras c
       JOIN proveedores p ON p.id = c."proveedorId"
       WHERE c."empresaId" = $1 AND p.rnc = $2 AND c."numeroFacturaProveedor" = $3
         AND c."isActive" = true AND c.estado <> 'cancelada' ${excluirSql}
       LIMIT 1`,
      params,
    );
    if (duplicado) {
      throw new ConflictException(
        `Este comprobante ya está registrado en ${duplicado.folio}`,
      );
    }
  }

  /**
   * Idempotencia (recuperación de borradores) — ver Compra.claveIdempotencia.
   * Método privado probado vía `.call({...})`, mismo patrón que
   * FacturasService.buscarPorClaveIdempotencia.
   */
  private async buscarPorClaveIdempotencia(
    claveIdempotencia: string | undefined,
    empresaId: number,
  ): Promise<Compra | null> {
    if (!claveIdempotencia) return null;
    return this.compraRepository.findOne({ where: { empresaId, claveIdempotencia } });
  }

  /**
   * Para el banner de borrador recuperado (frontend): antes de ofrecer
   * "Restaurar", se consulta si la clave de idempotencia del borrador ya
   * generó una compra — nunca se reintenta el POST para averiguarlo. Solo
   * lectura, nunca crea nada. Mismo contrato que FacturasService.porClaveIdempotencia.
   */
  async porClaveIdempotencia(claveIdempotencia: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const compra = await this.buscarPorClaveIdempotencia(claveIdempotencia, empresaId);
    if (!compra) return { existe: false as const };
    return { existe: true as const, id: compra.id, folio: compra.folio };
  }

  async create(dto: CreateCompraDto, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();

    // Idempotencia (recuperación de borradores): si esta clave ya generó una
    // compra, devolver ESA en vez de crear otra. Se resuelve ANTES de
    // assertNcfNoDuplicado (más abajo, dentro de la transacción): un
    // reintento con la misma clave debe devolver la compra existente, nunca
    // un 409 de NCF duplicado contra sí misma.
    const existente = await this.buscarPorClaveIdempotencia(dto.claveIdempotencia, empresaId);
    if (existente) return this.findOne(existente.id);

    await this.proveedoresService.findOne(dto.proveedorId);

    const { detallesData, subtotalCompra, itbisCompra, descuentoCompra, descuentoGeneralMonto, subtotalCompraDOP, itbisCompraDOP } =
      await this.calcularDetalles(dto);

    const folio      = await this.generarFolio();
    const sucursalId = await this.tenantService.resolveSucursalId((dto as any).sucursalId);

    const tipoPago    = dto.tipoPago ?? 'credito';
    const diasCredito = dto.diasCredito ?? 30;
    let fechaVencimiento: Date | undefined;
    if (tipoPago === 'credito') {
      fechaVencimiento = new Date(dto.fecha);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
    }

    // Retenciones E41 (solo informales)
    const retieneItbis          = dto.retieneItbis ?? false;
    const pctItbis              = dto.porcentajeRetencionItbis ?? 30;
    const retieneIsr            = dto.retieneIsr ?? false;
    const pctIsr                = dto.porcentajeRetencionIsr ?? 10;
    const montoItbisTotal       = Number(itbisCompra.toFixed(2));
    const montoRetencionItbis   = retieneItbis ? Number((montoItbisTotal * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsr     = retieneIsr   ? Number((subtotalCompra * pctIsr / 100).toFixed(2)) : 0;
    const totalBruto            = Number((subtotalCompra + itbisCompra).toFixed(2));
    const netoPagar             = Number((totalBruto - montoRetencionItbis - montoRetencionIsr).toFixed(2));

    // Mismo cálculo, en DOP — son los que alimentan AVCO y el asiento
    // (ver cambiarEstado/recibir). subtotal/itbis/total/retenciones arriba
    // siguen en la moneda original de la compra.
    const montoItbisTotalDOP     = Number(itbisCompraDOP.toFixed(2));
    const montoRetencionItbisDOP = retieneItbis ? Number((montoItbisTotalDOP * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsrDOP   = retieneIsr   ? Number((subtotalCompraDOP * pctIsr / 100).toFixed(2)) : 0;
    const totalBrutoDOP          = Number((subtotalCompraDOP + itbisCompraDOP).toFixed(2));
    const netoPagarDOP           = Number((totalBrutoDOP - montoRetencionItbisDOP - montoRetencionIsrDOP).toFixed(2));

    const almacenIdCtx = this.tenantService.getAlmacenId() ?? undefined;

    const savedCompraId = await this.ds.transaction(async (manager) => {
      await this.assertNcfNoDuplicado(manager, empresaId, dto.proveedorId, dto.numeroFacturaProveedor);

      const compra = manager.getRepository(Compra).create({
        empresaId,
        folio,
        fecha:                  new Date(dto.fecha),
        proveedorId:            dto.proveedorId,
        usuarioId:              usuario.id,
        notas:                  dto.notas,
        numeroFacturaProveedor: dto.numeroFacturaProveedor,
        subtotal:               Number(subtotalCompra.toFixed(2)),
        itbis:                  montoItbisTotal,
        descuentoTotal:         Number(descuentoCompra.toFixed(2)),
        descuentoGeneralTipo:   dto.descuentoGeneralTipo ?? null,
        descuentoGeneralValor:  dto.descuentoGeneralValor ?? null,
        descuentoGeneralMonto:  Number(descuentoGeneralMonto.toFixed(2)),
        descuentoGeneralAplicarSobre: dto.descuentoGeneralAplicarSobre ?? null,
        total:                  totalBruto,
        subtotalDOP:            Number(subtotalCompraDOP.toFixed(2)),
        itbisDOP:               montoItbisTotalDOP,
        totalDOP:               totalBrutoDOP,
        montoRetencionItbisDOP,
        montoRetencionIsrDOP,
        netoPagarDOP,
        tipoPago,
        diasCredito,
        fechaVencimiento,
        // DGII 606 — nunca se inventa un valor aquí: lo que mande el DTO
        // (la sugerencia editable del formulario, o lo que haya elegido el
        // usuario) o NULL. La columna existía desde el inicio pero create()
        // nunca la tocaba — toda compra quedaba en NULL para siempre.
        tipoBienes:             dto.tipoBienes ?? null,
        formaPago:              dto.formaPago  ?? null,
        cuentaDestino:          dto.cuentaDestino ?? null,
        moneda:                 dto.moneda ?? 'DOP',
        tipoCambio:             dto.tipoCambio ?? 1,
        retieneItbis,
        porcentajeRetencionItbis: pctItbis,
        montoRetencionItbis,
        retieneIsr,
        porcentajeRetencionIsr: pctIsr,
        montoRetencionIsr,
        netoPagar,
        almacenId:              dto.almacenId ?? almacenIdCtx,
        sucursalId,
        claveIdempotencia:      dto.claveIdempotencia ?? undefined,
      } as any);

      const savedCompra = (await manager.getRepository(Compra).save(compra as any)) as unknown as Compra;

      const detalles = manager.getRepository(CompraDetalle).create(
        detallesData.map((d) => ({ ...d, compraId: savedCompra.id })),
      );
      await manager.getRepository(CompraDetalle).save(detalles);

      return savedCompra.id;
    }).catch(async (err: unknown) => {
      // Carrera de idempotencia: dos peticiones con la misma clave llegaron
      // casi al mismo tiempo, ambas pasaron el buscarPorClaveIdempotencia()
      // de arriba (ninguna vio la fila de la otra todavía) y la segunda
      // choca con el índice único (empresaId, claveIdempotencia) — devolver
      // la que sí se guardó, no reventar con un 500. this.ds.transaction ya
      // hizo rollback solo ante la excepción, así que esta consulta corre
      // limpia, fuera de la transacción abortada (Postgres no deja seguir
      // usando el mismo manager tras un error sin eso).
      if (dto.claveIdempotencia && (err as any)?.code === '23505') {
        const ganadora = await this.compraRepository.findOne({
          where: { empresaId, claveIdempotencia: dto.claveIdempotencia },
        });
        if (ganadora) return ganadora.id;
      }
      throw err;
    });

    this.realtimeService.notify(empresaId, 'compra', 'created', savedCompraId);
    return this.findOne(savedCompraId);
  }

  async findAll(pagination: PaginationDto & {
    estado?: string; desde?: string; hasta?: string; proveedorId?: number;
  }) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    const { limit = 10, page = 1, search, estado, desde, hasta, proveedorId } = pagination;

    const qb = this.compraRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'proveedor')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (sucursalId) qb.andWhere('(c.sucursalId = :sucursalId OR c.sucursalId IS NULL)', { sucursalId });

    if (search) {
      qb.andWhere(
        '(c.folio ILIKE :s OR proveedor.nombre ILIKE :s OR proveedor.rnc ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (estado)      qb.andWhere('c.estado = :estado',           { estado });
    if (proveedorId) qb.andWhere('c.proveedorId = :proveedorId', { proveedorId });
    if (desde)       qb.andWhere('c.fecha >= :desde',            { desde });
    if (hasta)       qb.andWhere('c.fecha <= :hasta',            { hasta });

    const [rawData, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con e-CF (E41) emitido para cada compra
    const ids = rawData.map(c => c.id);
    let ecfMap: Record<number, { numero: string; estadoDGII: string }> = {};
    if (ids.length > 0) {
      const ecfs = await this.ds.query<{ documentoOrigenId: number; numero: string; estadoDGII: string }[]>(
        `SELECT "documentoOrigenId", numero, "estadoDGII"
         FROM ecf
         WHERE "documentoOrigenTipo" = 'COMPRA'
           AND "documentoOrigenId" = ANY($1::int[])
           AND "empresaId" = $2
           AND "isActive" = true
         ORDER BY id DESC`,
        [ids, empresaId],
      );
      for (const e of ecfs) {
        if (!ecfMap[e.documentoOrigenId]) ecfMap[e.documentoOrigenId] = e;
      }
    }

    const data = rawData.map(c => ({
      ...c,
      ecfNumero:  ecfMap[c.id]?.numero     ?? null,
      ecfEstado:  ecfMap[c.id]?.estadoDGII ?? null,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const compra = await this.compraRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['proveedor', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!compra) throw new NotFoundException(`Compra #${id} no encontrada`);
    return compra;
  }

  /**
   * Editar una orden de compra en BORRADOR — cabecera y líneas.
   *
   * No existía. Facturas y Cotizaciones sí tienen su edición de borrador con
   * este mismo guard; Compras se quedó fuera, y el único modo de corregir un
   * borrador equivocado era eliminarlo y rehacerlo desde cero. «Duplicar» no
   * servía: crea otro borrador que tampoco se puede editar.
   *
   * Dos cosas comprobadas antes de escribir esto:
   *
   *   1. Un BORRADOR es INERTE. `create` no toca inventario, ni AVCO, ni
   *      `producto_proveedor`: todo eso vive en `cambiarEstado(RECIBIDA)` y en
   *      `recibir`. Por eso reemplazar sus líneas no deja nada que deshacer.
   *   2. La aprobación guarda el MONTO del momento en `aprobaciones.monto`. Si
   *      se editara con una solicitud pendiente, el aprobador estaría mirando
   *      una cifra distinta de la que autoriza. Con una pendiente no se edita.
   */
  async update(id: number, dto: CreateCompraDto) {
    const compra = await this.findOne(id);

    if (compra.estado !== CompraEstado.BORRADOR) {
      throw new BadRequestException(
        `Solo se pueden editar compras en estado borrador. Esta está "${compra.estado}".`,
      );
    }

    const empresaId = this.tenantService.getEmpresaId();

    const [aprobPendiente] = await this.ds.query<{ id: number }[]>(
      `SELECT id FROM aprobaciones
        WHERE "empresaId" = $1 AND tipo = 'compra' AND "entidadId" = $2
          AND estado = 'pendiente' AND "isActive" = true
        LIMIT 1`,
      [empresaId, id],
    );
    if (aprobPendiente) {
      throw new BadRequestException(
        'Esta compra tiene una solicitud de aprobación pendiente. ' +
        'El aprobador vería un monto distinto al que autoriza: cancela la solicitud antes de editarla.',
      );
    }

    await this.proveedoresService.findOne(dto.proveedorId);

    const { detallesData, subtotalCompra, itbisCompra, descuentoCompra, descuentoGeneralMonto, subtotalCompraDOP, itbisCompraDOP } =
      await this.calcularDetalles(dto);

    const tipoPago    = dto.tipoPago ?? 'credito';
    const diasCredito = dto.diasCredito ?? 30;
    let fechaVencimiento: Date | null = null;
    if (tipoPago === 'credito') {
      fechaVencimiento = new Date(dto.fecha);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
    }

    const retieneItbis        = dto.retieneItbis ?? false;
    const pctItbis            = dto.porcentajeRetencionItbis ?? 30;
    const retieneIsr          = dto.retieneIsr ?? false;
    const pctIsr              = dto.porcentajeRetencionIsr ?? 10;
    const montoItbisTotal     = Number(itbisCompra.toFixed(2));
    const montoRetencionItbis = retieneItbis ? Number((montoItbisTotal * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsr   = retieneIsr   ? Number((subtotalCompra * pctIsr / 100).toFixed(2)) : 0;
    const totalBruto          = Number((subtotalCompra + itbisCompra).toFixed(2));
    const netoPagar           = Number((totalBruto - montoRetencionItbis - montoRetencionIsr).toFixed(2));

    const montoItbisTotalDOP     = Number(itbisCompraDOP.toFixed(2));
    const montoRetencionItbisDOP = retieneItbis ? Number((montoItbisTotalDOP * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsrDOP   = retieneIsr   ? Number((subtotalCompraDOP * pctIsr / 100).toFixed(2)) : 0;
    const totalBrutoDOP          = Number((subtotalCompraDOP + itbisCompraDOP).toFixed(2));
    const netoPagarDOP           = Number((totalBrutoDOP - montoRetencionItbisDOP - montoRetencionIsrDOP).toFixed(2));

    // El folio, el usuario que la creó y la empresa NO se tocan: identifican el
    // documento. Las líneas se reemplazan enteras, como en la edición de
    // facturas — casar línea a línea con lo que hay no aporta nada aquí y
    // dejaría huérfanos los detalles que el formulario borró.
    // El anti-duplicado solo tiene sentido re-correrlo si el comprobante
    // podría CAMBIAR a uno ya existente — proveedorId (de donde sale el RNC
    // efectivo) o numeroFacturaProveedor. Editar una compra que ya es
    // duplicada sin tocar ninguno de los dos (ej. solo las notas) debe seguir
    // funcionando: no es ESTA edición la que la duplicó.
    const cambiaNcfOProveedor =
      dto.proveedorId !== compra.proveedorId ||
      (dto.numeroFacturaProveedor ?? null) !== (compra.numeroFacturaProveedor ?? null);

    await this.ds.transaction(async (em) => {
      if (cambiaNcfOProveedor) {
        await this.assertNcfNoDuplicado(em, empresaId, dto.proveedorId, dto.numeroFacturaProveedor, id);
      }

      await em.getRepository(Compra).update(
        { id, empresaId },
        {
          fecha:                  new Date(dto.fecha),
          proveedorId:            dto.proveedorId,
          notas:                  dto.notas,
          numeroFacturaProveedor: dto.numeroFacturaProveedor,
          subtotal:               Number(subtotalCompra.toFixed(2)),
          itbis:                  montoItbisTotal,
          descuentoTotal:         Number(descuentoCompra.toFixed(2)),
          descuentoGeneralTipo:   dto.descuentoGeneralTipo ?? null,
          descuentoGeneralValor:  dto.descuentoGeneralValor ?? null,
          descuentoGeneralMonto:  Number(descuentoGeneralMonto.toFixed(2)),
          descuentoGeneralAplicarSobre: dto.descuentoGeneralAplicarSobre ?? null,
          total:                  totalBruto,
          subtotalDOP:            Number(subtotalCompraDOP.toFixed(2)),
          itbisDOP:               montoItbisTotalDOP,
          totalDOP:               totalBrutoDOP,
          montoRetencionItbisDOP,
          montoRetencionIsrDOP,
          netoPagarDOP,
          tipoPago,
          diasCredito,
          fechaVencimiento:       fechaVencimiento ?? undefined,
          moneda:                 dto.moneda ?? 'DOP',
          tipoCambio:             dto.tipoCambio ?? 1,
          tipoBienes:             dto.tipoBienes ?? null,
          formaPago:              dto.formaPago  ?? null,
          cuentaDestino:          dto.cuentaDestino ?? null,
          retieneItbis,
          porcentajeRetencionItbis: pctItbis,
          montoRetencionItbis,
          retieneIsr,
          porcentajeRetencionIsr: pctIsr,
          montoRetencionIsr,
          netoPagar,
          almacenId:              dto.almacenId ?? (compra as any).almacenId,
        } as any,
      );

      const detalleRepo = em.getRepository(CompraDetalle);
      await detalleRepo.delete({ compraId: id });
      await detalleRepo.save(
        detalleRepo.create(detallesData.map(d => ({ ...d, compraId: id }))),
      );
    });

    this.realtimeService.notify(empresaId, 'compra', 'updated', id);
    return this.findOne(id);
  }

  /**
   * HiCloud Xlink: aplica los datos de una factura de proveedor RECIBIDA
   * sobre una Compra propia que sigue en ENVIADA (la OC que le mandamos a
   * ese mismo proveedor) — reemplaza cabecera y líneas enteras con lo que
   * la factura dice (es la verdad fiscal), en vez de crear una compra
   * nueva y dejar la OC abierta para siempre. Mismo patrón que update(),
   * pero habilitado en ENVIADA en vez de BORRADOR. De aquí en adelante el
   * camino es el normal: XlinkRecibirService llama cambiarEstado(RECIBIDA).
   */
  async aplicarFacturaProveedorSobreEnviada(id: number, dto: CreateCompraDto): Promise<Compra> {
    const compra = await this.findOne(id);
    if (compra.estado !== CompraEstado.ENVIADA) {
      throw new BadRequestException(
        `Solo se puede aplicar una factura sobre una Compra en estado "enviada". Esta está "${compra.estado}".`,
      );
    }
    const empresaId = this.tenantService.getEmpresaId();
    await this.proveedoresService.findOne(dto.proveedorId);

    const { detallesData, subtotalCompra, itbisCompra, subtotalCompraDOP, itbisCompraDOP } =
      await this.calcularDetalles(dto);

    const tipoPago    = dto.tipoPago ?? 'credito';
    const diasCredito = dto.diasCredito ?? 30;
    let fechaVencimiento: Date | null = null;
    if (tipoPago === 'credito') {
      fechaVencimiento = new Date(dto.fecha);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
    }
    const montoItbisTotal    = Number(itbisCompra.toFixed(2));
    const totalBruto         = Number((subtotalCompra + itbisCompra).toFixed(2));
    const montoItbisTotalDOP = Number(itbisCompraDOP.toFixed(2));
    const totalBrutoDOP      = Number((subtotalCompraDOP + itbisCompraDOP).toFixed(2));

    await this.ds.transaction(async (em) => {
      await this.assertNcfNoDuplicado(em, empresaId, dto.proveedorId, dto.numeroFacturaProveedor, id);

      await em.getRepository(Compra).update(
        { id, empresaId },
        {
          fecha:                  new Date(dto.fecha),
          proveedorId:            dto.proveedorId,
          numeroFacturaProveedor: dto.numeroFacturaProveedor,
          tipoBienes:             dto.tipoBienes ?? null,
          formaPago:              dto.formaPago  ?? null,
          subtotal:               Number(subtotalCompra.toFixed(2)),
          itbis:                  montoItbisTotal,
          total:                  totalBruto,
          subtotalDOP:            Number(subtotalCompraDOP.toFixed(2)),
          itbisDOP:               montoItbisTotalDOP,
          totalDOP:               totalBrutoDOP,
          netoPagar:              totalBruto,
          netoPagarDOP:           totalBrutoDOP,
          moneda:                 dto.moneda ?? 'DOP',
          tipoCambio:             dto.tipoCambio ?? 1,
          tipoPago,
          diasCredito,
          fechaVencimiento:       fechaVencimiento ?? undefined,
        } as any,
      );

      const detalleRepo = em.getRepository(CompraDetalle);
      await detalleRepo.delete({ compraId: id });
      await detalleRepo.save(
        detalleRepo.create(detallesData.map(d => ({ ...d, compraId: id }))),
      );
    });

    this.realtimeService.notify(empresaId, 'compra', 'updated', id);
    return this.findOne(id);
  }

  /**
   * Edición acotada post-borrador: solo NCF del proveedor + tipoBienes/formaPago
   * (606). `update()` reemplaza cabecera y líneas enteras y por eso está
   * cerrado a borrador — una recibida/pagada ya movió inventario, AVCO y el
   * asiento contable, y no hay nada de eso que este método toque. Existe
   * porque el NCF casi nunca llega junto con la recepción (la factura física
   * del proveedor suele llegar después), y sin esto quedaba sin forma de
   * registrarlo: la única edición posible era la de borrador, ya cerrada.
   */
  async actualizarNcfProveedor(id: number, dto: UpdateNcfProveedorDto) {
    const compra = await this.findOne(id);

    const ESTADOS_PERMITIDOS = [CompraEstado.RECIBIDA, CompraEstado.RECIBIDA_PARCIAL, CompraEstado.PAGADA];
    if (!ESTADOS_PERMITIDOS.includes(compra.estado)) {
      throw new BadRequestException(
        `El comprobante del proveedor solo se registra en compras recibidas o pagadas. Esta está "${compra.estado}".`,
      );
    }

    const empresaId = this.tenantService.getEmpresaId();
    // Mismo criterio que update(): sin proveedorId en este DTO, el único
    // cambio posible es el NCF — solo re-validar si de verdad cambia.
    const cambiaNcf =
      dto.numeroFacturaProveedor !== undefined &&
      (dto.numeroFacturaProveedor ?? null) !== (compra.numeroFacturaProveedor ?? null);

    await this.ds.transaction(async (em) => {
      if (cambiaNcf) {
        await this.assertNcfNoDuplicado(em, empresaId, compra.proveedorId, dto.numeroFacturaProveedor, id);
      }
      await em.getRepository(Compra).update(
        { id, empresaId },
        {
          ...(dto.numeroFacturaProveedor !== undefined && { numeroFacturaProveedor: dto.numeroFacturaProveedor }),
          ...(dto.tipoBienes !== undefined && { tipoBienes: dto.tipoBienes }),
          ...(dto.formaPago !== undefined && { formaPago: dto.formaPago }),
        },
      );
    });

    this.realtimeService.notify(empresaId, 'compra', 'updated', id);
    return this.findOne(id);
  }

  async cambiarEstado(id: number, estado: CompraEstado, notas?: string) {
    const compra = await this.findOne(id);

    const transiciones: Record<CompraEstado, CompraEstado[]> = {
      [CompraEstado.BORRADOR]:         [CompraEstado.ENVIADA, CompraEstado.RECIBIDA, CompraEstado.CANCELADA],
      [CompraEstado.ENVIADA]:          [CompraEstado.RECIBIDA, CompraEstado.CANCELADA],
      [CompraEstado.RECIBIDA]:         [CompraEstado.PAGADA, CompraEstado.CANCELADA],
      [CompraEstado.RECIBIDA_PARCIAL]: [CompraEstado.RECIBIDA, CompraEstado.PAGADA, CompraEstado.CANCELADA],
      [CompraEstado.PAGADA]:           [],
      [CompraEstado.CANCELADA]:        [],
    };

    if (!transiciones[compra.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${compra.estado}" a "${estado}"`,
      );
    }

    if (estado === CompraEstado.RECIBIDA) {
      const empresaId   = this.tenantService.getEmpresaId();
      // 1. Registrar entrada en inventario — usar almacén de la compra o el del contexto
      const almacenIdCompra = (compra as any).almacenId ?? this.tenantService.getAlmacenId() ?? undefined;

      // Leer costos de importación pendientes (solo lectura, sin efectos secundarios)
      const costoImportMap = await this.gastosImportacionService.getCostosImportacionPorUnidad(
        compra.id, compra.detalles, empresaId,
      );

      for (const detalle of compra.detalles) {
        // Los servicios no tienen inventario físico ni costo promedio — mismo
        // criterio que InventarioService.registrarSalida(), que ya se corta
        // ahí para no descuadrar stock/AVCO de algo que nunca fue a un
        // almacén (ver inventario.service.ts).
        if ((detalle as any).producto?.tipo === 'servicio') continue;

        // cantidadTotal = facturada + bonificada — todas las unidades entran al stock
        const qtdInventario = Number((detalle as any).cantidadTotal ?? detalle.cantidad);
        const movimiento = await this.inventarioService.registrarEntrada(
          detalle.productoId,
          qtdInventario,
          compra.usuarioId,
          `Compra recibida: ${compra.folio}`,
          compra.folio,
          almacenIdCompra,
        );
        // 1b. Actualizar costo promedio (AVCO).
        // costoReal = precio proveedor + costos de importación prorrateados por unidad.
        // Se omite cuando costoReal = 0 (bonificaciones puras) para no corromper el promedio.
        // stockAntes = cantidadAnterior que registrarEntrada() ya calculó —
        // nunca releer producto.stock aquí: para este punto ya quedó
        // actualizado con la entrada que se acaba de aplicar.
        // costoUnitarioRealDOP (2026-09-20): AVCO siempre en DOP — cae a
        // costoUnitarioReal/precioUnitario en detalles de compras históricas
        // sin la columna (que ya estaban en DOP, así que el valor es el mismo).
        const costoBase     = Number((detalle as any).costoUnitarioRealDOP ?? (detalle as any).costoUnitarioReal ?? detalle.precioUnitario);
        const costoImport   = costoImportMap.get(detalle.id) ?? 0; // ya en DOP (GastoImportacion.montoDOP)
        const costoReal     = costoBase + costoImport;
        if (costoReal > 0) {
          await this.valoracionService.actualizarCostoPromedio(
            detalle.productoId,
            Number((movimiento as any)?.cantidadAnterior ?? 0),
            qtdInventario,
            costoReal,
          );
        }
      }

      // Aplicar gastos de importación: persistir lineas, actualizar detalle, crear asientos
      await this.gastosImportacionService.aplicarGastosPendientes(
        compra.id, compra.detalles, empresaId, compra.usuarioId, compra.folio, compra.fecha as unknown as string,
      );

      // 2. Crear cuenta por pagar solo si tipoPago = 'credito'
      if (!compra.tipoPago || compra.tipoPago === 'credito') {
        await this.cxpService.crear(compra.id, compra.usuarioId, compra.diasCredito ?? 30);
      }

      // 3. Asiento contable automático (con retenciones si aplica)
      // *DOP (2026-09-20): el asiento (mayor general, moneda única DOP) se
      // alimenta con los montos convertidos, no con los de la moneda
      // original de la compra — cae a la columna original en compras
      // históricas sin *DOP (que ya estaban en DOP).
      await this.asientosService.asientoCompraRecibida(
        compra.id,
        Number((compra as any).totalDOP ?? compra.total),
        Number((compra as any).subtotalDOP ?? compra.subtotal),
        Number((compra as any).itbisDOP ?? compra.itbis),
        compra.folio,
        compra.fecha as unknown as string,
        compra.usuarioId,
        compra.retieneItbis || compra.retieneIsr
          ? {
              montoItbis: Number((compra as any).montoRetencionItbisDOP ?? compra.montoRetencionItbis ?? 0),
              montoIsr:   Number((compra as any).montoRetencionIsrDOP   ?? compra.montoRetencionIsr   ?? 0),
              netoPagar:  Number((compra as any).netoPagarDOP ?? compra.netoPagar ?? (compra as any).totalDOP ?? compra.total),
            }
          : undefined,
        // Selector de cuenta contable — la misma compra puede ser gasto,
        // activo fijo o inventario. Sin cuentaDestino, el motor usa su
        // default (Inventario), igual que siempre.
        (compra as any).cuentaDestino || undefined,
        !!(compra as any).cuentaDestino,
      );

      // 4. Limpiar flag "Pendiente" de productos creados rápidamente desde esta OC
      const pidsRecibidos = compra.detalles.map(d => d.productoId);
      if (pidsRecibidos.length > 0) {
        await this.ds.query(
          `UPDATE productos SET "esCreacionRapida" = false WHERE id = ANY($1) AND "empresaId" = $2`,
          [pidsRecibidos, this.tenantService.getEmpresaId()],
        );
      }

      // 5. Registrar qué productos vende este proveedor.
      //    Es el mecanismo PERMANENTE de poblado de producto_proveedor: el
      //    backfill de la migración solo pone al día a quien ya tenía historial;
      //    una empresa nueva llena su catálogo por proveedor solo con operar.
      //    No lanza: una compra se recibe aunque esto falle.
      await this.productoProveedorSvc.registrarDesdeCompra(compra.id);
    }

    if (estado === CompraEstado.CANCELADA && compra.estado === CompraEstado.RECIBIDA) {
      const almacenIdCompra = (compra as any).almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
      for (const detalle of compra.detalles) {
        const qtdInventario = Number((detalle as any).cantidadTotal ?? detalle.cantidad);
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          qtdInventario,
          compra.usuarioId,
          `Cancelación compra: ${compra.folio}`,
          compra.folio,
          almacenIdCompra,
        );
      }
    }

    // TIPO B: si esta Compra (OC) se publicó por HiCloud Xlink, avisar sin
    // romper la cancelación.
    if (estado === CompraEstado.CANCELADA) {
      await this.xlinkPublicar.notificarAnulacionEnOrigen(XlinkTipoDocumento.ORDEN_COMPRA, id).catch(err => {
        reportServiceError(err, 'xlink_notificar_anulacion_compra', { compraId: String(id) });
      });
    }

    const updatePayload: Partial<Compra> = { estado };
    if (notas !== undefined) updatePayload.notas = notas;
    await this.compraRepository.update(id, updatePayload);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'updated', id);
    return this.findOne(id);
  }

  // ── Recepción con cantidades editables por ítem ────────────────────────────
  async recibir(
    id: number,
    dto: { detalles: { detalleId: number; cantidadRecibida: number }[]; notas?: string },
    usuario: { id: number },
  ) {
    const compra = await this.findOne(id);

    const estadosPermitidos: CompraEstado[] = [
      CompraEstado.BORRADOR, CompraEstado.ENVIADA, CompraEstado.RECIBIDA_PARCIAL,
    ];
    if (!estadosPermitidos.includes(compra.estado)) {
      throw new BadRequestException(
        `No se puede recibir una compra en estado "${compra.estado}"`,
      );
    }

    const empresaIdRecibir = this.tenantService.getEmpresaId();
    const almacenIdCompra  = (compra as any).almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
    let todosCompletos = true;

    // Leer costos de importación pendientes antes del bucle (solo lectura)
    const costoImportMapRecibir = await this.gastosImportacionService.getCostosImportacionPorUnidad(
      compra.id, compra.detalles, empresaIdRecibir,
    );

    for (const item of dto.detalles) {
      const detalle = compra.detalles.find(d => d.id === item.detalleId);
      if (!detalle) continue;

      const cantOrdenada    = Number((detalle as any).cantidadTotal ?? detalle.cantidad);
      const yaRecibida      = Number((detalle as any).cantidadRecibida ?? 0);
      const pendiente       = +(cantOrdenada - yaRecibida).toFixed(4);
      if (pendiente <= 0) continue; // ya estaba completo este ítem

      // No recibir más de lo que falta
      const cantNueva        = +Math.min(Number(item.cantidadRecibida), pendiente).toFixed(4);
      if (cantNueva <= 0) continue;

      const cantAcumulada    = +(yaRecibida + cantNueva).toFixed(4);

      // Los servicios no tienen inventario físico ni costo promedio — mismo
      // criterio que en cambiarEstado() (ver nota ahí). La cantidad recibida
      // SÍ se sigue acumulando abajo — solo se salta inventario/AVCO.
      const esServicio = (detalle as any).producto?.tipo === 'servicio';

      if (!esServicio) {
        // Registrar entrada en inventario solo por la cantidad NUEVA de esta recepción
        const movimientoRecibir = await this.inventarioService.registrarEntrada(
          detalle.productoId,
          cantNueva,
          usuario.id,
          `Compra recibida: ${compra.folio}`,
          compra.folio,
          almacenIdCompra,
        );

        // Actualizar AVCO: precio proveedor + costo de importación por unidad.
        // stockAntes = cantidadAnterior de registrarEntrada() — ver nota en cambiarEstado().
        // costoUnitarioRealDOP — ver nota en cambiarEstado().
        const costoBase   = Number((detalle as any).costoUnitarioRealDOP ?? (detalle as any).costoUnitarioReal ?? detalle.precioUnitario);
        const costoImport = costoImportMapRecibir.get(detalle.id) ?? 0;
        const costoReal   = costoBase + costoImport;
        if (costoReal > 0) {
          await this.valoracionService.actualizarCostoPromedio(
            detalle.productoId,
            Number((movimientoRecibir as any)?.cantidadAnterior ?? 0),
            cantNueva,
            costoReal,
          );
        }
      }

      // Guardar la cantidad ACUMULADA total recibida
      await this.detalleRepository.update(detalle.id, {
        cantidadRecibida: cantAcumulada,
      } as any);

      if (cantAcumulada < cantOrdenada) todosCompletos = false;
    }

    const nuevoEstado = todosCompletos ? CompraEstado.RECIBIDA : CompraEstado.RECIBIDA_PARCIAL;

    // Si la compra llega a RECIBIDA final, aplicar gastos de importación pendientes
    if (todosCompletos) {
      await this.gastosImportacionService.aplicarGastosPendientes(
        compra.id, compra.detalles, empresaIdRecibir, usuario.id, compra.folio, compra.fecha as unknown as string,
      );
    }

    // Crear CxP solo en la primera recepción (cuando venía de borrador/enviada)
    const esPrimeraRecepcion = compra.estado !== CompraEstado.RECIBIDA_PARCIAL;
    if (esPrimeraRecepcion && (!compra.tipoPago || compra.tipoPago === 'credito')) {
      await this.cxpService.crear(compra.id, usuario.id, compra.diasCredito ?? 30);
    }

    // Asiento contable solo en la primera recepción
    // *DOP — ver nota en cambiarEstado().
    if (esPrimeraRecepcion) {
      await this.asientosService.asientoCompraRecibida(
        compra.id,
        Number((compra as any).totalDOP ?? compra.total),
        Number((compra as any).subtotalDOP ?? compra.subtotal),
        Number((compra as any).itbisDOP ?? compra.itbis),
        compra.folio,
        compra.fecha as unknown as string,
        usuario.id,
        compra.retieneItbis || compra.retieneIsr
          ? {
              montoItbis: Number((compra as any).montoRetencionItbisDOP ?? compra.montoRetencionItbis ?? 0),
              montoIsr:   Number((compra as any).montoRetencionIsrDOP   ?? compra.montoRetencionIsr   ?? 0),
              netoPagar:  Number((compra as any).netoPagarDOP ?? compra.netoPagar ?? (compra as any).totalDOP ?? compra.total),
            }
          : undefined,
        (compra as any).cuentaDestino || undefined,
        !!(compra as any).cuentaDestino,
      );
    }

    // Limpiar flag "Pendiente" de productos que recibieron stock en esta recepción
    const pidsRecibidos = dto.detalles
      .map(item => compra.detalles.find(d => d.id === item.detalleId)?.productoId)
      .filter((pid): pid is number => pid !== undefined);
    if (pidsRecibidos.length > 0) {
      await this.ds.query(
        `UPDATE productos SET "esCreacionRapida" = false WHERE id = ANY($1) AND "empresaId" = $2`,
        [pidsRecibidos, this.tenantService.getEmpresaId()],
      );
    }

    // Registrar qué productos vende este proveedor. Va también en la recepción
    // PARCIAL: lo recibido ya demuestra que se lo vende, y esperar a la recepción
    // total dejaría fuera las compras que nunca se completan. Es idempotente.
    await this.productoProveedorSvc.registrarDesdeCompra(compra.id);

    const updatePayload: Partial<Compra> = { estado: nuevoEstado };
    if (dto.notas !== undefined) updatePayload.notas = dto.notas;
    await this.compraRepository.update(id, updatePayload);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'updated', id);
    return this.findOne(id);
  }

  async resumenPorEstado() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.compraRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('SUM(c.subtotal)', 'subtotalTotal')
      .addSelect('SUM(c.itbis)', 'itbisTotal')
      .addSelect('SUM(c.total)', 'montoTotal')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true })
      .groupBy('c.estado')
      .getRawMany();
  }

  async duplicar(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const original  = await this.compraRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!original) throw new NotFoundException(`Compra #${id} no encontrada`);

    const folio = await this.generarFolio();

    const nueva = await this.compraRepository.save(
      this.compraRepository.create({
        empresaId,
        folio,
        fecha:       new Date(),
        estado:      CompraEstado.BORRADOR,
        proveedorId: original.proveedorId,
        usuarioId:   userId,
        subtotal:       original.subtotal,
        itbis:          original.itbis,
        descuentoTotal: original.descuentoTotal,
        total:          original.total,
        notas:          original.notas,
      } as any) as any,
    ) as unknown as Compra;

    if (original.detalles?.length) {
      await this.detalleRepository.save(
        original.detalles.map(d => ({
          compraId:           nueva.id,
          productoId:         d.productoId,
          descripcion:        d.descripcion,
          cantidad:           d.cantidad,
          cantidadBonificada: (d as any).cantidadBonificada ?? 0,
          cantidadTotal:      (d as any).cantidadTotal      ?? d.cantidad,
          precioUnitario:     d.precioUnitario,
          porcentajeItbis:    d.porcentajeItbis,
          descuentoPct:       (d as any).descuentoPct   ?? 0,
          descuentoMonto:     (d as any).descuentoMonto ?? 0,
          importeItbis:       d.importeItbis,
          subtotal:           d.subtotal,
          total:              d.total,
          costoUnitarioReal:  (d as any).costoUnitarioReal,
          destinoItbis:       (d as any).destinoItbis ?? undefined,
          destinoItbisMotivo: (d as any).destinoItbisMotivo ?? undefined,
        })) as any,
      );
    }

    this.realtimeService.notify(empresaId, 'compra', 'created', nueva.id);

    return this.compraRepository.findOne({
      where: { id: nueva.id },
      relations: ['proveedor', 'detalles', 'detalles.producto'],
    });
  }

  async remove(id: number) {
    const compra = await this.findOne(id);
    if (compra.estado !== CompraEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar compras en estado borrador');
    }
    await this.compraRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'deleted', id);
    return { message: `Compra ${compra.folio} eliminada` };
  }

  /**
   * Panel de vista previa del asiento (2026-09-19) — calcula subtotal/ITBIS
   * con la MISMA lógica que create() (calcularDetalles(), no una réplica) y
   * delega el asiento en AsientosAutomaticosService.previsualizarCompra().
   * El formulario la llama en cada cambio de líneas/retenciones/cuenta, con
   * debounce (~500ms) — pero una línea puede llegar incompleta (sin
   * precioUnitario todavía) mientras el usuario sigue escribiendo. Antes
   * eso disparaba un 400 (y esos 400 inundaban la auditoría como "ERROR
   * Importante") — ahora las líneas incompletas se ignoran en vez de
   * rechazar toda la vista previa. Ver PrevisualizarCompraDto.
   */
  async previsualizarAsiento(dtoLaxo: PrevisualizarCompraDto) {
    const detallesCompletos = (dtoLaxo.detalles ?? []).filter((d): d is CreateCompraDto['detalles'][number] =>
      d.productoId != null
      && typeof d.cantidad === 'number' && !Number.isNaN(d.cantidad)
      && (d.cantidad > 0 || (typeof d.cantidadBonificada === 'number' && d.cantidadBonificada > 0))
      && typeof d.precioUnitario === 'number' && !Number.isNaN(d.precioUnitario) && d.precioUnitario >= 0,
    );

    if (detallesCompletos.length === 0) {
      return this.asientosService.previsualizarCompra(0, 0, 0, 'OC-VISTA-PREVIA', undefined, dtoLaxo.cuentaDestino || undefined);
    }

    const dto: CreateCompraDto = { ...dtoLaxo, detalles: detallesCompletos } as CreateCompraDto;

    // *DOP — el panel muestra el asiento tal como se va a contabilizar
    // (siempre en DOP); idéntico al original cuando la compra es en DOP.
    const { subtotalCompraDOP, itbisCompraDOP } = await this.calcularDetalles(dto);
    const subtotal = Number(subtotalCompraDOP.toFixed(2));
    const itbis    = Number(itbisCompraDOP.toFixed(2));
    const total    = Number((subtotal + itbis).toFixed(2));

    const retieneItbis = dto.retieneItbis ?? false;
    const retieneIsr   = dto.retieneIsr   ?? false;
    const pctItbis      = dto.porcentajeRetencionItbis ?? 30;
    const pctIsr        = dto.porcentajeRetencionIsr   ?? 10;
    const montoRetencionItbis = retieneItbis ? Number((itbis * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsr   = retieneIsr   ? Number((subtotal * pctIsr / 100).toFixed(2)) : 0;
    const netoPagar = Number((total - montoRetencionItbis - montoRetencionIsr).toFixed(2));

    return this.asientosService.previsualizarCompra(
      total, subtotal, itbis, 'OC-VISTA-PREVIA',
      (retieneItbis || retieneIsr)
        ? { montoItbis: montoRetencionItbis, montoIsr: montoRetencionIsr, netoPagar }
        : undefined,
      dto.cuentaDestino || undefined,
    );
  }
}
