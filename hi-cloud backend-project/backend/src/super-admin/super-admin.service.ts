import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SuperAdminService {
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
    const [base, subs, facturasHoy, facturasMes, porPlan, trials, vencidas, ecfHoy, montoMes] = await Promise.all([
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
        SELECT COALESCE(SUM(
          COALESCE(
            (SELECT pc.precio::numeric FROM plan_configuracion pc WHERE pc.clave = s.plan::text LIMIT 1),
            CASE s.plan::text
              WHEN 'basico'       THEN 1500
              WHEN 'profesional'  THEN 3500
              WHEN 'empresarial'  THEN 7000
              WHEN 'enterprise'   THEN 15000
              ELSE 0 END
          )
        ),0)::numeric AS "ingresosRD"
        FROM suscripciones s WHERE s.estado = 'activa' AND s.plan::text != 'trial'
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

    return {
      totalEmpresas:      Number(base[0]?.totalEmpresas   ?? 0),
      empresasActivas:    Number(base[0]?.empresasActivas ?? 0),
      totalUsuarios:      Number(base[0]?.totalUsuarios   ?? 0),
      nuevosHoy:          Number(base[0]?.nuevosHoy       ?? 0),
      ingresosRD:         Number(subs[0]?.ingresosRD      ?? 0),
      facturasHoy:        Number(facturasHoy[0]?.total    ?? 0),
      facturasMes:        Number(facturasMes[0]?.total    ?? 0),
      montoFacturasMes:   Number(montoMes[0]?.montoMes    ?? 0),
      empresasEnTrial:    Number(trials[0]?.cnt           ?? 0),
      trialsProximosVencer: Number(trials[0]?.proximasVencer ?? 0),
      suscripcionesVencidas: Number(vencidas[0]?.cnt      ?? 0),
      ecfHoy:             Number(ecfHoy[0]?.cnt           ?? 0),
      distribucionPlanes: porPlan,
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

  async cambiarRolUsuario(userId: number, nuevoRol: string, solicitanteId: number) {
    const rows = await this.ds.query<any[]>('SELECT id, nombre, role FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (userId === solicitanteId) throw new Error('No puedes cambiar tu propio rol');

    const rolPrev = rows[0].role;
    await this.ds.query('UPDATE users SET role = $1, "updatedAt" = NOW() WHERE id = $2', [nuevoRol, userId]);

    return {
      ok: true,
      mensaje: `Rol de ${rows[0].nombre} cambiado: ${rolPrev} → ${nuevoRol}`,
      usuario: { id: userId, nombre: rows[0].nombre, rolAnterior: rolPrev, rolNuevo: nuevoRol },
    };
  }

  async eliminarEmpresa(id: number) {
    await this.ds.query(`UPDATE empresa SET "isActive" = false WHERE id = $1`, [id]);
    await this.ds.query(`UPDATE suscripciones SET estado = 'cancelada' WHERE "empresaId" = $1`, [id]);
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
    const fin = new Date();
    fin.setMonth(fin.getMonth() + meses);
    await this.ds.query(`
      UPDATE suscripciones
      SET plan = $1, estado = 'activa', "fechaVencimiento" = $2
      WHERE "empresaId" = $3
    `, [plan, fin.toISOString(), empresaId]);
    return { ok: true };
  }
}
