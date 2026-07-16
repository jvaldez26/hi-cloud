import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';

/**
 * Sentry (PASO 2 de observabilidad) — SOLO rastreo de errores de servidor/infra.
 *
 * Principios de privacidad (datos de clientes dominicanos → tercero en US):
 * - DSN SIEMPRE por variable de entorno; nunca hardcodeado ni en el repo.
 * - sendDefaultPii:false y tracesSampleRate:0 (sin performance tracing en este paso).
 * - beforeSend elimina body, headers, cookies y enmascara secuencias largas de
 *   dígitos (RNC/cédula/NCF) de las URLs. Si el scrubbing falla → NO se envía.
 * - Contexto útil solo como IDs opacos (empresaId, userId, requestId), nunca email/PII.
 * - Ruido vs señal: el HttpExceptionFilter reporta SOLO 5xx / errores no controlados.
 *   Los 4xx de negocio (credenciales, permisos, validación, caja cerrada) NO se envían.
 */

const log = new Logger('Sentry');
let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

export function initSentry(opts: { dsn?: string; release?: string; environment?: string }): boolean {
  const { dsn, release, environment } = opts;
  if (!dsn) {
    log.log('Sentry deshabilitado (SENTRY_DSN no configurado)');
    return false;
  }
  try {
    Sentry.init({
      dsn,
      release:          release || undefined,
      environment:      environment || 'production',
      sendDefaultPii:   false,
      tracesSampleRate: 0,          // PASO 2: solo errores, sin tracing de performance
      beforeSend,
    });
    enabled = true;
    log.log(`Sentry activo (env=${environment ?? 'production'}, release=${release ? release.slice(0, 7) : 'n/a'})`);
    return true;
  } catch (e) {
    // Observabilidad jamás debe tumbar el arranque.
    log.error(`No se pudo inicializar Sentry: ${(e as Error).message}`);
    enabled = false;
    return false;
  }
}

/** Quita query string y enmascara secuencias de 6+ dígitos (RNC=9, cédula=11, NCF). */
export function sanitizeUrl(url: string): string {
  const noQuery = (url || '').split('?')[0];
  return noQuery.replace(/\d{6,}/g, ':n');
}

/** Scrubbing final antes de enviar a un tercero. Ante la duda, NO enviar. */
function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  try {
    if (event.request) {
      const req = event.request as Record<string, unknown>;
      delete req['data'];          // body
      delete req['cookies'];
      delete req['headers'];       // authorization / cookie / x-empresa-id
      delete req['query_string'];
      if (typeof event.request.url === 'string') {
        event.request.url = sanitizeUrl(event.request.url);
      }
    }
    // Nunca PII de usuario: conservar solo un id opaco si existe.
    if (event.user) {
      const id = event.user.id;
      event.user = id != null ? { id } : {};
    }
    return event;
  } catch {
    return null; // si el scrubbing falla, es más seguro descartar el evento
  }
}

/**
 * Reporta a Sentry un error de servidor/infra con contexto del CLS como tags.
 * No-op si Sentry está deshabilitado. Nunca lanza.
 */
export function reportServerError(
  exception: unknown,
  ctx: { status: number; method: string; url: string },
): void {
  if (!enabled) return;
  try {
    const cls = safeCls();
    const tags: Record<string, string> = {
      http_status: String(ctx.status),
      http_method: ctx.method,
      route:       sanitizeUrl(ctx.url),
    };
    const empresaId = cls?.get<number>('empresaId');
    const userId    = cls?.get<number>('userId');
    const requestId = cls?.getId();
    if (empresaId != null) tags.empresaId = String(empresaId);
    if (userId != null)    tags.userId    = String(userId);
    if (requestId)         tags.requestId = requestId;

    Sentry.captureException(exception, { level: 'error', tags });
  } catch {
    /* nunca romper el flujo de respuesta por un fallo de observabilidad */
  }
}

function safeCls() {
  try {
    const c = ClsServiceManager.getClsService();
    return c && c.isActive() ? c : null;
  } catch {
    return null;
  }
}
