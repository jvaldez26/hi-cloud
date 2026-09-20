import { ImportacionService } from './importacion.service';

/**
 * COMMIT — capturar costo en las rutas que suman stock sin costo (2026-09-20).
 *
 * La columna `costo` del CSV es opcional. Si viene y es >0, la fila
 * importada alimenta AVCO (stockAntes=0, primer movimiento del producto →
 * actualizarCostoPromedio reemplaza limpio). Sin la columna, o vacía, el
 * producto queda exactamente como antes.
 */

const EMPRESA = 7;
const ALMACEN_ID = 3;

function csv(headerExtra: string, filaExtra: string) {
  return Buffer.from(
    `codigo,nombre,precio,stock,${headerExtra}\r\n` +
    `PROD1,Producto Test,100,20,${filaExtra}\r\n`,
    'utf-8',
  );
}

function buildDeps() {
  return {
    clienteRepo:   {},
    productoRepo: {
      findOne: jest.fn().mockResolvedValue(null), // sin duplicado de código
      create:  jest.fn((d: any) => d),
      save:    jest.fn((d: any) => Promise.resolve({ ...d, id: 88 })),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    proveedorRepo: {},
    ds: {
      // Devuelve un almacén activo para que entre a la rama que registra
      // el movimiento inicial (y, si aplica, llama a AVCO).
      query: jest.fn().mockResolvedValue([{ id: ALMACEN_ID }]),
    },
    tenantSvc: { getEmpresaId: () => EMPRESA, getUserId: () => 1 },
    prodProvSvc: { registrarDesdeCompra: jest.fn() },
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): ImportacionService {
  return new ImportacionService(
    d.clienteRepo as any, d.productoRepo as any, d.proveedorRepo as any, d.ds as any,
    d.tenantSvc as any, d.prodProvSvc as any, d.valoracionSvc as any,
  );
}

describe('ImportacionService.importarProductos() — columna costo opcional alimenta AVCO', () => {
  it('con columna costo>0: llama actualizarCostoPromedio(id, stockAntes=0, stock, costo)', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const result = await service.importarProductos(csv('costo', '65.50'));

    expect(result.errores).toBe(0);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(88, 0, 20, 65.5);
  });

  it('sin columna costo: NO llama actualizarCostoPromedio — el producto queda como siempre', async () => {
    const d = buildDeps();
    const service = buildService(d);

    const result = await service.importarProductos(
      Buffer.from('codigo,nombre,precio,stock\r\nPROD1,Producto Test,100,20\r\n', 'utf-8'),
    );

    expect(result.errores).toBe(0);
    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('columna costo presente pero vacía en la fila: tampoco llama', async () => {
    const d = buildDeps();
    const service = buildService(d);

    await service.importarProductos(csv('costo', ''));

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });
});
