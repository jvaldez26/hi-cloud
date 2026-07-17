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
    return event;
  } catch {
    return null;
  }
}
