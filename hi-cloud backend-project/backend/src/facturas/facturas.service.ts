import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { User } from '../users/users.entity';
import { LimitesService } from '../suscripciones/limites.service';
import { EmitirECFUseCase, DatosCompradorECF } from '../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../ecf/entities/ecf.entity';
import { TipoClienteECF } from '../clientes/entities/cliente.entity';

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
  ) {}

  private async generarFolio(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const result = await this.facturaRepository
      .createQueryBuilder('f')
      .select(`MAX(CASE WHEN f.folio ~ '^FAC-[0-9]+$'
                        THEN CAST(SUBSTRING(f.folio FROM 5) AS INTEGER)
                        ELSE 100 END)`, 'maxNum')
      .where('f.empresaId = :eid', { eid: empresaId })
      .andWhere('f.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    const next = Math.max(101, (result?.maxNum ?? 100) + 1);
    return `FAC-${next}`;
  }

  async create(dto: CreateFacturaDto, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();
    // La verificación de ingresos se hace en confirmar() cuando el total ya está calculado
    if (dto.clienteId) await this.clientesService.findOne(dto.clienteId);

    const detalles: Partial<FacturaDetalle>[] = [];
    let subtotalFactura = 0;
    let ivaFactura = 0;

    for (const item of dto.detalles) {
      const producto = item.productoId
        ? await this.productosService.findOne(item.productoId)
        : null;
      const porcentajeIva = item.porcentajeIva ?? (producto ? Number(producto.porcentajeIva) : 18);
      const subtotal = Number(item.precioUnitario) * item.cantidad;
      const importeIva = subtotal * (porcentajeIva / 100);
      const total = subtotal + importeIva;

      subtotalFactura += subtotal;
      ivaFactura += importeIva;

      detalles.push({
        productoId: item.productoId,
        descripcion: item.descripcion || producto?.nombre || 'Servicio',
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        porcentajeIva,
        subtotal,
        importeIva,
        total,
      });
    }

    const folio = await this.generarFolio();

    const moneda     = dto.moneda ?? 'DOP';
    const tipoCambio = dto.tipoCambio ?? 1;
    const totalDOP   = subtotalFactura + ivaFactura;
    // Si es moneda extranjera, totalOriginal = monto en esa moneda; total = DOP
    const totalOriginal = moneda !== 'DOP' ? +(totalDOP / tipoCambio).toFixed(2) : undefined;

    const tipoPago   = dto.tipoPago?.toUpperCase() === 'CREDITO' ? 'CREDITO' : 'CONTADO';
    const diasCred   = tipoPago === 'CREDITO' ? (dto.diasCredito ?? 30) : 0;
    const fechaVenc  = tipoPago === 'CREDITO'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + diasCred); return d; })()
      : undefined;

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
      sucursalId:     dto.sucursalId,
      moneda,
      tipoCambio,
      totalOriginal,
      subtotal: subtotalFactura,
      iva:      ivaFactura,
      total:    totalDOP,
      tipoPago,
      diasCredito:     diasCred,
      fechaVencimiento: fechaVenc,
    });

    const savedFactura = await this.facturaRepository.save(factura as any) as Factura;

    const savedDetalles = this.detalleRepository.create(
      detalles.map((d) => ({ ...d, facturaId: savedFactura.id })),
    );
    await this.detalleRepository.save(savedDetalles);

    this.realtimeService.notify(empresaId, 'factura', 'created', savedFactura.id);
    return this.findOne(savedFactura.id);
  }

  async findAll(pagination: PaginationDto & {
    estado?: string; desde?: string; hasta?: string; clienteId?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, estado, desde, hasta, clienteId,
            tipoPago, tipoNcf, montoMin, montoMax } = pagination as any;

    // La entidad Factura solo tiene `ecfId` como columna plana — sin @ManyToOne.
    // Cargamos las facturas primero, luego enriquecemos con datos ECF en una
    // sola consulta adicional (evita el N+1).
    const qb = this.facturaRepository
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'cliente')
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.isActive = :active', { active: true });

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
    if (montoMin != null) qb.andWhere('f.total >= :montoMin', { montoMin });
    if (montoMax != null) qb.andWhere('f.total <= :montoMax', { montoMax });

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

    const enriched = data.map((f: any) => ({
      ...f,
      ecf: ecfByFacturaId[f.id] ?? null,
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

  async buscarParaNota(q: string) {
    const empresaId = this.tenantService.getEmpresaId();
    if (!q || q.length < 2) return [];

    const rows = await this.facturaRepository.manager.query<any[]>(`
      SELECT
        f.id,
        f.folio,
        f.fecha::text              AS fecha,
        f.total::numeric           AS total,
        f.subtotal::numeric        AS subtotal,
        f.iva::numeric             AS iva,
        c.id                       AS "clienteId",
        c.nombre                   AS "clienteNombre",
        c."rncReceptor"            AS "clienteRNC",
        e.id                       AS "ecfId",
        e.numero                   AS "encf",
        e."estadoDGII"             AS "estadoEcf",
        e."createdAt"::text        AS "fechaEcf",
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'productoId',    fd."productoId",
              'descripcion',   fd.descripcion,
              'cantidad',      fd.cantidad::numeric,
              'precioUnitario',fd."precioUnitario"::numeric,
              'porcentajeIva', fd."porcentajeIva"::numeric,
              'importeIva',    fd."importeIva"::numeric,
              'total',         fd.total::numeric
            ) ORDER BY fd.id
          ) FILTER (WHERE fd.id IS NOT NULL),
          '[]'::json
        )                          AS detalles
      FROM facturas f
      LEFT JOIN clientes c         ON c.id = f."clienteId"
      LEFT JOIN ecf e              ON e."facturaId" = f.id AND e."isActive" = true
      LEFT JOIN factura_detalles fd ON fd."facturaId" = f.id
      WHERE f."empresaId" = $1
        AND f."isActive"  = true
        AND f.estado IN ('emitida', 'pagada')
        AND (
          f.folio ILIKE $2
          OR e.numero ILIKE $2
        )
      GROUP BY f.id, f.folio, f.fecha, f.total, f.subtotal, f.iva,
               c.id, c.nombre, c."rncReceptor",
               e.id, e.numero, e."estadoDGII", e."createdAt"
      ORDER BY f.fecha DESC
      LIMIT 15
    `, [empresaId, `%${q}%`]);

    return rows.filter(r => r.ecfId && r.estadoEcf?.toLowerCase() === 'aceptado');
  }

  // ── Detecta si el pago es inmediato según el campo notas ─────────────────────
  private esPagoInmediato(notas: string | undefined | null): boolean {
    const n = (notas ?? '').toLowerCase();
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
   * @param modoSincrono     true = POS (timeout 8s, fallo devuelve PENDIENTE no lanza);
   *                         false = regular (async fire-and-forget, 30s)
   * @param tipoEcfOverride  tipo de e-CF seleccionado en POS (sobreescribe el tipoNcf de la factura)
   * @param datosComprador   datos del comprador capturados en POS (RNC, razón social, etc.)
   */
  async cambiarEstado(
    id: number,
    estado: FacturaEstado,
    modoSincrono = false,
    tipoEcfOverride?: number,
    datosComprador?: DatosCompradorECF,
  ) {
    const factura = await this.findOne(id);

    const transiciones: Record<FacturaEstado, FacturaEstado[]> = {
      [FacturaEstado.BORRADOR]:  [FacturaEstado.EMITIDA,  FacturaEstado.CANCELADA],
      [FacturaEstado.EMITIDA]:   [FacturaEstado.PAGADA,   FacturaEstado.CANCELADA],
      [FacturaEstado.PAGADA]:    [],
      [FacturaEstado.CANCELADA]: [],
    };

    if (!transiciones[factura.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${factura.estado}" a "${estado}"`,
      );
    }

    if (estado === FacturaEstado.EMITIDA) {
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
        otraMoneda:          otraMoneda as any,
        datosComprador,
      };

      // 1. Salida de inventario
      for (const detalle of factura.detalles) {
        if (!detalle.productoId) continue;  // líneas de servicio sin producto no afectan inventario
        await this.inventarioService.registrarSalida(
          detalle.productoId,
          Number(detalle.cantidad),
          factura.usuarioId,
          `Factura emitida: ${factura.folio}`,
          factura.folio,
        );
      }

      // 2. CxC — solo si es crédito explícito O si es pago NO inmediato (compatibilidad)
      const esCredito = (factura as any).tipoPago === 'CREDITO';
      const diasCred  = Number((factura as any).diasCredito ?? 0);
      if (esCredito || (!pagoInmediato && !esCredito)) {
        const dias = esCredito && diasCred > 0 ? diasCred : 30;
        await this.cxcService.crear(factura.id, factura.usuarioId, dias);
        // Guardar fechaVencimiento en la factura si es crédito explícito
        if (esCredito && diasCred > 0) {
          const fv = new Date();
          fv.setDate(fv.getDate() + dias);
          await this.facturaRepository.update(factura.id, { fechaVencimiento: fv } as any);
        }
      }

      // 3. Asiento contable
      await this.asientosService.asientoFacturaEmitida(
        factura.id,
        Number(factura.total),
        Number(factura.subtotal),
        Number(factura.iva),
        factura.folio,
        factura.usuarioId,
      );

      // 4. Actualizar estado de la factura
      const estadoFinal = pagoInmediato ? FacturaEstado.PAGADA : FacturaEstado.EMITIDA;
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
          } catch { /* no bloquear la respuesta si esta query falla */ }
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
        userId,
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
      relations: ['cliente', 'detalles'],
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
}
