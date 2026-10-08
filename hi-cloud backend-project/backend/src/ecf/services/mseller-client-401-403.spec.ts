/**
 * Hotfix 2026-10-07 (parte 2) — 401/403 de MSeller en el ENVÍO (no el login).
 *
 * FAC-1705: errorEnvio = "MSeller rechazó el documento [403]: Forbidden".
 * El bucket 4xx de withRetry() corría ANTES del chequeo de 401 — el chequeo
 * de 401 nunca se alcanzaba (código muerto) y un token rechazado por MSeller
 * para ESA llamada específica (aunque getIdToken lo haya devuelto como
 * "vigente") se sellaba como EcfValidacionError → RECHAZADO permanente, el
 * mismo error de integridad fiscal que el 429. Ahora 401/403 se reintentan
 * UNA vez con token fresco (incluso con maxRetries=0, el caso del POS) y,
 * si persiste, abren el mismo circuit breaker global que el 429 — nunca
 * RECHAZADO por esto.
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
  return { svc, http, cache };
}

function errStatus(status: number, mensaje = 'Forbidden') {
  const e: any = new Error(`Request failed with status code ${status}`);
  e.response = { status, data: { message: mensaje }, headers: {} };
  return e;
}

const payloadBase = {
  ECF: { Encabezado: { IdDoc: { eNCF: 'E320000000001' }, Emisor: { FechaEmision: new Date().toISOString().slice(0, 10) } } },
} as any;

describe('MSellerClientService — 401/403 en el envío nunca es un rechazo', () => {
  it('403 en el primer intento de envío → se reintenta UNA vez con token fresco, y si el 2do intento tiene éxito, resuelve bien (sin EcfValidacionError)', async () => {
    const { svc, http, cache } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't1', accessToken: 'a1', refreshToken: 'r1' } })) // login inicial
      .mockReturnValueOnce(throwError(() => errStatus(403))) // 1er intento de envío: 403
      .mockReturnValueOnce(of({ data: { idToken: 't2', accessToken: 'a2', refreshToken: 'r2' } })) // re-login (token invalidado)
      .mockReturnValueOnce(of({ data: { internalTrackId: 'trk-1', securityCode: 'sc', qr_url: 'u', signedDate: '01-01-2026 10:00:00' } })); // 2do intento de envío: OK

    const res = await svc.enviarDocumento(payloadBase, EMPRESA, 30_000, { maxRetries: 0 });
    expect(res.internalTrackId).toBe('trk-1');
    expect(cache.del).toHaveBeenCalledWith(CacheKeys.msellerToken(EMPRESA));
  });

  it('403 persistente incluso tras renovar el token → EcfComunicacionError (NO EcfValidacionError) y abre el circuito global', async () => {
    const { svc, http, cache } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't1', accessToken: 'a1', refreshToken: 'r1' } }))
      .mockReturnValueOnce(throwError(() => errStatus(403)))
      .mockReturnValueOnce(of({ data: { idToken: 't2', accessToken: 'a2', refreshToken: 'r2' } }))
      .mockReturnValueOnce(throwError(() => errStatus(403))); // persiste con token fresco

    await expect(svc.enviarDocumento(payloadBase, EMPRESA, 30_000, { maxRetries: 0 }))
      .rejects.toThrow(EcfComunicacionError);

    expect(await svc.circuitoGlobal429Hasta()).not.toBeNull();
  });

  it('401 persistente tras renovar el token → mismo comportamiento que 403 (EcfComunicacionError, circuito abierto)', async () => {
    const { svc, http } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't1', accessToken: 'a1', refreshToken: 'r1' } }))
      .mockReturnValueOnce(throwError(() => errStatus(401, 'Unauthorized')))
      .mockReturnValueOnce(of({ data: { idToken: 't2', accessToken: 'a2', refreshToken: 'r2' } }))
      .mockReturnValueOnce(throwError(() => errStatus(401, 'Unauthorized')));

    await expect(svc.enviarDocumento(payloadBase, EMPRESA, 30_000, { maxRetries: 0 }))
      .rejects.toThrow(EcfComunicacionError);
  });

  it('el reintento por token funciona incluso con maxRetries=0 (camino POS) — no depende del contador de reintentos normales', async () => {
    const { svc, http } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't1', accessToken: 'a1', refreshToken: 'r1' } }))
      .mockReturnValueOnce(throwError(() => errStatus(403)))
      .mockReturnValueOnce(of({ data: { idToken: 't2', accessToken: 'a2', refreshToken: 'r2' } }))
      .mockReturnValueOnce(of({ data: { internalTrackId: 'trk-pos', securityCode: 'sc', qr_url: 'u', signedDate: '01-01-2026 10:00:00' } }));

    const res = await svc.enviarDocumento(payloadBase, EMPRESA, 9_000, { maxRetries: 0, authTimeoutMs: 3_000 });
    expect(res.internalTrackId).toBe('trk-pos');
    // 1 login + 1 envío fallido + 1 re-login + 1 envío exitoso = 4 llamadas HTTP,
    // aunque maxRetries:0 debería permitir solo 1 intento de envío "normal".
    expect(http.post).toHaveBeenCalledTimes(4);
  });

  it('otros 4xx (ej. 400) siguen siendo EcfValidacionError de inmediato, sin el reintento de token ni tocar el circuito', async () => {
    const { svc, http } = buildService();
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValueOnce(throwError(() => errStatus(400, 'RNC inválido')));

    await expect(svc.enviarDocumento(payloadBase, EMPRESA)).rejects.toThrow(EcfValidacionError);
    expect(http.post).toHaveBeenCalledTimes(2); // login + 1 solo intento de envío, sin reintento
    expect(await svc.circuitoGlobal429Hasta()).toBeNull();
  });
});
