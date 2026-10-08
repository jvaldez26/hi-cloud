/**
 * Aviso manual (warning, no error) cuando un e-CF lleva de verdad atascado
 * en pendiente_envio — la contraparte de que EcfDuplicadoError y el resto de
 * la familia EcfError ya NO se reportan como error (ver
 * ecf-error-no-reporta-sentry.spec.ts e instrument.ts). Sin este aviso, un
 * atasco real (MSeller/DGII caído más de 10 minutos) quedaría invisible: ni
 * error en Sentry ni nada que lo señale fuera del panel por-empresa
 * (alertasECFAtascados). Mismo umbral (10 min) que ese panel.
 */
import { ReintentoECFJob } from './reintento-ecf.job';

const reportWarning = jest.fn();
jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportWarning: (...args: unknown[]) => reportWarning(...args),
}));

function makeJob() {
  const ecfRepo = { find: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
  const eventoRepo = { create: jest.fn((x) => x), save: jest.fn().mockResolvedValue(undefined) };
  const configSvc = { isEmpresaBloqueada: jest.fn().mockResolvedValue(true) }; // corta ANTES de procesarUno
  const mseller = { consultarBatch: jest.fn(), circuitoGlobal429Hasta: jest.fn().mockResolvedValue(null) };

  const job = new ReintentoECFJob(
    ecfRepo as any, eventoRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    mseller as any, {} as any, configSvc as any,
  );
  for (const m of ['log', 'warn', 'error', 'debug'] as const) {
    jest.spyOn((job as any).logger, m).mockImplementation(() => undefined);
  }
  return { job, ecfRepo };
}

function makeEcf(opts: { minutosAtascado: number; numero?: string; empresaId?: number }) {
  return {
    id: 1,
    numero: opts.numero ?? 'E320000000001',
    empresaId: opts.empresaId ?? 42,
    estadoDGII: 'pendiente_envio',
    intentosEnvio: 0,
    ultimoIntentoEnvio: null,
    createdAt: new Date(Date.now() - opts.minutosAtascado * 60_000),
    updatedAt: new Date(Date.now() - opts.minutosAtascado * 60_000),
  } as any;
}

describe('ReintentoECFJob.procesarPendientes — aviso de e-CF atascado (>10min)', () => {
  beforeEach(() => reportWarning.mockClear());

  it('e-CF con más de 10 minutos en pendiente_envio → reportWarning con el folio/minutos', async () => {
    const { job, ecfRepo } = makeJob();
    ecfRepo.find.mockResolvedValue([makeEcf({ minutosAtascado: 15 })]);

    await (job as any).procesarPendientes();

    expect(reportWarning).toHaveBeenCalledTimes(1);
    const [mensaje, tags] = reportWarning.mock.calls[0];
    expect(mensaje).toMatch(/E320000000001/);
    expect(mensaje).toMatch(/pendiente_envio/);
    expect(tags).toMatchObject({ numero: 'E320000000001', empresaId: 42 });
  });

  it('e-CF con menos de 10 minutos → NO avisa todavía (no es ruido, sigue siendo el flujo normal)', async () => {
    const { job, ecfRepo } = makeJob();
    ecfRepo.find.mockResolvedValue([makeEcf({ minutosAtascado: 3 })]);

    await (job as any).procesarPendientes();

    expect(reportWarning).not.toHaveBeenCalled();
  });

  it('sigue avisando en la vuelta siguiente del cron si el atasco continúa (Sentry agrupa, no se duplica como issues separados)', async () => {
    const { job, ecfRepo } = makeJob();
    ecfRepo.find.mockResolvedValue([makeEcf({ minutosAtascado: 15 })]);

    await (job as any).procesarPendientes();
    await (job as any).procesarPendientes();

    expect(reportWarning).toHaveBeenCalledTimes(2);
  });
});
