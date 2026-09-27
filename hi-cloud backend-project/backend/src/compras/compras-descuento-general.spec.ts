import { ComprasService } from './compras.service';

/**
 * Descuento GENERAL (a nivel de documento completo) en Órdenes de Compra.
 *
 * Reutiliza el mismo motor que factura/cotización/pro-forma/pre-factura
 * (common/calculo/descuento-documento.ts, ya probado en su propio spec para
 * el algoritmo de reparto) — este archivo solo fija el CABLEADO específico
 * de Compras:
 *   - El descuento general se reparte proporcionalmente sobre el subtotal ya
 *     neto de línea, y el ITBIS de cada línea se recalcula con SU PROPIA
 *     tasa (nunca una tasa promedio).
 *   - Línea y general son ACUMULABLES: primero el de línea, el general se
 *     prorratea sobre lo que queda.
 *   - descuentoCompra (el denormalizado que ve el pie/PDF) = línea + general.
 *   - El costo que entra a inventario (costoUnitarioReal) baja también con
 *     el general, no solo con el de línea.
 *   - Sin descuento general (tipo/valor ausentes), el comportamiento es
 *     IDÉNTICO al de antes de este cambio (regresión).
 *
 * Mismo criterio que compras-descuento.spec.ts: calcularDetalles() es
 * privado, se accede vía `as any`.
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

async function calcular(service: any, detalles: any[], descuentoGeneral: { descuentoGeneralTipo?: string; descuentoGeneralValor?: number; descuentoGeneralAplicarSobre?: string } = {}) {
  return service.calcularDetalles({ detalles, ...descuentoGeneral } as any);
}

describe('ComprasService.calcularDetalles — descuento GENERAL', () => {
  it('por PORCENTAJE, con líneas de distintas tasas de ITBIS: cada una conserva su propia tasa tras el reparto', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B'], [PROD_C, 'C']]));
    const { detallesData, subtotalCompra, itbisCompra, descuentoGeneralMonto } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
      { productoId: PROD_B, cantidad: 1, precioUnitario: 100, porcentajeItbis: 16 },
      { productoId: PROD_C, cantidad: 1, precioUnitario: 100, porcentajeItbis: 0 },
    ], { descuentoGeneralTipo: 'porcentaje', descuentoGeneralValor: 10 });

    // subtotalBase = 300, 10% general = 30 → cada línea (100/300 = 1/3) absorbe 10
    expect(descuentoGeneralMonto).toBeCloseTo(30);
    expect(detallesData[0].subtotal).toBeCloseTo(90);
    expect(detallesData[1].subtotal).toBeCloseTo(90);
    expect(detallesData[2].subtotal).toBeCloseTo(90);
    // ITBIS con la tasa PROPIA de cada línea sobre su base ya con el general aplicado
    expect(detallesData[0].importeItbis).toBeCloseTo(16.2); // 90 × 18%
    expect(detallesData[1].importeItbis).toBeCloseTo(14.4); // 90 × 16%
    expect(detallesData[2].importeItbis).toBe(0);            // exenta
    expect(subtotalCompra).toBeCloseTo(270);
    expect(itbisCompra).toBeCloseTo(16.2 + 14.4);
  });

  it('por MONTO FIJO: se reparte proporcionalmente y nunca supera el subtotal', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B']]));
    const { detallesData, descuentoGeneralMonto } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 300, porcentajeItbis: 18 },
      { productoId: PROD_B, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'monto', descuentoGeneralValor: 40 });

    // subtotalBase = 400 → A (300/400=75%) absorbe 30, B (25%) absorbe 10
    expect(descuentoGeneralMonto).toBe(40);
    expect(detallesData[0].subtotal).toBeCloseTo(270);
    expect(detallesData[1].subtotal).toBeCloseTo(90);
  });

  it('descuento general mayor que el subtotal: se topa, nunca lo vuelve negativo', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const { subtotalCompra, descuentoGeneralMonto } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'monto', descuentoGeneralValor: 500 });

    expect(descuentoGeneralMonto).toBe(100);
    expect(subtotalCompra).toBe(0);
  });

  it('descuento de LÍNEA + descuento GENERAL combinados: el general se prorratea sobre lo que queda tras el de línea', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B']]));
    const { detallesData, descuentoCompra, descuentoGeneralMonto } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18, descuentoMonto: 20 }, // neto línea: 80
      { productoId: PROD_B, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },                      // neto línea: 100
    ], { descuentoGeneralTipo: 'porcentaje', descuentoGeneralValor: 10 });

    // subtotalBase (post-línea) = 180; general 10% = 18 → A (80/180) absorbe 8, B (100/180) absorbe 10
    expect(descuentoGeneralMonto).toBeCloseTo(18);
    expect(detallesData[0].subtotal).toBeCloseTo(72);  // 80 - 8
    expect(detallesData[1].subtotal).toBeCloseTo(90);  // 100 - 10
    // descuentoCompra (denormalizado del pie/PDF) = línea (20) + general (18)
    expect(descuentoCompra).toBeCloseTo(38);
  });

  it('el costo que entra a inventario (costoUnitarioReal) también baja con el descuento general', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const { detallesData } = await calcular(service, [
      { productoId: PROD_A, cantidad: 10, cantidadBonificada: 2, precioUnitario: 100, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'monto', descuentoGeneralValor: 100 });

    // bruto 1000, general 100 → neto 900; entran 12 unidades (10 pagadas + 2 bonif)
    const d = detallesData[0];
    expect(d.subtotal).toBe(900);
    expect(d.costoUnitarioReal).toBeCloseTo(75); // 900 ÷ 12
  });

  it('descuentoGeneralAplicarSobre="total": el TOTAL baja exactamente el monto ingresado (una sola tasa)', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B']]));
    const { detallesData } = await calcular(service, [
      { productoId: PROD_A, cantidad: 2, precioUnitario: 300, porcentajeItbis: 18 },
      { productoId: PROD_B, cantidad: 1, precioUnitario: 400, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'monto', descuentoGeneralValor: 118, descuentoGeneralAplicarSobre: 'total' });

    // totalPre = 1000 × 1.18 = 1180 → objetivo = 1062
    const totalDoc = detallesData.reduce((s, d) => s + d.total!, 0);
    expect(Math.round(totalDoc * 100) / 100).toBe(1062);
  });

  it('descuentoGeneralAplicarSobre="total" con tasas MIXTAS: la suma de líneas cuadra exacto, sin residuo', async () => {
    const service = buildService(productosMap([[PROD_A, 'A'], [PROD_B, 'B'], [PROD_C, 'C']]));
    const { detallesData } = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
      { productoId: PROD_B, cantidad: 1, precioUnitario: 100, porcentajeItbis: 16 },
      { productoId: PROD_C, cantidad: 1, precioUnitario: 100, porcentajeItbis: 0 },
    ], { descuentoGeneralTipo: 'monto', descuentoGeneralValor: 50, descuentoGeneralAplicarSobre: 'total' });

    // totalPre = 118+116+100 = 334 → objetivo 284
    const totalDoc = Math.round(detallesData.reduce((s, d) => s + d.total!, 0) * 100) / 100;
    expect(totalDoc).toBe(284);
  });

  it('sin descuentoGeneralAplicarSobre (undefined): comportamiento IDÉNTICO al modo "subtotal" (regresión)', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const conAplicarSobreExplicito = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'porcentaje', descuentoGeneralValor: 10, descuentoGeneralAplicarSobre: 'subtotal' });
    const sinAplicarSobre = await calcular(service, [
      { productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
    ], { descuentoGeneralTipo: 'porcentaje', descuentoGeneralValor: 10 });

    expect(conAplicarSobreExplicito.detallesData[0].subtotal).toBe(sinAplicarSobre.detallesData[0].subtotal);
    expect(conAplicarSobreExplicito.descuentoGeneralMonto).toBe(sinAplicarSobre.descuentoGeneralMonto);
  });

  it('sin descuento general (tipo/valor ausentes): comportamiento IDÉNTICO al de antes (regresión)', async () => {
    const service = buildService(productosMap([[PROD_A, 'A']]));
    const { detallesData, descuentoCompra, descuentoGeneralMonto } = await calcular(service, [
      { productoId: PROD_A, cantidad: 3, precioUnitario: 145, porcentajeItbis: 18 },
    ]);

    const d = detallesData[0];
    expect(d.subtotal).toBe(435);
    expect(d.importeItbis).toBeCloseTo(78.3);
    expect(descuentoGeneralMonto).toBe(0);
    expect(descuentoCompra).toBe(0);
  });
});

describe('ComprasService.previsualizarAsiento — refleja el descuento general', () => {
  it('el panel de "Vista previa del asiento contable" ya recalcula con el descuento general aplicado', async () => {
    const productosService = { findByIds: jest.fn().mockResolvedValue(productosMap([[PROD_A, 'A']])) };
    const asientosSvc = {
      previsualizarCompra: jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }),
    };
    const service = new ComprasService(
      {} as any, {} as any, {} as any,
      productosService as any,
      {} as any, {} as any, {} as any, {} as any,
      asientosSvc as any,
      {} as any, {} as any, {} as any, {} as any,
    );

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-09-19',
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
      descuentoGeneralTipo: 'porcentaje', descuentoGeneralValor: 10,
    } as any);

    // bruto 100, general 10% = 10 → neto 90, ITBIS 18% de 90 = 16.2, total 106.2
    expect(asientosSvc.previsualizarCompra).toHaveBeenCalledWith(
      106.2, 90, 16.2, 'OC-VISTA-PREVIA', undefined, undefined,
    );
  });
});
