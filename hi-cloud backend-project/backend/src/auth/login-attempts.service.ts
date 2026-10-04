import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  LOCKOUT_VENTANA_INTENTOS_MS,
  LOCKOUT_VENTANA_ESCALADA_MS,
  LOCKOUT_GLOBAL_VENTANA_MS,
  LOCKOUT_GLOBAL_UMBRAL_INTENTOS,
  LOCKOUT_GLOBAL_DURACION_SEGUNDOS,
  duracionBloqueoSegundos,
  formatMinutos,
} from './utils/progressive-lockout.util';

export type TipoBloqueoLogin = 'cuenta_ip' | 'cuenta_global';

/**
 * Bloqueo progresivo por intentos fallidos de login — DOS niveles
 * independientes (ver progressive-lockout.util.ts para el por qué):
 *
 *   1. Por (cuenta, IP): 5 fallos en 10 min → 1/5/15 min escalando con
 *      cada bloqueo repetido en 24h. Protege contra alguien que repite
 *      intentos desde una IP fija (o un cajero que se le va la mano).
 *   2. Por cuenta SOLA (cualquier IP): 20 fallos en 60 min → 15 min fijos.
 *      Protege contra un ataque repartido entre muchas IPs, que nunca
 *      haría saltar el nivel 1 en ninguna de ellas.
 *
 * El identificador es el email o el username tal cual se intentó el login
 * (o, si AuthService.login() ya resolvió una cuenta real, su email
 * canónico — así alternar "juan@x.com"/"juan" contra la MISMA cuenta no
 * abre cubetas distintas para esquivar el bloqueo).
 *
 * Usa CACHE_MANAGER (Redis en producción) para persistir contadores y bloqueos.
 *
 * El umbral del nivel 1 (maxIntentos) es configurable por empresa en
 * empresa.configuracion.maxIntentos (JSONB) con fallback al global
 * configuraciones_sistema.MAX_INTENTOS_LOGIN (default 5), rango [3,10] —
 * aplicado en auth.service.ts antes de llamar aquí. El nivel 2 (20/60min)
 * es fijo: es una defensa de último recurso contra ataques, no algo que
 * una empresa deba poder relajar.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  // ── Nivel 1: por (cuenta, IP) ───────────────────────────────────────────
  private attemptsKey(identificador: string, ip: string): string {
    return `login_attempts:${identificador.toLowerCase()}:${ip}`;
  }
  private blockedKey(identificador: string, ip: string): string {
    return `login_blocked:${identificador.toLowerCase()}:${ip}`;
  }
  /** Cuántas veces se bloqueó esta (cuenta, IP) en las últimas 24h — decide la escalada. */
  private blockCountKey(identificador: string, ip: string): string {
    return `login_block_count:${identificador.toLowerCase()}:${ip}`;
  }

  // ── Nivel 2: por cuenta sola, cualquier IP ──────────────────────────────
  private globalAttemptsKey(identificador: string): string {
    return `login_attempts_global:${identificador.toLowerCase()}`;
  }
  private globalBlockedKey(identificador: string): string {
    return `login_blocked_global:${identificador.toLowerCase()}`;
  }

  /**
   * IP del intento fallido más reciente para este identificador — solo para
   * diagnóstico (panel de soporte del super admin) y para el contenido del
   * aviso por correo. CACHE_MANAGER no garantiza poder enumerar claves
   * (KEYS/SCAN no existen en el store in-memory de dev), así que se guarda
   * explícitamente aquí en cada increment().
   */
  private lastIpKey(identificador: string): string {
    return `login_last_ip:${identificador.toLowerCase()}`;
  }

  /** El nivel 2 (global) manda si ambos están activos — es la señal más grave. */
  async isBlocked(identificador: string, ip: string): Promise<{
    blocked: boolean; remainingSeconds?: number; bloqueosEn24h?: number; tipo?: TipoBloqueoLogin;
  }> {
    const global = await this.cache.get<{ blockedUntil: number }>(this.globalBlockedKey(identificador));
    if (global && global.blockedUntil > Date.now()) {
      return {
        blocked: true,
        remainingSeconds: Math.ceil((global.blockedUntil - Date.now()) / 1000),
        tipo: 'cuenta_global',
      };
    }

    const local = await this.cache.get<{ blockedUntil: number; bloqueosEn24h: number }>(this.blockedKey(identificador, ip));
    if (local && local.blockedUntil > Date.now()) {
      return {
        blocked: true,
        remainingSeconds: Math.ceil((local.blockedUntil - Date.now()) / 1000),
        bloqueosEn24h: local.bloqueosEn24h,
        tipo: 'cuenta_ip',
      };
    }

    return { blocked: false };
  }

  /** Registra el fallo en AMBOS niveles — cada intento cuenta para los dos a la vez. */
  async increment(identificador: string, ip: string): Promise<{ attemptsLocal: number; attemptsGlobal: number }> {
    const localKey  = this.attemptsKey(identificador, ip);
    const globalKey = this.globalAttemptsKey(identificador);

    const attemptsLocal  = ((await this.cache.get<number>(localKey))  ?? 0) + 1;
    const attemptsGlobal = ((await this.cache.get<number>(globalKey)) ?? 0) + 1;

    await this.cache.set(localKey,  attemptsLocal,  LOCKOUT_VENTANA_INTENTOS_MS);
    await this.cache.set(globalKey, attemptsGlobal, LOCKOUT_GLOBAL_VENTANA_MS);
    await this.cache.set(this.lastIpKey(identificador), ip, LOCKOUT_VENTANA_ESCALADA_MS);

    return { attemptsLocal, attemptsGlobal };
  }

  /** Al acertar: limpia TODO lo de este (identificador, ip) y el contador
   *  global de la cuenta — un acierto reinicia por completo la cuenta,
   *  pero NO limpia el nivel 1 de OTRAS IPs que sigan fallando contra ella
   *  (un acierto desde la tienda no debe desarmar un ataque en curso
   *  desde otro lado). */
  async reset(identificador: string, ip: string): Promise<void> {
    await this.cache.del(this.attemptsKey(identificador, ip));
    await this.cache.del(this.blockedKey(identificador, ip));
    await this.cache.del(this.blockCountKey(identificador, ip));
    await this.cache.del(this.globalAttemptsKey(identificador));
    await this.cache.del(this.globalBlockedKey(identificador));
  }

  /**
   * Diagnóstico para el panel de soporte del super admin: ¿está bloqueada
   * esta cuenta ahora mismo (por cualquiera de los dos niveles), y por
   * cuánto más?
   */
  async estado(identificador: string): Promise<{ blocked: boolean; remainingSeconds?: number; ip?: string }> {
    const ip = await this.cache.get<string>(this.lastIpKey(identificador));
    const status = await this.isBlocked(identificador, ip ?? '');
    return { blocked: status.blocked, remainingSeconds: status.remainingSeconds, ip: ip ?? undefined };
  }

  /**
   * Limpia el bloqueo/contador de intentos fallidos para este identificador
   * (los dos niveles). Acción de soporte del super admin — el caller es
   * responsable de auditarla (ver SuperAdminService.limpiarBloqueoLogin()).
   */
  async resetPorIdentificador(identificador: string): Promise<{ ip?: string }> {
    const ip = await this.cache.get<string>(this.lastIpKey(identificador));
    if (ip) await this.reset(identificador, ip);
    await this.cache.del(this.globalAttemptsKey(identificador));
    await this.cache.del(this.globalBlockedKey(identificador));
    await this.cache.del(this.lastIpKey(identificador));
    return { ip: ip ?? undefined };
  }

  /**
   * Decide si este fallo bloquea algo, y qué nivel. El nivel 2 (global) se
   * evalúa primero: si una cuenta ya acumuló el umbral global, no importa
   * si esta IP en particular apenas empieza — es la señal más grave.
   *
   * @param maxIntentos - umbral del nivel 1, configurable por empresa [3-10], default 5.
   */
  async block(
    identificador: string, ip: string, attemptsLocal: number, attemptsGlobal: number, maxIntentos = 5,
  ): Promise<{ blockSeconds: number; bloqueosEn24h: number; tipo: TipoBloqueoLogin | null }> {
    if (attemptsGlobal >= LOCKOUT_GLOBAL_UMBRAL_INTENTOS) {
      await this.cache.set(
        this.globalBlockedKey(identificador),
        { blockedUntil: Date.now() + LOCKOUT_GLOBAL_DURACION_SEGUNDOS * 1000 },
        LOCKOUT_GLOBAL_DURACION_SEGUNDOS * 1000,
      );
      // Próximo bloqueo global exige 20 fallos NUEVOS (de cualquier IP).
      await this.cache.del(this.globalAttemptsKey(identificador));
      return { blockSeconds: LOCKOUT_GLOBAL_DURACION_SEGUNDOS, bloqueosEn24h: 0, tipo: 'cuenta_global' };
    }

    if (attemptsLocal >= maxIntentos) {
      const blockCountKey   = this.blockCountKey(identificador, ip);
      const bloqueosPrevios = (await this.cache.get<number>(blockCountKey)) ?? 0;
      const bloqueosEn24h   = bloqueosPrevios + 1;
      const blockSeconds    = duracionBloqueoSegundos(bloqueosPrevios);

      await this.cache.set(blockCountKey, bloqueosEn24h, LOCKOUT_VENTANA_ESCALADA_MS);
      await this.cache.set(
        this.blockedKey(identificador, ip),
        { blockedUntil: Date.now() + blockSeconds * 1000, bloqueosEn24h },
        blockSeconds * 1000,
      );
      // Próximo bloqueo de ESTA (cuenta, IP) exige 5 fallos NUEVOS.
      await this.cache.del(this.attemptsKey(identificador, ip));

      return { blockSeconds, bloqueosEn24h, tipo: 'cuenta_ip' };
    }

    return { blockSeconds: 0, bloqueosEn24h: 0, tipo: null };
  }

  formatTime(seconds: number): string {
    return formatMinutos(seconds);
  }
}
