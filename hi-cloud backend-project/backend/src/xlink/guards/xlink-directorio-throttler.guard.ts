import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

const WINDOW_MS = 60_000;
const LIMIT_POR_USUARIO = 30;

/**
 * Límite de GET /xlink/directorio POR USUARIO, no por IP — el throttler
 * global (CustomThrottlerGuard) es por IP, y varias cajas/usuarios de la
 * misma empresa comparten IP de salida (NAT). Mismo patrón que
 * RefreshSessionThrottlerGuard, adaptado a userId en vez de hash de sesión.
 *
 * En memoria del proceso — un pm2 reload vacía los baldes, nunca endurece
 * el límite de golpe.
 */
@Injectable()
export class XlinkDirectorioThrottlerGuard implements CanActivate {
  private hits = new Map<number, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id as number | undefined;
    if (!userId) return true; // JwtAuthGuard ya rechazó esto antes si no hay usuario

    const ahora = Date.now();
    const vigentes = (this.hits.get(userId) ?? []).filter(t => ahora - t < WINDOW_MS);

    if (vigentes.length >= LIMIT_POR_USUARIO) {
      throw new ThrottlerException();
    }

    vigentes.push(ahora);
    this.hits.set(userId, vigentes);

    if (this.hits.size > 500 && Math.random() < 0.005) this.limpiarClavesVencidas(ahora);

    return true;
  }

  private limpiarClavesVencidas(ahora: number): void {
    for (const [key, tiempos] of this.hits) {
      const vigentes = tiempos.filter(t => ahora - t < WINDOW_MS);
      if (vigentes.length === 0) this.hits.delete(key);
      else this.hits.set(key, vigentes);
    }
  }
}
