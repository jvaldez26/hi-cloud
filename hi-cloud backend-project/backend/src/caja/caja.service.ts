import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class CajaService {
  private readonly logger = new Logger(CajaService.name);

  constructor(
    @InjectRepository(CierreCaja)
    private repo:            Repository<CierreCaja>,
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

    // La columna fecha es tipo DATE (sin timezone). TypeORM la lee como Date UTC-midnight.
    // Usamos toLocaleDateString con la zona RD para evitar off-by-one en casos límite.
    const fechaStr = new Date(caja.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
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
    return this.repo.findOne({ where: { id } });
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
    const vendedorFilter = vendedorId
      ? `AND f."vendedorId" = ${Number(vendedorId)}`
      : `AND f."vendedorId" IS NULL`;

    const empresaFilter = empresaId ? `AND f."empresaId" = ${Number(empresaId)}` : '';

    const [ventas] = await this.dataSource.query<{
      efectivo: string; tarjeta: string; transferencia: string; cantidad: string;
    }[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(f.notas) LIKE '%efectivo%'      THEN f.total ELSE 0 END), 0)::text AS efectivo,
         COALESCE(SUM(CASE WHEN LOWER(f.notas) LIKE '%tarjeta%'       THEN f.total ELSE 0 END), 0)::text AS tarjeta,
         COALESCE(SUM(CASE WHEN LOWER(f.notas) LIKE '%transferencia%' THEN f.total ELSE 0 END), 0)::text AS transferencia,
         COUNT(f.id)::text AS cantidad
       FROM facturas f
       WHERE DATE(f.fecha) = $1
         AND f.estado IN ('emitida', 'pagada')
         AND f."isActive" = true
         ${vendedorFilter}
         ${empresaFilter}`,
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

    await this.repo.update(cajaId, {
      ventasEfectivo:        Number(ventas?.efectivo      ?? 0),
      ventasTarjeta:         Number(ventas?.tarjeta       ?? 0),
      ventasTransferencia:   Number(ventas?.transferencia ?? 0),
      cobrosRecibidos:       Number(cobros?.total         ?? 0),
      totalAnticipos:        Number(anticipos?.total      ?? 0),
      cantidadTransacciones: Number(ventas?.cantidad      ?? 0),
    });
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
      return this.repo.findOne({ where: { id: caja.id } });
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

  // ── Historial (filtrado por empresa) ─────────────────────────────────────

  async getHistorial(page = 1, limit = 20, vendedorId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const where: any = { empresaId };
    if (vendedorId !== undefined) {
      where.vendedorId = vendedorId === 0 ? IsNull() : vendedorId;
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fecha: 'DESC', vendedorNombre: 'ASC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });
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
}
