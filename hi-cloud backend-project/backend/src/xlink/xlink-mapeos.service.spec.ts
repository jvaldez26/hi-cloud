import { XlinkMapeosService } from './xlink-mapeos.service';

const EMPRESA = 7;
const CONTRAPARTE = 'xlink-id-1';

function buildDeps() {
  return {
    ds: { query: jest.fn().mockResolvedValue(undefined) },
    tenantSvc: { getEmpresaId: () => EMPRESA },
    productosSvc: { create: jest.fn() },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): XlinkMapeosService {
  return new XlinkMapeosService(d.ds as any, d.tenantSvc as any, d.productosSvc as any);
}

describe('XlinkMapeosService.resolverProducto', () => {
  it('usa el mapeo ya guardado si existe, sin intentar auto-match', async () => {
    const d = buildDeps();
    const manager = { query: jest.fn().mockResolvedValue([{ valorInternoId: 42 }]) };
    const service = buildService(d);

    const id = await service.resolverProducto(manager as any, CONTRAPARTE, 1, true, 'SKU-1', 'Producto A');

    expect(id).toBe(42);
    expect(manager.query).toHaveBeenCalledTimes(1); // solo la consulta del mapeo, no siguió a producto_proveedor
  });

  it('sin mapeo guardado, con intentarAutoMatch y sku: resuelve por producto_proveedor y GUARDA el mapeo para la próxima vez', async () => {
    const d = buildDeps();
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([]) // sin mapeo
        .mockResolvedValueOnce([{ productoId: 99 }]) // auto-match
        .mockResolvedValueOnce(undefined), // INSERT del mapeo
    };
    const service = buildService(d);

    const id = await service.resolverProducto(manager as any, CONTRAPARTE, 5, true, 'SKU-2', 'Producto B');

    expect(id).toBe(99);
    expect(manager.query).toHaveBeenCalledTimes(3);
    expect(manager.query.mock.calls[2][0]).toMatch(/INSERT INTO xlink_mapeos/);
    expect(manager.query.mock.calls[2][1]).toEqual([EMPRESA, CONTRAPARTE, 'SKU-2', 99]);
  });

  it('sin mapeo y sin intentarAutoMatch: no intenta producto_proveedor, devuelve null', async () => {
    const d = buildDeps();
    const manager = { query: jest.fn().mockResolvedValueOnce([]) };
    const service = buildService(d);

    const id = await service.resolverProducto(manager as any, CONTRAPARTE, 5, false, 'SKU-3', 'Producto C');

    expect(id).toBeNull();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('sin sku (línea sin producto en origen): usa una clave determinística por nombre', async () => {
    const d = buildDeps();
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const service = buildService(d);

    await service.resolverProducto(manager as any, CONTRAPARTE, 5, true, null, 'Instalación');

    expect(manager.query.mock.calls[0][1]).toEqual([EMPRESA, CONTRAPARTE, '__sin_sku__:Instalación']);
  });

  it('sin match por ningún camino: devuelve null (falta)', async () => {
    const d = buildDeps();
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const service = buildService(d);

    const id = await service.resolverProducto(manager as any, CONTRAPARTE, 5, true, 'SKU-X', 'Producto X');

    expect(id).toBeNull();
  });
});

describe('XlinkMapeosService.guardarMapeos', () => {
  it('guarda un mapeo con un valorInternoId ya elegido', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.guardarMapeos({ contraparteXlinkId: CONTRAPARTE, mapeos: [{ tipo: 'producto', valorExterno: 'SKU-1', valorInternoId: 42 }] } as any);

    expect(d.ds.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO xlink_mapeos'),
      [EMPRESA, CONTRAPARTE, 'producto', 'SKU-1', 42],
    );
  });

  it('crea el producto al vuelo y guarda el mapeo con el id resultante', async () => {
    const d = buildDeps();
    d.productosSvc.create.mockResolvedValue({ id: 77 });
    const service = buildService(d);

    await service.guardarMapeos({
      contraparteXlinkId: CONTRAPARTE,
      mapeos: [{ tipo: 'producto', valorExterno: 'SKU-2', crearProducto: { nombre: 'Nuevo Producto', unidadMedida: 'UND', porcentajeIva: 18 } }],
    } as any);

    expect(d.productosSvc.create).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Nuevo Producto' }));
    expect(d.ds.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO xlink_mapeos'),
      [EMPRESA, CONTRAPARTE, 'producto', 'SKU-2', 77],
    );
  });
});
