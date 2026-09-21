/**
 * Notas de Crédito — filtros de listar() (2026-09-21).
 *
 * Antes, el front pedía `/notas-credito?limit=50&page=1` y nunca avanzaba
 * `page` (el paginador de la tabla era 100% cliente sobre esos mismos 50
 * registros) — sin filtro de fecha en ningún lado, si la empresa tenía más
 * de 50 notas en total, las de meses anteriores quedaban invisibles para
 * siempre: no había manera de pedirle al servidor una página más allá de la
 * primera ni de acotar el rango.
 *
 * `listar()` ahora acepta desde/hasta/clienteId/ncfAfectado/estado/
 * estadoDgii/montoMin/montoMax, todos opcionales — sin ellos no se agrega
 * ninguna condición (el caso "Todo" del front), y la paginación real
 * (skip/take derivados de page/limit) ya no depende de un límite fijo.
 */

import { NotasCreditoService } from './notas-credito.service';

function makeQueryBuilder(data: any[] = [], total = data.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([data, total]);
  return { qb, calls };
}

function makeService(qb: any) {
  const ncRepo = { createQueryBuilder: () => qb, manager: { query: jest.fn().mockResolvedValue([]) } };
  const tenantSvc = { getEmpresaId: () => 7, getSucursalId: () => null };
  const svc: any = Object.create(NotasCreditoService.prototype);
  svc.ncRepo    = ncRepo;
  svc.tenantSvc = tenantSvc;
  return svc as NotasCreditoService;
}

const condFecha = (calls: any[]) =>
  calls.filter(c => c.method === 'andWhere' && typeof c.args[0] === 'string' && c.args[0].includes('nc.fecha'));

describe('NotasCreditoService.listar() — filtros', () => {
  it('sin desde/hasta ("Todo"): no agrega condición de rango — las notas de meses anteriores no quedan excluidas', async () => {
    const notaVieja = { id: 1, numero: 'NC-1', fecha: '2026-03-01' };
    const { qb, calls } = makeQueryBuilder([notaVieja], 1);
    const svc = makeService(qb);

    const r: any = await svc.listar({ page: 1, limit: 10 });

    expect(condFecha(calls)).toHaveLength(0);
    // El mock devuelve la nota vieja tal cual (sin filtrar antes) — confirma
    // que listar() no le añadió ninguna condición que la hubiera excluido.
    expect(r.data).toHaveLength(1);
    expect(r.data[0].id).toBe(1);
  });

  it('con desde/hasta: agrega el rango exacto sobre nc.fecha', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, desde: '2026-08-01', hasta: '2026-08-31' });

    expect(calls.some(c => c.method === 'andWhere' && c.args[0] === 'nc.fecha >= :desde' && c.args[1].desde === '2026-08-01')).toBe(true);
    expect(calls.some(c => c.method === 'andWhere' && c.args[0] === 'nc.fecha <= :hasta' && c.args[1].hasta === '2026-08-31')).toBe(true);
  });

  it('filtro por e-CF afectado: agrega un EXISTS contra ecf.ncfModificado, no un JOIN (evita duplicar la fila)', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, ncfAfectado: 'E320000006902' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."ncfModificado"'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(call!.args[1].ncfAfectado).toBe('%E320000006902%');
  });

  it('el buscador principal (search) también encuentra por e-CF propio o afectado, no solo número/cliente', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, search: 'E340000000032' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('nc.numero ILIKE'));
    expect(call).toBeDefined();
    expect(String(call!.args[0])).toContain('EXISTS');
    expect(String(call!.args[0])).toContain('e.numero ILIKE');
    expect(String(call!.args[0])).toContain('e."ncfModificado" ILIKE');
    expect(call!.args[1].s).toBe('%E340000000032%');
  });

  it('estadoDgii: agrega un EXISTS contra ecf."estadoDGII"', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, estadoDgii: 'rechazado' });

    const call = calls.find(c => c.method === 'andWhere' && String(c.args[0]).includes('e."estadoDGII"'));
    expect(call).toBeDefined();
    expect(call!.args[1].estadoDgii).toBe('rechazado');
  });

  it('paginación: page=3, limit=10 → skip=20, take=10', async () => {
    const { qb, calls } = makeQueryBuilder([], 35);
    const svc = makeService(qb);

    const r: any = await svc.listar({ page: 3, limit: 10 });

    expect(calls.some(c => c.method === 'skip' && c.args[0] === 20)).toBe(true);
    expect(calls.some(c => c.method === 'take' && c.args[0] === 10)).toBe(true);
    expect(r.meta).toEqual({ total: 35, page: 3, limit: 10, totalPages: 4 });
  });

  it('clienteId, estado y rango de monto agregan sus propias condiciones', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.listar({ page: 1, limit: 10, clienteId: 42, estado: 'emitida', montoMin: 100, montoMax: 500 });

    expect(calls.some(c => c.args[0] === 'nc.clienteId = :clienteId' && c.args[1].clienteId === 42)).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.estado = :estado' && c.args[1].estado === 'emitida')).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.total >= :montoMin' && c.args[1].montoMin === 100)).toBe(true);
    expect(calls.some(c => c.args[0] === 'nc.total <= :montoMax' && c.args[1].montoMax === 500)).toBe(true);
  });
});
