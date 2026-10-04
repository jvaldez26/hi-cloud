import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { EmailService } from '../notificaciones/services/email.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TipoNotificacion } from '../notificaciones/entities/notificacion-enviada.entity';
import { fechaYHoraRD } from '../common/utils/fecha-local.util';
import { formatMinutos } from './utils/progressive-lockout.util';

const DEDUP_EMAIL_MS = 15 * 60_000; // máximo 1 correo cada 15 min por destinatario

/** Mismo criterio que alerta-dispositivo.service.ts (nombreDispositivo) y
 *  equipo-sesiones.service.ts (parsearDispositivo) — se duplica a propósito:
 *  son flujos independientes y no vale la pena acoplarlos por ocho líneas. */
function nombreDispositivo(ua: string | undefined): string {
  if (!ua) return 'un dispositivo desconocido';
  const s = ua.toLowerCase();
  if (s.includes('iphone'))  return 'un iPhone';
  if (s.includes('ipad'))    return 'un iPad';
  if (s.includes('android')) return 'un dispositivo Android';
  if (s.includes('macintosh') || s.includes('mac os x')) return 'una Mac';
  if (s.includes('windows')) return 'una PC con Windows';
  if (s.includes('linux'))   return 'un equipo con Linux';
  return 'un dispositivo desconocido';
}

export interface AvisarBloqueoLoginParams {
  userId:           number;
  email:            string;
  nombre:           string;
  intentos:         number;
  duracionSegundos: number;
  bloqueosEn24h:    number;
  ip:               string | undefined;
  userAgent:        string | undefined;
}

/** Nivel 2 (ver LoginAttemptsService): 20 fallos en 60 min, cualquier IP. */
export interface AvisarBloqueoGlobalLoginParams {
  userId:           number;
  email:            string;
  nombre:           string;
  intentos:         number;
  duracionSegundos: number;
  ip:               string | undefined;
  userAgent:        string | undefined;
}

export interface AvisarBloqueoSupervisorParams {
  supervisorUserId: number;
  supervisorEmail:  string;
  supervisorNombre: string;
  cajeroNombre:     string;
  empresaNombre:    string;
  sucursalNombre:   string | null | undefined;
  action:           string | undefined;
  detail:           string | undefined;
  intentos:         number;
  duracionSegundos: number;
  ip:               string | undefined;
  userAgent:        string | undefined;
}

/**
 * Avisos de bloqueo por intentos fallidos — login (al dueño de la cuenta) y
 * modo supervisor (al supervisor cuya clave se intentó). Separado de
 * AuthService porque ya es un archivo enorme y esto es un bloque de lógica
 * autocontenido: construir el correo, decidir si se manda (dedup 15 min) o
 * se omite, y la campanita.
 *
 * Todo este servicio está pensado para llamarse fire-and-forget (`void
 * this.bloqueoAlertaSvc.avisarBloqueoLogin(...)`) — un fallo de SMTP nunca
 * debe retrasar ni romper la respuesta 429 al usuario. Por eso cada método
 * público envuelve su cuerpo en un único try/catch que solo loguea.
 */
@Injectable()
export class BloqueoAlertaService {
  private readonly logger = new Logger(BloqueoAlertaService.name);

  constructor(
    private readonly emailService:          EmailService,
    private readonly notificacionesService: NotificacionesService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private dedupKey(tipo: string, destinatario: string): string {
    return `bloqueo_email_dedup:${tipo}:${destinatario.toLowerCase()}`;
  }

  /** true si YA se mandó un correo de este tipo a este destinatario en los últimos 15 min. */
  private async yaSeEnvioRecientemente(tipo: string, destinatario: string): Promise<boolean> {
    return !!(await this.cache.get<boolean>(this.dedupKey(tipo, destinatario)));
  }

  private async marcarEnviado(tipo: string, destinatario: string): Promise<void> {
    await this.cache.set(this.dedupKey(tipo, destinatario), true, DEDUP_EMAIL_MS);
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────

  async avisarBloqueoLogin(p: AvisarBloqueoLoginParams): Promise<void> {
    try {
      const asunto  = '🔒 Tu cuenta de HiCloud ERP fue bloqueada temporalmente';
      const mensaje = `Tu cuenta se bloqueó ${formatMinutos(p.duracionSegundos)} tras ${p.intentos} ` +
        `intento(s) fallidos de inicio de sesión desde ${p.ip ?? 'una IP desconocida'}.`;

      // La campanita registra SIEMPRE, el correo no (dedup 15 min).
      await this.notificacionesService.notificarSistemaUsuario(
        p.userId, TipoNotificacion.LOGIN_BLOQUEADO, asunto, mensaje,
      );

      if (!(await this.yaSeEnvioRecientemente('login', p.email))) {
        await this.emailService.enviar({
          to: p.email, subject: asunto,
          html: this.htmlBloqueoLogin(p),
        });
        await this.marcarEnviado('login', p.email);
      }

      // 3+ bloqueos de la misma cuenta en 24h → aviso extra a los admins de
      // sus empresas activas: puede ser un ataque, no un simple olvido.
      if (p.bloqueosEn24h >= 3) {
        await this.avisarAdminsPosibleAcceso(
          p.userId, p.nombre, p.email,
          `La cuenta de ${p.nombre} (${p.email}) acumuló 3 o más bloqueos por intentos fallidos de login en las últimas 24 horas.`,
        );
      }
    } catch (err) {
      this.logger.warn(`avisarBloqueoLogin falló (no bloqueante) para userId=${p.userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Nivel 2 (ver LoginAttemptsService): 20 fallos en 60 min desde CUALQUIER
   * IP — señal de ataque distribuido, no un cajero despistado. A diferencia
   * del nivel 1, avisa a los admins SIEMPRE, no solo a partir de la 3ra vez:
   * llegar aquí ya es grave la primera vez.
   */
  async avisarBloqueoGlobalLogin(p: AvisarBloqueoGlobalLoginParams): Promise<void> {
    try {
      const asunto  = '🚨 Posible ataque a tu cuenta de HiCloud ERP — bloqueada temporalmente';
      const mensaje = `Se detectaron ${p.intentos} intentos fallidos de inicio de sesión desde varias ` +
        `direcciones en la última hora. Tu cuenta se bloqueó ${formatMinutos(p.duracionSegundos)} como protección.`;

      await this.notificacionesService.notificarSistemaUsuario(
        p.userId, TipoNotificacion.LOGIN_BLOQUEADO, asunto, mensaje,
      );

      if (!(await this.yaSeEnvioRecientemente('login-global', p.email))) {
        await this.emailService.enviar({ to: p.email, subject: asunto, html: this.htmlBloqueoGlobalLogin(p) });
        await this.marcarEnviado('login-global', p.email);
      }

      await this.avisarAdminsPosibleAcceso(
        p.userId, p.nombre, p.email,
        `La cuenta de ${p.nombre} (${p.email}) recibió ${p.intentos} intentos fallidos de login desde varias ` +
        `direcciones distintas en la última hora — posible ataque distribuido.`,
      );
    } catch (err) {
      this.logger.warn(`avisarBloqueoGlobalLogin falló (no bloqueante) para userId=${p.userId}: ${(err as Error).message}`);
    }
  }

  private async avisarAdminsPosibleAcceso(
    userId: number, nombreCuenta: string, emailCuenta: string, mensaje: string,
  ): Promise<void> {
    const empresas = await this.dataSource.query<{ empresaId: number; nombre: string }[]>(
      `SELECT ue."empresaId" AS "empresaId", e.nombre
       FROM usuario_empresa ue
       JOIN empresa e ON e.id = ue."empresaId"
       WHERE ue."userId" = $1 AND ue."isActive" = true AND e."isActive" = true`,
      [userId],
    );

    const asunto = `⚠️ Posible intento de acceso no autorizado a la cuenta de ${nombreCuenta}`;

    for (const emp of empresas) {
      await this.notificacionesService.notificarSistemaEmpresa(
        emp.empresaId, TipoNotificacion.POSIBLE_ACCESO_NO_AUTORIZADO, asunto, mensaje,
      );

      const emails = await this.notificacionesService.getAdminEmails(emp.empresaId);
      for (const dest of emails) {
        if (await this.yaSeEnvioRecientemente('acceso-admin', dest)) continue;
        await this.emailService.enviar({
          to: dest, subject: asunto,
          html: this.htmlAlertaAdmin(nombreCuenta, emailCuenta, emp.nombre, mensaje),
        });
        await this.marcarEnviado('acceso-admin', dest);
      }
    }
  }

  // ── SUPERVISOR ─────────────────────────────────────────────────────────

  async avisarBloqueoSupervisor(p: AvisarBloqueoSupervisorParams): Promise<void> {
    try {
      const asunto  = '🔒 Tu autorización de supervisor fue bloqueada temporalmente';
      const mensaje = `Se bloqueó ${formatMinutos(p.duracionSegundos)} tras ${p.intentos} intento(s) ` +
        `fallidos de ${p.cajeroNombre} intentando autorizar${p.action ? ` "${p.action}"` : ' una acción'} ` +
        `en ${p.empresaNombre}${p.sucursalNombre ? ` (${p.sucursalNombre})` : ''}.`;

      await this.notificacionesService.notificarSistemaUsuario(
        p.supervisorUserId, TipoNotificacion.SUPERVISOR_BLOQUEADO, asunto, mensaje,
      );

      if (!(await this.yaSeEnvioRecientemente('supervisor', p.supervisorEmail))) {
        await this.emailService.enviar({
          to: p.supervisorEmail, subject: asunto,
          html: this.htmlBloqueoSupervisor(p),
        });
        await this.marcarEnviado('supervisor', p.supervisorEmail);
      }
    } catch (err) {
      this.logger.warn(`avisarBloqueoSupervisor falló (no bloqueante) para supervisorUserId=${p.supervisorUserId}: ${(err as Error).message}`);
    }
  }

  // ── Plantillas ─────────────────────────────────────────────────────────

  private estiloBase(): string {
    return `body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
    .card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,#DC2626,#B91C1C);padding:28px;color:#fff;text-align:center}
    .body{padding:28px}
    .filas{width:100%;border-collapse:collapse;margin:16px 0}
    .filas td{padding:6px 0;font-size:14px}
    .filas td:first-child{color:#6b7280;width:140px}
    .btn{display:inline-block;background:#1B4FD8;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
    .footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}`;
  }

  private htmlBloqueoLogin(p: AvisarBloqueoLoginParams): string {
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${this.estiloBase()}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">🔒 Cuenta bloqueada temporalmente</h2></div>
      <div class="body">
        <p>Hola <strong>${p.nombre}</strong>,</p>
        <p>Tu cuenta de HiCloud ERP se bloqueó temporalmente por demasiados intentos fallidos de inicio de sesión.</p>
        <table class="filas">
          <tr><td>Intentos:</td><td>${p.intentos}</td></tr>
          <tr><td>Fecha y hora:</td><td>${fechaYHoraRD()}</td></tr>
          <tr><td>Dirección IP:</td><td>${p.ip ?? 'No disponible'}</td></tr>
          <tr><td>Dispositivo:</td><td>${nombreDispositivo(p.userAgent)}</td></tr>
          <tr><td>Duración del bloqueo:</td><td>${formatMinutos(p.duracionSegundos)}</td></tr>
        </table>
        <p>Si fuiste tú, espera el tiempo indicado e intenta de nuevo.</p>
        <p style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;border-radius:6px;color:#7F1D1D">
          <strong>Si no fuiste tú</strong>, cambia tu contraseña de inmediato.
        </p>
        <p style="text-align:center;margin:28px 0">
          <a href="${frontendUrl}/recuperar-contrasena" class="btn">Cambiar mi contraseña</a>
        </p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;
  }

  private htmlBloqueoGlobalLogin(p: AvisarBloqueoGlobalLoginParams): string {
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${this.estiloBase()}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">🚨 Posible ataque a tu cuenta</h2></div>
      <div class="body">
        <p>Hola <strong>${p.nombre}</strong>,</p>
        <p>Tu cuenta de HiCloud ERP recibió <strong>${p.intentos} intentos fallidos de inicio de sesión
        desde varias direcciones distintas</strong> en la última hora — no desde un solo lugar, como
        suele pasar cuando alguien olvida su contraseña. Por seguridad, la bloqueamos temporalmente.</p>
        <table class="filas">
          <tr><td>Intentos (1h):</td><td>${p.intentos}</td></tr>
          <tr><td>Fecha y hora:</td><td>${fechaYHoraRD()}</td></tr>
          <tr><td>Última IP:</td><td>${p.ip ?? 'No disponible'}</td></tr>
          <tr><td>Dispositivo:</td><td>${nombreDispositivo(p.userAgent)}</td></tr>
          <tr><td>Duración del bloqueo:</td><td>${formatMinutos(p.duracionSegundos)}</td></tr>
        </table>
        <p style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;border-radius:6px;color:#7F1D1D">
          <strong>Si no fuiste tú</strong>, cambia tu contraseña de inmediato — esto parece un intento de
          acceder a tu cuenta, no un simple olvido.
        </p>
        <p style="text-align:center;margin:28px 0">
          <a href="${frontendUrl}/recuperar-contrasena" class="btn">Cambiar mi contraseña</a>
        </p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;
  }

  private htmlBloqueoSupervisor(p: AvisarBloqueoSupervisorParams): string {
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${this.estiloBase()}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">🔒 Autorización de supervisor bloqueada</h2></div>
      <div class="body">
        <p>Hola <strong>${p.supervisorNombre}</strong>,</p>
        <p>Se bloqueó temporalmente la autorización de supervisor por demasiados intentos fallidos.</p>
        <table class="filas">
          <tr><td>Cajero:</td><td>${p.cajeroNombre}</td></tr>
          <tr><td>Empresa:</td><td>${p.empresaNombre}</td></tr>
          ${p.sucursalNombre ? `<tr><td>Sucursal:</td><td>${p.sucursalNombre}</td></tr>` : ''}
          <tr><td>Acción intentada:</td><td>${p.action ?? 'No especificada'}${p.detail ? ` — ${p.detail}` : ''}</td></tr>
          <tr><td>Intentos:</td><td>${p.intentos}</td></tr>
          <tr><td>Fecha y hora:</td><td>${fechaYHoraRD()}</td></tr>
          <tr><td>Dirección IP:</td><td>${p.ip ?? 'No disponible'}</td></tr>
          <tr><td>Dispositivo:</td><td>${nombreDispositivo(p.userAgent)}</td></tr>
          <tr><td>Duración del bloqueo:</td><td>${formatMinutos(p.duracionSegundos)}</td></tr>
        </table>
        <p>Si fuiste tú, espera el tiempo indicado e intenta de nuevo.</p>
        <p style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;border-radius:6px;color:#7F1D1D">
          <strong>Si no fuiste tú</strong>, cambia tu contraseña o PIN de supervisor de inmediato.
        </p>
        <p style="text-align:center;margin:28px 0">
          <a href="${frontendUrl}/recuperar-contrasena" class="btn">Cambiar mi contraseña</a>
        </p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;
  }

  private htmlAlertaAdmin(nombreCuenta: string, emailCuenta: string, empresaNombre: string, mensaje: string): string {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${this.estiloBase()}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">⚠️ Posible intento de acceso no autorizado</h2></div>
      <div class="body">
        <p>En tu empresa <strong>${empresaNombre}</strong>: ${mensaje}</p>
        <p>Si ${nombreCuenta} (${emailCuenta}) confirma que no fue él/ella, considera pedirle que cambie su contraseña.</p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;
  }
}
