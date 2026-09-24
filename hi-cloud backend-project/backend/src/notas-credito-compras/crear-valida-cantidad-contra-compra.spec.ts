/**
 * NC de Compra — validación cruzada de cantidad contra la línea de
 * compra_detalles referenciada (compraDetalleId).
 *
 * devolucion_inventario: tope = cantidadRecibida de esa línea (no lo
 *   ordenado — con recepción parcial, lo que nunca llegó no se puede
 *   "devolver").
 * no_recibida: tope = pendiente de esa línea (cantidadTotal - cantidadRecibida).
 * ajuste_sin_devolucion: sin tope — es un ajuste de valor, no de cantidad.
 */

import { NotasCreditoComprasService } from './notas-credito-compras.service';
import { TipoNCCompra, MotivoNCCompra } from './entities/nota-credito-compra.entity';

function makeService(lineasCompra: any[]) {
  const compraDetRepo = { findBy: jest.fn().mockResolvedValue(lineasCompra) };
  const nccRepo = {
    create: jest.fn((d: any) => d),
    save:   jest.fn(async (d: any) => ({ id: 1, ...d })),
  };
  const tenantSvc = { getEmpresaId: () => 7 };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(NotasCreditoComprasService.prototype);
  svc.compraDetRepo = compraDetRepo;
  svc.nccRepo       = nccRepo;
  svc.tenantSvc     = tenantSvc;
  svc.dataSource    = dataSource;
  return { svc, compraDetRepo };
}

const dtoBase = (tipo: TipoNCCompra, detalles: any[]) => ({
  proveedorId: 1, fecha: '2026-09-24', tipo, ncfProveedor: 'B0400000123',
  motivo: MotivoNCCompra.DEVOLUCION, detalles,
});

describe('NotasCreditoComprasService.crear — validación contra compra_detalles', () => {
  it('devolucion_inventario: rechaza devolver más de lo recibido en esa línea', async () => {
    const { svc } = makeService([{ id: 100, cantidadTotal: 10, cantidadRecibida: 6 }]);
    const dto = dtoBase(TipoNCCompra.DEVOLUCION_INVENTARIO, [
      { compraDetalleId: 100, descripcion: 'Ace 100g', cantidad: 7, precioUnitario: 50 },
    ]);

    await expect(svc.crear(dto, 1)).rejects.toThrow(/solo se recibieron 6/);
  });

  it('devolucion_inventario: acepta devolver exactamente lo recibido', async () => {
    const { svc } = makeService([{ id: 100, cantidadTotal: 10, cantidadRecibida: 6 }]);
    const dto = dtoBase(TipoNCCompra.DEVOLUCION_INVENTARIO, [
      { compraDetalleId: 100, descripcion: 'Ace 100g', cantidad: 6, precioUnitario: 50 },
    ]);

    await expect(svc.crear(dto, 1)).resolves.toBeDefined();
  });

  it('no_recibida: rechaza anular más de lo pendiente de esa línea', async () => {
    // Ordenados 10, recibidos 6 → pendiente 4.
    const { svc } = makeService([{ id: 100, cantidadTotal: 10, cantidadRecibida: 6 }]);
    const dto = dtoBase(TipoNCCompra.NO_RECIBIDA, [
      { compraDetalleId: 100, descripcion: 'Ace 100g', cantidad: 5, precioUnitario: 50 },
    ]);

    await expect(svc.crear(dto, 1)).rejects.toThrow(/solo hay 4 pendiente/);
  });

  it('no_recibida: acepta anular exactamente lo pendiente', async () => {
    const { svc } = makeService([{ id: 100, cantidadTotal: 10, cantidadRecibida: 6 }]);
    const dto = dtoBase(TipoNCCompra.NO_RECIBIDA, [
      { compraDetalleId: 100, descripcion: 'Ace 100g', cantidad: 4, precioUnitario: 50 },
    ]);

    await expect(svc.crear(dto, 1)).resolves.toBeDefined();
  });

  it('ajuste_sin_devolucion: no valida cantidad contra la compra (ni siquiera consulta compra_detalles)', async () => {
    const { svc, compraDetRepo } = makeService([{ id: 100, cantidadTotal: 10, cantidadRecibida: 6 }]);
    const dto = dtoBase(TipoNCCompra.AJUSTE_SIN_DEVOLUCION, [
      { compraDetalleId: 100, descripcion: 'Ajuste de precio', cantidad: 999, precioUnitario: 1 },
    ]);

    await expect(svc.crear(dto, 1)).resolves.toBeDefined();
    expect(compraDetRepo.findBy).not.toHaveBeenCalled();
  });

  it('línea sin compraDetalleId: no se valida (no hay con qué comparar) — no bloquea la creación', async () => {
    const { svc } = makeService([]);
    const dto = dtoBase(TipoNCCompra.DEVOLUCION_INVENTARIO, [
      { descripcion: 'Producto sin vínculo a OC', cantidad: 999, precioUnitario: 1 },
    ]);

    await expect(svc.crear(dto, 1)).resolves.toBeDefined();
  });
});
