import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../notificaciones/services/email.service';
import { PLANES, PlanTipo } from '../suscripciones/entities/suscripcion.entity';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);
  constructor(
    private ds: DataSource,
    private emailService: EmailService,
  ) {}

  // ── Empresas ──────────────────────────────────────────────────────────────

  async listarEmpresas() {
    return this.ds.query<any[]>(`
      SELECT e.id, e.nombre, e.rnc, e."isActive",
             e."createdAt"::date AS "fechaRegistro",
             s.plan, s.estado AS "estadoSuscripcion",
             COALESCE(s."vencimientoOverride", s."fechaVencimiento")::date AS "venceSuscripcion",
             s."vencimientoOverride"::date AS "vencimientoOverride",
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
               s.plan, s.estado, s."fechaVencimiento", s."vencimientoOverride"
      ORDER BY e."createdAt" DESC
    `);
  }

  async getEmpresa(id: number) {
    const [emp] = await this.ds.query<any[]>(`
      SELECT e.*, s.id AS "suscripcionId", s.plan, s.estado AS "estadoSuscripcion",
             s."fechaInicio", s."fechaVencimiento", s."vencimientoOverride",
             COUNT(DISTINCT ue."userId")::int AS usuarios
      FROM empresa e
      LEFT JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isActive" = true
      WHERE e.id = $1
      GROUP BY e.id, s.id, s.plan, s.estado, s."fechaInicio", s."fechaVencimiento", s."vencimientoOverride"
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

  // ── Aprobación de nuevas empresas ─────────────────────────────────────────

  async getEmpresasPendientesAprobacion() {
    return this.ds.query<any[]>(`
      SELECT e.id, e.nombre, e.rnc, e.email, e.sector, e.telefono, e."createdAt",
             u.nombre AS "solicitanteNombre", u.email AS "solicitanteEmail"
      FROM empresa e
      LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isPrincipal" = true
      LEFT JOIN users u ON u.id = ue."userId"
      WHERE e."estadoAprobacion" = 'pendiente' AND e."isActive" = true
      ORDER BY e."createdAt" ASC
    `);
  }

  async aprobarEmpresa(empresaId: number, adminId: number) {
    const [emp] = await this.ds.query<any[]>(
      `SELECT e.*, u.email AS "solicitanteEmail", u.nombre AS "solicitanteNombre"
       FROM empresa e
       LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isPrincipal" = true
       LEFT JOIN users u ON u.id = ue."userId"
       WHERE e.id = $1`,
      [empresaId],
    );
    if (!emp) throw new NotFoundException(`Empresa #${empresaId} no encontrada`);
    if (emp.estadoAprobacion !== 'pendiente') {
      throw new BadRequestException(`La empresa ya fue ${emp.estadoAprobacion}`);
    }

    await this.ds.query(
      `UPDATE empresa SET "estadoAprobacion"='aprobada', "aprobadoPor"=$1, "fechaAprobacion"=NOW() WHERE id=$2`,
      [adminId, empresaId],
    );

    // Crear suscripción Trial de 15 días
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + 15);
    await this.ds.query(
      `INSERT INTO suscripciones ("empresaId", plan, estado, "fechaInicio", "fechaVencimiento", "creadoPor")
       VALUES ($1, 'trial', 'activo', NOW(), $2, $3)
       ON CONFLICT DO NOTHING`,
      [empresaId, fechaFin, adminId],
    );

    // Email al solicitante
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    if (emp.solicitanteEmail) {
      await this.emailService.enviar({
        to:      emp.solicitanteEmail,
        subject: `¡Tu empresa fue aprobada en HiCloud!`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center;color:#fff">
            <h2 style="margin:0">✅ ¡Empresa aprobada!</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
            <p>Hola <strong>${emp.solicitanteNombre ?? 'usuario'}</strong>,</p>
            <p>Tu solicitud para la empresa <strong>${emp.nombre}</strong> fue <strong>aprobada</strong>.</p>
            <p>Ya puedes acceder y tu plan Trial de <strong>15 días</strong> ha comenzado.</p>
            <p style="text-align:center;margin:24px 0">
              <a href="${frontendUrl}/login" style="background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
                Acceder a HiCloud →
              </a>
            </p>
          </div>
        </div>`,
      }).catch(err => this.logger.warn(`Email aprobación empresa #${empresaId}: ${err?.message}`));
    }

    this.logger.log(`[Empresa] #${empresaId} aprobada por admin #${adminId}`);
    return { ok: true, mensaje: `Empresa #${empresaId} aprobada`, empresaId };
  }

  async rechazarEmpresa(empresaId: number, adminId: number, motivo: string) {
    const [emp] = await this.ds.query<any[]>(
      `SELECT e.nombre, u.email AS "solicitanteEmail", u.nombre AS "solicitanteNombre"
       FROM empresa e
       LEFT JOIN usuario_empresa ue ON ue."empresaId" = e.id AND ue."isPrincipal" = true
       LEFT JOIN users u ON u.id = ue."userId"
       WHERE e.id = $1`,
      [empresaId],
    );
    if (!emp) throw new NotFoundException(`Empresa #${empresaId} no encontrada`);

    await this.ds.query(
      `UPDATE empresa SET "estadoAprobacion"='rechazada', "motivoRechazo"=$1, "aprobadoPor"=$2, "fechaAprobacion"=NOW() WHERE id=$3`,
      [motivo, adminId, empresaId],
    );

    if (emp.solicitanteEmail) {
      await this.emailService.enviar({
        to:      emp.solicitanteEmail,
        subject: `Solicitud de empresa no aprobada`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:24px;border-radius:12px 12px 0 0;text-align:center;color:#fff">
            <h2 style="margin:0">Solicitud no aprobada</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-radius:0 0 12px 12px">
            <p>Hola <strong>${emp.solicitanteNombre ?? 'usuario'}</strong>,</p>
            <p>Tu solicitud para la empresa <strong>${emp.nombre}</strong> no fue aprobada en este momento.</p>
            <p><strong>Motivo:</strong> ${motivo}</p>
            <p>Puedes contactarnos a través del portal para más información.</p>
          </div>
        </div>`,
      }).catch(err => this.logger.warn(`Email rechazo empresa #${empresaId}: ${err?.message}`));
    }

    this.logger.log(`[Empresa] #${empresaId} rechazada por admin #${adminId}: ${motivo}`);
    return { ok: true, mensaje: `Empresa #${empresaId} rechazada`, empresaId };
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
    const [base, facturasHoy, facturasMes, porPlan, trials, vencidas, ecfHoy, montoMes, sesiones] = await Promise.all([
      // Fix: subqueries independientes en vez de CROSS JOIN O(N×M)
      this.ds.query<any[]>(`
        SELECT
          (SELECT COUNT(*)::int FROM empresa)                                                                      AS "totalEmpresas",
          (SELECT COUNT(*)::int FROM empresa WHERE "isActive" = true)                                             AS "empresasActivas",
          (SELECT COUNT(*)::int FROM users WHERE role::text != 'super_admin')                                     AS "totalUsuarios",
          (SELECT COUNT(*)::int FROM users WHERE role::text != 'super_admin' AND "createdAt"::date = CURRENT_DATE) AS "nuevosHoy"
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
      // Fix MRR: incluir modalidad para calcular anual/12 vs mensual
      this.ds.query<any[]>(`
        SELECT s.plan, s.modalidad, COUNT(DISTINCT s."empresaId")::int AS cantidad
        FROM suscripciones s
        JOIN empresa e ON e.id = s."empresaId" AND e."isActive" = true
        WHERE s.estado = 'activa'
        GROUP BY s.plan, s.modalidad ORDER BY s.plan
      `),
      // Fix trials: filtrar solo empresas activas
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt,
               COUNT(CASE WHEN COALESCE(s."vencimientoOverride",s."fechaVencimiento") <= CURRENT_DATE + 7 THEN 1 END)::int AS "proximasVencer"
        FROM suscripciones s
        JOIN empresa e ON e.id = s."empresaId" AND e."isActive" = true
        WHERE s.plan::text = 'trial' AND s.estado = 'activa'
      `),
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt FROM suscripciones
        WHERE COALESCE("vencimientoOverride","fechaVencimiento") < CURRENT_DATE AND estado = 'activa'
      `),
      // Fix e-CF: usar timezone RD (UTC-4) para que "hoy" coincida con el día local
      this.ds.query<any[]>(`
        SELECT COUNT(*)::int AS cnt FROM ecf
        WHERE ("createdAt" AT TIME ZONE 'America/Santo_Domingo')::date
            = (NOW()        AT TIME ZONE 'America/Santo_Domingo')::date
          AND "isActive" = true
      `),
      this.ds.query<any[]>(`
        SELECT COALESCE(SUM(total),0)::numeric AS "montoMes" FROM facturas
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
          AND "isActive" = true AND estado != 'cancelada'
      `),
      // Fix sesiones: contar usuarios únicos con refresh_token vigente (no revocado)
      this.ds.query<any[]>(`
        SELECT COUNT(DISTINCT "userId")::int AS cnt FROM refresh_tokens
        WHERE "revokedAt" IS NULL AND "expiresAt" > NOW()
      `),
    ]);

    // MRR: usa precios del constante PLANES (fuente única de verdad).
    // Suscripciones anuales se prorratean a precio mensual (precioAnualUsd / 12).
    const mrrUsd = (porPlan as any[]).reduce((acc: number, r: any) => {
      const cfg = PLANES[r.plan as PlanTipo];
      if (!cfg) return acc;
      const precio = r.modalidad === 'anual'
        ? cfg.precioAnualUsd / 12
        : cfg.precioMensualUsd;
      return acc + precio * Number(r.cantidad);
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
      sesionesActivas:      Number(sesiones[0]?.cnt         ?? 0),
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

    this.logger.warn(`[HARD DELETE] Usuario #${userId} (${u.email}) iniciado por super_admin #${superAdminId}`);

    await this.ds.transaction(async em => {
      // Helper SAVEPOINT — igual que en eliminarEmpresaPermanente.
      // .catch() JS NO restaura el estado de la transacción en PostgreSQL;
      // sólo ROLLBACK TO SAVEPOINT lo hace.
      let _spSeq = 0;
      const safeQuery = async (sql: string, params: any[], label: string) => {
        const sp = `sp_usr_${++_spSeq}`;
        await em.query(`SAVEPOINT "${sp}"`);
        try {
          await em.query(sql, params);
          await em.query(`RELEASE SAVEPOINT "${sp}"`);
        } catch (err: any) {
          await em.query(`ROLLBACK TO SAVEPOINT "${sp}"`);
          await em.query(`RELEASE SAVEPOINT "${sp}"`);
          this.logger.warn(`[HARD DELETE] ${label}: ${(err.message ?? '').split('\n')[0]}`);
        }
      };

      // ── 1. Eliminar registros de sesión / vinculación ───────────────────────
      await safeQuery(`DELETE FROM usuario_empresa WHERE "userId" = $1`, [userId], 'usuario_empresa');
      await safeQuery(`DELETE FROM refresh_tokens    WHERE "userId" = $1`, [userId], 'refresh_tokens');

      // ── 2. Detectar TODAS las FK que apuntan a users dinámicamente ──────────
      //    También obtenemos is_nullable para decidir si nullificar o borrar.
      const fkRefs = await em.query<{
        table_name: string; column_name: string; is_nullable: string;
      }[]>(`
        SELECT DISTINCT
          tc.table_name,
          kcu.column_name,
          cols.is_nullable
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON  tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON  tc.constraint_name = rc.constraint_name
        JOIN information_schema.table_constraints AS ccu
          ON  ccu.constraint_name = rc.unique_constraint_name
          AND ccu.table_schema    = tc.table_schema
        JOIN information_schema.columns cols
          ON  cols.table_schema  = 'public'
          AND cols.table_name    = tc.table_name
          AND cols.column_name   = kcu.column_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name     = 'users'
          AND tc.table_name  NOT IN ('usuario_empresa', 'refresh_tokens')
          AND tc.table_schema    = 'public'
        ORDER BY tc.table_name, kcu.column_name
      `);

      this.logger.log(
        `[HARD DELETE] FK refs encontradas (${fkRefs.length}): ` +
        fkRefs.map(r => `${r.table_name}.${r.column_name}[nullable=${r.is_nullable}]`).join(', '),
      );

      // ── 3A. Para tablas NOT NULL FK a users: borrar sus hijos primero ────────
      //    Ejemplo: nomina_periodos.userId NOT NULL → no podemos borrarlo directamente
      //    porque nomina_lineas.periodoId FK a nomina_periodos sin CASCADE.
      //    Mismo patrón que el paso 3 de eliminarEmpresaPermanente.
      const notNullTables = fkRefs.filter(r => r.is_nullable === 'NO');
      for (const { table_name, column_name } of notNullTables) {
        const nietos = await em.query<{ child_table: string; child_col: string }[]>(`
          SELECT DISTINCT
            tc.table_name   AS child_table,
            kcu.column_name AS child_col
          FROM information_schema.table_constraints   tc
          JOIN information_schema.key_column_usage     kcu
            ON  tc.constraint_name = kcu.constraint_name
            AND tc.table_schema    = kcu.table_schema
          JOIN information_schema.referential_constraints rc
            ON  tc.constraint_name = rc.constraint_name
          JOIN information_schema.table_constraints    ccu
            ON  ccu.constraint_name = rc.unique_constraint_name
            AND ccu.table_schema    = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name     = $1
            AND tc.table_schema    = 'public'
        `, [table_name]);

        if (nietos.length) {
          this.logger.log(
            `[HARD DELETE] Nietos de ${table_name}: ${nietos.map(n => `${n.child_table}.${n.child_col}`).join(', ')}`,
          );
        }

        for (const { child_table, child_col } of nietos) {
          await safeQuery(
            `DELETE FROM "${child_table}"
               WHERE "${child_col}" IN (
                 SELECT id FROM "${table_name}" WHERE "${column_name}" = $1
               )`,
            [userId],
            `nieto ${child_table} via ${table_name}`,
          );
        }
      }

      // ── 3B. Resolver cada FK según si admite NULL ───────────────────────────
      //    - is_nullable = YES → SET col = NULL (preserva el historial)
      //    - is_nullable = NO  → DELETE la fila (ya eliminamos sus hijos en 3A)
      for (const { table_name, column_name, is_nullable } of fkRefs) {
        if (is_nullable === 'YES') {
          await safeQuery(
            `UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" = $1`,
            [userId],
            `nullificar ${table_name}.${column_name}`,
          );
        } else {
          await safeQuery(
            `DELETE FROM "${table_name}" WHERE "${column_name}" = $1`,
            [userId],
            `delete NOT-NULL FK ${table_name}.${column_name}`,
          );
        }
      }

      // ── 4. Limpiar tablas sin FK formal (datos PII) ─────────────────────────
      await safeQuery(
        `UPDATE pos_supervisor_log
           SET "cajeroId" = NULL, "supervisorId" = NULL
         WHERE "cajeroId" = $1 OR "supervisorId" = $1`,
        [userId],
        'pos_supervisor_log PII',
      );

      // ── 5. Eliminar el usuario ──────────────────────────────────────────────
      try {
        await em.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err: any) {
        // Log completo para diagnóstico
        this.logger.error(`[HARD DELETE] FULL ERROR usuario #${userId}: ${JSON.stringify(err)}`);
        console.error('[HARD DELETE] FULL ERROR:', JSON.stringify(err, null, 2));
        if (err?.code === '23503') {
          const detail = err?.detail ?? err?.message ?? '';
          const tabla  = detail.match(/table "([^"]+)"/)?.[1] ?? 'tabla desconocida';
          this.logger.error(`[HARD DELETE] FK residual en "${tabla}": ${detail}`);
          throw new BadRequestException(
            `No se puede eliminar: quedan registros en "${tabla}". ` +
            `Reporta esto al equipo técnico.`,
          );
        }
        throw err;
      }
    });

    this.logger.warn(`[HARD DELETE] Usuario #${userId} (${u.email}) eliminado por super_admin #${superAdminId}`);
    return { ok: true, mensaje: `Usuario ${u.nombre} (${u.email}) eliminado permanentemente` };
  }

  async eliminarEmpresaPermanente(id: number, superAdminId: number, confirmacion: string) {
    if (confirmacion !== 'ELIMINAR_PERMANENTE') {
      throw new BadRequestException('Confirmación inválida. Escribe exactamente: ELIMINAR_PERMANENTE');
    }
    const [e] = await this.ds.query<any[]>('SELECT id, nombre, rnc FROM empresa WHERE id = $1', [id]);
    if (!e) throw new NotFoundException(`Empresa #${id} no encontrada`);

    this.logger.warn(`[HARD DELETE] Empresa #${id} (${e.nombre}) iniciado por super_admin #${superAdminId}`);

    await this.ds.transaction(async em => {
      // Helper: envuelve cada DELETE en un SAVEPOINT para que un fallo por FK
      // no aborte la transacción PostgreSQL completa (.catch() JS NO restaura
      // el estado de la transacción en PG — sólo ROLLBACK TO SAVEPOINT lo hace).
      let _spSeq = 0;
      const safeDelete = async (sql: string, params: any[], label: string) => {
        const sp = `sp_del_${++_spSeq}`;
        await em.query(`SAVEPOINT "${sp}"`);
        try {
          await em.query(sql, params);
          await em.query(`RELEASE SAVEPOINT "${sp}"`);
        } catch (err: any) {
          await em.query(`ROLLBACK TO SAVEPOINT "${sp}"`);
          await em.query(`RELEASE SAVEPOINT "${sp}"`);
          this.logger.warn(`[HARD DELETE] ${label}: ${(err.message ?? '').split('\n')[0]}`);
        }
      };

      // ── 1. Tablas con FK directo a empresa (bloquean el DELETE final) ─────
      //    Las encontramos dinámicamente para sobrevivir a nuevas tablas.
      const fkDirectos = await em.query<{ table_name: string; column_name: string }[]>(`
        SELECT DISTINCT
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints   tc
        JOIN information_schema.key_column_usage     kcu
          ON  tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.referential_constraints rc
          ON  tc.constraint_name = rc.constraint_name
        JOIN information_schema.table_constraints    ccu
          ON  ccu.constraint_name = rc.unique_constraint_name
          AND ccu.table_schema    = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name     = 'empresa'
          AND tc.table_schema    = 'public'
        ORDER BY tc.table_name
      `);

      this.logger.debug(
        `[HARD DELETE] FK directos a empresa: ${fkDirectos.map(r => `${r.table_name}.${r.column_name}`).join(', ')}`,
      );

      // ── 2. Para cada tabla con FK a empresa, borrar primero sus hijos ─────
      //    (suscripcion_auditoria → suscripciones, etc.)
      for (const { table_name, column_name } of fkDirectos) {
        // Encontrar tablas con FK que apunten a esta tabla
        const hijos = await em.query<{ child_table: string; child_col: string }[]>(`
          SELECT DISTINCT
            tc.table_name  AS child_table,
            kcu.column_name AS child_col
          FROM information_schema.table_constraints   tc
          JOIN information_schema.key_column_usage     kcu
            ON  tc.constraint_name = kcu.constraint_name
            AND tc.table_schema    = kcu.table_schema
          JOIN information_schema.referential_constraints rc
            ON  tc.constraint_name = rc.constraint_name
          JOIN information_schema.table_constraints    ccu
            ON  ccu.constraint_name = rc.unique_constraint_name
            AND ccu.table_schema    = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name     = $1
            AND tc.table_schema    = 'public'
        `, [table_name]);

        for (const { child_table, child_col } of hijos) {
          // Borrar hijos cuyo parent pertenece a la empresa
          await safeDelete(
            `DELETE FROM "${child_table}"
              WHERE "${child_col}" IN (
                SELECT id FROM "${table_name}" WHERE "${column_name}" = $1
              )`,
            [id],
            `hijo ${child_table}`,
          );
        }

        // Ahora borrar la tabla que FK apunta directamente a empresa
        await safeDelete(
          `DELETE FROM "${table_name}" WHERE "${column_name}" = $1`,
          [id],
          `fk-directo ${table_name}`,
        );
      }

      // ── 3. Tablas SIN empresaId con FK a tablas que SÍ tienen empresaId ─────
      //    Ejemplo: nomina_lineas → nomina_periodos (sin CASCADE, sin empresaId).
      //    Las encontramos dinámicamente y borramos vía subquery.
      const tablasSinEmpresaId = await em.query<{
        child_table: string; child_col: string; parent_table: string;
      }[]>(`
        SELECT DISTINCT
          tc.table_name   AS child_table,
          kcu.column_name AS child_col,
          ccu.table_name  AS parent_table
        FROM information_schema.table_constraints   tc
        JOIN information_schema.key_column_usage     kcu
          ON  tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.referential_constraints rc
          ON  tc.constraint_name = rc.constraint_name
        JOIN information_schema.table_constraints    ccu
          ON  ccu.constraint_name = rc.unique_constraint_name
          AND ccu.table_schema    = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema    = 'public'
          -- La tabla padre tiene columna empresaId (es tabla tenant)
          AND EXISTS (
            SELECT 1 FROM information_schema.columns pc
            WHERE pc.table_schema = 'public'
              AND pc.table_name   = ccu.table_name
              AND pc.column_name  = 'empresaId'
          )
          -- La tabla hija NO tiene empresaId (no la cubre el paso siguiente)
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns cc
            WHERE cc.table_schema = 'public'
              AND cc.table_name   = tc.table_name
              AND cc.column_name  = 'empresaId'
          )
        ORDER BY tc.table_name
      `);

      if (tablasSinEmpresaId.length) {
        this.logger.debug(
          `[HARD DELETE] Tablas sin empresaId con FK tenant: ${
            tablasSinEmpresaId.map(r => `${r.child_table}.${r.child_col} → ${r.parent_table}`).join(', ')
          }`,
        );
      }

      for (const { child_table, child_col, parent_table } of tablasSinEmpresaId) {
        await safeDelete(
          `DELETE FROM "${child_table}"
            WHERE "${child_col}" IN (
              SELECT id FROM "${parent_table}" WHERE "empresaId" = $1
            )`,
          [id],
          `sin-empresaId ${child_table}`,
        );
      }

      // ── 4. Borrar TODO lo que tenga columna empresaId (datos del tenant) ──
      //    Esto limpia facturas, clientes, productos, aprobaciones, etc.
      //    Cada DELETE usa safeDelete (SAVEPOINT) para que un fallo por FK entre
      //    tablas del tenant no aborte la transacción PostgreSQL completa.
      const tablasTenant = await em.query<{ table_name: string }[]>(`
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name  = 'empresaId'
          AND c.table_name  != 'empresa'
        ORDER BY c.table_name
      `);

      // Una sola pasada con SAVEPOINT para que los fallos FK no aborten la PG tx
      for (const { table_name } of tablasTenant) {
        await safeDelete(
          `DELETE FROM "${table_name}" WHERE "empresaId" = $1`,
          [id],
          `tenant ${table_name}`,
        );
      }

      // ── 4. Eliminar la empresa ────────────────────────────────────────────
      try {
        await em.query('DELETE FROM empresa WHERE id = $1', [id]);
      } catch (err: any) {
        if (err?.code === '23503') {
          const detail = err?.detail ?? err?.message ?? '';
          const tabla  = detail.match(/table "([^"]+)"/)?.[1] ?? 'tabla desconocida';
          this.logger.error(`[HARD DELETE] FK residual en "${tabla}": ${detail}`);
          throw new BadRequestException(
            `No se puede eliminar la empresa: quedan registros en "${tabla}". ` +
            `Reporta esto al equipo técnico para que se agregue al proceso.`,
          );
        }
        throw err;
      }
    });

    this.logger.warn(`[HARD DELETE] Empresa #${id} (${e.nombre}) eliminada por super_admin #${superAdminId}`);
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
             s."fechaInicio"::date,
             COALESCE(s."vencimientoOverride", s."fechaVencimiento")::date AS "fechaVencimiento",
             (COALESCE(s."vencimientoOverride", s."fechaVencimiento")::date - CURRENT_DATE) AS "diasRestantes",
             s."vencimientoOverride"::date AS "vencimientoOverride"
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      ORDER BY COALESCE(s."vencimientoOverride", s."fechaVencimiento") ASC
    `);
  }

  async cambiarPlan(empresaId: number, plan: string, meses: number) {
    return this.cambiarPlanConAuditoria(empresaId, plan, meses, null, null, 'Cambio manual por super admin');
  }

  async cambiarPlanConAuditoria(empresaId: number, plan: string, meses: number, superAdminId: number | null, solicitudId: number | null, motivo: string) {
    const [prev] = await this.ds.query<any[]>('SELECT plan, estado, "fechaVencimiento", "vencimientoOverride" FROM suscripciones WHERE "empresaId" = $1', [empresaId]);
    const fin = new Date();
    fin.setMonth(fin.getMonth() + meses);
    if (prev?.vencimientoOverride != null) {
      // Override manual activo: no sobreescribir fechaVencimiento
      await this.ds.query(`UPDATE suscripciones SET plan = $1, estado = 'activa' WHERE "empresaId" = $2`, [plan, empresaId]);
    } else {
      await this.ds.query(`UPDATE suscripciones SET plan = $1, estado = 'activa', "fechaVencimiento" = $2 WHERE "empresaId" = $3`, [plan, fin.toISOString(), empresaId]);
    }
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

  async setVencimientoManual(empresaId: number, fecha: string, motivo: string, superAdminId: number) {
    const [sus] = await this.ds.query<any[]>(
      `SELECT id, estado, "vencimientoOverride" FROM suscripciones WHERE "empresaId" = $1`,
      [empresaId],
    );
    if (!sus) throw new Error(`No hay suscripción para empresa #${empresaId}`);
    if (sus.estado !== 'activa') throw new Error('Solo se puede fijar vencimiento manual en suscripciones ACTIVAS');

    await this.ds.query(
      `UPDATE suscripciones SET "vencimientoOverride" = $1 WHERE id = $2`,
      [fecha, sus.id],
    );
    await this.ds.query(
      `INSERT INTO suscripcion_auditoria
         ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo)
       VALUES ($1,$2,'FECHA_VENCIMIENTO_MANUAL',$3,$4,$5,$6)`,
      [sus.id, empresaId,
       JSON.stringify({ vencimientoOverride: sus.vencimientoOverride ?? null }),
       JSON.stringify({ vencimientoOverride: fecha }),
       superAdminId, motivo],
    );
    return { ok: true, vencimientoOverride: fecha };
  }

  async resetVencimientoManual(empresaId: number, motivo: string, superAdminId: number) {
    const [sus] = await this.ds.query<any[]>(
      `SELECT id, "vencimientoOverride" FROM suscripciones WHERE "empresaId" = $1`,
      [empresaId],
    );
    if (!sus) throw new Error(`No hay suscripción para empresa #${empresaId}`);

    // Restablecer fechaVencimiento al último periodo de pago confirmado, si existe
    await this.ds.query(`
      UPDATE suscripciones
      SET "vencimientoOverride" = NULL,
          "fechaVencimiento" = COALESCE(
            (SELECT "periodoFin"::date FROM pagos_suscripcion
             WHERE "empresaId" = $1 AND estado = 'confirmado' AND "periodoFin" IS NOT NULL
             ORDER BY "periodoFin" DESC LIMIT 1),
            "fechaVencimiento"
          )
      WHERE id = $2
    `, [empresaId, sus.id]);

    await this.ds.query(
      `INSERT INTO suscripcion_auditoria
         ("suscripcionId","empresaId",accion,"valorAnterior","valorNuevo","superAdminId",motivo)
       VALUES ($1,$2,'RESET_FECHA_VENCIMIENTO',$3,$4,$5,$6)`,
      [sus.id, empresaId,
       JSON.stringify({ vencimientoOverride: sus.vencimientoOverride ?? null }),
       JSON.stringify({ vencimientoOverride: null }),
       superAdminId, motivo],
    );
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
    const [sol] = await this.ds.query<any[]>(
      `SELECT sc."empresaId", sc."planSolicitado" FROM solicitud_cambio_plan sc WHERE sc.id = $1`, [solicitudId],
    );
    await this.ds.query(`UPDATE solicitud_cambio_plan SET estado='rechazada',"motivoRechazo"=$1,"superAdminId"=$2,"updatedAt"=NOW() WHERE id=$3`, [motivo, superAdminId, solicitudId]);

    // Notificar al cliente — no-bloqueante
    if (sol) {
      this.notificarRechazoSolicitudPlan(sol.empresaId, sol.planSolicitado, motivo)
        .catch(err => this.logger.warn(`Email rechazo solicitud plan #${solicitudId}: ${(err as Error).message}`));
    }

    return { ok: true };
  }

  private async notificarRechazoSolicitudPlan(empresaId: number, planSolicitado: string, motivo: string): Promise<void> {
    try {
      const [admin] = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin) return;

      await this.emailService.enviar({
        to: admin.email,
        subject: `Actualización sobre tu solicitud de plan ${planSolicitado} — HiCloud ERP`,
        html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">Sobre tu solicitud de plan</h2></div>
  <div class="body">
    <p>Hola <strong>${admin.nombre}</strong>,</p>
    <p>Hemos revisado tu solicitud de activación del plan <strong>${planSolicitado}</strong>. En este momento no hemos podido procesarla.</p>
    ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
    <p>Puedes hacer una nueva solicitud desde tu panel o contactarnos en <a href="mailto:soporte@hicloudrd.com">soporte@hicloudrd.com</a>.</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`,
      });
    } catch (err) {
      this.logger.warn(`notificarRechazoSolicitudPlan empresa #${empresaId}: ${(err as Error).message}`);
    }
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
    const rows = await this.ds.query<any[]>(`
      SELECT s.plan, s.modalidad, COUNT(DISTINCT s."empresaId")::int AS cantidad
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId" AND e."isActive" = true
      WHERE s.estado = 'activa'
      GROUP BY s.plan, s.modalidad
    `);
    let mrrUsd = 0;
    const dist: Record<string, { cantidad: number; mrrUsd: number }> = {};
    for (const r of rows) {
      const p = (USD[r.plan] ?? 0) * (r.modalidad === 'anual' ? 0.9 : 1);
      mrrUsd += p * Number(r.cantidad);
      dist[r.plan] = { cantidad: (dist[r.plan]?.cantidad ?? 0) + Number(r.cantidad), mrrUsd: (dist[r.plan]?.mrrUsd ?? 0) + p * Number(r.cantidad) };
    }
    return { mrrUsd: Math.round(mrrUsd * 100) / 100, arrUsd: Math.round(mrrUsd * 12 * 100) / 100, distribucion: dist };
  }

  // ── Gestión de registros pendientes de aprobación ─────────────────────────

  async listarRegistrosPendientes() {
    return this.ds.query<any[]>(`
      SELECT
        u.id, u.nombre, u.email, u.provider, u."createdAt",
        e.nombre AS empresa, e.rnc,
        s.plan
      FROM users u
      LEFT JOIN usuario_empresa ue ON ue."userId" = u.id AND ue."isPrincipal" = true AND ue."isActive" = true
      LEFT JOIN empresa e ON e.id = ue."empresaId"
      LEFT JOIN suscripciones s ON s."empresaId" = e.id
      WHERE u."accountStatus" = 'pendiente'
        AND u."isActive" = true
        AND u.role != 'super_admin'
      ORDER BY u."createdAt" DESC
    `);
  }

  async contarRegistrosPendientes(): Promise<number> {
    const [{ cnt }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS cnt FROM users WHERE "accountStatus" = 'pendiente' AND "isActive" = true AND role != 'super_admin'`,
    );
    return cnt ?? 0;
  }

  async aprobarRegistro(userId: number, superAdminId: number) {
    const [u] = await this.ds.query<any[]>(
      `SELECT id, nombre, email, "accountStatus", provider, "passwordConfigured" FROM users WHERE id = $1`,
      [userId],
    );
    if (!u) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (u.accountStatus !== 'pendiente') {
      throw new BadRequestException('Este usuario no está pendiente de aprobación');
    }

    await this.ds.query(
      `UPDATE users SET "accountStatus" = 'activo' WHERE id = $1`, [userId],
    );

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

    // Usuarios Google (o sin contraseña): generar token de configuración de contraseña
    const needsSetup = u.provider === 'GOOGLE' || u.passwordConfigured === false;
    let setupUrl = `${frontendUrl}/login`;

    if (needsSetup) {
      // Invalidar tokens anteriores y generar uno nuevo con validez de 24h
      await this.ds.query(
        `UPDATE setup_tokens SET used = true WHERE "userId" = $1 AND used = false`,
        [userId],
      );
      const rawToken  = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.ds.query(
        `INSERT INTO setup_tokens ("userId", "tokenHash", "expiresAt", used) VALUES ($1, $2, $3, false)`,
        [userId, tokenHash, expiresAt],
      );
      setupUrl = `${frontendUrl}/setup-password?token=${rawToken}`;
      this.logger.log(`[REGISTRO] Setup token generado para usuario Google #${userId}`);
    }

    // Email de aprobación — con o sin link de configuración de contraseña
    const html = needsSetup
      ? `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#059669,#10b981);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
.notice{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;color:#92400e}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">✅ Tu cuenta fue aprobada</h2></div>
  <div class="body">
    <p>Hola <strong>${u.nombre}</strong>,</p>
    <p>¡Tu solicitud de acceso a HiCloud ERP fue <strong>aprobada</strong>! Para comenzar, debes configurar tu contraseña:</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${setupUrl}" class="btn">Configurar contraseña →</a>
    </p>
    <div class="notice">
      ⏰ Este enlace es de <strong>un solo uso</strong> y expira en <strong>24 horas</strong>.<br/>
      Si no lo usas a tiempo, inicia sesión con Google para obtener un nuevo enlace automáticamente.
    </div>
    <p style="color:#9ca3af;font-size:12px">O copia este enlace en tu navegador:<br/>${setupUrl}</p>
    <p style="color:#6b7280;font-size:13px">¿Tienes preguntas? Escríbenos a soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`
      : `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#059669,#10b981);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">✅ Tu cuenta fue aprobada</h2></div>
  <div class="body">
    <p>Hola <strong>${u.nombre}</strong>,</p>
    <p>¡Tu solicitud de acceso a HiCloud ERP fue <strong>aprobada</strong>! Ya puedes iniciar sesión con tu correo y contraseña.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/login" class="btn">Iniciar sesión →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Tienes preguntas? Escríbenos a soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailService.enviar({
      to:      u.email,
      subject: '✅ Tu cuenta en HiCloud ERP fue aprobada',
      html,
    }).catch(err => this.logger.warn(`[REGISTRO] Email aprobación #${userId}: ${err?.message}`));

    this.logger.warn(`[REGISTRO] Usuario #${userId} (${u.email}) aprobado por super_admin #${superAdminId}${needsSetup ? ' — link setup enviado' : ''}`);
    return {
      ok: true,
      mensaje: needsSetup
        ? `Cuenta de ${u.nombre} aprobada. Se envió un link de configuración de contraseña al email.`
        : `Cuenta de ${u.nombre} aprobada. El usuario ya puede iniciar sesión.`,
    };
  }

  async rechazarRegistro(userId: number, superAdminId: number, motivo: string) {
    const [u] = await this.ds.query<any[]>(
      `SELECT id, nombre, email, "accountStatus" FROM users WHERE id = $1`, [userId],
    );
    if (!u) throw new NotFoundException(`Usuario #${userId} no encontrado`);
    if (u.accountStatus !== 'pendiente') {
      throw new BadRequestException('Este usuario no está pendiente de aprobación');
    }

    await this.ds.query(
      `UPDATE users SET "accountStatus" = 'rechazado', "isActive" = false WHERE id = $1`, [userId],
    );

    const motivoTexto = motivo || 'No se especificó un motivo';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;color:#fff;text-align:center}
.body{padding:28px}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">Sobre tu solicitud de acceso</h2></div>
  <div class="body">
    <p>Hola <strong>${u.nombre}</strong>,</p>
    <p>Hemos revisado tu solicitud de acceso a HiCloud ERP. En este momento, no podemos activar tu cuenta.</p>
    ${motivo ? `<p><strong>Motivo:</strong> ${motivoTexto}</p>` : ''}
    <p>Si crees que esto es un error o tienes preguntas, contacta a nuestro equipo en <a href="mailto:soporte@hicloudrd.com">soporte@hicloudrd.com</a>.</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailService.enviar({
      to:      u.email,
      subject: 'Actualización sobre tu solicitud de acceso — HiCloud ERP',
      html,
    }).catch(err => this.logger.warn(`[REGISTRO] Email rechazo #${userId}: ${err?.message}`));

    this.logger.warn(`[REGISTRO] Usuario #${userId} (${u.email}) rechazado por super_admin #${superAdminId}: ${motivo}`);
    return { ok: true, mensaje: `Solicitud de ${u.nombre} rechazada.` };
  }

  // ── Facturas Recurrentes — Diagnóstico y Reparación ───────────────────────

  async diagnosticoFacturasRecurrentes() {
    // 1. Plantillas con detalles que tienen precioUnitario = 0
    const templatesConPreciosCero = await this.ds.query<any[]>(`
      SELECT
        fr.id,
        fr.nombre,
        fr."empresaId",
        e.nombre AS empresa,
        fr.activa,
        fr."totalGeneradas",
        fr.detalles AS "detallesJson",
        (
          SELECT COUNT(*)::int
          FROM jsonb_array_elements(fr.detalles::jsonb) elem
          WHERE (COALESCE(elem->>'precioUnitario', '0'))::numeric = 0
        ) AS "itemsConPrecioCero"
      FROM facturas_recurrentes fr
      JOIN empresa e ON e.id = fr."empresaId"
      WHERE fr."isActive" = true
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(fr.detalles::jsonb) elem
          WHERE (COALESCE(elem->>'precioUnitario', '0'))::numeric = 0
        )
      ORDER BY fr."empresaId", fr.id
    `);

    // 2. Facturas con total = 0 generadas por recurrentes
    const facturasConMontosCero = await this.ds.query<any[]>(`
      SELECT
        f.id, f.folio, f.fecha, f.total, f.subtotal, f.iva,
        f."facturaRecurrenteId",
        fr.nombre AS "templateNombre",
        e.nombre  AS empresa,
        (
          SELECT COUNT(*)::int FROM factura_detalles fd
          WHERE fd."facturaId" = f.id AND fd."isActive" = true
        ) AS "numDetalles",
        (
          SELECT COUNT(*)::int FROM factura_detalles fd
          WHERE fd."facturaId" = f.id AND fd."isActive" = true
            AND fd."precioUnitario"::numeric = 0
        ) AS "detallesConPrecioCero"
      FROM facturas f
      JOIN facturas_recurrentes fr ON fr.id = f."facturaRecurrenteId"
      JOIN empresa e ON e.id = f."empresaId"
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
      ORDER BY f."empresaId", f.id DESC
      LIMIT 50
    `);

    // 3. Resumen global
    const resumen = await this.ds.query<any[]>(`
      SELECT
        (SELECT COUNT(*)::int FROM facturas_recurrentes WHERE "isActive" = true) AS "totalTemplates",
        (SELECT COUNT(*)::int FROM facturas WHERE "facturaRecurrenteId" IS NOT NULL AND "isActive" = true) AS "totalGeneradas",
        (SELECT COUNT(*)::int FROM facturas WHERE "facturaRecurrenteId" IS NOT NULL AND total::numeric = 0 AND "isActive" = true) AS "generadasConMontosCero"
    `);

    return {
      resumen: resumen[0],
      templatesConPreciosCero,
      facturasConMontosCero,
    };
  }

  async repararMontosRecurrentes() {
    this.logger.log('[RepararRecurrentes] Iniciando reparación...');

    // 1. Contar antes
    const [antes] = await this.ds.query<{ cero: string }[]>(
      `SELECT COUNT(*)::text AS cero FROM facturas WHERE "facturaRecurrenteId" IS NOT NULL AND total::numeric = 0 AND "isActive" = true`,
    );

    // 2. Actualizar factura_detalles con precio del producto (cuando productoId existe y precio > 0)
    await this.ds.query(`
      UPDATE factura_detalles fd
      SET
        "precioUnitario" = p.precio,
        subtotal         = ROUND(p.precio::numeric * fd.cantidad::numeric, 2),
        "importeIva"     = ROUND(p.precio::numeric * fd.cantidad::numeric * fd."porcentajeIva"::numeric / 100, 2),
        total            = ROUND(p.precio::numeric * fd.cantidad::numeric * (1 + fd."porcentajeIva"::numeric / 100), 2)
      FROM productos p
      JOIN facturas f ON f.id = fd."facturaId"
      WHERE fd."productoId" IS NOT NULL
        AND fd."precioUnitario"::numeric = 0
        AND p.id = fd."productoId" AND p."isActive" = true AND p.precio::numeric > 0
        AND f."facturaRecurrenteId" IS NOT NULL AND f."isActive" = true AND fd."isActive" = true
    `);

    // 3. Recalcular headers de facturas afectadas
    await this.ds.query(`
      UPDATE facturas f
      SET subtotal = sub.subtotal, iva = sub.iva, total = sub.total
      FROM (
        SELECT "facturaId",
          ROUND(COALESCE(SUM(subtotal),     0), 2) AS subtotal,
          ROUND(COALESCE(SUM("importeIva"), 0), 2) AS iva,
          ROUND(COALESCE(SUM(total),        0), 2) AS total
        FROM factura_detalles WHERE "isActive" = true GROUP BY "facturaId"
      ) sub
      WHERE f.id = sub."facturaId"
        AND f."facturaRecurrenteId" IS NOT NULL AND f."isActive" = true AND sub.total > 0
    `);

    // 4. Reparar también el JSON de las plantillas
    await this.ds.query(`
      UPDATE facturas_recurrentes fr
      SET detalles = fixed.detalles
      FROM (
        SELECT fr2.id,
          jsonb_agg(
            CASE
              WHEN (elem->>'productoId') IS NOT NULL
                AND (COALESCE(elem->>'precioUnitario', '0'))::numeric = 0
                AND p.precio::numeric > 0
              THEN jsonb_set(
                     jsonb_set(elem, '{precioUnitario}', to_jsonb(p.precio::numeric)),
                     '{porcentajeIva}', to_jsonb(p."porcentajeIva"::numeric))
              ELSE elem
            END ORDER BY ordinality) AS detalles
        FROM facturas_recurrentes fr2,
          LATERAL jsonb_array_elements(fr2.detalles::jsonb) WITH ORDINALITY AS t(elem, ordinality)
        LEFT JOIN productos p
          ON p.id = (elem->>'productoId')::integer AND p."isActive" = true
        WHERE fr2."isActive" = true
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(fr2.detalles::jsonb) e2
            WHERE (COALESCE(e2->>'precioUnitario', '0'))::numeric = 0 AND (e2->>'productoId') IS NOT NULL
          )
        GROUP BY fr2.id
      ) fixed
      WHERE fr.id = fixed.id
    `);

    // 5. Contar después
    const [despues] = await this.ds.query<{ cero: string }[]>(
      `SELECT COUNT(*)::text AS cero FROM facturas WHERE "facturaRecurrenteId" IS NOT NULL AND total::numeric = 0 AND "isActive" = true`,
    );

    const corregidas = Number(antes.cero) - Number(despues.cero);
    this.logger.log(`[RepararRecurrentes] Antes: ${antes.cero} con total=0 → Después: ${despues.cero} → ${corregidas} corregidas`);

    return {
      ok: true,
      antesConMontosCero: Number(antes.cero),
      despuesConMontosCero: Number(despues.cero),
      corregidas,
      mensaje: corregidas > 0
        ? `${corregidas} factura(s) reparadas correctamente.`
        : 'No se encontraron facturas con montos cero vinculadas a productos.',
    };
  }

  // ── Configuración Global de Seguridad ─────────────────────────────────────

  async getConfiguracionGlobal() {
    return this.ds.query<{
      clave: string; valor: string; descripcion: string;
    }[]>(`
      SELECT clave, valor, descripcion
      FROM configuraciones_sistema
      WHERE grupo = 'seguridad' AND "isActive" = true
      ORDER BY clave ASC
    `);
  }

  async updateConfiguracionGlobal(clave: string, valor: string) {
    const LIMITES: Record<string, { min: number; max: number }> = {
      SESION_HORAS:       { min: 1,   max: 720 },
      MAX_INTENTOS_LOGIN: { min: 3,   max: 10  },
    };

    const rows = await this.ds.query<{ id: number; editable: boolean }[]>(
      `SELECT id, editable FROM configuraciones_sistema WHERE clave = $1 AND "isActive" = true LIMIT 1`,
      [clave],
    );
    if (!rows[0]) throw new NotFoundException(`Configuración "${clave}" no encontrada`);
    if (!rows[0].editable) throw new BadRequestException(`La configuración "${clave}" no es editable`);

    let valorFinal = valor;
    if (LIMITES[clave]) {
      const num = Number(valor);
      if (isNaN(num)) throw new BadRequestException(`El valor debe ser numérico`);
      const { min, max } = LIMITES[clave];
      valorFinal = String(Math.max(min, Math.min(max, Math.round(num))));
    }

    await this.ds.query(
      `UPDATE configuraciones_sistema SET valor = $1 WHERE id = $2`,
      [valorFinal, rows[0].id],
    );
    return { clave, valor: valorFinal };
  }
}
