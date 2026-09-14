import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Bloqueo progresivo por intentos fallidos de login.
 * Clave: identificador (normalizado) + IP — cada combinación tiene su propio
 * contador. El identificador es el email o el username tal cual se intentó
 * el login (o, si AuthService.login() ya resolvió una cuenta real, su email
 * canónico — así alternar "juan@x.com"/"juan" contra la MISMA cuenta no abre
 * dos cubetas distintas para esquivar el bloqueo).
 * Usa CACHE_MANAGER (Redis en producción) para persistir contadores y bloqueos.
 *
 * El umbral de bloqueo (maxIntentos) es configurable por empresa en
 * empresa.configuracion.maxIntentos (JSONB) con fallback al global
 * configuraciones_sistema.MAX_INTENTOS_LOGIN (default 5).
 * Rango permitido: [3, 10] — aplicado en auth.service.ts antes de llamar aquí.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private attemptsKey(identificador: string, ip: string): string {
    return `login_attempts:${identificador.toLowerCase()}:${ip}`;
  }

  private blockedKey(identificador: string, ip: string): string {
    return `login_blocked:${identificador.toLowerCase()}:${ip}`;
  }

  /**
   * IP del intento fallido más reciente para este identificador — el
   * contador real es por (identificador, ip), y CACHE_MANAGER no garantiza
   * poder enumerar claves (KEYS/SCAN no existen en el store in-memory de
   * dev, y no vale la pena acoplarse al cliente Redis crudo del store de
   * prod solo para esto). En vez de escanear, se guarda explícitamente aquí
   * en cada increment() — el panel de soporte del super admin (estado() /
   * resetPorIdentificador()) la usa para diagnosticar y limpiar el bloqueo
   * sin necesitar que el agente le pregunte la IP a quien llama.
   */
  private lastIpKey(identificador: string): string {
    return `login_last_ip:${identificador.toLowerCase()}`;
  }

  async isBlocked(identificador: string, ip: string): Promise<{ blocked: boolean; remainingSeconds?: number }> {
    const data = await this.cache.get<{ blockedUntil: number }>(this.blockedKey(identificador, ip));
    if (data && data.blockedUntil > Date.now()) {
      return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - Date.now()) / 1000) };
    }
    return { blocked: false };
  }

  async increment(identificador: string, ip: string): Promise<number> {
    const key     = this.attemptsKey(identificador, ip);
    const current = (await this.cache.get<number>(key)) ?? 0;
    const newVal  = current + 1;
    await this.cache.set(key, newVal, 86_400_000); // 24h en ms
    await this.cache.set(this.lastIpKey(identificador), ip, 86_400_000);
    return newVal;
  }

  async reset(identificador: string, ip: string): Promise<void> {
    await this.cache.del(this.attemptsKey(identificador, ip));
    await this.cache.del(this.blockedKey(identificador, ip));
  }

  /**
   * Diagnóstico para el panel de soporte del super admin: ¿está bloqueada
   * esta cuenta ahora mismo, y por cuánto más? Usa la IP del último intento
   * fallido registrado (ver lastIpKey) — si nunca hubo un intento fallido,
   * no hay nada que diagnosticar.
   */
  async estado(identificador: string): Promise<{ blocked: boolean; remainingSeconds?: number; ip?: string }> {
    const ip = await this.cache.get<string>(this.lastIpKey(identificador));
    if (!ip) return { blocked: false };
    const status = await this.isBlocked(identificador, ip);
    return { ...status, ip };
  }

  /**
   * Limpia el bloqueo/contador de intentos fallidos para este identificador
   * usando la IP del último intento registrado. Acción de soporte del super
   * admin — el caller es responsable de auditarla (ver
   * SuperAdminService.limpiarBloqueoLogin()).
   */
  async resetPorIdentificador(identificador: string): Promise<{ ip?: string }> {
    const ip = await this.cache.get<string>(this.lastIpKey(identificador));
    if (ip) await this.reset(identificador, ip);
    await this.cache.del(this.lastIpKey(identificador));
    return { ip };
  }

  /**
   * Aplica bloqueo progresivo si el número de intentos supera maxIntentos.
   * @param maxIntentos - umbral configurable por empresa [3-10], default 5.
   */
  async block(identificador: string, ip: string, attempts: number, maxIntentos = 5): Promise<number> {
    const blockSeconds = this.getBlockDuration(attempts, maxIntentos);
    if (blockSeconds > 0) {
      const blockedUntil = Date.now() + blockSeconds * 1000;
      await this.cache.set(this.blockedKey(identificador, ip), { blockedUntil }, blockSeconds * 1000);
    }
    return blockSeconds;
  }

  /**
   * Escala de bloqueo relativa al umbral configurado.
   * Intento N > maxIntentos → over = N - maxIntentos:
   *   over=1 → 1 min, over=2 → 5 min, over=3 → 15 min, over=4 → 30 min, over≥5 → 1h
   */
  getBlockDuration(attempts: number, maxIntentos = 5): number {
    const over = attempts - maxIntentos;
    if (over <= 0) return 0;
    if (over === 1) return 60;
    if (over === 2) return 300;
    if (over === 3) return 900;
    if (over === 4) return 1800;
    return 3600;
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds} segundos`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutos`;
    return `${Math.ceil(seconds / 3600)} hora(s)`;
  }
}
