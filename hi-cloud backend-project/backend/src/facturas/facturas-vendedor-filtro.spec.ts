import { FacturasService } from './facturas.service';

/**
 * findAll() — un VENDEDOR solo ve sus propias facturas en el listado.
 *
 * La protección real vive aquí, no en el frontend: cualquier vendedorId que
 * llegue por query param de un usuario con rol 'vendedor' se IGNORA salvo
 * en el caso — documentado, mitigación parcial — de empresas que no ligan
 * vendedores.usuarioId (ver VendedorResolverService.resolverVendedor).
 * admin/contador nunca se tocan. Con sesión de supervisor activa, un
 * vendedor ve todo, como admin.
 *
 * Método privado probado vía `.call({...})`, mismo patrón que
 * supervisor-session-id.spec.ts / costo-venta-validacion.spec.ts.
 */
function makeQueryBuilder(rows: any[] = [], total = 0) {
  const andWhereCalls: Array<[string, any]> = [];
  const qb: any = {
    leftJoinAndSelect: () => qb,
    where:              () => qb,
    andWhere:           (sql: string, params: any) => { andWhereCalls.push([sql, params]); return qb; },
    orderBy:            () => qb,
    addOrderBy:         () => qb,
    skip:               () => qb,
    take:               () => qb,
    getManyAndCount:    async () => [rows, total],
  };
  return { qb, andWhereCalls };
}

function makeCtx(opts: {
  supervisorActivo: boolean;
  vendedorEnlazado: { id: number; nombre: string } | null;
}) {
  const { qb, andWhereCalls } = makeQueryBuilder();
  const query = jest.fn().mockResolvedValue(opts.supervisorActivo ? [{ id: 1 }] : []);
  const ctx = {
    facturaRepository: { createQueryBuilder: () => qb, manager: { query: jest.fn() } },
    tenantService:      { getEmpresaId: () => 7, getSucursalId: () => null },
    dataSource:         { query },
    vendedorResolver:   { vendedorEnlazado: jest.fn().mockResolvedValue(opts.vendedorEnlazado) },
    // El método privado que consulta pos_supervisor_log — se reusa el `ctx`
    // completo (misma técnica que costo-venta-validacion.spec.ts), así que
    // apunta al `this` real del prototipo, no a un stub aparte.
    tieneSupervisorActivo: (FacturasService.prototype as any).tieneSupervisorActivo,
  };
  (ctx as any).tieneSupervisorActivo = (ctx as any).tieneSupervisorActivo.bind(ctx);
  return { ctx, andWhereCalls };
}

function vendedorIdAplicado(andWhereCalls: Array<[string, any]>): number | undefined {
  const fila = andWhereCalls.find(([sql]) => sql.includes('"vendedorId"'));
  return fila?.[1]?.vendedorId;
}

const PAGINATION_BASE = { limit: 10, page: 1 };

describe('FacturasService.findAll — filtro "solo mis facturas" para rol vendedor', () => {
  it('vendedor SIN supervisor activo, CON vendedor enlazado: fuerza su propio vendedorId, ignora el que manda el query', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: { id: 42, nombre: 'Vendedor A' } });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE, vendedorId: 999 }, { id: 5, role: 'vendedor' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBe(42); // no 999 — el del query se ignora
  });

  it('vendedor A no puede ver las facturas de vendedor B forzando otro vendedorId por query', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: { id: 10, nombre: 'Vendedor A' } });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE, vendedorId: 20 /* intento de ver a B */ }, { id: 5, role: 'vendedor' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBe(10);
    expect(vendedorIdAplicado(andWhereCalls)).not.toBe(20);
  });

  it('vendedor SIN supervisor activo, SIN vendedor enlazado (empresa que no liga usuarioId): cae al vendedorId que manda el cliente — mitigación parcial, documentada', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: null });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE, vendedorId: 7 }, { id: 5, role: 'vendedor' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBe(7);
  });

  it('vendedor CON sesión de supervisor activa: ve el listado completo, sin filtro — igual que admin', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: true, vendedorEnlazado: { id: 42, nombre: 'Vendedor A' } });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE, vendedorId: 999 }, { id: 5, role: 'vendedor' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBeUndefined();
  });

  it('admin: ve todo, sin filtro, aunque tenga un vendedorId en el query (uso legítimo de filtrar por vendedor)', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: null });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE }, { id: 1, role: 'admin' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBeUndefined();
    expect((ctx as any).vendedorResolver.vendedorEnlazado).not.toHaveBeenCalled();
  });

  it('admin filtrando explícitamente por vendedorId (ej. reporte por vendedor): se respeta tal cual', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: null });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE, vendedorId: 55 }, { id: 1, role: 'admin' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBe(55);
  });

  it('contador: mismo trato que admin, sin filtro forzado', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: null });
    await (FacturasService.prototype as any).findAll.call(
      ctx, { ...PAGINATION_BASE }, { id: 1, role: 'contador' },
    );
    expect(vendedorIdAplicado(andWhereCalls)).toBeUndefined();
  });

  it('sin usuario (llamada interna/sin @GetUser): no revienta, se comporta como sin restricción de vendedor', async () => {
    const { ctx, andWhereCalls } = makeCtx({ supervisorActivo: false, vendedorEnlazado: null });
    await (FacturasService.prototype as any).findAll.call(ctx, { ...PAGINATION_BASE });
    expect(vendedorIdAplicado(andWhereCalls)).toBeUndefined();
  });
});
