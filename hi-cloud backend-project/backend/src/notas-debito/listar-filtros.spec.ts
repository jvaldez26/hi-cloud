/**
 * Notas de Débito — filtros de listar() (2026-09-21). Mismo bug y mismo fix
 * que notas-credito/listar-filtros.spec.ts: el front pedía limit=50&page=1
 * y nunca avanzaba de página, así que sin filtro de fecha en ningún lado
 * las notas más viejas que las últimas 50 quedaban invisibles.
 */

import { NotasDebitoService } from './notas-debito.service';

function makeQueryBuilder(data: any[] = [], total = data.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([data, total]);
  return { qb, calls };
}

function makeService(qb: any) {
  const ndRepo = { createQueryBuilder: () => qb, manager: { query: jest.fn().mockResolvedValue([]) } };
  const tenantSvc = { getEmpresaId: () => 7 };
  const svc: any = Object.create(NotasDebitoService.prototype);
  svc.ndRepo    = ndRepo;
  svc.tenantSvc = tenantSvc;
  return svc as NotasDebitoService;
}

describe('NotasDebitoService.listar() — filtros', () => {
  it('sin desde/hasta ("Todo"): no excluye notas de meses anteriores', async () => {
    const { qb, calls } = makeQueryBuilder([{ id: 1, numero: 'ND-1', fecha: '2026-03-01' }], 1);
    const svc = makeService(qb);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(calls.filter(c => c.method === 'andWhere' && String(c.args[0]).includes('nd.fecha'))).toHaveLength(0);
    expect(r.data).toHaveLength(1);
  });

  it('con desde/hasta: agrega el rango exacto sobre nd.fecha', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, desde: '2026-08-01', hasta: '2026-08-31' });

    expect(calls.some(c => c.args[0] === 'nd.fecha >= :desde' && c.args[1].desde === '2026-08-01')).toBe(true);
    expect(calls.some(c => c.args[0] === 'nd.fecha <= :hasta' && c.args[1].hasta === '2026-08-31')).toBe(true);
  });

  it('filtro por e-CF afectado: EXISTS contra ecf.ncfModificado, no JOIN', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, ncfAfectado: 'E320000006902' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."ncfModificado"'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(call!.args[1].ncfAfectado).toBe('%E320000006902%');
  });

  it('paginación: page=2, limit=10 → skip=10, take=10', async () => {
    const { qb, calls } = makeQueryBuilder([], 15);
    const svc = makeService(qb);

    const r: any = await svc.listar({ page: 2, limit: 10 });

    expect(calls.some(c => c.method === 'skip' && c.args[0] === 10)).toBe(true);
    expect(calls.some(c => c.method === 'take' && c.args[0] === 10)).toBe(true);
    expect(r.meta).toEqual({ total: 15, page: 2, limit: 10, totalPages: 2 });
  });
});
