import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

const WINDOW_MS = 60_000;
const LIMIT_POR_SESION = 10;

/**
 * Límite de /auth/refresh POR SESIÓN (hash de la cookie refresh_token), no
 * por IP. El @Throttle({default:...}) del endpoint sigue aplicando su techo
 * por IP (ver auth.controller.ts) como protección general contra abuso —
 * este guard corre ADEMÁS, no en su lugar.
 *
 * Por qué: varias cajas de un mismo local comparten IP (NAT del router). Si
 * varios access tokens (15 min de vida) expiran casi al mismo tiempo —lo
 * normal si esas cajas abrieron turno a horas parecidas—, el límite por IP
 * se pega por tráfico LEGÍTIMO, y el interceptor del frontend trataba
 * cualquier fallo de refresh como sesión muerta: 429 → logout → carrito del
 * POS perdido. Cada sesión (cada refresh_token, uno por dispositivo/pestaña
 * coordinada) tiene su propio balde aquí, así que una caja ocupada nunca
 * puede agotar el margen de las demás.
 *
 * En memoria del proceso — un pm2 reload vacía los baldes, lo que en el
 * peor caso relaja el límite un momento, nunca lo endurece. No hace falta
 * Redis para esto: es un límite de resguardo, no la fuente de verdad de
 * qué sesiones existen (eso sigue siendo la tabla refresh_tokens).
 */
@Injectable()
export class RefreshSessionThrottlerGuard implements CanActivate {
  private hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const refreshValue = (req.cookies as Record<string, string> | undefined)?.['refresh_token'];

    // Sin cookie: el propio endpoint la rechaza con 401 ("Sin refresh
    // token") — no es responsabilidad de este guard decidir eso.
    if (!refreshValue) return true;

    const key = this.claveDeSesion(refreshValue);
    const ahora = Date.now();
    const vigentes = (this.hits.get(key) ?? []).filter(t => ahora - t < WINDOW_MS);

    if (vigentes.length >= LIMIT_POR_SESION) {
      throw new ThrottlerException();
    }

    vigentes.push(ahora);
    this.hits.set(key, vigentes);

    // Limpieza perezosa: nunca crece sin límite en un proceso de larga vida.
    // 1 en 200 solicitudes basta — no es una ruta de alto volumen.
    if (this.hits.size > 500 && Math.random() < 0.005) this.limpiarClavesVencidas(ahora);

    return true;
  }

  private claveDeSesion(refreshValue: string): string {
    return crypto.createHash('sha256').update(refreshValue).digest('hex').slice(0, 24);
  }

  private limpiarClavesVencidas(ahora: number): void {
    for (const [key, tiempos] of this.hits) {
      const vigentes = tiempos.filter(t => ahora - t < WINDOW_MS);
      if (vigentes.length === 0) this.hits.delete(key);
      else this.hits.set(key, vigentes);
    }
  }
}
