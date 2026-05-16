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

/** Precio USD por modalidad */
function precioUsd(plan: PlanTipo, modalidad: string): string {
  const cfg = PLANES[plan];
  if (!cfg) return 'N/A';
  const base = cfg.precioMensualUsd;
  const anual = cfg.precioAnualUsd;
  if (modalidad === 'anual') return `US$${(anual / 12).toFixed(2)}/mes (anual)`;
  return `US$${base}/mes`;
}

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
    // Planes nuevos al enum de PLAN (solo valores de plan, no de estado)
    const nuevosPlanes = ['emprendedor', 'pyme', 'pro', 'plus'];
    for (const val of nuevosPlanes) {
      await this.ds.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'suscripciones_plan_enum' AND e.enumlabel = '${val}'
          ) THEN ALTER TYPE suscripciones_plan_enum ADD VALUE '${val}'; END IF;
        END $$;
      `).catch(() => null);
    }
    // Estado 'prueba' al enum de ESTADO (solo)
    await this.ds.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'suscripciones_estado_enum' AND e.enumlabel = 'prueba'
        ) THEN ALTER TYPE suscripciones_estado_enum ADD VALUE 'prueba'; END IF;
      END $$;
    `).catch(() => null);

    await this.seedPlanConfiguracion();
  }

  // ── Obtener suscripción ───────────────────────────────────────────────────

  async getSuscripcion(empresaId = 1): Promise<Suscripcion & { info: typeof PLAN_LIMITES[PlanTipo]; diasRestantes: number }> {
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
      }));
    }
    const hoy = new Date();
    const fechaRef = s.fechaFinPrueba
      ? new Date(s.fechaFinPrueba)
      : new Date(s.fechaVencimiento);
    const diasRestantes = Math.max(0, Math.ceil((fechaRef.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));
    return { ...s, info: PLAN_LIMITES[s.plan] ?? PLAN_LIMITES[PlanTipo.EMPRENDEDOR], diasRestantes };
  }

  // ── Activar plan (por super admin) ────────────────────────────────────────

  async activarPlan(
    empresaId: number,
    plan: PlanTipo,
    meses: number,
    notas?: string,
    modalidad: ModalidadPago = ModalidadPago.MENSUAL,
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
             "fechaInicio" = $3, "fechaVencimiento" = $4, "notasAdmin" = $5,
             "updatedAt" = NOW()
         WHERE id = $6`,
        [plan, modalidad, inicio.toISOString(), fin.toISOString(), notas ?? null, s.id],
      );
    } else {
      await this.ds.query(
        `INSERT INTO suscripciones
           ("empresaId", plan, estado, modalidad, "fechaInicio", "fechaVencimiento",
            "notasAdmin", "fechaFinPrueba", "recordatorio5dEnviado", "recordatorio1dEnviado",
            "facturasMesUsadas", "facturasMesReset", "enPeriodoGracia", "createdAt", "updatedAt")
         VALUES ($1,$2,'activa',$3,$4,$5,$6,NULL,false,false,0,0,false,NOW(),NOW())`,
        [empresaId, plan, modalidad, inicio.toISOString(), fin.toISOString(), notas ?? null],
      );
    }
    this.logger.log(`Plan ${plan} activado para empresa #${empresaId}`);
    return this.getSuscripcion(empresaId);
  }

  async suspender(empresaId: number, motivo?: string) {
    const s = await this.repo.findOne({ where: { empresaId } });
    if (s) {
      await this.repo.update(s.id, {
        estado: SuscripcionEstado.SUSPENDIDA,
        motivoSuspension: motivo ?? 'SUSPENSION_MANUAL',
      });
    }
    return this.getSuscripcion(empresaId);
  }

  async listarTodasLasSuscripciones() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    const hoy  = new Date();
    return rows.map(s => ({
      ...s,
      info: PLAN_LIMITES[s.plan] ?? PLAN_LIMITES[PlanTipo.EMPRENDEDOR],
      diasRestantes: Math.max(0,
        Math.ceil((new Date(s.fechaFinPrueba ?? s.fechaVencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
      ),
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

    // MRR USD estimado
    const suscActivas = await this.repo.find({ where: { estado: SuscripcionEstado.ACTIVA } });
    const mrr = suscActivas.reduce((acc, s) => {
      const precio = PLANES[s.plan]?.precioMensualUsd ?? 0;
      return acc + (s.modalidad === ModalidadPago.ANUAL ? precio * 0.9 : precio);
    }, 0);

    return { totales, activas, enPrueba, mrr, porPlan: rows };
  }

  // ── Cron: procesar vencimientos de prueba (diario 00:10 UTC) ─────────────

  @Cron('10 0 * * *')
  async procesarVencimientosPrueba() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    // Suscripciones en PRUEBA cuya fechaFinPrueba ya pasó
    const vencidas = await this.repo.find({
      where: { estado: SuscripcionEstado.PRUEBA, fechaFinPrueba: LessThan(hoy) },
    });

    for (const s of vencidas) {
      await this.repo.update(s.id, {
        estado: SuscripcionEstado.SUSPENDIDA,
        motivoSuspension: 'PRUEBA_VENCIDA',
      });
      // Notificar al admin de la empresa por email (lazy import para evitar dep circular)
      this.notificarVencimientoPrueba(s.empresaId, s.plan).catch(() => null);
    }

    // También marcar ACTIVAS vencidas como VENCIDA (legado)
    await this.repo.update(
      { estado: SuscripcionEstado.ACTIVA, fechaVencimiento: LessThan(hoy) },
      { estado: SuscripcionEstado.VENCIDA },
    );

    if (vencidas.length > 0)
      this.logger.warn(`${vencidas.length} pruebas vencidas → SUSPENDIDA`);
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

    // Recordatorio 1 día
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

    if (por5d.length + por1d.length > 0)
      this.logger.log(`Recordatorios enviados: ${por5d.length} (5d) + ${por1d.length} (1d)`);
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
    } catch { /* silencioso */ }
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
      const precio     = precioUsd(plan, modalidad);
      await this.emailSvc.enviar({
        to: admin[0].email,
        subject: `¡Tu plan ${planNombre} ha sido activado! — HiCloud ERP`,
        html: `
          <p>Hola ${admin[0].nombre},</p>
          <p>¡Excelentes noticias! Tu plan <strong>${planNombre}</strong> (${precio}) ha sido activado en HiCloud ERP.</p>
          <p>Ya puedes continuar usando todos los módulos sin interrupciones.</p>
          <p>Gracias por confiar en HiCloud ERP para tu negocio.</p>
        `,
      });
    } catch { /* silencioso */ }
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
      const precioMes  = PLANES[planSolicitado as PlanTipo]?.precioMensualUsd ?? 0;
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailSvc.enviar({
        to: sa.email,
        subject: `Nueva solicitud de activación — ${empresa?.nombre ?? `Empresa #${empresaId}`}`,
        html: `
          <p>Una empresa ha solicitado la activación de su licencia:</p>
          <ul>
            <li><strong>Empresa:</strong> ${empresa?.nombre ?? `#${empresaId}`}</li>
            <li><strong>RNC:</strong> ${empresa?.rnc ?? '—'}</li>
            <li><strong>Plan solicitado:</strong> ${planNombre} (US$${precioMes}/mes)</li>
            ${comentario ? `<li><strong>Comentario:</strong> ${comentario}</li>` : ''}
          </ul>
          <p><a href="${frontendUrl}/super-admin">Ver solicitud en el panel →</a></p>
        `,
      });
    } catch { /* silencioso */ }
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
        nombre:              cfg?.nombre   ?? def.nombre,
        precioMensualUsd:    def.precioMensualUsd,
        precioAnualUsd:      def.precioAnualUsd,
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
