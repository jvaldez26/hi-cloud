/**
 * C3 / C4 — Aritmética de mora.
 *
 * El bug original redondeaba la TASA diaria a 2 decimales antes de multiplicarla
 * por el saldo:  Math.round(pct / 30 / 100 * 100) / 100
 *
 * Consecuencias, ambas cubiertas aquí:
 *   · tasa < 15 %/mes  → la tasa diaria se aplastaba a 0 → NO se cobraba mora.
 *   · tasa = 15 %/mes  → 0.005 se redondeaba a 0.01 → se cobraba el DOBLE.
 */

import {
  r2, tasaMoraDiaria, calcularMoraCuota, saldoMoraPendiente, sumarSaldoMoraPendiente,
} from './mora.util';

/** Fórmula anterior, para demostrar en el test qué se estaba corrigiendo. */
const moraDiariaVieja = (pct: number) => Math.round(pct / 30 / 100 * 100) / 100;

describe('C3 — la tasa diaria ya no se redondea', () => {
  it('las tasas usuales dejaban la mora en CERO con la fórmula vieja', () => {
    for (const pct of [1, 3, 5, 8, 10, 14]) {
      expect(moraDiariaVieja(pct)).toBe(0);          // el bug
      expect(tasaMoraDiaria(pct)).toBeGreaterThan(0); // corregido
    }
  });

  it('5 %/mes sobre 10,000 durante 10 días cobra 166.67 (antes: 0)', () => {
    // 10000 × (5/100/30) × 10 = 166.666… → 166.67
    expect(calcularMoraCuota(10000, 5, 10)).toBeCloseTo(166.67, 2);
    // con la fórmula vieja: 10000 × 0 × 10 = 0
    expect(r2(10000 * moraDiariaVieja(5) * 10)).toBe(0);
  });

  it('1 %/mes durante 30 días equivale a la tasa mensual completa', () => {
    // 10000 × (1/100/30) × 30 = 100 = 1 % de 10,000
    expect(calcularMoraCuota(10000, 1, 30)).toBeCloseTo(100, 2);
  });

  it('15 %/mes ya no cobra el doble', () => {
    // correcto: 10000 × (15/100/30) × 10 = 500
    expect(calcularMoraCuota(10000, 15, 10)).toBeCloseTo(500, 2);
    // el bug redondeaba 0.005 → 0.01 y cobraba 1000
    expect(r2(10000 * moraDiariaVieja(15) * 10)).toBe(1000);
  });

  it('30 %/mes coincide con la fórmula vieja (único caso que salía bien)', () => {
    expect(calcularMoraCuota(10000, 30, 10)).toBeCloseTo(1000, 2);
    expect(r2(10000 * moraDiariaVieja(30) * 10)).toBe(1000);
  });

  it('crece de forma lineal, redondeando UNA sola vez al final', () => {
    // Se redondea el total, no cada día: así no se acumula deriva de centavos.
    // Por eso 2 días (33.33) NO es 2 × el redondeo de 1 día (16.67 × 2 = 33.34).
    const exacto = (dias: number) => 10000 * (5 / 100 / 30) * dias;
    for (const dias of [1, 2, 7, 30, 365]) {
      expect(calcularMoraCuota(10000, 5, dias)).toBeCloseTo(exacto(dias), 2);
    }
    expect(calcularMoraCuota(10000, 5, 1)).toBe(16.67);
    expect(calcularMoraCuota(10000, 5, 2)).toBe(33.33);
  });

  it('a más días, más mora (nunca decrece)', () => {
    let previa = 0;
    for (let dias = 1; dias <= 60; dias++) {
      const actual = calcularMoraCuota(10000, 5, dias);
      expect(actual).toBeGreaterThanOrEqual(previa);
      previa = actual;
    }
  });

  it('el resultado siempre viene redondeado a 2 decimales', () => {
    for (const [base, pct, dias] of [[3333.33, 7, 13], [10000, 5, 10], [777.77, 2.5, 3]]) {
      const m = calcularMoraCuota(base, pct, dias);
      expect(m).toBe(r2(m));
      expect(String(m).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  describe('casos borde — nunca genera mora', () => {
    it.each([
      ['saldo 0',            0,      5,  10],
      ['saldo negativo',    -500,    5,  10],
      ['sin días de mora',   10000,  5,   0],
      ['días negativos',     10000,  5,  -3],
      ['tasa 0',             10000,  0,  10],
      ['tasa negativa',      10000, -5,  10],
    ])('%s', (_n, base, pct, dias) => {
      expect(calcularMoraCuota(base as number, pct as number, dias as number)).toBe(0);
    });

    it('tolera valores no numéricos sin devolver NaN', () => {
      expect(calcularMoraCuota(NaN, 5, 10)).toBe(0);
      expect(calcularMoraCuota(10000, NaN, 10)).toBe(0);
      expect(calcularMoraCuota(10000, 5, NaN)).toBe(0);
      expect(tasaMoraDiaria(undefined as any)).toBe(0);
    });

    it('acepta la tasa como string, que es como llega de Postgres', () => {
      expect(calcularMoraCuota(10000, '5' as any, 10)).toBeCloseTo(166.67, 2);
    });
  });
});

describe('C4 — el saldo de mora es NETO de lo cobrado', () => {
  it('descuenta lo ya pagado', () => {
    expect(saldoMoraPendiente(500, 200)).toBe(300);
  });

  it('una mora totalmente pagada deja saldo 0, no negativo', () => {
    expect(saldoMoraPendiente(500, 500)).toBe(0);
    expect(saldoMoraPendiente(500, 800)).toBe(0);
  });

  it('suma el pendiente de varias cuotas', () => {
    const cuotas = [
      { moraGenerada: 500, moraPagada: 500 },  // saldada
      { moraGenerada: 300, moraPagada: 100 },  // quedan 200
      { moraGenerada: 150, moraPagada: 0   },  // quedan 150
    ];
    expect(sumarSaldoMoraPendiente(cuotas)).toBe(350);
  });

  it('acepta los valores como string (Postgres devuelve numeric como texto)', () => {
    expect(sumarSaldoMoraPendiente([{ moraGenerada: '300.50', moraPagada: '100.25' }])).toBe(200.25);
  });

  it('sin cuotas, el saldo es 0', () => {
    expect(sumarSaldoMoraPendiente([])).toBe(0);
  });

  it('el saldo BRUTO (el del bug) es mayor que el neto cuando hubo cobro', () => {
    const cuotas = [{ moraGenerada: 500, moraPagada: 500 }, { moraGenerada: 300, moraPagada: 100 }];
    const bruto = cuotas.reduce((a, c) => a + c.moraGenerada, 0);  // 800 ← lo que fijaba el cron
    const neto  = sumarSaldoMoraPendiente(cuotas);                 // 200 ← lo correcto
    expect(bruto).toBe(800);
    expect(neto).toBe(200);
    expect(neto).toBeLessThan(bruto);
  });
});
