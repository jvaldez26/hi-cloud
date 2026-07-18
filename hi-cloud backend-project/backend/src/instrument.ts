import * as path from 'path';
import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/nestjs';

// Cargar .env antes de que NestJS y sus módulos se importen.
// __dirname apunta a dist/ en producción → '../.env' = raíz del backend.
// Path absoluto para no depender del cwd del proceso (PM2 usa symlink).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dsn = process.env.SENTRY_DSN;
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
    const rel = (process.env.SENTRY_RELEASE ?? 'n/a').slice(0, 7);
    console.log(`[Sentry] Activo (env=${process.env.NODE_ENV ?? 'production'}, release=${rel})`);
  } catch (e) {
    console.warn(`[Sentry] Error al inicializar: ${(e as Error).message}`);
  }
} else {
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

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  try {
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
