import { ComprasService } from './compras.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Descuento POR LÍNEA en Órdenes de Compra.
 *
 * Reglas de diseño que estos tests fijan:
 *   - Se captura como % O como monto; lo PERSISTIDO y usado en todo cálculo
 *     es siempre el monto (en BASE, antes de ITBIS).
 *   - El ITBIS de cada línea se calcula con SU PROPIA tasa sobre la base ya
 *     descontada — nunca una tasa promedio derivada de ITBIS ÷ subtotal
 *     (ese fue el bug del 17.31% en las NC de código 1).
 *   - El costo que entra a inventario (costoUnitarioReal) es el NETO de
 *     descuento ÷ cantidadTotal (facturada + bonificada).
 *   - Un descuento que supera el importe bruto de su línea se rechaza.
 *   - Sin descuento, los totales no cambian frente al comportamiento previo
 *     (subtotal = bruto, como siempre fue).
 *
 * calcularDetalles() es privado — se accede vía `as any` porque construir
 * una compra completa con create()/proveedoresService/repos reales para
 * probar solo la aritmética sería puro ruido; mismo criterio que ya usa
 * compras-avco.spec.ts para los caminos de recepción.
 */

const PROD_A = 1;
const PROD_B = 2;
const PROD_C = 3;

function productosMap(entries: Array<[number, string]>) {
  return new Map(entries.map(([id, nombre]) => [id, { id, nombre } as any]));
}

function buildService(productos: Map<number, any>): any {
  const productosService = { findByIds: jest.fn().mockResolvedValue(productos) };
  return new ComprasService(
    {} as any, {} as any, {} as any,
    productosService as any,
    {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, {} as any,
  );
}

async function calcular(service: any, detalles: any[]) {
  return service.calcularDetalles({ detalles } as any);
}

describe('ComprasService.calcularDetalles — descuento por línea', () => {
  it('descuento en MONTO: el ITBIS baja proporcionalmente sobre la base ya descontada', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    const { detallesData, subtotalCompra, itbisCompra, descuentoCompra } = await calcular(service, [
      { productoId: PROD_A, cantidad: 10, precioUnitario: 100, porcentajeItbis: 18, descuentoMonto: 200 },
    ]);
    const d = detallesData[0];

    // bruto 1000, descuento 200 → base 800, ITBIS 18% de 800 = 144
    expect(d.descuentoMonto).toBe(200);
    expect(d.subtotal).toBe(800);
    expect(d.importeItbis).toBe(144);
    expect(d.total).toBe(944);
    expect(subtotalCompra).toBeCloseTo(800);
    expect(itbisCompra).toBeCloseTo(144);
    expect(descuentoCompra).toBeCloseTo(200);
  });

  it('descuento en PORCENTAJE: el monto que se persiste sale de precio × cantidad × pct', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    const { detallesData } = await calcular(service, [
      { productoId: PROD_A, cantidad: 5, precioUnitario: 200, porcentajeItbis: 18, descuentoPct: 10 },
    ]);
    const d = detallesData[0];

    // bruto 1000, 10% = 100 de descuento → base 900
    expect(d.descuentoMonto).toBe(100);
    expect(d.descuentoPct).toBe(10);
    expect(d.subtotal).toBe(900);
  });

  it('tasas mixtas (18%, 16%, exento) con descuento en cada línea: cada una conserva la suya', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B'], [PROD_C, 'C']]));
    const { detallesData, itbisCompra } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18, descuentoMonto: 10 },
      { productoId: PROD_B, cantidad: 1, precioUnitario: 100, porcentajeItbis: 16, descuentoMonto: 10 },
      { productoId: PROD_C, cantidad: 1, precioUnitario: 100, porcentajeItbis: 0,  descuentoMonto: 10 },
    ]);

    // Cada línea: base 90 (100 - 10 de descuento), ITBIS con SU tasa propia
    expect(detallesData[0].importeItbis).toBeCloseTo(16.2); // 90 × 18%
    expect(detallesData[1].importeItbis).toBeCloseTo(14.4); // 90 × 16%
    expect(detallesData[2].importeItbis).toBe(0);            // exenta — no genera ITBIS
    expect(itbisCompra).toBeCloseTo(16.2 + 14.4 + 0);
  });

  it('descuento que supera el importe bruto de la línea: rechaza', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    await expect(
      calcular(service, [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, descuentoMonto: 150 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('descuento negativo: rechaza', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    await expect(
      calcular(service, [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, descuentoMonto: -1 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('OC sin descuento: los totales no cambian frente al comportamiento previo (regresión)', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const { detallesData, descuentoCompra } = await calcular(service, [
      { productoId: PROD_A, cantidad: 3, precioUnitario: 145, porcentajeItbis: 18 },
    ]);
    const d = detallesData[0];

    expect(d.descuentoMonto).toBe(0);
    expect(d.subtotal).toBe(435);        // 3 × 145, igual que antes de este cambio
    expect(d.importeItbis).toBeCloseTo(78.3);
    expect(descuentoCompra).toBe(0);
  });

  it('el costo que entra a inventario (costoUnitarioReal) es el NETO de descuento, no el bruto', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const { detallesData } = await calcular(service, [
      { productoId: PROD_A, cantidad: 10, cantidadBonificada: 2, precioUnitario: 100, descuentoMonto: 100 },
    ]);
    const d = detallesData[0];

    // bruto 1000, descuento 100 → neto 900; entran 12 unidades (10 pagadas + 2 bonif)
    expect(d.subtotal).toBe(900);
    expect(d.cantidadTotal).toBe(12);
    expect(d.costoUnitarioReal).toBeCloseTo(75); // 900 ÷ 12, NO 1000 ÷ 12 (83.33)
  });
});
