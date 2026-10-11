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

  /**
   * Nivel de escalamiento sugerido según días de mora — puramente
   * informativo (una Tag en la UI para priorizar a quién llamar hoy), nunca
   * bloquea ni dispara nada solo. Umbrales de arranque (ver
   * docs/prestamista/decisiones-pendientes.md): 5/15/30/60 días.
   */
  private static readonly SQL_ESCALAMIENTO = `
    CASE
      WHEN p."diasMoraActual" >= 60 THEN 'legal'
      WHEN p."diasMoraActual" >= 30 THEN 'carta'
      WHEN p."diasMoraActual" >= 15 THEN 'telefonica'
      WHEN p."diasMoraActual" >= 5  THEN 'recordatorio'
      ELSE 'sin_accion'
    END`;

  /**
   * Última gestión por préstamo (DISTINCT ON por fecha) — base de
   * "diasUltimaGestion" (priorizar a quién llamar hoy) y "promesaIncumplida"
   * (la última gestión fue una promesa de pago cuya fecha ya pasó y nadie
   * registró nada después — si el cobrador hizo seguimiento, esa gestión
   * nueva pasa a ser la "última" y la bandera se apaga sola).
   */
  private static readonly SQL_ULTIMA_GESTION = `
    SELECT DISTINCT ON (c."prestamoId")
      c."prestamoId", c.fecha, c.resultado, c."fechaPromesaPago"
    FROM pr_cobranzas c
    WHERE c."empresaId" = $1
    ORDER BY c."prestamoId", c.fecha DESC`;

  async carteraVencida(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const soloCobradorId = params.cobradorId != null && params.cobradorId !== '' ? Number(params.cobradorId) : null;
    const soloPromesasIncumplidas = String(params.soloPromesasIncumplidas) === 'true';

    const filtroCobrador = soloCobradorId != null ? `AND COALESCE(p."cobradorId", p."oficialId") = $2` : '';
    const havingPromesa   = soloPromesasIncumplidas
      ? `AND ug.resultado = 'promesa_pago' AND ug."fechaPromesaPago" < CURRENT_DATE`
      : '';

    const paramsBase: any[] = [empresaId];
    if (soloCobradorId != null) paramsBase.push(soloCobradorId);

    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p
       LEFT JOIN (${CobranzaService.SQL_ULTIMA_GESTION}) ug ON ug."prestamoId" = p.id
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido') ${filtroCobrador} ${havingPromesa}`,
      paramsBase,
    );
    const data = await this.ds.query(
      `SELECT p.*,
              d.nombre    AS "deudorNombre",
              d.cedula    AS "deudorCedula",
              d.telefono  AS "deudorTelefono",
              d.direccion AS "deudorDireccion",
              d.email     AS "deudorEmail",
              COALESCE(p."cobradorId", p."oficialId")         AS "cobradorEfectivoId",
              COALESCE(p."cobradorNombre", p."oficialNombre") AS "cobradorEfectivoNombre",
              ug.fecha                                        AS "ultimaGestion",
              CASE WHEN ug.fecha IS NOT NULL
                   THEN GREATEST(0, (CURRENT_DATE - ug.fecha::date))
                   ELSE NULL END                               AS "diasUltimaGestion",
              (ug.resultado = 'promesa_pago' AND ug."fechaPromesaPago" < CURRENT_DATE) AS "promesaIncumplida",
              (${CobranzaService.SQL_ESCALAMIENTO})             AS "nivelEscalamiento"
       FROM pr_prestamos p
       JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
       LEFT JOIN (${CobranzaService.SQL_ULTIMA_GESTION}) ug ON ug."prestamoId" = p.id
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido') ${filtroCobrador} ${havingPromesa}
       ORDER BY "diasUltimaGestion" DESC NULLS FIRST, p."diasMoraActual" DESC
       LIMIT $${paramsBase.length + 1} OFFSET $${paramsBase.length + 2}`,
      [...paramsBase, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  /** Lista de usuarios activos de la empresa elegibles como cobrador — mismo criterio multi-tenant que UsersService.findAll, pero accesible a VENDEDOR/CONTADOR (no solo ADMIN) porque aquí es solo para poblar un selector. */
  async listarCobradores(empresaId: number) {
    return this.ds.query(
      `SELECT u.id, u.nombre, u.email
       FROM users u
       JOIN usuario_empresa ue ON ue."userId" = u.id
       WHERE ue."empresaId" = $1 AND ue."isActive" = true AND u."isActive" = true
       ORDER BY u.nombre ASC`,
      [empresaId],
    );
  }

  /** Asigna/reasigna de forma persistente la cartera de un préstamo a un cobrador. cobradorId null = desasignar (vuelve a sugerir el oficial). */
  async asignarCobrador(empresaId: number, prestamoId: number, cobradorId: number | null) {
    let cobradorNombre: string | null = null;
    if (cobradorId != null) {
      const [u] = await this.ds.query(`SELECT nombre FROM users u JOIN usuario_empresa ue ON ue."userId"=u.id WHERE u.id=$1 AND ue."empresaId"=$2 AND ue."isActive"=true`, [cobradorId, empresaId]);
      if (!u) throw new NotFoundException('El cobrador indicado no pertenece a esta empresa');
      cobradorNombre = u.nombre;
    }
    const result: any[] = await this.ds.query(
      `UPDATE pr_prestamos SET "cobradorId"=$1, "cobradorNombre"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "empresaId"=$4 RETURNING id, "cobradorId", "cobradorNombre"`,
      [cobradorId, cobradorNombre, prestamoId, empresaId],
    );
    if (!result[0]) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    return result[0];
  }

  async gestionesByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT c.*, u.nombre AS "cobradorNombreU"
       FROM pr_cobranzas c LEFT JOIN users u ON u.id=c."cobradorId"
       WHERE c."prestamoId"=$1 AND c."empresaId"=$2 ORDER BY c.fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  /**
   * `usuarioActual` queda SOLO como fallback: el formulario de "Registrar
   * Gestión" nunca pedía quién la hizo (bug encontrado en la auditoría de
   * Etapa 3) y toda gestión quedaba con cobradorId NULL — sin esto no hay
   * forma de calcular carga de trabajo por cobrador ni de filtrar "mi
   * cartera". Si el llamador manda cobradorId explícito (p.ej. reasignando a
   * nombre de otro cobrador) se respeta ese valor.
   */
  async registrarGestion(empresaId: number, data: any, usuarioActual?: { id: number; nombre: string }) {
    const rows: any[] = await this.ds.query(
      `SELECT p.*, d.nombre AS "deudorNombre"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [data.prestamoId, empresaId],
    );
    const prestamo = rows[0];
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);

    const cobradorId     = data.cobradorId     ?? usuarioActual?.id     ?? null;
    const cobradorNombre = data.cobradorNombre ?? usuarioActual?.nombre ?? null;

    const result: any[] = await this.ds.query(
      `INSERT INTO pr_cobranzas ("empresaId","prestamoId","deudorId","cobradorId","cobradorNombre",
        tipo,resultado,"montoPrometido","fechaPromesaPago",descripcion,"diasMoraAlMomento",
        "saldoAlMomento","proximaGestion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId, prestamo.deudorId, cobradorId,
       cobradorNombre, data.tipo ?? null, data.resultado ?? null,
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
  async notificarMora(empresaId: number, prestamoId: number, usuarioActual?: { id: number; nombre: string }) {
    const [row] = await this.ds.query<any[]>(
      `SELECT p.numero, p."saldoMora", p."saldoTotal", p."cuotasVencidas", p."diasMoraActual",
              d.nombre AS "deudorNombre", d.email AS "deudorEmail",
              e."nombreComercial" AS "empresaComercial", e.nombre AS "empresaNombre",
              e.email AS "empresaEmail", e.telefono AS "empresaTelefono"
         FROM pr_prestamos p
         JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
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
    }, usuarioActual);

    this.logger.log(`Recordatorio de mora enviado a ${row.deudorEmail} (préstamo ${row.numero})`);
    return { exitoso: true, mensaje: `Recordatorio enviado a ${row.deudorEmail}` };
  }

  /**
   * Link wa.me de recordatorio de mora — mismo mecanismo manual que
   * PagosController.whatsapp() (sin proveedor de WhatsApp Business activado
   * en ningún tenant todavía): solo arma el texto y el link, el navegador lo
   * abre. No hay forma de confirmar que el deudor lo recibió, así que —a
   * diferencia del email— NO registra una gestión sola; el cobrador registra
   * la suya desde el botón "Gestión" si corresponde.
   */
  async linkWhatsappMora(empresaId: number, prestamoId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT p.numero, p."saldoMora", p."saldoTotal", p."cuotasVencidas", p."diasMoraActual",
              d.nombre AS "deudorNombre", d.telefono AS "deudorTelefono",
              e."nombreComercial" AS "empresaComercial", e.nombre AS "empresaNombre"
         FROM pr_prestamos p
         JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
         JOIN empresa     e ON e.id = p."empresaId"
        WHERE p.id = $1 AND p."empresaId" = $2`,
      [prestamoId, empresaId],
    );
    if (!row) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);

    const fmt = (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const financiera = row.empresaComercial || row.empresaNombre || 'HiCloud ERP';
    const texto = [
      `Estimado/a *${row.deudorNombre}*,`,
      '',
      `Le recordamos que su préstamo *${row.numero}* presenta *${row.cuotasVencidas} cuota(s)*`,
      `pendiente(s) de pago, con *${row.diasMoraActual} día(s)* de atraso.`,
      '',
      `💰 Saldo en mora: *${fmt(row.saldoMora)}*`,
      `📊 Saldo total: *${fmt(row.saldoTotal)}*`,
      '',
      `Le agradecemos regularizar su situación a la brevedad posible.`,
      '',
      `_${financiera}_`,
    ].join('\n');

    const numero = String(row.deudorTelefono ?? '').replace(/\D/g, '');
    const link = numero
      ? `https://wa.me/${numero.startsWith('1') ? '' : '1809'}${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    return { texto, link, numero: numero || undefined };
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
    const [{ promesasIncumplidas }] = await this.ds.query(
      `SELECT COUNT(*) AS "promesasIncumplidas"
       FROM pr_prestamos p
       JOIN (${CobranzaService.SQL_ULTIMA_GESTION}) ug ON ug."prestamoId" = p.id
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')
         AND ug.resultado = 'promesa_pago' AND ug."fechaPromesaPago" < CURRENT_DATE`,
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
      promesasIncumplidas:Number(promesasIncumplidas       ?? 0),
    };
  }
}
