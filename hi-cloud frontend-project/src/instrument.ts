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
import { isNavigatingAway } from './utils/sessionEvents';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Quita query string y enmascara secuencias de 6+ dígitos (RNC=9, cédula=11, NCF, montos). */
function sanitizeUrl(url?: string): string | undefined {
  if (typeof url !== 'string') return url;
  return url.split('?')[0].replace(/\d{6,}/g, ':n');
}

/**
 * Scrub DIRIGIDO de PII fiscal en texto libre (message, exception values, extra,
 * contexts). sanitizeUrl (arriba) sólo cubre URLs; esto cubre el cuerpo del evento.
 * Enmascara SOLO patrones fiscales dominicanos, no todos los dígitos, para no cegar
 * el debug (IDs de factura/producto de 4-8 díg y montos quedan intactos).
 * Orden importa: e-NCF antes que los patrones de longitud, para que sus dígitos
 * no caigan en cédula(11)/RNC(9).
 * Trade-off aceptado: códigos de barras de producto de exactamente 9/11 díg se
 * enmascararían si aparecieran en un error (raro) — se prioriza no filtrar PII.
 */
const JWT_RE    = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;  // JWT (vive en localStorage)
const NCF_RE    = /\bE\d{10,12}\b/g;             // e-NCF: E + 12 díg (rango por robustez)
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
        // Durante un logout suave la app está desmontando componentes y pueden
        // producirse errores de lazy chunk abortado o de teardown de React. No
        // son bugs del código — el usuario ya está siendo redirigido a /login.
        if (isNavigatingAway) return null;

        // Chunk load errors son ruido esperado tras un deploy — no son fallos
        // de código. Se producen cuando el SW activa mid-session y un import()
        // de hash viejo falla. El listener de vite:preloadError ya los maneja.
        const errMsg = event.exception?.values?.[0]?.value ?? '';
        const errType = event.exception?.values?.[0]?.type ?? '';
        if (
          errMsg.includes('Failed to fetch dynamically imported module') ||
          errMsg.includes('Unable to preload CSS') ||
          (errMsg.includes('Loading chunk') && errMsg.includes('failed'))
        ) return null;

        // Google Translate (y extensiones similares) inyectan elementos <font>
        // en el DOM, lo que rompe removeChild/insertBefore de React cuando la
        // extensión elimina esos nodos. No es un bug nuestro y no tiene fix de código.
        // Identificamos la huella: NotFoundError + 'removeChild' o 'insertBefore'.
        if (
          (errType === 'NotFoundError' || errMsg.includes('NotFoundError')) &&
          (errMsg.includes('removeChild') || errMsg.includes('insertBefore'))
        ) return null;

        // Service Worker offline sintético — el SW devuelve un 503 cuando el
        // dispositivo del usuario pierde conectividad. Tiene X-SW-Offline: 1 y
        // swGenerated: true en el body. El cliente axios ya lo descarta antes de
        // captureException, pero si algún otro path lo captura este beforeSend
        // es la red de seguridad.
        if (
          errMsg.includes('Sin conexión') ||
          (event.extra as any)?.swOffline === true
        ) return null;

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
        // Scrub de PII fiscal (JWT/e-NCF/cédula/RNC) en mensaje y valores de excepción.
        if (typeof event.message === 'string') event.message = scrubText(event.message);
        for (const v of event.exception?.values ?? []) {
          if (typeof v.value === 'string') v.value = scrubText(v.value);
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
