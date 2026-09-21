/**
 * Pro-Forma — paginación en dos pasos (2026-09-21). Mismo bug y mismo fix
 * que notas-credito/notas-debito: `items` es @OneToMany (eager:true), y
 * listar() paginaba (skip/take) sobre un LEFT JOIN explícito con items —
 * una pro-forma con varias líneas "consume" varias filas de la ventana
 * LIMIT, corrompiendo total y página. Descubierto al auditar el mismo
 * patrón en otros módulos tras encontrarlo en notas-credito.
 */

import { ProFormaService } from './pro-forma.service';

function makeIdsQueryBuilder(idEntities: any[] = [], total = idEntities.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([idEntities, total]);
  return { qb, calls };
}

function makeService(qb: any, hidratadas: any[] = []) {
  const pfRepo = { createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue(hidratadas) };
  const tenantSvc = { getEmpresaId: () => 7, getSucursalId: () => null };
  const ds = { query: jest.fn().mockResolvedValue([]) };
  const svc: any = Object.create(ProFormaService.prototype);
  svc.pfRepo    = pfRepo;
  svc.tenantSvc = tenantSvc;
  svc.ds        = ds;
  return { svc: svc as ProFormaService, pfRepo };
}

describe('ProFormaService.listar() — paginación en dos pasos', () => {
  it('la consulta de IDs paginados NUNCA hace JOIN con items', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'PF-1', items: [] }]);

    await svc.listar({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('items'))).toBe(false);
  });

  it('hidrata items SOLO los IDs de la página, preservando su orden', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, pfRepo } = makeService(qb, [
      { id: 3, numero: 'PF-3', items: [{ id: 1 }] },
      { id: 5, numero: 'PF-5', items: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(pfRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['items'] }));
    expect(r.data.map((p: any) => p.id)).toEqual([5, 3]);
  });

  it('total y totalPages correctos con varias líneas por pro-forma — no se corrompe con el JOIN', async () => {
    const idEntities = Array.from({ length: 10 }, (_, i) => ({ id: 50 - i }));
    const hidratadas  = idEntities.map(e => ({ id: e.id, numero: `PF-${e.id}`, items: [{}, {}, {}] }));
    const { qb } = makeIdsQueryBuilder(idEntities, 50);
    const { svc } = makeService(qb, hidratadas);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(r.meta).toEqual({ total: 50, page: 1, limit: 10, totalPages: 5 });
    expect(r.data).toHaveLength(10);
  });
});
