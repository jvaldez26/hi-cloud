import { describe, it, expect } from 'vitest';
import { calcularTotalesConDescuentoGeneral } from './descuentoGeneralCompra';

/**
 * Mismos casos que compras-descuento-general.spec.ts en el backend — este
 * util es el preview del pie de CompraFormInner.tsx mientras se teclea, así
 * que debe dar EXACTAMENTE los mismos números que el motor real al guardar.
 */
describe('calcularTotalesConDescuentoGeneral', () => {
  it('por PORCENTAJE, con líneas de distintas tasas de ITBIS: cada una conserva su propia tasa', () => {
    const r = calcularTotalesConDescuentoGeneral(
      [
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 16 },
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 0 },
      ],
      { tipo: 'porcentaje', valor: 10 },
    );

    expect(r.descuentoGeneral).toBeCloseTo(30);
    expect(r.subtotal).toBeCloseTo(270);
    expect(r.itbis).toBeCloseTo(16.2 + 14.4);
  });

  it('por MONTO FIJO: se topa al subtotal, nunca lo vuelve negativo', () => {
    const r = calcularTotalesConDescuentoGeneral(
      [{ cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 }],
      { tipo: 'monto', valor: 500 },
    );

    expect(r.descuentoGeneral).toBe(100);
    expect(r.subtotal).toBe(0);
    expect(r.itbis).toBe(0);
  });

  it('descuento de línea + descuento general combinados: el general se prorratea sobre lo que queda tras el de línea', () => {
    const r = calcularTotalesConDescuentoGeneral(
      [
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 18, descuentoMonto: 20 }, // neto línea: 80
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },                      // neto línea: 100
      ],
      { tipo: 'porcentaje', valor: 10 },
    );

    expect(r.subtotalBase).toBeCloseTo(180);
    expect(r.descuentoGeneral).toBeCloseTo(18);
    expect(r.subtotal).toBeCloseTo(162); // 180 - 18
  });

  it('sin descuento general: subtotalBase = subtotal, sin efecto (regresión)', () => {
    const r = calcularTotalesConDescuentoGeneral([
      { cantidad: 3, precioUnitario: 145, porcentajeItbis: 18 },
    ]);

    expect(r.descuentoGeneral).toBe(0);
    expect(r.subtotal).toBe(435);
    expect(r.itbis).toBeCloseTo(78.3);
  });
});
