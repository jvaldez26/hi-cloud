import * as path from 'path';
import * as dotenv from 'dotenv';
import * as Sentry from '@sentry/nestjs';

// Cargar .env antes de que NestJS y sus módulos se importen.
// __dirname apunta a dist/ en producción → '../.env' = raíz del backend.
// Path absoluto para no depender del cwd del proceso (PM2 usa symlink).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dsn = process.env.SENTRY_DSN;
const esProduccion = (process.env.NODE_ENV ?? 'production') === 'production';

if (dsn) {
  try {
    Sentry.init({
      dsn,
      release:          process.env.SENTRY_RELEASE || undefined,
      environment:      process.env.NODE_ENV || 'production',
      sendDefaultPii:   false,
      // 10% de las transacciones. Suficiente para ver dónde se va el tiempo sin
      // convertir el tráfico del POS en un torrente de eventos de performance.
      tracesSampleRate: 0.1,
      beforeSend,
    });
    const rel = (process.env.SENTRY_RELEASE ?? 'n/a').slice(0, 7);
    console.log(`[Sentry] Activo (env=${process.env.NODE_ENV ?? 'production'}, release=${rel})`);
  } catch (e) {
    console.error(`[Sentry] ERROR al inicializar: ${(e as Error).message}`);
  }
} else if (esProduccion) {
  // Esto ya pasó una vez y sobrevivió meses: el deploy inyectaba SENTRY_RELEASE
  // pero nunca SENTRY_DSN, así que el backend arrancaba sin reportar NADA. El
  // aviso era un console.log informativo perdido entre los mensajes de arranque
  // y nadie lo miró.
  //
  // No es fatal a propósito — que el backend se niegue a arrancar por esto sería
  // peor que quedarse sin telemetría — pero tiene que ser imposible pasarlo por
  // alto al revisar los logs de un deploy.
  console.error('');
  console.error('  ╔══════════════════════════════════════════════════════════════╗');
  console.error('  ║  SENTRY DESACTIVADO EN PRODUCCIÓN — SIN REPORTE DE ERRORES   ║');
  console.error('  ╠══════════════════════════════════════════════════════════════╣');
  console.error('  ║  Falta la variable de entorno SENTRY_DSN.                    ║');
  console.error('  ║  El backend arranca igual, pero NINGÚN error del servidor     ║');
  console.error('  ║  llegará al panel: se está volando a ciegas.                 ║');
  console.error('  ║                                                              ║');
  console.error('  ║  Arreglo: secret SENTRY_DSN en GitHub + inject_env en el      ║');
  console.error('  ║  workflow de deploy (junto a SENTRY_RELEASE).                ║');
  console.error('  ╚══════════════════════════════════════════════════════════════╝');
  console.error('');
} else {
  console.log('[Sentry] Deshabilitado (SENTRY_DSN no configurado — entorno no productivo)');
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
const TARJETA_RE= /\b\d{15,19}\b/g;              // PAN de tarjeta (Amex 15 … Maestro 19)
const CEDULA_RE = /\b\d{11}\b/g;                 // cédula: 11 díg exactos
const RNC_RE    = /\b\d{9}\b/g;                  // RNC empresa: 9 díg exactos
// UUID v4 — es la forma de sessionToken (initNewSession → randomUUID) y de jti.
// Sin esto, un sessionToken en un mensaje de error salía del servidor en claro,
// que es justo el secreto que sostiene la sesión única.
const UUID_RE   = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function scrubText(text: string): string {
  return text
    .replace(UUID_RE,    ':uuid')   // antes que los numéricos: lleva guiones, no colisiona
    .replace(JWT_RE,     ':jwt')
    .replace(NCF_RE,     ':ncf')
    // Tarjeta antes que cédula/RNC. 15-19 y no 13-19 a propósito: un timestamp
    // en milisegundos tiene 13 dígitos y se enmascararía como tarjeta, cegando
    // el debug sin ganar nada.
    .replace(TARJETA_RE, ':tarjeta')
    .replace(CEDULA_RE,  ':cedula')
    .replace(RNC_RE,     ':rnc');
}

/**
 * Claves cuyo VALOR nunca debe salir del servidor, se parezca a lo que se
 * parezca. Los patrones de scrubText cubren formatos reconocibles; esto cubre
 * lo que no tiene forma fija: una contraseña puede ser cualquier cosa.
 */
const CLAVES_PROHIBIDAS = /^(pass|password|contrasena|contraseña|clave|secret|token|authorization|auth|cookie|apikey|api_key|dsn|sessiontoken|refreshtoken|accesstoken|jti|twofactorsecret|privatekey)$/i;

/** Aplica scrubText a los strings de un objeto (extra/contexts), in-place,
 *  acotado en profundidad y con guarda de ciclos. */
function scrubDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // El nombre de la clave manda sobre el contenido: si se llama `password`,
    // da igual qué haya dentro.
    if (CLAVES_PROHIBIDAS.test(k)) {
      (value as Record<string, unknown>)[k] = '[redactado]';
      continue;
    }
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

    // Breadcrumbs: Sentry los captura SOLO, sin que nadie los declare — cada
    // petición HTTP saliente, cada consola. Ahí acaban URLs con parámetros y
    // datos que el resto del scrub no toca porque no pasan por `extra`.
    // Es el camino por el que la PII se escapa sin que nadie lo escriba.
    for (const b of event.breadcrumbs ?? []) {
      if (typeof b.message === 'string') b.message = scrubText(b.message);
      if (b.data) scrubDeep(b.data);
    }

    // Última red: la URL del request, ya sanitizada arriba, pasa también por el
    // scrub de patrones por si lleva un UUID o un RNC en el path.
    if (typeof event.request?.url === 'string') {
      event.request.url = scrubText(event.request.url);
    }
    return event;
  } catch {
    return null;
  }
}
