import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailService } from '../../notificaciones/services/email.service';

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly emailService: EmailService,
  ) {}

  async carteraVencida(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')`,
      [empresaId],
    );
    const data = await this.ds.query(
      `SELECT p.*,
              d.nombre    AS "deudorNombre",
              d.cedula    AS "deudorCedula",
              d.telefono  AS "deudorTelefono",
              d.direccion AS "deudorDireccion",
              d.email     AS "deudorEmail"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')
       ORDER BY p."diasMoraActual" DESC LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async gestionesByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT c.*, u.nombre AS "cobradorNombreU"
       FROM pr_cobranzas c LEFT JOIN usuarios u ON u.id=c."cobradorId"
       WHERE c."prestamoId"=$1 AND c."empresaId"=$2 ORDER BY c.fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  async registrarGestion(empresaId: number, data: any) {
    const rows: any[] = await this.ds.query(
      `SELECT p.*, d.nombre AS "deudorNombre"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [data.prestamoId, empresaId],
    );
    const prestamo = rows[0];
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);

    const result: any[] = await this.ds.query(
      `INSERT INTO pr_cobranzas ("empresaId","prestamoId","deudorId","cobradorId","cobradorNombre",
        tipo,resultado,"montoPrometido","fechaPromesaPago",descripcion,"diasMoraAlMomento",
        "saldoAlMomento","proximaGestion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId, prestamo.deudorId, data.cobradorId ?? null,
       data.cobradorNombre ?? null, data.tipo ?? null, data.resultado ?? null,
       data.montoPrometido ?? null, data.fechaPromesaPago ?? null, data.descripcion,
       prestamo.diasMoraActual ?? 0, prestamo.saldoTotal ?? 0, data.proximaGestion ?? null],
    );
    return result[0];
  }

  /**
   * Envía por EMAIL un recordatorio de mora al deudor de un préstamo (manual, por el cobrador).
   * White-label: sale a nombre de la financiera (empresa del CLS) con replyTo a su email.
   * Multi-tenant: todo filtrado por empresaId (del CLS) + prestamoId. Registra la gestión SOLO
   * si el envío fue exitoso.
   */
  async notificarMora(empresaId: number, prestamoId: number, cobradorId?: number | null) {
    const [row] = await this.ds.query<any[]>(
      `SELECT p.numero, p."saldoMora", p."saldoTotal", p."cuotasVencidas", p."diasMoraActual",
              d.nombre AS "deudorNombre", d.email AS "deudorEmail",
              e."nombreComercial" AS "empresaComercial", e.nombre AS "empresaNombre",
              e.email AS "empresaEmail", e.telefono AS "empresaTelefono"
         FROM pr_prestamos p
         JOIN pr_deudores d ON d.id = p."deudorId"
         JOIN empresa     e ON e.id = p."empresaId"
        WHERE p.id = $1 AND p."empresaId" = $2`,
      [prestamoId, empresaId],
    );
    if (!row) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    if (!row.deudorEmail || !String(row.deudorEmail).includes('@')) {
      throw new BadRequestException('El deudor no tiene un email registrado');
    }

    const financiera = row.empresaComercial || row.empresaNombre || 'Su entidad financiera';
    const html   = this.buildRecordatorioMoraHtml(row, financiera);
    const asunto = `Recordatorio de pago — Préstamo ${row.numero}`;

    const { exitoso, error } = await this.emailService.enviar({
      to:      row.deudorEmail,
      subject: asunto,
      html,
      ...(row.empresaEmail ? { replyTo: row.empresaEmail } : {}),
    });

    if (!exitoso) {
      this.logger.warn(`Recordatorio de mora NO enviado (préstamo ${row.numero}): ${error}`);
      throw new BadRequestException(`No se pudo enviar el correo: ${error ?? 'error desconocido'}`);
    }

    // Constancia: registrar la gestión SOLO tras un envío exitoso.
    await this.registrarGestion(empresaId, {
      prestamoId,
      tipo:        'mensaje',
      descripcion: `Recordatorio de mora enviado por email a ${row.deudorEmail}`,
      cobradorId:  cobradorId ?? null,
    });

    this.logger.log(`Recordatorio de mora enviado a ${row.deudorEmail} (préstamo ${row.numero})`);
    return { exitoso: true, mensaje: `Recordatorio enviado a ${row.deudorEmail}` };
  }

  /** HTML del recordatorio de mora — tono aprobado (ámbar, respetuoso), white-label. */
  private buildRecordatorioMoraHtml(r: any, financiera: string): string {
    const fmt = (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const AMBAR = '#d97706';
    const contacto = [
      r.empresaTelefono ? `<p style="font-size:13px;color:#374151;margin:4px 0">📞 ${r.empresaTelefono}</p>` : '',
      r.empresaEmail    ? `<p style="font-size:13px;color:#374151;margin:4px 0">✉️ ${r.empresaEmail}</p>` : '',
    ].join('');
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Inter',Arial,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,${AMBAR},#f59e0b);padding:24px 28px">
    <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">🔔 Recordatorio de pago</div>
    <div style="font-size:20px;font-weight:800;color:#fff">Préstamo ${r.numero}</div>
  </div>
  <div style="padding:24px 28px">
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Estimado/a <strong>${r.deudorNombre}</strong>,</p>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6">
      Le escribimos para recordarle que su préstamo <strong>${r.numero}</strong> presenta
      <strong>${r.cuotasVencidas} cuota(s)</strong> pendiente(s) de pago, con
      <strong>${r.diasMoraActual} día(s)</strong> de atraso. Le agradeceríamos poder regularizar
      su situación a la mayor brevedad posible.
    </p>
    <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Cuotas vencidas</span><strong>${r.cuotasVencidas}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Días de atraso</span><strong style="color:${AMBAR}">${r.diasMoraActual}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#6b7280">Saldo en mora</span><strong>${fmt(r.saldoMora)}</strong>
      </div>
      <div style="border-top:2px solid ${AMBAR};padding-top:12px;margin-top:4px;display:flex;justify-content:space-between">
        <strong style="font-size:14px">Saldo total del préstamo</strong>
        <strong style="font-size:20px;color:${AMBAR}">${fmt(r.saldoTotal)}</strong>
      </div>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.6">
      Si usted ya realizó su pago, por favor ignore este mensaje. Para cualquier aclaración o
      para coordinar su pago, no dude en comunicarse con nosotros:
    </p>
    ${contacto}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6">
      Agradecemos su atención y quedamos a su disposición.
    </p>
  </div>
  <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 28px;text-align:center;font-size:11px;color:#9ca3af">
    <strong>${financiera}</strong> · Recordatorio de pago
  </div>
</div>
</body></html>`;
  }

  async resumenCobranza(empresaId: number) {
    const [stats] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado = 'moroso')                          AS "totalMorosos",
         COUNT(*) FILTER (WHERE estado = 'vencido')                         AS "totalVencidos",
         COALESCE(SUM("saldoMora")    FILTER (WHERE estado IN ('moroso','vencido')), 0) AS "saldoMoraTotal",
         COALESCE(SUM("saldoCapital") FILTER (WHERE estado IN ('moroso','vencido')), 0) AS "carteraVencidaTotal",
         COUNT(*) FILTER (WHERE estado NOT IN ('pagado','cancelado'))        AS "totalActivos",
         COUNT(*) FILTER (WHERE estado IN ('moroso','vencido'))              AS "totalEnMora",
         COALESCE(
           ROUND(
             COUNT(*) FILTER (WHERE estado IN ('moroso','vencido')) * 100.0
               / NULLIF(COUNT(*) FILTER (WHERE estado NOT IN ('pagado','cancelado')), 0),
             1
           ),
           0
         )                                                                   AS "indiceMorosidad"
       FROM pr_prestamos WHERE "empresaId"=$1`,
      [empresaId],
    );
    return {
      totalMorosos:       Number(stats.totalMorosos       ?? 0),
      totalVencidos:      Number(stats.totalVencidos       ?? 0),
      saldoMoraTotal:     Number(stats.saldoMoraTotal      ?? 0),
      carteraVencidaTotal:Number(stats.carteraVencidaTotal ?? 0),
      totalActivos:       Number(stats.totalActivos        ?? 0),
      totalEnMora:        Number(stats.totalEnMora         ?? 0),
      indiceMorosidad:    Number(stats.indiceMorosidad     ?? 0),
    };
  }
}
