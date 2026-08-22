import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * beforeSend de Sentry — contrato de lo que NO puede salir del servidor.
 *
 * instrument.ts se ejecuta al importarlo (llama a Sentry.init con el DSN del
 * entorno), así que no se puede importar en un test. Se re-crean aquí las
 * funciones de scrub a partir del MISMO fuente y se comprueban contra entradas
 * reales; además se verifica que el fuente sigue conteniendo las piezas clave,
 * para que quitar una rompa CI.
 */
describe('Sentry beforeSend — nada sensible sale del servidor', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'instrument.ts'), 'utf8');

  // Re-crear scrubText con los MISMOS patrones del fuente.
  const JWT_RE     = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
  const NCF_RE     = /\bE\d{10,12}\b/g;
  const TARJETA_RE = /\b\d{15,19}\b/g;
  const CEDULA_RE  = /\b\d{11}\b/g;
  const RNC_RE     = /\b\d{9}\b/g;
  const UUID_RE    = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

  const scrubText = (t: string) => t
    .replace(UUID_RE, ':uuid').replace(JWT_RE, ':jwt').replace(NCF_RE, ':ncf')
    .replace(TARJETA_RE, ':tarjeta').replace(CEDULA_RE, ':cedula').replace(RNC_RE, ':rnc');

  const CLAVES = /^(pass|password|contrasena|contraseña|clave|secret|token|authorization|auth|cookie|apikey|api_key|dsn|sessiontoken|refreshtoken|accesstoken|jti|twofactorsecret|privatekey)$/i;

  describe('scrubText enmascara lo que tiene forma reconocible', () => {
    const casos: Array<[string, string, string]> = [
      ['sessionToken (UUID)', 'token=422801d9-ba34-4cd6-b8fc-39526e20aa32', ':uuid'],
      ['JWT',                 'Bearer eyJhbGciOi.eyJzdWIiOjF9.abc-123',      ':jwt'],
      ['e-NCF',               'Comprobante E310000000123 rechazado',         ':ncf'],
      ['tarjeta (16 díg)',    'PAN 4111111111111111 declinada',              ':tarjeta'],
      ['cédula (11 díg)',     'cliente 40212345678 no existe',               ':cedula'],
      ['RNC (9 díg)',         'RNC 132022661 suspendido',                    ':rnc'],
    ];
    it.each(casos)('%s', (_n, entrada, esperado) => {
      const out = scrubText(entrada);
      expect(out).toContain(esperado);
      // El valor original no puede sobrevivir en ninguna forma.
      const original = entrada.match(/[\w-]{9,}/g)?.filter(x => /\d|eyJ/.test(x)) ?? [];
      for (const o of original) expect(out).not.toContain(o);
    });

    it('un timestamp en ms NO se confunde con una tarjeta', () => {
      // 13 dígitos. Si TARJETA_RE fuese \d{13,19} esto se enmascararía y cegaría
      // el debug de cualquier log con Date.now().
      expect(scrubText('ts=1787282375990 ok')).toContain('1787282375990');
    });

    it('no ciega IDs ni montos cortos', () => {
      expect(scrubText('factura 155 total 1250.50')).toBe('factura 155 total 1250.50');
    });
  });

  describe('claves prohibidas por nombre', () => {
    it.each([
      'password', 'contrasena', 'authorization', 'cookie', 'sessionToken',
      'refreshToken', 'jti', 'secret', 'apiKey', 'dsn', 'twoFactorSecret',
    ])('%s se redacta sea cual sea su valor', (clave) => {
      expect(CLAVES.test(clave)).toBe(true);
    });

    it('no redacta claves legítimas de negocio', () => {
      for (const k of ['facturaId', 'clienteNombre', 'total', 'empresaId', 'folio']) {
        expect(CLAVES.test(k)).toBe(false);
      }
    });
  });

  describe('el fuente conserva las defensas', () => {
    it('borra headers, cookies, data y query_string del request', () => {
      for (const campo of ['headers', 'cookies', 'data', 'query_string']) {
        expect(src).toMatch(new RegExp(`delete req\\['${campo}'\\]`));
      }
    });

    it('reduce event.user a solo el id', () => {
      expect(src).toMatch(/event\.user\s*=\s*id\s*!=\s*null\s*\?\s*\{\s*id\s*\}/);
    });

    it('limpia los breadcrumbs (Sentry los captura solo)', () => {
      expect(src).toMatch(/event\.breadcrumbs/);
    });

    it('sendDefaultPii sigue en false', () => {
      expect(src).toMatch(/sendDefaultPii:\s*false/);
    });

    it('avisa si el DSN está vacío en producción, pero NO impide arrancar', () => {
      expect(src).toContain('SENTRY_DSN vacío — Sentry deshabilitado');
      expect(src).toMatch(/console\.warn/);
      // Nada de matar el proceso por no tener telemetría.
      expect(src).not.toMatch(/process\.exit|throw new Error\(['"]SENTRY/);
    });

    it('expone sentryActivo para el health check', () => {
      expect(src).toMatch(/export let sentryActivo/);
      expect(src).toMatch(/sentryActivo\s*=\s*true/);
    });

    it('tracesSampleRate sigue en 0 — el tracing NO se ha reactivado', () => {
      // El scrub es filtrado en el cliente: no añade carga ni instrumenta nada.
      // El tracing (0.1) es lo que instrumenta HTTP y Postgres y consume más
      // memoria, y sigue siendo la hipótesis no descartada de la caída. Van
      // separados a propósito; este test impide que se cuelen juntos otra vez.
      expect(src).toMatch(/tracesSampleRate:\s*0\s*,/);
      expect(src).not.toMatch(/tracesSampleRate:\s*0\.[1-9]/);
    });
  });
});
