import * as Sentry from '@sentry/nestjs';
import { ClsServiceManager } from 'nestjs-cls';

/**
 * Sentry (PASO 2 de observabilidad) — SOLO rastreo de errores de servidor/infra.
 *
 * Principios de privacidad (datos de clientes dominicanos → tercero en US):
 * - DSN SIEMPRE por variable de entorno; nunca hardcodeado ni en el repo.
 * - sendDefaultPii:false y tracesSampleRate:0 (sin performance tracing en este paso).
 * - beforeSend (en instrument.ts) elimina body, headers, cookies y enmascara
 *   secuencias largas de dígitos (RNC/cédula/NCF) de las URLs.
 * - Contexto útil solo como IDs opacos (empresaId, userId, requestId), nunca email/PII.
 * - Ruido vs señal: el HttpExceptionFilter reporta SOLO 5xx / errores no controlados.
 *   Los 4xx de negocio (credenciales, permisos, validación, caja cerrada) NO se envían.
 */

export function isSentryEnabled(): boolean {
  return !!Sentry.getClient();
}

/** Quita query string y enmascara secuencias de 6+ dígitos (RNC=9, cédula=11, NCF). */
export function sanitizeUrl(url: string): string {
  const noQuery = (url || '').split('?')[0];
  return noQuery.replace(/\d{6,}/g, ':n');
}

/**
 * Reporta a Sentry un error de servidor/infra con contexto del CLS como tags.
 * No-op si Sentry no está inicializado. Nunca lanza.
 */
export function reportServerError(
  exception: unknown,
  ctx: { status: number; method: string; url: string },
): void {
  if (!Sentry.getClient()) return;
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

/**
 * Reporta a Sentry un error ocurrido dentro de un cron/tarea programada.
 * No hay contexto HTTP (status/method/url) ni request-scoped CLS aquí, así que
 * el contexto lo aporta el llamador vía `cron` + `extraTags`.
 * No-op si Sentry no está inicializado. Nunca lanza.
 */
export function reportCronError(
  exception: unknown,
  cron: string,
  extraTags: Record<string, string | number> = {},
): void {
  if (!Sentry.getClient()) return;
  try {
    const tags: Record<string, string> = { cron };
    for (const [k, v] of Object.entries(extraTags)) tags[k] = String(v);
    Sentry.captureException(exception, { level: 'error', tags });
  } catch {
    /* nunca romper el cron por un fallo de observabilidad */
  }
}

/**
 * Reporta a Sentry un error ocurrido en un service/use-case sin contexto HTTP ni cron.
 * Útil para fallos silenciosos (swallow) que de otro modo serían invisibles.
 * No-op si Sentry no está inicializado. Nunca lanza.
 */
export function reportServiceError(
  exception: unknown,
  operation: string,
  extraTags: Record<string, string | number> = {},
): void {
  if (!Sentry.getClient()) return;
  try {
    const tags: Record<string, string> = { operation };
    for (const [k, v] of Object.entries(extraTags)) tags[k] = String(v);
    Sentry.captureException(exception, { level: 'error', tags });
  } catch {
    /* nunca romper el flujo de servicio */
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
