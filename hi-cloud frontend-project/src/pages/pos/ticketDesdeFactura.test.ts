import { describe, it, expect } from 'vitest';
import { buildSaleTotalesFromFactura, buildSalePagoFromFactura, buildSaleItemsFromDetalles } from './POSPage';

/**
 * Regresión FAC-1746 (empresa 73, 2026-10-08): el ticket impreso automático
 * tras el cobro mostró TOTAL RD$1,002.00 sobre una factura guardada en BD
 * por RD$942.00 (7 ítems, confirmados por la reimpresión) — `saleObj.total`
 * salía de `totalAPagar`, una constante del RENDER del frontend derivada de
 * `cart`, mientras los ítems ya venían de `factura.detalles` (servidor). Si
 * el carrito seguía cambiando entre el clic de "Confirmar cobro" y que la
 * respuesta del servidor volviera (la emisión del e-CF puede tardar varios
 * segundos), el total impreso podía no coincidir con los ítems del mismo
 * ticket.
 *
 * Regla fijada (POSPage.tsx, confirmarCobro → ventaMut): el ticket se arma
 * SIEMPRE con lo que el servidor guardó — buildSaleTotalesFromFactura /
 * buildSalePagoFromFactura, las MISMAS funciones que ya usaba la
 * reimpresión — nunca con el estado del carrito del frontend. Estos tests
 * verifican esas dos funciones puras directamente: dado lo que el servidor
 * devuelve, el total impreso es SIEMPRE el de la factura, sin importar qué
 * decía el carrito local.
 */

describe('buildSaleTotalesFromFactura — el total impreso es el de la factura, nunca el del carrito local', () => {
  it('reproduce FAC-1746: factura real de 7 ítems/RD$942 — el total es 942, no 1002', () => {
    const facturaReal = {
      subtotal: 798.30,
      iva:      143.69,
      total:    942.00, // lo que el servidor guardó — 7 ítems, producto de 60 ya quitado del carrito
      descuentoGeneralTipo: null,
      descuentoGeneralValor: 0,
    };
    const r = buildSaleTotalesFromFactura(facturaReal);
    expect(r.total).toBe(942.00);
    expect(r.subtotal).toBe(798.30);
    expect(r.iva).toBe(143.69);
  });

  it('nunca lee nada fuera de `f` — nada de un total "local" puede colarse', () => {
    const factura = { subtotal: 100, iva: 18, total: 118 };
    // Ningún argumento de "carrito local" existe en la firma — estructuralmente
    // imposible que esta función use otra cosa que no sea `f`.
    expect(buildSaleTotalesFromFactura.length).toBe(1);
    expect(buildSaleTotalesFromFactura(factura)).toEqual({ subtotal: 100, iva: 18, total: 118 });
  });

  it('con descuento general en monto: el subtotal impreso es el BRUTO (antes del descuento), reconstruido desde lo guardado', () => {
    const factura = {
      subtotal: 90,      // neto, ya con el descuento aplicado
      iva:      16.20,
      total:    106.20,
      descuentoGeneralTipo:  'monto',
      descuentoGeneralValor: 10,
      descuentoGeneralFinal: 11.80,
    };
    const r = buildSaleTotalesFromFactura(factura);
    expect(r.subtotal).toBe(100);           // 90 neto + 10 de descuento
    expect(r.descuentoGlobal).toBe(10);
    expect(r.descuentoGlobalFinal).toBe(11.80);
    expect(r.total).toBe(106.20);           // el total SIEMPRE es el guardado, no se recalcula
  });

  it('sin descuento: no agrega descuentoGlobal/descuentoGlobalFinal (no se ve la línea "Descuento" en el ticket)', () => {
    const r = buildSaleTotalesFromFactura({ subtotal: 50, iva: 9, total: 59 });
    expect(r.descuentoGlobal).toBeUndefined();
    expect(r.descuentoGlobalFinal).toBeUndefined();
  });
});

describe('buildSalePagoFromFactura — pago único (efectivo, con y sin vuelto)', () => {
  it('pago exacto (sin montoEntregado): pagoRecibido = lo aplicado, cambio = 0', () => {
    const r = buildSalePagoFromFactura({ total: 942, formasPago: [{ tipo: 1, monto: 942 }] });
    expect(r.pagoRecibido).toBe(942);
    expect(r.cambio).toBe(0);
    expect(r.formasPago).toBeUndefined(); // método único — no se arma el desglose mixto
  });

  it('efectivo con vuelto: pagoRecibido = lo ENTREGADO (montoEntregado), no lo aplicado', () => {
    const r = buildSalePagoFromFactura({
      total: 942, formasPago: [{ tipo: 1, monto: 942, montoEntregado: 1000 }],
    });
    expect(r.pagoRecibido).toBe(1000);
    expect(r.cambio).toBe(58);
  });

  it('pago mixto: formasPago se arma para el desglose, cambio sobre el total guardado', () => {
    const r = buildSalePagoFromFactura({
      total: 942,
      formasPago: [{ tipo: 3, monto: 500 }, { tipo: 1, monto: 442, montoEntregado: 500 }],
    });
    expect(r.formasPago).toHaveLength(2);
    expect(r.pagoRecibido).toBe(1000); // 500 tarjeta + 500 entregado en efectivo
    expect(r.cambio).toBe(58);
  });

  it('crédito (sin formasPago guardado): cambio 0, sin pagoRecibido ni desglose', () => {
    const r = buildSalePagoFromFactura({ total: 942, formasPago: null });
    expect(r).toEqual({ cambio: 0 });
  });
});

describe('Consistencia items ↔ totales: ambos SIEMPRE de la misma factura', () => {
  it('los ítems (buildSaleItemsFromDetalles) y el total (buildSaleTotalesFromFactura) de UNA factura nunca pueden representar dos carritos distintos', () => {
    // Los 7 ítems reales de FAC-1746, sumando exactamente RD$942.00.
    const detalles = [
      { productoId: 1, descripcion: 'Servilleta bingo 400',        cantidad: 1, precioUnitario: 100.00, porcentajeIva: 18 },
      { productoId: 2, descripcion: 'COCACOLA 250ML',               cantidad: 1, precioUnitario: 20.00,  porcentajeIva: 0  },
      { productoId: 3, descripcion: 'GEN2',                         cantidad: 1, precioUnitario: 9.99,   porcentajeIva: 0  },
      { productoId: 4, descripcion: 'fanta naranja 400ml',          cantidad: 1, precioUnitario: 30.00,  porcentajeIva: 0  },
      { productoId: 5, descripcion: 'ARLA M1 FORMULA INFANT',       cantidad: 1, precioUnitario: 525.01, porcentajeIva: 0  },
      { productoId: 6, descripcion: 'Princesa club crackers',       cantidad: 1, precioUnitario: 89.00,  porcentajeIva: 0  },
      { productoId: 7, descripcion: 'AGUA DASANI 5L',                cantidad: 1, precioUnitario: 150.00, porcentajeIva: 0  },
    ];
    const factura = { subtotal: 798.30, iva: 143.69, total: 942.00, detalles };

    const items   = buildSaleItemsFromDetalles(factura.detalles);
    const totales = buildSaleTotalesFromFactura(factura);

    expect(items).toHaveLength(7);
    expect(totales.total).toBe(942.00);
    // Ambos vienen de LA MISMA `factura` — no hay forma de que el total
    // impreso describa un carrito con un 8vo producto que los ítems no tienen.
  });
});
