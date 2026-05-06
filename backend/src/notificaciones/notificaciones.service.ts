import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  NotificacionEnviada,
  TipoNotificacion,
  CanalNotificacion,
} from './entities/notificacion-enviada.entity';
import { EmailService } from './services/email.service';
import { WhatsAppService } from './services/whatsapp.service';
import { Templates } from './templates/email.templates';
import { PaginationDto } from '../common/dto/pagination.dto';

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
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  private get adminEmail(): string {
    return this.configService.get<string>('NOTIF_ADMIN_EMAIL', '');
  }

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

  private async enviarEmail(
    tipo:       TipoNotificacion,
    asunto:     string,
    html:       string,
    referencia?: string,
  ) {
    const dest = this.adminEmail;
    if (!dest) {
      this.logger.warn(`NOTIF_ADMIN_EMAIL no configurado — notificación ${tipo} omitida`);
      return;
    }

    const { exitoso, error } = await this.emailService.enviar({ to: dest, subject: asunto, html });
    await this.registrar(tipo, CanalNotificacion.EMAIL, dest, asunto, html, exitoso, referencia, error);
  }

  // ──────────────────────────────────────────────────────────────────
  // Notificaciones individuales
  // ──────────────────────────────────────────────────────────────────

  async notificarCxCVencidas(): Promise<number> {
    const rows = await this.dataSource.query<{
      folio: string; clienteNombre: string; total: string; diasVencido: string;
    }[]>(
      `SELECT f.folio, c.nombre AS "clienteNombre", cxc.total::text,
              (CURRENT_DATE - cxc."fechaVencimiento"::date)::int AS "diasVencido"
       FROM cuentas_por_cobrar cxc
       JOIN facturas  f ON f.id  = cxc."facturaId"
       JOIN clientes  c ON c.id  = cxc."clienteId"
       WHERE cxc."isActive" = true
         AND cxc.estado IN ('vencida','pendiente','pagada_parcial')
         AND cxc."fechaVencimiento" < CURRENT_DATE
       ORDER BY "diasVencido" DESC
       LIMIT 50`,
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

    await this.enviarEmail(TipoNotificacion.CXC_VENCIDA, asunto, html, `${rows.length} cuentas`);
    this.logger.log(`Notificación CxC vencidas enviada: ${rows.length} cuentas`);
    return rows.length;
  }

  async notificarCxPPorVencer(): Promise<number> {
    const diasAlerta = Number(this.configService.get('NOTIF_CXP_DIAS_ALERTA', '3'));

    const rows = await this.dataSource.query<{
      folio: string; proveedorNombre: string; total: string; diasVence: string;
    }[]>(
      `SELECT c.folio, p.nombre AS "proveedorNombre", cxp.total::text,
              (cxp."fechaVencimiento"::date - CURRENT_DATE)::int AS "diasVence"
       FROM cuentas_por_pagar cxp
       JOIN compras     c ON c.id = cxp."compraId"
       JOIN proveedores p ON p.id = cxp."proveedorId"
       WHERE cxp."isActive" = true
         AND cxp.estado IN ('pendiente','pagada_parcial')
         AND cxp."fechaVencimiento"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
       ORDER BY "diasVence" ASC
       LIMIT 50`,
      [diasAlerta],
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

    await this.enviarEmail(TipoNotificacion.CXP_POR_VENCER, asunto, html, `${rows.length} pagos`);
    this.logger.log(`Notificación CxP por vencer enviada: ${rows.length} pagos`);
    return rows.length;
  }

  async notificarStockBajo(): Promise<number> {
    const rows = await this.dataSource.query<{
      codigo: string; nombre: string; stock: string; stockMinimo: string;
    }[]>(
      `SELECT codigo, nombre, stock::text, "stockMinimo"::text
       FROM productos
       WHERE "isActive" = true AND stock <= "stockMinimo"
       ORDER BY stock ASC
       LIMIT 30`,
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

    await this.enviarEmail(TipoNotificacion.STOCK_BAJO, asunto, html, `${rows.length} productos`);
    this.logger.log(`Notificación stock bajo enviada: ${rows.length} productos`);
    return rows.length;
  }

  async notificarECFSecuenciasVencimiento(): Promise<number> {
    const rows = await this.dataSource.query<{
      tipo: string; secuenciaActual: number; secuenciaFinal: number; fechaVencimiento: string;
    }[]>(
      `SELECT t.codigo AS tipo, s."secuenciaActual", s."secuenciaFinal",
              s."fechaVencimiento"::text
       FROM secuencias_ecf s
       JOIN tipos_ecf t ON t.id = s."tipoECFId"
       WHERE s."isActive" = true AND s."isAgotada" = false
         AND (s."fechaVencimiento" <= CURRENT_DATE + 30
              OR (s."secuenciaFinal" - s."secuenciaActual") * 100.0
                 / NULLIF(s."secuenciaFinal" - s."secuenciaInicial" + 1, 0) <= 10)
       LIMIT 20`,
    );

    if (rows.length === 0) return 0;

    const { asunto, html } = Templates.ecfSecuenciaVence(rows);
    await this.enviarEmail(TipoNotificacion.ECF_SECUENCIA_VENCE, asunto, html);
    this.logger.log(`Notificación ECF secuencias enviada: ${rows.length} secuencias`);
    return rows.length;
  }

  async enviarResumenDiario(): Promise<void> {
    const [cxcRows, cxpRows, stockRows] = await Promise.all([
      this.dataSource.query<{ cantidad: string; total: string }[]>(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM("montoPendiente"),0)::text AS total
         FROM cuentas_por_cobrar
         WHERE "isActive"=true AND estado IN ('vencida','pendiente','pagada_parcial')
           AND "fechaVencimiento" < CURRENT_DATE`,
      ),
      this.dataSource.query<{ cantidad: string; total: string }[]>(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM("montoPendiente"),0)::text AS total
         FROM cuentas_por_pagar
         WHERE "isActive"=true AND estado IN ('pendiente','pagada_parcial')
           AND "fechaVencimiento"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3`,
      ),
      this.dataSource.query<{ cantidad: string }[]>(
        `SELECT COUNT(*) AS cantidad FROM productos
         WHERE "isActive"=true AND stock <= "stockMinimo"`,
      ),
    ]);

    const data = {
      cxcVencidas:       Number(cxcRows[0].cantidad),
      totalCxCVencido:   Number(cxcRows[0].total),
      cxpPorVencer:      Number(cxpRows[0].cantidad),
      totalCxPPorVencer: Number(cxpRows[0].total),
      productosStockBajo: Number(stockRows[0].cantidad),
    };

    if (data.cxcVencidas === 0 && data.cxpPorVencer === 0 && data.productosStockBajo === 0) {
      this.logger.log('Resumen diario: sin alertas pendientes');
      return;
    }

    const { asunto, html } = Templates.resumenDiario(data);
    await this.enviarEmail(TipoNotificacion.MANUAL, asunto, html, 'resumen-diario');
    this.logger.log('Resumen diario enviado');
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron Jobs automáticos
  // ──────────────────────────────────────────────────────────────────

  @Cron('0 8 * * *')
  async cronResumenDiario() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: resumen diario de notificaciones');
    await this.enviarResumenDiario();
  }

  @Cron('0 9 * * 1')
  async cronAlertasSemanales() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: alertas semanales (lunes)');
    await Promise.all([
      this.notificarCxCVencidas(),
      this.notificarStockBajo(),
      this.notificarECFSecuenciasVencimiento(),
    ]);
  }

  @Cron('0 8 * * 1-5')
  async cronAlertasDiarias() {
    if (!this.notifActiva) return;
    this.logger.log('⏰ Cron: alertas diarias CxP');
    await this.notificarCxPPorVencer();
  }

  // ──────────────────────────────────────────────────────────────────
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
  ) {
    // ── 1. Obtener factura completa ───────────────────────────────────────────
    const factRows = await this.dataSource.query<{
      folio: string; fecha: string; clienteNombre: string;
      total: string; subtotal: string; iva: string; notas: string;
    }[]>(
      `SELECT f.folio, f.fecha::text,
              f.total::text, f.subtotal::text, f.iva::text,
              COALESCE(f.notas,'') AS notas,
              c.nombre AS "clienteNombre"
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
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

    const asuntoFinal = asunto ?? `Su factura ${r.folio} — HiCloud ERP`;

    const itemsHtml = detRows.map(d =>
      `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${d.descripcion}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px">${Number(d.cantidad).toLocaleString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">RD$ ${Number(d.precioUnitario).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#6b7280">${Number(d.porcentajeIva)}%</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700">RD$ ${Number(d.total).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
      </tr>`,
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Factura ${r.folio}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">

    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%);padding:28px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="width:40px;height:40px;background:rgba(255,255,255,.25);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;vertical-align:middle;margin-right:10px">H</div>
            <span style="font-size:18px;font-weight:700;color:#fff;vertical-align:middle">HiCloud ERP</span>
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
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Para consultas, responda este correo o contáctenos directamente.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af">HiCloud ERP · Comprobante Fiscal Electrónico · DGII República Dominicana</p>
    </div>
  </div>
</body>
</html>`;

    const { exitoso, error } = await this.emailService.enviar({
      to:      emailCliente,
      subject: asuntoFinal,
      html,
    });

    await this.registrar(
      TipoNotificacion.MANUAL,
      CanalNotificacion.EMAIL,
      emailCliente,
      asuntoFinal,
      `Factura ${r.folio} enviada por email`,
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
    return { mensaje: `Factura ${r.folio} enviada a ${emailCliente}` };
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
       LEFT JOIN pagos_cxc p ON p."cxcId" = cxc.id AND p."isActive" = true
       LEFT JOIN empresas e ON e.id = f."empresaId"
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

  async disparar(tipo: 'cxc' | 'cxp' | 'stock' | 'ecf' | 'resumen') {
    switch (tipo) {
      case 'cxc':     return { enviadas: await this.notificarCxCVencidas() };
      case 'cxp':     return { enviadas: await this.notificarCxPPorVencer() };
      case 'stock':   return { enviadas: await this.notificarStockBajo() };
      case 'ecf':     return { enviadas: await this.notificarECFSecuenciasVencimiento() };
      case 'resumen': await this.enviarResumenDiario(); return { mensaje: 'Resumen enviado' };
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
        destinatario:   this.adminEmail || '⚠️ NOTIF_ADMIN_EMAIL no configurado',
      },
      whatsapp: {
        configurado: this.whatsAppService.estaConfigurado,
      },
      notificacionesActivas: this.notifActiva,
    };
  }
}
