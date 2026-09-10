/**
 * findAll() — la búsqueda por texto debe incluir codigoBarras.
 *
 * BUG REAL: el Select de producto de la Orden de Compra en el POS (y
 * cualquier otro buscador que use GET /productos) llamaba a este mismo
 * findAll(). El carrito principal del POS resuelve un escaneo por su cuenta
 * (procesarScan() en POSPage.tsx compara contra `codigo` Y `codigoBarras` en
 * el catálogo local), pero el buscador remoto de este servicio solo
 * comparaba contra nombre/código/categoría — un código de barras real
 * (EAN/UPC), guardado aparte del `codigo` (SKU interno), no encontraba nada.
 * "A veces sí, a veces no": solo funcionaba cuando el código escaneado
 * coincidía por casualidad con el SKU.
 *
 * Este spec no toca la base de datos — verifica que el WHERE armado por
 * QueryBuilder incluye la columna, con un mock mínimo de TenantService y del
 * QueryBuilder encadenado.
 */
import { ProductosService } from './productos.service';

function buildQueryBuilderMock() {
  const whereClauses: string[] = [];
  const qb: any = {
    where:        function () { return qb; },
    andWhere:     function (clause: string) { whereClauses.push(clause); return qb; },
    orderBy:      function () { return qb; },
    skip:         function () { return qb; },
    take:         function () { return qb; },
    getManyAndCount: async () => [[], 0],
  };
  return { qb, whereClauses };
}

describe('ProductosService.findAll — búsqueda por texto', () => {
  it('incluye producto.codigoBarras en el WHERE cuando hay `search`', async () => {
    const { qb, whereClauses } = buildQueryBuilderMock();
    const productoRepository = { createQueryBuilder: () => qb } as any;
    const tenantService = {
      getEmpresaId: () => 1,
      getAlmacenId: () => undefined,
    } as any;

    const svc = new ProductosService(
      productoRepository, {} as any, {} as any, {} as any,
      tenantService, {} as any, {} as any, {} as any, {} as any,
    );

    await svc.findAll({ page: 1, limit: 10, search: '7501234567890' } as any, false);

    const clauseConSearch = whereClauses.find(c => c.includes('nombre ILIKE'));
    expect(clauseConSearch).toBeDefined();
    expect(clauseConSearch).toContain('codigoBarras');
  });

  it('sin `search`, no agrega ningún WHERE de texto', async () => {
    const { qb, whereClauses } = buildQueryBuilderMock();
    const productoRepository = { createQueryBuilder: () => qb } as any;
    const tenantService = {
      getEmpresaId: () => 1,
      getAlmacenId: () => undefined,
    } as any;

    const svc = new ProductosService(
      productoRepository, {} as any, {} as any, {} as any,
      tenantService, {} as any, {} as any, {} as any, {} as any,
    );

    await svc.findAll({ page: 1, limit: 10 } as any, false);

    expect(whereClauses.some(c => c.includes('ILIKE'))).toBe(false);
  });
});
