import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AuditoriaService } from '../auditoria.service';
import { AccionAuditoria } from '../entities/audit-log.entity';
import { User } from '../../users/users.entity';

// Rutas que no se auditan (Swagger docs, assets — NO las rutas de la API)
const RUTAS_EXCLUIDAS = ['/api-json', '/api-yaml', '/favicon.ico', '/api/swagger', '/api/docs'];
// Nota: '/api' fue removido — causaba que TODOS los endpoints /api/v1/* fuesen excluidos

// Métodos HTTP que generan eventos de escritura
const METODOS_ESCRITURA = ['POST', 'PUT', 'PATCH', 'DELETE'];

function extraerModulo(ruta: string): string {
  const match = ruta.match(/\/api\/v1\/([^/]+)/);
  return match ? match[1] : 'sistema';
}

function extraerEntidadId(ruta: string): string | undefined {
  const partes = ruta.split('/').filter(Boolean);
  const last = partes[partes.length - 1];
  // Si es un número o un string alfanumérico corto, es probablemente un ID
  return /^\d+$/.test(last) ? last : undefined;
}

function determinarAccion(metodo: string, ruta: string): AccionAuditoria {
  if (ruta.includes('/auth/login'))  return AccionAuditoria.LOGIN;
  if (ruta.includes('/auth/logout')) return AccionAuditoria.LOGOUT;
  switch (metodo) {
    case 'POST':   return AccionAuditoria.CREATE;
    case 'PATCH':
    case 'PUT':    return AccionAuditoria.UPDATE;
    case 'DELETE': return AccionAuditoria.DELETE;
    case 'GET':    return AccionAuditoria.READ;
    default:       return AccionAuditoria.READ;
  }
}

function generarDescripcion(metodo: string, ruta: string, userName?: string): string {
  const modulo    = extraerModulo(ruta);
  const entidadId = extraerEntidadId(ruta);
  const quien     = userName ?? 'Anónimo';

  const acciones: Record<string, string> = {
    POST:   'creó registro en',
    PATCH:  'actualizó registro en',
    PUT:    'reemplazó registro en',
    DELETE: 'eliminó registro en',
    GET:    'consultó',
  };

  const accion = acciones[metodo] ?? 'accedió a';
  const sufijo = entidadId ? ` #${entidadId}` : '';
  return `${quien} ${accion} ${modulo}${sufijo}`;
}

function truncarJSON(obj: unknown, maxChars = 2000): string | undefined {
  if (obj === null || obj === undefined) return undefined;
  try {
    const json = JSON.stringify(obj);
    return json.length > maxChars ? json.substring(0, maxChars) + '…' : json;
  } catch {
    return undefined;
  }
}

function obtenerIP(req: Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditoriaService: AuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req  = context.switchToHttp().getRequest<Request & { user?: User }>();
    const res  = context.switchToHttp().getResponse<Response>();
    const inicio = Date.now();

    const { method, url } = req;

    // ── No auditar rutas excluidas ni métodos de lectura (excepto auth) ──
    const esRutaExcluida = RUTAS_EXCLUIDAS.some((r) => url.startsWith(r));
    const esLecturaNormal =
      method === 'GET' &&
      !url.includes('/auth') &&
      !url.includes('/reportes') &&
      !url.includes('/reporte');

    if (esRutaExcluida || esLecturaNormal) {
      return next.handle();
    }

    const user    = req.user;
    const modulo  = extraerModulo(url);
    const accion  = determinarAccion(method, url);

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const duracion = Date.now() - inicio;

        // Fire-and-forget — no bloquea la respuesta
        this.auditoriaService
          .registrar({
            userId:      user?.id,
            userName:    user ? `${user.nombre}` : undefined,
            userRole:    user?.role,
            empresaId:   (user as any)?.empresaId,
            accion,
            modulo,
            entidad:     modulo,
            entidadId:   extraerEntidadId(url),
            descripcion: generarDescripcion(method, url, user?.nombre),
            valorNuevo:  METODOS_ESCRITURA.includes(method)
              ? truncarJSON((responseBody as { data?: unknown })?.data ?? responseBody)
              : undefined,
            metodo:      method,
            ruta:        url,
            statusCode:  res.statusCode,
            duracionMs:  duracion,
            exitoso:     true,
            ipAddress:   obtenerIP(req),
            userAgent:   req.headers['user-agent']?.substring(0, 300),
          })
          .catch((err: Error) =>
            this.logger.error(`Error audit log: ${err.message}`),
          );
      }),
      catchError((err: unknown) => {
        const duracion = Date.now() - inicio;
        const status   = (err as { status?: number })?.status ?? 500;
        const mensaje  = (err as { message?: string })?.message ?? 'Error desconocido';

        this.auditoriaService
          .registrar({
            userId:      user?.id,
            userName:    user?.nombre,
            userRole:    user?.role,
            empresaId:   (user as any)?.empresaId,
            accion:      AccionAuditoria.ERROR,
            modulo,
            descripcion: `ERROR en ${method} ${url}: ${mensaje}`,
            metodo:      method,
            ruta:        url,
            statusCode:  status,
            duracionMs:  duracion,
            exitoso:     false,
            ipAddress:   obtenerIP(req),
            userAgent:   req.headers['user-agent']?.substring(0, 300),
          })
          .catch((e: Error) =>
            this.logger.error(`Error audit log (catch): ${e.message}`),
          );

        return throwError(() => err);
      }),
    );
  }
}
