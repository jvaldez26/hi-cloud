/**
 * Presupuesto de tiempo del camino síncrono del POS — Sentry #7779557844.
 *
 * enviarDocumento() reintentaba SIEMPRE hasta 4 veces (withRetry, maxRetries=3
 * por defecto) con backoff [1s,2s,4s] entre cada una, incluso para la
 * petición síncrona del POS con timeout de 8s por intento: peor caso
 * 4×8000 + 7000 = 39.000ms, muy por encima del timeout del cliente axios
 * (15s en ese momento). El POS daba la petición por perdida mientras el
 * servidor seguía reintentando de verdad — el cajero reenviaba sobre la
 * MISMA venta y la segunda petición chocaba contra el e-CF que la primera
 * ya había creado.
 *
 * El camino síncrono ahora pasa maxRetries:0 (un solo intento) — esta prueba
 * fija esa garantía estructural: con maxRetries:0, enviarDocumento() NUNCA
 * llama a MSeller más de una vez, con o sin error.
 */
import { of, throwError } from 'rxjs';
import { MSellerClientService } from './mseller-client.service';
import { EcfComunicacionError } from '../errors/ecf.errors';

const EMPRESA = 7;

function buildService() {
  const http = { post: jest.fn(), get: jest.fn() };
  const ecfConfigSvc = {
    isEmpresaBloqueada: jest.fn().mockResolvedValue(false),
    getCredencialesDescifradas: jest.fn().mockResolvedValue({
      email: 'x@x.com', password: 'x', apiKey: 'key', urlBase: 'https://mseller.test', envPath: 'TesteCF',
    }),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };

  const svc = new MSellerClientService(http as any, ecfConfigSvc as any, cache as any);
  for (const m of ['log', 'warn', 'debug', 'error'] as const) {
    jest.spyOn((svc as any).logger, m).mockImplementation(() => undefined);
  }
  return { svc, http, cache };
}

const PAYLOAD: any = {
  ECF: { Encabezado: { Emisor: { FechaEmision: '01-01-2026' }, IdDoc: { eNCF: 'E320000000001' } } },
};

describe('MSellerClientService.enviarDocumento — maxRetries:0 (camino síncrono del POS)', () => {
  it('un fallo de comunicación con maxRetries:0 llama a MSeller EXACTAMENTE UNA VEZ (nunca 4) y nunca espera backoff', async () => {
    const { svc, http } = buildService();
    // authUrl (getIdToken) responde bien; el POST a documentos-ecf siempre falla por timeout.
    http.post
      .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
      .mockReturnValue(throwError(() => ({ code: 'ECONNABORTED', message: 'timeout of 9000ms exceeded' })));

    const t0 = Date.now();
    await expect(
      svc.enviarDocumento(PAYLOAD, EMPRESA, 9_000, { maxRetries: 0 }),
    ).rejects.toThrow(EcfComunicacionError);
    const transcurridoMs = Date.now() - t0;

    // auth (1) + envío (1) = 2 llamadas a http.post en total, nunca 1+4.
    expect(http.post).toHaveBeenCalledTimes(2);
    // Sin maxRetries:0 esto esperaría 1000+2000+4000=7000ms de backoff real
    // entre intentos — con un solo intento no hay ninguna espera.
    expect(transcurridoMs).toBeLessThan(500);
  });

  it('sin opts (comportamiento regular/cron, sin cambios): SÍ reintenta hasta maxRetries+1 veces', async () => {
    const { svc, http } = buildService();
    jest.useFakeTimers();
    try {
      http.post
        .mockReturnValueOnce(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }))
        .mockReturnValue(throwError(() => ({ code: 'ECONNABORTED', message: 'timeout' })));

      const resultado = svc.enviarDocumento(PAYLOAD, EMPRESA, 30_000);
      const expectativa = expect(resultado).rejects.toThrow(EcfComunicacionError);

      // Deja correr los 3 backoffs (1s+2s+4s) para que el loop complete sus 4 intentos.
      await jest.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000 + 100);
      await expectativa;

      // auth (1) + 4 intentos de envío = 5.
      expect(http.post).toHaveBeenCalledTimes(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('authTimeoutMs se pasa de verdad a la llamada de autenticación', async () => {
    const { svc, http } = buildService();
    http.post.mockReturnValue(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }));

    await svc.getIdToken(EMPRESA, 3_000);

    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/customer/authentication'),
      expect.anything(),
      expect.objectContaining({ timeout: 3_000 }),
    );
  });
});
