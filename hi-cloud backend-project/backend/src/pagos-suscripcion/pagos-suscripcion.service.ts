import * as fs   from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  Injectable, Logger, NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { S3Service }           from '../common/s3/s3.service';
import { EmailService }        from '../notificaciones/services/email.service';
import { TenantService }       from '../tenant/tenant.service';
import { PagoSuscripcion, TipoPago, EstadoPago } from './entities/pago-suscripcion.entity';
import { ConfiguracionBancaria }                  from './entities/configuracion-bancaria.entity';
import {
  RegistrarPagoDto, ConfirmarPagoDto, RechazarPagoDto,
  AgregarCargoDto, AplicarCreditoDto, UpdateConfiguracionBancariaDto,
} from './dto/pagos-suscripcion.dto';

const USD_PRICES: Record<string, number> = {
  emprendedor: 29, pyme: 59, pro: 89, plus: 129,
};

@Injectable()
export class PagosSuscripcionService {
  private readonly logger = new Logger(PagosSuscripcionService.name);

  constructor(
    @InjectRepository(PagoSuscripcion)
    private pagoRepo: Repository<PagoSuscripcion>,
    @InjectRepository(ConfiguracionBancaria)
    private bancoRepo: Repository<ConfiguracionBancaria>,
    private ds:         DataSource,
    private s3:         S3Service,
    private emailSvc:   EmailService,
    private tenantSvc:  TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // CLIENTE — Mi suscripción y pagos
  // ──────────────────────────────────────────────────────────────────────────

  async getMiResumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [sus] = await this.ds.query<any[]>(`
      SELECT s.*, e.nombre AS "empresaNombre", e.email AS "empresaEmail"
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."empresaId" = $1
    `, [empresaId]);

    if (!sus) throw new NotFoundException('Suscripción no encontrada');

    const hoy = new Date();
    const fechaVence = new Date(sus.fechaFinPrueba ?? sus.fechaVencimiento);
    const diasRestantes = Math.max(0,
      Math.ceil((fechaVence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    );
    const diasTotales = Math.ceil(
      (fechaVence.getTime() - new Date(sus.fechaInicio).getTime()) / (1000 * 60 * 60 * 24)
    );

    const precioMensual = USD_PRICES[sus.plan] ?? 0;
    const saldoPendiente = await this.getSaldoPendiente(empresaId);

    return {
      plan:           sus.plan,
      estado:         sus.estado,
      modalidad:      sus.modalidad ?? 'mensual',
      precioMensualUsd: precioMensual,
      fechaInicio:    sus.fechaInicio,
      fechaVencimiento: sus.fechaFinPrueba ?? sus.fechaVencimiento,
      diasRestantes,
      diasTotales:    Math.max(diasTotales, diasRestantes),
      porcentajeUsado: diasTotales > 0
        ? Math.max(0, Math.min(100, Math.round(((diasTotales - diasRestantes) / diasTotales) * 100)))
        : 0,
      saldoPendienteUsd: saldoPendiente,
    };
  }

  async getHistorialCliente() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.pagoRepo.find({
      where:  { empresaId },
      order:  { creadoEn: 'DESC' },
    });
    // TypeORM con pg devuelve numeric como string — normalizar
    return rows.map(r => ({ ...r, montoUsd: Number(r.montoUsd ?? 0) }));
  }

  async getSaldoPendiente(empresaId: number): Promise<number> {
    const rows = await this.ds.query<{ saldo: string }[]>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN tipo = 'CARGO'
            THEN  "montoUsd"
          WHEN tipo IN ('TRANSFERENCIA','TARJETA','MANUAL','CREDITO')
               AND estado = 'CONFIRMADO'
            THEN -"montoUsd"
          ELSE 0
        END
      ), 0)::float AS saldo
      FROM pagos_suscripcion
      WHERE "empresaId" = $1
        AND estado != 'RECHAZADO'
    `, [empresaId]);
    return Number(rows[0]?.saldo ?? 0);
  }

  async getConfiguracionBancaria() {
    const cfg = await this.bancoRepo.findOne({ where: { activo: true }, order: { id: 'DESC' } });
    return cfg ?? null;
  }

  /**
   * Cliente sube comprobante de transferencia bancaria.
   * Crea registro PENDIENTE → super admin confirma o rechaza.
   */
  async subirComprobante(
    file:     { buffer: Buffer; originalname: string; mimetype: string; size: number },
    montoUsd: number,
    referencia?: string,
    banco?:      string,
    notas?:      string,
  ) {
    const empresaId = this.tenantSvc.getEmpresaId();

    let comprobanteUrl: string | null = null;
    if (this.s3.isEnabled) {
      comprobanteUrl = await this.s3.upload(
        file.buffer,
        file.originalname,
        file.mimetype,
        'comprobantes',
        empresaId,
      );
    } else {
      // Fallback: disco local → Nginx sirve /uploads/comprobantes/ como estático
      const ext      = path.extname(file.originalname).toLowerCase() || '.bin';
      const filename = `${randomUUID()}${ext}`;
      const uploadDir = '/var/www/hicloudrd.com/html/uploads/comprobantes';
      const filePath  = path.join(uploadDir, filename);
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(filePath, file.buffer);
        comprobanteUrl = `https://hicloudrd.com/uploads/comprobantes/${filename}`;
        this.logger.log(`Comprobante guardado localmente: ${filePath}`);
      } catch (e: any) {
        this.logger.error(`Error guardando comprobante local: ${e?.message}`);
      }
    }

    const pago = this.pagoRepo.create({
      empresaId,
      tipo:          TipoPago.TRANSFERENCIA,
      concepto:      `Pago por transferencia bancaria${banco ? ` — ${banco}` : ''}`,
      montoUsd,
      estado:        EstadoPago.PENDIENTE,
      comprobanteUrl,
      referencia:    referencia ?? null,
      notas:         notas ?? null,
    });
    const saved = await this.pagoRepo.save(pago);

    // Notificar super admin
    await this.notificarSuperAdminComprobante(saved, empresaId).catch(e =>
      this.logger.warn(`Email comprobante: ${e?.message}`)
    );

    return saved;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUPER ADMIN — Gestión de cobros
  // ──────────────────────────────────────────────────────────────────────────

  async listarPagosAdmin(estado?: string) {
    const where = estado ? `WHERE p.estado = $1` : '';
    const params = estado ? [estado] : [];

    const rows = await this.ds.query<any[]>(`
      SELECT p.*,
             e.nombre AS "empresaNombre", e.rnc,
             s.plan, s.estado AS "estadoSuscripcion",
             s."fechaVencimiento"::date AS "venceSuscripcion"
      FROM pagos_suscripcion p
      JOIN empresa e     ON e.id = p."empresaId"
      LEFT JOIN suscripciones s ON s."empresaId" = p."empresaId"
      ${where}
      ORDER BY p."creadoEn" DESC
      LIMIT 200
    `, params);
    // PostgreSQL devuelve numeric como string — normalizar a JS number
    return rows.map(r => ({ ...r, montoUsd: Number(r.montoUsd ?? 0) }));
  }

  async listarComprobantesPeridentes() {
    const rows = await this.ds.query<any[]>(`
      SELECT p.*,
             e.nombre AS "empresaNombre", e.email AS "empresaEmail"
      FROM pagos_suscripcion p
      JOIN empresa e ON e.id = p."empresaId"
      WHERE p.tipo = 'TRANSFERENCIA' AND p.estado = 'PENDIENTE'
      ORDER BY p."creadoEn" DESC
    `);
    return rows.map(r => ({ ...r, montoUsd: Number(r.montoUsd ?? 0) }));
  }

  /** Resumen por empresa para el panel de cobros */
  async resumenCobros() {
    const rows = await this.ds.query<any[]>(`
      SELECT
        e.id AS "empresaId",
        e.nombre,
        e.email,
        s.plan,
        s.estado AS "estadoSuscripcion",
        s."fechaVencimiento"::date AS "venceSuscripcion",
        COALESCE(SUM(
          CASE
            WHEN p.tipo = 'CARGO'                                                        THEN  p."montoUsd"
            WHEN p.tipo IN ('TRANSFERENCIA','TARJETA','MANUAL') AND p.estado = 'CONFIRMADO' THEN -p."montoUsd"
            WHEN p.tipo = 'CREDITO'                             AND p.estado = 'CONFIRMADO' THEN -p."montoUsd"
            ELSE 0
          END
        ), 0)::float AS "saldoPendienteUsd",
        MAX(CASE WHEN p.estado = 'CONFIRMADO' THEN p."confirmadoEn" END) AS "ultimoPago",
        COUNT(CASE WHEN p.tipo = 'TRANSFERENCIA' AND p.estado = 'PENDIENTE' THEN 1 END)::int AS "pendientesConfirmacion"
      FROM empresa e
      LEFT JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN pagos_suscripcion p ON p."empresaId" = e.id AND p.estado != 'RECHAZADO'
      WHERE e."isActive" = true
      GROUP BY e.id, e.nombre, e.email, s.plan, s.estado, s."fechaVencimiento"
      ORDER BY "saldoPendienteUsd" DESC, e.nombre
    `);
    // Garantizar tipos JS correctos (PostgreSQL devuelve numeric/int como string vía ds.query)
    return rows.map(r => ({
      ...r,
      saldoPendienteUsd:      Number(r.saldoPendienteUsd      ?? 0),
      pendientesConfirmacion: Number(r.pendientesConfirmacion  ?? 0),
    }));
  }

  async registrarPago(empresaId: number, dto: RegistrarPagoDto, adminId: number) {
    // ── 1. Leer suscripción actual ──────────────────────────────────────────
    const [sus] = await this.ds.query<any[]>(`
      SELECT estado, modalidad, "fechaVencimiento"
      FROM suscripciones WHERE "empresaId" = $1
    `, [empresaId]);

    // ── 2. Calcular nueva fechaVencimiento (desde el vencimiento anterior) ──
    let nuevaFechaVenc: string | null = null;
    let periodoInicio = dto.periodoInicio ? new Date(dto.periodoInicio) : null;
    let periodoFin    = dto.periodoFin    ? new Date(dto.periodoFin)    : null;

    if (sus) {
      // DATE de PG llega como string 'YYYY-MM-DD'; si llega como Date → extraer parte fecha
      const fechaStr = typeof sus.fechaVencimiento === 'string'
        ? sus.fechaVencimiento.split('T')[0]
        : (sus.fechaVencimiento as Date).toISOString().split('T')[0];

      const [y, m, d] = fechaStr.split('-').map(Number);
      const modalidad  = sus.modalidad ?? 'mensual';

      let ny = y, nm = m;
      if (modalidad === 'anual') { ny += 1; }
      else { nm += 1; if (nm > 12) { nm = 1; ny += 1; } }
      // Overflow de fin de mes (ej. 31 ene + 1 mes → 28/29 feb)
      const nd = Math.min(d, new Date(ny, nm, 0).getDate());
      nuevaFechaVenc = `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;

      if (!periodoInicio) periodoInicio = new Date(fechaStr + 'T00:00:00');
      if (!periodoFin)    periodoFin    = new Date(nuevaFechaVenc + 'T00:00:00');
    }

    // ── 3. Registrar el pago ────────────────────────────────────────────────
    const pago = this.pagoRepo.create({
      empresaId,
      tipo:          dto.tipo,
      concepto:      dto.concepto,
      montoUsd:      dto.montoUsd,
      estado:        EstadoPago.CONFIRMADO,
      referencia:    dto.referencia ?? null,
      notas:         dto.notas ?? null,
      registradoPor: adminId,
      confirmadoPor: adminId,
      confirmadoEn:  new Date(),
      periodoInicio,
      periodoFin,
    });
    const saved = await this.pagoRepo.save(pago);

    // ── 4. Activar suscripción y extender fechaVencimiento ─────────────────
    if (sus && nuevaFechaVenc) {
      const fechaAnterior = typeof sus.fechaVencimiento === 'string'
        ? sus.fechaVencimiento.split('T')[0]
        : (sus.fechaVencimiento as Date).toISOString().split('T')[0];

      await this.ds.query(`
        UPDATE suscripciones
        SET estado = 'activa',
            "fechaVencimiento" = $1,
            "motivoSuspension" = NULL,
            "enPeriodoGracia" = false
        WHERE "empresaId" = $2
      `, [nuevaFechaVenc, empresaId]);

      this.logger.log(
        `[PAGO] Empresa #${empresaId} | Admin #${adminId} | ` +
        `US$${dto.montoUsd} (${dto.tipo}) | ${sus.modalidad ?? 'mensual'} | ` +
        `Vencimiento: ${fechaAnterior} → ${nuevaFechaVenc}`,
      );
    }

    // ── 5. Notificar a la empresa ───────────────────────────────────────────
    await this.notificarEmpresaPago(empresaId, saved).catch(e =>
      this.logger.warn(`Email pago registrado: ${e?.message}`)
    );

    return {
      ...saved,
      montoUsd:              Number(saved.montoUsd),
      nuevaFechaVencimiento: nuevaFechaVenc ?? null,
    };
  }

  async confirmarTransferencia(pagoId: number, adminId: number, dto: ConfirmarPagoDto) {
    const pago = await this.pagoRepo.findOne({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
    if (pago.tipo !== TipoPago.TRANSFERENCIA)
      throw new BadRequestException('Solo se pueden confirmar transferencias');
    if (pago.estado === EstadoPago.CONFIRMADO)
      throw new BadRequestException('Este pago ya fue confirmado');

    await this.pagoRepo.update(pagoId, {
      estado:        EstadoPago.CONFIRMADO,
      confirmadoPor: adminId,
      confirmadoEn:  new Date(),
      notas:         dto.notas ?? pago.notas,
    });

    // ── Activar suscripción y extender fechaVencimiento ─────────────────────
    const [sus] = await this.ds.query<any[]>(`
      SELECT estado, modalidad, "fechaVencimiento"
      FROM suscripciones WHERE "empresaId" = $1
    `, [pago.empresaId]);

    if (sus) {
      const fechaStr = typeof sus.fechaVencimiento === 'string'
        ? sus.fechaVencimiento.split('T')[0]
        : (sus.fechaVencimiento as Date).toISOString().split('T')[0];

      const [y, m, d] = fechaStr.split('-').map(Number);
      const modalidad  = sus.modalidad ?? 'mensual';
      let ny = y, nm = m;
      if (modalidad === 'anual') { ny += 1; }
      else { nm += 1; if (nm > 12) { nm = 1; ny += 1; } }
      const nd = Math.min(d, new Date(ny, nm, 0).getDate());
      const nuevaFecha = `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;

      await this.ds.query(`
        UPDATE suscripciones
        SET estado = 'activa',
            "fechaVencimiento" = $1,
            "motivoSuspension" = NULL,
            "enPeriodoGracia" = false
        WHERE "empresaId" = $2
      `, [nuevaFecha, pago.empresaId]);

      this.logger.log(
        `[TRANSFERENCIA] Empresa #${pago.empresaId} | Admin #${adminId} | ` +
        `US$${pago.montoUsd} | ${modalidad} | Vencimiento: ${fechaStr} → ${nuevaFecha}`,
      );
    }

    const updated = await this.pagoRepo.findOne({ where: { id: pagoId } });
    await this.notificarEmpresaConfirmacion(pago.empresaId, updated!).catch(e =>
      this.logger.warn(`Email confirmación: ${e?.message}`)
    );

    this.logger.log(`Transferencia #${pagoId} confirmada por admin #${adminId}`);
    return updated;
  }

  async rechazarTransferencia(pagoId: number, adminId: number, dto: RechazarPagoDto) {
    const pago = await this.pagoRepo.findOne({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
    if (pago.estado === EstadoPago.CONFIRMADO)
      throw new BadRequestException('No se puede rechazar un pago ya confirmado');

    await this.pagoRepo.update(pagoId, {
      estado:         EstadoPago.RECHAZADO,
      confirmadoPor:  adminId,
      confirmadoEn:   new Date(),
      motivoRechazo:  dto.motivoRechazo,
    });

    await this.notificarEmpresaRechazo(pago.empresaId, dto.motivoRechazo).catch(e =>
      this.logger.warn(`Email rechazo: ${e?.message}`)
    );

    this.logger.warn(`Transferencia #${pagoId} rechazada por admin #${adminId}: ${dto.motivoRechazo}`);
    return { ok: true };
  }

  async agregarCargo(empresaId: number, dto: AgregarCargoDto, adminId: number) {
    const pago = this.pagoRepo.create({
      empresaId,
      tipo:          TipoPago.CARGO,
      concepto:      dto.concepto,
      montoUsd:      dto.montoUsd,
      estado:        EstadoPago.CONFIRMADO,
      notas:         dto.notas ?? null,
      registradoPor: adminId,
      confirmadoPor: adminId,
      confirmadoEn:  new Date(),
    });
    return this.pagoRepo.save(pago);
  }

  async aplicarCredito(empresaId: number, dto: AplicarCreditoDto, adminId: number) {
    const pago = this.pagoRepo.create({
      empresaId,
      tipo:          TipoPago.CREDITO,
      concepto:      dto.concepto,
      montoUsd:      dto.montoUsd,
      estado:        EstadoPago.CONFIRMADO,
      notas:         dto.notas ?? null,
      registradoPor: adminId,
      confirmadoPor: adminId,
      confirmadoEn:  new Date(),
    });
    return this.pagoRepo.save(pago);
  }

  async enviarRecordatorio(empresaId: number) {
    const [sus] = await this.ds.query<any[]>(`
      SELECT s.*, e.nombre, e.email FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."empresaId" = $1
    `, [empresaId]);
    if (!sus) throw new NotFoundException('Empresa no encontrada');

    await this.enviarEmailRecordatorio(
      sus.email, sus.nombre, sus.plan,
      Math.ceil((new Date(sus.fechaVencimiento).getTime() - Date.now()) / 86400000),
    );
    return { ok: true, mensaje: `Recordatorio enviado a ${sus.email}` };
  }

  async updateConfiguracionBancaria(dto: UpdateConfiguracionBancariaDto) {
    let cfg = await this.bancoRepo.findOne({ where: { activo: true }, order: { id: 'DESC' } });
    if (cfg) {
      Object.assign(cfg, dto);
      return this.bancoRepo.save(cfg);
    } else {
      return this.bancoRepo.save(this.bancoRepo.create({ ...dto, activo: true }));
    }
  }

  async getHistorialEmpresa(empresaId: number) {
    const rows = await this.pagoRepo.find({ where: { empresaId }, order: { creadoEn: 'DESC' } });
    return rows.map(r => ({ ...r, montoUsd: Number(r.montoUsd ?? 0) }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRONS — Alertas de vencimiento de suscripción pagada
  // ──────────────────────────────────────────────────────────────────────────

  /** 9:00 AM hora RD (13:00 UTC) — alertas 7d y 3d antes del vencimiento */
  @Cron('0 13 * * *')
  async enviarAlertasVencimiento() {
    const hoy = new Date();

    for (const dias of [7, 3, 1]) {
      const target = new Date(hoy);
      target.setDate(target.getDate() + dias);
      const fecha = target.toISOString().split('T')[0];

      const empresas = await this.ds.query<any[]>(`
        SELECT s."empresaId", s.plan, s."fechaVencimiento",
               e.nombre, e.email
        FROM suscripciones s
        JOIN empresa e ON e.id = s."empresaId"
        WHERE s.estado = 'activa'
          AND s."fechaVencimiento"::date = $1
          AND e."isActive" = true
      `, [fecha]);

      for (const emp of empresas) {
        await this.enviarEmailRecordatorio(emp.email, emp.nombre, emp.plan, dias)
          .catch(e => this.logger.warn(`Alerta ${dias}d empresa #${emp.empresaId}: ${e?.message}`));
        this.logger.log(`Alerta ${dias}d enviada a empresa #${emp.empresaId}`);
      }
    }
  }

  /** 00:30 UTC — suspender automáticamente tras 3 días de vencimiento sin pago */
  @Cron('30 0 * * *')
  async suspenderPorFaltaDePago() {
    const hace3dias = new Date();
    hace3dias.setDate(hace3dias.getDate() - 3);
    const fecha = hace3dias.toISOString().split('T')[0];

    const empresas = await this.ds.query<any[]>(`
      SELECT s."empresaId", s.plan, e.nombre, e.email
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s.estado = 'activa'
        AND s."fechaVencimiento"::date = $1
        AND e."isActive" = true
    `, [fecha]);

    for (const emp of empresas) {
      // Verificar si tiene pagos confirmados después del vencimiento
      const [pago] = await this.ds.query<any[]>(`
        SELECT id FROM pagos_suscripcion
        WHERE "empresaId" = $1
          AND estado = 'CONFIRMADO'
          AND "confirmadoEn" > (
            SELECT "fechaVencimiento" FROM suscripciones WHERE "empresaId" = $1
          )
        LIMIT 1
      `, [emp.empresaId]);

      if (!pago) {
        await this.ds.query(`
          UPDATE suscripciones
          SET estado = 'suspendida', "motivoSuspension" = 'SUSPENSION_AUTOMATICA_PAGO'
          WHERE "empresaId" = $1 AND estado = 'activa'
        `, [emp.empresaId]);

        await this.enviarEmailSuspension(emp.email, emp.nombre, emp.plan)
          .catch(e => this.logger.warn(`Email suspensión empresa #${emp.empresaId}: ${e?.message}`));

        this.logger.warn(`Empresa #${emp.empresaId} suspendida automáticamente por falta de pago`);
      }
    }
  }

  /** 8:00 AM UTC — resumen diario de cobros al super admin */
  @Cron('0 8 * * 1-5') // Lunes a viernes
  async resumenDiarioSuperAdmin() {
    const pendientes = await this.listarComprobantesPeridentes();
    const vencenHoy  = await this.ds.query<any[]>(`
      SELECT e.nombre, e.email, s.plan
      FROM suscripciones s
      JOIN empresa e ON e.id = s."empresaId"
      WHERE s."fechaVencimiento"::date = CURRENT_DATE
        AND s.estado = 'activa'
        AND e."isActive" = true
    `);

    if (pendientes.length === 0 && vencenHoy.length === 0) return;

    const adminEmail = process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@hicloudrd.com';
    const html = this.buildResumenHtml(pendientes, vencenHoy);

    await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `📊 HiCloud — Resumen cobros del día (${new Date().toLocaleDateString('es-DO')})`,
      html,
    }).catch(e => this.logger.warn(`Resumen diario: ${e?.message}`));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers de email
  // ──────────────────────────────────────────────────────────────────────────

  private async enviarEmailRecordatorio(
    email: string, nombre: string, plan: string, dias: number,
  ) {
    const urgencia = dias <= 1 ? '🚨' : dias <= 3 ? '⚠️' : '📅';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,${dias <= 3 ? '#ef4444,#dc2626' : '#f59e0b,#d97706'});padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">${urgencia} Vencimiento de suscripción</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Tu suscripción al plan <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong> vence en <strong>${dias === 1 ? '1 día' : `${dias} días`}</strong>.</p>
    <p>Para evitar la suspensión de tu cuenta, realiza tu pago a tiempo.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com'}/configuracion" class="btn">Pagar ahora →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Tienes preguntas? Escríbenos a soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailSvc.enviar({
      to:      email,
      subject: `${urgencia} Tu suscripción HiCloud vence en ${dias} ${dias === 1 ? 'día' : 'días'}`,
      html,
    });
  }

  private async enviarEmailSuspension(email: string, nombre: string, plan: string) {
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#ef4444,#dc2626);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">🔒 Cuenta suspendida</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Tu cuenta en HiCloud ERP ha sido <strong>suspendida</strong> por falta de pago del plan <strong>${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong>.</p>
    <p>Para reactivar tu cuenta, realiza el pago y sube el comprobante desde el panel:</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/configuracion" class="btn">Reactivar cuenta →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">¿Necesitas ayuda? soporte@hicloudrd.com</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;
    await this.emailSvc.enviar({ to: email, subject: '🔒 Tu cuenta HiCloud fue suspendida — actúa ahora', html });
  }

  private async notificarSuperAdminComprobante(pago: PagoSuscripcion, empresaId: number) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    const adminEmail = process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@hicloudrd.com';
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

    await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `💳 HiCloud — Nuevo comprobante de pago de ${emp?.nombre ?? `Empresa #${empresaId}`}`,
      html:    `<p><strong>${emp?.nombre}</strong> subió un comprobante de transferencia por <strong>US$ ${pago.montoUsd}</strong>.</p>
               <p><a href="${frontendUrl}/super-admin">Ver en el panel →</a></p>`,
    });
  }

  private async notificarEmpresaPago(empresaId: number, pago: PagoSuscripcion) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '✅ Pago registrado en HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Se ha registrado un pago de <strong>US$ ${pago.montoUsd}</strong> — ${pago.concepto}.</p>
               <p>Gracias por tu pago.</p>`,
    });
  }

  private async notificarEmpresaConfirmacion(empresaId: number, pago: PagoSuscripcion) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '✅ Transferencia confirmada — HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Tu transferencia de <strong>US$ ${pago.montoUsd}</strong> fue <strong>confirmada</strong>. Tu suscripción está activa.</p>`,
    });
  }

  private async notificarEmpresaRechazo(empresaId: number, motivo: string) {
    const [emp] = await this.ds.query<any[]>(
      'SELECT nombre, email FROM empresa WHERE id = $1', [empresaId],
    );
    if (!emp?.email) return;

    await this.emailSvc.enviar({
      to:      emp.email,
      subject: '❌ Comprobante rechazado — HiCloud ERP',
      html:    `<p>Hola <strong>${emp.nombre}</strong>,</p>
               <p>Tu comprobante de transferencia fue <strong>rechazado</strong>.</p>
               <p><strong>Motivo:</strong> ${motivo}</p>
               <p>Por favor intenta nuevamente con un comprobante válido.</p>`,
    });
  }

  private buildResumenHtml(pendientes: any[], vencenHoy: any[]): string {
    const pRows = pendientes.map(p =>
      `<tr><td>${p.empresaNombre}</td><td>US$ ${p.montoUsd}</td><td>${new Date(p.creadoEn).toLocaleDateString('es-DO')}</td></tr>`
    ).join('');
    const vRows = vencenHoy.map(v =>
      `<tr><td>${v.nombre}</td><td>${v.plan}</td><td>${v.email}</td></tr>`
    ).join('');

    return `<h2>Resumen de cobros — ${new Date().toLocaleDateString('es-DO')}</h2>
    ${pendientes.length > 0 ? `<h3>Comprobantes pendientes (${pendientes.length})</h3>
    <table border="1" cellpadding="6"><tr><th>Empresa</th><th>Monto</th><th>Fecha</th></tr>${pRows}</table>` : '<p>Sin comprobantes pendientes.</p>'}
    ${vencenHoy.length > 0 ? `<h3>Vencen hoy (${vencenHoy.length})</h3>
    <table border="1" cellpadding="6"><tr><th>Empresa</th><th>Plan</th><th>Email</th></tr>${vRows}</table>` : ''}`;
  }
}
