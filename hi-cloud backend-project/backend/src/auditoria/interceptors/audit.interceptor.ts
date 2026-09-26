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
const RUTAS_EXCLUIDAS = [
  '/api-json', '/api-yaml', '/favicon.ico', '/api/swagger', '/api/docs',
  // Ruido técnico de sesión, no acciones del usuario: /auth/actividad es un
  // heartbeat (hasta 60/min, sin crear nada — solo actualiza lastActivityAt)
  // y /auth/refresh rota el access token automáticamente varias veces por
  // sesión. Ambos generaban "X creó en auth" sin aportar nada al rastro que
  // un admin necesita ver.
  '/api/v1/auth/actividad', '/api/v1/auth/refresh',
];

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
  if (r.includes('/condonar')) return NivelAuditoria.CRITICO;
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

/** Exportada solo para test unitario directo — ver audit.interceptor.spec.ts. */
export function generarDescripcion(
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
  if (r.includes('/auth/2fa/complete-login'))    return `${quien} inició sesión (verificación en 2 pasos)`;
  if (r.includes('/auth/register'))              return `Nueva cuenta registrada${body?.email ? ` (${body.email})` : ''}`;
  if (r.includes('/auth/cambiar-empresa'))        return `${quien} cambió de empresa activa`;
  if (r.includes('/auth/cambiar-sucursal'))       return `${quien} cambió de sucursal activa`;
  if (r.includes('/auth/change-password'))        return `${quien} cambió su contraseña`;
  if (r.includes('/auth/setup-password'))         return `${quien} configuró su contraseña inicial`;
  if (r.includes('/auth/reset-password'))         return `${quien} restableció su contraseña`;
  if (r.includes('/auth/forgot-password'))        return `${quien} solicitó restablecer su contraseña`;
  if (r.includes('/auth/verify-email'))           return `${quien} verificó su correo`;
  if (r.includes('/auth/resend-verification'))    return `${quien} solicitó reenvío de verificación de correo`;
  if (r.includes('/auth/no-fui-yo'))              return `Se reportó un inicio de sesión no reconocido — sesiones cerradas`;
  if (r.includes('/auth/verificar-supervisor'))   return `${quien} autorizó modo supervisor`;
  if (r.includes('/auth/supervisor-log/cerrar'))  return `${quien} cerró su sesión de modo supervisor`;
  if (r.includes('/auth/usuarios/') && r.includes('/cerrar-sesion')) {
    // extraerEntidadId solo mira el ÚLTIMO segmento (aquí sería "cerrar-sesion",
    // no numérico) — el id del usuario objetivo va justo antes.
    const partes = ruta.split('/').filter(Boolean);
    const idx = partes.indexOf('cerrar-sesion');
    const targetId = idx > 0 ? partes[idx - 1] : undefined;
    return `${quien} forzó el cierre de sesión de otro usuario${targetId ? ` #${targetId}` : ''}`;
  }
  if (r.includes('/auth/contacto-soporte'))       return `${quien} envió un mensaje de soporte`;

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

  // Condonar mora (educativo)
  if (r.includes('/condonar')) {
    const cond   = body?.condonacion ?? {};
    const monto  = cond?.montoCondonado ?? '';
    const motivo = cond?.motivo ?? '';
    const cargoId = cond?.cargoId ?? body?.cargo?.id ?? '';
    const parteMonto = monto ? ` — RD$${Number(monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '';
    return `${quien} condonó mora${parteMonto}${cargoId ? ` del cargo #${cargoId}` : ''}${motivo ? ` (${motivo})` : ''}`;
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

  // e-CF (emisión de comprobantes fiscales) — orden importa: los sufijos más
  // específicos van antes que su prefijo compartido ('/emitir' es substring
  // de '/emitir-pago-exterior'; '/consultar-estado' lo es de
  // '/consultar-estados'), si no la rama genérica se comería a la específica.
  if (r.includes('/ecf/')) {
    const encf = body?.encf ? ` ${body.encf}` : '';
    if (r.includes('/nota-debito')  && r.includes('/emitir')) return `${quien} emitió e-CF de Nota de Débito${encf}`;
    if (r.includes('/nota-credito') && r.includes('/emitir')) return `${quien} emitió e-CF de Nota de Crédito${encf}`;
    if (r.includes('/compra/')  && r.includes('/emitir-pago-exterior')) return `${quien} emitió e-CF de Pago al Exterior${encf}`;
    if (r.includes('/factura/') && r.includes('/emitir-exportacion'))   return `${quien} emitió e-CF de Exportación${encf}`;
    if (r.includes('/compra/')  && r.includes('/emitir'))  return `${quien} emitió e-CF de Compras (E41)${encf}`;
    if (r.includes('/gasto/')   && r.includes('/emitir'))  return `${quien} emitió e-CF de Gasto Menor${encf}`;
    if (r.includes('/secuencias'))        return `${quien} configuró una secuencia de e-CF`;
    if (r.includes('/archivar-masivo'))   return `${quien} archivó e-CF en lote`;
    if (r.includes('/consultar-estados')) return `${quien} consultó estados de e-CF en lote`;
    if (r.includes('/consultar-estado'))  return `${quien} consultó el estado de un e-CF ante DGII`;
    if (r.includes('/reenviar'))          return `${quien} reenvió un e-CF a DGII`;
    if (r.includes('/ejecutar-reintentos')) return `${quien} ejecutó reintentos de envío de e-CF`;
    if (r.includes('/config/proveedor'))    return `${quien} configuró el proveedor de e-CF`;
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
