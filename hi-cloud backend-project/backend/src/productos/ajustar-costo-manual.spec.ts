/**
 * ProductosService.ajustarCostoManual() — fijar costoPromedio a mano para
 * productos que entraron sin pasar por una Compra (import masivo, alta en
 * POS) y quedan en $0, sin línea de costo de venta en el asiento de cada
 * factura (ver AsientosAutomaticosService.resolverCostoVenta).
 *
 * Motivo obligatorio (DTO), auditado sobre la propia fila — mismo patrón
 * que CajaService.anularRetiro: quién/cuándo/por qué y el valor ANTERIOR,
 * para no perder el rastro una vez AVCO lo recalcule tras la primera
 * compra real (que lo REEMPLAZA, no lo promedia — ver
 * valoracion-stock/actualizar-costo-promedio.spec.ts).
 */

import { ProductosService } from './productos.service';
import { NotFoundException } from '@nestjs/common';

function makeService(producto: any) {
  const productoRepository = {
    findOne: jest.fn().mockResolvedValue(producto),
    update:  jest.fn().mockResolvedValue({}),
  };
  const tenantService = { getEmpresaId: () => 7 };
  const realtimeService = { notify: jest.fn() };

  const svc: any = Object.create(ProductosService.prototype);
  svc.productoRepository = productoRepository;
  svc.tenantService      = tenantService;
  svc.realtimeService    = realtimeService;
  return { svc: svc as ProductosService, productoRepository };
}

describe('ProductosService.ajustarCostoManual()', () => {
  it('fija costoPromedio y guarda motivo/quién/cuándo/valor anterior', async () => {
    const producto = { id: 5, empresaId: 7, isActive: true, costoPromedio: 0 };
    const { svc, productoRepository } = makeService(producto);

    await svc.ajustarCostoManual(5, { costo: 125.5, motivo: 'Producto importado sin historial de compras' }, 9, 'Ana Pérez');

    expect(productoRepository.update).toHaveBeenCalledWith(5, {
      costoPromedio:        125.5,
      costoManualMotivo:    'Producto importado sin historial de compras',
      costoManualPorId:     9,
      costoManualPorNombre: 'Ana Pérez',
      costoManualEn:        expect.any(Date),
      costoManualAnterior:  0,
    });
  });

  it('captura el costoPromedio ANTERIOR, no el nuevo, para no perder el rastro', async () => {
    const producto = { id: 5, empresaId: 7, isActive: true, costoPromedio: 8.75 };
    const { svc, productoRepository } = makeService(producto);

    await svc.ajustarCostoManual(5, { costo: 20, motivo: 'Corrección de precio de import' }, 9, 'Ana Pérez');

    const args = productoRepository.update.mock.calls[0][1];
    expect(args.costoManualAnterior).toBe(8.75);
    expect(args.costoPromedio).toBe(20);
  });

  it('notifica realtime tras el ajuste', async () => {
    const { svc, } = makeService({ id: 5, empresaId: 7, isActive: true, costoPromedio: 0 });
    const notify = (svc as any).realtimeService.notify;

    await svc.ajustarCostoManual(5, { costo: 10, motivo: 'x' }, 9, 'Ana');

    expect(notify).toHaveBeenCalledWith(7, 'producto', 'updated', 5);
  });

  it('producto inexistente (o de otra empresa): 404, nunca escribe', async () => {
    const { svc, productoRepository } = makeService(null);

    await expect(svc.ajustarCostoManual(999, { costo: 10, motivo: 'x' }, 9, 'Ana'))
      .rejects.toThrow(NotFoundException);
    expect(productoRepository.update).not.toHaveBeenCalled();
  });
});
