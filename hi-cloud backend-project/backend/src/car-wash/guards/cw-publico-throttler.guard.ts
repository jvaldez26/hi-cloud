import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

const WINDOW_MS = 60_000;
const LIMIT = 30;

/**
 * Límite de GET /publico/carwash/:token POR IP+token, más estricto que el
 * throttler global (CustomThrottlerGuard, 100 req/60s por IP) — mismo patrón
 * que XlinkDirectorioThrottlerGuard, en memoria del proceso.
 */
@Injectable()
export class CwPublicoThrottlerGuard implements CanActivate {
  private hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const realIp = req.headers?.['x-real-ip'] as string | undefined;
    const forwarded = req.headers?.['x-forwarded-for'] as string | undefined;
    const ip = realIp?.trim() ?? forwarded?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    const token = req.params?.token ?? '';
    const clave = `${ip}:${token}`;

    const ahora = Date.now();
    const vigentes = (this.hits.get(clave) ?? []).filter(t => ahora - t < WINDOW_MS);

    if (vigentes.length >= LIMIT) throw new ThrottlerException();

    vigentes.push(ahora);
    this.hits.set(clave, vigentes);

    if (this.hits.size > 1000 && Math.random() < 0.005) this.limpiarClavesVencidas(ahora);
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
