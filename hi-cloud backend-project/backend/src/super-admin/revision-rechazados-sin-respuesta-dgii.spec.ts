/**
 * Super Admin — "Revisar e-CF rechazados sin respuesta de DGII" (PASO 2f del
 * hotfix E320000001774). Reclasifica los RECHAZADO existentes de ANTES del
 * fix (consultar-estado-ecf.job.ts, commit 1) que en realidad nunca tuvieron
 * un veredicto real de DGII — nunca a ciegas: solo con una consulta real a
 * MSeller, vía ConsultarEstadoECFJob.consultarUno() (la MISMA función que ya
 * usan el cron y el botón "Consultar estado en DGII").
 *
 * Mismo patrón que trazabilidad.spec.ts / soporte-acceso.spec.ts: DataSource
 * fake enrutado por SQL, SuperAdminService instanciado a mano.
 */
import { SuperAdminService } from './super-admin.service';
import { EstadoDGII } from '../ecf/entities/ecf.entity';

const EMPRESA_A = 10;
const EMPRESA_B = 20;

function makeEcfRow(id: number, overrides: Partial<{
  numero: string; empresaId: number; empresa: string;
  respuestaDgii: unknown; yaReenviado: boolean;
}> = {}) {
  return {
    id,
    numero: overrides.numero ?? `E32000000000${id}`,
    empresaId: overrides.empresaId ?? EMPRESA_A,
    empresa: overrides.empresa ?? 'Ferretería Pavel, SRL',
    createdAt: new Date('2026-09-20T12:00:00Z'),
    montoTotal: 1180,
    respuestaDgii: overrides.respuestaDgii ?? { status: 'Error' }, // sin dgiiResponse[] — el bug real
    yaReenviado: overrides.yaReenviado ?? false,
  };
}

function buildService(opts: {
  filasRechazadas?: ReturnType<typeof makeEcfRow>[];
  ecfPorId?: Map<number, any>;
  consultarUnoImpl?: (ecf: any) => Promise<void>;
  empresasBloqueadas?: Set<number>;
} = {}) {
  const filas = opts.filasRechazadas ?? [];
  const ecfPorId = opts.ecfPorId ?? new Map(filas.map(f => [f.id, { ...f, estadoDGII: EstadoDGII.RECHAZADO }]));

  const queries: { sql: string; params: any[] }[] = [];
  const ds: any = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM ecf e') && sql.includes("e.\"estadoDGII\" = 'rechazado'")) {
        return filas;
      }
      return [];
    }),
    getRepository: jest.fn(() => ({
      findOneBy: jest.fn(async ({ id }: any) => ecfPorId.get(id) ?? null),
    })),
  };

  const consultarEstadoJob = {
    consultarUno: jest.fn(async (ecf: any) => {
      if (opts.consultarUnoImpl) { await opts.consultarUnoImpl(ecf); return; }
      // Por defecto: simula que la consulta real confirma ACEPTADO.
      const actual = ecfPorId.get(ecf.id);
      if (actual) actual.estadoDGII = EstadoDGII.ACEPTADO;
    }),
  };

  const ecfConfigSvc = {
    isEmpresaBloqueada: jest.fn(async (empresaId: number) => opts.empresasBloqueadas?.has(empresaId) ?? false),
  };

  const svc = new SuperAdminService(
    ds as any, { enviar: jest.fn() } as any, undefined as any, undefined as any, undefined as any,
    consultarEstadoJob as any, ecfConfigSvc as any,
  );

  return { svc, queries, ds, consultarEstadoJob, ecfConfigSvc, ecfPorId };
}

describe('SuperAdminService — diagnosticoRechazadosSinRespuestaDgii (vista previa, SOLO lectura)', () => {
  it('agrupa por empresa los RECHAZADO sin código/mensaje real de DGII', async () => {
    const filas = [
      makeEcfRow(1, { empresaId: EMPRESA_A, empresa: 'Ferretería Pavel, SRL' }),
      makeEcfRow(2, { empresaId: EMPRESA_A, empresa: 'Ferretería Pavel, SRL' }),
      makeEcfRow(3, { empresaId: EMPRESA_B, empresa: 'Otra Empresa SRL' }),
    ];
    const { svc } = buildService({ filasRechazadas: filas });

    const r = await svc.diagnosticoRechazadosSinRespuestaDgii();

    expect(r.totalSinVeredicto).toBe(3);
    expect(r.porEmpresa).toEqual(expect.arrayContaining([
      { empresaId: EMPRESA_A, empresa: 'Ferretería Pavel, SRL', count: 2 },
      { empresaId: EMPRESA_B, empresa: 'Otra Empresa SRL', count: 1 },
    ]));
  });

  it('un RECHAZADO con código/mensaje REAL de DGII no entra — no es el bug, no se toca', async () => {
    const filas = [
      makeEcfRow(1, { respuestaDgii: { status: 'Error' } }), // el bug real — sin dgiiResponse
      makeEcfRow(2, { respuestaDgii: { dgiiResponse: [{ mensajes: [{ codigo: '14', valor: 'RNC inválido' }] }] } }), // rechazo real
    ];
    const { svc } = buildService({ filasRechazadas: filas });

    const r = await svc.diagnosticoRechazadosSinRespuestaDgii();

    expect(r.totalSinVeredicto).toBe(1);
    expect(r.candidatos.map(c => c.id)).toEqual([1]);
  });

  it('un e-CF YA reenviado (hay un evento REINTENTO) se lista aparte y NO entra a los candidatos a aplicar', async () => {
    const filas = [
      makeEcfRow(1, { yaReenviado: false }),
      makeEcfRow(2, { yaReenviado: true }),
    ];
    const { svc } = buildService({ filasRechazadas: filas });

    const r = await svc.diagnosticoRechazadosSinRespuestaDgii();

    expect(r.totalSinVeredicto).toBe(1);
    expect(r.candidatos.map(c => c.id)).toEqual([1]);
    expect(r.totalYaReenviados).toBe(1);
    expect(r.yaReenviados[0]).toMatchObject({ id: 2, aviso: expect.stringContaining('duplicado') });
  });

  it('la vista previa NUNCA modifica nada — ni una sola consulta a MSeller, ni un UPDATE', async () => {
    const filas = [makeEcfRow(1)];
    const { svc, consultarEstadoJob, ds } = buildService({ filasRechazadas: filas });

    await svc.diagnosticoRechazadosSinRespuestaDgii();

    expect(consultarEstadoJob.consultarUno).not.toHaveBeenCalled();
    expect(ds.getRepository).not.toHaveBeenCalled();
  });
});

describe('SuperAdminService — aplicarRevisionRechazadosSinRespuestaDgii (idempotente, consulta real)', () => {
  it('consulta de verdad vía ConsultarEstadoECFJob.consultarUno() — la MISMA función del cron/botón, reporta antes/después', async () => {
    const filas = [makeEcfRow(1)];
    const { svc, consultarEstadoJob } = buildService({ filasRechazadas: filas });

    const r = await svc.aplicarRevisionRechazadosSinRespuestaDgii();

    expect(consultarEstadoJob.consultarUno).toHaveBeenCalledTimes(1);
    expect(r.procesados).toBe(1);
    expect(r.cambios[0]).toMatchObject({ numero: filas[0].numero, antes: EstadoDGII.RECHAZADO, despues: EstadoDGII.ACEPTADO });
  });

  it('si sigue sin respuesta real → EN_VALIDACION_DGII (nunca se reinventa un rechazo)', async () => {
    const filas = [makeEcfRow(1)];
    const { svc } = buildService({
      filasRechazadas: filas,
      consultarUnoImpl: async (ecf) => { ecf.estadoDGII = EstadoDGII.EN_VALIDACION_DGII; },
    });

    const r = await svc.aplicarRevisionRechazadosSinRespuestaDgii();

    expect(r.cambios[0].despues).toBe(EstadoDGII.EN_VALIDACION_DGII);
  });

  it('NUNCA toca los que ya fueron reenviados — ni siquiera los cuenta como candidatos', async () => {
    const filas = [makeEcfRow(1, { yaReenviado: true })];
    const { svc, consultarEstadoJob } = buildService({ filasRechazadas: filas });

    const r = await svc.aplicarRevisionRechazadosSinRespuestaDgii();

    expect(consultarEstadoJob.consultarUno).not.toHaveBeenCalled();
    expect(r.procesados).toBe(0);
    expect(r.mensaje).toMatch(/No hay/);
  });

  it('respeta el circuit breaker por empresa: empresa bloqueada → se salta, no consulta, lo reporta', async () => {
    const filas = [
      makeEcfRow(1, { empresaId: EMPRESA_A }),
      makeEcfRow(2, { empresaId: EMPRESA_B }),
    ];
    const { svc, consultarEstadoJob } = buildService({
      filasRechazadas: filas,
      empresasBloqueadas: new Set([EMPRESA_A]),
    });

    const r = await svc.aplicarRevisionRechazadosSinRespuestaDgii();

    expect(consultarEstadoJob.consultarUno).toHaveBeenCalledTimes(1);
    expect(consultarEstadoJob.consultarUno).toHaveBeenCalledWith(expect.objectContaining({ empresaId: EMPRESA_B }));
    expect(r.saltadosPorBloqueo).toEqual([{ numero: filas[0].numero, empresaId: EMPRESA_A }]);
    expect(r.procesados).toBe(1);
  });

  it('idempotente: sin candidatos, no hace nada y lo dice', async () => {
    const { svc, consultarEstadoJob } = buildService({ filasRechazadas: [] });

    const r = await svc.aplicarRevisionRechazadosSinRespuestaDgii();

    expect(consultarEstadoJob.consultarUno).not.toHaveBeenCalled();
    expect(r.procesados).toBe(0);
    expect(r.restantes).toBe(0);
  });
});
