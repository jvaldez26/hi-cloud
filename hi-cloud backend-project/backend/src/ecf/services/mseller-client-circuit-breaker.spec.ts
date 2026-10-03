/**
 * Circuit breaker de MSeller (empresa_ecf_config.bloqueadoHasta) — se
 * revisa en getIdToken(), el único punto de entrada de enviarDocumento(),
 * consultarBatch() y consultarEstado(). Antes solo lo respetaba
 * reintento-ecf.job.ts (vía su propio pre-chequeo); consultar-estado-ecf.job.ts
 * (el cron de 2 min y el backoff de EN_VALIDACION_DGII) seguía llamando a
 * MSeller/Cognito mientras la empresa estaba bloqueada — cada intento podía
 * alargar el bloqueo. Con el chequeo en getIdToken(), los tres caminos
 * quedan cubiertos de una sola vez.
 */
import { MSellerClientService } from './mseller-client.service';
import { EcfComunicacionError } from '../errors/ecf.errors';

const EMPRESA = 7;

function buildService(opts: { bloqueada: boolean }) {
  const http = { post: jest.fn(), get: jest.fn() };
  const ecfConfigSvc = {
    isEmpresaBloqueada: jest.fn().mockResolvedValue(opts.bloqueada),
    getCredencialesDescifradas: jest.fn().mockResolvedValue({
      email: 'x@x.com', password: 'x', apiKey: 'key', urlBase: 'https://mseller.test', envPath: 'TesteCF',
    }),
  };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };

  const svc = new MSellerClientService(http as any, ecfConfigSvc as any, cache as any);
  for (const m of ['log', 'warn', 'debug', 'error'] as const) {
    jest.spyOn((svc as any).logger, m).mockImplementation(() => undefined);
  }
  return { svc, http, ecfConfigSvc, cache };
}

describe('MSellerClientService.getIdToken — circuit breaker', () => {
  it('empresa bloqueada → NUNCA llama a Cognito/MSeller, lanza EcfComunicacionError', async () => {
    const { svc, http, ecfConfigSvc } = buildService({ bloqueada: true });

    await expect(svc.getIdToken(EMPRESA)).rejects.toThrow(EcfComunicacionError);

    expect(ecfConfigSvc.isEmpresaBloqueada).toHaveBeenCalledWith(EMPRESA);
    expect(ecfConfigSvc.getCredencialesDescifradas).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('consultarBatch de la empresa bloqueada se corta ANTES de llamar a MSeller', async () => {
    const { svc, http } = buildService({ bloqueada: true });

    await expect(svc.consultarBatch(['E320000000001'], EMPRESA)).rejects.toThrow(EcfComunicacionError);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('consultarEstado de la empresa bloqueada se corta ANTES de llamar a MSeller', async () => {
    const { svc, http } = buildService({ bloqueada: true });

    await expect(svc.consultarEstado('track-1', EMPRESA)).rejects.toThrow(EcfComunicacionError);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('empresa NO bloqueada → sigue intentando autenticar con normalidad (no se corta por el breaker)', async () => {
    const { svc, http, ecfConfigSvc } = buildService({ bloqueada: false });
    http.post.mockReturnValue({
      // firstValueFrom espera un Observable-like; usamos rxjs 'of' real para no acoplarnos al mock
    });
    const { of } = require('rxjs');
    http.post.mockReturnValue(of({ data: { idToken: 't', accessToken: 'a', refreshToken: 'r' } }));

    await expect(svc.getIdToken(EMPRESA)).resolves.toMatchObject({ idToken: 't' });
    expect(ecfConfigSvc.getCredencialesDescifradas).toHaveBeenCalledWith(EMPRESA);
  });
});
