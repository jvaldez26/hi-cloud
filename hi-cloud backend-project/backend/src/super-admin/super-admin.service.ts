import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);
  constructor(private ds: DataSource) {}

  // ── Empresas ──────────────────────────────────────────────────────────────

  async listarEmpresas() {
    return this.ds.query<any[]>(`
      SELECT e.id, e.nombre, e.rnc, e."isActive",
             e."createdAt"::date AS "fechaRegistro",
             s.plan, s.estado AS "estadoSuscripcion",
             s."fechaVencimiento"::date AS "venceSuscripcion",
             COUNT(DISTINCT ue."userId")::int   AS usuarios,
             COUNT(DISTINCT f.id)::int          AS "facturasMes"
      FROM empresa e
      LEFT JOIN suscripciones s  ON s."empresaId" = e.id
      LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isActive" = true
      LEFT JOIN facturas f ON f."empresaId" = e.id
        AND EXTRACT(MONTH FROM f.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR  FROM f.fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
        AND f."isActive" = true AND f.estado != 'cancelada'
      GROUP BY e.id, e.nombre, e.rnc, e."isActive", e."createdAt",
               s.plan, s.estado, s."fechaVencimiento"
      ORDER BY e."createdAt" DESC
    `);
  }

  async getEmpresa(id: number) {
    const [emp] = await this.ds.query<any[]>(`
      SELECT e.*, s.plan, s.estado AS "estadoSuscripcion",
             s."fechaInicio", s."fechaVencimiento",
             COUNT(DISTINCT ue."userId")::int AS usuarios
      FROM empresa e
      LEFT JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isActive" = true
      WHERE e.id = $1
      GROUP BY e.id, s.plan, s.estado, s."fechaInicio", s."fechaVencimiento"
    `, [id]);
    if (!emp) throw new NotFoundException(`Empresa #${id} no encontrada`);
    return emp;
  }

  async suspenderEmpresa(id: number) {
    await this.ds.query(`UPDATE empresa SET "isActive" = false WHERE id = $1`, [id]);
    // No desactivar usuario_empresa en suspensión — solo en eliminación definitiva.
    // En suspensión, los vínculos se preservan para reactivar sin perder accesos.
    return { ok: true, mensaje: `Empresa #${id} suspendida` };
  }

  async activarEmpresa(id: number) {
    await this.ds.query(`UPDATE empresa SET "isActive" = true WHERE id = $1`, [id]);
    return { ok: true, mensaje: `Empresa #${id} activada` };
  }

  // ── Usuarios ─────────────────────────────────────────────────────────────

  async listarUsuarios() {
    return this.ds.query<any[]>(`
      SELECT u.id, u.nombre, u.email, u.role, u."isActive", u."createdAt"::date AS registro,
             COUNT(DISTINCT ue."empresaId")::int AS empresas
      FROM users u
      LEFT JOIN usuario_empresa ue ON ue."userId" = u.id AND ue."isActive" = true
      GROUP BY u.id, u.nombre, u.email, u.role, u."isActive", u."createdAt"
      ORDER BY u."createdAt" DESC
    `);
  }

  // ── Métricas globales ────────────────────────────────────────────────────

  async getMetricas() {
    const USD_PRICES: Record<string, number> = {
      trial: 0, emprendedor: 29, pyme: 59, pro: 89, plus: 129,
      basico: 0, profesional: 0, empresarial: 0, enterprise: 0,
    };

    const [base, facturasHoy, facturasMes, porPlan, trials, vencidas, ecfHoy, montoMes] = await Promise.all([
      this.ds.query<any[]>(`
        SELECT
          COUNT(DISTINCT e.id)                                  AS "totalEmpresas",
          COUNT(DISTINCT CASE WHEN e."isActive" THEN e.id END) AS "empresasActivas",
          COUNT(DISTINCT u.id)                                  AS "totalUsuarios",
          COUNT(DISTINCT CASE WHEN u."createdAt"::date = CURRENT_DATE THEN u.id END) AS "nuevosHoy"
        FROM empresa e
        CROSS JOIN users u
        WHERE u.role != 'super_admin'
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS total FROM facturas
        WHERE DATE(fecha) = CURRENT_DATE AND "isActive" = true AND estado != 'cancelada'
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS total FROM facturas
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
          AND "isActive" = true AND estado != 'cancelada'
      `),
      this.ds.query<any[]>(`
        SELECT plan, COUNT(*)::int AS cantidad
        FROM suscripciones WHERE estado = 'activa'
        GROUP BY plan ORDER BY cantidad DESC
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt,
               COUNT(CASE WHEN "fechaVencimiento" <= CURRENT_DATE + 7 THEN 1 END)::int AS "proximasVencer"
        FROM suscripciones WHERE plan::text = 'trial' AND estado = 'activa'
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt FROM suscripciones
        WHERE "fechaVencimiento" < CURRENT_DATE AND estado = 'activa'
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt FROM ecf
        WHERE "createdAt"::date = CURRENT_DATE AND "isActive" = true
      `),
      this.ds.query<any[]>(`
        SELECT COALESCE(SUM(total),0)::numeric AS "montoMes" FROM facturas
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
          AND "isActive" = true AND estado != 'cancelada'
      `),
    ]);

    const mrrUsd = (porPlan as any[]).reduce((acc: number, r: any) => {
      return acc + (USD_PRICES[r.plan as string] ?? 0) * Number(r.cantidad);
    }, 0);

    return {
      totalEmpresas:        Number(base[0]?.totalEmpresas   ?? 0),
      empresasActivas:      Number(base[0]?.empresasActivas ?? 0),
      totalUsuarios:        Number(base[0]?.totalUsuarios   ?? 0),
      nuevosHoy:            Number(base[0]?.nuevosHoy       ?? 0),
      mrrUsd:               Math.round(mrrUsd * 100) / 100,
      facturasHoy:          Number(facturasHoy[0]?.total    ?? 0),
      facturasMes:          Number(facturasMes[0]?.total    ?? 0),
      montoFacturasMes:     Number(montoMes[0]?.montoMes    ?? 0),
      empresasEnTrial:      Number(trials[0]?.cnt           ?? 0),
      trialsProximosVencer: Number(trials[0]?.proximasVencer ?? 0),
      suscripcionesVencidas: Number(vencidas[0]?.cnt        ?? 0),
      ecfHoy:               Number(ecfHoy[0]?.cnt           ?? 0),
      distribucionPlanes:   porPlan,
    };
  }

  async enviarMensaje(empresaId: number, tipo: string, subject: string, mensaje: string) {
    await this.ds.query(`
      INSERT INTO notificaciones_enviadas ("empresaId", tipo, asunto, cuerpo, "creadoEn")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT DO NOTHING
    `, [empresaId, tipo, subject, mensaje]).catch(() => {
      // Si la tabla no tiene esa estructura, solo logueamos
    });
    return { ok: true, mensaje: 'Mensaje registrado correctamente' };
  }

  async eliminarUsuario(userId: number, superAdminId: number) {
    if (userId === superAdminId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta');
    }

    const rows = await this.ds.query<any[]>(
      'SELECT id, nombre, email, role, "isActive" FROM users WHERE id = $1',
      [userId],
    );
    if (!rows[0]) throw new NotFoundException(`Usuario #${userId} no encontrado`);

    const u = rows[0];
    if (u.role === 'super_admin') {
      throw new ForbiddenException('No puedes eliminar a otro Super Admin');
    }
    if (!u.isActive) {
      throw new BadRequestException('El usuario ya está desactivado');
    }

    // Soft delete: desactivar + liberar email (único en BD)
    const emailLiberado = `deleted_${Date.now()}_${u.email}`;
    await this.ds.query(
      `UPDATE users
         SET "isActive" = false,
             email       = $1,
             "updatedAt" = NOW()
       WHERE id = $2`,
      [emailLiberado, userId],
    );

    this.logger.warn(
      `Usuario #${userId} (${u.email}) eliminado por super_admin #${superAdminId}`,
    );

    return {
      ok:      true,
      mensaje: `Usuario ${u.nombre} (${u.email}) eliminado correctamente`,
      usuario: { id: userId, nombre: u.nombre, email: u.email },
    };
  }

  async suspenderUsuario(userId: number, superAdminId: number) {
    if (userId === superAdminId) throw new BadRequestException('No puedes suspender tu propia cuenta');
    const [u] = await this.ds.query<any[]>('SELECT id, nombre, email, role, "isActive" FROM users WHERE id = $1', [userId]);
    if (!u) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (u.role === 'super_admin') throw new ForbiddenException('No puedes suspender a otro Super Admin');
    if (!u.isActive) throw new BadRequestException('El usuario ya está suspendido');
    await this.ds.query('UPDATE users SET "isActive" = false, "updatedAt" = NOW() WHERE id = $1', [userId]);
    this.logger.warn(`Usuario #${userId} (${u.email}) suspendido por super_admin #${superAdminId}`);
    return { ok: true, mensaje: `Usuario ${u.nombre} suspendido correctamente` };
  }

  async activarUsuario(userId: number, superAdminId: number) {
    const [u] = await this.ds.query<any[]>('SELECT id, nombre, email, role, "isActive" FROM users WHERE id = $1', [userId]);
    if (!u) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (u.isActive) throw new BadRequestException('El usuario ya está activo');
    await this.ds.query('UPDATE users SET "isActive" = true, "updatedAt" = NOW() WHERE id = $1', [userId]);
    this.logger.log(`Usuario #${userId} (${u.email}) activado por super_admin #${superAdminId}`);
    return { ok: true, mensaje: `Usuario ${u.nombre} activado correctamente` };
  }

  async eliminarUsuarioPermanente(userId: number, superAdminId: number, confirmacion: string) {
    if (confirmacion !== 'ELIMINAR_PERMANENTE') {
      throw new BadRequestException('Confirmación inválida. Escribe exactamente: ELIMINAR_PERMANENTE');
    }
    if (userId === superAdminId) throw new BadRequestException('No puedes eliminarte a ti mismo');
    const [u] = await this.ds.query<any[]>('SELECT id, nombre, email, role FROM users WHERE id = $1', [userId]);
    if (!u) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (u.role === 'super_admin') throw new ForbiddenException('No puedes eliminar a otro Super Admin');

    this.logger.warn(`[HARD DELETE] Usuario #${userId} (${u.email}) eliminado permanentemente por super_admin #${superAdminId}`);
    await this.ds.query('DELETE FROM users WHERE id = $1', [userId]);
    return { ok: true, mensaje: `Usuario ${u.nombre} (${u.email}) eliminado permanentemente` };
  }

  async eliminarEmpresaPermanente(id: number, superAdminId: number, confirmacion: string) {
    if (confirmacion !== 'ELIMINAR_PERMANENTE') {
      throw new BadRequestException('Confirmación inválida. Escribe exactamente: ELIMINAR_PERMANENTE');
    }
    const [e] = await this.ds.query<any[]>('SELECT id, nombre, rnc FROM empresa WHERE id = $1', [id]);
    if (!e) throw new NotFoundException(`Empresa #${id} no encontrada`);

    this.logger.warn(`[HARD DELETE] Empresa #${id} (${e.nombre}) eliminada permanentemente por super_admin #${superAdminId}`);
    // Los CASCADE en BD eliminan facturas, productos, empleados, etc.
    await this.ds.query('DELETE FROM empresa WHERE id = $1', [id]);
    return { ok: true, mensaje: `Empresa "${e.nombre}" (RNC: ${e.rnc}) eliminada permanentemente` };
  }

  async cambiarRolUsuario(userId: number, nuevoRol: string, solicitanteId: number) {
    const rows = await this.ds.query<any[]>('SELECT id, nombre, role FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (userId === solicitanteId) throw new Error('No puedes cambiar tu propio rol');

    const rolPrev = rows[0].role;
    // S-31: incrementar roleVersion para invalidar JWTs con rol anterior (efecto en máx 30s)
    await this.ds.query(
      'UPDATE users SET role = $1, "roleVersion" = COALESCE("roleVersion", 1) + 1, "updatedAt" = NOW() WHERE id = $2',
      [nuevoRol, userId],
    );

    return {
      ok: true,
      mensaje: `Rol de ${rows[0].nombre} cambiado: ${rolPrev} → ${nuevoRol}`,
      usuario: { id: userId, nombre: rows[0].nombre, rolAnterior: rolPrev, rolNuevo: nuevoRol },
    };
  }

  async eliminarEmpresa(id: number) {
    await this.ds.query(`UPDATE empresa SET "isActive" = false WHERE id = $1`, [id]);
    await this.ds.query(`UPDATE suscripciones SET estado = 'cancelada' WHERE "empresaId" = $1`, [id]);
    // Desactivar todos los vínculos usuario↔empresa para que getEmpresaPrincipal
    // no devuelva esta empresa eliminada como empresa principal del usuario.
    await this.ds.query(`UPDATE usuario_empresa SET "isActive" = false WHERE "empresaId" = $1`, [id]);
    this.logger.log(`Empresa #${id} eliminada — ${await this.ds.query(`SELECT COUNT(*) FROM usuario_empresa WHERE "empresaId"=$1`,[id]).then(r=>r[0].count)} vínculos usuario desactivados`);
    return { ok: true, mensaje: `Empresa #${id} eliminada` };
  }

  // ── Suscripciones ────────────────────────────────────────────────────────

  async listarSuscripciones() {
    return this.ds.query<any[]>(`
      SELECT s.id, s."empresaId", e.nombre AS empresa, e.rnc,
             s.plan, s.estado,
             s."fechaInicio"::date, s."fechaVencimiento"::date,
             (s."fechaVencimiento"::date - CURRENT_DATE) AS "diasRestantes"
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      ORDER BY s."fechaVencimiento" ASC
    `);
  }

  async cambiarPlan(empresaId: number, plan: string, meses: number) {
    return this.cambiarPlanConAuditoria(empresaId, plan, meses, null, null, 'Cambio manual por super admin');
  }

  async cambiarPlanConAuditoria(empresaId: number, plan: string, meses: number, superAdminId: number | null, solicitudId: number | null, motivo: string) {
    const [prev] = await this.ds.query<any[]>('SELECT plan, estado, "fechaVencimiento" FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    const fin = new Date();
    fin.setMonth(fin.getMonth() + meses);
    await this.ds.query(`UPDATE suscripciones SET plan = $1, estado = 'activa', "fechaVencimiento" = $2 WHERE "empresaId" = $3`, [plan, fin.toISOString(), empresaId]);
    const [sus] = await this.ds.query<any[]>('SELECT id FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    if (sus) {
      await this.ds.query(`INSERT INTO suscripcion_auditoria ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo) VALUES ($1,$2,'CAMBIO_PLAN',$3,$4,$5,$6)`,
        [sus.id, empresaId, JSON.stringify(prev), JSON.stringify({ plan, fechaVencimiento: fin, meses }), superAdminId, motivo]);
    }
    if (solicitudId) {
      await this.ds.query(`UPDATE solicitud_cambio_plan SET estado='aprobada',"superAdminId"=$1,"updatedAt"=NOW() WHERE id=$2`, [superAdminId, solicitudId]);
    }
    return { ok: true, plan, fechaVencimiento: fin.toISOString() };
  }

  async extenderTrial(empresaId: number, dias: number, superAdminId: number, motivo: string) {
    const [sus] = await this.ds.query<any[]>('SELECT id, plan, "fechaVencimiento" FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    if (!sus) throw new Error(`No hay suscripción para empresa #${empresaId}`);
    const nuevaFecha = new Date(sus.fechaVencimiento);
    nuevaFecha.setDate(nuevaFecha.getDate() + dias);
    await this.ds.query('UPDATE suscripciones SET "fechaVencimiento"=$1 WHERE id=$2', [nuevaFecha.toISOString(), sus.id]);
    await this.ds.query(`INSERT INTO suscripcion_auditoria ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo) VALUES ($1,$2,'EXTENSION_TRIAL',$3,$4,$5,$6)`,
      [sus.id, empresaId, JSON.stringify({ fechaVencimiento: sus.fechaVencimiento }), JSON.stringify({ fechaVencimiento: nuevaFecha, dias }), superAdminId, motivo]);
    return { ok: true, nuevaFecha };
  }

  async suspenderSuscripcion(empresaId: number, superAdminId: number, motivo: string) {
    const [sus] = await this.ds.query<any[]>('SELECT id, estado FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    if (!sus) throw new Error(`No hay suscripción`);
    await this.ds.query(`UPDATE suscripciones SET estado='suspendida',"motivoSuspension"=$1 WHERE id=$2`, [motivo, sus.id]);
    await this.ds.query(`INSERT INTO suscripcion_auditoria ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo) VALUES ($1,$2,'SUSPENSION',$3,$4,$5,$6)`,
      [sus.id, empresaId, JSON.stringify({ estado: sus.estado }), JSON.stringify({ estado: 'suspendida' }), superAdminId, motivo]);
    return { ok: true };
  }

  async reactivarSuscripcion(empresaId: number, superAdminId: number, motivo: string) {
    const [sus] = await this.ds.query<any[]>('SELECT id, estado FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    if (!sus) throw new Error(`No hay suscripción`);
    await this.ds.query(`UPDATE suscripciones SET estado='activa',"motivoSuspension"=NULL WHERE id=$1`, [sus.id]);
    await this.ds.query(`INSERT INTO suscripcion_auditoria ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo) VALUES ($1,$2,'REACTIVACION',$3,$4,$5,$6)`,
      [sus.id, empresaId, JSON.stringify({ estado: sus.estado }), JSON.stringify({ estado: 'activa' }), superAdminId, motivo]);
    return { ok: true };
  }

  async aplicarDescuento(empresaId: number, pct: number, hasta: string | null, superAdminId: number, motivo: string) {
    const [sus] = await this.ds.query<any[]>('SELECT id FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    if (!sus) throw new Error(`No hay suscripción`);
    await this.ds.query(`UPDATE suscripciones SET "descuentoPct"=$1,"descuentoHasta"=$2,"descuentoMotivo"=$3 WHERE id=$4`, [pct, hasta, motivo, sus.id]);
    await this.ds.query(`INSERT INTO suscripcion_auditoria ("suscripcionId","empresaId",accion,"valorNuevo","superAdminId",motivo) VALUES ($1,$2,'DESCUENTO',$3,$4,$5)`,
      [sus.id, empresaId, JSON.stringify({ descuentoPct: pct, hasta }), superAdminId, motivo]);
    return { ok: true };
  }

  async listarSolicitudes(estado?: string) {
    if (estado) {
      return this.ds.query<any[]>(`
        SELECT sc.*, e.nombre AS empresa, e.rnc,
               s.plan AS "planActual", s."ingresosMesActualDop"
        FROM solicitud_cambio_plan sc
        JOIN empresa e ON e.id = sc."empresaId"
        LEFT JOIN suscripciones s ON s."empresaId" = sc."empresaId"
        WHERE sc.estado = $1
        ORDER BY sc."createdAt" DESC
      `, [estado]);
    }
    return this.ds.query<any[]>(`
      SELECT sc.*, e.nombre AS empresa, e.rnc,
             s.plan AS "planActual", s."ingresosMesActualDop"
      FROM solicitud_cambio_plan sc
      JOIN empresa e ON e.id = sc."empresaId"
      LEFT JOIN suscripciones s ON s."empresaId" = sc."empresaId"
      ORDER BY sc."createdAt" DESC
    `);
  }

  async rechazarSolicitud(solicitudId: number, superAdminId: number, motivo: string) {
    await this.ds.query(`UPDATE solicitud_cambio_plan SET estado='rechazada',"motivoRechazo"=$1,"superAdminId"=$2,"updatedAt"=NOW() WHERE id=$3`, [motivo, superAdminId, solicitudId]);
    return { ok: true };
  }

  async getAuditoria(empresaId: number) {
    return this.ds.query<any[]>(`
      SELECT sa.*, u.nombre AS "superAdminNombre"
      FROM suscripcion_auditoria sa
      LEFT JOIN users u ON u.id = sa."superAdminId"
      WHERE sa."empresaId" = $1
      ORDER BY sa."createdAt" DESC LIMIT 50
    `, [empresaId]);
  }

  async getMrrArr() {
    const USD: Record<string, number> = { trial: 0, emprendedor: 29, pyme: 59, pro: 89, plus: 129, basico: 0, profesional: 0, empresarial: 0, enterprise: 0 };
    const rows = await this.ds.query<any[]>(`SELECT plan, modalidad, COUNT(*)::int AS cantidad FROM suscripciones WHERE estado = 'activa' GROUP BY plan, modalidad`);
    let mrrUsd = 0;
    const dist: Record<string, { cantidad: number; mrrUsd: number }> = {};
    for (const r of rows) {
      const p = (USD[r.plan] ?? 0) * (r.modalidad === 'anual' ? 0.9 : 1);
      mrrUsd += p * Number(r.cantidad);
      dist[r.plan] = { cantidad: (dist[r.plan]?.cantidad ?? 0) + Number(r.cantidad), mrrUsd: (dist[r.plan]?.mrrUsd ?? 0) + p * Number(r.cantidad) };
    }
    return { mrrUsd: Math.round(mrrUsd * 100) / 100, arrUsd: Math.round(mrrUsd * 12 * 100) / 100, distribucion: dist };
  }
}
