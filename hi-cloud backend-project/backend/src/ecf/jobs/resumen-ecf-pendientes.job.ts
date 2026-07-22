import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EmailService } from '../../notificaciones/services/email.service';
import { reportServiceError } from '../../common/observability/sentry';

/**
 * Cada hora: si hay e-CF en OBSERVADO o CONTINGENCIA sin notificar,
 * envía UN email agrupado por empresa al super admin global.
 * Si no hay ninguno, no envía nada.
 *
 * Idempotencia: campo notificadoResumen (distinto de superAdminNotificado,
 * que cubre exclusivamente los RECHAZADOS del alert inmediato).
 */
@Injectable()
export class ResumenEcfPendientesJob {
  private readonly logger = new Logger(ResumenEcfPendientesJob.name);
  private running = false;

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,
    private readonly emailSvc: EmailService,
    private readonly configSvc: ConfigService,
  ) {}

  @Cron('0 * * * *', { name: 'resumen-ecf-pendientes' })
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.enviarResumenSiHayPendientes();
    } finally {
      this.running = false;
    }
  }

  private async enviarResumenSiHayPendientes(): Promise<void> {
    const pendientes = await this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII IN (:...estados)', {
        estados: [EstadoDGII.OBSERVADO, EstadoDGII.CONTINGENCIA],
      })
      .andWhere('ecf.notificadoResumen = false')
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.empresaId IS NOT NULL')
      .getMany();

    if (pendientes.length === 0) {
      this.logger.debug('ResumenECF: sin pendientes — no se envía email');
      return;
    }

    this.logger.log(`ResumenECF: ${pendientes.length} e-CF(s) pendientes de notificación`);

    // Lookup batch de empresas (una query, no N queries)
    const empresaIds = [...new Set(pendientes.map(e => e.empresaId!))];
    const empresaRows = await this.ecfRepo.manager.query(
      `SELECT id, "nombreComercial", rnc FROM empresa WHERE id = ANY($1)`,
      [empresaIds],
    ) as { id: number; nombreComercial: string; rnc: string }[];
    const empresaMap = new Map(empresaRows.map(e => [e.id, e]));

    // Agrupar por empresa
    const porEmpresa = new Map<number, ECF[]>();
    for (const ecf of pendientes) {
      if (!porEmpresa.has(ecf.empresaId!)) porEmpresa.set(ecf.empresaId!, []);
      porEmpresa.get(ecf.empresaId!)!.push(ecf);
    }

    const adminEmail = this.configSvc.get<string>('NOTIF_ADMIN_EMAIL', '')
      || process.env['SUPER_ADMIN_EMAIL']
      || 'admin@hicloudrd.com';

    const totalObs  = pendientes.filter(e => e.estadoDGII === EstadoDGII.OBSERVADO).length;
    const totalCont = pendientes.filter(e => e.estadoDGII === EstadoDGII.CONTINGENCIA).length;

    const partes: string[] = [];
    if (totalObs  > 0) partes.push(`${totalObs} observado${totalObs > 1 ? 's' : ''}`);
    if (totalCont > 0) partes.push(`${totalCont} en contingencia`);

    const result = await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `⚠️ Resumen e-CF — ${partes.join(' · ')} sin notificar`,
      html:    this.buildHtml(porEmpresa, empresaMap, totalObs, totalCont),
    });

    if (result.exitoso) {
      const ids = pendientes.map(e => e.id);
      await this.ecfRepo.manager.query(
        `UPDATE ecf SET "notificadoResumen" = true WHERE id = ANY($1)`,
        [ids],
      );
      this.logger.log(`ResumenECF: ${pendientes.length} e-CF(s) → notificadoResumen=true`);
    } else {
      reportServiceError(
        new Error(result.error ?? 'Fallo al enviar resumen de e-CF pendientes'),
        'ecf_resumen_notif_email',
        {
          total:       String(pendientes.length),
          observados:  String(totalObs),
          contingencias: String(totalCont),
        },
      );
      this.logger.warn('ResumenECF: email fallido — se reintentará en la próxima pasada');
    }
  }

  private buildHtml(
    porEmpresa: Map<number, ECF[]>,
    empresaMap: Map<number, { id: number; nombreComercial: string; rnc: string }>,
    totalObs:  number,
    totalCont: number,
  ): string {
    const partes: string[] = [];
    if (totalObs  > 0) partes.push(`<strong>${totalObs}</strong> observado${totalObs > 1 ? 's' : ''} (aceptado condicional)`);
    if (totalCont > 0) partes.push(`<strong>${totalCont}</strong> en contingencia (pendiente de transmitir)`);

    let html = `
<p>Los siguientes comprobantes fiscales electrónicos requieren atención:</p>
<p style="margin:4px 0">${partes.join(' y ')}, agrupados por empresa.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
`;

    for (const [empresaId, ecfs] of porEmpresa) {
      const emp      = empresaMap.get(empresaId);
      const empLabel = emp?.nombreComercial ?? `Empresa #${empresaId}`;
      const empRnc   = emp?.rnc ?? '';

      const observados    = ecfs.filter(e => e.estadoDGII === EstadoDGII.OBSERVADO);
      const contingencias = ecfs.filter(e => e.estadoDGII === EstadoDGII.CONTINGENCIA);

      html += `
<div style="margin-bottom:28px">
  <h3 style="margin:0 0 4px;font-size:15px;color:#111">
    ${empLabel}${empRnc ? ` <span style="font-weight:400;color:#555;font-size:13px">· RNC ${empRnc}</span>` : ''}
  </h3>`;

      if (observados.length > 0) {
        html += `
  <h4 style="margin:12px 0 6px;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:.06em">
    Observados — Aceptado Condicional (${observados.length})
  </h4>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#fef3c7">
        <th style="padding:6px 8px;text-align:left;color:#78350f;font-weight:600">e-NCF</th>
        <th style="padding:6px 8px;text-align:left;color:#78350f;font-weight:600">Tipo</th>
        <th style="padding:6px 8px;text-align:right;color:#78350f;font-weight:600">Monto</th>
        <th style="padding:6px 8px;text-align:left;color:#78350f;font-weight:600">Comprador</th>
        <th style="padding:6px 8px;text-align:left;color:#78350f;font-weight:600">Fecha</th>
        <th style="padding:6px 8px;text-align:left;color:#78350f;font-weight:600">Observación DGII</th>
      </tr>
    </thead>
    <tbody>`;

        for (const ecf of observados) {
          const mensajes  = this.extractMensajes(ecf.respuestaDgii);
          const obsTexto  = mensajes.length
            ? mensajes.map(m => `[${m.codigo}] ${m.valor}`).join('; ')
            : '—';
          html += `
      <tr style="border-bottom:1px solid #fde68a">
        <td style="padding:6px 8px;font-family:monospace;white-space:nowrap">${ecf.numero}</td>
        <td style="padding:6px 8px">${ecf.numero.substring(0, 3).toUpperCase()}</td>
        <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${this.fmtMonto(ecf.montoTotal)}</td>
        <td style="padding:6px 8px">${ecf.razonSocialComprador ?? 'Consumidor Final'}${ecf.rncComprador ? ` (${ecf.rncComprador})` : ''}</td>
        <td style="padding:6px 8px;white-space:nowrap">${this.fmtFecha(ecf.createdAt)}</td>
        <td style="padding:6px 8px;color:#92400e">${obsTexto}</td>
      </tr>`;
        }

        html += `
    </tbody>
  </table>`;
      }

      if (contingencias.length > 0) {
        html += `
  <h4 style="margin:12px 0 6px;font-size:12px;color:#1e40af;text-transform:uppercase;letter-spacing:.06em">
    Contingencia — Pendiente de transmitir (${contingencias.length})
  </h4>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#dbeafe">
        <th style="padding:6px 8px;text-align:left;color:#1e3a8a;font-weight:600">e-NCF</th>
        <th style="padding:6px 8px;text-align:left;color:#1e3a8a;font-weight:600">Tipo</th>
        <th style="padding:6px 8px;text-align:right;color:#1e3a8a;font-weight:600">Monto</th>
        <th style="padding:6px 8px;text-align:left;color:#1e3a8a;font-weight:600">Comprador</th>
        <th style="padding:6px 8px;text-align:left;color:#1e3a8a;font-weight:600">Fecha</th>
        <th style="padding:6px 8px;text-align:left;color:#1e3a8a;font-weight:600">Detalle</th>
      </tr>
    </thead>
    <tbody>`;

        for (const ecf of contingencias) {
          const detalle = (ecf.respuestaDgii as any)?.message
            ?? 'Sin respuesta de MSeller — pendiente de transmitir a DGII';
          html += `
      <tr style="border-bottom:1px solid #bfdbfe">
        <td style="padding:6px 8px;font-family:monospace;white-space:nowrap">${ecf.numero}</td>
        <td style="padding:6px 8px">${ecf.numero.substring(0, 3).toUpperCase()}</td>
        <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${this.fmtMonto(ecf.montoTotal)}</td>
        <td style="padding:6px 8px">${ecf.razonSocialComprador ?? 'Consumidor Final'}${ecf.rncComprador ? ` (${ecf.rncComprador})` : ''}</td>
        <td style="padding:6px 8px;white-space:nowrap">${this.fmtFecha(ecf.createdAt)}</td>
        <td style="padding:6px 8px;color:#1e40af">${detalle}</td>
      </tr>`;
        }

        html += `
    </tbody>
  </table>`;
      }

      html += `\n</div>`;
    }

    html += `
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
<p style="margin:0">Gestionar desde <em>Super Admin → Módulo e-CF</em>.</p>
<p style="color:#9ca3af;font-size:11px;margin-top:16px">HiCloud ERP — Resumen automático de comprobantes pendientes</p>`;

    return html;
  }

  private extractMensajes(
    respuestaDgii: Record<string, unknown> | undefined,
  ): { codigo: string; valor: string }[] {
    const dgiiItems = ((respuestaDgii as any)?.dgiiResponse as any[]) ?? [];
    return dgiiItems.flatMap((d: any) =>
      ((d?.mensajes ?? []) as any[]).map((m: any) => ({
        codigo: String(m.codigo ?? m.codigoMensaje ?? '?'),
        valor:  String(m.valor ?? m.descripcion ?? m.mensaje ?? JSON.stringify(m)),
      })),
    );
  }

  private fmtMonto(monto: number | string | null | undefined): string {
    if (monto == null) return 'N/D';
    return `RD$${Number(monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  }

  private fmtFecha(fecha: Date | string | undefined): string {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo' });
  }
}
