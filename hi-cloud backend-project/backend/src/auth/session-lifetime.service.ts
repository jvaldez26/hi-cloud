import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { reportServiceError } from '../common/observability/sentry';

/**
 * Fuente ÚNICA de la duración de sesión.
 *
 * Antes esta lógica estaba duplicada literalmente en dos sitios —
 * `AuthService.getEffectiveSessionMs()` (login) y
 * `RefreshTokenService.getSessionLifetimeMs()` (rotación)— con el mismo
 * comentario copiado encima. Dos copias de la regla "el global es el tope"
 * es exactamente la clase de deriva que provocó el problema que estamos
 * arreglando: un ajuste que promete una cosa y mide otra.
 *
 * ── Por qué hay caché ────────────────────────────────────────────────────
 * Estas consultas están en el camino caliente de la ROTACIÓN, no del login.
 * Al bajar JWT_EXPIRES_IN de 1d a 15m las rotaciones se multiplican por ~96:
 * cada sesión abierta pasa de rotar una vez al día a rotar cuatro veces por
 * hora, y cada rotación hacía dos SELECT (config global + join a empresa)
 * más el INSERT del token nuevo. Sobre la RDS t3.small eso se nota, y se
 * nota en hora punta, que es cuando menos conviene.
 *
 * La caché es en proceso y con TTL corto. Igual que el mapa de throttle de
 * TenantMiddleware: en PM2 cluster cada worker tiene el suyo y un deploy lo
 * vacía. Ambas cosas son aceptables — el coste de un fallo de caché es una
 * consulta, no un error.
 *
 * Consecuencia a tener presente: un cambio de SESION_HORAS o de
 * `empresa.configuracion.sesionHoras` tarda hasta TTL_MS en aplicarse a las
 * sesiones ya abiertas. Con 60 s es imperceptible para un ajuste que se mide
 * en horas, y evita acoplar este servicio a los dos módulos que escriben esa
 * configuración.
 */
@Injectable()
export class SessionLifetimeService {
  private readonly logger = new Logger(SessionLifetimeService.name);

  /** TTL de la caché. Corto a propósito: un ajuste de seguridad no debe tardar en aplicarse. */
  private static readonly TTL_MS = 60_000;

  /** Tope duro del rango admitido, en horas. Coincide con el max de la UI de Super Admin. */
  private static readonly MAX_HORAS = 720;
  private static readonly MIN_HORAS = 1;
  private static readonly DEFAULT_HORAS = 24;

  private globalCache?: { horas: number; at: number };

  /** userId → lifetime en ms. Se purga por TTL, nunca crece sin límite. */
  private readonly porUsuario = new Map<number, { ms: number; at: number }>();

  /** empresaId → lifetime en ms. */
  private readonly porEmpresa = new Map<number, { ms: number; at: number }>();

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Lifetime en ms para el usuario dueño de una sesión. Camino caliente: lo llama rotar(). */
  async paraUsuario(userId: number): Promise<number> {
    const now      = Date.now();
    const cacheado = this.porUsuario.get(userId);
    if (cacheado && now - cacheado.at < SessionLifetimeService.TTL_MS) return cacheado.ms;

    const globalHoras = await this.globalHoras();
    let horas = globalHoras;

    try {
      const rows = await this.dataSource.query<{ configuracion: Record<string, unknown> }[]>(`
        SELECT e.configuracion
        FROM empresa e
        JOIN usuario_empresa ue ON ue."empresaId" = e.id
        WHERE ue."userId" = $1 AND ue."isPrincipal" = true AND ue."isActive" = true
        LIMIT 1
      `, [userId]);
      horas = this.aplicarOverride(rows[0]?.configuracion, globalHoras);
    } catch { /* ignorar — se queda el global */ }

    const ms = this.aHoras(horas) * 3_600_000;
    this.porUsuario.set(userId, { ms, at: now });
    this.purgar(this.porUsuario, now);
    return ms;
  }

  /** Lifetime en ms para una empresa. Lo llama el login, que ya tiene el empresaId resuelto. */
  async paraEmpresa(empresaId?: number): Promise<number> {
    const globalHoras = await this.globalHoras();
    if (!empresaId) return this.aHoras(globalHoras) * 3_600_000;

    const now      = Date.now();
    const cacheado = this.porEmpresa.get(empresaId);
    if (cacheado && now - cacheado.at < SessionLifetimeService.TTL_MS) return cacheado.ms;

    let horas = globalHoras;
    try {
      const rows = await this.dataSource.query<{ configuracion: Record<string, unknown> }[]>(
        `SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1`,
        [empresaId],
      );
      horas = this.aplicarOverride(rows[0]?.configuracion, globalHoras);
    } catch { /* ignorar — se queda el global */ }

    const ms = this.aHoras(horas) * 3_600_000;
    this.porEmpresa.set(empresaId, { ms, at: now });
    this.purgar(this.porEmpresa, now);
    return ms;
  }

  /** Vacía la caché. Para los tests y para un futuro invalidado explícito al guardar config. */
  invalidar(): void {
    this.globalCache = undefined;
    this.porUsuario.clear();
    this.porEmpresa.clear();
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /** SESION_HORAS global. Es el TOPE: ninguna empresa puede ser más laxa. */
  private async globalHoras(): Promise<number> {
    const now = Date.now();
    if (this.globalCache && now - this.globalCache.at < SessionLifetimeService.TTL_MS) {
      return this.globalCache.horas;
    }

    let horas = SessionLifetimeService.DEFAULT_HORAS;
    try {
      const rows = await this.dataSource.query<{ valor: string }[]>(
        `SELECT valor FROM configuraciones_sistema WHERE clave = 'SESION_HORAS' LIMIT 1`,
      );
      const h = parseInt(rows[0]?.valor ?? String(SessionLifetimeService.DEFAULT_HORAS), 10);
      horas = isNaN(h) ? SessionLifetimeService.DEFAULT_HORAS : this.aHoras(h);
    } catch (err) {
      // Este es el que más duele en silencio: decide cuánto dura la sesión de
      // TODA la plataforma. Si la lectura falla, la diferencia entre "lo
      // configuramos en 8 horas" y "llevan un mes con el default" no la nota
      // nadie hasta que un cliente se queja. Por eso también va a Sentry: un
      // log que nadie mira no cuenta como aviso.
      this.logger.warn(
        `No se pudo leer SESION_HORAS de configuraciones_sistema ` +
        `(${(err as Error).message}) — usando el default de ` +
        `${SessionLifetimeService.DEFAULT_HORAS} h.`,
      );
      reportServiceError(err, 'sessionLifetime.globalHoras.leerConfigGlobal');
    }

    this.globalCache = { horas, at: now };
    return horas;
  }

  /**
   * Aplica el override por empresa sobre el global.
   * El override NUNCA puede superar el global (una empresa no puede ser más laxa
   * que la plataforma); configuracion.service.ts ya clampea al guardar, esto es
   * la segunda barrera para filas escritas antes de ese clampeo.
   */
  private aplicarOverride(conf: Record<string, unknown> | undefined, globalHoras: number): number {
    const override = conf?.['sesionHoras'];
    if (typeof override === 'number' && Number.isFinite(override)) {
      return Math.min(globalHoras, Math.max(SessionLifetimeService.MIN_HORAS, override));
    }
    return globalHoras;
  }

  private aHoras(h: number): number {
    return Math.min(SessionLifetimeService.MAX_HORAS, Math.max(SessionLifetimeService.MIN_HORAS, h));
  }

  /** Purga entradas vencidas. Se ejecuta solo en un fallo de caché, no en cada lectura. */
  private purgar(mapa: Map<number, { ms: number; at: number }>, now: number): void {
    for (const [k, v] of mapa) {
      if (now - v.at >= SessionLifetimeService.TTL_MS) mapa.delete(k);
    }
  }
}
