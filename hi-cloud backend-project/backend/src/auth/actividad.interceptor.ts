import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { RefreshTokenService } from './refresh-token.service';

/** Métodos que solo puede originar una persona: cambian datos. */
const METODOS_DE_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rutas que son maquinaria, no acciones: se excluyen aunque sean POST.
 * Se comparan por sufijo del path para no depender del prefijo global.
 */
const RUTAS_EXCLUIDAS = ['/auth/refresh', '/auth/actividad', '/auth/logout'];

/**
 * Respaldo estrecho de la señal de actividad.
 *
 * La señal PRINCIPAL es POST /auth/actividad, que el frontend emite desde eventos
 * de entrada reales. Esto es el cinturón por si esa señal se rompe en silencio —
 * un error de JS en el tracker no debe echar a un cajero a mitad de una venta.
 *
 * ── Por qué solo mutaciones ──────────────────────────────────────────────────
 * Una mutación es inequívocamente un acto humano: ningún `refetchInterval` del
 * frontend hace POST/PUT/PATCH/DELETE (verificado: las ~40 queries con sondeo
 * usan queryFn con GET). Los GET NO cuentan nunca, y esa asimetría es lo que
 * hace seguro el respaldo: solo puede EXTENDER una sesión que alguien está
 * conduciendo de verdad, nunca mantener viva una pestaña olvidada.
 *
 * No lo amplíes a GET. Leer un reporte y sondear la caja son el mismo verbo
 * HTTP contra el mismo endpoint; por ahí no se distingue una persona.
 */
@Injectable()
export class ActividadInterceptor implements NestInterceptor {
  constructor(private readonly refreshTokenSvc: RefreshTokenService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Solo peticiones HTTP — no aplica a contextos ws/rpc.
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id?: number } }>();
    const userId = req.user?.id;

    // Sin req.user no hay guard de auth en esta ruta (o falló): nada que registrar.
    if (
      userId &&
      METODOS_DE_ESCRITURA.has(req.method) &&
      !RUTAS_EXCLUIDAS.some(r => req.path.endsWith(r))
    ) {
      // Fire-and-forget y ya throttleado en el servicio.
      this.refreshTokenSvc.registrarActividad(userId);
    }

    return next.handle();
  }
}
