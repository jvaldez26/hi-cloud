import { describe, it, expect } from 'vitest';
import {
  round4,
  descuentoFinalABase,
  descuentoBaseAFinal,
  pctIvaEfectivo,
} from './descuentoItbis';

/**
 * `descuentoItbis` es la conversión ÚNICA entre el descuento que TECLEA el
 * cajero (pesos finales, c/ITBIS) y el que se GUARDA (base imponible).
 *
 * Se prueba primero porque es la pieza con más historial: aquí se decide si el
 * cliente paga exactamente lo pactado. El caso que le da sentido a todo el
 * archivo es el del comentario: teclear "10" sobre un producto de RD$200
 * c/ITBIS tiene que dejar el total en RD$190,00 exactos, ni 189,99 ni 190,01.
 */

describe('round4', () => {
  it('redondea a 4 decimales, que es como se guardan los descuentos', () => {
    expect(round4(8.474576271)).toBe(8.4746);
    expect(round4(10)).toBe(10);
  });

  it('convierte lo que no es número en 0 en vez de propagar NaN', () => {
    // Un NaN aquí acaba en la base como NULL o como 0 sin que nadie se entere
    expect(round4(NaN)).toBe(0);
    expect(round4(undefined as any)).toBe(0);
    expect(round4(null as any)).toBe(0);
    expect(round4('' as any)).toBe(0);
  });

  it('acepta el número en texto, que es como llega de un input', () => {
    expect(round4('12.34567' as any)).toBe(12.3457);
  });
});

describe('descuentoFinalABase — lo que teclea el cajero → base imponible', () => {
  it('el caso del comentario: RD$10 sobre 18% se guardan como 8,4746', () => {
    expect(descuentoFinalABase(10, 0.18)).toBe(8.4746);
  });

  it('con precioIncluyeItbis NO convierte: el precio ya está en esa unidad', () => {
    expect(descuentoFinalABase(10, 0.18, true)).toBe(10);
  });

  it('sin ITBIS no hay nada que convertir', () => {
    expect(descuentoFinalABase(10, 0)).toBe(10);
    // E44 (Zona Franca) llega justo así: pctIva = 0
    expect(descuentoFinalABase(250, 0)).toBe(250);
  });

  it('nunca devuelve un descuento negativo', () => {
    // Un negativo aquí AUMENTA el total de la factura en vez de bajarlo
    expect(descuentoFinalABase(-50, 0.18)).toBe(0);
  });

  it('tolera basura sin romper el total', () => {
    expect(descuentoFinalABase(NaN, 0.18)).toBe(0);
    expect(descuentoFinalABase(undefined as any, 0.18)).toBe(0);
  });
});

describe('descuentoBaseAFinal — base imponible → lo que ve el cajero', () => {
  it('deshace la conversión: 8,4746 en base son los 10 pesos pactados', () => {
    expect(descuentoBaseAFinal(8.4746, 0.18)).toBe(10);
  });

  it('con precioIncluyeItbis tampoco convierte', () => {
    expect(descuentoBaseAFinal(10, 0.18, true)).toBe(10);
  });

  it('nunca devuelve negativo', () => {
    expect(descuentoBaseAFinal(-50, 0.18)).toBe(0);
  });
});

describe('ida y vuelta', () => {
  it('teclear N pesos y volver a mostrarlos da N, a 2 decimales', () => {
    // Es la propiedad que de verdad importa: lo que el cajero teclea es lo que
    // el recibo enseña, aunque por dentro se guarde otra cosa.
    for (const pct of [0, 0.16, 0.18]) {
      for (const v of [1, 10, 10.5, 99.99, 250, 1234.56, 7500]) {
        const base = descuentoFinalABase(v, pct);
        expect(descuentoBaseAFinal(base, pct)).toBeCloseTo(v, 2);
      }
    }
  });

  it('y también con precioIncluyeItbis encendido', () => {
    for (const v of [1, 10, 99.99, 1234.56]) {
      const base = descuentoFinalABase(v, 0.18, true);
      expect(descuentoBaseAFinal(base, 0.18, true)).toBeCloseTo(v, 2);
    }
  });
});

describe('pctIvaEfectivo — la tasa del carrito, no la de un producto', () => {
  it('con una sola tasa devuelve esa tasa', () => {
    expect(pctIvaEfectivo(1000, 180)).toBeCloseTo(0.18, 10);
  });

  it('con mezcla de tasas devuelve la ponderada', () => {
    // 1000 al 18% + 1000 exento → ITBIS 180 sobre base 2000 = 9%
    expect(pctIvaEfectivo(2000, 180)).toBeCloseTo(0.09, 10);
  });

  it('carrito vacío o exento entero: 0, sin dividir entre cero', () => {
    expect(pctIvaEfectivo(0, 0)).toBe(0);
    expect(pctIvaEfectivo(1000, 0)).toBe(0);
  });

  it('sirve para que el total baje EXACTAMENTE lo tecleado con tasas mezcladas', () => {
    // Es la razón de ser de la función: el descuento global no pertenece a un
    // producto, así que se usa la tasa efectiva del carrito completo.
    const subtotal = 2000, iva = 180;              // 1000 al 18% + 1000 exento
    const pct   = pctIvaEfectivo(subtotal, iva);
    const base  = descuentoFinalABase(500, pct);   // el cajero teclea 500 finales
    const bajaElTotal = base * (1 + pct);
    expect(bajaElTotal).toBeCloseTo(500, 2);
  });
});
