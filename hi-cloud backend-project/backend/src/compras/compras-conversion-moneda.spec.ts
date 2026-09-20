import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';
import { BadRequestException } from '@nestjs/common';

/**
 * COMMIT — conversión de moneda en compras (2026-09-20).
 *
 * El frontend nunca convierte: envía precioUnitario en la moneda
 * seleccionada + moneda + tipoCambio, tal cual (confirmado por investigación
 * de código en CompraFormInner.tsx). El backend convierte a DOP en
 * calcularDetalles() — el mismo punto donde ya calculaba costoUnitarioReal y
 * los totales — usando convertirADOP(), y guarda AMBOS: el monto original
 * (subtotal/itbis/total/costoUnitarioReal, para conciliar con la factura del
 * proveedor) y su equivalente en DOP (*DOP, lo que alimenta AVCO y el
 * asiento). La tasa que manda es siempre compra.tipoCambio — nunca se
 * recalcula con una tasa del día.
 *
 * calcularDetalles() es privado — mismo criterio que ya usa
 * compras-descuento.spec.ts: acceder vía `as any` en vez de montar un
 * create() completo con repos reales es señal, no ruido, para probar solo
 * la aritmética.
 */

const PROD_A = 1;

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

async function calcular(service: any, dto: Record<string, unknown>) {
  return service.calcularDetalles(dto as any);
}

describe('ComprasService.calcularDetalles — conversión de moneda (*DOP)', () => {
  it('DOP (o sin especificar moneda): *DOP es idéntico al original — nada cambia', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    const { detallesData, subtotalCompra, itbisCompra, subtotalCompraDOP, itbisCompraDOP } = await calcular(service, {
      detalles: [{ productoId: PROD_A, cantidad: 5, precioUnitario: 100, porcentajeItbis: 18 }],
    });

    expect(subtotalCompraDOP).toBeCloseTo(subtotalCompra);
    expect(itbisCompraDOP).toBeCloseTo(itbisCompra);
    expect(detallesData[0].costoUnitarioRealDOP).toBeCloseTo(Number(detallesData[0].costoUnitarioReal));
  });

  it('USD con tasa válida: *DOP = original × tasa; el original NO se toca', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    const { detallesData, subtotalCompra, itbisCompra, subtotalCompraDOP, itbisCompraDOP } = await calcular(service, {
      moneda: 'USD', tipoCambio: 58.5,
      detalles: [{ productoId: PROD_A, cantidad: 5, precioUnitario: 100, porcentajeItbis: 18 }],
    });
    const d = detallesData[0];

    // bruto 500 USD, ITBIS 90 USD — el original se conserva EXACTO
    expect(subtotalCompra).toBe(500);
    expect(itbisCompra).toBe(90);
    expect(d.subtotal).toBe(500);
    expect(d.importeItbis).toBe(90);
    expect(Number(d.costoUnitarioReal)).toBe(100);

    // DOP = original × 58.5
    expect(subtotalCompraDOP).toBeCloseTo(500 * 58.5);
    expect(itbisCompraDOP).toBeCloseTo(90 * 58.5);
    expect(Number(d.costoUnitarioRealDOP)).toBeCloseTo(100 * 58.5);
  });

  it('EUR con tasa válida: misma conversión, currency-agnostic', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    const { subtotalCompra, subtotalCompraDOP } = await calcular(service, {
      moneda: 'EUR', tipoCambio: 63.2,
      detalles: [{ productoId: PROD_A, cantidad: 2, precioUnitario: 50, porcentajeItbis: 18 }],
    });

    expect(subtotalCompra).toBe(100);
    expect(subtotalCompraDOP).toBeCloseTo(100 * 63.2);
  });

  it('rechaza USD sin tipoCambio (hoy pasaría en silencio tratándolo como DOP)', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    await expect(calcular(service, {
      moneda: 'USD',
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    })).rejects.toThrow(BadRequestException);
  });

  it('rechaza USD con tipoCambio = 0', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    await expect(calcular(service, {
      moneda: 'USD', tipoCambio: 0,
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    })).rejects.toThrow(BadRequestException);
  });

  it('rechaza USD con tipoCambio = 1 (el default silencioso de la columna, nunca la tasa real)', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    await expect(calcular(service, {
      moneda: 'USD', tipoCambio: 1,
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    })).rejects.toThrow(/tasa de cambio válida/);
  });

  it('DOP con tipoCambio ausente o 1: no rechaza — es el caso de siempre', async () => {
    const service = buildService(productosMap([[PROD_A, 'Producto A']]));
    await expect(calcular(service, {
      moneda: 'DOP',
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    })).resolves.toBeDefined();
    await expect(calcular(service, {
      moneda: 'DOP', tipoCambio: 1,
      detalles: [{ productoId: PROD_A, cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
    })).resolves.toBeDefined();
  });
});

// ── cambiarEstado(RECIBIDA): AVCO y el asiento reciben los montos DOP ───────

const PROD_ID  = 10;
const EMPRESA  = 1;
const USUARIO  = 9;
const COMPRA_ID = 99;

function makeDetalleME(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, productoId: PROD_ID, descripcion: 'Producto Test',
    cantidad: 5, cantidadBonificada: 0, cantidadTotal: 5, cantidadRecibida: 0,
    precioUnitario: 100, costoUnitarioReal: 100, costoUnitarioRealDOP: 5850,   // 100 × 58.5
    porcentajeItbis: 18,
    subtotal: 500, importeItbis: 90, total: 590,
    ...overrides,
  };
}

function makeCompraME(estado: CompraEstado, detalles: ReturnType<typeof makeDetalleME>[]) {
  return {
    id: COMPRA_ID, folio: 'COM-001', estado, usuarioId: USUARIO, almacenId: null,
    tipoPago: 'credito', diasCredito: 30,
    moneda: 'USD', tipoCambio: 58.5,
    subtotal: 500, itbis: 90, total: 590, netoPagar: 590,                     // original, USD
    subtotalDOP: 29250, itbisDOP: 5265, totalDOP: 34515, netoPagarDOP: 34515, // DOP = original × 58.5
    retieneItbis: false, retieneIsr: false,
    montoRetencionItbis: 0, montoRetencionIsr: 0,
    montoRetencionItbisDOP: 0, montoRetencionIsrDOP: 0,
    detalles, empresaId: EMPRESA,
  };
}

function buildDepsME(mockCompra: ReturnType<typeof makeCompraME>) {
  return {
    compraRepo: { findOne: jest.fn().mockResolvedValue(mockCompra), update: jest.fn().mockResolvedValue(undefined) },
    detalleRepo: { update: jest.fn().mockResolvedValue(undefined) },
    inventarioSvc: { registrarEntrada: jest.fn().mockResolvedValue({ cantidadAnterior: 0 }), registrarDevolucion: jest.fn() },
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
    cxpSvc: { crear: jest.fn().mockResolvedValue(undefined) },
    asientosSvc: { asientoCompraRecibida: jest.fn().mockResolvedValue(undefined) },
    tenantSvc: { getEmpresaId: () => EMPRESA, getAlmacenId: () => null, getSucursalId: () => null, resolveSucursalId: jest.fn().mockResolvedValue(null) },
    realtimeSvc: { notify: jest.fn() },
    gastosImportacionSvc: { getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()), aplicarGastosPendientes: jest.fn().mockResolvedValue(undefined) },
    ds: { query: jest.fn().mockResolvedValue([]) },
  };
}

function buildServiceME(d: ReturnType<typeof buildDepsME>): ComprasService {
  return new ComprasService(
    d.compraRepo as any, d.detalleRepo as any, {} as any, {} as any,
    { registrarDesdeCompra: jest.fn() } as any,
    d.inventarioSvc as any, d.valoracionSvc as any, d.cxpSvc as any, d.asientosSvc as any,
    d.tenantSvc as any, d.realtimeSvc as any, d.gastosImportacionSvc as any, d.ds as any,
  );
}

describe('ComprasService.cambiarEstado(RECIBIDA) — AVCO y asiento en DOP para compras en moneda extranjera', () => {
  it('AVCO recibe costoUnitarioRealDOP, no el costo en la moneda original', async () => {
    const det     = makeDetalleME();
    const compra  = makeCompraME(CompraEstado.BORRADOR, [det]);
    const d       = buildDepsME(compra);
    const service = buildServiceME(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(
      PROD_ID, 0, 5, 5850, // costoUnitarioRealDOP (100 USD × 58.5), NUNCA 100
    );
  });

  it('el asiento se contabiliza con totalDOP/subtotalDOP/itbisDOP, no con los de la compra en USD', async () => {
    const det     = makeDetalleME();
    const compra  = makeCompraME(CompraEstado.BORRADOR, [det]);
    const d       = buildDepsME(compra);
    const service = buildServiceME(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    const llamada = d.asientosSvc.asientoCompraRecibida.mock.calls[0];
    expect(llamada[1]).toBe(34515); // total DOP, no 590 (USD)
    expect(llamada[2]).toBe(29250); // subtotal DOP, no 500 (USD)
    expect(llamada[3]).toBe(5265);  // itbis DOP, no 90 (USD)
  });

  it('compra histórica sin columnas *DOP (creada antes de este commit): cae al original sin romperse', async () => {
    // Simula una fila real de antes de la migración: *DOP es undefined.
    const det = makeDetalleME({ costoUnitarioRealDOP: undefined });
    const compra = makeCompraME(CompraEstado.BORRADOR, [det]);
    (compra as any).subtotalDOP = undefined;
    (compra as any).itbisDOP = undefined;
    (compra as any).totalDOP = undefined;
    (compra as any).netoPagarDOP = undefined;
    const d       = buildDepsME(compra);
    const service = buildServiceME(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(PROD_ID, 0, 5, 100); // costoUnitarioReal
    const llamada = d.asientosSvc.asientoCompraRecibida.mock.calls[0];
    expect(llamada[1]).toBe(590); // total original
    expect(llamada[2]).toBe(500);
    expect(llamada[3]).toBe(90);
  });
});
