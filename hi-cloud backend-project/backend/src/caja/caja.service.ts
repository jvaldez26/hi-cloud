import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, Between } from 'typeorm';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { RetiroCaja } from './entities/retiro-caja.entity';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);

  constructor(
    @InjectRepository(CierreCaja)
    private repo:            Repository<CierreCaja>,
    @InjectRepository(RetiroCaja)
    private retiroRepo:      Repository<RetiroCaja>,
    private dataSource:      DataSource,
    private tenantService:   TenantService,
    private realtimeService: RealtimeService,
  ) {}

  // ── Migración defensiva ───────────────────────────────────────────────────
  private async eliminarConstraintAntigua() {
    try {
      await this.dataSource.query(
        `ALTER TABLE cierres_caja DROP CONSTRAINT IF EXISTS "cierres_caja_fecha_key"`,
      );
      await this.dataSource.query(
        `DO $$ BEGIN
           IF EXISTS (
             SELECT 1 FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             WHERE t.relname = 'cierres_caja' AND c.contype = 'u'
               AND c.conname NOT LIKE 'UQ_caja_fecha_vendedor'
               AND array_length(c.conkey, 1) = 1
           ) THEN
             EXECUTE (
               SELECT 'ALTER TABLE cierres_caja DROP CONSTRAINT "' || c.conname || '"'
               FROM pg_constraint c
               JOIN pg_class t ON t.oid = c.conrelid
               WHERE t.relname = 'cierres_caja' AND c.contype = 'u'
                 AND c.conname NOT LIKE 'UQ_caja_fecha_vendedor'
                 AND array_length(c.conkey, 1) = 1
               LIMIT 1
             );
           END IF;
         END $$`,
      );
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_caja_fecha_vendedor"
         ON cierres_caja(fecha, "vendedorId")
         WHERE "vendedorId" IS NOT NULL`,
      );
    } catch (e) {
      this.logger.warn('eliminarConstraintAntigua (ignorado): ' + e);
    }
  }

  // ── Usuarios operativos de la empresa (para vincular a perfil vendedor) ────

  async listarUsuarios(): Promise<{ id: number; nombre: string; email: string; role: string }[]> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.dataSource.query(`
      SELECT u.id, u.nombre, u.email, u.role
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      WHERE ue."empresaId" = $1
        AND ue."isActive"  = true
        AND u."isActive"   = true
        AND u.role NOT IN ('super_admin', 'viewer')
      ORDER BY u.nombre
    `, [empresaId]);
  }

  // ── Cajeros activos de la empresa ─────────────────────────────────────────

  async listarCajeros(): Promise<{
    id: number; nombre: string; codigo: string; email: string | null;
  }[]> {
    const empresaId = this.tenantService.getEmpresaId();
    // Devuelve vendedores — mismo origen que el POS (GET /vendedores).
    // Así vendedorId en cierres_caja siempre es un vendedor.id consistente.
    // Si el vendedor tiene usuarioId, trae el email del usuario para mostrarlo.
    return this.dataSource.query(`
      SELECT
        v.id,
        v.nombre,
        v.codigo,
        COALESCE(u.email, v.email) AS email
      FROM vendedores v
      LEFT JOIN users u ON u.id = v."usuarioId" AND u."isActive" = true
      WHERE v."empresaId" = $1
        AND v."isActive"  = true
        AND v.activo      = true
      ORDER BY v.nombre
    `, [empresaId]);
  }

  // ── Abrir caja por vendedor ────────────────────────────────────────────────

  async abrirCaja(
    userId: number,
    saldoApertura = 0,
    notas?: string,
    vendedorId?: number,
    vendedorNombre?: string,
  ) {
    const empresaId = this.tenantService.getEmpresaId();

    // Resolver nombre del cajero.
    // vendedorId es siempre un vendedor.id (tabla vendedores) — el POS
    // usa GET /vendedores y envía ese ID. Buscamos el nombre ahí primero.
    if (vendedorId && !vendedorNombre) {
      const rows = await this.dataSource.query(
        `SELECT nombre FROM vendedores WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [vendedorId, empresaId],
      );
      if (rows[0]?.nombre) {
        vendedorNombre = rows[0].nombre;
      } else {
        // Fallback: compatibilidad con cajas antiguas que guardaban user.id
        const userRows = await this.dataSource.query(
          `SELECT nombre FROM users WHERE id = $1`, [vendedorId],
        );
        vendedorNombre = userRows[0]?.nombre ?? String(vendedorId);
      }
    }
    const hoy = fechaHoyRD();

    // Buscar caja existente para este vendedor HOY dentro de la misma empresa
    const where: any = { fecha: new Date(hoy) as any, empresaId };
    where.vendedorId = vendedorId ? vendedorId : IsNull();

    const existe = await this.repo.findOne({ where });
    if (existe) {
      if (existe.estado === EstadoCierre.ABIERTA) return existe;
      const quien = vendedorNombre ? ` (${vendedorNombre})` : '';
      throw new BadRequestException(`La caja del ${hoy}${quien} ya fue cerrada`);
    }

    try {
      const nueva = await this.repo.save(
        this.repo.create({
          fecha: new Date(hoy),
          saldoApertura,
          notas,
          userId,
          empresaId,
          vendedorId:     vendedorId    ?? undefined,
          vendedorNombre: vendedorNombre ?? undefined,
          sucursalId:     this.tenantService.getSucursalId() ?? undefined,
        }),
      );
      this.realtimeService.notify(empresaId, 'caja', 'created', nueva.id);
      return nueva;
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate key')) {
        this.logger.warn(`Constraint única antigua detectada. Migrando…`);
        await this.eliminarConstraintAntigua();

        const existeGlobal = await this.repo.findOne({
          where: { fecha: new Date(hoy) as any, empresaId } as any,
        });
        if (existeGlobal && existeGlobal.estado === EstadoCierre.ABIERTA && !existeGlobal.vendedorId) {
          await this.repo.update(existeGlobal.id, { vendedorId, vendedorNombre });
          this.realtimeService.notify(empresaId, 'caja', 'updated', existeGlobal.id);
          return this.repo.findOne({ where: { id: existeGlobal.id } });
        }

        const reintento = await this.repo.save(
          this.repo.create({ fecha: new Date(hoy), saldoApertura, notas, userId, empresaId, vendedorId, vendedorNombre }),
        );
        this.realtimeService.notify(empresaId, 'caja', 'created', reintento.id);
        return reintento;
      }
      throw err;
    }
  }

  // ── Cerrar caja ───────────────────────────────────────────────────────────

  async cerrarCaja(
    id: number,
    saldoFisico: number,
    notas?: string,
    desgloseBilletes?: Record<string, number>,
    desglosePago?: Record<string, string>,
  ) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);
    if (caja.estado !== EstadoCierre.ABIERTA) {
      throw new BadRequestException('La caja ya está cerrada');
    }

    // La columna fecha es tipo DATE almacenada como UTC midnight (new Date('YYYY-MM-DD')).
    // NO convertir con toLocaleDateString + zona horaria: eso da el día anterior (UTC-4 convierte
    // 2026-05-26T00:00:00Z → 2026-05-25 20:00 RD → fecha '2026-05-25', off-by-one).
    // toISOString() recupera exactamente la fecha UTC original que se guardó.
    const fechaDate = caja.fecha instanceof Date ? caja.fecha : new Date(caja.fecha as any);
    const fechaStr  = fechaDate.toISOString().substring(0, 10);
    await this.recalcularDesdeBD(id, fechaStr, caja.vendedorId, empresaId);

    const fresh = await this.repo.findOne({ where: { id } }) as CierreCaja;
    const saldoCierre = Number(fresh.saldoApertura)
      + Number(fresh.ventasEfectivo)
      + Number(fresh.cobrosRecibidos)
      - Number(fresh.gastosEfectivo)
      - Number(fresh.retiros);

    const diferencia = saldoFisico - saldoCierre;

    await this.repo.update(id, {
      estado:           EstadoCierre.CERRADA,
      saldoCierre:      Number(saldoCierre.toFixed(2)),
      saldoFisico:      Number(saldoFisico.toFixed(2)),
      diferencia:       Number(diferencia.toFixed(2)),
      notas:            notas ?? caja.notas,
      ...(desgloseBilletes ? { desgloseBilletes } : {}),
      ...(desglosePago     ? { desglosePago }     : {}),
    });

    const quien = caja.vendedorNombre ? ` [${caja.vendedorNombre}]` : '';
    this.logger.log(`Caja #${id}${quien} cerrada. Diferencia: ${diferencia.toFixed(2)}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);

    const saved = await this.repo.findOne({ where: { id } });
    const { cierreCajaCiego, umbralDescuadreCaja } = await this.getEmpresaCfg(empresaId);

    if (cierreCajaCiego && Math.abs(diferencia) > umbralDescuadreCaja) {
      this.logger.warn(
        `[CIERRE CIEGO] Descuadre en caja #${id}${quien}: ` +
        `diferencia=${diferencia.toFixed(2)} (umbral=${umbralDescuadreCaja})`,
      );
    }

    return cierreCajaCiego ? this.ocultarCamposCiego(saved) : saved;
  }

  // ── Anular cierre de caja ─────────────────────────────────────────────────

  async anularCierre(id: number, motivo: string, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const caja = await this.repo.findOne({ where: { id, empresaId } });
    if (!caja) throw new NotFoundException(`Caja #${id} no encontrada`);

    if (caja.estado === EstadoCierre.ABIERTA) {
      throw new BadRequestException('Esta caja ya está abierta, no hay cierre que anular');
    }
    if (caja.estado === EstadoCierre.REVISADA) {
      throw new BadRequestException('No se puede anular un cierre revisado. Contacta al administrador.');
    }

    const notaAnulacion = `[CIERRE ANULADO por usuario #${userId} — ${new Date().toLocaleString('es-DO')}] Motivo: ${motivo}`;
    const notasActualizadas = caja.notas
      ? `${caja.notas}\n${notaAnulacion}`
      : notaAnulacion;

    await this.repo.update(id, {
      estado:      EstadoCierre.ABIERTA,
      saldoCierre: 0,
      saldoFisico: 0,
      diferencia:  0,
      notas:       notasActualizadas,
    });

    const quien = caja.vendedorNombre ? ` [${caja.vendedorNombre}]` : '';
    this.logger.warn(`Cierre de caja #${id}${quien} ANULADO por usuario #${userId}. Motivo: ${motivo}`);
    this.realtimeService.notify(empresaId, 'caja', 'updated', id);
    return this.repo.findOne({ where: { id } });
  }

  // ── Recalcular ventas del día por vendedor ────────────────────────────────

  private async recalcularDesdeBD(cajaId: number, fecha: string, vendedorId?: number, empresaId?: number) {
    const vendedorFilter  = vendedorId
      ? `AND f."vendedorId" = ${Number(vendedorId)}`
      : `AND f."vendedorId" IS NULL`;

    const empresaFilter   = empresaId ? `AND f."empresaId" = ${Number(empresaId)}` : '';
    const ncEmpresaFilter = empresaId ? `AND nc."empresaId" = ${Number(empresaId)}` : '';

    // Las NC emitidas reducen el valor neto de cada factura del día.
    // formasPago (JSONB) se usa cuando existe; si es null/vacío el fallback clasifica por notas
    // (mantiene comportamiento previo para ventas históricas sin formasPago).
    // Mapeo tipo DGII → bucket: 1=Efectivo 2=Transfer/Cheque 3=Tarjeta 4=Crédito 5=Permuta→Transfer
    const [ventas] = await this.dataSource.query<{
      efectivo: string; tarjeta: string; transferencia: string; credito: string; cantidad: string;
    }[]>(
      `WITH nc_totales AS (
         SELECT nc."facturaOriginalId",
                COALESCE(SUM(nc.total), 0) AS total_nc
         FROM notas_credito nc
         WHERE nc."isActive" = true AND nc.estado = 'emitida'
           ${ncEmpresaFilter}
         GROUP BY nc."facturaOriginalId"
       ),
       facturas_base AS (
         SELECT f.id,
                f.total,
                f.notas,
                f."formasPago",
                GREATEST(0, f.total - COALESCE(ntc.total_nc, 0)) AS monto_neto
         FROM facturas f
         LEFT JOIN nc_totales ntc ON ntc."facturaOriginalId" = f.id
         WHERE DATE(f.fecha) = $1
           AND f.estado IN ('emitida', 'pagada')
           AND f."isActive" = true
           ${vendedorFilter}
           ${empresaFilter}
       ),
       fp_lineas AS (
         SELECT
           fb.id,
           fb.total,
           fb.monto_neto,
           (fp->>'tipo')::int      AS tipo,
           (fp->>'monto')::numeric AS fp_monto
         FROM facturas_base fb,
              jsonb_array_elements(fb."formasPago") AS fp
         WHERE fb."formasPago" IS NOT NULL
           AND fb."formasPago" != 'null'::jsonb
           AND jsonb_array_length(fb."formasPago") > 0
       ),
       ids_con_fp AS (SELECT DISTINCT id FROM fp_lineas),
       resultado AS (
         -- Facturas CON formasPago: distribuir monto_neto proporcionalmente por tipo DGII
         SELECT
           CASE WHEN tipo = 1     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS efectivo,
           CASE WHEN tipo = 3     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS tarjeta,
           CASE WHEN tipo IN (2,5) AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS transferencia,
           CASE WHEN tipo = 4     AND total > 0 THEN fp_monto * monto_neto / total ELSE 0 END AS credito
         FROM fp_lineas

         UNION ALL

         -- Facturas SIN formasPago: fallback exacto al LIKE sobre notas (comportamiento anterior)
         SELECT
           CASE WHEN LOWER(fb.notas) LIKE '%efectivo%' THEN fb.monto_neto ELSE 0 END AS efectivo,
           CASE WHEN LOWER(fb.notas) LIKE '%tarjeta%'  THEN fb.monto_neto ELSE 0 END AS tarjeta,
           CASE WHEN LOWER(fb.notas) LIKE '%transferencia%' THEN fb.monto_neto ELSE 0 END AS transferencia,
           CASE WHEN (LOWER(fb.notas) LIKE '%cr_dito%' OR LOWER(fb.notas) LIKE '%credito%')
             AND LOWER(fb.notas) NOT LIKE '%efectivo%'
             AND LOWER(fb.notas) NOT LIKE '%tarjeta%'
             AND LOWER(fb.notas) NOT LIKE '%transferencia%'
           THEN fb.monto_neto ELSE 0 END AS credito
         FROM facturas_base fb
         WHERE NOT EXISTS (SELECT 1 FROM ids_con_fp WHERE id = fb.id)
       )
       SELECT
         COALESCE(SUM(efectivo),      0)::text AS efectivo,
         COALESCE(SUM(tarjeta),       0)::text AS tarjeta,
         COALESCE(SUM(transferencia), 0)::text AS transferencia,
         COALESCE(SUM(credito),       0)::text AS credito,
         (SELECT COUNT(*) FROM facturas_base)::text AS cantidad
       FROM resultado`,
      [fecha],
    );

    // Cobros del día — filtrados por cajaDiariaId para imputar al cajero correcto
    const [cobros] = await this.dataSource.query<{ total: string; cantidad: string }[]>(
      `SELECT
         COALESCE(SUM(r.monto), 0)::text AS total,
         COUNT(r.id)::text               AS cantidad
       FROM recibos_cobro r
       WHERE DATE(r.fecha) = $1
         AND r."isActive" = true
         AND r."cajaDiariaId" = $2`,
      [fecha, cajaId],
    );

    // Anticipos del día — filtrados por cajaDiariaId
    const [anticipos] = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(a.monto), 0)::text AS total
       FROM anticipo_cliente a
       WHERE DATE(a."fechaRegistro") = $1
         AND a."isActive" = true
         AND a.estado != 'anulado'
         AND a."cajaDiariaId" = $2`,
      [fecha, cajaId],
    ).catch(() => [{ total: '0' }]);

    const [retiros] = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(monto), 0)::text AS total
       FROM retiros_caja
       WHERE "cajaDiariaId" = $1`,
      [cajaId],
    ).catch(() => [{ total: '0' }]);

    await this.repo.update(cajaId, {
      ventasEfectivo:        Number(ventas?.efectivo      ?? 0),
      ventasTarjeta:         Number(ventas?.tarjeta       ?? 0),
      ventasTransferencia:   Number(ventas?.transferencia ?? 0),
      ventasCredito:         Number(ventas?.credito       ?? 0),
      cobrosRecibidos:       Number(cobros?.total         ?? 0),
      totalAnticipos:        Number(anticipos?.total      ?? 0),
      cantidadTransacciones: Number(ventas?.cantidad      ?? 0),
      retiros:               Number(retiros?.total        ?? 0),
    });
  }

  // ── Helpers: configuración ciego ─────────────────────────────────────────

  private async getEmpresaCfg(empresaId: number): Promise<{ cierreCajaCiego: boolean; umbralDescuadreCaja: number }> {
    const rows = await this.dataSource.query<{ configuracion: Record<string, unknown> }[]>(
      'SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1',
      [empresaId],
    );
    const cfg = (rows[0]?.configuracion ?? {}) as Record<string, unknown>;
    return {
      cierreCajaCiego:     cfg.cierreCajaCiego === true,
      umbralDescuadreCaja: Number(cfg.umbralDescuadreCaja ?? 100),
    };
  }

  private ocultarCamposCiego(caja: CierreCaja | null): any {
    if (!caja) return null;
    const result: any = { ...caja };
    for (const k of ['ventasEfectivo','ventasTarjeta','ventasTransferencia','ventasCredito',
      'cobrosRecibidos','totalAnticipos','gastosEfectivo','retiros',
      'saldoCierre','diferencia','cantidadTransacciones']) {
      delete result[k];
    }
    result.ciegoCajaActivo = true;
    return result;
  }

  // ── Cajas del día (filtradas por empresa) ─────────────────────────────────

  async getCajaHoy(vendedorId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    if (vendedorId !== undefined) {
      const where: any = { fecha: new Date(hoy) as any, empresaId };
      where.vendedorId = vendedorId === 0 ? IsNull() : vendedorId;

      const caja = await this.repo.findOne({ where });
      if (!caja) return { estado: 'sin_apertura', mensaje: 'La caja no ha sido abierta hoy' };

      if (caja.estado === EstadoCierre.ABIERTA) {
        await this.recalcularDesdeBD(caja.id, hoy, caja.vendedorId, empresaId);
      }
      const fresh = await this.repo.findOne({ where: { id: caja.id } });
      const { cierreCajaCiego } = await this.getEmpresaCfg(empresaId);
      return cierreCajaCiego ? this.ocultarCamposCiego(fresh) : fresh;
    }

    // Sin filtro de vendedor → todas las cajas del día de ESTA empresa
    const cajas = await this.repo.find({
      where: { fecha: new Date(hoy) as any, empresaId } as any,
      order: { vendedorNombre: 'ASC' },
    });

    if (!cajas.length) {
      return { estado: 'sin_apertura', mensaje: 'No hay cajas abiertas hoy' };
    }

    await Promise.all(
      cajas
        .filter(c => c.estado === EstadoCierre.ABIERTA)
        .map(c => this.recalcularDesdeBD(c.id, hoy, c.vendedorId, empresaId)),
    );

    const frescas = await this.repo.find({
      where: { fecha: new Date(hoy) as any, empresaId } as any,
      order: { vendedorNombre: 'ASC' },
    });

    return { cajas: frescas, totalCajas: frescas.length };
  }

  // A-1: scoped para VENDEDOR — usa userId del JWT, no acepta vendedorId del cliente
  async getCajaHoyByUserId(userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = fechaHoyRD();

    const caja = await this.repo.findOne({
      where: { fecha: new Date(hoy) as any, empresaId, userId } as any,
    });
    if (!caja) return { estado: 'sin_apertura', mensaje: 'La caja no ha sido abierta hoy' };

    if (caja.estado === EstadoCierre.ABIERTA) {
      await this.recalcularDesdeBD(caja.id, hoy, caja.vendedorId, empresaId);
    }
    const fresh = await this.repo.findOne({ where: { id: caja.id } });
    const { cierreCajaCiego } = await this.getEmpresaCfg(empresaId);
    return cierreCajaCiego ? this.ocultarCamposCiego(fresh) : fresh;
  }

  // ── Historial (filtrado por empresa) ─────────────────────────────────────

  async getHistorial(page = 1, limit = 20, vendedorId?: number, mes?: number, anio?: number, role?: string) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    const where: any = { empresaId, estado: Not(EstadoCierre.ABIERTA) };
    if (sucursalId) where.sucursalId = sucursalId;
    if (vendedorId !== undefined) {
      where.vendedorId = vendedorId === 0 ? IsNull() : vendedorId;
    }
    if (mes && anio) {
      const inicio    = new Date(anio, mes - 1, 1);
      const fin       = new Date(anio, mes, 0);
      where.fecha     = Between(inicio, fin);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fecha: 'DESC', vendedorNombre: 'ASC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });

    // En modo ciego, el cajero (VENDEDOR) no ve esperado ni diferencia en su historial
    if (role === 'vendedor') {
      const { cierreCajaCiego } = await this.getEmpresaCfg(empresaId);
      if (cierreCajaCiego) {
        return {
          data: data.map(c => this.ocultarCamposCiego(c)),
          meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
      }
    }

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Resumen mensual (filtrado por empresa) ────────────────────────────────

  async getResumenMes(mes: number, anio: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.dataSource.query<{
      totalVentas: string; totalCobros: string;
      diferenciaTotal: string; diasConDiferencia: string;
    }[]>(
      `SELECT
         COALESCE(SUM(c."ventasEfectivo" + c."ventasTarjeta" + c."ventasTransferencia"), 0)::text AS "totalVentas",
         COALESCE(SUM(c."cobrosRecibidos"), 0)::text AS "totalCobros",
         COALESCE(SUM(c.diferencia), 0)::text AS "diferenciaTotal",
         COUNT(CASE WHEN ABS(c.diferencia) > 0 THEN 1 END)::text AS "diasConDiferencia"
       FROM cierres_caja c
       WHERE EXTRACT(MONTH FROM c.fecha) = $1
         AND EXTRACT(YEAR  FROM c.fecha) = $2
         AND c.estado != 'abierta'
         AND c."empresaId" = $3`,
      [mes, anio, empresaId],
    );

    return {
      mes, anio,
      totalVentas:       Number(rows[0]?.totalVentas       ?? 0),
      totalCobros:       Number(rows[0]?.totalCobros       ?? 0),
      diferenciaTotal:   Number(rows[0]?.diferenciaTotal   ?? 0),
      diasConDiferencia: Number(rows[0]?.diasConDiferencia ?? 0),
    };
  }

  // ── Fuente única para verificar si hay caja abierta para un vendedor ──
  // Sin restricción de fecha: una caja abierta de días anteriores no cerrada
  // sigue siendo válida para emitir. Usa TypeORM como getCajaHoy.
  // ── Retiros de caja ───────────────────────────────────────────────────────

  async registrarRetiro(monto: number, descripcion: string, usuarioId: number, usuarioNombre?: string) {
    const empresaId = this.tenantService.getEmpresaId();

    const caja = await this.repo.findOne({
      where: { empresaId, estado: EstadoCierre.ABIERTA } as any,
      order: { fecha: 'DESC' },
    });
    if (!caja) throw new BadRequestException('No hay una caja abierta para registrar retiros');

    const retiro = this.retiroRepo.create({
      empresaId,
      cajaDiariaId: caja.id,
      usuarioId,
      usuarioNombre,
      monto,
      descripcion: descripcion.trim(),
    });
    await this.retiroRepo.save(retiro);

    // Actualizar columna retiros en cierres_caja
    const [{ total }] = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(monto), 0)::text AS total FROM retiros_caja WHERE "cajaDiariaId" = $1`,
      [caja.id],
    );
    await this.repo.update(caja.id, { retiros: Number(total) });

    this.realtimeService.notify(empresaId, 'caja', 'updated', caja.id);
    return retiro;
  }

  async listarRetiros(cajaId?: number) {
    const empresaId = this.tenantService.getEmpresaId();

    let cajaDiariaId = cajaId;
    if (!cajaDiariaId) {
      const caja = await this.repo.findOne({
        where: { empresaId, estado: EstadoCierre.ABIERTA } as any,
        order: { fecha: 'DESC' },
      });
      cajaDiariaId = caja?.id;
    }
    if (!cajaDiariaId) return [];

    return this.retiroRepo.find({
      where: { empresaId, cajaDiariaId },
      order: { createdAt: 'DESC' },
    });
  }

  async esCajaAbiertaVendedor(vendedorId: number, empresaId: number): Promise<boolean> {
    // Buscar caja propia del vendedor O caja global (sin vendedorId asignado).
    // La caja global cubre empresas que no asocian caja por vendedor.
    const caja = await this.repo.findOne({
      where: [
        { empresaId, vendedorId,       estado: EstadoCierre.ABIERTA } as any,
        { empresaId, vendedorId: IsNull(), estado: EstadoCierre.ABIERTA } as any,
      ],
      order: { fecha: 'DESC' },
    });
    return !!caja;
  }
}
