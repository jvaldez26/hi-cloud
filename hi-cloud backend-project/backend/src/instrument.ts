import * as path from 'path';
import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/nestjs';

// Cargar .env antes de que NestJS y sus módulos se importen.
// __dirname apunta a dist/ en producción → '../.env' = raíz del backend.
// Path absoluto para no depender del cwd del proceso (PM2 usa symlink).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dsn = process.env.SENTRY_DSN;
const esProduccion = (process.env.NODE_ENV ?? 'production') === 'production';

/**
 * `sentryActivo` lo lee el health check (/health?deep=true) para que la
 * verificación de un deploy pueda comprobar si la telemetría quedó encendida,
 * sin depender de que alguien lea los logs de arranque.
 */
export let sentryActivo = false;

// Un DSN VACÍO no es lo mismo que un DSN AUSENTE: significa que alguien creyó
// configurarlo y no llegó. Ese caso tiene que doler al leer el log, porque el
// efecto es quedarse sin un solo stack trace del servidor justo el día que haga
// falta. (Y hasta hace un momento, además, tumbaba el arranque: la variable
// vacía pisaba el .env y Joi la rechazaba por no ser una URI.)
if (dsn === '' && esProduccion) {
  console.warn('');
  console.warn('  ⚠️  ─────────────────────────────────────────────────────────');
  console.warn('  ⚠️   SENTRY_DSN vacío — Sentry deshabilitado');
  console.warn('  ⚠️   El backend arranca, pero NINGÚN error llegará al panel.');
  console.warn('  ⚠️   Revisa el secreto SENTRY_DSN del repositorio.');
  console.warn('  ⚠️  ─────────────────────────────────────────────────────────');
  console.warn('');
}

if (dsn) {
  try {
    Sentry.init({
      dsn,
      release:          process.env.SENTRY_RELEASE || undefined,
      environment:      process.env.NODE_ENV || 'production',
      sendDefaultPii:   false,
      tracesSampleRate: 0,
      beforeSend,
    });
    sentryActivo = true;
    const rel = (process.env.SENTRY_RELEASE ?? 'n/a').slice(0, 7);
    console.log(`[Sentry] Activo (env=${process.env.NODE_ENV ?? 'production'}, release=${rel})`);
  } catch (e) {
    console.error(`[Sentry] ERROR al inicializar: ${(e as Error).message}`);
  }
} else if (dsn !== '') {
  // Ausente del todo (no vacío): en desarrollo es lo normal y no merece ruido.
  console.log('[Sentry] Deshabilitado (SENTRY_DSN no configurado)');
}

function sanitizeUrl(url: string): string {
  const noQuery = (url || '').split('?')[0];
  return noQuery.replace(/\d{6,}/g, ':n');
}

/**
 * Scrub DIRIGIDO de PII fiscal en texto libre (message, exception values, extra,
 * contexts). sanitizeUrl sólo cubre URLs; esto cubre el cuerpo del evento.
 * Mismos patrones y etiquetas que el frontend (instrument.ts del front), para
 * que ambos lados enmascaren idéntico. Enmascara SOLO patrones fiscales
 * dominicanos, no todos los dígitos, para no cegar el debug (IDs y montos quedan).
 * Orden: e-NCF antes que los de longitud, para que sus dígitos no caigan en
 * cédula(11)/RNC(9).
 */
const JWT_RE    = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;  // JWT
const NCF_RE    = /\bE\d{10,12}\b/g;             // e-NCF: E + 12 díg
const CEDULA_RE = /\b\d{11}\b/g;                 // cédula: 11 díg exactos
const RNC_RE    = /\b\d{9}\b/g;                  // RNC empresa: 9 díg exactos

function scrubText(text: string): string {
  return text
    .replace(JWT_RE,    ':jwt')
    .replace(NCF_RE,    ':ncf')
    .replace(CEDULA_RE, ':cedula')
    .replace(RNC_RE,    ':rnc');
}

/** Aplica scrubText a los strings de un objeto (extra/contexts), in-place,
 *  acotado en profundidad y con guarda de ciclos. */
function scrubDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') (value as Record<string, unknown>)[k] = scrubText(v);
    else scrubDeep(v, depth + 1, seen);
  }
}

/**
 * Tipos de excepción NestJS de validación de negocio esperada.
 * Estos 4xx son respuestas normales del sistema a input inválido — no son bugs.
 * Se omiten de Sentry para evitar ruido en el tablero de alertas.
 *
 * Conservamos intencionalmente:
 *   - ForbiddenException   (403) — posible bug de permisos o bloqueo TenantSubscriber
 *   - UnauthorizedException (401) — señal de seguridad
 *   - Todo lo que no sea HttpException — errores de infra reales
 */
const SKIP_EXCEPTION_TYPES = new Set([
  'BadRequestException',           // 400 — validación de input / stock insuficiente / etc.
  'NotFoundException',             // 404 — recurso no encontrado (esperado)
  'ConflictException',             // 409 — unicidad / estado inválido
  'UnprocessableEntityException',  // 422 — EcfError y similares
  'GoneException',                 // 410 — recurso eliminado (esperado)
  'PayloadTooLargeException',      // 413 — payload de cliente demasiado grande
  'MethodNotAllowedException',     // 405 — método HTTP incorrecto
]);

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  try {
    const firstEx = event.exception?.values?.[0];

    // Descartar rechazos CORS — comportamiento esperado del servidor, no un bug.
    // Con la IP pública expuesta se generan continuamente (scanners AWS/bots) y
    // taparían errores reales en el tablero, igual que pasó con los chunk-load errors.
    // El HttpExceptionFilter los logea en warn con ruta + user-agent para que una
    // misconfiguration real (dominio cliente mal puesto) siga siendo visible.
    const firstValue = firstEx?.value ?? '';
    if (typeof firstValue === 'string' && firstValue.startsWith('CORS:')) {
      return null;
    }

    // Descartar excepciones 4xx de validación de negocio esperadas
    if (firstEx?.type && SKIP_EXCEPTION_TYPES.has(firstEx.type)) {
      return null;
    }

    if (event.request) {
      const req = event.request as Record<string, unknown>;
      delete req['data'];
      delete req['cookies'];
      delete req['headers'];
      delete req['query_string'];
      if (typeof event.request.url === 'string') {
        event.request.url = sanitizeUrl(event.request.url);
      }
    }
    if (event.user) {
      const id = event.user.id;
      event.user = id != null ? { id } : {};
    }
    // Scrub de PII fiscal (JWT/e-NCF/cédula/RNC) en el cuerpo del evento.
    if (typeof event.message === 'string') event.message = scrubText(event.message);
    for (const v of event.exception?.values ?? []) {
      if (typeof v.value === 'string') v.value = scrubText(v.value);
    }
    if (event.extra)    scrubDeep(event.extra);
    if (event.contexts) scrubDeep(event.contexts);
    return event;
  } catch {
    return null;
  }
}
