import { ProductosService } from './productos.service';

/**
 * COMMIT — capturar costo en las rutas que suman stock sin costo (2026-09-20).
 *
 * create() con dto.costo>0 y dto.stock>0 debe alimentar AVCO igual que una
 * Compra recibida (stockAntes=0, primer movimiento del producto →
 * actualizarCostoPromedio reemplaza limpio). Sin dto.costo, el producto
 * queda exactamente como antes: stock>0, costoPromedio nunca tocado.
 */

const EMPRESA = 7;
const USER_ID = 3;

function buildDeps() {
  return {
    productoRepo: {
      findOne: jest.fn().mockResolvedValue(null), // sin duplicados por nombre/código
      create:  jest.fn((data: any) => data),
      save:    jest.fn((data: any) => Promise.resolve({ ...data, id: 55, codigo: data.codigo ?? 'AUTO-55' })),
      update:  jest.fn().mockResolvedValue(undefined),
      manager: { query: jest.fn().mockResolvedValue([]) },
    },
    almacenRepo:      { findOne: jest.fn().mockResolvedValue(null) },
    stockAlmacenRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn((d: any) => d),
      save:    jest.fn().mockResolvedValue(undefined),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    movimientoRepo: {
      create: jest.fn((d: any) => d),
      save:   jest.fn().mockResolvedValue(undefined),
    },
    tenantSvc: {
      getEmpresaId: () => EMPRESA,
      getAlmacenId: () => null,
      getUserId:    () => USER_ID,
    },
    realtimeSvc:  { notify: jest.fn() },
    limitesSvc:   { verificarLimiteProductos: jest.fn().mockResolvedValue(undefined) },
    s3Svc:        {},
    prodProvSvc:  {},
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): ProductosService {
  return new ProductosService(
    d.productoRepo as any, d.almacenRepo as any, d.stockAlmacenRepo as any, d.movimientoRepo as any,
    d.tenantSvc as any, d.realtimeSvc as any, d.limitesSvc as any, d.s3Svc as any,
    d.prodProvSvc as any, d.valoracionSvc as any,
  );
}

describe('ProductosService.create() — costo inicial alimenta AVCO', () => {
  it('con dto.costo>0 y stock>0: llama actualizarCostoPromedio(id, stockAntes=0, stock, costo)', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.create({
      nombre: 'Producto con costo', precio: 100, stock: 20, costo: 65.5, almacenId: 9,
    } as any);

    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(55, 0, 20, 65.5);
  });

  it('sin dto.costo: NO llama actualizarCostoPromedio — el producto queda como siempre', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.create({
      nombre: 'Producto sin costo', precio: 100, stock: 20, almacenId: 9,
    } as any);

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('con dto.costo=0 explícito: tampoco llama (0 no es un costo real)', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.create({
      nombre: 'Producto costo cero', precio: 100, stock: 20, costo: 0, almacenId: 9,
    } as any);

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('con costo pero SIN stock (servicio o stock=0): no llama — nada que promediar', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.create({
      nombre: 'Servicio con costo', precio: 100, stock: 0, costo: 50, almacenId: 9,
    } as any);

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });
});
