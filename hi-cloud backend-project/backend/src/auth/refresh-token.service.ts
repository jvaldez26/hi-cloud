import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { RefreshToken } from './entities/refresh-token.entity';
import { SessionLifetimeService } from './session-lifetime.service';

const GRACE_PERIOD_MS = 15_000; // 15 s — ventana para race condition multi-pestaña

/**
 * Throttle de escritura de `lastActivityAt`. La actividad la reporta el frontend
 * (POST /auth/actividad) como mucho cada 5 min, pero el throttle vive aquí para
 * que un cliente que ignore su propio throttle no genere un UPDATE por llamada.
 */
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  /** userId → timestamp del último UPDATE de lastActivityAt. Se purga por TTL. */
  private readonly activityThrottle = new Map<number, number>();

  constructor(
    @InjectRepository(RefreshToken)
    private repo: Repository<RefreshToken>,
    @InjectDataSource()
    private dataSource: DataSource,
    private sessionLifetime: SessionLifetimeService,
  ) {}

  /** Genera un refresh token aleatorio, lo guarda en BD y devuelve el valor en texto plano. */
  async crear(userId: number, deviceInfo?: string, ipAddress?: string, sessionLifetimeMs?: number): Promise<string> {
    return (await this.crearRegistro(userId, deviceInfo, ipAddress, sessionLifetimeMs)).value;
  }

  /** Valida el refresh token, lo rota y devuelve el userId + nuevo valor. */
  async rotar(
    value: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<{ userId: number; newRefreshValue: string }> {
    const hash = this.hash(value);

    // ── Caso normal: token activo ─────────────────────────────────────────────
    const stored = await this.repo.findOne({ where: { tokenHash: hash, revokedAt: IsNull() } });

    if (stored) {
      if (stored.expiresAt < new Date()) {
        await this.repo.update(stored.id, { revokedAt: new Date(), motivoRevocacion: 'rotacion' });
        throw new UnauthorizedException('Sesión expirada. Por favor inicia sesión de nuevo.');
      }

      const sessionLifetimeMs = await this.sessionLifetime.paraUsuario(stored.userId);

      // Crear el token nuevo primero para obtener su ID (necesario para nextTokenId)
      const { id: newId, value: newValue } = await this.crearRegistro(
        stored.userId,
        deviceInfo,
        ipAddress,
        sessionLifetimeMs,
      );

      // Revocar el viejo con referencia al nuevo (permite grace period multi-pestaña)
      await this.repo.update(stored.id, {
        revokedAt:        new Date(),
        motivoRevocacion: 'rotacion',
        nextTokenId:      newId,
      });

      return { userId: stored.userId, newRefreshValue: newValue };
    }

    // ── Grace period: race condition multi-pestaña ────────────────────────────
    // Si el token fue revocado por ROTACIÓN hace menos de GRACE_PERIOD_MS, otra
    // pestaña ya lo rotó. Emitimos un nuevo token sin revocar el sucesor (que
    // la otra pestaña ya está usando).
    const revocado = await this.repo.findOne({ where: { tokenHash: hash } });

    if (
      revocado?.motivoRevocacion === 'rotacion' &&
      revocado.revokedAt &&
      Date.now() - revocado.revokedAt.getTime() < GRACE_PERIOD_MS
    ) {
      const sessionLifetimeMs = await this.sessionLifetime.paraUsuario(revocado.userId);
      const newValue = await this.crear(revocado.userId, deviceInfo, ipAddress, sessionLifetimeMs);
      return { userId: revocado.userId, newRefreshValue: newValue };
    }

    // ── Revocado por logout / seguridad / expirado → siempre rechazar ─────────
    throw new UnauthorizedException('Sesión expirada. Por favor inicia sesión de nuevo.');
  }

  /** Revoca todos los refresh tokens de un usuario (logout). */
  async revocarTodos(userId: number): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), motivoRevocacion: 'logout' },
    );
  }

  /** Revoca un token específico por su valor en texto plano. */
  async revocarUno(
    value: string,
    motivo: 'rotacion' | 'logout' | 'seguridad' = 'logout',
  ): Promise<void> {
    const hash = this.hash(value);
    await this.repo.update({ tokenHash: hash }, { revokedAt: new Date(), motivoRevocacion: motivo });
  }

  /** Revoca una sesión activa por su UUID, verificando que pertenezca al usuario. */
  async revocarPorId(id: string, userId: number): Promise<void> {
    await this.repo.update(
      { id, userId, revokedAt: IsNull() },
      { revokedAt: new Date(), motivoRevocacion: 'logout' },
    );
  }

  /** Lista sesiones activas de un usuario (para "dispositivos conectados"). */
  async sesionesActivas(userId: number) {
    return this.repo.find({
      where: { userId, revokedAt: IsNull() },
      select: ['id', 'deviceInfo', 'ipAddress', 'createdAt', 'expiresAt', 'lastActivityAt'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── Actividad real del usuario ───────────────────────────────────────────────

  /**
   * Marca que una PERSONA está usando la sesión. Fire-and-forget.
   *
   * ── Por qué esto no se deduce del tráfico ────────────────────────────────
   * Antes lo escribía TenantMiddleware en cada request autenticado. Eso medía
   * tráfico, no presencia: hay ~40 `refetchInterval` en el frontend (el POS
   * sondea cada 30 s, la caja cada 5 s) y ninguna de esas peticiones la hace
   * una persona. Un POS olvidado en el mostrador toda la noche se marcaba como
   * activo hasta la mañana siguiente.
   *
   * No se puede clasificar la petición: leer un reporte o navegar el ERP son
   * GET igual que un sondeo, y el mismo endpoint lo llaman el `refetchInterval`
   * y el usuario al pulsar refrescar. El único sitio que sabe POR QUÉ ocurre
   * una petición es el cliente, y la única señal que un sondeo no puede
   * falsificar es la entrada física: ratón, teclado, scroll, tacto.
   *
   * Por eso la actividad la reporta el frontend desde los eventos de entrada
   * (useActividadUsuario) y no se infiere aquí de nada.
   *
   * ── Sobre confiar en el cliente ──────────────────────────────────────────
   * Sí, esto es autoinformado. No baja el listón: quien tiene una sesión válida
   * ya podía mantenerla viva sondeando, que es más fácil que llamar a esto. El
   * control de seguridad NO es este — es el tope absoluto de sesión, que se
   * calcula en el servidor desde `users.sessionCreatedAt` y no se puede
   * falsificar. Esto es un control de comodidad contra la pestaña olvidada.
   * No lo "endurezcas" volviendo a inferirlo del tráfico: eso es el bug.
   */
  registrarActividad(userId: number): void {
    const now  = Date.now();
    const last = this.activityThrottle.get(userId) ?? 0;
    if (now - last < ACTIVITY_THROTTLE_MS) return;

    this.activityThrottle.set(userId, now);
    this.purgarActivityThrottle(now);

    this.repo.manager.query(
      `UPDATE refresh_tokens SET "lastActivityAt" = NOW()
       WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > NOW()`,
      [userId],
    ).catch(() => {
      // No crítico — borramos la marca para reintentar en la siguiente señal.
      this.activityThrottle.delete(userId);
    });
  }

  /** Purga entradas vencidas del throttle. Solo corre cuando una pasa el umbral. */
  private purgarActivityThrottle(now: number): void {
    for (const [userId, ts] of this.activityThrottle) {
      if (now - ts >= ACTIVITY_THROTTLE_MS) this.activityThrottle.delete(userId);
    }
  }

  // ── Sesión única ─────────────────────────────────────────────────────────────

  /**
   * Verifica si el usuario tiene una sesión activa: sessionToken en users + refresh token válido.
   * Usado en login() para el flujo de confirmación de sesión única.
   *
   * Retorna los datos de la sesión activa (device, IP, lastActivityAt) o null si no hay sesión.
   */
  async verificarSesionActiva(userId: number): Promise<{
    deviceInfo?: string;
    ipAddress?: string;
    lastActivityAt?: Date;
    createdAt: Date;
  } | null> {
    // 1. ¿El usuario tiene sessionToken activo? (señal de sesión en curso)
    const rows = await this.dataSource.query<{ sessionToken: string | null }[]>(
      `SELECT "sessionToken" FROM users WHERE id = $1 AND "isActive" = true LIMIT 1`,
      [userId],
    );
    if (!rows[0]?.sessionToken) return null;

    // 2. ¿Existe refresh token activo (no revocado y no expirado)?
    const token = await this.repo.findOne({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
      select: ['id', 'deviceInfo', 'ipAddress', 'lastActivityAt', 'createdAt', 'expiresAt'],
    });

    if (!token || token.expiresAt < new Date()) {
      // sessionToken colgado: el logout previo no lo limpió (bug corregido en cerrarSesion).
      // Auto-saneamiento: deja la BD limpia para que el próximo login no muestre el modal.
      await this.dataSource.query(
        `UPDATE users SET "sessionToken" = NULL, "sessionCreatedAt" = NULL WHERE id = $1`,
        [userId],
      );
      return null;
    }

    return {
      deviceInfo:     token.deviceInfo     ?? undefined,
      ipAddress:      token.ipAddress      ?? undefined,
      lastActivityAt: token.lastActivityAt ?? undefined,
      createdAt:      token.createdAt,
    };
  }

  /** Cron diario: elimina tokens expirados de la BD. */
  @Cron('0 3 * * *')
  async limpiarExpirados(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async crearRegistro(
    userId: number,
    deviceInfo?: string,
    ipAddress?: string,
    sessionLifetimeMs?: number,
  ): Promise<{ id: string; value: string }> {
    const lifetime = sessionLifetimeMs ?? (30 * 24 * 3_600_000); // 30 días si login no pasa lifetime
    const value    = randomBytes(32).toString('hex');
    const hash     = this.hash(value);
    const entity   = await this.repo.save(
      this.repo.create({
        userId,
        tokenHash:  hash,
        expiresAt:  new Date(Date.now() + lifetime),
        deviceInfo: deviceInfo?.slice(0, 255),
        ipAddress:  ipAddress?.slice(0, 45),
      }),
    );
    return { id: entity.id, value };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
