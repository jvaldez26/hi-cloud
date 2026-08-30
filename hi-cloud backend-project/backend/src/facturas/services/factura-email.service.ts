import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Factura } from '../entities/factura.entity';
import { PDFService } from './pdf.service';
import { EmailService } from '../../notificaciones/services/email.service';

export interface ResultadoEnvio {
  ok:       boolean;
  destino:  string | null;
  error?:   string;
  /** Copias que fueron con el envío (administrativo). */
  copias:   string[];
}

/**
 * Envío de una factura al cliente, con el PDF adjunto.
 *
 * Vivía dentro del servicio de recurrentes como un método privado disparado en
 * fire-and-forget con un `logger.warn` en el catch. Eso significaba tres cosas:
 * el fallo no se guardaba en ninguna parte, no había forma de reintentarlo, y
 * ninguna otra pantalla podía mandar una factura por correo.
 *
 * Ahora el resultado se escribe en la propia factura (emailEstado, emailError,
 * emailIntentos…) y el reenvío es un endpoint más del módulo de facturas, así
 * que sirve para cualquier factura, venga de donde venga.
 *
 * Un correo que rebota NUNCA deshace la factura. La factura ya existe, y si
 * lleva comprobante fiscal ya se le declaró a la DGII: lo único que queda es
 * dejar constancia y ofrecer el botón de reenviar.
 */
@Injectable()
export class FacturaEmailService {
  private readonly logger = new Logger(FacturaEmailService.name);

  constructor(
    @InjectRepository(Factura) private readonly facturaRepo: Repository<Factura>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly pdfService:   PDFService,
    private readonly emailService: EmailService,
    private readonly config:       ConfigService,
  ) {}

  /**
   * @param automatico  true cuando lo dispara el cron de recurrentes: entonces
   *                    respeta el interruptor `autoEmailFacturaRecurrente` de la
   *                    empresa. Un reenvío a mano siempre manda.
   */
  async enviar(
    facturaId: number,
    empresaId: number,
    opts: { automatico?: boolean; conCopiaAdmin?: boolean } = {},
  ): Promise<ResultadoEnvio> {
    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId, isActive: true },
      relations: ['cliente', 'detalles', 'detalles.producto'],
    });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const [emp] = await this.ds.query<{
      configuracion: any; nombre: string; nombreComercial: string | null;
      email: string | null; rnc: string | null;
    }[]>(
      `SELECT configuracion, nombre, "nombreComercial", email, rnc
         FROM empresa WHERE id = $1 AND "isActive" = true`,
      [empresaId],
    );
    if (!emp) throw new NotFoundException(`Empresa #${empresaId} no encontrada`);

    const cfg = (emp.configuracion ?? {}) as Record<string, unknown>;
    if (opts.automatico && cfg.autoEmailFacturaRecurrente === false) {
      this.logger.debug(
        `[FacturaEmail] autoEmailFacturaRecurrente apagado en la empresa #${empresaId} — se omite`,
      );
      return { ok: true, destino: null, copias: [] };
    }

    const destino = String(factura.cliente?.email ?? '').trim();
    if (!destino) {
      const error = `El cliente "${factura.cliente?.nombre ?? factura.clienteId}" no tiene correo en su ficha.`;
      await this.registrar(factura.id, { ok: false, destino: null, error, copias: [] });
      if (!opts.automatico) throw new BadRequestException(error);
      this.logger.debug(`[FacturaEmail] ${factura.folio}: ${error}`);
      return { ok: false, destino: null, error, copias: [] };
    }

    const copias: string[] = [];
    if (opts.conCopiaAdmin !== false) {
      // El administrativo sale de la configuración, no del código. Primero el
      // correo que la empresa haya puesto para sus copias, y si no, el global.
      const adminEmpresa = String(cfg.emailCopiaFacturas ?? '').trim();
      const adminGlobal  = this.config.get<string>('NOTIF_ADMIN_EMAIL', '').trim();
      const copia = adminEmpresa || adminGlobal;
      if (copia && copia.toLowerCase() !== destino.toLowerCase()) copias.push(copia);
    }

    try {
      const { buffer, filename } = await this.pdfService.generarPDFDesdeEntidad(factura, empresaId);
      const encf = await this.encfDe(factura);

      const resultado = await this.emailService.enviar({
        to:  destino,
        // Oculta: el cliente no tiene por qué ver el correo interno de la empresa.
        bcc: copias.length ? copias : undefined,
        replyTo: emp.email ?? undefined,
        subject: encf
          ? `Factura ${factura.folio} (${encf}) — ${emp.nombreComercial || emp.nombre}`
          : `Factura ${factura.folio} — ${emp.nombreComercial || emp.nombre}`,
        html: this.cuerpo(factura, emp, encf),
        attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
      });

      if (!resultado.exitoso) throw new Error(resultado.error ?? 'El servidor de correo rechazó el envío');

      await this.registrar(factura.id, { ok: true, destino, copias });
      this.logger.log(
        `[FacturaEmail] ${factura.folio} enviada a ${destino}` +
        (copias.length ? ` (copia a ${copias.join(', ')})` : ''),
      );
      return { ok: true, destino, copias };
    } catch (err) {
      const error = (err as Error).message;
      await this.registrar(factura.id, { ok: false, destino, error, copias });
      this.logger.error(`[FacturaEmail] ${factura.folio} falló hacia ${destino}: ${error}`);
      // Un reenvío a mano sí devuelve el error a quien pulsó el botón.
      if (!opts.automatico) throw new BadRequestException(`No se pudo enviar el correo: ${error}`);
      return { ok: false, destino, error, copias };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  /** eNCF del comprobante fiscal de la factura, si lo lleva. */
  private async encfDe(factura: Factura): Promise<string | null> {
    if (!factura.ecfId) return null;
    const [ecf] = await this.ds.query<{ numero: string }[]>(
      `SELECT numero FROM ecf WHERE id = $1 LIMIT 1`,
      [factura.ecfId],
    );
    return ecf?.numero ?? null;
  }

  private cuerpo(
    factura: Factura,
    emp: { nombre: string; nombreComercial: string | null; rnc: string | null },
    encf: string | null,
  ): string {
    const empresaNombre = emp.nombreComercial || emp.nombre || 'HiCloud ERP';
    const clienteNombre = factura.cliente?.nombre || 'Cliente';
    const total = Number(factura.total ?? 0).toLocaleString('es-DO', {
      style: 'currency', currency: factura.moneda || 'DOP',
    });

    const consulta = encf && emp.rnc
      ? `https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${emp.rnc}&eNCF=${encf}`
      : null;

    const vence = factura.fechaVencimiento
      ? new Date(factura.fechaVencimiento).toLocaleDateString('es-DO', {
          timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric',
        })
      : null;

    return `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#0F172A;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="color:#F59E0B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">
            📄 Factura — ${empresaNombre}
          </div>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px">
          <p style="margin:0 0 12px;color:#0F172A;font-size:14px">
            Estimado/a <strong>${clienteNombre}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#475569;font-size:13px">
            Adjunto encontrará la factura <strong>${factura.folio}</strong> por un total de
            <strong>${total}</strong>.
          </p>
          ${encf ? `
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 14px;margin:0 0 16px">
              <div style="color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.06em">
                Comprobante Fiscal Electrónico
              </div>
              <div style="color:#0F172A;font-size:15px;font-weight:700;margin-top:2px">${encf}</div>
              ${consulta ? `
                <a href="${consulta}" style="color:#2563EB;font-size:12px;text-decoration:none">
                  Verificarlo en el portal de la DGII →
                </a>` : ''}
            </div>` : ''}
          ${vence ? `
            <p style="margin:0 0 16px;color:#475569;font-size:13px">
              Fecha de vencimiento: <strong>${vence}</strong>
              ${factura.diasCredito ? ` (${factura.diasCredito} días de plazo)` : ''}.
            </p>` : ''}
          <p style="margin:0 0 8px;color:#475569;font-size:13px">
            Para consultas sobre esta factura, no dude en contactarnos.
          </p>
          <p style="color:#94A3B8;font-size:11px;margin:16px 0 0;border-top:1px solid #F1F5F9;padding-top:12px">
            ${empresaNombre} · Enviada automáticamente por HiCloud ERP
          </p>
        </div>
      </div>`;
  }

  /** Deja el resultado del envío escrito en la propia factura. */
  private async registrar(facturaId: number, r: ResultadoEnvio): Promise<void> {
    await this.ds.query(
      `UPDATE facturas
          SET "emailEstado"    = $2,
              "emailDestino"   = $3,
              "emailError"     = $4,
              "emailEnviadoAt" = CASE WHEN $2 = 'enviado' THEN now() ELSE "emailEnviadoAt" END,
              "emailIntentos"  = "emailIntentos" + 1,
              "updatedAt"      = now()
        WHERE id = $1`,
      [facturaId, r.ok ? 'enviado' : 'fallido', r.destino, r.ok ? null : (r.error ?? null)],
    ).catch(err =>
      this.logger.warn(
        `[FacturaEmail] No se pudo registrar el envío de la factura #${facturaId}: ${err?.message}`,
      ),
    );
  }
}
