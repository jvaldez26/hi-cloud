/**
 * Hotfix 2026-10-07 — ReintentoECFJob respeta el circuit breaker GLOBAL de
 * MSeller (429): se salta el ciclo COMPLETO si ya está abierto al empezar
 * (descubrirlo e-CF por e-CF solo alargaría el bloqueo), y si un envío del
 * lote lo abre a mitad de camino, corta el resto del lote en vez de seguir
 * machacando MSeller.
 */
import { ReintentoECFJob } from './reintento-ecf.job';
import { EstadoDGII } from '../entities/ecf.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
  reportWarning: jest.fn(),
}));

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
  const realtimeService = { notify: jest.fn() };

  const job = new ReintentoECFJob(
    ecfRepo as any, eventoRepo as any, secuenciaRepo as any, facturaRepo as any,
    notaDebitoRepo as any, notaCreditoRepo as any, compraRepo as any, gastoRepo as any,
    mseller as any, builder as any, configSvc as any, realtimeService as any,
  );
  for (const m of ['log', 'warn', 'debug', 'error'] as const) {
    jest.spyOn((job as any).logger, m).mockImplementation(() => undefined);
  }
  jest.spyOn(job as any, 'sleep').mockResolvedValue(undefined);
  return { job, ecfRepo, mseller, configSvc, facturaRepo, realtimeService };
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

/**
 * Hotfix 2026-10-07 (parte 3) — empresa 73, FAC-1705/1708-1714: mismo hueco
 * que en ConsultarEstadoECFJob (ver consultar-estado-ecf.job.spec.ts), pero
 * por el camino de ReintentoECFJob.procesarUno(): cuando este cron adopta o
 * reenvía un e-CF y el resultado es ACEPTADO, debe sellar la factura CONTADO
 * como PAGADA si el cobro ya está ahí — antes no lo hacía.
 */
describe('ReintentoECFJob.procesarUno — sella PAGADA al confirmar ACEPTADO (empresa 73)', () => {
  function ecfPendiente(id: number, documentoOrigenId: number, documentoOrigenTipo: string | null = 'FACTURA') {
    return {
      id, numero: `E320000000${id}`, empresaId: 73,
      estadoDGII: 'pendiente_envio', intentosEnvio: 0, ultimoIntentoEnvio: null,
      createdAt: new Date(), documentoOrigenTipo, documentoOrigenId,
    } as any;
  }

  it('dec.accion=adoptar con estado ACEPTADO → sella la factura PAGADA y notifica', async () => {
    const { job, mseller, facturaRepo, realtimeService } = buildJob();
    (mseller as any).consultarBatch = jest.fn().mockResolvedValue({
      total: 1, results: [{ ecf: 'E3200000001705', status: 'Aceptado', found: true, data: {} }],
    });
    facturaRepo.findOne.mockResolvedValue({
      id: 1705, folio: 'FAC-1705', estado: 'emitida', tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 500 }],
    });
    (facturaRepo as any).update = jest.fn().mockResolvedValue(undefined);
    (facturaRepo as any).manager = { query: jest.fn().mockResolvedValue([{ existe: false }]) };
    const ecf = ecfPendiente(1705, 1705, 'FACTURA');
    ecf.numero = 'E3200000001705';

    const resultado = await job.procesarUno(ecf);

    expect(resultado).toBe('adoptado');
    expect(facturaRepo.update).toHaveBeenCalledWith(1705, { estado: 'pagada' });
    expect(realtimeService.notify).toHaveBeenCalledWith(73, 'factura', 'updated', 1705);
  });

  it('dec.accion=adoptar con estado OBSERVADO (no ACEPTADO) → NUNCA toca la factura', async () => {
    const { job, mseller, facturaRepo } = buildJob();
    (mseller as any).consultarBatch = jest.fn().mockResolvedValue({
      total: 1, results: [{ ecf: 'E3200000001706', status: 'Aceptado Condicional', found: true, data: { dgiiResponse: [{ codigo: '1', mensajes: [{ mensaje: 'x' }] }] } }],
    });
    const ecf = ecfPendiente(1706, 1706, 'FACTURA');
    ecf.numero = 'E3200000001706';

    const resultado = await job.procesarUno(ecf);

    expect(resultado).toBe('adoptado');
    expect(facturaRepo.findOne).not.toHaveBeenCalled();
  });

  it('NC (no FACTURA/VENTA_POS) adoptada como ACEPTADO → NUNCA llama al helper', async () => {
    const { job, mseller, facturaRepo } = buildJob();
    (mseller as any).consultarBatch = jest.fn().mockResolvedValue({
      total: 1, results: [{ ecf: 'E3400000001001', status: 'Aceptado', found: true, data: {} }],
    });
    const ecf = ecfPendiente(999, 999, 'NOTA_CREDITO');
    ecf.numero = 'E3400000001001';

    const resultado = await job.procesarUno(ecf);

    expect(resultado).toBe('adoptado');
    expect(facturaRepo.findOne).not.toHaveBeenCalled();
  });

  it('un fallo del helper al sellar PAGADA no aborta la reconciliación — pero SÍ reporta a Sentry', async () => {
    const { job, mseller, facturaRepo } = buildJob();
    const errorDelHelper = new Error('conexión perdida');
    facturaRepo.findOne.mockRejectedValue(errorDelHelper);
    (mseller as any).consultarBatch = jest.fn().mockResolvedValue({
      total: 1, results: [{ ecf: 'E3200000001705', status: 'Aceptado', found: true, data: {} }],
    });
    const ecf = ecfPendiente(1705, 1705, 'FACTURA');
    ecf.numero = 'E3200000001705';

    const resultado = await job.procesarUno(ecf);

    expect(resultado).toBe('adoptado'); // el e-CF sí se reconcilió bien
    expect(reportServiceError).toHaveBeenCalledWith(
      errorDelHelper, 'sellar_pagada_reintento_ecf',
      expect.objectContaining({ facturaId: '1705' }),
    );
  });
});
