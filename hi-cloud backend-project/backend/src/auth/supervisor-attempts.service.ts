import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  LOCKOUT_VENTANA_INTENTOS_MS,
  LOCKOUT_VENTANA_ESCALADA_MS,
  duracionBloqueoSegundos,
} from './utils/progressive-lockout.util';

/**
 * Bloqueo por intentos fallidos de AuthService.verificarSupervisor, por
 * (empresa, cajero, supervisor), nunca por IP: varias cajas de una misma
 * tienda comparten IP y no deben bloquearse entre sí por los intentos de
 * otro cajero. El throttle por IP de @Throttle en el controller sigue
 * existiendo como capa extra, no como la defensa principal.
 *
 * Escalada progresiva — mismo criterio que LoginAttemptsService (ver
 * progressive-lockout.util.ts): 5 fallos en 10 min → 1 min; si la MISMA
 * cubeta vuelve a bloquearse dentro de 24h → 5 min, y 15 min desde la
 * 3ra vez. Antes era fijo en 1 min siempre — se vuelve progresivo a
 * propósito, igual que login, para que repetir el ataque salga más caro.
 *
 * Clave de 3 partes: el mismo cajero probando contra OTRO supervisor, o el
 * mismo supervisor probado por OTRO cajero, abren cada uno su propia cubeta
 * — bloquear a un cajero no castiga a los demás, y errarle al supervisor
 * equivocado no cuenta contra el supervisor correcto.
 */
@Injectable()
export class SupervisorAttemptsService {
  private readonly MAX_INTENTOS = 5;

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private clave(empresaId: number, cajeroId: number, supervisorRef: string | number): string {
    return `sup_attempts:${empresaId}:${cajeroId}:${String(supervisorRef).toLowerCase()}`;
  }

  private claveBloqueo(empresaId: number, cajeroId: number, supervisorRef: string | number): string {
    return `sup_blocked:${empresaId}:${cajeroId}:${String(supervisorRef).toLowerCase()}`;
  }

  private claveBlockCount(empresaId: number, cajeroId: number, supervisorRef: string | number): string {
    return `sup_block_count:${empresaId}:${cajeroId}:${String(supervisorRef).toLowerCase()}`;
  }

  async isBlocked(
    empresaId: number, cajeroId: number, supervisorRef: string | number,
  ): Promise<{ blocked: boolean; remainingSeconds?: number; bloqueosEn24h?: number }> {
    const data = await this.cache.get<{ blockedUntil: number; bloqueosEn24h: number }>(
      this.claveBloqueo(empresaId, cajeroId, supervisorRef),
    );
    if (data && data.blockedUntil > Date.now()) {
      return {
        blocked: true,
        remainingSeconds: Math.ceil((data.blockedUntil - Date.now()) / 1000),
        bloqueosEn24h: data.bloqueosEn24h,
      };
    }
    return { blocked: false };
  }

  /**
   * Registra un fallo y, al llegar a MAX_INTENTOS dentro de la ventana de
   * 10 min, activa el bloqueo con la duración que le toque según cuántas
   * veces ya se bloqueó esta cubeta en las últimas 24h.
   */
  async registrarFallo(
    empresaId: number, cajeroId: number, supervisorRef: string | number,
  ): Promise<{ intentos: number; bloqueado: boolean; duracionSegundos: number; bloqueosEn24h: number }> {
    const key     = this.clave(empresaId, cajeroId, supervisorRef);
    const current = (await this.cache.get<number>(key)) ?? 0;
    const intentos = current + 1;
    await this.cache.set(key, intentos, LOCKOUT_VENTANA_INTENTOS_MS);

    if (intentos < this.MAX_INTENTOS) {
      return { intentos, bloqueado: false, duracionSegundos: 0, bloqueosEn24h: 0 };
    }

    const blockCountKey   = this.claveBlockCount(empresaId, cajeroId, supervisorRef);
    const bloqueosPrevios = (await this.cache.get<number>(blockCountKey)) ?? 0;
    const bloqueosEn24h   = bloqueosPrevios + 1;
    const duracionSegundos = duracionBloqueoSegundos(bloqueosPrevios);

    await this.cache.set(blockCountKey, bloqueosEn24h, LOCKOUT_VENTANA_ESCALADA_MS);
    await this.cache.set(
      this.claveBloqueo(empresaId, cajeroId, supervisorRef),
      { blockedUntil: Date.now() + duracionSegundos * 1000, bloqueosEn24h },
      duracionSegundos * 1000,
    );
    // Próximo bloqueo exige 5 fallos NUEVOS, no seguir sumando desde el umbral.
    await this.cache.del(key);

    return { intentos, bloqueado: true, duracionSegundos, bloqueosEn24h };
  }

  /** Al autorizar con éxito, limpia TODO el estado de esta cubeta — no castiga
   *  un acierto tras varios tecleos lentos, y reinicia también la escalada. */
  async reset(empresaId: number, cajeroId: number, supervisorRef: string | number): Promise<void> {
    await this.cache.del(this.clave(empresaId, cajeroId, supervisorRef));
    await this.cache.del(this.claveBloqueo(empresaId, cajeroId, supervisorRef));
    await this.cache.del(this.claveBlockCount(empresaId, cajeroId, supervisorRef));
  }
}
