import { SessionLifetimeService } from './session-lifetime.service';

/**
 * Duración de sesión — fuente única y caché.
 *
 * Dos cosas que protege este archivo:
 *
 * 1. **La regla.** «El global es el tope» estaba duplicada literalmente en
 *    AuthService y RefreshTokenService. Dos copias de la misma regla es cómo se
 *    llega a un ajuste que promete una cosa y mide otra.
 *
 * 2. **La caché.** Al bajar JWT_EXPIRES_IN de 1d a 15m las rotaciones se
 *    multiplican por ~96. Sin caché, cada una hacía dos SELECT extra sobre una
 *    RDS t3.small. El orden importa: la caché entra ANTES que el cambio de
 *    expiración, no después.
 */
describe('SessionLifetimeService', () => {
  const HORA = 3_600_000;

  /** DataSource falso que cuenta consultas y responde según el SQL. */
  const fakeDataSource = (opts: { globalHoras?: string | null; sesionHoras?: unknown } = {}) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('configuracion_sistema')) {
        return opts.globalHoras === null ? [] : [{ valor: opts.globalHoras ?? '24' }];
      }
      if ('sesionHoras' in opts) return [{ configuracion: { sesionHoras: opts.sesionHoras } }];
      return [{ configuracion: {} }];
    });
    return { ds: { query } as any, query };
  };

  it('sin override devuelve el global', async () => {
    const { ds } = fakeDataSource({ globalHoras: '24' });
    await expect(new SessionLifetimeService(ds).paraUsuario(1)).resolves.toBe(24 * HORA);
  });

  it('un override por empresa MÁS ESTRICTO que el global se respeta', async () => {
    const { ds } = fakeDataSource({ globalHoras: '24', sesionHoras: 8 });
    await expect(new SessionLifetimeService(ds).paraUsuario(1)).resolves.toBe(8 * HORA);
  });

  it('un override MÁS LAXO que el global NO se respeta — el global es el tope', async () => {
    // configuracion.service.ts ya clampea al guardar; esto es la segunda barrera
    // para filas escritas antes de que ese clampeo existiera.
    const { ds } = fakeDataSource({ globalHoras: '12', sesionHoras: 500 });
    await expect(new SessionLifetimeService(ds).paraUsuario(1)).resolves.toBe(12 * HORA);
  });

  it('un global ausente o ilegible cae al default de 24 h, no a infinito', async () => {
    const { ds: sinFila }  = fakeDataSource({ globalHoras: null });
    const { ds: ilegible } = fakeDataSource({ globalHoras: 'muchas' });
    await expect(new SessionLifetimeService(sinFila).paraUsuario(1)).resolves.toBe(24 * HORA);
    await expect(new SessionLifetimeService(ilegible).paraUsuario(1)).resolves.toBe(24 * HORA);
  });

  it('el rango se clampea a [1h, 720h] aunque la BD traiga basura', async () => {
    const { ds: cero } = fakeDataSource({ globalHoras: '0' });
    const { ds: enorme } = fakeDataSource({ globalHoras: '99999' });
    await expect(new SessionLifetimeService(cero).paraUsuario(1)).resolves.toBe(1 * HORA);
    await expect(new SessionLifetimeService(enorme).paraUsuario(1)).resolves.toBe(720 * HORA);
  });

  it('un fallo de BD no deja la sesión sin límite', async () => {
    const ds = { query: jest.fn().mockRejectedValue(new Error('conexión caída')) } as any;
    await expect(new SessionLifetimeService(ds).paraUsuario(1)).resolves.toBe(24 * HORA);
  });

  // ── Caché ────────────────────────────────────────────────────────────────

  it('la segunda rotación del mismo usuario no vuelve a consultar', async () => {
    const { ds, query } = fakeDataSource({ globalHoras: '24' });
    const svc = new SessionLifetimeService(ds);

    await svc.paraUsuario(1);
    const trasPrimera = query.mock.calls.length;
    expect(trasPrimera).toBe(2); // global + join a empresa

    for (let i = 0; i < 20; i++) await svc.paraUsuario(1);
    expect(query).toHaveBeenCalledTimes(trasPrimera);
  });

  it('la caché es por usuario, pero el global se reaprovecha entre usuarios', async () => {
    const { ds, query } = fakeDataSource({ globalHoras: '24' });
    const svc = new SessionLifetimeService(ds);

    await svc.paraUsuario(1);
    query.mockClear();
    await svc.paraUsuario(2);

    // Solo el join del usuario nuevo: el global sigue cacheado.
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('empresa');
  });

  it('invalidar() fuerza a releer — el ajuste no queda pegado para siempre', async () => {
    const { ds, query } = fakeDataSource({ globalHoras: '24' });
    const svc = new SessionLifetimeService(ds);

    await svc.paraUsuario(1);
    query.mockClear();
    svc.invalidar();
    await svc.paraUsuario(1);

    expect(query.mock.calls.length).toBeGreaterThan(0);
  });

  it('paraEmpresa cachea igual y respeta el tope global', async () => {
    const { ds, query } = fakeDataSource({ globalHoras: '10', sesionHoras: 400 });
    const svc = new SessionLifetimeService(ds);

    await expect(svc.paraEmpresa(61)).resolves.toBe(10 * HORA);
    query.mockClear();
    await expect(svc.paraEmpresa(61)).resolves.toBe(10 * HORA);
    expect(query).not.toHaveBeenCalled();
  });
});
