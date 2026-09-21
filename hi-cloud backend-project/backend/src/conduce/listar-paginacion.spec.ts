/**
 * Conduces — paginación en dos pasos (2026-09-21). Mismo bug y mismo fix
 * que notas-credito/pro-forma/solicitudes-compra: `detalles` es @OneToMany
 * (eager:true), y listar() paginaba (skip/take) sobre un LEFT JOIN explícito
 * con detalles — un conduce con varias líneas "consume" varias filas de la
 * ventana LIMIT, corrompiendo total y página.
 */

import { ConduceService } from './conduce.service';

function makeIdsQueryBuilder(idEntities: any[] = [], total = idEntities.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([idEntities, total]);
  return { qb, calls };
}

function makeService(qb: any, hidratadas: any[] = []) {
  const conduceRepo = { createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue(hidratadas) };
  const tenantSvc = { getEmpresaId: () => 7 };
  const ds = { query: jest.fn().mockResolvedValue([]) };
  const svc: any = Object.create(ConduceService.prototype);
  svc.conduceRepo = conduceRepo;
  svc.tenantSvc   = tenantSvc;
  svc.ds          = ds;
  return { svc: svc as ConduceService, conduceRepo };
}

describe('ConduceService.listar() — paginación en dos pasos', () => {
  it('la consulta de IDs paginados NUNCA hace JOIN con detalles', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'CON-1', detalles: [] }]);

    await svc.listar({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('detalles'))).toBe(false);
  });

  it('hidrata cliente+detalles SOLO los IDs de la página, preservando su orden', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, conduceRepo } = makeService(qb, [
      { id: 3, numero: 'CON-3', detalles: [{ id: 1 }] },
      { id: 5, numero: 'CON-5', detalles: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(conduceRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['cliente', 'detalles'] }));
    expect(r.data.map((c: any) => c.id)).toEqual([5, 3]);
  });

  it('total correcto con varias líneas por conduce', async () => {
    const idEntities = Array.from({ length: 10 }, (_, i) => ({ id: 40 - i }));
    const hidratadas  = idEntities.map(e => ({ id: e.id, numero: `CON-${e.id}`, detalles: [{}, {}, {}, {}] }));
    const { qb } = makeIdsQueryBuilder(idEntities, 40);
    const { svc } = makeService(qb, hidratadas);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(r.meta).toEqual({ total: 40, page: 1, limit: 10, totalPages: 4 });
    expect(r.data).toHaveLength(10);
  });
});
