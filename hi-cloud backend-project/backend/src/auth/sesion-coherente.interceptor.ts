import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

/**
 * Defensa en profundidad contra el incidente de empresa 73 (caja #788,
 * #762/#767): en un equipo compartido, una pestaña vieja se queda mostrando
 * un usuario en memoria mientras el navegador (cookie httpOnly) ya tiene la
 * sesión de otro. El arreglo principal es el evento 'storage' en
 * auth.store.ts, que avisa a las demás pestañas al instante — esto es el
 * respaldo para cuando esa señal falla (localStorage deshabilitado, Safari
 * restrictivo, un error de JS que la rompe en silencio): cada petición del
 * frontend lleva el id de usuario que la PANTALLA cree tener (header
 * `x-usuario-esperado`, puesto por api/client.ts desde auth_user en
 * localStorage); si no coincide con el id real del JWT que autenticó la
 * petición, la pantalla está desincronizada de la sesión real — 409, y el
 * interceptor de errores del frontend recarga.
 *
 * Fail-open a propósito: sin el header (peticiones de antes de este cambio,
 * llamadas sin ese dato) no hay nada que comparar — nunca bloquea una
 * petición legítima por faltar un dato opcional.
 */
const HEADER_USUARIO_ESPERADO = 'x-usuario-esperado';

@Injectable()
export class SesionCoherenteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id?: number } }>();
    const userId = req.user?.id;
    const header = req.headers[HEADER_USUARIO_ESPERADO];

    if (userId != null && header != null) {
      const raw = Array.isArray(header) ? header[0] : header;
      const esperado = Number(raw);
      if (!Number.isNaN(esperado) && esperado !== userId) {
        throw new ConflictException('SESION_CAMBIO');
      }
    }

    return next.handle();
  }
}
