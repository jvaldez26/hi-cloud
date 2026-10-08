/**
 * Hotfix 2026-10-07 — ReintentoECFJob respeta el circuit breaker GLOBAL de
 * MSeller (429): se salta el ciclo COMPLETO si ya está abierto al empezar
 * (descubrirlo e-CF por e-CF solo alargaría el bloqueo), y si un envío del
 * lote lo abre a mitad de camino, corta el resto del lote en vez de seguir
 * machacando MSeller.
 */
import { ReintentoECFJob } from './reintento-ecf.job';
import { EstadoDGII } from '../entities/ecf.entity';

function buildJob() {
  const ecfRepo = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
  const eventoRepo = { save: jest.fn(), create: jest.fn((x: any) => x) };
  const secuenciaRepo = { findOne: jest.fn() };
  const facturaRepo = { findOne: jest.fn() };
  const notaDebitoRepo = { findOne: jest.fn() };
  const notaCreditoRepo = { findOne: jest.fn() };
  const compraRepo = { findOne: jest.fn() };
  const gastoRepo = { findOne: jest.fn() };
  const mseller = { circuitoGlobal429Hasta: jest.fn().mockResolvedValue(null), enviarDocumento: jest.fn(), consultarEstado: jest.fn() };
  const builder = { build: jest.fn() };
  const configSvc = { isEmpresaBloqueada: jest.fn().mockResolvedValue(false) };

  const job = new ReintentoECFJob(
    ecfRepo as any, eventoRepo as any, secuenciaRepo as any, facturaRepo as any,
    notaDebitoRepo as any, notaCreditoRepo as any, compraRepo as any, gastoRepo as any,
    mseller as any, builder as any, configSvc as any,
  );
  for (const m of ['log', 'warn', 'debug', 'error'] as const) {
    jest.spyOn((job as any).logger, m).mockImplementation(() => undefined);
  }
  jest.spyOn(job as any, 'sleep').mockResolvedValue(undefined);
  return { job, ecfRepo, mseller, configSvc };
}

function pendienteFake(id: number) {
  return {
    id, numero: `E32000000000${id}`, empresaId: 1,
    estadoDGII: EstadoDGII.PENDIENTE_ENVIO,
    intentosEnvio: 1,
    ultimoIntentoEnvio: new Date(Date.now() - 24 * 60 * 60_000), // hace 24h, ya pasó cualquier backoff
    createdAt: new Date(Date.now() - 25 * 60 * 60_000),
  } as any;
}

describe('ReintentoECFJob — circuit breaker global 429', () => {
  it('circuito ya abierto al empezar → se salta el ciclo COMPLETO, ni siquiera busca pendientes', async () => {
    const { job, ecfRepo, mseller, configSvc } = buildJob();
    mseller.circuitoGlobal429Hasta.mockResolvedValue(new Date(Date.now() + 60_000));

    await job.run();

    expect(ecfRepo.find).not.toHaveBeenCalled();
    expect(configSvc.isEmpresaBloqueada).not.toHaveBeenCalled();
  });

  it('circuito cerrado → procesa el lote con pausa entre llamadas', async () => {
    const { job, ecfRepo, mseller } = buildJob();
    const pendientes = [pendienteFake(1), pendienteFake(2)];
    ecfRepo.find.mockResolvedValue(pendientes);
    jest.spyOn(job, 'procesarUno').mockResolvedValue('reenviado');

    await job.run();

    expect(job.procesarUno).toHaveBeenCalledTimes(2);
    expect((job as any).sleep).toHaveBeenCalledWith(400);
  });

  it('un 429 a mitad del lote abre el circuito → corta el resto del ciclo, no sigue con los demás', async () => {
    const { job, ecfRepo, mseller } = buildJob();
    const pendientes = [pendienteFake(1), pendienteFake(2), pendienteFake(3)];
    ecfRepo.find.mockResolvedValue(pendientes);

    const procesarUnoSpy = jest.spyOn(job, 'procesarUno').mockResolvedValue('reenviado');
    // El envío del primer e-CF del lote es el que dispara el 429 → a partir
    // de ahí circuitoGlobal429Hasta() debe devolver "abierto".
    let llamadas = 0;
    mseller.circuitoGlobal429Hasta.mockImplementation(() => {
      llamadas += 1;
      return Promise.resolve(llamadas > 1 ? new Date(Date.now() + 60_000) : null);
    });

    await job.run();

    expect(procesarUnoSpy).toHaveBeenCalledTimes(1); // nunca llega al 2do/3ro
  });
});
