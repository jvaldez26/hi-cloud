import { InventarioService } from './inventario.service';

/**
 * getMovimientos() (el kardex) — el "OR m.almacenId IS NULL" se quita una
 * vez que la migración de datos deja movimientos_inventario sin ninguna
 * fila NULL (ver 1770300000000/1770305000000/1770310000000). Dejarlo
 * mezclaría movimientos de OTROS almacenes bajo un NULL que ya no debería
 * volver a existir.
 */

const EMPRESA = 7;
const ALMACEN = 20;

function makeQb(capturaWheres: { condicion: string; params: any }[]) {
  const qb: any = {
    leftJoinAndSelect: () => qb,
    where:    (c: string, p: any = {}) => { capturaWheres.push({ condicion: c, params: p }); return qb; },
    andWhere: (c: string, p: any = {}) => { capturaWheres.push({ condicion: c, params: p }); return qb; },
    orderBy:  () => qb,
    skip:     () => qb,
    take:     () => qb,
    getManyAndCount: () => Promise.resolve([[], 0]),
  };
  return qb;
}

function buildService(almacenId: number | null) {
  const capturaWheres: { condicion: string; params: any }[] = [];
  const movimientoRepo = { createQueryBuilder: () => makeQb(capturaWheres) };
  const tenantSvc = { getEmpresaId: () => EMPRESA, getAlmacenId: () => almacenId };

  const service = new InventarioService(
    movimientoRepo as any, {} as any, {} as any, {} as any, {} as any,
    { query: jest.fn() } as any, { notify: jest.fn() } as any, tenantSvc as any,
    {} as any, {} as any,
  );
  return { service, capturaWheres };
}

describe('InventarioService.getMovimientos (kardex) — sin "OR almacenId IS NULL"', () => {
  it('con almacén en el CLS: filtra SOLO por ese almacén, nunca incluye NULL', async () => {
    const { service, capturaWheres } = buildService(ALMACEN);
    await service.getMovimientos({});

    const condiciones = capturaWheres.map(w => w.condicion).join(' | ');
    expect(condiciones).toContain('m.almacenId = :aid');
    expect(condiciones).not.toMatch(/IS NULL/);
    expect(capturaWheres.some(w => w.params?.aid === ALMACEN)).toBe(true);
  });

  it('sin almacén en el CLS: no agrega ningún filtro de almacén', async () => {
    const { service, capturaWheres } = buildService(null);
    await service.getMovimientos({});

    const condiciones = capturaWheres.map(w => w.condicion).join(' | ');
    expect(condiciones).not.toContain('almacenId');
  });
});
