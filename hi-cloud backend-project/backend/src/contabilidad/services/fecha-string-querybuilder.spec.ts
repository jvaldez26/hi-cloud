/**
 * P3 Bloque 5 — getAsientos()/getLibroMayor() pasaban new Date(fechaDesde/
 * fechaHasta) al QueryBuilder. La columna `a.fecha` es `type: 'date'`; el
 * servidor corre en UTC — new Date('2026-09-15') se parsea como medianoche
 * UTC, que en RD (UTC-4) es el día 14 a las 8pm, así que comparar contra
 * la fecha corría el filtro un día para cualquier valor cercano al límite.
 * El fix: pasar el string 'YYYY-MM-DD' crudo, sin envolverlo en Date.
 */

import { ContabilidadService } from './contabilidad.service';

function makeQueryBuilder() {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'innerJoin', 'select', 'addSelect', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    qb[m] = (...args: any[]) => { calls.push({ method: m, args }); return qb; };
  }
  qb.getMany       = jest.fn().mockResolvedValue([]);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return { qb, calls };
}

describe('ContabilidadService — fecha cruda al QueryBuilder (P3 Bloque 5)', () => {
  it('getAsientos(): pasa fechaDesde/fechaHasta como string crudo, no como Date', async () => {
    const { qb, calls } = makeQueryBuilder();
    const asientoRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const svc: any = Object.create(ContabilidadService.prototype);
    svc.asientoRepository = asientoRepository;
    svc.tenantService     = { getEmpresaId: () => 7 };

    await svc.getAsientos({ fechaDesde: '2026-09-15', fechaHasta: '2026-09-16' });

    const desde = calls.find((c) => c.method === 'andWhere' && c.args[0].includes(':desde'));
    const hasta = calls.find((c) => c.method === 'andWhere' && c.args[0].includes(':hasta'));
    expect(desde!.args[1]).toEqual({ desde: '2026-09-15' });
    expect(hasta!.args[1]).toEqual({ hasta: '2026-09-16' });
    expect(desde!.args[1].desde).not.toBeInstanceOf(Date);
  });

  it('getLibroMayor(): pasa fechaDesde/fechaHasta como string crudo, no como Date', async () => {
    const { qb, calls } = makeQueryBuilder();
    const cuenta = { id: 1, codigo: '1.1.1.02', nombre: 'Caja', naturaleza: 'deudora', isActive: true };
    const cuentaRepository = { findOne: jest.fn().mockResolvedValue(cuenta) };
    const lineaRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const svc: any = Object.create(ContabilidadService.prototype);
    svc.cuentaRepository = cuentaRepository;
    svc.lineaRepository  = lineaRepository;
    svc.tenantService    = { getEmpresaId: () => 7 };

    await svc.getLibroMayor(1, '2026-09-15', '2026-09-16');

    const desde = calls.find((c) => c.method === 'andWhere' && c.args[0].includes(':desde'));
    const hasta = calls.find((c) => c.method === 'andWhere' && c.args[0].includes(':hasta'));
    expect(desde!.args[1]).toEqual({ desde: '2026-09-15' });
    expect(hasta!.args[1]).toEqual({ hasta: '2026-09-16' });
    expect(desde!.args[1].desde).not.toBeInstanceOf(Date);
  });
});
