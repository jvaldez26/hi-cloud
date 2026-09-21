/**
 * Devoluciones — filtros de findAll() (2026-09-21). A diferencia de
 * notas-credito/notas-debito, Devoluciones ya paginaba correctamente en el
 * servidor (current/onChange/total bien conectados en el front) — solo le
 * faltaban filtros de fecha/cliente/estado/monto, igual que a las otras dos
 * listas que comparten este mismo patrón de UI.
 */

import { DevolucionesService } from './devoluciones.service';

function makeQueryBuilder(data: any[] = [], total = data.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([data, total]);
  return { qb, calls };
}

function makeService(qb: any) {
  const devRepository = { createQueryBuilder: () => qb };
  const tenantService  = { getEmpresaId: () => 7 };
  const svc: any = Object.create(DevolucionesService.prototype);
  svc.devRepository = devRepository;
  svc.tenantService = tenantService;
  return svc as DevolucionesService;
}

describe('DevolucionesService.findAll() — filtros', () => {
  it('sin desde/hasta ("Todo"): no excluye devoluciones de meses anteriores', async () => {
    const { qb, calls } = makeQueryBuilder([{ id: 1, numero: 'DEV-1', fecha: '2026-03-01' }], 1);
    const svc = makeService(qb);

    const r: any = await svc.findAll({ page: 1, limit: 10 });

    expect(calls.filter(c => c.method === 'andWhere' && String(c.args[0]).includes('d.fecha'))).toHaveLength(0);
    expect(r.data).toHaveLength(1);
  });

  it('con desde/hasta: agrega el rango exacto sobre d.fecha', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.findAll({ page: 1, limit: 10, desde: '2026-08-01', hasta: '2026-08-31' });

    expect(calls.some(c => c.args[0] === 'd.fecha >= :desde' && c.args[1].desde === '2026-08-01')).toBe(true);
    expect(calls.some(c => c.args[0] === 'd.fecha <= :hasta' && c.args[1].hasta === '2026-08-31')).toBe(true);
  });

  it('paginación: page=2, limit=10 → skip=10, take=10', async () => {
    const { qb, calls } = makeQueryBuilder([], 12);
    const svc = makeService(qb);

    const r: any = await svc.findAll({ page: 2, limit: 10 });

    expect(calls.some(c => c.method === 'skip' && c.args[0] === 10)).toBe(true);
    expect(calls.some(c => c.method === 'take' && c.args[0] === 10)).toBe(true);
    expect(r.meta).toEqual({ total: 12, page: 2, limit: 10, totalPages: 2 });
  });

  it('clienteId, estado y rango de monto agregan sus propias condiciones', async () => {
    const { qb, calls } = makeQueryBuilder([], 0);
    const svc = makeService(qb);

    await svc.findAll({ page: 1, limit: 10, clienteId: 9, estado: 'procesada', montoMin: 50, montoMax: 200 });

    expect(calls.some(c => c.args[0] === 'd.clienteId = :clienteId' && c.args[1].clienteId === 9)).toBe(true);
    expect(calls.some(c => c.args[0] === 'd.estado = :estado' && c.args[1].estado === 'procesada')).toBe(true);
    expect(calls.some(c => c.args[0] === 'd.total >= :montoMin' && c.args[1].montoMin === 50)).toBe(true);
    expect(calls.some(c => c.args[0] === 'd.total <= :montoMax' && c.args[1].montoMax === 200)).toBe(true);
  });
});
