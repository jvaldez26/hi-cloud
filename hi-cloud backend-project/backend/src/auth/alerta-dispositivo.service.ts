import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { DispositivoConocido } from './entities/dispositivo-conocido.entity';
import { AlertaDispositivoToken } from './entities/alerta-dispositivo-token.entity';
import { RefreshTokenService } from './refresh-token.service';
import { EmailService } from '../notificaciones/services/email.service';
import { fechaYHoraRD } from '../common/utils/fecha-local.util';
import { CLAVE_ALERTA_DISPOSITIVO } from '../preferencias/preferencias.constants';

function esIpLocal(ip: string): boolean {
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.1')
    || ip === '127.0.0.1' || ip === '::1';
}

/** Mismo criterio que equipo-sesiones.service.ts (parsearDispositivo) — se
 *  duplica aquí a propósito: son dos flujos independientes (uno pinta la
 *  lista de "mis sesiones", el otro arma un correo) y no vale la pena
 *  acoplarlos para ahorrarse ocho líneas. */
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

interface GeoIP { codigo: string; etiqueta: string }

export interface EvaluarLoginParams {
  userId:        number;
  nombre:        string;
  email:         string;
  userCreatedAt: Date;
  ip:            string | undefined;
  userAgent:     string | undefined;
  empresaId:     number | null | undefined;
}

/**
 * Alerta de nuevo dispositivo/ubicación al iniciar sesión.
 *
 * El "dispositivo" es el User-Agent, NO la IP: el fingerprint se calcula
 * solo con navegador+userId (ver calcularFingerprint) a propósito, porque
 * el pedido explícito es "no reenviar por IP exacta" (un celular con IP
 * dinámica no debe disparar una alerta cada vez que cambia de torre). La IP
 * solo sirve para geolocalizar y mostrar en el correo.
 */
@Injectable()
export class AlertaDispositivoService {
  private readonly logger = new Logger(AlertaDispositivoService.name);

  /** IP → país resuelto. En proceso (no Redis): mismo trade-off que el caché
   *  de ubicación de EquipoSesionesService — una llamada externa que no
   *  necesita consistencia entre instancias PM2. */
  private readonly cacheGeo = new Map<string, GeoIP | null>();

  constructor(
    @InjectRepository(DispositivoConocido)
    private readonly dispositivoRepo: Repository<DispositivoConocido>,
    @InjectRepository(AlertaDispositivoToken)
    private readonly tokenRepo: Repository<AlertaDispositivoToken>,
    private readonly refreshTokenSvc: RefreshTokenService,
    private readonly emailService: EmailService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private calcularFingerprint(userId: number, userAgent: string | undefined): string {
    const normalizado = (userAgent ?? 'desconocido').trim().toLowerCase();
    return createHash('sha256').update(`${userId}|${normalizado}`).digest('hex');
  }

  private graciaMs(): number {
    const horas = Number(process.env['ALERTA_DISPOSITIVO_GRACIA_HORAS'] ?? '24');
    return (Number.isFinite(horas) && horas >= 0 ? horas : 24) * 60 * 60 * 1000;
  }

  private dedupWindowMs(): number {
    const dias = Number(process.env['ALERTA_DISPOSITIVO_DEDUP_DIAS'] ?? '30');
    return (Number.isFinite(dias) && dias >= 0 ? dias : 30) * 24 * 60 * 60 * 1000;
  }

  private async geolocalizar(ip: string | undefined): Promise<GeoIP | null> {
    if (!ip || esIpLocal(ip)) return null;
    if (this.cacheGeo.has(ip)) return this.cacheGeo.get(ip)!;
    try {
      const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(3000) });
      const d: any = await r.json();
      if (!d?.success || !d.country_code) {
        this.cacheGeo.set(ip, null);
        return null;
      }
      const etiqueta = [d.city, d.country].filter(Boolean).join(', ') || d.country_code;
      const resultado: GeoIP = { codigo: d.country_code, etiqueta };
      this.cacheGeo.set(ip, resultado);
      return resultado;
    } catch {
      this.cacheGeo.set(ip, null);
      return null;
    }
  }

  private async paisHabitualDeOtroDispositivo(userId: number): Promise<string | null> {
    const [otro] = await this.dispositivoRepo.find({
      where: { userId },
      order: { ultimaVez: 'DESC' },
      take: 1,
    });
    return otro?.pais ?? null;
  }

  private async alertaActivaParaUsuario(userId: number, empresaId: number): Promise<boolean> {
    const [fila] = await this.dataSource.query<{ valor: unknown }[]>(
      `SELECT valor FROM preferencias_usuario
        WHERE "userId" = $1 AND "empresaId" = $2 AND clave = $3 AND "isActive" = true`,
      [userId, empresaId, CLAVE_ALERTA_DISPOSITIVO],
    );
    if (!fila) return true; // nunca la tocó — activa por defecto
    return fila.valor !== false;
  }

  /**
   * Se llama al final de un login exitoso, sin esperar su resultado (fire
   * and forget) — un fallo aquí (SMTP caído, ipwho.is lento) nunca debe
   * bloquear ni romper el login. Por eso todo el cuerpo va envuelto en un
   * único try/catch que solo loguea.
   */
  async evaluarLogin(params: EvaluarLoginParams): Promise<void> {
    try {
      const fingerprint = this.calcularFingerprint(params.userId, params.userAgent);
      const ahora = new Date();

      const existente = await this.dispositivoRepo.findOne({ where: { userId: params.userId, fingerprint } });
      const geo = await this.geolocalizar(params.ip);

      // País "habitual": el del propio fingerprint si ya lo tenía, si no el
      // del dispositivo más reciente de este usuario — así un fingerprint
      // NUEVO se compara contra el país en el que este usuario normalmente
      // entra, no contra sí mismo.
      const paisHabitual = existente?.pais ?? await this.paisHabitualDeOtroDispositivo(params.userId);

      const yaVistoReciente = !!existente
        && (ahora.getTime() - existente.ultimaVez.getTime()) < this.dedupWindowMs();

      // Registrar/actualizar el dispositivo SIEMPRE — llevar el historial no
      // depende de si la notificación está activada.
      if (existente) {
        existente.ip        = params.ip ?? existente.ip;
        existente.userAgent = params.userAgent ?? existente.userAgent;
        existente.pais      = geo?.codigo ?? existente.pais;
        existente.ultimaVez = ahora;
        await this.dispositivoRepo.save(existente);
      } else {
        await this.dispositivoRepo.save(this.dispositivoRepo.create({
          userId: params.userId, fingerprint,
          ip: params.ip, userAgent: params.userAgent, pais: geo?.codigo,
          primeraVez: ahora, ultimaVez: ahora,
        }));
      }

      if (yaVistoReciente) return;

      // Ventana de gracia post-registro: el PRIMER dispositivo de una cuenta
      // nueva no dispara alerta — sería la persona reconociéndose a sí misma.
      const esPrimerDispositivoDelUsuario = !existente && !paisHabitual;
      const dentroDeGracia = esPrimerDispositivoDelUsuario
        && (ahora.getTime() - params.userCreatedAt.getTime()) < this.graciaMs();
      if (dentroDeGracia) return;

      if (!params.empresaId) return; // sin empresa activa todavía — no hay a quién avisarle "tu equipo"
      const activa = await this.alertaActivaParaUsuario(params.userId, params.empresaId);
      if (!activa) return;

      const paisDistinto = !!paisHabitual && !!geo?.codigo && paisHabitual !== geo.codigo;
      await this.enviarAlerta({
        userId: params.userId, nombre: params.nombre, email: params.email,
        ip: params.ip, userAgent: params.userAgent, geo, urgente: paisDistinto,
      });
    } catch (err) {
      this.logger.warn(`[ALERTA-DISPOSITIVO] evaluación de login fallida (no bloqueante): ${err}`);
    }
  }

  private async enviarAlerta(p: {
    userId: number; nombre: string; email: string;
    ip: string | undefined; userAgent: string | undefined;
    geo: GeoIP | null; urgente: boolean;
  }) {
    const rawToken = await this.generarTokenNoFuiYo(p.userId);
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const enlaceNoFuiYo = `${frontendUrl}/seguridad/no-fui-yo?token=${rawToken}`;

    const dispositivo = nombreDispositivo(p.userAgent);
    const ubicacion    = p.geo?.etiqueta ?? 'Ubicación no disponible';
    const fechaHora    = fechaYHoraRD();

    const asunto = p.urgente
      ? '⚠️ Ingreso desde un país distinto detectado — HiCloud ERP'
      : '🔔 Nuevo inicio de sesión detectado — HiCloud ERP';
    const colorHeader = p.urgente ? '#DC2626,#B91C1C' : '#1a56db,#0ea5e9';
    const tituloHeader = p.urgente ? '⚠️ Ingreso desde un país distinto' : '🔔 Nuevo inicio de sesión';

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
    .card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,${colorHeader});padding:28px;color:#fff;text-align:center}
    .body{padding:28px}
    .filas{width:100%;border-collapse:collapse;margin:16px 0}
    .filas td{padding:6px 0;font-size:14px}
    .filas td:first-child{color:#6b7280;width:120px}
    .btn{display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
    .footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">${tituloHeader}</h2></div>
      <div class="body">
        <p>Hola <strong>${p.nombre}</strong>,</p>
        <p>Detectamos un inicio de sesión en tu cuenta de HiCloud ERP desde un dispositivo que no reconocíamos.</p>
        <table class="filas">
          <tr><td>Fecha y hora:</td><td>${fechaHora}</td></tr>
          <tr><td>Dispositivo:</td><td>${dispositivo}</td></tr>
          <tr><td>Ubicación:</td><td>${ubicacion}</td></tr>
          <tr><td>Dirección IP:</td><td>${p.ip ?? 'No disponible'}</td></tr>
        </table>
        <p>Si fuiste tú, no tienes que hacer nada.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${enlaceNoFuiYo}" class="btn">No fui yo — proteger mi cuenta</a>
        </p>
        <p style="color:#6b7280;font-size:13px">Este enlace cierra todas tus sesiones activas y te pedirá una nueva contraseña. Expira en 24 horas.</p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;

    await this.emailService.enviar({ to: p.email, subject: asunto, html });
  }

  private async generarTokenNoFuiYo(userId: number): Promise<string> {
    const rawToken  = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.tokenRepo.save(this.tokenRepo.create({
      userId, tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      used: false,
    }));
    return rawToken;
  }

  /**
   * Confirma el enlace "No fui yo": cierra TODAS las sesiones activas y
   * obliga a configurar una contraseña nueva — reutiliza exactamente el
   * mismo mecanismo de `passwordConfigured=false` + setup_tokens que ya usan
   * los usuarios de Google sin contraseña (ver AuthService.setupPassword),
   * en vez de inventar un segundo flujo de "resetear contraseña".
   */
  async confirmarNoFuiYo(rawToken: string): Promise<{ setupToken: string }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const fila = await this.tokenRepo.findOne({ where: { tokenHash } });

    if (!fila) throw new BadRequestException('El enlace es inválido o ya fue utilizado');
    if (fila.used) throw new BadRequestException('Este enlace ya fue utilizado');
    if (fila.expiresAt < new Date()) throw new BadRequestException('El enlace ha expirado');

    fila.used = true;
    await this.tokenRepo.save(fila);

    const userId = fila.userId;

    await this.refreshTokenSvc.revocarTodos(userId, 'seguridad');
    await this.dataSource.query(
      `UPDATE users SET "sessionToken" = NULL, "passwordConfigured" = false WHERE id = $1`,
      [userId],
    );

    const setupRawToken = randomBytes(32).toString('hex');
    const setupHash     = createHash('sha256').update(setupRawToken).digest('hex');
    await this.dataSource.query(
      `UPDATE setup_tokens SET used = true WHERE "userId" = $1 AND used = false`,
      [userId],
    );
    await this.dataSource.query(
      `INSERT INTO setup_tokens ("userId", "tokenHash", "expiresAt", used) VALUES ($1, $2, $3, false)`,
      [userId, setupHash, new Date(Date.now() + 24 * 60 * 60 * 1000)],
    );

    this.logger.warn(`[ALERTA-DISPOSITIVO] "No fui yo" confirmado — sesiones cerradas, userId:${userId}`);
    return { setupToken: setupRawToken };
  }
}
