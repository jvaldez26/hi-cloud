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
import { AccionAuditoria, NivelAuditoria } from '../entities/audit-log.entity';
import { User } from '../../users/users.entity';

// Rutas de infraestructura — nunca auditadas
const RUTAS_EXCLUIDAS = ['/api-json', '/api-yaml', '/favicon.ico', '/api/swagger', '/api/docs'];

// Solo escrituras — los GET son ruido sin valor auditivo
const METODOS_AUDITABLES = ['POST', 'PUT', 'PATCH', 'DELETE'];

function extraerModulo(ruta: string): string {
  const match = ruta.match(/\/api\/v1\/([^/]+)/);
  return match ? match[1] : 'sistema';
}

function extraerEntidadId(ruta: string): string | undefined {
  const partes = ruta.split('/').filter(Boolean);
  const last = partes[partes.length - 1];
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
    default:       return AccionAuditoria.UPDATE;
  }
}

function determinarNivel(metodo: string, ruta: string): NivelAuditoria {
  const r = ruta.toLowerCase();

  // CRITICO — acciones irreversibles o de alto impacto
  if (r.includes('/anular') || r.includes('/cancelar') || r.includes('/revertir')) return NivelAuditoria.CRITICO;
  if (r.includes('/notas-credito') && metodo === 'POST')  return NivelAuditoria.CRITICO;
  if (r.includes('/notas-debito')  && metodo === 'POST')  return NivelAuditoria.CRITICO;
  if (metodo === 'DELETE')                                 return NivelAuditoria.CRITICO;
  if (r.includes('/auth/login') || r.includes('/auth/logout')) return NivelAuditoria.CRITICO;
  if (r.includes('/usuarios') && metodo === 'POST')        return NivelAuditoria.CRITICO;
  if (r.includes('/usuarios') && r.includes('/rol'))       return NivelAuditoria.CRITICO;
  if (r.includes('/empresa') && r.includes('/eliminar'))   return NivelAuditoria.CRITICO;

  // IMPORTANTE — cambios que afectan precios, stock, caja, configuración
  if (r.includes('/inventario/ajuste'))         return NivelAuditoria.IMPORTANTE;
  if (r.includes('/inventario/solicitudes-ajuste') && r.includes('/aprobar')) return NivelAuditoria.IMPORTANTE;
  if (r.includes('/productos'))                 return NivelAuditoria.IMPORTANTE;
  if (r.includes('/caja'))                      return NivelAuditoria.IMPORTANTE;
  if (r.includes('/empresa') && ['PUT', 'PATCH'].includes(metodo)) return NivelAuditoria.IMPORTANTE;
  if (r.includes('/configuracion'))             return NivelAuditoria.IMPORTANTE;
  if (r.includes('/facturas') && metodo === 'POST') return NivelAuditoria.IMPORTANTE;
  if (r.includes('/descuentos'))                return NivelAuditoria.IMPORTANTE;
  if (r.includes('/usuarios') && ['PUT', 'PATCH'].includes(metodo)) return NivelAuditoria.IMPORTANTE;
  if (r.includes('/roles'))                     return NivelAuditoria.IMPORTANTE;

  return NivelAuditoria.NORMAL;
}

function generarDescripcion(
  metodo: string,
  ruta: string,
  userName?: string,
  responseBody?: unknown,
): string {
  const quien = userName ?? 'Anónimo';
  const r     = ruta.toLowerCase();
  const body  = (responseBody as any)?.data ?? responseBody ?? {};
  const eid   = extraerEntidadId(ruta);

  // Auth
  if (r.includes('/auth/login'))  return `${quien} inició sesión`;
  if (r.includes('/auth/logout')) return `${quien} cerró sesión`;

  // Anulaciones / cancelaciones
  if (r.includes('/anular'))   {
    const modulo = extraerModulo(ruta);
    return `${quien} anuló ${modulo}${eid ? ` #${eid}` : ''}`;
  }
  if (r.includes('/cancelar')) {
    const modulo = extraerModulo(ruta);
    return `${quien} canceló ${modulo}${eid ? ` #${eid}` : ''}`;
  }

  // Facturas
  if (r.includes('/facturas')) {
    if (metodo === 'POST') {
      const num   = body?.numero ?? body?.ncf ?? '';
      const total = body?.total  ?? '';
      const parteNum   = num   ? ` ${num}` : '';
      const parteTotal = total ? ` — RD$${Number(total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '';
      return `${quien} creó factura${parteNum}${parteTotal}`;
    }
    if (['PATCH', 'PUT'].includes(metodo)) return `${quien} modificó factura${eid ? ` #${eid}` : ''}`;
    if (metodo === 'DELETE')               return `${quien} eliminó factura${eid ? ` #${eid}` : ''}`;
  }

  // Notas crédito / débito
  if (r.includes('/notas-credito')) {
    if (metodo === 'POST') return `${quien} emitió nota de crédito`;
    return `${quien} modificó nota de crédito${eid ? ` #${eid}` : ''}`;
  }
  if (r.includes('/notas-debito')) {
    if (metodo === 'POST') return `${quien} emitió nota de débito`;
    return `${quien} modificó nota de débito${eid ? ` #${eid}` : ''}`;
  }

  // Productos
  if (r.includes('/productos')) {
    const nom = body?.nombre ?? '';
    if (metodo === 'POST')                 return `${quien} creó producto${nom ? ` "${nom}"` : ''}`;
    if (['PATCH', 'PUT'].includes(metodo)) return `${quien} modificó producto${nom ? ` "${nom}"` : (eid ? ` #${eid}` : '')}`;
    if (metodo === 'DELETE')               return `${quien} eliminó producto${eid ? ` #${eid}` : ''}`;
  }

  // Ajuste de inventario
  if (r.includes('/inventario/ajuste') || r.includes('/inventario/solicitudes-ajuste')) {
    const prod   = body?.productoNombre ?? body?.producto?.nombre ?? '';
    const motivo = body?.motivo ?? '';
    return `${quien} ajustó stock${prod ? ` de "${prod}"` : ''}${motivo ? ` (${motivo})` : ''}`;
  }

  // Caja
  if (r.includes('/caja')) {
    if (r.includes('/apertura') || r.includes('/abrir')) return `${quien} abrió caja`;
    if (r.includes('/cierre')   || r.includes('/cerrar')) {
      const total = body?.totalEfectivo ?? body?.totalVentas ?? '';
      return `${quien} cerró caja${total ? ` — RD$${Number(total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}`;
    }
    return `${quien} realizó operación de caja`;
  }

  // Usuarios
  if (r.includes('/usuarios')) {
    if (metodo === 'POST')                 return `${quien} creó usuario`;
    if (metodo === 'DELETE')               return `${quien} eliminó usuario${eid ? ` #${eid}` : ''}`;
    if (r.includes('/rol'))                return `${quien} cambió rol de usuario${eid ? ` #${eid}` : ''}`;
    if (['PATCH', 'PUT'].includes(metodo)) return `${quien} modificó usuario${eid ? ` #${eid}` : ''}`;
  }

  // Configuración / empresa
  if (r.includes('/empresa') && ['PUT', 'PATCH'].includes(metodo)) return `${quien} modificó configuración de la empresa`;
  if (r.includes('/configuracion'))                                  return `${quien} actualizó configuración`;

  // POS / ventas
  if (r.includes('/ventas') || r.includes('/pos')) {
    if (metodo === 'POST') {
      const total = body?.total ?? body?.totalFinal ?? '';
      return `${quien} registró venta${total ? ` — RD$${Number(total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}`;
    }
  }

  // Fallback genérico legible
  const acciones: Record<string, string> = {
    POST: 'creó', PATCH: 'actualizó', PUT: 'reemplazó', DELETE: 'eliminó',
  };
  const verbo  = acciones[metodo] ?? 'modificó';
  const modulo = extraerModulo(ruta);
  return `${quien} ${verbo} en ${modulo}${eid ? ` #${eid}` : ''}`;
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
    const req   = context.switchToHttp().getRequest<Request & { user?: User }>();
    const res   = context.switchToHttp().getResponse<Response>();
    const inicio = Date.now();
    const { method, url } = req;

    // Solo escrituras — GET es ruido sin valor auditivo
    const esRutaExcluida = RUTAS_EXCLUIDAS.some((r) => url.startsWith(r));
    if (esRutaExcluida || !METODOS_AUDITABLES.includes(method)) {
      return next.handle();
    }

    const user   = req.user;
    const modulo = extraerModulo(url);
    const accion = determinarAccion(method, url);
    const nivel  = determinarNivel(method, url);

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const duracion = Date.now() - inicio;

        this.auditoriaService
          .registrar({
            userId:      user?.id,
            userName:    user?.nombre,
            userRole:    user?.role,
            empresaId:   (user as any)?.empresaId,
            accion,
            nivel,
            modulo,
            entidad:     modulo,
            entidadId:   extraerEntidadId(url),
            descripcion: generarDescripcion(method, url, user?.nombre, responseBody),
            valorNuevo:  truncarJSON((responseBody as { data?: unknown })?.data ?? responseBody),
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
        const status  = (err as any)?.status ?? 500;
        // Para HttpException (BadRequestException, etc.) el mensaje real está en
        // getResponse().message, no en .message (que es el texto genérico del HTTP status).
        const mensaje = (() => {
          const e = err as any;
          if (typeof e?.getResponse === 'function') {
            const res = e.getResponse();
            if (typeof res === 'object' && res !== null) {
              const m = (res as any).message;
              if (Array.isArray(m)) return m.join('; ');
              if (typeof m === 'string') return m;
            }
            if (typeof res === 'string') return res;
          }
          return e?.message ?? 'Error desconocido';
        })();

        this.auditoriaService
          .registrar({
            userId:      user?.id,
            userName:    user?.nombre,
            userRole:    user?.role,
            empresaId:   (user as any)?.empresaId,
            accion:      AccionAuditoria.ERROR,
            nivel:       NivelAuditoria.IMPORTANTE,
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
