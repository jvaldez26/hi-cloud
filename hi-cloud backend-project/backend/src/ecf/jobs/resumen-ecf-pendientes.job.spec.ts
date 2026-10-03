/**
 * Resumen horario del super admin — sección "Revisión manual (72h)"
 * (PASO 2, punto 3 del hotfix E320000001774): además del aviso a
 * ADMIN/CONTADOR de la empresa (consultar-estado-ecf.job.ts), los e-CF que
 * cruzan las 72h sin respuesta de DGII (revisionManual=true) deben
 * aparecer en el resumen horario con empresa, e-NCF, documento y horas sin
 * respuesta — una sola vez por e-CF, nunca en cada resumen.
 *
 * Idempotencia propia (notificadoRevisionManual), independiente de
 * notificadoResumen: un e-CF suele notificarse primero como
 * "en validación DGII" genérico (notificadoResumen=true en ese resumen) y
 * solo mucho después cruzar las 72h.
 */
import { ResumenEcfPendientesJob } from './resumen-ecf-pendientes.job';
import { EstadoDGII } from '../entities/ecf.entity';

function makeEcf(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    numero: overrides['numero'] ?? `E32000000000${id}`,
    empresaId: overrides['empresaId'] ?? 10,
    estadoDGII: overrides['estadoDGII'] ?? EstadoDGII.EN_VALIDACION_DGII,
    revisionManual: overrides['revisionManual'] ?? false,
    notificadoResumen: overrides['notificadoResumen'] ?? false,
    notificadoRevisionManual: overrides['notificadoRevisionManual'] ?? false,
    consultasRealizadas: overrides['consultasRealizadas'] ?? 3,
    montoTotal: overrides['montoTotal'] ?? 1180,
    documentoOrigenTipo: overrides['documentoOrigenTipo'] ?? 'FACTURA',
    documentoOrigenId: overrides['documentoOrigenId'] ?? 555,
    createdAt: overrides['createdAt'] ?? new Date(Date.now() - 80 * 3_600_000), // 80h atrás
    razonSocialComprador: 'Cliente Prueba',
    ...overrides,
  };
}

function makeQueryBuilderFactory(resultados: any[][]) {
  let llamada = 0;
  return () => {
    const resultado = resultados[llamada] ?? [];
    llamada++;
    return {
      where:    jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany:  jest.fn().mockResolvedValue(resultado),
    };
  };
}

function buildJob(opts: {
  pendientesGenericos?: any[];
  revisionManual?: any[];
  envioExitoso?: boolean;
}) {
  const pendientesGenericos = opts.pendientesGenericos ?? [];
  const revisionManual = opts.revisionManual ?? [];

  const queryBuilderFactory = makeQueryBuilderFactory([pendientesGenericos, revisionManual]);

  const managerQuery = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('FROM empresa')) {
      return Promise.resolve([{ id: 10, nombreComercial: 'Ferretería Pavel, SRL', rnc: '130000001' }]);
    }
    return Promise.resolve([]);
  });

  const ecfRepo: any = {
    createQueryBuilder: jest.fn().mockImplementation(queryBuilderFactory),
    manager: { query: managerQuery },
  };

  const emailSvc = {
    enviar: jest.fn().mockResolvedValue({ exitoso: opts.envioExitoso ?? true }),
  };

  const configSvc = { get: jest.fn().mockReturnValue('') };

  const job = new ResumenEcfPendientesJob(ecfRepo, emailSvc as any, configSvc as any);
  return { job, ecfRepo, emailSvc, managerQuery };
}

describe('ResumenEcfPendientesJob — sección "Revisión manual (72h)"', () => {
  it('sin pendientes genéricos ni revisión manual: no envía nada', async () => {
    const { job, emailSvc } = buildJob({ pendientesGenericos: [], revisionManual: [] });

    await (job as any).enviarResumenSiHayPendientes();

    expect(emailSvc.enviar).not.toHaveBeenCalled();
  });

  it('un e-CF SOLO en revisión manual (sin pendientes genéricos) igual dispara el envío', async () => {
    const ecf = makeEcf(1, { revisionManual: true });
    const { job, emailSvc } = buildJob({ pendientesGenericos: [], revisionManual: [ecf] });

    await (job as any).enviarResumenSiHayPendientes();

    expect(emailSvc.enviar).toHaveBeenCalledTimes(1);
    const html = emailSvc.enviar.mock.calls[0][0].html as string;
    expect(html).toContain('Revisión manual requerida');
    expect(html).toContain('Ferretería Pavel, SRL');
    expect(html).toContain('E320000000001');
    expect(html).toContain('FACTURA #555'); // documento
    expect(html).toMatch(/8\dh/); // ~80h sin respuesta
  });

  it('tras un envío exitoso, marca notificadoRevisionManual=true SOLO para esos ids (no notificadoResumen)', async () => {
    const ecf = makeEcf(2, { revisionManual: true });
    const { job, ecfRepo } = buildJob({ pendientesGenericos: [], revisionManual: [ecf] });

    await (job as any).enviarResumenSiHayPendientes();

    const updateCalls = ecfRepo.manager.query.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE ecf'));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('"notificadoRevisionManual" = true');
    expect(updateCalls[0][1]).toEqual([[2]]);
  });

  it('si el envío falla, NO marca notificadoRevisionManual (se reintenta la próxima pasada)', async () => {
    const ecf = makeEcf(3, { revisionManual: true });
    const { job, ecfRepo } = buildJob({ pendientesGenericos: [], revisionManual: [ecf], envioExitoso: false });

    await (job as any).enviarResumenSiHayPendientes();

    const updateCalls = ecfRepo.manager.query.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE ecf'));
    expect(updateCalls).toHaveLength(0);
  });

  it('pendientes genéricos y revisión manual en la misma pasada: ambos flags se actualizan por separado', async () => {
    const generico = makeEcf(4, { estadoDGII: EstadoDGII.OBSERVADO, revisionManual: false });
    const manual   = makeEcf(5, { revisionManual: true });
    const { job, ecfRepo } = buildJob({ pendientesGenericos: [generico], revisionManual: [manual] });

    await (job as any).enviarResumenSiHayPendientes();

    const updateCalls = ecfRepo.manager.query.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE ecf'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls.find((c: any[]) => String(c[0]).includes('"notificadoResumen"'))?.[1]).toEqual([[4]]);
    expect(updateCalls.find((c: any[]) => String(c[0]).includes('"notificadoRevisionManual"'))?.[1]).toEqual([[5]]);
  });

  it('documento cae al numero del e-CF si no hay documentoOrigenTipo (ej. no vinculado a factura)', async () => {
    const ecf = makeEcf(6, { revisionManual: true, documentoOrigenTipo: undefined, documentoOrigenId: undefined });
    const { job, emailSvc } = buildJob({ pendientesGenericos: [], revisionManual: [ecf] });

    await (job as any).enviarResumenSiHayPendientes();

    const html = emailSvc.enviar.mock.calls[0][0].html as string;
    expect(html).toContain(ecf.numero);
  });
});
