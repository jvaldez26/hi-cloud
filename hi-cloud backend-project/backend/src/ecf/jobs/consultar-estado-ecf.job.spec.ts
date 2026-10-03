import { ConsultarEstadoECFJob } from './consultar-estado-ecf.job';
import { ECF, EstadoDGII } from '../entities/ecf.entity';

/**
 * Familia 2 / Opción A — resiliencia del lote del cron.
 *
 * Verifica que cuando el efecto de un e-CF (aplicarEfectosPorEstado, que
 * cancela/revierte la factura de una NC de anulación) falla:
 *  1) el error NO aborta el lote — los demás e-CF del batch se procesan igual;
 *  2) el e-CF fallido NO se sella (estadoDGII queda ENVIADO) → el cron lo
 *     reintenta en la próxima pasada, en vez de darlo por procesado.
 */
function makeEcf(numero: string, id: number): ECF {
  return {
    id,
    numero,
    empresaId:           1,
    trackId:             `track-${id}`,
    respuestaDgii:       null,
    documentoOrigenTipo: null,
    codigoModificacion:  null,
  } as unknown as ECF;
}

describe('ConsultarEstadoECFJob — resiliencia del lote (Familia 2 / Opción A)', () => {
  let job: ConsultarEstadoECFJob;
  let ecfRepo:   { update: jest.Mock };
  let eventoRepo:{ create: jest.Mock; save: jest.Mock };
  let mseller:   { consultarBatch: jest.Mock; consultarEstado: jest.Mock };
  let efectosNc: { aplicarEfectosPorEstado: jest.Mock };

  beforeEach(() => {
    ecfRepo    = { update: jest.fn().mockResolvedValue(undefined) };
    eventoRepo = {
      create: jest.fn().mockImplementation((x) => x),
      save:   jest.fn().mockResolvedValue(undefined),
    };
    mseller    = { consultarBatch: jest.fn(), consultarEstado: jest.fn() };
    efectosNc  = { aplicarEfectosPorEstado: jest.fn() };

    job = new ConsultarEstadoECFJob(
      ecfRepo    as any,
      eventoRepo as any,
      mseller    as any,
      efectosNc  as any,
    );

    // Silenciar los logs del cron en la salida de test.
    for (const m of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn((job as any).logger, m).mockImplementation(() => undefined);
    }
  });

  it('un e-CF cuyo efecto falla NO aborta el lote: los demás se sellan, el fallido queda sin sellar', async () => {
    const ecfs = [makeEcf('E310001', 1), makeEcf('E310002', 2), makeEcf('E310003', 3)];

    mseller.consultarBatch.mockResolvedValue({
      total:   3,
      results: ecfs.map((e) => ({ ecf: e.numero, status: 'Aceptado', found: true, data: {} })),
    });

    // El efecto del 2º e-CF falla (p.ej. dato corrupto / DB); los otros dos OK.
    efectosNc.aplicarEfectosPorEstado.mockImplementation((ecf: ECF) =>
      ecf.numero === 'E310002'
        ? Promise.reject(new Error('fallo de efecto'))
        : Promise.resolve(),
    );

    // El cron NO debe lanzar aunque un efecto falle.
    await expect((job as any).consultarBatch(ecfs, 1)).resolves.toBeUndefined();

    // El efecto se intentó para los 3 → el lote no se detuvo en el fallo.
    expect(efectosNc.aplicarEfectosPorEstado).toHaveBeenCalledTimes(3);

    // Solo los 2 exitosos se sellaron (ecfRepo.update); el fallido (#2) NO.
    const sealedIds = ecfRepo.update.mock.calls.map((c) => c[0]);
    expect(sealedIds).toEqual(expect.arrayContaining([1, 3]));
    expect(sealedIds).not.toContain(2);
    expect(ecfRepo.update).toHaveBeenCalledTimes(2);
  });

  it('el e-CF fallido no recibe sellado ni eventos (queda ENVIADO para reintento en la próxima pasada)', async () => {
    const ecfs = [makeEcf('E310010', 10)];

    mseller.consultarBatch.mockResolvedValue({
      total:   1,
      results: [{ ecf: 'E310010', status: 'Aceptado', found: true, data: {} }],
    });
    efectosNc.aplicarEfectosPorEstado.mockRejectedValue(new Error('fallo permanente'));

    await (job as any).consultarBatch(ecfs, 1);

    // No se selló el estado → sigue ENVIADO → el cron lo re-selecciona la próxima pasada.
    expect(ecfRepo.update).not.toHaveBeenCalled();
    // Tampoco se registró RESPUESTA_RECIBIDA ni ESTADO_CAMBIADO.
    expect(eventoRepo.save).not.toHaveBeenCalled();
  });

  it('lote sin fallos: todos los e-CF se sellan (sin regresión)', async () => {
    const ecfs = [makeEcf('E310021', 21), makeEcf('E310022', 22)];

    mseller.consultarBatch.mockResolvedValue({
      total:   2,
      results: ecfs.map((e) => ({ ecf: e.numero, status: 'Aceptado', found: true, data: {} })),
    });
    efectosNc.aplicarEfectosPorEstado.mockResolvedValue(undefined);

    await (job as any).consultarBatch(ecfs, 1);

    expect(efectosNc.aplicarEfectosPorEstado).toHaveBeenCalledTimes(2);
    expect(ecfRepo.update).toHaveBeenCalledTimes(2);
    const sealedIds = ecfRepo.update.mock.calls.map((c) => c[0]);
    expect(sealedIds).toEqual(expect.arrayContaining([21, 22]));
  });
});

/**
 * Hotfix E320000001774 (Ferretería Pavel, SRL) — un e-CF quedaba RECHAZADO
 * sin ningún código ni mensaje real de DGII cuando MSeller devolvía
 * status:"Error" (típico de DGII en mantenimiento) y la consulta individual
 * de respaldo tampoco confirmaba nada. El código viejo forzaba RECHAZADO
 * "para evitar bucle infinito" — ahora va a EN_VALIDACION_DGII, un estado
 * intermedio que el backoff automático reintenta solo (ver PASO 2b).
 */
describe('ConsultarEstadoECFJob — EN_VALIDACION_DGII vs RECHAZADO (hotfix E320000001774)', () => {
  let job: ConsultarEstadoECFJob;
  let ecfRepo:   { update: jest.Mock };
  let eventoRepo:{ create: jest.Mock; save: jest.Mock };
  let mseller:   { consultarBatch: jest.Mock; consultarEstado: jest.Mock };
  let efectosNc: { aplicarEfectosPorEstado: jest.Mock };
  let emailSvc:  { enviar: jest.Mock };
  let configSvc: { get: jest.Mock };

  beforeEach(() => {
    ecfRepo    = { update: jest.fn().mockResolvedValue(undefined) };
    eventoRepo = {
      create: jest.fn().mockImplementation((x) => x),
      save:   jest.fn().mockResolvedValue(undefined),
    };
    mseller    = { consultarBatch: jest.fn(), consultarEstado: jest.fn() };
    efectosNc  = { aplicarEfectosPorEstado: jest.fn().mockResolvedValue(undefined) };
    emailSvc   = { enviar: jest.fn().mockResolvedValue({ exitoso: true }) };
    configSvc  = { get: jest.fn().mockReturnValue('') };

    job = new ConsultarEstadoECFJob(
      ecfRepo    as any,
      eventoRepo as any,
      mseller    as any,
      efectosNc  as any,
      emailSvc   as any,
      configSvc  as any,
    );
    for (const m of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn((job as any).logger, m).mockImplementation(() => undefined);
    }
  });

  it('batch status="Error" + consulta individual SIN confirmación → EN_VALIDACION_DGII, nunca RECHAZADO', async () => {
    const ecf = makeEcf('E320000001774', 1);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{ ecf: ecf.numero, status: 'Error', found: true, data: {} }],
    });
    // La consulta de respaldo tampoco confirma nada (lo que ocurre con DGII en mantenimiento).
    mseller.consultarEstado.mockRejectedValue(new Error('timeout'));

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update).toHaveBeenCalledTimes(1);
    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.EN_VALIDACION_DGII });
    // Sin veredicto real → nunca se dispara la alerta de rechazo al super admin.
    expect(emailSvc.enviar).not.toHaveBeenCalled();
  });

  it('batch status="Error" + consulta individual SIGUE "en proceso" → EN_VALIDACION_DGII (no ENVIADO, no RECHAZADO)', async () => {
    const ecf = makeEcf('E320000001775', 2);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{ ecf: ecf.numero, status: 'Error', found: true, data: {} }],
    });
    mseller.consultarEstado.mockResolvedValue({ status: 'En Proceso' });

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.EN_VALIDACION_DGII });
  });

  it('batch status="" (vacío) → mismo tratamiento que "Error": EN_VALIDACION_DGII', async () => {
    const ecf = makeEcf('E320000001776', 3);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{ ecf: ecf.numero, status: '', found: true, data: {} }],
    });
    mseller.consultarEstado.mockRejectedValue(new Error('timeout'));

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.EN_VALIDACION_DGII });
  });

  it('rechazo EXPLÍCITO con código/mensaje real de DGII → sigue siendo RECHAZADO, y SÍ notifica al super admin', async () => {
    const ecf = makeEcf('E320000001777', 4);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{
        ecf: ecf.numero, status: 'Rechazado', found: true,
        data: { dgiiResponse: [{ estado: 'Rechazado', secuenciaUtilizada: true, mensajes: [{ codigo: '14', valor: 'RNC comprador inválido' }] }] },
      }],
    });

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.RECHAZADO });
    expect(emailSvc.enviar).toHaveBeenCalledTimes(1);
  });

  it('batch status="Rechazado" pero SIN ningún código ni mensaje adjunto → EN_VALIDACION_DGII, no RECHAZADO fantasma', async () => {
    const ecf = makeEcf('E320000001778', 5);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{ ecf: ecf.numero, status: 'Rechazado', found: true, data: {} }],
    });

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.EN_VALIDACION_DGII });
    expect(emailSvc.enviar).not.toHaveBeenCalled();
  });

  it('la consulta individual SÍ confirma un estado definitivo (ej. Aceptado) tras un batch "Error" → se usa ese, no EN_VALIDACION_DGII', async () => {
    const ecf = makeEcf('E320000001779', 6);
    mseller.consultarBatch.mockResolvedValue({
      total: 1,
      results: [{ ecf: ecf.numero, status: 'Error', found: true, data: {} }],
    });
    mseller.consultarEstado.mockResolvedValue({ status: 'ACEPTADO' });

    await (job as any).consultarBatch([ecf], 1);

    expect(ecfRepo.update.mock.calls[0][1]).toMatchObject({ estadoDGII: EstadoDGII.ACEPTADO });
  });
});
