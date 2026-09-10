import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';
import type { DocData } from '../common/doc.template';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { CuentaPorCobrar } from './entities/cuenta-por-cobrar.entity';
import { PagoCobrado } from './entities/pago-cobrado.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { RegistrarPagoCobradoDto } from './dto/registrar-pago-cobrado.dto';
import { FiltroCuentasDto } from '../common/dto/filtro-cuentas.dto';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class CxCService {
  private readonly logger = new Logger(CxCService.name);

  constructor(
    @InjectRepository(CuentaPorCobrar)
    private cxcRepository: Repository<CuentaPorCobrar>,
    @InjectRepository(PagoCobrado)
    private pagoRepository: Repository<PagoCobrado>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    private asientosService:  AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private dataSource:       DataSource,
    private realtimeService:  RealtimeService,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Creación automática al emitir factura
  // ──────────────────────────────────────────────────────────────────

  async crear(facturaId: number, userId: number, diasVencimiento = 30): Promise<CuentaPorCobrar> {
    const factura = await this.facturaRepository.findOne({ where: { id: facturaId } });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    // Si ya existe un CxC activo, devolverlo sin duplicar
    const yaExiste = await this.cxcRepository.findOne({ where: { facturaId, isActive: true } });
    if (yaExiste) return yaExiste;

    // Si existe uno inactivo, reactivarlo en lugar de crear uno nuevo
    const inactivo = await this.cxcRepository.findOne({ where: { facturaId, isActive: false } });
    if (inactivo) {
      await this.cxcRepository.update(inactivo.id, {
        isActive:       true,
        estado:         EstadoCuenta.PENDIENTE,
        montoOriginal:  Number(factura.total),
        montoPendiente: Number(factura.total),
        montoPagado:    0,
      } as any);
      return this.cxcRepository.findOne({ where: { id: inactivo.id } }) as Promise<CuentaPorCobrar>;
    }

    const fechaEmision = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVencimiento);

    const cxc = this.cxcRepository.create({
      facturaId,
      clienteId: factura.clienteId,
      empresaId:  (factura as any).empresaId,
      montoOriginal:  Number(factura.total),
      montoPagado:    0,
      montoPendiente: Number(factura.total),
      fechaEmision,
      fechaVencimiento,
      diasVencimiento,
      userId,
      moneda:    (factura as any).moneda    ?? 'DOP',
      tipoCambio: Number((factura as any).tipoCambio ?? 1),
    });

    return this.cxcRepository.save(cxc);
  }

  /**
   * Detecta facturas de crédito EMITIDAS sin CxC y las crea.
   * Útil para corregir inconsistencias históricas o errores silenciosos
   * durante la emisión.
   */
  async sincronizarCxCFaltantes(): Promise<{ creadas: number; folios: string[] }> {
    const empresaId = this.tenantService.getEmpresaId();

    const facturasSinCxC = await this.dataSource.query<{
      id: number; usuarioId: number; diasCredito: number; folio: string;
    }[]>(`
      SELECT f.id, f."usuarioId", COALESCE(f."diasCredito", 30) AS "diasCredito", f.folio
      FROM facturas f
      WHERE f."empresaId" = $1
        AND f.estado      = 'emitida'
        AND f."isActive"  = true
        AND NOT EXISTS (
          SELECT 1 FROM cuentas_por_cobrar c
          WHERE c."facturaId" = f.id AND c."isActive" = true
        )
      ORDER BY f.fecha DESC
    `, [empresaId]);

    const folios: string[] = [];
    for (const f of facturasSinCxC) {
      try {
        await this.crear(f.id, f.usuarioId ?? 0, f.diasCredito);
        folios.push(f.folio);
        this.logger.warn(`CxC creada retroactivamente para factura ${f.folio} (id ${f.id})`);
      } catch (err) {
        this.logger.error(`Error creando CxC para factura ${f.folio}: ${(err as Error).message}`);
      }
    }

    return { creadas: folios.length, folios };
  }

  // ──────────────────────────────────────────────────────────────────
  // Registro de cobros
  // ──────────────────────────────────────────────────────────────────

  async registrarPago(id: number, dto: RegistrarPagoCobradoDto, userId: number) {
    const cuenta = await this.findById(id);

    if (cuenta.estado === EstadoCuenta.PAGADA || cuenta.estado === EstadoCuenta.ANULADA) {
      throw new BadRequestException(
        `La cuenta está "${cuenta.estado}" y no acepta más pagos`,
      );
    }

    const pendiente = Number(cuenta.montoPendiente);
    if (dto.monto > pendiente) {
      throw new BadRequestException(
        `Monto ${dto.monto} supera el pendiente ${pendiente.toFixed(2)}`,
      );
    }

    const nuevoPagado    = Number((Number(cuenta.montoPagado) + dto.monto).toFixed(2));
    const nuevoPendiente = Number((Number(cuenta.montoOriginal) - nuevoPagado).toFixed(2));
    const nuevoEstado    = nuevoPendiente <= 0 ? EstadoCuenta.PAGADA : EstadoCuenta.PAGADA_PARCIAL;

    // Transacción atómica: pago + actualización CxC + factura en una sola operación
    let ultimoPagoId = 0;
    await this.dataSource.transaction(async (em) => {
      const pagoRepo  = em.getRepository(PagoCobrado);
      const cxcRepo   = em.getRepository(CuentaPorCobrar);
      const factRepo  = em.getRepository(Factura);

      // Número secuencial por empresa — atómico dentro de la transacción
      const [{ n }] = await em.query<{ n: number }[]>(
        `SELECT siguiente_numero_secuencia($1, 'RDP') AS n`, [cuenta.empresaId],
      );
      const numero = `RDP-${String(n).padStart(5, '0')}`;

      const nuevoPago = await pagoRepo.save(pagoRepo.create({
        cuentaPorCobrarId: id,
        monto:       dto.monto,
        fecha:       dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
        metodoPago:  dto.metodoPago,
        referencia:  dto.referencia,
        notas:       dto.notas,
        userId,
        empresaId:   cuenta.empresaId,
        numero,
        moneda:      cuenta.moneda    ?? 'DOP',
        tipoCambio:  Number(dto.tipoCambio ?? cuenta.tipoCambio ?? 1),
      }));
      ultimoPagoId = nuevoPago.id;

      await cxcRepo.update(id, {
        montoPagado:    nuevoPagado,
        montoPendiente: nuevoPendiente,
        estado:         nuevoEstado,
      });

      if (nuevoEstado === EstadoCuenta.PAGADA) {
        await factRepo.update(cuenta.facturaId, { estado: FacturaEstado.PAGADA });
        this.logger.log(`Factura #${cuenta.facturaId} marcada como PAGADA`);
      }
    });

    // Asiento contable y tesorería (fuera de la transacción DB, son efectos secundarios)
    const moneda   = cuenta.moneda ?? 'DOP';
    const tasaHoy  = Number(dto.tipoCambio ?? cuenta.tipoCambio ?? 1);
    const tasaOrig = Number(cuenta.tipoCambio ?? 1);
    const montoDOP = moneda !== 'DOP' ? parseFloat((dto.monto * tasaHoy).toFixed(2)) : dto.monto;

    if (moneda !== 'DOP') {
      await this.asientosService.asientoCobroME(dto.monto, moneda, tasaHoy, tasaOrig, id, userId).catch(err =>
        this.logger.error(`Error asiento cobro ME CxC #${id}: ${err.message}`),
      );
    } else {
      await this.asientosService.asientoCobro(dto.monto, id, userId).catch(err =>
        this.logger.error(`Error asiento cobro CxC #${id}: ${err.message}`),
      );
    }

    await this.tesoreriaService.registrarMovimientoAutomatico(
      TipoMovimientoBancario.DEPOSITO,
      montoDOP,
      `Cobro CxC #${id} — ${dto.referencia ?? dto.metodoPago}`,
      OrigenMovimiento.COBRO_CXC,
      id,
      userId,
    ).catch(err => this.logger.error(`Error tesorería cobro CxC #${id}: ${err.message}`));

    // Notificar en tiempo real
    const cuentaFinal = await this.findById(id);
    const eid = (cuentaFinal as any).empresaId;
    if (eid) {
      this.realtimeService.notify(eid, 'cxc',     'updated', id);
      this.realtimeService.notify(eid, 'factura',  'updated', cuentaFinal.facturaId);
    }
    return { ...cuentaFinal, ultimoPagoId };
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────────────

  async getCuentas(filtro: FiltroCuentasDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, estado, fechaDesde, fechaHasta, search } = filtro;

    const qb = this.cxcRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.factura', 'factura')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (estado)     qb.andWhere('c.estado = :estado', { estado });
    if (fechaDesde) qb.andWhere('c.fechaVencimiento >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('c.fechaVencimiento <= :hasta', { hasta: new Date(fechaHasta) });
    if (search) {
      qb.andWhere(
        '(LOWER(cliente.nombre) LIKE :s OR LOWER(factura.folio) LIKE :s)',
        { s: `%${search.toLowerCase()}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('c.fechaVencimiento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cuenta = await this.cxcRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'factura', 'user'],
    });
    if (!cuenta) throw new NotFoundException(`CxC #${id} no encontrada`);
    return cuenta;
  }

  async getPagos(cuentaId: number) {
    await this.findById(cuentaId);
    const pagos = await this.pagoRepository.find({
      where: { cuentaPorCobrarId: cuentaId, isActive: true },
      relations: ['user'],
      order: { fecha: 'DESC' },
    });

    // Enriquecer con reciboId/reciboNumero para permitir anulación desde el historial
    const recibosRows = await this.dataSource.query<{ id: number; numero: string }[]>(
      `SELECT id, numero FROM recibos_cobro WHERE "cxcId" = $1 AND "isActive" = true`,
      [cuentaId],
    );
    const reciboByNumero: Record<string, number> = {};
    for (const r of recibosRows) reciboByNumero[r.numero] = r.id;

    return pagos.map(p => {
      const match = p.notas?.match(/^Recibo (REC-\d+)/);
      const numero = match?.[1] ?? null;
      return Object.assign(p as any, {
        reciboId:     numero ? (reciboByNumero[numero] ?? null) : null,
        reciboNumero: numero,
      });
    });
  }

  async getCuentasVencidas() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.cxcRepository.find({
      where: {
        empresaId,
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      relations: ['cliente', 'factura'],
      order: { fechaVencimiento: 'ASC' },
    });
  }

  async getCuentasPorCliente(clienteId: number, filtro: FiltroCuentasDto) {
    const { limit = 20, page = 1, estado } = filtro;
    const empresaId = this.tenantService.getEmpresaId();

    const qb = this.cxcRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.factura', 'factura')
      .where('c.clienteId = :clienteId AND c.empresaId = :eid AND c.isActive = true', { clienteId, eid: empresaId });

    if (estado) qb.andWhere('c.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('c.fechaVencimiento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getResumenCobros() {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = new Date();
    const en30 = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [porCobrar, vencido, porVencer, cobradoMes] = await Promise.all([
      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado NOT IN (:...exc)', {
          eid: empresaId, exc: [EstadoCuenta.PAGADA, EstadoCuenta.ANULADA],
        })
        .getRawOne<{ total: string }>(),

      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado = :e', { eid: empresaId, e: EstadoCuenta.VENCIDA })
        .getRawOne<{ total: string }>(),

      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado IN (:...ests)', {
          eid: empresaId, ests: [EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL],
        })
        .andWhere('c.fechaVencimiento BETWEEN :hoy AND :en30', { hoy, en30 })
        .getRawOne<{ total: string }>(),

      this.pagoRepository.createQueryBuilder('p')
        .innerJoin('p.cuentaPorCobrar', 'cxc')
        .select('COALESCE(SUM(p.monto), 0)', 'total')
        .where('p.isActive = true AND cxc.empresaId = :eid AND p.fecha >= :inicio', { eid: empresaId, inicio: inicioMes })
        .getRawOne<{ total: string }>(),
    ]);

    const cuenta = await this.cxcRepository.count({
      where: { isActive: true, empresaId } as any,
    });

    return {
      totalCuentas:    cuenta,
      totalPorCobrar:  Number(porCobrar?.total ?? 0),
      totalVencido:    Number(vencido?.total ?? 0),
      totalPorVencer30: Number(porVencer?.total ?? 0),
      cobradoEsteMes:  Number(cobradoMes?.total ?? 0),
      generadoEn: new Date().toISOString(),
    };
  }

  /**
   * ¿La factura origen tiene un e-CF confirmado por DGII (aceptado u
   * observado)? Si sí, el comprobante ya está declarado — revertir el
   * asiento de venta directamente desalinearía el 607 (la venta
   * desaparecería de contabilidad mientras el comprobante sigue vigente en
   * DGII). La corrección fiscalmente correcta es una Nota de Crédito, que ya
   * genera su propio asiento (asientoNotaCredito, ver ecf-efectos-nc.service.ts).
   */
  private async facturaTieneEcfConfirmado(facturaId: number): Promise<boolean> {
    const [ecf] = await this.dataSource.query<{ estadoDGII: string }[]>(
      `SELECT "estadoDGII" FROM ecf
       WHERE "facturaId" = $1 AND "isActive" = true
       ORDER BY "createdAt" DESC LIMIT 1`,
      [facturaId],
    );
    return ecf?.estadoDGII === 'aceptado' || ecf?.estadoDGII === 'observado';
  }

  async anular(id: number) {
    const cuenta = await this.findById(id);

    if (cuenta.estado === EstadoCuenta.PAGADA || cuenta.estado === EstadoCuenta.ANULADA) {
      throw new BadRequestException(
        `No se puede anular una cuenta en estado "${cuenta.estado}"`,
      );
    }

    // Problema 2: comprobante ya declarado ante DGII — no se revierte el
    // asiento directo, se corrige con NC.
    if (cuenta.facturaId && await this.facturaTieneEcfConfirmado(cuenta.facturaId)) {
      throw new BadRequestException(
        `No se puede anular: la factura tiene un e-CF confirmado por DGII (aceptado u observado). ` +
        `Emita una Nota de Crédito para corregirla — anular el asiento directamente desalinearía la declaración 607.`,
      );
    }

    // Problema 1: con abonos aplicados, revertir el asiento completo de la
    // venta rompe el balance (Clientes queda negativo, Bancos conserva el
    // cobro sin contrapartida). Solo una cuenta sin abonos (PENDIENTE) se
    // anula directo.
    if (Number(cuenta.montoPagado) > 0) {
      throw new BadRequestException(
        `No se puede anular: esta cuenta tiene ${Number(cuenta.montoPagado).toFixed(2)} abonado. ` +
        `Revierta primero los recibos de cobro (o pagos) aplicados a esta cuenta y vuelva a intentar.`,
      );
    }

    await this.cxcRepository.update(id, { estado: EstadoCuenta.ANULADA });

    // Reversa contable: revierte el asiento de venta de la factura que
    // originó esta CxC (Debe Clientes/Haber Ventas+ITBIS). Idempotente si la
    // factura ya se canceló por su cuenta (facturas.service.ts) — no duplica.
    if (cuenta.facturaId) {
      await this.asientosService.revertirAsiento(
        TipoOrigenAsiento.FACTURA,
        cuenta.facturaId,
        fechaHoyRD(),
        `Anulación de CxC #${id}`,
      );
    }

    return this.findById(id);
  }

  /**
   * Anula un PagoCobrado individual y revierte los saldos de la CxC.
   * Usado desde el historial de cobros para pagos sin recibo asociado.
   */
  async anularPago(pagoId: number): Promise<{ ok: boolean; mensaje: string }> {
    const empresaId = this.tenantService.getEmpresaId();

    const pago = await this.pagoRepository.findOne({
      where: { id: pagoId, isActive: true },
    });
    if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);

    const cxc = await this.cxcRepository.findOne({
      where: { id: pago.cuentaPorCobrarId, empresaId, isActive: true },
    });
    if (!cxc) throw new NotFoundException(`Cuenta por cobrar no encontrada`);

    // Contención inmediata: este método dejaba montoPagado en 0 sin revertir
    // el asiento de cobro (Debe Bancos/Haber Clientes) — Bancos quedaba con
    // dinero sin contrapartida, y la cuenta pasaba el filtro de anulación de
    // anular() como si nunca hubiera tenido abonos. Bloqueado hasta que se
    // reactive con su reversa correcta (ver granularidad de referenciaId en
    // asientoCobro/asientoPago).
    throw new BadRequestException(
      `No se puede anular el pago #${pagoId} directamente: este método no revierte su asiento contable ` +
      `(Bancos quedaría con el dinero cobrado sin contrapartida). Revierta el cobro desde el recibo de ` +
      `cobro asociado (recibos-cobro), que sí revierte correctamente su asiento.`,
    );
  }

  /**
   * Anula la CxC vinculada a una factura cuando ésta se cancela.
   * - Si no existe CxC (factura de contado) → 'sin_cxc'. facturas.service.ts
   *   sigue adelante y revierte el asiento de venta igual (no hay abonos que
   *   proteger).
   * - Si ya está ANULADA → 'anulada' (idempotente).
   * - Si está PAGADA, tiene abonos aplicados, o la factura tiene un e-CF
   *   confirmado por DGII → 'bloqueada'. facturas.service.ts NO debe
   *   revertir el asiento de venta en ese caso — mismos motivos que
   *   anular(): revertir solo la venta con abonos vivos rompe el balance, y
   *   revertir con e-CF confirmado desalinea el 607.
   * - En cualquier otro estado (PENDIENTE sin abonos) → la anula y revierte
   *   su asiento, retorna 'anulada'.
   */
  async anularPorFacturaId(facturaId: number): Promise<'anulada' | 'sin_cxc' | 'bloqueada'> {
    const cuenta = await this.cxcRepository.findOne({
      where: { facturaId, isActive: true },
    });
    if (!cuenta) return 'sin_cxc';
    if (cuenta.estado === EstadoCuenta.ANULADA) return 'anulada';

    if (cuenta.estado === EstadoCuenta.PAGADA) {
      this.logger.warn(
        `anularPorFacturaId: CxC #${cuenta.id} (factura #${facturaId}) ya está PAGADA — se omite`,
      );
      return 'bloqueada';
    }

    if (await this.facturaTieneEcfConfirmado(facturaId)) {
      this.logger.warn(
        `anularPorFacturaId: factura #${facturaId} tiene e-CF confirmado por DGII — se omite, requiere Nota de Crédito`,
      );
      return 'bloqueada';
    }

    if (Number(cuenta.montoPagado) > 0) {
      this.logger.warn(
        `anularPorFacturaId: CxC #${cuenta.id} (factura #${facturaId}) tiene abonos aplicados — ` +
        `se omite, revierta primero los recibos de cobro`,
      );
      return 'bloqueada';
    }

    await this.cxcRepository.update(cuenta.id, { estado: EstadoCuenta.ANULADA });
    this.logger.log(`CxC #${cuenta.id} anulada por cancelación de factura #${facturaId}`);

    // Reversa contable. facturas.service.ts:cambiarEstado ya llama
    // revertirAsiento() para la misma factura al cancelarla — idempotente:
    // la segunda llamada solo encuentra el contra-asiento ya creado.
    await this.asientosService.revertirAsiento(
      TipoOrigenAsiento.FACTURA,
      facturaId,
      fechaHoyRD(),
      `CxC anulada por cancelación de factura #${facturaId}`,
    );
    return 'anulada';
  }

  // ──────────────────────────────────────────────────────────────────
  // Antigüedad de saldos (aging)
  // ──────────────────────────────────────────────────────────────────

  async getAging() {
    const empresaId = this.tenantService.getEmpresaId();
    const rows: any[] = await this.dataSource.query(
      `SELECT
         c.nombre,
         c."rncReceptor",
         SUM(CASE WHEN CURRENT_DATE - cxc."fechaEmision" <= 30   THEN cxc."montoPendiente" ELSE 0 END) AS corriente,
         SUM(CASE WHEN CURRENT_DATE - cxc."fechaEmision" BETWEEN 31 AND  60 THEN cxc."montoPendiente" ELSE 0 END) AS dias30,
         SUM(CASE WHEN CURRENT_DATE - cxc."fechaEmision" BETWEEN 61 AND  90 THEN cxc."montoPendiente" ELSE 0 END) AS dias60,
         SUM(CASE WHEN CURRENT_DATE - cxc."fechaEmision" BETWEEN 91 AND 120 THEN cxc."montoPendiente" ELSE 0 END) AS dias90,
         SUM(CASE WHEN CURRENT_DATE - cxc."fechaEmision" > 120              THEN cxc."montoPendiente" ELSE 0 END) AS masde120,
         SUM(cxc."montoPendiente") AS total
       FROM cuentas_por_cobrar cxc
       JOIN clientes c ON c.id = cxc."clienteId"
       WHERE cxc."empresaId" = $1
         AND cxc."montoPendiente" > 0
         AND cxc.estado NOT IN ('pagada', 'anulada')
       GROUP BY c.id, c.nombre, c."rncReceptor"
       ORDER BY total DESC`,
      [empresaId],
    );

    return rows.map(r => ({
      cliente:  { nombre: r.nombre, rnc: r.rncReceptor ?? null },
      corriente: Number(r.corriente),
      dias30:    Number(r.dias30),
      dias60:    Number(r.dias60),
      dias90:    Number(r.dias90),
      masde120:  Number(r.masde120),
      total:     Number(r.total),
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // PDF recibo de pago
  // ──────────────────────────────────────────────────────────────────

  async generarPDFdePago(pagoId: number): Promise<Buffer> {
    const empresaId = this.tenantService.getEmpresaId();
    let rows: any[];
    try {
      rows = await this.dataSource.query<any[]>(`
        SELECT
          p.id, p.monto, p.fecha, p."metodoPago", p.referencia, p.notas, p.moneda, p."tipoCambio",
          p.numero,
          cxc."montoPendiente" AS "montoPendiente",
          -- Pendiente JUSTO DESPUÉS de este cobro, calculado desde el original y
          -- los cobros hasta este inclusive.
          --
          -- No se puede usar cxc."montoPendiente": registrarPago() ya lo dejó
          -- descontado, así que restarle el monto otra vez lo cuenta DOS VECES.
          -- Es lo que pasaba — FAC-1161: total 117,300.06, cobro 37,000, la CxC
          -- decía 80,300.06 y el recibo impreso decía 43,300.06.
          --
          -- Y tampoco vale a secas, porque un recibo se reimprime: si tomara el
          -- pendiente de hoy, el mismo RDP enseñaría un número distinto cada vez
          -- que se imprime, según los cobros posteriores. Un recibo entregado al
          -- cliente tiene que decir siempre lo que decía el día que se entregó.
          (cxc."montoOriginal" - COALESCE((
             SELECT SUM(p2.monto)
               FROM pagos_cobrados p2
              WHERE p2."cuentaPorCobrarId" = p."cuentaPorCobrarId"
                AND p2."isActive" = true
                -- fecha es DATE, sin hora: el id desempata los del mismo día.
                AND (p2.fecha < p.fecha OR (p2.fecha = p.fecha AND p2.id <= p.id))
           ), 0)) AS "pendienteTrasCobro",
          f.folio,
          cl.nombre AS "clienteNombre", cl."rncReceptor" AS "clienteRnc",
          cl.telefono AS "clienteTel", cl.email AS "clienteEmail", cl.direccion AS "clienteDir",
          e.nombre AS "empresaNombre", e.rnc AS "empresaRnc",
          e.direccion AS "empresaDireccion", e.ciudad AS "empresaCiudad",
          e.telefono AS "empresaTelefono", e.email AS "empresaEmail",
          e.logo AS "empresaLogo",
          u.nombre AS "cajeroNombre"
        FROM pagos_cobrados p
        JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
        JOIN facturas f ON f.id = cxc."facturaId"
        JOIN clientes cl ON cl.id = cxc."clienteId"
        JOIN empresa e ON e.id = f."empresaId"
        LEFT JOIN users u ON u.id = p."userId"
        WHERE p.id = $1 AND f."empresaId" = $2 AND p."isActive" = true
      `, [pagoId, empresaId]);
    } catch (err: any) {
      this.logger.error(`generarPDFdePago SQL error — pago #${pagoId}: ${err.message}`, err.stack);
      throw err;
    }

    if (!rows.length) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
    const r = rows[0];

    const fechaStr = r.fecha instanceof Date
      ? r.fecha.toISOString().split('T')[0]
      : String(r.fecha).split('T')[0];

    // Lo calcula la consulta. NO restes aquí `r.monto` de `r.montoPendiente`:
    // ese descuento ya lo hizo registrarPago() y volver a aplicarlo fue el bug.
    const pendienteTrasCobro = Math.max(0, Number(r.pendienteTrasCobro ?? 0));

    const data: DocData = {
      tipo:   'RECIBO DE PAGO',
      // Usa el número almacenado; fallback al id para registros anteriores a la migración
      numero: r.numero ?? `RDP-${String(r.id).padStart(5, '0')}`,
      fecha:  fechaStr,
      empresa: {
        nombre:    r.empresaNombre,
        rnc:       r.empresaRnc   ?? '',
        direccion: r.empresaDireccion ?? '',
        ciudad:    r.empresaCiudad,
        telefono:  r.empresaTelefono,
        email:     r.empresaEmail,
        logo:      r.empresaLogo,
      },
      participante: {
        label:  'Recibido de',
        nombre: r.clienteNombre,
        rnc:    r.clienteRnc,
        dir:    r.clienteDir,
        tel:    r.clienteTel,
        email:  r.clienteEmail,
      },
      campos: [
        { label: 'Factura',    valor: r.folio },
        { label: 'Método',     valor: r.metodoPago },
        ...(r.referencia ? [{ label: 'Referencia', valor: r.referencia }] : []),
        ...(r.moneda !== 'DOP' ? [
          { label: 'Moneda', valor: r.moneda },
          { label: 'Tasa',   valor: `RD$ ${r.tipoCambio}` },
        ] : []),
        { label: 'Cobrado por', valor: r.cajeroNombre ?? 'Sistema' },
      ],
      items: [{
        descripcion: `Cobro sobre factura ${r.folio}`,
        importe:     Number(r.monto),
      }],
      totales: [
        { label: 'Monto cobrado',      valor: Number(r.monto), bold: true },
        ...(pendienteTrasCobro > 0 ? [{ label: 'Pendiente restante', valor: pendienteTrasCobro }] : []),
      ],
      notas: r.notas ?? undefined,
      pie:   'Este recibo es válido como comprobante de pago parcial o total.',
    };

    return generarDocumentoPDF(data);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron jobs
  // ──────────────────────────────────────────────────────────────────

  @Cron('1 0 * * *')
  async actualizarEstadosVencidos() {
    const resultado = await this.cxcRepository.update(
      {
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: EstadoCuenta.VENCIDA },
    );
    this.logger.log(`CxC vencidas actualizadas: ${resultado.affected ?? 0}`);
  }
}
