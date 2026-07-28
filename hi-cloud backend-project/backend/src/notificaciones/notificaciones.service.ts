import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { TenantService } from '../tenant/tenant.service';
import {
  NotificacionEnviada,
  TipoNotificacion,
  CanalNotificacion,
} from './entities/notificacion-enviada.entity';
import { EmailService } from './services/email.service';
import { WhatsAppService } from './services/whatsapp.service';
import { Templates } from './templates/email.templates';
import { PaginationDto } from '../common/dto/pagination.dto';
import { generarDocumentoPDFFactura, DocumentoPDFData, DocumentoPDFItem } from '../common/pdf/documento-pdf.helper';

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(NotificacionEnviada)
    private logRepository: Repository<NotificacionEnviada>,
    private emailService: EmailService,
    private whatsAppService: WhatsAppService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  private get notifActiva(): boolean {
    return this.configService.get<string>('NOTIF_ENABLED', 'true') === 'true';
  }

  private async registrar(
    tipo:         TipoNotificacion,
    canal:        CanalNotificacion,
    destinatario: string,
    asunto:       string,
    mensaje:      string,
    exitoso:      boolean,
    referencia?:  string,
    error?:       string,
  ) {
    await this.logRepository.save(
      this.logRepository.create({
        tipo, canal, destinatario, asunto, mensaje: mensaje.substring(0, 2000),
        exitoso, referencia, error,
      }),
    ).catch((e: Error) => this.logger.error(`Error guardando log: ${e.message}`));
  }

  /** Emails de usuarios admin/contador activos de una empresa (hasta 5). */
  private async getAdminEmails(empresaId: number): Promise<string[]> {
    const rows = await this.dataSource.query<{ email: string }[]>(
      `SELECT u.email
       FROM usuario_empresa ue
       JOIN users u ON u.id = ue."userId"
       WHERE ue."empresaId" = $1 AND ue."isActive" = true
         AND u."isActive" = true AND u.role IN ('admin','contador')
         AND u.email IS NOT NULL AND u.email <> ''
       LIMIT 5`,
      [empresaId],
    );
    return rows.map(r => r.email);
  }

  /** Todas las empresas activas con su configuración. */
  private async getEmpresasActivas(): Promise<{ id: number; nombre: string; configuracion: Record<string, unknown> }[]> {
    return this.dataSource.query(
      `SELECT id, nombre, COALESCE(configuracion, '{}') AS configuracion
       FROM empresa WHERE "isActive" = true ORDER BY id`,
    );
  }

  /** Envía un email a todos los admins/contadores de una empresa y registra el envío. */
  private async enviarEmailsEmpresa(
    empresaId:   number,
    tipo:        TipoNotificacion,
    asunto:      string,
    html:        string,
    referencia?: string,
  ) {
    const emails = await this.getAdminEmails(empresaId);
    if (!emails.length) {
      this.logger.warn(`Empresa ${empresaId}: sin usuarios admin/contador con email — notificación ${tipo} omitida`);
      return;
    }
    for (const dest of emails) {
      const { exitoso, error } = await this.emailService.enviar({ to: dest, subject: asunto, html });
      await this.registrar(tipo, CanalNotificacion.EMAIL, dest, asunto, html, exitoso, referencia, error);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Notificaciones individuales
  // ──────────────────────────────────────────────────────────────────

  async notificarCxCVencidas(empresaId: number): Promise<number> {
    const rows = await this.dataSource.query<{
      folio: string; clienteNombre: string; total: string; diasVencido: string;
    }[]>(
      `SELECT f.folio, c.nombre AS "clienteNombre", cxc."montoPendiente"::text AS total,
              (CURRENT_DATE - cxc."fechaVencimiento"::date)::int AS "diasVencido"
       FROM cuentas_por_cobrar cxc
       JOIN facturas  f ON f.id  = cxc."facturaId"
       JOIN clientes  c ON c.id  = cxc."clienteId"
       WHERE cxc."isActive" = true AND cxc."empresaId" = $1
         AND cxc.estado IN ('vencida','pendiente','pagada_parcial')
         AND cxc."fechaVencimiento" < CURRENT_DATE
       ORDER BY "diasVencido" DESC
       LIMIT 50`,
      [empresaId],
    );

    if (rows.length === 0) return 0;

    const { asunto, html } = Templates.cxcVencida(
      rows.map((r) => ({
        folio:       r.folio,
        cliente:     r.clienteNombre,
        total:       Number(r.total),
        diasVencido: Number(r.diasVencido),
      })),
    );

    await this.enviarEmailsEmpresa(empresaId, TipoNotificacion.CXC_VENCIDA, asunto, html, `${rows.length} cuentas`);
    this.logger.log(`Notificación CxC vencidas empresa ${empresaId}: ${rows.length} cuentas`);
    return rows.length;
  }

  async notificarCxPPorVencer(empresaId: number): Promise<number> {
    const diasAlerta = Number(this.configService.get('NOTIF_CXP_DIAS_ALERTA', '3'));

    const rows = await this.dataSource.query<{
      folio: string; proveedorNombre: string; total: string; diasVence: string;
    }[]>(
      `SELECT c.folio, p.nombre AS "proveedorNombre", cxp."montoPendiente"::text AS total,
              (cxp."fechaVencimiento"::date - CURRENT_DATE)::int AS "diasVence"
       FROM cuentas_por_pagar cxp
       JOIN compras     c ON c.id = cxp."compraId"
       JOIN proveedores p ON p.id = cxp."proveedorId"
       WHERE cxp."isActive" = true AND cxp."empresaId" = $1
         AND cxp.estado IN ('pendiente','pagada_parcial')
         AND cxp."fechaVencimiento"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + $2::int
       ORDER BY "diasVence" ASC
       LIMIT 50`,
      [empresaId, diasAlerta],
    );

    if (rows.length === 0) return 0;

    const { asunto, html } = Templates.cxpPorVencer(
      rows.map((r) => ({
        folio:      r.folio,
        proveedor:  r.proveedorNombre,
        total:      Number(r.total),
        diasVence:  Number(r.diasVence),
      })),
    );

    await this.enviarEmailsEmpresa(empresaId, TipoNotificacion.CXP_POR_VENCER, asunto, html, `${rows.length} pagos`);
    this.logger.log(`Notificación CxP por vencer empresa ${empresaId}: ${rows.length} pagos`);
    return rows.length;
  }

  async notificarStockBajo(empresaId: number): Promise<number> {
    const rows = await this.dataSource.query<{
      codigo: string; nombre: string; stock: string; stockMinimo: string;
    }[]>(
      `SELECT codigo, nombre, stock::text, "stockMinimo"::text
       FROM productos
       WHERE "isActive" = true AND "empresaId" = $1 AND stock <= "stockMinimo"
       ORDER BY stock ASC
       LIMIT 30`,
      [empresaId],
    );

    if (rows.length === 0) return 0;

    const { asunto, html } = Templates.stockBajo(
      rows.map((r) => ({
        codigo:      r.codigo,
        nombre:      r.nombre,
        stock:       Number(r.stock),
        stockMinimo: Number(r.stockMinimo),
      })),
    );

    await this.enviarEmailsEmpresa(empresaId, TipoNotificacion.STOCK_BAJO, asunto, html, `${rows.length} productos`);
    this.logger.log(`Notificación stock bajo empresa ${empresaId}: ${rows.length} productos`);
    return rows.length;
  }

  async notificarECFSecuenciasVencimiento(empresaId: number): Promise<number> {
    const rows = await this.dataSource.query<{
      tipo: string; secuenciaActual: number; secuenciaFinal: number; fechaVencimiento: string;
    }[]>(
      `SELECT t.codigo AS tipo, s."secuenciaActual", s."secuenciaFinal",
              s."fechaVencimiento"::text
       FROM secuencias_ecf s
       JOIN tipos_ecf t ON t.id = s."tipoECFId"
       WHERE s."isActiva" = true AND s."isAgotada" = false AND s."empresaId" = $1
         AND (s."fechaVencimiento" <= CURRENT_DATE + 30
              OR (s."secuenciaFinal" - s."secuenciaActual") * 100.0
                 / NULLIF(s."secuenciaFinal" - s."secuenciaInicial" + 1, 0) <= 10)
       LIMIT 20`,
      [empresaId],
    );

    if (rows.length === 0) return 0;

    const { asunto, html } = Templates.ecfSecuenciaVence(rows);
    await this.enviarEmailsEmpresa(empresaId, TipoNotificacion.ECF_SECUENCIA_VENCE, asunto, html);
    this.logger.log(`Notificación ECF secuencias empresa ${empresaId}: ${rows.length} secuencias`);
    return rows.length;
  }

  async enviarResumenDiario(empresaId: number): Promise<void> {
    const [cxcRows, cxpRows, stockRows] = await Promise.all([
      this.dataSource.query<{ cantidad: string; total: string }[]>(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM("montoPendiente"),0)::text AS total
         FROM cuentas_por_cobrar
         WHERE "isActive"=true AND "empresaId"=$1 AND estado IN ('vencida','pendiente','pagada_parcial')
           AND "fechaVencimiento" < CURRENT_DATE`,
        [empresaId],
      ),
      this.dataSource.query<{ cantidad: string; total: string }[]>(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM("montoPendiente"),0)::text AS total
         FROM cuentas_por_pagar
         WHERE "isActive"=true AND "empresaId"=$1 AND estado IN ('pendiente','pagada_parcial')
           AND "fechaVencimiento"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3`,
        [empresaId],
      ),
      this.dataSource.query<{ cantidad: string }[]>(
        `SELECT COUNT(*) AS cantidad FROM productos
         WHERE "isActive"=true AND "empresaId"=$1 AND stock <= "stockMinimo"`,
        [empresaId],
      ),
    ]);

    const data = {
      cxcVencidas:        Number(cxcRows[0].cantidad),
      totalCxCVencido:    Number(cxcRows[0].total),
      cxpPorVencer:       Number(cxpRows[0].cantidad),
      totalCxPPorVencer:  Number(cxpRows[0].total),
      productosStockBajo: Number(stockRows[0].cantidad),
    };

    if (data.cxcVencidas === 0 && data.cxpPorVencer === 0 && data.productosStockBajo === 0) {
      return;
    }

    const { asunto, html } = Templates.resumenDiario(data);
    await this.enviarEmailsEmpresa(empresaId, TipoNotificacion.MANUAL, asunto, html, 'resumen-diario');
    this.logger.log(`Resumen diario enviado — empresa ${empresaId}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron Jobs automáticos
  // ──────────────────────────────────────────────────────────────────

  @Cron('0 8 * * *')
  async cronResumenDiario() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: resumen diario por empresa');
    const empresas = await this.getEmpresasActivas();
    for (const emp of empresas) {
      if (emp.configuracion.notifResumenDiario !== true) continue;
      await this.enviarResumenDiario(emp.id).catch((e: Error) =>
        this.logger.error(`Resumen diario empresa ${emp.id}: ${e.message}`),
      );
    }
  }

  @Cron('0 9 * * 1')
  async cronAlertasSemanales() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: alertas semanales (lunes) por empresa');
    const empresas = await this.getEmpresasActivas();
    for (const emp of empresas) {
      const cfg = emp.configuracion;
      await Promise.all([
        cfg.notifStockBajo !== false
          ? this.notificarStockBajo(emp.id).catch((e: Error) =>
              this.logger.error(`Stock bajo empresa ${emp.id}: ${e.message}`))
          : Promise.resolve(0),
        cfg.notifVencECF !== false
          ? this.notificarECFSecuenciasVencimiento(emp.id).catch((e: Error) =>
              this.logger.error(`ECF empresa ${emp.id}: ${e.message}`))
          : Promise.resolve(0),
      ]);
    }
  }

  @Cron('0 8 * * 1-5')
  async cronAlertasDiarias() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: alertas diarias CxP por empresa');
    const empresas = await this.getEmpresasActivas();
    for (const emp of empresas) {
      if (emp.configuracion.notifVencCxP === false) continue;
      await this.notificarCxPPorVencer(emp.id).catch((e: Error) =>
        this.logger.error(`CxP empresa ${emp.id}: ${e.message}`),
      );
    }
  }

  /**
   * Recordatorios automáticos de CxC POR EMPRESA → directamente al cliente.
   * Corre a las 9:00 am todos los días.
   * Solo actúa para empresas con configuracion.notifVencCxC = true.
   */
  @Cron('0 9 * * *')
  async cronRecordatoriosClientesCxC() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: recordatorios de CxC a clientes');

    // Traer cuentas vencidas o por vencer en 3 días, junto con datos de empresa/cliente
    const rows = await this.dataSource.query<any[]>(`
      SELECT
        cxc.id, cxc."montoPendiente"::text, cxc."fechaVencimiento"::text,
        f.folio   AS "facturaFolio",
        c.nombre  AS "clienteNombre", c.email AS "clienteEmail",
        e.id      AS "empresaId", e.nombre AS "empresaNombre",
        e.telefono AS "empresaTelefono", e.email AS "empresaEmail",
        e."nombreComercial" AS "empresaComercial",
        e.configuracion,
        (CURRENT_DATE - cxc."fechaVencimiento"::date) AS "diasVencida"
      FROM cuentas_por_cobrar cxc
      JOIN facturas f ON f.id  = cxc."facturaId"
      JOIN clientes c ON c.id  = cxc."clienteId"
      JOIN empresa  e ON e.id  = cxc."empresaId"
      WHERE cxc."isActive" = true
        AND e."isActive"   = true
        AND cxc.estado IN ('vencida', 'pendiente', 'pagada_parcial')
        AND cxc."fechaVencimiento"::date <= CURRENT_DATE + 3
        AND c.email IS NOT NULL AND c.email <> ''
      ORDER BY e.id, "diasVencida" DESC
      LIMIT 500
    `);

    let enviados = 0;

    for (const r of rows) {
      // Verificar que la empresa tiene el flag activado
      const cfg = r.configuracion ?? {};
      if (cfg.notifVencCxC === false) continue;

      const diasVencida  = Number(r.diasVencida);
      const pendiente    = Number(r.montoPendiente);
      const fmtMoney     = (v: number) =>
        `RD$ ${v.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
      const fmtDate      = (d: string) =>
        d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

      const esVencida   = diasVencida > 0;
      const color       = esVencida ? '#dc2626' : '#d97706';
      const gradient    = esVencida
        ? 'linear-gradient(135deg,#dc2626,#ef4444)'
        : 'linear-gradient(135deg,#d97706,#f59e0b)';
      const asunto = esVencida
        ? `⚠️ Cuenta vencida hace ${diasVencida} día(s) — ${r.facturaFolio}`
        : `🔔 Recordatorio de pago — ${r.facturaFolio} vence pronto`;

      const nombreEmpresa = r.empresaComercial || r.empresaNombre;

      const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:${gradient};padding:24px 28px">
    <div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
      ${esVencida ? '⚠️ CUENTA VENCIDA' : '🔔 RECORDATORIO DE PAGO'}
    </div>
    <div style="font-size:20px;font-weight:800;color:#fff">${r.facturaFolio}</div>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Estimado/a <strong>${r.clienteNombre}</strong>,</p>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
      ${esVencida
        ? `Le informamos que la factura <strong>${r.facturaFolio}</strong> se encuentra vencida hace <strong>${diasVencida} día(s)</strong>. Le solicitamos ponerse al día a la brevedad posible.`
        : `Le recordamos que la factura <strong>${r.facturaFolio}</strong> vence en los próximos días. Por favor realice su pago a tiempo.`}
    </p>
    <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Factura</span>
        <strong>${r.facturaFolio}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Fecha de vencimiento</span>
        <strong style="color:${color}">${fmtDate(r.fechaVencimiento)}</strong>
      </div>
      <div style="border-top:2px solid ${color};padding-top:12px;margin-top:4px;display:flex;justify-content:space-between">
        <strong style="font-size:14px">Saldo pendiente</strong>
        <strong style="font-size:20px;color:${color}">${fmtMoney(pendiente)}</strong>
      </div>
    </div>
    <p style="font-size:12px;color:#9ca3af">Para regularizar su cuenta, comuníquese con nosotros:</p>
    ${r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : ''}
    ${r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>` : ''}
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 28px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${nombreEmpresa}</strong> · Generado por <strong style="color:${color}">HiCloud ERP</strong>
  </div>
</div>
</body></html>`;

      const { exitoso } = await this.emailService.enviar({
        to:      r.clienteEmail,
        subject: asunto,
        html,
      });

      if (exitoso) {
        enviados++;
        await this.registrar(
          TipoNotificacion.CXC_VENCIDA, CanalNotificacion.EMAIL,
          r.clienteEmail, asunto, `Recordatorio CxC ${r.facturaFolio}`, true, r.facturaFolio,
        );
      }
    }

    if (enviados > 0) {
      this.logger.log(`✅ Recordatorios CxC enviados a clientes: ${enviados}/${rows.length}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  /**
   * Resumen semanal financiero por empresa → email de la empresa.
   * Lunes 07:30. Incluye CxC vencidas, CxP próximas y stock bajo.
   */
  @Cron('30 7 * * 1')
  async cronResumenSemanalPorEmpresa() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: resumen semanal financiero por empresa');

    const empresas = await this.dataSource.query<any[]>(`
      SELECT e.id, e.nombre, e.email, e.configuracion,
        (SELECT COUNT(*) FROM cuentas_por_cobrar cxc
         WHERE cxc."empresaId" = e.id AND cxc.estado = 'vencida' AND cxc."isActive" = true
        )::int AS "cxcVencidas",
        (SELECT COALESCE(SUM(cxc."montoPendiente"),0)
         FROM cuentas_por_cobrar cxc
         WHERE cxc."empresaId" = e.id AND cxc.estado = 'vencida' AND cxc."isActive" = true
        )::numeric AS "montoCxCVencido",
        (SELECT COUNT(*) FROM cuentas_por_pagar cxp
         WHERE cxp."empresaId" = e.id
           AND cxp."fechaVencimiento"::date <= CURRENT_DATE + 7
           AND cxp.estado IN ('pendiente','pagada_parcial') AND cxp."isActive" = true
        )::int AS "cxpProximas"
      FROM empresa e
      WHERE e."isActive" = true AND e.email IS NOT NULL AND e.email <> ''
    `);

    let enviados = 0;
    for (const emp of empresas) {
      const cfg = emp.configuracion ?? {};
      if (cfg.notifEmail === false) continue;

      const cxcVencidas = Number(emp.cxcVencidas ?? 0);
      const montoCxC    = Number(emp.montoCxCVencido ?? 0);
      const cxpProximas = Number(emp.cxpProximas ?? 0);
      if (cxcVencidas === 0 && cxpProximas === 0) continue;

      const fmtM = (v: number) =>
        `RD$ ${v.toLocaleString('es-DO', { minimumFractionDigits: 0 })}`;

      const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#374151;background:#f9fafb;margin:0}
.c{background:#fff;border-radius:8px;padding:14px 16px;margin:8px 0;border-left:4px solid}</style></head>
<body><div style="max-width:500px;margin:0 auto;padding:20px">
<h2 style="color:#1a56db;margin-bottom:2px">📊 Resumen Semanal HiCloud ERP</h2>
<p style="color:#6b7280;margin:0 0 16px;font-size:12px">${emp.nombre} · ${new Date().toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'})}</p>
${cxcVencidas > 0 ? `<div class="c" style="border-color:#dc2626">🔴 <strong>${cxcVencidas} cuenta(s) por cobrar vencida(s)</strong><br/>Monto: <strong>${fmtM(montoCxC)}</strong><br/><small style="color:#9ca3af">Requiere gestión de cobro</small></div>` : ''}
${cxpProximas > 0 ? `<div class="c" style="border-color:#d97706">🟡 <strong>${cxpProximas} pago(s) de CxP</strong> vencen esta semana<br/><small style="color:#9ca3af">Revise disponibilidad de caja</small></div>` : ''}
<p style="margin-top:20px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px">HiCloud ERP · Resumen automático semanal</p>
</div></body></html>`;

      const { exitoso } = await this.emailService.enviar({
        to:      emp.email,
        subject: `📊 Resumen semanal: ${cxcVencidas} CxC vencidas · ${cxpProximas} CxP próximas — ${emp.nombre}`,
        html,
      });
      if (exitoso) enviados++;
    }

    this.logger.log(`Resúmenes semanales enviados: ${enviados}/${empresas.length}`);
  }

  // Consultas y envío manual
  // ──────────────────────────────────────────────────────────────────

  async getNotificaciones(filtro: PaginationDto) {
    const { limit = 20, page = 1 } = filtro;
    const [data, total] = await this.logRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getResumenNotificaciones() {
    const hoy       = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [totalHoy, totalMes, errores, porTipo] = await Promise.all([
      this.logRepository
        .createQueryBuilder('n')
        .where('n.createdAt >= :hoy', { hoy })
        .getCount(),

      this.logRepository
        .createQueryBuilder('n')
        .where('n.createdAt >= :inicio', { inicio: inicioMes })
        .getCount(),

      this.logRepository
        .createQueryBuilder('n')
        .where('n.exitoso = false AND n.createdAt >= :inicio', { inicio: inicioMes })
        .getCount(),

      this.logRepository
        .createQueryBuilder('n')
        .select('n.tipo', 'tipo')
        .addSelect('COUNT(n.id)', 'cantidad')
        .where('n.createdAt >= :inicio', { inicio: inicioMes })
        .groupBy('n.tipo')
        .getRawMany<{ tipo: string; cantidad: string }>(),
    ]);

    return {
      totalHoy,
      totalMes,
      erroresMes: errores,
      smtpConfigurado: await this.emailService.verificarConexion(),
      whatsappConfigurado: this.whatsAppService.estaConfigurado,
      distribucion: porTipo.map((r) => ({ tipo: r.tipo, cantidad: Number(r.cantidad) })),
    };
  }

  // ── Enviar factura al cliente por email ────────────────────────────────────
  async enviarFacturaAlCliente(
    facturaId:    number,
    emailCliente: string,
    asunto?:      string,
    pdfBuffer?:   Buffer,   // generado por el controlador (HTTP context) con PDFService
    cc?:          string,
    cco?:         string,
  ) {
    // ── 1. Obtener factura completa ───────────────────────────────────────────
    const factRows = await this.dataSource.query<{
      folio: string; fecha: string; clienteNombre: string;
      total: string; subtotal: string; iva: string; notas: string;
      empresaNombre: string; empresaRnc: string; empresaLogo: string;
      empresaTelefono: string; empresaEmail: string; empresaDireccion: string;
    }[]>(
      `SELECT f.folio, f.fecha::text,
              f.total::text, f.subtotal::text, f.iva::text,
              COALESCE(f.notas,'') AS notas,
              c.nombre AS "clienteNombre",
              COALESCE(e.nombre,'') AS "empresaNombre",
              COALESCE(e.rnc,'') AS "empresaRnc",
              COALESCE(e.logo,'') AS "empresaLogo",
              COALESCE(e.telefono,'') AS "empresaTelefono",
              COALESCE(e.email,'') AS "empresaEmail",
              COALESCE(e.direccion,'') AS "empresaDireccion"
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       JOIN empresa e ON e.id = f."empresaId"
       WHERE f.id = $1`,
      [facturaId],
    );

    if (!factRows[0]) throw new Error(`Factura #${facturaId} no encontrada`);
    const r = factRows[0];

    // ── 2. Obtener detalles por separado (evita json_agg parsing issues) ──────
    const detRows = await this.dataSource.query<{
      descripcion: string; cantidad: string;
      precioUnitario: string; total: string; porcentajeIva: string;
    }[]>(
      `SELECT descripcion, cantidad::text, "precioUnitario"::text, total::text, "porcentajeIva"::text
       FROM factura_detalles
       WHERE "facturaId" = $1 AND "isActive" = true
       ORDER BY id`,
      [facturaId],
    );

    const asuntoFinal = asunto ?? `Su factura ${r.folio} — ${r.empresaNombre}`;

    const logoHtml = r.empresaLogo
      ? `<img src="${r.empresaLogo}" style="height:44px;width:auto;max-width:130px;border-radius:8px;vertical-align:middle;margin-right:10px;object-fit:contain" />`
      : `<div style="width:44px;height:44px;background:rgba(255,255,255,.25);border-radius:10px;display:inline-block;text-align:center;line-height:44px;font-size:20px;font-weight:700;color:#fff;vertical-align:middle;margin-right:10px">${r.empresaNombre.charAt(0).toUpperCase()}</div>`;

    const empresaContactLine = [
      r.empresaRnc ? `RNC: ${r.empresaRnc}` : '',
      r.empresaTelefono,
    ].filter(Boolean).join(' · ');

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;white-space:nowrap">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;white-space:nowrap">RD$ ${Number(d.precioUnitario).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#6b7280;white-space:nowrap">${Number(d.porcentajeIva)}%</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">RD$ ${Number(d.total).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
      </tr>`,
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <title>Factura ${r.folio}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%);padding:28px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            ${logoHtml}
            <span style="font-size:18px;font-weight:700;color:#fff;vertical-align:middle">${r.empresaNombre}</span>
            ${empresaContactLine ? `<div style="margin-top:4px;font-size:12px;color:rgba(255,255,255,.8)">${empresaContactLine}</div>` : ''}
          </td>
          <td align="right">
            <div style="background:rgba(255,255,255,.2);border-radius:8px;padding:6px 14px;display:inline-block">
              <div style="font-size:11px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:1px">Factura</div>
              <div style="font-size:16px;font-weight:700;color:#fff">${r.folio}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- INTRO -->
    <div style="padding:28px 32px 0">
      <p style="margin:0 0 6px;font-size:16px;color:#111">Estimado/a <strong>${r.clienteNombre}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#555">Le enviamos el detalle de su factura <strong>${r.folio}</strong> con fecha <strong>${new Date(r.fecha).toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'})}</strong>.</p>
    </div>

    <!-- TABLA -->
    <div style="padding:0 32px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.5px">Descripción</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280">Cant.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Precio</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280">ITBIS</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>

    <!-- TOTALES -->
    <div style="padding:16px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="right" style="padding-bottom:6px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 16px 4px 0;font-size:13px;color:#555">Subtotal gravado:</td>
                <td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right">RD$ ${Number(r.subtotal).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
              </tr>
              <tr>
                <td style="padding:4px 16px 4px 0;font-size:13px;color:#555">ITBIS (18%):</td>
                <td style="padding:4px 0;font-size:13px;font-weight:600;text-align:right">RD$ ${Number(r.iva).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:4px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0"/></td>
              </tr>
              <tr>
                <td style="padding:8px 16px 0 0">
                  <div style="background:linear-gradient(135deg,#1a56db,#0ea5e9);border-radius:8px;padding:8px 20px">
                    <span style="font-size:11px;color:rgba(255,255,255,.85);text-transform:uppercase">Total a Pagar</span>
                  </div>
                </td>
                <td style="padding:8px 0 0;text-align:right">
                  <div style="background:linear-gradient(135deg,#1a56db,#0ea5e9);border-radius:8px;padding:8px 16px">
                    <span style="font-size:17px;font-weight:700;color:#fff">RD$ ${Number(r.total).toLocaleString('es-DO',{minimumFractionDigits:2})}</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    ${r.notas ? `<div style="margin:0 32px;background:#f8f9fa;border-radius:8px;padding:12px 16px;font-size:13px;color:#555"><strong>Notas:</strong> ${r.notas}</div>` : ''}

    <!-- FOOTER -->
    <div style="padding:20px 32px 24px;text-align:center">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280">⚠️ Este es un correo automático — <strong>no responda a este mensaje</strong>. Para consultas, comuníquese directamente con nosotros.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af">${r.empresaNombre}${r.empresaRnc ? ` · RNC: ${r.empresaRnc}` : ''} · Comprobante Fiscal Electrónico · DGII República Dominicana</p>
      ${r.empresaTelefono || r.empresaEmail ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af">${[r.empresaTelefono, r.empresaEmail].filter(Boolean).join(' · ')}</p>` : ''}
      ${r.empresaDireccion ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af">${r.empresaDireccion}</p>` : ''}
    </div>
  </div>
</body>
</html>`;

    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);
    const { exitoso, error } = await this.emailService.enviar({
      to:      emailCliente,
      subject: asuntoFinal,
      html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
      ...(pdfBuffer
        ? { attachments: [{ filename: `${r.folio}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] }
        : {}),
    });

    await this.registrar(
      TipoNotificacion.MANUAL,
      CanalNotificacion.EMAIL,
      emailCliente,
      asuntoFinal,
      `Factura ${r.folio} enviada por email${pdfBuffer ? ' (con PDF adjunto)' : ''}`,
      exitoso,
      r.folio,
      error,
    );

    if (!exitoso) {
      const causa = error ?? 'Error desconocido';
      const smtpConfigurado = !!(this.configService.get('SMTP_HOST') && this.configService.get('SMTP_USER'));
      if (!smtpConfigurado) {
        throw new Error('SMTP no configurado. Configura SMTP_HOST y SMTP_USER en el archivo .env');
      }
      throw new Error(`Error enviando email: ${causa}`);
    }
    return { mensaje: `Factura ${r.folio} enviada a ${emailCliente}${pdfBuffer ? ' (con PDF adjunto)' : ''}` };
  }

  // ── Estado de cuenta por email ─────────────────────────────────────────────
  async enviarEstadoCuenta(clienteId: number, emailDestino: string): Promise<{ mensaje: string }> {
    const facturas = await this.dataSource.query<any[]>(
      `SELECT f.folio, f.fecha::text, f.total::numeric,
              COALESCE(SUM(p.monto),0)::numeric AS pagado,
              cxc."montoPendiente"::numeric AS pendiente,
              cxc."fechaVencimiento"::text AS vencimiento,
              cxc.estado,
              c.nombre AS "clienteNombre",
              e.nombre AS "empresaNombre"
       FROM cuentas_por_cobrar cxc
       JOIN facturas f ON f.id = cxc."facturaId"
       JOIN clientes c ON c.id = cxc."clienteId"
       LEFT JOIN pagos_cobrados p ON p."cuentaPorCobrarId" = cxc.id AND p."isActive" = true
       LEFT JOIN empresa e ON e.id = f."empresaId"
       WHERE cxc."clienteId" = $1 AND cxc."isActive" = true
         AND cxc.estado IN ('pendiente','pagada_parcial')
       GROUP BY f.folio, f.fecha, f.total, cxc."montoPendiente",
                cxc."fechaVencimiento", cxc.estado, c.nombre, e.nombre
       ORDER BY cxc."fechaVencimiento" ASC`,
      [clienteId],
    );

    if (facturas.length === 0) {
      return { mensaje: 'El cliente no tiene facturas pendientes' };
    }

    const cliente     = facturas[0].clienteNombre;
    const empresa     = facturas[0].empresaNombre ?? 'HiCloud ERP';
    const totalPendiente = facturas.reduce((s, f) => s + Number(f.pendiente), 0);
    const totalVencido   = facturas
      .filter(f => new Date(f.vencimiento) < new Date())
      .reduce((s, f) => s + Number(f.pendiente), 0);

    const { asunto, html } = Templates.estadoCuenta({
      clienteNombre:  cliente,
      empresaNombre:  empresa,
      fechaCorte:     new Date().toISOString(),
      facturas: facturas.map(f => ({
        folio:      f.folio,
        fecha:      f.fecha,
        total:      Number(f.total),
        pagado:     Number(f.pagado),
        pendiente:  Number(f.pendiente),
        vencimiento: f.vencimiento,
        estado:     f.estado,
      })),
      totalPendiente,
      totalVencido,
    });

    const { exitoso, error } = await this.emailService.enviar({ to: emailDestino, subject: asunto, html });
    if (!exitoso) throw new Error(`Error enviando estado de cuenta: ${error}`);
    return { mensaje: `Estado de cuenta enviado a ${emailDestino}` };
  }

  // ── WhatsApp: enviar resumen de factura ────────────────────────────────────
  async enviarFacturaWhatsApp(facturaId: number, telefono: string) {
    const rows = await this.dataSource.query<{
      folio: string; clienteNombre: string; total: string; fecha: string;
    }[]>(
      `SELECT f.folio, c.nombre AS "clienteNombre", f.total::text, f.fecha::text
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       WHERE f.id = $1`,
      [facturaId],
    );

    if (!rows[0]) throw new Error(`Factura #${facturaId} no encontrada`);

    const r = rows[0];
    const mensaje =
      `📄 *HiCloud ERP — Factura ${r.folio}*\n\n` +
      `Cliente: ${r.clienteNombre}\n` +
      `Fecha: ${new Date(r.fecha).toLocaleDateString('es-DO')}\n` +
      `Total: RD$ ${Number(r.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}\n\n` +
      `Para consultas, contáctenos directamente. ¡Gracias por su preferencia!`;

    const { exitoso, error } = await this.whatsAppService.enviarMensaje(telefono, mensaje);

    await this.registrar(
      TipoNotificacion.MANUAL,
      CanalNotificacion.WHATSAPP,
      telefono,
      `Factura ${r.folio}`,
      mensaje,
      exitoso,
      r.folio,
      error,
    );

    if (!exitoso) {
      if (!this.whatsAppService.estaConfigurado) {
        throw new Error(
          'WhatsApp Business no está configurado. Agrega WHATSAPP_API_URL y WHATSAPP_TOKEN en el archivo .env. ' +
          'Proveedores compatibles: Ultramsg, Twilio, Meta Cloud API.',
        );
      }
      throw new Error(error ?? 'Error al enviar WhatsApp');
    }
    return { mensaje: `Factura ${r.folio} enviada por WhatsApp a ${telefono}` };
  }

  // ── Enviar pre-factura (proforma) al cliente por email ────────────────────────
  async enviarPreFacturaAlCliente(preFacturaId: number, emailCliente: string, cc?: string, cco?: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT pf.folio, pf.fecha::text, pf."fechaVencimiento"::text AS "fechaValidez",
              pf.subtotal::text, pf.iva::text, pf.total::text, pf.estado,
              COALESCE(pf.notas,'') AS notas, pf."condicionesPago" AS "condicionPago",
              c.nombre AS "clienteNombre",
              e.nombre AS "empresaNombre", e.rnc AS "empresaRNC",
              e.telefono AS "empresaTelefono", e.email AS "empresaEmail"
       FROM pre_facturas pf
       JOIN clientes c ON c.id = pf."clienteId"
       JOIN empresa  e ON e.id = pf."empresaId"
       WHERE pf.id = $1`,
      [preFacturaId],
    );
    if (!rows[0]) throw new Error(`Pre-factura #${preFacturaId} no encontrada`);
    const r = rows[0];

    const detRows = await this.dataSource.query<any[]>(
      `SELECT descripcion, cantidad::text, "precioUnitario"::text, total::text, "porcentajeIva"::text
       FROM pre_factura_detalles
       WHERE "preFacturaId" = $1
       ORDER BY id`,
      [preFacturaId],
    );

    const fmtMoney = (v: string | number) =>
      `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d: string) =>
      d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;white-space:nowrap">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;white-space:nowrap">${fmtMoney(d.precioUnitario)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#6b7280;white-space:nowrap">${Number(d.porcentajeIva)}%</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtMoney(d.total)}</td>
      </tr>`,
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<title>Pre-Factura ${r.folio}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);padding:28px 32px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px">Pre-Factura / Proforma</div>
    <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px">${r.folio}</div>
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 12px;font-size:12px;color:#fff">📅 Fecha: ${fmtDate(r.fecha)}</span>
      ${r.fechaValidez ? `<span style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 12px;font-size:12px;color:#fff">⏳ Válida hasta: ${fmtDate(r.fechaValidez)}</span>` : ''}
    </div>
  </div>
  <div style="padding:24px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">
      Estimado/a <strong>${r.clienteNombre}</strong>,<br/>
      Adjuntamos la pre-factura solicitada. Este documento es una propuesta previa a la factura definitiva.
    </p>
    ${r.condicionPago ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280">Condición de pago: <strong>${r.condicionPago}</strong></p>` : ''}
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Descripción</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Cant.</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Precio Unit.</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">ITBIS</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div style="display:flex;justify-content:space-between;width:240px;font-size:13px;color:#374151">
        <span>Subtotal:</span><span>${fmtMoney(r.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:240px;font-size:13px;color:#374151">
        <span>ITBIS (18%):</span><span>${fmtMoney(r.iva)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:240px;font-size:16px;font-weight:800;color:#7c3aed;border-top:2px solid #7c3aed;padding-top:8px;margin-top:4px">
        <span>TOTAL:</span><span>${fmtMoney(r.total)}</span>
      </div>
    </div>
    ${r.notas ? `<div style="margin-top:20px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px;font-size:13px;color:#5b21b6"><strong>📝 Notas:</strong><br/>${r.notas}</div>` : ''}
    <div style="margin-top:20px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:12px;color:#78350f">
      ⚠️ <strong>Documento preliminar</strong> — Esta pre-factura no tiene validez fiscal. La factura oficial se emitirá al confirmar el pedido.
    </div>
    <div style="margin-top:16px;text-align:center">
      ${r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : ''}
      ${r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>`    : ''}
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${r.empresaNombre}</strong>${r.empresaRNC ? ` · RNC ${r.empresaRNC}` : ''} · <strong style="color:#7c3aed">HiCloud ERP</strong>
  </div>
</div>
</body></html>`;

    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);
    const { exitoso, error } = await this.emailService.enviar({
      to: emailCliente,
      subject: `Pre-Factura ${r.folio} — ${r.empresaNombre}`,
      html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
    });
    if (!exitoso) throw new Error(`Error enviando pre-factura: ${error}`);
    return { mensaje: `Pre-factura ${r.folio} enviada a ${emailCliente}` };
  }

  // ── Helper para notas de crédito/débito ──────────────────────────────────────
  private async buildNotaHtml(id: number, tipo: 'credito' | 'debito') {
    // Tabla y columnas hardcodeadas por tipo — sin parámetros dinámicos de SQL
    const tabla    = tipo === 'credito' ? 'notas_credito'         : 'notas_debito';
    const detTabla = tipo === 'credito' ? 'nota_credito_detalles' : 'nota_debito_detalles';
    const fkCol    = tipo === 'credito' ? 'notaCreditoId'          : 'notaDebitoId';

    const rows = await this.dataSource.query<any[]>(
      `SELECT n.numero, n.fecha::text, n.total::text, n.subtotal::text, n.iva::text,
              n.motivo, COALESCE(n.notas,'') AS notas, n."facturaOriginalFolio",
              c.nombre AS "clienteNombre",
              e.nombre AS "empresaNombre", e.rnc AS "empresaRNC",
              e.telefono AS "empresaTelefono", e.email AS "empresaEmail"
       FROM ${tabla} n
       JOIN empresa e ON e.id = n."empresaId"
       LEFT JOIN clientes c ON c.id = n."clienteId"
       WHERE n.id = $1`,
      [id],
    );
    if (!rows[0]) throw new Error(`Nota #${id} no encontrada`);
    const r = rows[0];

    const detRows = await this.dataSource.query<any[]>(
      `SELECT descripcion, cantidad::text, "precioUnitario"::text, total::text
       FROM ${detTabla} WHERE "${fkCol}" = $1 ORDER BY id`,
      [id],
    );

    const fmtM = (v: string | number) => `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtD = (d: string) => d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

    const color   = tipo === 'credito' ? '#059669' : '#dc2626';
    const gradient= tipo === 'credito' ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)';
    const titulo  = tipo === 'credito' ? 'Nota de Crédito' : 'Nota de Débito';

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion ?? ''}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;white-space:nowrap">${Number(d.cantidad || 1).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;white-space:nowrap">${fmtM(d.precioUnitario || d.monto || 0)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtM(d.total || 0)}</td>
      </tr>`,
    ).join('') || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af">Sin detalle de líneas</td></tr>`;

    return { r, fmtM, fmtD, color, gradient, titulo, itemsHtml };
  }

  async enviarNotaCreditoAlCliente(notaId: number, emailCliente: string, cc?: string, cco?: string) {
    const { r, fmtM, fmtD, color, gradient, titulo, itemsHtml } =
      await this.buildNotaHtml(notaId, 'credito');

    const html = this.buildNotaEmailHtml({ r, fmtM, fmtD, color, gradient, titulo, itemsHtml });
    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);
    const { exitoso, error } = await this.emailService.enviar({
      to: emailCliente, subject: `${titulo} ${r.numero} — ${r.empresaNombre}`, html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
    });
    if (!exitoso) throw new Error(error ?? 'Error enviando email');
    return { mensaje: `${titulo} ${r.numero} enviada a ${emailCliente}` };
  }

  async enviarNotaDebitoAlCliente(notaId: number, emailCliente: string, cc?: string, cco?: string) {
    const { r, fmtM, fmtD, color, gradient, titulo, itemsHtml } =
      await this.buildNotaHtml(notaId, 'debito');

    const html = this.buildNotaEmailHtml({ r, fmtM, fmtD, color, gradient, titulo, itemsHtml });
    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);
    const { exitoso, error } = await this.emailService.enviar({
      to: emailCliente, subject: `${titulo} ${r.numero} — ${r.empresaNombre}`, html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
    });
    if (!exitoso) throw new Error(error ?? 'Error enviando email');
    return { mensaje: `${titulo} ${r.numero} enviada a ${emailCliente}` };
  }

  /** Parsea una cadena de correos separados por coma/punto y coma, valida y deduplica. */
  private parsearEmails(val?: string): string[] {
    if (!val) return [];
    const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return [...new Set(val.split(/[,;]/).map(e => e.trim()).filter(e => e && RE.test(e)))];
  }

  /** Calcula listas deduplicadas de CC y CCO, excluyendo el destinatario principal. */
  private calcCcCco(cc: string | undefined, cco: string | undefined, emailTo: string) {
    const ccList  = this.parsearEmails(cc).filter(e => e !== emailTo);
    const ccoList = this.parsearEmails(cco).filter(e => e !== emailTo && !ccList.includes(e));
    return { ccList, ccoList };
  }

  private buildNotaEmailHtml({ r, fmtM, fmtD, color, gradient, titulo, itemsHtml }: any): string {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<title>${titulo} ${r.numero}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:${gradient};padding:28px 32px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px">${titulo}</div>
    <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px">${r.numero}</div>
    <div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.8)">📅 ${fmtD(r.fecha)}</div>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Estimado/a <strong>${r.clienteNombre}</strong>,</p>
    ${r.facturaOriginalFolio ? `<p style="margin:0 0 16px;font-size:13px;color:#6b7280">Referida a la factura: <strong>${r.facturaOriginalFolio}</strong></p>` : ''}
    ${r.motivo ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280">Motivo: <strong>${r.motivo.replace(/_/g,' ')}</strong></p>` : ''}
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <thead><tr style="background:#f9fafb">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Descripción</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Cant.</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Precio</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div style="display:flex;justify-content:space-between;width:220px;font-size:16px;font-weight:800;color:${color};border-top:2px solid ${color};padding-top:8px;margin-top:4px">
        <span>TOTAL:</span><span>${fmtM(r.total)}</span>
      </div>
    </div>
    ${r.notas ? `<div style="margin-top:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;color:#374151"><strong>Notas:</strong> ${r.notas}</div>` : ''}
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${r.empresaNombre}</strong>${r.empresaRNC ? ` · RNC ${r.empresaRNC}` : ''} · <strong style="color:${color}">HiCloud ERP</strong>
  </div>
</div></body></html>`;
  }

  // ── Enviar orden de compra al proveedor por email ────────────────────────────
  async enviarCompraAlProveedor(compraId: number, emailProveedor: string, cc?: string, cco?: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT c.folio, c.fecha::text, c.subtotal::text, c.itbis::text, c.total::text,
              COALESCE(c.notas,'') AS notas, c.estado,
              p.nombre AS "proveedorNombre",
              e.nombre AS "empresaNombre", e.rnc AS "empresaRNC",
              e.telefono AS "empresaTelefono", e.email AS "empresaEmail"
       FROM compras c
       JOIN proveedores p ON p.id = c."proveedorId"
       JOIN empresa e ON e.id = c."empresaId"
       WHERE c.id = $1`,
      [compraId],
    );
    if (!rows[0]) throw new Error(`Compra #${compraId} no encontrada`);
    const r = rows[0];

    const detRows = await this.dataSource.query<any[]>(
      `SELECT descripcion, cantidad::text, "precioUnitario"::text, total::text, "porcentajeItbis"::text
       FROM compra_detalles
       WHERE "compraId" = $1 AND "isActive" = true
       ORDER BY id`,
      [compraId],
    );

    const fmtMoney = (v: string | number) =>
      `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtDate  = (d: string) =>
      d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;white-space:nowrap">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;white-space:nowrap">${fmtMoney(d.precioUnitario)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#6b7280;white-space:nowrap">${Number(d.porcentajeItbis)}%</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtMoney(d.total)}</td>
      </tr>`,
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<title>Orden de Compra ${r.folio}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#7c3aed,#a78bfa);padding:28px 32px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px">Orden de Compra</div>
    <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px">${r.folio}</div>
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 12px;font-size:12px;color:#fff">📅 ${fmtDate(r.fecha)}</span>
    </div>
  </div>
  <div style="padding:24px 32px">
    <p style="margin:0 0 20px;font-size:14px;color:#374151">
      Estimado/a <strong>${r.proveedorNombre}</strong>,<br/>
      Por medio de la presente, les hacemos llegar la siguiente orden de compra. Les solicitamos confirmar disponibilidad y fecha de entrega.
    </p>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Descripción</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Cant.</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Precio Unit.</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">ITBIS</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div style="display:flex;justify-content:space-between;width:240px;font-size:13px;color:#374151">
        <span>Subtotal:</span><span>${fmtMoney(r.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:240px;font-size:13px;color:#374151">
        <span>ITBIS:</span><span>${fmtMoney(r.itbis)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:240px;font-size:16px;font-weight:800;color:#7c3aed;border-top:2px solid #7c3aed;padding-top:8px;margin-top:4px">
        <span>TOTAL:</span><span>${fmtMoney(r.total)}</span>
      </div>
    </div>
    ${r.notas ? `<div style="margin-top:20px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px;font-size:13px;color:#5b21b6"><strong>📝 Notas:</strong><br/>${r.notas}</div>` : ''}
    <div style="margin-top:24px;text-align:center">
      <p style="font-size:12px;color:#9ca3af">Para confirmar esta orden, contáctenos:</p>
      ${r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : ''}
      ${r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>` : ''}
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${r.empresaNombre}</strong>${r.empresaRNC ? ` · RNC ${r.empresaRNC}` : ''} · <strong style="color:#7c3aed">HiCloud ERP</strong>
  </div>
</div>
</body></html>`;

    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailProveedor);
    const { exitoso, error } = await this.emailService.enviar({
      to: emailProveedor,
      subject: `Orden de Compra ${r.folio} — ${r.empresaNombre}`,
      html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
    });
    if (!exitoso) throw new Error(`Error enviando orden de compra: ${error}`);
    return { mensaje: `Orden ${r.folio} enviada a ${emailProveedor}` };
  }

  // ── Enviar recibo de cobro al cliente por email ───────────────────────────────
  async enviarReciboAlCliente(reciboId: number, emailCliente: string, cc?: string, cco?: string) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT rc.numero, rc.fecha::text, rc.monto::text, rc."metodoPago",
              rc."clienteNombre", rc.concepto, rc.referencia,
              COALESCE(rc."facturaFolio",'') AS "facturaFolio",
              rc."nombreUsuario",
              e.nombre AS "empresaNombre", e.telefono AS "empresaTelefono",
              e.email AS "empresaEmail", e.rnc AS "empresaRNC"
       FROM recibos_cobro rc
       JOIN empresa e ON e.id = rc."empresaId"
       WHERE rc.id = $1`,
      [reciboId],
    );
    if (!rows[0]) throw new Error(`Recibo #${reciboId} no encontrado`);
    const r = rows[0];

    const fmtMoney = (v: string | number) =>
      `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d: string) =>
      d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

    const metodoLabel: Record<string, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia bancaria',
      cheque: 'Cheque', tarjeta: 'Tarjeta', deposito: 'Depósito', otro: 'Otro',
    };

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<title>Recibo ${r.numero}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#059669,#10b981);padding:28px 32px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px">Recibo de Cobro</div>
    <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px">${r.numero}</div>
    <div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.8)">📅 ${fmtDate(r.fecha)}</div>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;font-size:14px;color:#374151">Estimado/a <strong>${r.clienteNombre ?? 'Cliente'}</strong>,</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280">Confirmamos la recepción del siguiente pago:</p>
    <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Concepto</span>
        <span style="font-weight:600;color:#374151">${r.concepto}</span>
      </div>
      ${r.facturaFolio ? `<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Factura referenciada</span>
        <span style="font-weight:600;color:#374151">${r.facturaFolio}</span>
      </div>` : ''}
      ${r.referencia ? `<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Referencia</span>
        <span style="font-weight:600;color:#374151">${r.referencia}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Forma de pago</span>
        <span style="font-weight:600;color:#374151">${metodoLabel[r.metodoPago] ?? r.metodoPago}</span>
      </div>
      <div style="border-top:2px solid #e5e7eb;margin-top:12px;padding-top:14px;display:flex;justify-content:space-between">
        <span style="font-size:15px;font-weight:700;color:#374151">MONTO RECIBIDO</span>
        <span style="font-size:22px;font-weight:900;color:#059669">${fmtMoney(r.monto)}</span>
      </div>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">Recibido por: <strong>${r.nombreUsuario ?? 'Sistema'}</strong></p>
    <div style="text-align:center;margin-top:8px">
      ${r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : ''}
      ${r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>` : ''}
    </div>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${r.empresaNombre}</strong>${r.empresaRNC ? ` · RNC ${r.empresaRNC}` : ''} · <strong style="color:#059669">HiCloud ERP</strong>
  </div>
</div>
</body></html>`;

    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);
    const { exitoso, error } = await this.emailService.enviar({
      to: emailCliente,
      subject: `Recibo de pago ${r.numero} — ${r.empresaNombre}`,
      html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
    });
    if (!exitoso) throw new Error(`Error enviando recibo: ${error}`);
    return { mensaje: `Recibo ${r.numero} enviado a ${emailCliente}` };
  }

  // ── Enviar cotización al cliente por email ────────────────────────────────────
  async enviarCotizacionAlCliente(
    cotizacionId: number,
    emailCliente: string,
    asunto?: string,
    cc?: string,
    cco?: string,
  ) {
    const rows = await this.dataSource.query<any[]>(
      `SELECT co.numero, co.fecha::text, co."fechaVencimiento"::text AS "fechaValidez",
              co.estado, co."validezDias", co."condicionesPago", co."nombreVendedor",
              co.subtotal::text, co.iva::text, co.total::text,
              COALESCE(co.notas,'') AS notas,
              c.nombre AS "clienteNombre", c.email AS "clienteEmail",
              COALESCE(c."rncReceptor", c.rfc, '') AS "clienteRNC",
              COALESCE(c.direccion,'') AS "clienteDireccion",
              COALESCE(c.ciudad,'') AS "clienteCiudad",
              COALESCE(c.telefono,'') AS "clienteTelefono",
              COALESCE(e."nombreComercial", e.nombre) AS "empresaNombre",
              COALESCE(e.rnc,'') AS "empresaRNC",
              COALESCE(e.direccion,'') AS "empresaDireccion",
              e.ciudad AS "empresaCiudad", e.telefono AS "empresaTelefono",
              e.email  AS "empresaEmail",  e."sitioWeb" AS "empresaWeb",
              e.logo   AS "empresaLogo",
              COALESCE(e.configuracion,'{}') AS "empresaConf"
       FROM cotizaciones co
       JOIN clientes c  ON c.id  = co."clienteId"
       JOIN empresa  e  ON e.id  = co."empresaId"
       WHERE co.id = $1`,
      [cotizacionId],
    );
    if (!rows[0]) throw new Error(`Cotización #${cotizacionId} no encontrada`);
    const r = rows[0];

    const detRows = await this.dataSource.query<any[]>(
      `SELECT descripcion, cantidad::text, "precioUnitario"::text,
              COALESCE(total::text,'0') AS total,
              COALESCE("porcentajeIva"::text,'18') AS "porcentajeIva"
       FROM cotizacion_detalles
       WHERE "cotizacionId" = $1 AND "isActive" = true
       ORDER BY id`,
      [cotizacionId],
    );

    const fmtMoney = (v: string | number) =>
      `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtDate  = (d: string) => d ? new Date(d).toLocaleDateString('es-DO', { day:'2-digit', month:'long', year:'numeric' }) : '—';

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;white-space:nowrap">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;white-space:nowrap">${fmtMoney(d.precioUnitario)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#6b7280;white-space:nowrap">${Number(d.porcentajeIva)}%</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtMoney(d.total)}</td>
      </tr>`,
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><title>Cotización ${r.numero}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#1a56db,#0ea5e9);padding:28px 32px">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px">Cotización</div>
    <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.3px">${r.numero}</div>
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 12px;font-size:12px;color:#fff">📅 Emitida: ${fmtDate(r.fecha)}</span>
      <span style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 12px;font-size:12px;color:#fff">⏳ Válida hasta: ${fmtDate(r.fechaValidez)}</span>
    </div>
  </div>

  <div style="padding:24px 32px">
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
      Estimado/a <strong>${r.clienteNombre}</strong>,<br/>
      Adjuntamos la cotización solicitada. Por favor revise los detalles a continuación.
    </p>

    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Descripción</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Cant.</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Precio Unit.</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">ITBIS</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="margin-top:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div style="display:flex;justify-content:space-between;width:260px;font-size:13px;color:#374151">
        <span>Subtotal:</span><span style="white-space:nowrap">${fmtMoney(r.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:260px;font-size:13px;color:#374151">
        <span>ITBIS (18%):</span><span style="white-space:nowrap">${fmtMoney(r.iva)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;width:260px;font-size:16px;font-weight:800;color:#1a56db;border-top:2px solid #1a56db;padding-top:8px;margin-top:4px">
        <span style="white-space:nowrap">TOTAL:</span><span style="white-space:nowrap;padding-left:16px">${fmtMoney(r.total)}</span>
      </div>
    </div>

    ${r.notas ? `<div style="margin-top:20px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px;font-size:13px;color:#78350f"><strong>📝 Notas:</strong><br/>${r.notas}</div>` : ''}

    <div style="margin-top:24px;text-align:center">
      <p style="font-size:12px;color:#9ca3af">Para aceptar o consultar esta cotización, contáctenos:</p>
      ${r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : ''}
      ${r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>`    : ''}
      ${r.empresaWeb      ? `<p style="font-size:13px;color:#374151;margin:4px 0">🌐 ${r.empresaWeb}</p>`     : ''}
    </div>
  </div>

  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${r.empresaNombre}</strong>
  </div>
</div>
</body></html>`;

    // Generar PDF adjunto — helper plano, sin DI, no hay dep circular
    let pdfBuffer: Buffer | undefined;
    try {
      let logoBuf: Buffer | undefined;
      if (r.empresaLogo) {
        try {
          const res = await fetch(r.empresaLogo as string, { signal: AbortSignal.timeout(5_000) });
          if (res.ok) logoBuf = Buffer.from(await res.arrayBuffer());
        } catch { /* logo no disponible — se usarán iniciales */ }
      }
      const factConf = (r.empresaConf ?? {}) as Record<string, unknown>;
      const estadoColor =
        r.estado === 'aceptada' || r.estado === 'convertida' ? 'green'  :
        r.estado === 'rechazada' || r.estado === 'vencida'   ? 'red'    : 'orange';
      const pdfItems: DocumentoPDFItem[] = detRows.map((d: any) => {
        const itbisPct     = Number(d.porcentajeIva ?? 18);
        const subtotal     = Number(d.precioUnitario) * Number(d.cantidad);
        const importeItbis = subtotal * (itbisPct / 100);
        return { descripcion: d.descripcion, cantidad: Number(d.cantidad), unidadMedida: 'UN',
          precioUnitario: Number(d.precioUnitario), itbisPct, importeItbis, subtotal, total: Number(d.total) };
      });
      const subtotalGravado = pdfItems.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
      const subtotalExento  = pdfItems.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);
      const pdfData: DocumentoPDFData = {
        tipo: 'COTIZACIÓN', tipoSub: 'Propuesta comercial · No válida como comprobante fiscal',
        numero: r.numero, fecha: r.fecha, fechaVencimiento: r.fechaValidez ?? undefined,
        validezDias: r.validezDias, condicionesPago: r.condicionesPago,
        estado: r.estado, estadoColor,
        empresaNombre: r.empresaNombre || 'Mi Empresa', empresaRNC: r.empresaRNC || '',
        empresaDireccion: r.empresaDireccion || '', empresaCiudad: r.empresaCiudad,
        empresaTelefono: factConf.factMostrarTelefono !== false ? r.empresaTelefono : undefined,
        empresaEmail:    factConf.factMostrarEmail    !== false ? r.empresaEmail    : undefined,
        empresaSitioWeb: factConf.factMostrarWeb      !== false ? r.empresaWeb      : undefined,
        vendedorNombre: r.nombreVendedor,
        clienteNombre: r.clienteNombre || 'Consumidor Final',
        clienteRNC: r.clienteRNC || undefined, clienteDireccion: r.clienteDireccion || undefined,
        clienteCiudad: r.clienteCiudad || undefined, clienteTelefono: r.clienteTelefono || undefined,
        clienteEmail: r.clienteEmail || undefined,
        items: pdfItems, subtotalGravado, subtotalExento,
        subtotalGeneral: subtotalGravado + subtotalExento,
        itbisTotal: Number(r.iva), totalGeneral: Number(r.total),
        notas: r.notas || undefined, mostrarFirma: true,
      };
      pdfBuffer = await generarDocumentoPDFFactura(pdfData, logoBuf);
    } catch (err) {
      this.logger.warn(`No se pudo generar PDF para cotización #${cotizacionId}: ${(err as Error).message}`);
    }

    const { ccList, ccoList } = this.calcCcCco(cc, cco, emailCliente);

    const subjectFinal = asunto ?? `Cotización ${r.numero} — ${r.empresaNombre}`;
    const { exitoso, error } = await this.emailService.enviar({
      to: emailCliente,
      subject: subjectFinal,
      html,
      ...(ccList.length  ? { cc:  ccList  } : {}),
      ...(ccoList.length ? { bcc: ccoList } : {}),
      ...(pdfBuffer
        ? { attachments: [{ filename: `${r.numero}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] }
        : {}),
    });
    if (!exitoso) throw new Error(`Error enviando cotización: ${error}`);
    return { mensaje: `Cotización ${r.numero} enviada a ${emailCliente}${pdfBuffer ? ' (con PDF adjunto)' : ''}` };
  }

  // ── Notificar resolución de solicitud de aprobación al solicitante ───────────
  async notificarResolucionAprobacion(params: {
    emailSolicitante: string;
    nombreSolicitante: string;
    tipo: string;
    entidadRef?: string;
    estado: 'aprobado' | 'rechazado';
    comentario?: string;
    empresaNombre: string;
  }): Promise<void> {
    const { emailSolicitante, nombreSolicitante, tipo, entidadRef, estado, comentario, empresaNombre } = params;

    const esAprobado = estado === 'aprobado';
    const color      = esAprobado ? '#059669' : '#dc2626';
    const gradient   = esAprobado
      ? 'linear-gradient(135deg,#059669,#10b981)'
      : 'linear-gradient(135deg,#dc2626,#ef4444)';
    const icono  = esAprobado ? '✅' : '❌';
    const titulo = esAprobado ? 'Solicitud Aprobada' : 'Solicitud Rechazada';

    const tipoLabel: Record<string, string> = {
      cotizacion:  'Cotización',
      pre_factura: 'Pre-Factura',
      compra:      'Compra',
      gasto:       'Gasto',
      nota_debito: 'Nota de Débito',
      otro:        'Solicitud',
    };
    const tipoTexto = tipoLabel[tipo] ?? tipo;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:${gradient};padding:24px 28px">
    <div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">
      ${icono} ${titulo.toUpperCase()}
    </div>
    <div style="font-size:20px;font-weight:800;color:#fff">${tipoTexto}${entidadRef ? ` — ${entidadRef}` : ''}</div>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">
      Estimado/a <strong>${nombreSolicitante}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
      ${esAprobado
        ? `Su solicitud de <strong>${tipoTexto}</strong>${entidadRef ? ` <strong>${entidadRef}</strong>` : ''} ha sido <strong style="color:${color}">aprobada</strong>.`
        : `Su solicitud de <strong>${tipoTexto}</strong>${entidadRef ? ` <strong>${entidadRef}</strong>` : ''} ha sido <strong style="color:${color}">rechazada</strong>.`}
    </p>
    ${comentario ? `
    <div style="background:#f9fafb;border-left:4px solid ${color};border-radius:4px;padding:14px 16px;margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">
        ${esAprobado ? 'Comentario' : 'Motivo del rechazo'}
      </div>
      <div style="font-size:13px;color:#374151">${comentario}</div>
    </div>` : ''}
    <p style="font-size:12px;color:#9ca3af;margin:0">
      Si tiene dudas, comuníquese con el administrador de <strong>${empresaNombre}</strong>.
    </p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:12px 28px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${empresaNombre}</strong> · <strong style="color:${color}">HiCloud ERP</strong>
  </div>
</div>
</body></html>`;

    const asunto = `${icono} ${titulo}: ${tipoTexto}${entidadRef ? ` ${entidadRef}` : ''} — ${empresaNombre}`;
    const { exitoso, error } = await this.emailService.enviar({
      to: emailSolicitante, subject: asunto, html,
    });

    await this.registrar(
      TipoNotificacion.MANUAL,
      CanalNotificacion.EMAIL,
      emailSolicitante,
      asunto,
      `Resolución aprobación: ${estado} — ${tipoTexto} ${entidadRef ?? ''}`,
      exitoso,
      entidadRef,
      error,
    );

    if (!exitoso) {
      this.logger.warn(
        `[notificarResolucionAprobacion] No se pudo enviar email a ${emailSolicitante}: ${error}`,
      );
    } else {
      this.logger.log(
        `[notificarResolucionAprobacion] Email ${estado} enviado a ${emailSolicitante} (${tipoTexto} ${entidadRef ?? ''})`,
      );
    }
  }

  async disparar(tipo: 'cxc' | 'cxp' | 'stock' | 'ecf' | 'resumen') {
    const empresaId = this.tenantService.getEmpresaId();
    switch (tipo) {
      case 'cxc':     return { enviadas: await this.notificarCxCVencidas(empresaId) };
      case 'cxp':     return { enviadas: await this.notificarCxPPorVencer(empresaId) };
      case 'stock':   return { enviadas: await this.notificarStockBajo(empresaId) };
      case 'ecf':     return { enviadas: await this.notificarECFSecuenciasVencimiento(empresaId) };
      case 'resumen': await this.enviarResumenDiario(empresaId); return { mensaje: 'Resumen enviado' };
    }
  }

  async verificarConfiguracion() {
    return {
      smtp: {
        configurado: !!(
          this.configService.get('SMTP_HOST') &&
          this.configService.get('SMTP_USER')
        ),
        conexionActiva: await this.emailService.verificarConexion(),
        destinatarios: 'Admins y contadores de cada empresa',
      },
      whatsapp: {
        configurado: this.whatsAppService.estaConfigurado,
      },
      notificacionesActivas: this.notifActiva,
    };
  }
}
