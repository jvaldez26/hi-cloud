import { InventarioService } from './inventario.service';

/**
 * COMMIT — capturar costo en las rutas que suman stock sin costo (2026-09-20).
 *
 * registrarEntrada() con costoUnitario>0 debe alimentar AVCO con el
 * stockAntes REAL del producto (no 0 — a diferencia de "crear producto" o
 * importación CSV, una entrada manual puede caer sobre un producto que ya
 * tenía stock). Sin costoUnitario, el movimiento se registra exactamente
 * como siempre — este es también el camino que usa compras.service.ts
 * (nunca pasa costoUnitario), así que debe quedar bit-a-bit igual.
 */

const EMPRESA = 7;
const PROD_ID = 42;

function buildDeps(stockActual = 10) {
  return {
    movimientoRepo: {
      create: jest.fn((d: any) => d),
      save:   jest.fn().mockResolvedValue({ id: 1 }),
    },
    productoRepo: {
      findOne: jest.fn().mockResolvedValue({ id: PROD_ID, empresaId: EMPRESA, stock: stockActual, stockMinimo: 0 }),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    loteRepo: {}, serialRepo: {}, solicitudAjusteRepo: {},
    ds: { query: jest.fn().mockResolvedValue([]) },
    realtimeSvc: { notify: jest.fn() },
    tenantSvc:   { getEmpresaId: () => EMPRESA },
    emailSvc:    {},
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): InventarioService {
  return new InventarioService(
    d.movimientoRepo as any, d.productoRepo as any, d.loteRepo as any, d.serialRepo as any,
    d.solicitudAjusteRepo as any, d.ds as any, d.realtimeSvc as any, d.tenantSvc as any,
    d.emailSvc as any, d.valoracionSvc as any,
  );
}

describe('InventarioService.registrarEntrada() — costo opcional alimenta AVCO', () => {
  it('con costoUnitario>0: llama actualizarCostoPromedio con el stockAntes REAL del producto', async () => {
    const d = buildDeps(/* stockActual */ 10);
    const service = buildService(d);

    await service.registrarEntrada(PROD_ID, 6, 3, 'Ajuste con factura', 'REF-1', undefined, 95.58);

    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(PROD_ID, 10, 6, 95.58);
  });

  it('sin costoUnitario: NO llama actualizarCostoPromedio — igual que hoy (compras.service.ts nunca lo pasa)', async () => {
    const d = buildDeps(10);
    const service = buildService(d);

    await service.registrarEntrada(PROD_ID, 6, 3, 'Compra recibida: COM-1', 'COM-1', undefined);

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('con costoUnitario=0 explícito: tampoco llama', async () => {
    const d = buildDeps(10);
    const service = buildService(d);

    await service.registrarEntrada(PROD_ID, 6, 3, undefined, undefined, undefined, 0);

    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('el movimiento se registra igual con o sin costoUnitario (el costo no cambia el efecto sobre stock)', async () => {
    const d = buildDeps(10);
    const service = buildService(d);

    await service.registrarEntrada(PROD_ID, 6, 3, 'motivo', 'ref', undefined, 95.58);

    expect(d.productoRepo.update).toHaveBeenCalledWith(PROD_ID, { stock: 16 });
    expect(d.movimientoRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      cantidad: 6, cantidadAnterior: 10, cantidadNueva: 16,
    }));
  });
});
