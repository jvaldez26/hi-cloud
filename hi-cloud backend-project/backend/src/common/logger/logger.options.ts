import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Params } from 'nestjs-pino';
import { ClsServiceManager } from 'nestjs-cls';

/**
 * Configuración de logging estructurado (pino) para HiCloud ERP.
 *
 * Diseño (PASO 1 de observabilidad):
 * - JSON crudo en producción (para que CloudWatch/PM2 lo parseen); pretty en dev.
 * - Cada línea se enriquece automáticamente desde el CLS EXISTENTE (tenant.module)
 *   con requestId + empresaId + userId + sucursalId + rolEmpresa. No creamos otro CLS.
 * - El HttpExceptionFilter es la ÚNICA fuente de errores: silenciamos la línea de
 *   request-completion de pino-http para status >= 400 y para /health (ruido).
 * - Scrubbing desde el inicio: no serializamos el body, y redactamos headers de
 *   credenciales + campos sensibles por si algún día se loguean.
 */

const isProd = process.env.NODE_ENV === 'production';

// Rutas cuyo request-completion NO se auto-loguea (health checks del balanceador/deploy).
const IGNORE_PATHS = ['/api/v1/health', '/health'];

function activeCls() {
  try {
    const cls = ClsServiceManager.getClsService();
    return cls && cls.isActive() ? cls : null;
  } catch {
    return null;
  }
}

/** Campos de correlación tomados del CLS existente. Vacío fuera de un request (crons, boot). */
function clsFields(): Record<string, unknown> {
  const cls = activeCls();
  if (!cls) return {};
  const out: Record<string, unknown> = { requestId: cls.getId() };
  const empresaId  = cls.get<number>('empresaId');
  const userId     = cls.get<number>('userId');
  const sucursalId = cls.get<number>('sucursalId');
  const rolEmpresa = cls.get<string>('rolEmpresa');
  if (empresaId  != null) out.empresaId  = empresaId;
  if (userId     != null) out.userId     = userId;
  if (sucursalId != null) out.sucursalId = sucursalId;
  if (rolEmpresa != null) out.rolEmpresa = rolEmpresa;
  return out;
}

export const loggerOptions: Params = {
  pinoHttp: {
    level: isProd ? 'info' : 'debug',

    // Dev: legible. Prod: JSON de una línea a stdout.
    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },

    // requestId: reutiliza X-Request-Id (si nginx algún día lo pasa) o el id del CLS
    // (ClsModule está con generateId:true) o genera uno. Se devuelve al cliente en el header.
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const header = req.headers['x-request-id'];
      const existing = Array.isArray(header) ? header[0] : header;
      const id = existing ?? activeCls()?.getId() ?? randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    // mixin corre en CADA log (manual y auto) → correlación en todas las líneas.
    mixin: () => clsFields(),

    // Decisión 1: filtro = única fuente de errores → silenciar completion-line de >=400.
    // Decisión 2: silenciar /health.
    customLogLevel: (req: IncomingMessage, res: ServerResponse, err?: Error) => {
      const url = req.url ?? '';
      if (IGNORE_PATHS.some(p => url.startsWith(p))) return 'silent';
      if (err || res.statusCode >= 400) return 'silent';
      return 'info';
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => IGNORE_PATHS.some(p => (req.url ?? '').startsWith(p)),
    },

    // NO serializamos el body ni headers → sin PII/credenciales por construcción.
    serializers: {
      req: (req: any) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: any) => ({ statusCode: res.statusCode }),
    },

    // Defensa en profundidad: si algún código loguea estos paths, se eliminan.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-empresa-id"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.confirmPassword',
        'req.body.token',
        // fiscales / PII sensibles (defensivo)
        'req.body.rnc',
        'req.body.cedula',
        'req.body.encf',
        'req.body.eNCF',
        'password',
        'token',
      ],
      remove: true,
    },
  },
};
