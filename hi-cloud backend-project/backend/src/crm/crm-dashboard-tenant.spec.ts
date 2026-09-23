/**
 * Regresion P0 — FUGA CROSS-TENANT en el dashboard de CRM (2026-09-23).
 *
 * getDashboard() no filtraba empresaId en ninguna de sus consultas: los
 * cuatro count() de leads, el desglose por fuente, el pipeline y las
 * ganadas del mes agregaban sobre TODAS las empresas. Cualquier cliente
 * veia el total de leads y el valor del pipeline del sistema entero.
 *
 * Al ser count()/getRawMany()/getCount() no se materializa ninguna entidad,
 * asi que el TenantSubscriber —que solo revisa entidades hidratadas— no
 * podia detectarlo. El filtro tenia que ser explicito, igual que en
 * listarActividades() del mismo archivo.
 *
 * COBERTURA:
 * 1. Los cuatro count() de leads llevan empresaId
 * 2. porFuente / pipeline / ganadasMes llevan empresaId
 * 3. Dos empresas con datos distintos → cada una recibe SOLO lo suyo
 * 4. Sin contexto de empresa → lanza, y no ejecuta ninguna consulta
 */

import { CRMService } from './crm.service';

interface Capturado {
  counts: any[];                                   // where de cada count()
  qb:     { alias: string; condiciones: string[]; params: Record<string, unknown> }[];
}

/**
 * QueryBuilder de mentira: anota alias, condiciones y parametros, y
 * devuelve las filas que le pasemos.
 */
function makeQb(cap: Capturado, alias: string, filas: any[], total: number) {
  const registro = { alias, condiciones: [] as string[], params: {} as Record<string, unknown> };
  cap.qb.push(registro);
  const qb: any = {
    select:    () => qb,
    where:     (c: string, p: any = {}) => { registro.condiciones.push(c); Object.assign(registro.params, p); return qb; },
    andWhere:  (c: string, p: any = {}) => { registro.condiciones.push(c); Object.assign(registro.params, p); return qb; },
    groupBy:   () => qb,
    getRawMany: () => Promise.resolve(filas),
    getCount:   () => Promise.resolve(total),
  };
  return qb;
}

/**
 * @param empresaId null = sin contexto de tenant
 * @param datos     lo que "hay en la base" para ESA empresa
 */
function makeService(
  empresaId: number | null,
  datos: { leads: number; porFuente: any[]; pipeline: any[]; ganadas: number },
  cap: Capturado,
) {
  const tenantService = {
    getEmpresaId: () => {
      if (empresaId === null) throw new Error('Se requiere contexto de empresa.');
      return empresaId;
    },
  } as any;

  const leadRepo = {
    count: (opts: any) => { cap.counts.push(opts.where); return Promise.resolve(datos.leads); },
    createQueryBuilder: (a: string) => makeQb(cap, a, datos.porFuente, 0),
  } as any;

  const oportRepo = {
    createQueryBuilder: (a: string) => makeQb(cap, a, datos.pipeline, datos.ganadas),
  } as any;

  return new CRMService(leadRepo, oportRepo, {} as any, tenantService);
}

const SIN_DATOS = { leads: 0, porFuente: [], pipeline: [], ganadas: 0 };
const capVacia = (): Capturado => ({ counts: [], qb: [] });

describe('CRM getDashboard — aislamiento multi-tenant', () => {
  it('los cuatro count() de leads filtran por empresaId', async () => {
    const cap = capVacia();
    await makeService(7, SIN_DATOS, cap).getDashboard();

    expect(cap.counts).toHaveLength(4);
    for (const where of cap.counts) {
      expect(where).toMatchObject({ empresaId: 7 });
    }
  });

  it('porFuente, pipeline y ganadasMes filtran por empresaId', async () => {
    const cap = capVacia();
    await makeService(7, SIN_DATOS, cap).getDashboard();

    expect(cap.qb).toHaveLength(3); // porFuente (l), pipeline (o), ganadasMes (o)
    for (const q of cap.qb) {
      expect(q.condiciones.join(' | ')).toContain(`${q.alias}.empresaId`);
      expect(q.params).toMatchObject({ eid: 7 });
    }
  });

  it('cada empresa recibe SOLO sus propios numeros', async () => {
    const capA = capVacia();
    const capB = capVacia();

    const dashA = await makeService(7, {
      leads: 12,
      porFuente: [{ fuente: 'web', cantidad: '12' }],
      pipeline:  [{ etapa: 'propuesta', cantidad: '3', total: '150000' }],
      ganadas: 4,
    }, capA).getDashboard();

    const dashB = await makeService(99, {
      leads: 1,
      porFuente: [{ fuente: 'referido', cantidad: '1' }],
      pipeline:  [{ etapa: 'contacto', cantidad: '1', total: '5000' }],
      ganadas: 0,
    }, capB).getDashboard();

    expect(dashA.totalLeads).toBe(12);
    expect(dashA.valorPipeline).toBe(150000);
    expect(dashA.ganadasMes).toBe(4);

    expect(dashB.totalLeads).toBe(1);
    expect(dashB.valorPipeline).toBe(5000);
    expect(dashB.ganadasMes).toBe(0);

    // Y sobre todo: cada dashboard consulto con SU empresaId, no con el del otro.
    expect(capA.counts.every((w: any) => w.empresaId === 7)).toBe(true);
    expect(capB.counts.every((w: any) => w.empresaId === 99)).toBe(true);
    expect(capA.qb.every(q => q.params.eid === 7)).toBe(true);
    expect(capB.qb.every(q => q.params.eid === 99)).toBe(true);
  });

  it('sin contexto de empresa lanza y NO ejecuta ninguna consulta', async () => {
    const cap = capVacia();
    const svc = makeService(null, SIN_DATOS, cap);

    await expect(svc.getDashboard()).rejects.toThrow(/contexto de empresa/i);
    expect(cap.counts).toHaveLength(0);
    expect(cap.qb).toHaveLength(0);
  });
});
