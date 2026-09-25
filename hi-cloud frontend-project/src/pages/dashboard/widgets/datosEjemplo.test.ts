import { describe, it, expect } from 'vitest';
import {
  EJEMPLO_VENTAS_MENSUALES, EJEMPLO_GASTOS_MENSUALES, EJEMPLO_INGRESOS_GASTOS_ANUAL,
  EJEMPLO_VENTAS_TENDENCIA, EJEMPLO_RESUMEN_GASTOS_CATEGORIAS, EJEMPLO_RESUMEN_GASTOS_TOTAL,
  EJEMPLO_ANTIGUEDAD_COBRAR, EJEMPLO_ANTIGUEDAD_PAGAR, ejemploDetallePorDia,
} from './datosEjemplo';

/**
 * El pedido fue explícito: "una curva simple y consistente entre todos los
 * widgets... no números random por widget". Estas pruebas no verifican
 * cifras exactas (son de diseño, pueden ajustarse) — verifican que la
 * FORMA se mantiene: 12 meses, sumas que cuadran, nada negativo ni NaN.
 */

describe('datosEjemplo — coherencia del negocio ficticio', () => {
  it('12 meses de ventas y gastos, todos positivos', () => {
    expect(EJEMPLO_VENTAS_MENSUALES).toHaveLength(12);
    expect(EJEMPLO_GASTOS_MENSUALES).toHaveLength(12);
    expect(EJEMPLO_VENTAS_MENSUALES.every(v => v > 0)).toBe(true);
    expect(EJEMPLO_GASTOS_MENSUALES.every(v => v > 0)).toBe(true);
  });

  it('los gastos nunca superan las ventas del mismo mes (negocio rentable)', () => {
    EJEMPLO_VENTAS_MENSUALES.forEach((venta, i) => {
      expect(EJEMPLO_GASTOS_MENSUALES[i]).toBeLessThan(venta);
    });
  });

  it('Ingresos & Gastos anual usa la MISMA curva mensual que Ventas mensuales (tendencia)', () => {
    expect(EJEMPLO_INGRESOS_GASTOS_ANUAL.meses).toHaveLength(12);
    EJEMPLO_INGRESOS_GASTOS_ANUAL.meses.forEach((m, i) => {
      expect(m.ingresos).toBe(EJEMPLO_VENTAS_MENSUALES[i]);
      expect(EJEMPLO_VENTAS_TENDENCIA[i].total).toBe(EJEMPLO_VENTAS_MENSUALES[i]);
    });
  });

  it('Resumen de Gastos: el total es la suma real de sus categorías', () => {
    const suma = EJEMPLO_RESUMEN_GASTOS_CATEGORIAS.reduce((s, g) => s + g.monto, 0);
    expect(EJEMPLO_RESUMEN_GASTOS_TOTAL).toBe(suma);
  });

  it('Antigüedad: el total es la suma real de sus tramos (Cobrar y Pagar)', () => {
    const sumaCobrar = EJEMPLO_ANTIGUEDAD_COBRAR.corriente + EJEMPLO_ANTIGUEDAD_COBRAR.dias_0_30
      + EJEMPLO_ANTIGUEDAD_COBRAR.dias_31_60 + EJEMPLO_ANTIGUEDAD_COBRAR.dias_61_90 + EJEMPLO_ANTIGUEDAD_COBRAR.dias_90_plus;
    expect(EJEMPLO_ANTIGUEDAD_COBRAR.total).toBe(sumaCobrar);

    const sumaPagar = EJEMPLO_ANTIGUEDAD_PAGAR.corriente + EJEMPLO_ANTIGUEDAD_PAGAR.dias_0_30
      + EJEMPLO_ANTIGUEDAD_PAGAR.dias_31_60 + EJEMPLO_ANTIGUEDAD_PAGAR.dias_61_90 + EJEMPLO_ANTIGUEDAD_PAGAR.dias_90_plus;
    expect(EJEMPLO_ANTIGUEDAD_PAGAR.total).toBe(sumaPagar);
  });

  it('ejemploDetallePorDia: reparte el total del mes exacto entre los días que se le pidan (28-31)', () => {
    for (const dias of [28, 29, 30, 31]) {
      const detalle = ejemploDetallePorDia(60_000, dias);
      expect(detalle).toHaveLength(dias);
      const suma = detalle.reduce((s, d) => s + d.total, 0);
      // Redondeado a la decena por día — la suma puede desviarse unos pocos
      // pesos del total exacto, nunca desviarse por un mes entero de más o de menos.
      expect(Math.abs(suma - 60_000)).toBeLessThan(dias * 10);
      expect(detalle.every(d => d.total >= 0 && d.cantidad >= 1)).toBe(true);
    }
  });
});
