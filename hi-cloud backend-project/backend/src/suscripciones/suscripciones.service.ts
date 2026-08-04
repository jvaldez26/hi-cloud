import { Injectable, Logger, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource, In } from 'typeorm';
import { EmailService } from '../notificaciones/services/email.service';
import { Cron } from '@nestjs/schedule';
import {
  Suscripcion, PlanTipo, SuscripcionEstado, ModalidadPago,
  PLAN_LIMITES, PLANES, PLANES_ACTIVOS,
} from './entities/suscripcion.entity';
import { PlanConfiguracion } from './entities/plan-configuracion.entity';
import { SolicitudCambioPlan, EstadoSolicitud } from './entities/solicitud-cambio-plan.entity';
import { SuscripcionAuditoria, AccionAuditoria } from './entities/suscripcion-auditoria.entity';

/** Jerarquía de planes activos — mayor número = plan superior */
const PLAN_TIER: Record<string, number> = {
  emprendedor: 1, pyme: 2, pro: 3, plus: 4,
  // legado
  trial: 0, basico: 0, profesional: 2, empresarial: 3, enterprise: 4,
};


@Injectable()
export class SuscripcionesService implements OnModuleInit {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private repo: Repository<Suscripcion>,
    @InjectRepository(PlanConfiguracion)
    private planConfigRepo: Repository<PlanConfiguracion>,
    @InjectRepository(SolicitudCambioPlan)
    private solicitudRepo: Repository<SolicitudCambioPlan>,
    @InjectRepository(SuscripcionAuditoria)
    private auditoriaRepo: Repository<SuscripcionAuditoria>,
    private ds: DataSource,
    private emailSvc: EmailService,
  ) {}

  async onModuleInit() {
    // ALTER TYPE ADD VALUE no puede ejecutarse dentro de un DO block (PL/pgSQL)
    // en ciertas versiones de PostgreSQL. Se usa SQL directo con IF NOT EXISTS.
    const enumPlan  = 'suscripciones_plan_enum';
    const enumEstado = 'suscripciones_estado_enum';

    for (const val of ['emprendedor', 'pyme', 'pro', 'plus']) {
      const exists = await this.ds.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = $1 AND e.enumlabel = $2`,
        [enumPlan, val],
      ).catch(() => []);
      if (!exists?.length) {
        await this.ds.query(
          `ALTER TYPE suscripciones_plan_enum ADD VALUE '${val}'`,
        ).catch(e => this.logger.warn(`onModuleInit plan enum '${val}': ${e?.message}`));
      }
    }

    const prueba = await this.ds.query(
      `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1 AND e.enumlabel = 'prueba'`,
      [enumEstado],
    ).catch(() => []);
    if (!prueba?.length) {
      await this.ds.query(
        `ALTER TYPE suscripciones_estado_enum ADD VALUE 'prueba'`,
      ).catch(e => this.logger.warn(`onModuleInit estado enum 'prueba': ${e?.message}`));
    }

    await this.seedPlanConfiguracion();
  }

  // ── Obtener suscripción ───────────────────────────────────────────────────

  async getSuscripcion(empresaId = 1): Promise<Suscripcion & {
    info: typeof PLAN_LIMITES[PlanTipo];
    diasRestantes: number;
    diasGraciaRestantes: number;
  }> {
    let s = await this.repo.findOne({ where: { empresaId } });
    if (!s) {
      const hoy = new Date();
      const fin = new Date(); fin.setDate(fin.getDate() + 15);
      s = await this.repo.save(this.repo.create({
        empresaId,
        plan:            PlanTipo.EMPRENDEDOR,
        estado:          SuscripcionEstado.PRUEBA,
        fechaInicio:     hoy,
        fechaVencimiento: fin,
        fechaFinPrueba:  fin,
        diaCorte:        fin.getDate(),
      }));
    }
    const hoy = new Date();
    const fechaRef = s.estado === SuscripcionEstado.PRUEBA
      ? new Date(s.fechaFinPrueba ?? s.fechaVencimiento)
      : new Date(s.fechaVencimiento);
    const diasRestantes = Math.ceil((fechaRef.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    const diasGraciaRestantes = s.enPeriodoGracia && s.fechaFinGracia
      ? Math.max(0, Math.ceil((new Date(s.fechaFinGracia).getTime() - hoy.getTime()) / 86_400_000))
      : 0;

    return {
      ...s,
      info: PLAN_LIMITES[s.plan] ?? PLAN_LIMITES[PlanTipo.EMPRENDEDOR],
      diasRestantes,
      diasGraciaRestantes,
    };
  }

  // ── Activar plan (por super admin) ────────────────────────────────────────

  /**
   * @param superAdminId S-64: cuando la activación es manual desde el panel, deja
   * constancia de quién la hizo. Se omite en las llamadas internas que ya auditan
   * por su cuenta (aprobarSolicitud), para no duplicar el registro.
   */
  async activarPlan(
    empresaId: number,
    plan: PlanTipo,
    meses: number,
    notas?: string,
    modalidad: ModalidadPago = ModalidadPago.MENSUAL,
    superAdminId?: number,
  ) {
    const s = await this.repo.findOne({ where: { empresaId } });
    const inicio = new Date();
    const fin    = new Date();
    if (modalidad === ModalidadPago.ANUAL) {
      fin.setFullYear(fin.getFullYear() + 1);
    } else {
      fin.setMonth(fin.getMonth() + meses);
    }

    // Raw SQL para evitar cualquier cast de enum de TypeORM
    if (s) {
      await this.ds.query(
        `UPDATE suscripciones
         SET plan = $1, estado = 'activa', modalidad = $2,
             "fechaInicio" = $3, "fechaVencimiento" = $4, "fechaFinPrueba" = NULL,
             "diaCorte" = EXTRACT(DAY FROM $4::date)::smallint,
             "notasAdmin" = $5, "updatedAt" = NOW()
         WHERE id = $6`,
        [plan, modalidad, inicio.toISOString(), fin.toISOString(), notas ?? null, s.id],
      );
    } else {
      await this.ds.query(
        `INSERT INTO suscripciones
           ("empresaId", plan, estado, modalidad, "fechaInicio", "fechaVencimiento", "diaCorte",
            "notasAdmin", "fechaFinPrueba", "recordatorio5dEnviado", "recordatorio1dEnviado",
            "facturasMesUsadas", "facturasMesReset", "enPeriodoGracia", "createdAt", "updatedAt")
         VALUES ($1,$2,'activa',$3,$4,$5, EXTRACT(DAY FROM $5::date)::smallint, $6,NULL,false,false,0,0,false,NOW(),NOW())`,
        [empresaId, plan, modalidad, inicio.toISOString(), fin.toISOString(), notas ?? null],
      );
    }
    // S-64: auditoría de la activación manual (no-fatal)
    if (superAdminId) {
      const destino = s ?? await this.repo.findOne({ where: { empresaId } });
      if (destino) {
        this.auditoriaRepo.save(this.auditoriaRepo.create({
          suscripcionId: destino.id,
          empresaId,
          accion:        AccionAuditoria.CAMBIO_PLAN,
          superAdminId,
          motivo:        notas ?? 'Activación manual desde el panel Super Admin',
          valorAnterior: s ? { plan: s.plan, estado: s.estado } : undefined,
          valorNuevo:    { plan, meses, modalidad },
        })).catch(e => this.logger.warn(`Auditoría activarPlan empresa #${empresaId}: ${(e as Error).message}`));
      }
    }

    this.logger.log(`Plan ${plan} activado para empresa #${empresaId}${superAdminId ? ` por SA#${superAdminId}` : ''}`);
    return this.getSuscripcion(empresaId);
  }

  async suspender(empresaId: number, motivo?: string, superAdminId?: number) {
    const s = await this.repo.findOne({ where: { empresaId } });
    if (s) {
      await this.repo.update(s.id, {
        estado: SuscripcionEstado.SUSPENDIDA,
        motivoSuspension: motivo ?? 'SUSPENSION_MANUAL',
      });

      // S-64: suspender la suscripción de un cliente no dejaba rastro del autor
      this.auditoriaRepo.save(this.auditoriaRepo.create({
        suscripcionId: s.id,
        empresaId,
        accion:        AccionAuditoria.SUSPENSION,
        superAdminId,
        motivo:        motivo ?? 'SUSPENSION_MANUAL',
        valorAnterior: { estado: s.estado },
        valorNuevo:    { estado: SuscripcionEstado.SUSPENDIDA },
      })).catch(e => this.logger.warn(`Auditoría suspender empresa #${empresaId}: ${(e as Error).message}`));
    }
    return this.getSuscripcion(empresaId);
  }

  async listarTodasLasSuscripciones() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    const hoy  = new Date();
    return rows.map(s => ({
      ...s,
      info: PLAN_LIMITES[s.plan] ?? PLAN_LIMITES[PlanTipo.EMPRENDEDOR],
      diasRestantes: Math.ceil((
        (s.estado === SuscripcionEstado.PRUEBA
          ? new Date(s.fechaFinPrueba ?? s.fechaVencimiento)
          : new Date(s.fechaVencimiento)
        ).getTime() - hoy.getTime()
      ) / (1000 * 60 * 60 * 24)),
    }));
  }

  async getEstadisticasPlanes() {
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.plan', 'plan')
      .addSelect('s.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('s.plan, s.estado')
      .getRawMany();

    const totales = await this.repo.count();
    const activas = await this.repo.count({ where: { estado: SuscripcionEstado.ACTIVA } });
    const enPrueba = await this.repo.count({ where: { estado: SuscripcionEstado.PRUEBA } });

    // MRR DOP desde plan_configuracion
    const mrrRows = await this.ds.query<{ mrr: string }[]>(`
      SELECT COALESCE(SUM(
        CASE WHEN s.modalidad = 'anual' THEN pc.precio * 0.9
             ELSE pc.precio
        END
      ), 0)::float AS mrr
      FROM suscripciones s
      LEFT JOIN plan_configuracion pc ON pc.clave = s.plan::text AND pc.activo = true
      WHERE s.estado = 'activa'
    `);
    const mrr = Number(mrrRows[0]?.mrr ?? 0);

    return { totales, activas, enPrueba, mrr, porPlan: rows };
  }

  // ── Cron: procesar vencimientos (diario 00:10 UTC) ───────────────────────

  @Cron('10 0 * * *')
  async procesarVencimientosPrueba() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    // 1. Suscripciones en PRUEBA cuya fechaFinPrueba ya pasó → SUSPENDIDA
    const vencidas = await this.repo.find({
      where: { estado: SuscripcionEstado.PRUEBA, fechaFinPrueba: LessThan(hoy) },
    });
    for (const s of vencidas) {
      await this.repo.update(s.id, {
        estado: SuscripcionEstado.SUSPENDIDA,
        motivoSuspension: 'PRUEBA_VENCIDA',
      });
      this.notificarVencimientoPrueba(s.empresaId, s.plan).catch(() => null);
    }
    if (vencidas.length > 0)
      this.logger.warn(`${vencidas.length} pruebas vencidas → SUSPENDIDA`);

    // 2. Suscripciones ACTIVAS cuya fechaVencimiento ya pasó y aún no entraron en gracia
    //    → activar período de gracia de 5 días
    const hoyStr = hoy.toISOString().slice(0, 10);
    const finGracia = new Date(hoy);
    finGracia.setDate(finGracia.getDate() + 5);
    const finGraciaStr = finGracia.toISOString().slice(0, 10);

    const vencidasPago = await this.ds.query<{ id: number; empresaId: number; plan: string }[]>(`
      SELECT id, "empresaId", plan FROM suscripciones
      WHERE estado = 'activa'
        AND "fechaVencimiento" < $1
        AND "enPeriodoGracia" = false
    `, [hoyStr]);

    for (const s of vencidasPago) {
      await this.ds.query(`
        UPDATE suscripciones
        SET "enPeriodoGracia" = true,
            "fechaFinGracia"  = $1,
            "recordatorio1dGraciaEnviado" = false,
            "updatedAt"       = NOW()
        WHERE id = $2
      `, [finGraciaStr, s.id]);
      this.notificarInicioGracia(s.empresaId, s.plan as PlanTipo, finGracia).catch(() => null);
    }
    if (vencidasPago.length > 0)
      this.logger.warn(`${vencidasPago.length} suscripciones → período de gracia (5 días hasta ${finGraciaStr})`);
  }

  // ── Cron: recordatorios de vencimiento (8 AM hora RD = 12:00 UTC) ─────────

  @Cron('0 12 * * *')
  async enviarRecordatoriosPrueba() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    const en5Dias = new Date(hoy); en5Dias.setDate(en5Dias.getDate() + 5);
    const en1Dia  = new Date(hoy); en1Dia.setDate(en1Dia.getDate() + 1);

    // Recordatorio 5 días — buscar por SQL para evitar problemas de tipo con Date
    const por5d = await this.ds.query<{ id: number }[]>(`
      SELECT id FROM suscripciones
       WHERE estado = 'prueba'
         AND "fechaFinPrueba"::date = $1::date
         AND "recordatorio5dEnviado" = false
    `, [en5Dias.toISOString().slice(0, 10)]);
    for (const row of por5d) {
      const s = await this.repo.findOne({ where: { id: row.id } });
      if (s) { await this.enviarRecordatorio(s, 5); await this.repo.update(s.id, { recordatorio5dEnviado: true }); }
    }

    // Recordatorio 1 día (trial)
    const por1d = await this.ds.query<{ id: number }[]>(`
      SELECT id FROM suscripciones
       WHERE estado = 'prueba'
         AND "fechaFinPrueba"::date = $1::date
         AND "recordatorio1dEnviado" = false
    `, [en1Dia.toISOString().slice(0, 10)]);
    for (const row of por1d) {
      const s = await this.repo.findOne({ where: { id: (row as any).id } });
      if (s) { await this.enviarRecordatorio(s, 1); await this.repo.update(s.id, { recordatorio1dEnviado: true }); }
    }

    // Recordatorio 1 día restante en período de gracia
    const graciaVenceMañana = await this.ds.query<{ id: number; empresaId: number; plan: string }[]>(`
      SELECT id, "empresaId", plan FROM suscripciones
       WHERE "enPeriodoGracia" = true
         AND "fechaFinGracia"::date = $1::date
         AND "recordatorio1dGraciaEnviado" = false
    `, [en1Dia.toISOString().slice(0, 10)]);
    for (const row of graciaVenceMañana) {
      await this.notificarGracia1DiaRestante(row.empresaId, row.plan as PlanTipo).catch(() => null);
      await this.ds.query(
        `UPDATE suscripciones SET "recordatorio1dGraciaEnviado" = true WHERE id = $1`,
        [row.id],
      );
    }

    const total = por5d.length + por1d.length + graciaVenceMañana.length;
    if (total > 0)
      this.logger.log(`Recordatorios enviados: ${por5d.length} (5d prueba) + ${por1d.length} (1d prueba) + ${graciaVenceMañana.length} (1d gracia)`);
  }

  private async enviarRecordatorio(s: Suscripcion, dias: number): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [s.empresaId]);
      if (!admin.length) return;

      const planNombre = PLANES[s.plan]?.nombre ?? s.plan;
      const fechaFin   = new Date(s.fechaFinPrueba!).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
      const urgente    = dias === 1;

      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: urgente
          ? `⚠️ Tu prueba de HiCloud ERP vence MAÑANA`
          : `Tu período de prueba de HiCloud ERP vence en ${dias} días`,
        html: `
          <p>Hola ${admin[0].nombre},</p>
          <p>Tu período de prueba del plan <strong>${planNombre}</strong> vence el <strong>${fechaFin}</strong>.</p>
          <p>Para continuar usando HiCloud ERP sin interrupciones, solicita la activación de tu licencia antes de esa fecha.</p>
          <p>Una vez venza el período, tu cuenta quedará suspendida hasta que un asesor de HiCloud confirme el pago y active tu plan.</p>
          <p>¿Tienes dudas? Escríbenos a <a href="mailto:soporte@hicloudrd.com">soporte@hicloudrd.com</a></p>
        `,
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar recordatorio empresa #${s.empresaId}: ${(err as Error).message}`);
    }
  }

  private async notificarInicioGracia(empresaId: number, plan: PlanTipo, fechaFinGracia: Date): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin.length) return;

      const planNombre = PLANES[plan]?.nombre ?? plan;
      const fechaStr   = fechaFinGracia.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: `⏳ Tu suscripción HiCloud venció — 5 días de gracia para pagar`,
        html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">⏳ Período de gracia activado</h2></div>
  <div class="body">
    <p>Hola <strong>${admin[0].nombre}</strong>,</p>
    <p>Tu suscripción al plan <strong>${planNombre}</strong> ha vencido. Sin embargo, hemos activado un <strong>período de gracia de 5 días</strong> para que puedas realizar tu pago sin interrupciones.</p>
    <p><strong>Fecha límite de pago:</strong> ${fechaStr}</p>
    <p>Si no realizas el pago antes de esa fecha, tu cuenta quedará <strong>suspendida automáticamente</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/configuracion" class="btn">Realizar pago ahora →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Tienes preguntas? soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`,
      });
    } catch (err) {
      this.logger.warn(`notificarInicioGracia empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  private async notificarGracia1DiaRestante(empresaId: number, plan: PlanTipo): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin.length) return;

      const planNombre  = PLANES[plan]?.nombre ?? plan;
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: `🚨 Tu período de gracia HiCloud vence MAÑANA — paga hoy`,
        html: `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">🚨 ¡Último día de gracia!</h2></div>
  <div class="body">
    <p>Hola <strong>${admin[0].nombre}</strong>,</p>
    <p>Tu período de gracia del plan <strong>${planNombre}</strong> <strong>vence mañana</strong>.</p>
    <p>Si no realizas el pago hoy, tu cuenta quedará <strong>suspendida automáticamente</strong> y no podrás acceder al sistema.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/configuracion" class="btn">Pagar ahora →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Urgente? soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`,
      });
    } catch (err) {
      this.logger.warn(`notificarGracia1DiaRestante empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  private async notificarVencimientoPrueba(empresaId: number, plan: PlanTipo): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin.length) return;

      const planNombre = PLANES[plan]?.nombre ?? plan;
      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: 'Tu período de prueba ha vencido — Activa tu licencia',
        html: `
          <p>Hola ${admin[0].nombre},</p>
          <p>Tu período de prueba del plan <strong>${planNombre}</strong> ha vencido.</p>
          <p>Tu cuenta está actualmente suspendida. Para reactivarla, solicita la activación de tu licencia a través del sistema.</p>
          <p>Un asesor te contactará en menos de 24 horas. Tus datos están seguros y conservados.</p>
          <p>¿Tienes urgencia? Escríbenos a <a href="mailto:soporte@hicloudrd.com">soporte@hicloudrd.com</a></p>
        `,
      });
    } catch (err) {
      this.logger.warn(`notificarVencimientoPrueba empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  // ── Gestión de solicitudes (Super Admin) ──────────────────────────────────

  async listarSolicitudes(estado?: EstadoSolicitud) {
    const where = estado ? { estado } : {};
    const solicitudes = await this.solicitudRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    // Enriquecer con datos de empresa
    const empresaIds = Array.from(new Set(solicitudes.map(s => s.empresaId)));
    const empresas   = empresaIds.length > 0
      ? await this.ds.query<{ id: number; nombre: string; rnc: string }[]>(
          `SELECT id, nombre, rnc FROM empresa WHERE id = ANY($1)`, [empresaIds],
        )
      : [];
    const empresaMap = Object.fromEntries(empresas.map(e => [e.id, e]));

    const suscripciones = empresaIds.length > 0
      ? await this.repo.find({ where: { empresaId: In(empresaIds) } })
      : [];
    const suscMap = Object.fromEntries(suscripciones.map(s => [s.empresaId, s]));

    return solicitudes.map(s => ({
      ...s,
      empresa:     empresaMap[s.empresaId] ?? null,
      suscripcion: suscMap[s.empresaId] ?? null,
    }));
  }

  async contarSolicitudesPendientes(): Promise<number> {
    return this.solicitudRepo.count({ where: { estado: EstadoSolicitud.PENDIENTE } });
  }

  async aprobarSolicitud(
    solicitudId: number,
    superAdminId: number,
    notaInterna?: string,
  ) {
    const solicitud = await this.solicitudRepo.findOne({ where: { id: solicitudId } });
    if (!solicitud) throw new NotFoundException(`Solicitud #${solicitudId} no encontrada`);
    if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
      throw new BadRequestException('Esta solicitud ya fue procesada');
    }

    const plan      = solicitud.planSolicitado as PlanTipo;
    const modalidad = solicitud.modalidad === 'anual'
      ? ModalidadPago.ANUAL : ModalidadPago.MENSUAL;

    // Activar el plan
    await this.activarPlan(solicitud.empresaId, plan, 1, notaInterna, modalidad);

    // Actualizar solicitud — SQL raw para evitar FK con superAdminId=0
    await this.ds.query(
      `UPDATE solicitud_cambio_plan
       SET estado = 'aprobada', "superAdminId" = $1, "updatedAt" = NOW()
       WHERE id = $2`,
      [superAdminId ?? null, solicitudId],
    );

    // Auditoría (no-fatal — un fallo aquí no debe revertir la aprobación)
    const s2 = await this.repo.findOne({ where: { empresaId: solicitud.empresaId } });
    if (s2) {
      this.auditoriaRepo.save(this.auditoriaRepo.create({
        suscripcionId: s2.id,
        empresaId:     solicitud.empresaId,
        accion:        AccionAuditoria.SOLICITUD_APROBADA,
        superAdminId,
        motivo:        notaInterna,
        valorNuevo:    { plan, modalidad },
      })).catch(e => this.logger.warn(`Auditoría aprobar #${solicitudId}: ${(e as Error).message}`));
    }

    // Email al cliente
    this.notificarActivacionPlan(solicitud.empresaId, plan, modalidad).catch(() => null);

    // Email al super admin con confirmación
    this.logger.log(`Solicitud #${solicitudId} aprobada por super admin #${superAdminId}`);
    return { message: `Plan ${plan} activado para empresa #${solicitud.empresaId}` };
  }

  async rechazarSolicitud(
    solicitudId: number,
    superAdminId: number,
    motivoRechazo: string,
  ) {
    const solicitud = await this.solicitudRepo.findOne({ where: { id: solicitudId } });
    if (!solicitud) throw new NotFoundException(`Solicitud #${solicitudId} no encontrada`);
    if (solicitud.estado !== EstadoSolicitud.PENDIENTE) {
      throw new BadRequestException('Esta solicitud ya fue procesada');
    }

    await this.ds.query(
      `UPDATE solicitud_cambio_plan
       SET estado = 'rechazada', "superAdminId" = $1, "motivoRechazo" = $2, "updatedAt" = NOW()
       WHERE id = $3`,
      [superAdminId ?? null, motivoRechazo, solicitudId],
    );

    const s3 = await this.repo.findOne({ where: { empresaId: solicitud.empresaId } });
    if (s3) {
      this.auditoriaRepo.save(this.auditoriaRepo.create({
        suscripcionId: s3.id,
        empresaId:     solicitud.empresaId,
        accion:        AccionAuditoria.SOLICITUD_RECHAZADA,
        superAdminId,
        motivo:        motivoRechazo,
      })).catch(e => this.logger.warn(`Auditoría rechazar #${solicitudId}: ${(e as Error).message}`));
    }

    // Notificar al cliente sobre el rechazo (no-bloqueante)
    this.notificarRechazoSolicitud(solicitud.empresaId, solicitud.planSolicitado, motivoRechazo)
      .catch(e => this.logger.warn(`Email rechazo solicitud #${solicitudId}: ${(e as Error).message}`));

    this.logger.log(`Solicitud #${solicitudId} rechazada por super admin #${superAdminId}`);
    return { message: 'Solicitud rechazada' };
  }

  async listarEmpresasEnPrueba() {
    const pruebas = await this.repo.find({
      where: { estado: SuscripcionEstado.PRUEBA },
      order: { fechaFinPrueba: 'ASC' },
    });

    const empresaIds = pruebas.map(s => s.empresaId);
    const empresas   = empresaIds.length > 0
      ? await this.ds.query<{ id: number; nombre: string; rnc: string }[]>(
          `SELECT id, nombre, rnc FROM empresa WHERE id = ANY($1)`, [empresaIds],
        )
      : [];
    const empresaMap = Object.fromEntries(empresas.map(e => [e.id, e]));

    const hoy = new Date();
    return pruebas.map(s => {
      const finPrueba   = s.fechaFinPrueba ? new Date(s.fechaFinPrueba) : new Date(s.fechaVencimiento);
      const diasRestantes = Math.max(0, Math.ceil((finPrueba.getTime() - hoy.getTime()) / 86_400_000));
      return {
        ...s,
        empresa:      empresaMap[s.empresaId] ?? null,
        diasRestantes,
        planNombre:   PLANES[s.plan]?.nombre ?? s.plan,
      };
    });
  }

  async extenderPrueba(empresaId: number, diasExtension: number, superAdminId: number) {
    const s = await this.repo.findOne({ where: { empresaId } });
    if (!s) throw new NotFoundException(`Empresa #${empresaId} no tiene suscripción`);

    const fechaBase = s.fechaFinPrueba
      ? new Date(s.fechaFinPrueba) : new Date(s.fechaVencimiento);
    const nuevaFecha = new Date(fechaBase);
    nuevaFecha.setDate(nuevaFecha.getDate() + diasExtension);

    await this.repo.update(s.id, {
      fechaFinPrueba: nuevaFecha,
      estado:         SuscripcionEstado.PRUEBA,
    } as any);

    // Auditoría (no-fatal)
    this.auditoriaRepo.save(this.auditoriaRepo.create({
      suscripcionId: s.id,
      empresaId,
      accion:        AccionAuditoria.EXTENSION_TRIAL,
      superAdminId,
      motivo:        `Extensión de ${diasExtension} días`,
      valorNuevo:    { nuevaFecha, diasExtension },
    })).catch(e => this.logger.warn(`Auditoría extender empresa #${empresaId}: ${(e as Error).message}`));

    this.logger.log(`Prueba empresa #${empresaId} extendida ${diasExtension}d por SA#${superAdminId}`);
    return this.getSuscripcion(empresaId);
  }

  // ── Notificar activación al cliente ───────────────────────────────────────

  private async notificarActivacionPlan(
    empresaId: number,
    plan: PlanTipo,
    modalidad: ModalidadPago,
  ): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin.length) return;

      const planNombre = PLANES[plan]?.nombre ?? plan;
      const cfgRows = await this.planConfigRepo.find({ where: { clave: plan } });
      const precioDop = cfgRows[0] ? Number(cfgRows[0].precio) : 0;
      const precioStr = precioDop > 0
        ? (modalidad === 'anual'
          ? `RD$${Math.round(precioDop * 0.9).toLocaleString('es-DO')}/mes (anual, 10% desc.)`
          : `RD$${precioDop.toLocaleString('es-DO')}/mes`)
        : '';
      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: `¡Tu plan ${planNombre} ha sido activado! — HiCloud ERP`,
        html: `
          <p>Hola ${admin[0].nombre},</p>
          <p>¡Excelentes noticias! Tu plan <strong>${planNombre}</strong>${precioStr ? ` (${precioStr})` : ''} ha sido activado en HiCloud ERP.</p>
          <p>Ya puedes continuar usando todos los módulos sin interrupciones.</p>
          <p>Gracias por confiar en HiCloud ERP para tu negocio.</p>
        `,
      });
    } catch (err) {
      this.logger.warn(`notificarActivacionPlan empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  // ── Notificar rechazo de solicitud al cliente ─────────────────────────────

  private async notificarRechazoSolicitud(
    empresaId: number,
    planSolicitado: string,
    motivoRechazo: string,
  ): Promise<void> {
    try {
      const admin = await this.ds.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin.length) return;

      const planNombre = PLANES[planSolicitado as PlanTipo]?.nombre ?? planSolicitado;
      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: `Actualización sobre tu solicitud de plan ${planNombre} — HiCloud ERP`,
        html: `
          <p>Hola ${admin[0].nombre},</p>
          <p>Hemos revisado tu solicitud de activación del plan <strong>${planNombre}</strong>.</p>
          <p>En este momento no hemos podido procesarla por el siguiente motivo:</p>
          <blockquote style="border-left:4px solid #ef4444;padding:8px 16px;background:#fef2f2;color:#991b1b;">
            ${motivoRechazo}
          </blockquote>
          <p>Si tienes dudas o deseas más información, contáctanos en <a href="mailto:soporte@hicloudrd.com">soporte@hicloudrd.com</a>.</p>
          <p>Puedes hacer una nueva solicitud desde tu panel en cualquier momento.</p>
        `,
      });
    } catch (err) {
      this.logger.warn(`notificarRechazoSolicitud empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  // ── Notificar al super admin sobre nueva solicitud ────────────────────────

  async notificarSuperAdminNuevaSolicitud(
    solicitudId: number,
    empresaId: number,
    planSolicitado: string,
    comentario?: string,
  ): Promise<void> {
    try {
      // Datos de la empresa
      const [empresa] = await this.ds.query<{ nombre: string; rnc: string }[]>(
        `SELECT nombre, rnc FROM empresa WHERE id = $1`, [empresaId],
      );
      // Email del super admin
      const [sa] = await this.ds.query<{ email: string }[]>(
        `SELECT email FROM users WHERE role = 'super_admin' AND "isActive" = true LIMIT 1`,
      );
      if (!sa) return;

      const planNombre = PLANES[planSolicitado as PlanTipo]?.nombre ?? planSolicitado;
      const cfgRows2   = await this.planConfigRepo.find({ where: { clave: planSolicitado } });
      const precioMes  = cfgRows2[0] ? Number(cfgRows2[0].precio) : 0;
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailSvc.enviar({
        to: sa.email,
        subject: `Nueva solicitud de activación — ${empresa?.nombre ?? `Empresa #${empresaId}`}`,
        html: `
          <p>Una empresa ha solicitado la activación de su licencia:</p>
          <ul>
            <li><strong>Empresa:</strong> ${empresa?.nombre ?? `#${empresaId}`}</li>
            <li><strong>RNC:</strong> ${empresa?.rnc ?? '—'}</li>
            <li><strong>Plan solicitado:</strong> ${planNombre}${precioMes > 0 ? ` (RD$${precioMes.toLocaleString('es-DO')}/mes)` : ''}</li>
            ${comentario ? `<li><strong>Comentario:</strong> ${comentario}</li>` : ''}
          </ul>
          <p><a href="${frontendUrl}/super-admin">Ver solicitud en el panel →</a></p>
        `,
      });
    } catch (err) {
      this.logger.warn(`notificarSuperAdminNuevaSolicitud empresa #${empresaId}: ${(err as Error).message}`);
    }
  }

  // ── Catálogo de planes ────────────────────────────────────────────────────

  async getPlanesCatalogo() {
    await this.seedPlanConfiguracion();

    const configs = await this.planConfigRepo.find({
      where: { activo: true },
      order: { createdAt: 'ASC' },
    });
    const configMap = Object.fromEntries(configs.map(c => [c.clave, c]));

    return PLANES_ACTIVOS.map((clave) => {
      const def = PLANES[clave];
      const cfg = configMap[clave];
      return {
        clave,
        nombre:              cfg?.nombre ?? def.nombre,
        precioMensual:       Number(cfg?.precio ?? def.precio),
        limiteIngresosDop:   def.limiteIngresosMensualesDop,
        limiteUsuarios:      def.limiteUsuarios,
        diasPrueba:          15,
        modulos:             def.modulos,
        soporte:             def.soporte,
      };
    });
  }

  async updatePlanConfig(clave: string, dto: { nombre?: string; precio?: number; descripcion?: string }) {
    await this.seedPlanConfiguracion();
    const exists = await this.planConfigRepo.findOne({ where: { clave } });
    if (!exists) {
      const def = PLANES[clave as PlanTipo];
      if (!def) throw new Error(`Plan "${clave}" no existe`);
      await this.planConfigRepo.save(
        this.planConfigRepo.create({ clave, nombre: def.nombre, precio: def.precio, activo: true }),
      );
    }
    await this.planConfigRepo.update({ clave }, {
      ...(dto.nombre      !== undefined && { nombre:      dto.nombre }),
      ...(dto.precio      !== undefined && { precio:      dto.precio }),
      ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
    });
    return this.planConfigRepo.findOne({ where: { clave } });
  }

  private async seedPlanConfiguracion() {
    const count = await this.planConfigRepo.count({ where: { activo: true } });
    if (count >= 4) return;

    for (const clave of PLANES_ACTIVOS) {
      const def    = PLANES[clave];
      const existe = await this.planConfigRepo.findOne({ where: { clave } });
      if (!existe) {
        await this.planConfigRepo.save(
          this.planConfigRepo.create({ clave, nombre: def.nombre, precio: def.precio, activo: true }),
        );
      } else if (!existe.activo) {
        await this.planConfigRepo.update({ clave }, { activo: true });
      }
    }
  }
}
