import { readFileSync } from 'fs';
import { join } from 'path';
import { ActividadInterceptor } from './actividad.interceptor';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Actividad de sesión — qué cuenta como «hay una persona aquí».
 *
 * Contexto: `lastActivityAt` lo escribía TenantMiddleware en CADA request
 * autenticado. Eso mide tráfico, no presencia. El frontend tiene ~40
 * `refetchInterval` (el POS sondea cada 30 s, la caja cada 5 s), así que un POS
 * olvidado en el mostrador se marcaba como activo toda la noche y la sesión no
 * caducaba nunca.
 *
 * La regla que estos tests protegen es una sola: **un GET nunca es actividad.**
 * Es lo único que separa a una persona de un sondeo, porque leer un reporte y
 * sondear la caja son el mismo verbo contra el mismo endpoint.
 */
describe('Actividad de sesión', () => {
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // ── El respaldo por mutaciones ────────────────────────────────────────────

  describe('ActividadInterceptor', () => {
    const construir = () => {
      const registrar = jest.fn();
      const svc = { registrarActividad: registrar } as unknown as RefreshTokenService;
      return { interceptor: new ActividadInterceptor(svc), registrar };
    };

    const contexto = (method: string, path: string, user?: { id: number }) => ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ method, path, user }) }),
    }) as any;

    const handler = () => ({ handle: () => ({}) }) as any;

    it('una mutación de un usuario autenticado cuenta como actividad', () => {
      const { interceptor, registrar } = construir();
      interceptor.intercept(contexto('POST', '/api/v1/facturas', { id: 7 }), handler());
      expect(registrar).toHaveBeenCalledWith(7);
    });

    it.each(['PUT', 'PATCH', 'DELETE'])('%s también cuenta', (metodo) => {
      const { interceptor, registrar } = construir();
      interceptor.intercept(contexto(metodo, '/api/v1/clientes/3', { id: 7 }), handler());
      expect(registrar).toHaveBeenCalledWith(7);
    });

    it('un GET NUNCA cuenta — es la regla que impide que un sondeo pase por persona', () => {
      const { interceptor, registrar } = construir();
      // Justo los endpoints que sondean hoy cada pocos segundos.
      for (const ruta of ['/api/v1/caja/hoy', '/api/v1/restaurante/kds', '/api/v1/alertas']) {
        interceptor.intercept(contexto('GET', ruta, { id: 7 }), handler());
      }
      expect(registrar).not.toHaveBeenCalled();
    });

    it.each(['/api/v1/auth/refresh', '/api/v1/auth/actividad', '/api/v1/auth/logout'])(
      'la maquinaria de sesión no cuenta como actividad: %s',
      (ruta) => {
        const { interceptor, registrar } = construir();
        interceptor.intercept(contexto('POST', ruta, { id: 7 }), handler());
        expect(registrar).not.toHaveBeenCalled();
      },
    );

    it('sin usuario autenticado no registra nada', () => {
      const { interceptor, registrar } = construir();
      interceptor.intercept(contexto('POST', '/api/v1/auth/login'), handler());
      expect(registrar).not.toHaveBeenCalled();
    });
  });

  // ── El throttle del servidor ──────────────────────────────────────────────

  describe('RefreshTokenService.registrarActividad', () => {
    const construir = () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const svc = new RefreshTokenService(
        { manager: { query } } as any,
        {} as any,
        {} as any,
      );
      return { svc, query };
    };

    it('escribe la primera vez', () => {
      const { svc, query } = construir();
      svc.registrarActividad(7);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('lastActivityAt');
      expect(query.mock.calls[0][1]).toEqual([7]);
    });

    it('throttlea aunque el cliente ignore su propio throttle', () => {
      const { svc, query } = construir();
      for (let i = 0; i < 50; i++) svc.registrarActividad(7);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('el throttle es por usuario, no global', () => {
      const { svc, query } = construir();
      svc.registrarActividad(7);
      svc.registrarActividad(8);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('vuelve a escribir pasado el intervalo', () => {
      const { svc, query } = construir();
      svc.registrarActividad(7);
      const avance = Date.now() + 5 * 60 * 1000 + 1;
      jest.spyOn(Date, 'now').mockReturnValue(avance);
      svc.registrarActividad(7);
      jest.restoreAllMocks();
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('solo toca sesiones vivas: ni revocadas ni expiradas', () => {
      const { svc, query } = construir();
      svc.registrarActividad(7);
      const sql = query.mock.calls[0][0] as string;
      expect(sql).toContain('"revokedAt" IS NULL');
      expect(sql).toContain('"expiresAt" > NOW()');
    });
  });

  // ── La regresión que no debe volver ───────────────────────────────────────

  it('TenantMiddleware no escribe lastActivityAt', () => {
    // Volver a escribirlo desde el middleware reintroduce el bug entero: ve
    // tráfico, no personas, y además sale temprano en RUTAS_SIN_TENANT (donde
    // vive '/admin/'), que era el punto ciego del modal de sesión única.
    const ruta = join(__dirname, '..', 'tenant', 'tenant.middleware.ts');
    const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
    expect(codigo).not.toContain('lastActivityAt');
  });
});
