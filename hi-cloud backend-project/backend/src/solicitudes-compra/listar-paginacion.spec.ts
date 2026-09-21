/**
 * Solicitudes de Compra — paginación en dos pasos (2026-09-21). Mismo bug y
 * mismo fix que notas-credito/pro-forma, en DOS listados de este módulo:
 * getSolicitudes() (`lineas`) y getCotizaciones() (`lineas` de cotización).
 * Ambas relaciones son @OneToMany (eager:true) y ambos listar() paginaban
 * (skip/take) sobre un LEFT JOIN explícito con ellas.
 */

import { SolicitudesCompraService } from './solicitudes-compra.service';

function makeIdsQueryBuilder(idEntities: any[] = [], total = idEntities.length) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  const chain = (name: string) => (...args: any[]) => { calls.push({ method: name, args }); return qb; };
  for (const m of ['leftJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) qb[m] = chain(m);
  qb.getManyAndCount = jest.fn().mockResolvedValue([idEntities, total]);
  return { qb, calls };
}

describe('SolicitudesCompraService.getSolicitudes() — paginación en dos pasos', () => {
  function makeService(qb: any, hidratadas: any[] = []) {
    const solicitudRepo = { createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue(hidratadas) };
    const tenantService = { getEmpresaId: () => 7 };
    const svc: any = Object.create(SolicitudesCompraService.prototype);
    svc.solicitudRepo  = solicitudRepo;
    svc.tenantService  = tenantService;
    return { svc: svc as SolicitudesCompraService, solicitudRepo };
  }

  it('la consulta de IDs paginados NUNCA hace JOIN con lineas', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'SC-1', lineas: [] }]);

    await svc.getSolicitudes({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('lineas'))).toBe(false);
  });

  it('hidrata solicitante+lineas SOLO los IDs de la página, preservando su orden', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, solicitudRepo } = makeService(qb, [
      { id: 3, numero: 'SC-3', lineas: [{ id: 1 }] },
      { id: 5, numero: 'SC-5', lineas: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.getSolicitudes({ page: 1, limit: 10 });

    expect(solicitudRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['solicitante', 'lineas'] }));
    expect(r.data.map((s: any) => s.id)).toEqual([5, 3]);
  });

  it('total correcto con varias líneas por solicitud', async () => {
    const idEntities = Array.from({ length: 15 }, (_, i) => ({ id: 30 - i }));
    const hidratadas  = idEntities.map(e => ({ id: e.id, numero: `SC-${e.id}`, lineas: [{}, {}] }));
    const { qb } = makeIdsQueryBuilder(idEntities, 30);
    const { svc } = makeService(qb, hidratadas);

    const r: any = await svc.getSolicitudes({ page: 1, limit: 15 });

    expect(r.meta.total).toBe(30);
    expect(r.data).toHaveLength(15);
  });
});

describe('SolicitudesCompraService.getCotizaciones() — paginación en dos pasos', () => {
  function makeService(qb: any, hidratadas: any[] = []) {
    const cotizacionRepo = { createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue(hidratadas) };
    const tenantService  = { getEmpresaId: () => 7 };
    const svc: any = Object.create(SolicitudesCompraService.prototype);
    svc.cotizacionRepo = cotizacionRepo;
    svc.tenantService  = tenantService;
    return { svc: svc as SolicitudesCompraService, cotizacionRepo };
  }

  it('la consulta de IDs paginados NUNCA hace JOIN con lineas', async () => {
    const { qb, calls } = makeIdsQueryBuilder([{ id: 1 }], 1);
    const { svc } = makeService(qb, [{ id: 1, numero: 'COT-1', lineas: [] }]);

    await svc.getCotizaciones({ page: 1, limit: 10 });

    expect(calls.some(c => c.method === 'leftJoinAndSelect' && String(c.args[0]).includes('lineas'))).toBe(false);
  });

  it('hidrata proveedor+lineas SOLO los IDs de la página, preservando su orden', async () => {
    const { qb } = makeIdsQueryBuilder([{ id: 5 }, { id: 3 }], 2);
    const { svc, cotizacionRepo } = makeService(qb, [
      { id: 3, numero: 'COT-3', lineas: [{ id: 1 }] },
      { id: 5, numero: 'COT-5', lineas: [{ id: 2 }, { id: 3 }] },
    ]);

    const r: any = await svc.getCotizaciones({ page: 1, limit: 10 });

    expect(cotizacionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: ['proveedor', 'lineas'] }));
    expect(r.data.map((c: any) => c.id)).toEqual([5, 3]);
  });
});
