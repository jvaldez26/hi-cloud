/**
 * Sentry (frontend) — Paso 3 de observabilidad. Hereda el nivel de scrubbing
 * del backend (common/observability/sentry.ts + instrument.ts):
 *  - sendDefaultPii:false, sin performance tracing (tracesSampleRate:0).
 *  - Session Replay DESACTIVADO (grabaría datos fiscales de pantalla).
 *  - beforeSend elimina request data/cookies/headers/query_string, enmascara
 *    RNC/cédula/NCF/montos en URLs y borra el JWT si se cuela en un error.
 *  - environment desde import.meta.env.MODE; release desde VITE_SENTRY_RELEASE.
 *
 * Se importa como PRIMERA línea de main.tsx, antes de cualquier otro módulo.
 * Sin VITE_SENTRY_DSN (o fuera de producción) NO inicializa — no-op seguro.
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Quita query string y enmascara secuencias de 6+ dígitos (RNC=9, cédula=11, NCF, montos). */
function sanitizeUrl(url?: string): string | undefined {
  if (typeof url !== 'string') return url;
  return url.split('?')[0].replace(/\d{6,}/g, ':n');
}

/**
 * El JWT vive en localStorage; es fácil que se cuele en un mensaje de error o
 * en un stack. sanitizeUrl no lo atrapa (es base64, no dígitos), así que se
 * enmascara por patrón sobre el message y los exception values.
 */
const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
function scrubJwt(text: string): string {
  return text.replace(JWT_RE, ':jwt');
}

/** Aplica scrubJwt a los strings de un objeto (extra/contexts), in-place,
 *  acotado en profundidad y con guarda de ciclos. */
function scrubDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') (value as Record<string, unknown>)[k] = scrubJwt(v);
    else scrubDeep(v, depth + 1, seen);
  }
}

if (import.meta.env.PROD && DSN) {
  Sentry.init({
    dsn:         DSN,
    environment: import.meta.env.MODE,                                   // 'production' en build prod
    release:     import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    sendDefaultPii:           false,
    tracesSampleRate:         0,   // sin performance tracing (paso 3), como backend
    replaysSessionSampleRate: 0,   // Session Replay DESACTIVADO
    replaysOnErrorSampleRate: 0,

    // No añadimos Replay/Tracing/Profiling; filtramos por si algún default los trajera.
    integrations: (defaults) =>
      defaults.filter((i) => !['Replay', 'BrowserTracing', 'BrowserProfiling'].includes(i.name)),

    beforeSend(event) {
      try {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;       // Authorization: Bearer <JWT>
          delete event.request.query_string;
          event.request.url = sanitizeUrl(event.request.url);
        }
        // Hoy nadie llama Sentry.setUser() → event.user llega vacío (sin PII).
        // REGLA: si en el futuro se añade Sentry.setUser(), usar SIEMPRE el userId
        // numérico interno, NUNCA email/cédula/RNC — este beforeSend deja pasar el id tal cual.
        if (event.user) {
          const id = event.user.id;
          event.user = id != null ? { id } : {};
        }
        // Scrub JWT en el mensaje y en cada valor de excepción.
        if (typeof event.message === 'string') event.message = scrubJwt(event.message);
        for (const v of event.exception?.values ?? []) {
          if (typeof v.value === 'string') v.value = scrubJwt(v.value);
        }
        // Por si un token se colara en datos adjuntos (nadie los escribe hoy, pero defensivo).
        if (event.extra)    scrubDeep(event.extra);
        if (event.contexts) scrubDeep(event.contexts);
        return event;
      } catch {
        return null;
      }
    },

    beforeBreadcrumb(crumb) {
      const data = crumb.data as Record<string, unknown> | undefined;
      if (data) {
        if (typeof data.url === 'string')  data.url  = sanitizeUrl(data.url);
        if (typeof data.to === 'string')   data.to   = sanitizeUrl(data.to);
        if (typeof data.from === 'string') data.from = sanitizeUrl(data.from);
      }
      // Conservador por seguridad fiscal: descartar breadcrumbs de console.*
      // (pueden llevar RNC/montos/nombres). REVISABLE si hacen falta para debug.
      if (crumb.category === 'console') return null;
      return crumb;
    },
  });
}
