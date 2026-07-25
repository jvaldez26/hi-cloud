/**
 * S-63 — Tests de regresión: exención del TenantMiddleware anclada al inicio.
 *
 * VULNERABILIDAD ORIGINAL:
 * La lista de rutas exentas se evaluaba con `path.includes(r)`. Como '/admin'
 * está en la lista, CUALQUIER path que contuviera ese fragmento en cualquier
 * posición se saltaba el middleware y se quedaba sin contexto de empresa.
 *
 * Vector concreto: GET /auditoria/modulo/admin — un parámetro de ruta con el
 * valor "admin" — dejaba el request sin empresaId, y AuditoriaController
 * (accesible a ADMIN y CONTADOR) devolvía los logs de TODAS las empresas.
 */

import { TenantMiddleware } from './tenant.middleware';

const exenta = (p: string) => TenantMiddleware.esRutaSinTenant(p);

describe('S-63 — rutas exentas de tenant (ancladas al inicio)', () => {
  describe('siguen exentas: rutas de sistema y públicas', () => {
    const EXENTAS = [
      '/api/v1/auth/login',
      '/api/v1/admin',
      '/api/v1/admin/empresas',
      '/api/v1/admin/ecf-config/dashboard',
      '/api/v1/admin/pagos-suscripcion/resumen-cobros',
      '/api/v1/health',
      '/api/v1/portal/tickets',
      '/api/v1/invitaciones/aceptar/abc123',
      '/api/v1/invitacion/xyz',
      '/api/v1/encuestas/responder/9',
      '/api/v1/demo/solicitar',
      '/api/v1/datafono/webhook',
      '/api/v1/capacitacion',
      '/api/v1/multi-empresa/mis-empresas',
      '/api/v1/multi-empresa/empresa-principal',
      '/api-json',
    ];
    it.each(EXENTAS)('%s', (p) => expect(exenta(p)).toBe(true));
  });

  describe('YA NO se cuelan: el fragmento aparece en medio del path', () => {
    const ATAQUES = [
      '/api/v1/auditoria/modulo/admin',        // el vector real de la auditoría
      '/api/v1/auditoria/modulo/admin/extra',
      '/api/v1/clientes/buscar/admin',
      '/api/v1/productos/codigo/demo',
      '/api/v1/reportes/health',
      '/api/v1/facturas/portal',
      '/api/v1/x/encuestas',
      '/api/v1/suscripciones/admin/pruebas', // de plataforma, pero ya no por substring
    ];
    it.each(ATAQUES)('%s', (p) => expect(exenta(p)).toBe(false));
  });

  describe('no se confunde con rutas de nombre parecido', () => {
    it.each([
      '/api/v1/administracion',
      '/api/v1/admin-panel',
      '/api/v1/demoledor',
      '/api/v1/portal-empleado/mis-datos',
      '/api/v1/healthcheck-interno',
    ])('%s NO está exenta', (p) => expect(exenta(p)).toBe(false));
  });

  describe('/portal/admin sigue exigiendo tenant (excepción explícita)', () => {
    it.each([
      '/api/v1/portal/admin',
      '/api/v1/portal/admin/tickets',
      '/api/v1/portal/admin/tickets/5/responder',
    ])('%s NO está exenta', (p) => expect(exenta(p)).toBe(false));
  });

  it('funciona con y sin el prefijo global', () => {
    expect(exenta('/auth/login')).toBe(true);
    expect(exenta('/api/v1/auth/login')).toBe(true);
    expect(exenta('/auditoria/modulo/admin')).toBe(false);
  });
});
