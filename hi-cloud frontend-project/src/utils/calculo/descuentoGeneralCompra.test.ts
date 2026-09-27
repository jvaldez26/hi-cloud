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

  describe('aplicarSobre = "total"', () => {
    it('UNA sola tasa: el total baja EXACTAMENTE el monto ingresado', () => {
      const r = calcularTotalesConDescuentoGeneral(
        [
          { cantidad: 2, precioUnitario: 300, porcentajeItbis: 18 },
          { cantidad: 1, precioUnitario: 400, porcentajeItbis: 18 },
        ],
        { tipo: 'monto', valor: 118, aplicarSobre: 'total' },
      );
      // totalPre = 1000 × 1.18 = 1180 → objetivo = 1062
      expect(r.total).toBe(1062);
    });

    it('tasas MIXTAS: la suma de líneas cuadra exacto con el total, sin residuo', () => {
      const r = calcularTotalesConDescuentoGeneral(
        [
          { cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
          { cantidad: 1, precioUnitario: 100, porcentajeItbis: 16 },
          { cantidad: 1, precioUnitario: 100, porcentajeItbis: 0 },
        ],
        { tipo: 'monto', valor: 50, aplicarSobre: 'total' },
      );
      // totalPre = 118+116+100 = 334 → objetivo 284
      expect(r.total).toBe(284);
      const sumaLineas = Math.round(r.lineas.reduce((s, l) => s + l.subtotal + l.itbis, 0) * 100) / 100;
      expect(sumaLineas).toBe(284);
    });

    it('modo "subtotal" explícito da lo mismo que sin aplicarSobre (regresión)', () => {
      const lineas = [
        { cantidad: 2, precioUnitario: 150, porcentajeItbis: 18, descuentoMonto: 20 },
        { cantidad: 1, precioUnitario: 200, porcentajeItbis: 16 },
      ];
      const sinAplicarSobre = calcularTotalesConDescuentoGeneral(lineas, { tipo: 'porcentaje', valor: 10 });
      const conSubtotal = calcularTotalesConDescuentoGeneral(lineas, { tipo: 'porcentaje', valor: 10, aplicarSobre: 'subtotal' });
      expect(conSubtotal).toEqual(sinAplicarSobre);
    });

    it('cambiar de modo entre llamadas no arrastra cálculo anterior', () => {
      const lineas = [
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 18 },
        { cantidad: 1, precioUnitario: 100, porcentajeItbis: 0 },
      ];
      const porSubtotal = calcularTotalesConDescuentoGeneral(lineas, { tipo: 'monto', valor: 50, aplicarSobre: 'subtotal' });
      const porTotal     = calcularTotalesConDescuentoGeneral(lineas, { tipo: 'monto', valor: 50, aplicarSobre: 'total' });
      expect(porTotal.total).not.toBe(porSubtotal.total);
      const porSubtotalOtraVez = calcularTotalesConDescuentoGeneral(lineas, { tipo: 'monto', valor: 50, aplicarSobre: 'subtotal' });
      expect(porSubtotalOtraVez).toEqual(porSubtotal);
    });
  });
});
