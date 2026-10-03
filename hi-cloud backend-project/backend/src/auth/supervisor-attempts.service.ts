import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

const MAX_INTENTOS = 5;
const VENTANA_MS   = 10 * 60_000; // 10 minutos
const BLOQUEO_MS   = 60_000;      // 1 minuto

/**
 * Bloqueo por intentos fallidos de AuthService.verificarSupervisor — NO
 * progresivo (a propósito: a diferencia de LoginAttemptsService, aquí el
 * diseño pedido es fijo) y por (empresa, cajero, supervisor), nunca por IP:
 * varias cajas de una misma tienda comparten IP y no deben bloquearse entre
 * sí por los intentos de otro cajero. El throttle por IP de
 * @Throttle en el controller sigue existiendo como capa extra, no como la
 * defensa principal.
 *
 * Clave de 3 partes: el mismo cajero probando contra OTRO supervisor, o el
 * mismo supervisor probado por OTRO cajero, abren cada uno su propia cubeta
 * — bloquear a un cajero no castiga a los demás, y errarle al supervisor
 * equivocado no cuenta contra el supervisor correcto.
 */
@Injectable()
export class SupervisorAttemptsService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  private clave(empresaId: number, cajeroId: number, supervisorRef: string | number): string {
    return `sup_attempts:${empresaId}:${cajeroId}:${String(supervisorRef).toLowerCase()}`;
  }

  private claveBloqueo(empresaId: number, cajeroId: number, supervisorRef: string | number): string {
    return `sup_blocked:${empresaId}:${cajeroId}:${String(supervisorRef).toLowerCase()}`;
  }

  async isBlocked(
    empresaId: number, cajeroId: number, supervisorRef: string | number,
  ): Promise<{ blocked: boolean; remainingSeconds?: number }> {
    const data = await this.cache.get<{ blockedUntil: number }>(this.claveBloqueo(empresaId, cajeroId, supervisorRef));
    if (data && data.blockedUntil > Date.now()) {
      return { blocked: true, remainingSeconds: Math.ceil((data.blockedUntil - Date.now()) / 1000) };
    }
    return { blocked: false };
  }

  /**
   * Registra un fallo y, al llegar a MAX_INTENTOS dentro de la ventana,
   * activa el bloqueo. La ventana es el TTL del contador (se renueva en cada
   * fallo) — una aproximación simple de "ventana deslizante", mismo patrón
   * que LoginAttemptsService.increment().
   */
  async registrarFallo(
    empresaId: number, cajeroId: number, supervisorRef: string | number,
  ): Promise<{ intentos: number; bloqueado: boolean }> {
    const key     = this.clave(empresaId, cajeroId, supervisorRef);
    const current = (await this.cache.get<number>(key)) ?? 0;
    const intentos = current + 1;
    await this.cache.set(key, intentos, VENTANA_MS);

    if (intentos >= MAX_INTENTOS) {
      await this.cache.set(
        this.claveBloqueo(empresaId, cajeroId, supervisorRef),
        { blockedUntil: Date.now() + BLOQUEO_MS },
        BLOQUEO_MS,
      );
      return { intentos, bloqueado: true };
    }
    return { intentos, bloqueado: false };
  }

  /** Al autorizar con éxito, limpia el contador — no castigues un acierto tras varios tecleos lentos. */
  async reset(empresaId: number, cajeroId: number, supervisorRef: string | number): Promise<void> {
    await this.cache.del(this.clave(empresaId, cajeroId, supervisorRef));
    await this.cache.del(this.claveBloqueo(empresaId, cajeroId, supervisorRef));
  }
}
