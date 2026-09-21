/**
 * Notas de Débito — filtros y paginación de listar() (2026-09-21). Mismos
 * dos bugs y mismo fix que notas-credito/listar-filtros.spec.ts:
 *   1. limit=50 fijo sin avanzar de página escondía notas viejas.
 *   2. Al bajar a limit=10, quedó expuesto un bug preexistente: paginar
 *      (skip/take) sobre un JOIN con `nd.detalles` (uno-a-muchos) corrompe
 *      el total — una nota con varias líneas "consume" varias filas de la
 *      ventana LIMIT. Fix: IDs paginados sin el join, luego hidratar
 *      (cliente + detalles) solo esos IDs.
 */

import { NotasDebitoService } from './notas-debito.service';

function makeIdsQueryBuilder(idEntities: any[] = [], total = idEntities.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([idEntities, total]);
  return { qb, calls };
}

function makeService(qb: any, hidratadas: any[] = []) {
  const ndRepo = {
    createQueryBuilder: () => qb,
    find:    jest.fn().mockResolvedValue(hidratadas),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const tenantSvc = { getEmpresaId: () => 7 };
  const svc: any = Object.create(NotasDebitoService.prototype);
  svc.ndRepo    = ndRepo;
  svc.tenantSvc = tenantSvc;
  return { svc: svc as NotasDebitoService, ndRepo };
}

describe('NotasDebitoService.listar() — paginación en dos pasos (bug del JOIN a detalles)', () => {
  it('la consulta de IDs paginados NUNCA hace JOIN con detalles', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'ND-1', detalles: [] }]);

    await svc.listar({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('detalles'))).toBe(false);
    expect(calls.some(c => c.method === 'leftJoin' && String(c.args[0]).includes('detalles'))).toBe(false);
  });

  it('hidrata (cliente + detalles) SOLO los IDs de la página, preservando su orden', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, ndRepo } = makeService(qb, [
      { id: 3, numero: 'ND-3', detalles: [{ id: 1 }] },
      { id: 5, numero: 'ND-5', detalles: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(ndRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['cliente', 'detalles'] }));
    expect(r.data.map((n: any) => n.id)).toEqual([5, 3]);
  });
});

describe('NotasDebitoService.listar() — filtros', () => {
  it('sin desde/hasta ("Todo"): no excluye notas de meses anteriores', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'ND-1', fecha: '2026-03-01' }]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(calls.filter(c => c.method === 'andWhere' && String(c.args[0]).includes('nd.fecha'))).toHaveLength(0);
    expect(r.data).toHaveLength(1);
  });

  it('con desde/hasta: agrega el rango exacto sobre nd.fecha', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, desde: '2026-08-01', hasta: '2026-08-31' });

    expect(calls.some(c => c.args[0] === 'nd.fecha >= :desde' && c.args[1].desde === '2026-08-01')).toBe(true);
    expect(calls.some(c => c.args[0] === 'nd.fecha <= :hasta' && c.args[1].hasta === '2026-08-31')).toBe(true);
  });

  it('filtro por e-CF afectado: EXISTS contra ecf.ncfModificado, no JOIN', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, ncfAfectado: 'E320000006902' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."ncfModificado"'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(call!.args[1].ncfAfectado).toBe('%E320000006902%');
  });

  it('paginación: page=2, limit=10 → skip=10, take=10', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 15);
    const { svc } = makeService(qb);

    const r: any = await svc.listar({ page: 2, limit: 10 });

    expect(calls.some(c => c.method === 'skip' && c.args[0] === 10)).toBe(true);
    expect(calls.some(c => c.method === 'take' && c.args[0] === 10)).toBe(true);
    expect(r.meta).toEqual({ total: 15, page: 2, limit: 10, totalPages: 2 });
  });
});
