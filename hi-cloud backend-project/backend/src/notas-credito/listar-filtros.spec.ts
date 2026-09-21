/**
 * Notas de Crédito — filtros y paginación de listar() (2026-09-21, dos
 * hallazgos el mismo día).
 *
 * 1. El front pedía `/notas-credito?limit=50&page=1` y nunca avanzaba
 *    `page` (el paginador de la tabla era 100% cliente sobre esos mismos 50
 *    registros) — sin filtro de fecha en ningún lado, si la empresa tenía
 *    más de 50 notas en total, las de meses anteriores quedaban invisibles
 *    para siempre.
 *
 * 2. Al arreglar (1) y bajar el límite a 10 (el estándar del proyecto),
 *    apareció un bug MÁS GRAVE que ya existía pero el límite de 50 lo
 *    disimulaba: `listar()` paginaba (skip/take) sobre un JOIN con
 *    `nc.detalles`, que es uno-a-muchos. Una nota con varias líneas
 *    "consume" varias filas de la ventana LIMIT, así que TypeORM contaba
 *    filas del JOIN, no notas distintas — una empresa con 79 notas veía
 *    "total: 3" y solo 3 notas en toda la lista, ninguna manera de ver el
 *    resto. Verificado en vivo contra un backup restaurado (empresa 44:
 *    79 notas reales, listar() devolvía total:3 / 3 filas antes del fix).
 *
 *    Fix: paginación en dos pasos — IDs paginados SIN el join a detalles
 *    (getManyAndCount correcto), después hidratar (cliente + detalles) SOLO
 *    esos IDs con `find({ where: { id: In(...) } })`, sin límite.
 */

import { NotasCreditoService } from './notas-credito.service';

function makeIdsQueryBuilder(idEntities: any[] = [], total = idEntities.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([idEntities, total]);
  return { qb, calls };
}

function makeService(qb: any, hidratadas: any[] = []) {
  const ncRepo = {
    createQueryBuilder: () => qb,
    find:    jest.fn().mockResolvedValue(hidratadas),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const tenantSvc = { getEmpresaId: () => 7, getSucursalId: () => null };
  const svc: any = Object.create(NotasCreditoService.prototype);
  svc.ncRepo    = ncRepo;
  svc.tenantSvc = tenantSvc;
  return { svc: svc as NotasCreditoService, ncRepo };
}

const condFecha = (calls: any[]) =>
  calls.filter(c => c.method === 'andWhere' && typeof c.args[0] === 'string' && c.args[0].includes('nc.fecha'));

describe('NotasCreditoService.listar() — paginación en dos pasos (bug del JOIN a detalles)', () => {
  it('la consulta de IDs paginados NUNCA hace JOIN con detalles — así el total/página no se corrompe', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'NC-1', detalles: [] }]);

    await svc.listar({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('detalles'))).toBe(false);
    expect(calls.some(c => c.method === 'leftJoin' && String(c.args[0]).includes('detalles'))).toBe(false);
  });

  it('hidrata (cliente + detalles) SOLO los IDs de la página, vía find({ where: { id: In(...) } })', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, ncRepo } = makeService(qb, [
      { id: 3, numero: 'NC-3', detalles: [{ id: 1 }] },
      { id: 5, numero: 'NC-5', detalles: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(ncRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      relations: ['cliente', 'detalles'],
    }));
    // Preserva el orden de la consulta paginada (5, luego 3), no el orden en que find() las devolvió.
    expect(r.data.map((n: any) => n.id)).toEqual([5, 3]);
  });

  it('79 notas reales, límite 10: total y totalPages correctos — no "total: 3" como con el bug', async () => {
    const idEntities = Array.from({ length: 10 }, (_, i) => ({ id: 79 - i }));
    const hidratadas  = idEntities.map(e => ({ id: e.id, numero: `NC-${e.id}`, detalles: [{}, {}, {}] })); // varias líneas c/u
    const { qb } = makeIdsQueryBuilder(idEntities, 79);
    const { svc } = makeService(qb, hidratadas);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(r.meta).toEqual({ total: 79, page: 1, limit: 10, totalPages: 8 });
    expect(r.data).toHaveLength(10);
  });
});

describe('NotasCreditoService.listar() — filtros', () => {
  it('sin desde/hasta ("Todo"): no agrega condición de rango — las notas de meses anteriores no quedan excluidas', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'NC-1', fecha: '2026-03-01' }]);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(condFecha(calls)).toHaveLength(0);
    expect(r.data).toHaveLength(1);
    expect(r.data[0].id).toBe(1);
  });

  it('con desde/hasta: agrega el rango exacto sobre nc.fecha', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, desde: '2026-08-01', hasta: '2026-08-31' });

    expect(calls.some(c => c.method === 'andWhere' && c.args[0] === 'nc.fecha >= :desde' && c.args[1].desde === '2026-08-01')).toBe(true);
    expect(calls.some(c => c.method === 'andWhere' && c.args[0] === 'nc.fecha <= :hasta' && c.args[1].hasta === '2026-08-31')).toBe(true);
  });

  it('filtro por e-CF afectado: agrega un EXISTS contra ecf.ncfModificado, no un JOIN (evita duplicar la fila)', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, ncfAfectado: 'E320000006902' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."ncfModificado"'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(call!.args[1].ncfAfectado).toBe('%E320000006902%');
  });

  it('el buscador principal (search) también encuentra por e-CF propio o afectado, no solo número/cliente', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, search: 'E340000000032' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('nc.numero ILIKE'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(String(call!.args[0])).toContain('e.numero ILIKE');
    expect(String(call!.args[0])).toContain('e."ncfModificado" ILIKE');
    expect(call!.args[1].s).toBe('%E340000000032%');
  });

  it('estadoDgii: agrega un EXISTS contra ecf."estadoDGII"', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, estadoDgii: 'rechazado' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."estadoDGII"'));
    expect(call).toBeDefined();
    expect(call!.args[1].estadoDgii).toBe('rechazado');
  });

  it('paginación: page=3, limit=10 → skip=20, take=10', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 35);
    const { svc } = makeService(qb);

    const r: any = await svc.listar({ page: 3, limit: 10 });

    expect(calls.some(c => c.method === 'skip' && c.args[0] === 20)).toBe(true);
    expect(calls.some(c => c.method === 'take' && c.args[0] === 10)).toBe(true);
    expect(r.meta).toEqual({ total: 35, page: 3, limit: 10, totalPages: 4 });
  });

  it('clienteId, estado y rango de monto agregan sus propias condiciones', async () => {
    const { qb, calls } = makeIdsQueryBuilder([], 0);
    const { svc } = makeService(qb);

    await svc.listar({ page: 1, limit: 10, clienteId: 42, estado: 'emitida', montoMin: 100, montoMax: 500 });

    expect(calls.some(c => c.args[0] === 'nc.clienteId = :clienteId' && c.args[1].clienteId === 42)).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.estado = :estado' && c.args[1].estado === 'emitida')).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.total >= :montoMin' && c.args[1].montoMin === 100)).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.total <= :montoMax' && c.args[1].montoMax === 500)).toBe(true);
  });
});
