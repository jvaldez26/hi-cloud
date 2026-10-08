/**
 * Hotfix 2026-10-07 — 429 (Too Many Requests) de MSeller.
 *
 * Antes, withRetry() clasificaba CUALQUIER 4xx (incluido 429) como
 * EcfValidacionError → el e-CF quedaba RECHAZADO permanentemente por un
 * simple "espera un poco" del proveedor, un error de integridad fiscal real.
 * Ahora el 429 tiene su propia rama: nunca es un rechazo, abre el circuit
 * breaker GLOBAL (todas las empresas, todas las llamadas) respetando
 * Retry-After con un piso de 60s, y lanza EcfComunicacionError (reintentable
 * por el cron, nunca un estado terminal).
 */
import { of, throwError } from 'rxjs';
import { MSellerClientService } from './mseller-client.service';
import { CacheKeys } from '../../common/cache/cache-keys';
import { EcfComunicacionError, EcfValidacionError } from '../errors/ecf.errors';

const EMPRESA = 7;

function buildCacheMock() {
  const store = new Map<string, any>();
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: any) => { store.set(key, value); return Promise.resolve(); }),
    del: jest.fn((key: string) => { store.delete(key); return Promise.resolve(); }),
    _store: store,
  };
}

function buildService() {
  const http = { post: jest.fn(), get: jest.fn() };
  const ecfConfigSvc = {
    isEmpresaBloqueada: jest.fn().mockResolvedValue(false),
    getCredencialesDescifradas: jest.fn().mockResolvedValue({
      email: 'x@x.com', password: 'x', apiKey: 'key', urlBase: 'https://mseller.test', envPath: 'TesteCF',
    }),
    setBloqueadoHasta: jest.fn(),
  };
  const cache = buildCacheMock();

  const svc = new MSellerClientService(http as any, ecfConfigSvc as any, cache as any);
  for (const m of ['log', 'warn', 'debug', 'error'] as const) {
    jest.spyOn((svc as any).logger, m).mockImplementation(() => undefined);
  }
  jest.spyOn(svc as any, 'sleep').mockResolvedValue(undefined);
  return { svc, http, ecfConfigSvc, cache };
}

function err429(retryAfter?: string) {
  const e: any = new Error('Request failed with status code 429');
  e.response = { status: 429, data: { message: 'Too Many Requests' }, headers: {} };
  if (retryAfter != null) e.response.headers['retry-after'] = retryAfter;
  return e;
}

const payloadBase = {
  ECF: { Encabezado: { IdDoc: { eNCF: 'E320000000001' }, Emisor: { FechaEmision: new Date().toISOString().slice(0, 10) } } },
} as any;

describe('MSellerClientService — 429 de MSeller nunca es un rechazo', () => {
  it('429 en el envío → EcfComunicacionError (NO EcfValidacionError) y abre el circuito global', async () => {
    const { svc, http, cache } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } })) // login
      .mockReturnValueOnce(throwError(() => err429('90'))); // envío

    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfComunicacionError);
    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.not.toThrow(EcfValidacionError);

    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.msellerCircuito429(),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('no reintenta de inmediato tras un 429 — un solo intento de envío, no los 3 reintentos normales', async () => {
    const { svc, http } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValueOnce(throwError(() => err429('90')));

    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfComunicacionError);
    expect(http.post).toHaveBeenCalledTimes(2); // 1 login + 1 envío, cero reintentos
  });

  it('Retry-After de 10s se ignora — el piso mínimo del circuito es 60s', async () => {
    const { svc, http, cache } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValueOnce(throwError(() => err429('10')));

    const antes = Date.now();
    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfComunicacionError);

    const hasta = await svc.circuitoGlobal429Hasta();
    expect(hasta).not.toBeNull();
    expect(hasta!.getTime() - antes).toBeGreaterThanOrEqual(59_000);
  });

  it('Retry-After de 120s se respeta por encima del piso', async () => {
    const { svc, http } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValueOnce(throwError(() => err429('120')));

    const antes = Date.now();
    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfComunicacionError);

    const hasta = await svc.circuitoGlobal429Hasta();
    expect(hasta!.getTime() - antes).toBeGreaterThanOrEqual(119_000);
  });

  it('429 en el LOGIN (autenticación) también abre el circuito global y nunca marca rechazo', async () => {
    const { svc, http, cache } = buildService();
    http.post.mockReturnValueOnce(throwError(() => err429('70')));

    await expect(svc.getIdToken(EMPRESA)).rejects.toThrow(EcfComunicacionError);
    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.msellerCircuito429(),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('circuito global abierto → getIdToken corta ANTES de revisar bloqueo por empresa ni llamar a MSeller', async () => {
    const { svc, http, ecfConfigSvc, cache } = buildService();
    await cache.set(CacheKeys.msellerCircuito429(), Date.now() + 60_000, 65_000);

    await expect(svc.getIdToken(EMPRESA)).rejects.toThrow(EcfComunicacionError);
    expect(ecfConfigSvc.isEmpresaBloqueada).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('circuito ya vencido (hasta en el pasado) → no bloquea, sigue intentando con normalidad', async () => {
    const { svc, http, cache } = buildService();
    await cache.set(CacheKeys.msellerCircuito429(), Date.now() - 1_000, 1);
    http.post.mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }));

    await expect(svc.getIdToken(EMPRESA)).resolves.toMatchObject({ idToken: 't' });
  });

  it('single-flight: lock ya tomado por otra instancia → espera y reutiliza su token sin autenticar de nuevo', async () => {
    const { svc, http, cache } = buildService();
    const lockKey  = CacheKeys.msellerTokenLock(EMPRESA);
    const cacheKey = CacheKeys.msellerToken(EMPRESA);
    await cache._store.set(lockKey, '1'); // otra instancia ya tiene el lock

    let polls = 0;
    const originalGet = cache.get.getMockImplementation()!;
    cache.get.mockImplementation((key: string) => {
      if (key === cacheKey) {
        polls += 1;
        if (polls >= 2) {
          return Promise.resolve({ idToken: 'tok-ajeno', accessToken: 'acc-ajeno', expiresAt: Date.now() + 60_000 });
        }
        return Promise.resolve(undefined);
      }
      return originalGet(key);
    });

    await expect(svc.getIdToken(EMPRESA)).resolves.toMatchObject({ idToken: 'tok-ajeno' });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('otros errores 4xx (no 429) siguen clasificándose como EcfValidacionError (rechazo real, sin tocar el circuito)', async () => {
    const { svc, http, cache } = buildService();
    const err400: any = new Error('Bad Request');
    err400.response = { status: 400, data: { message: 'RNC inválido' } };
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValueOnce(throwError(() => err400));

    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfValidacionError);
    expect(await svc.circuitoGlobal429Hasta()).toBeNull();
  });
});
