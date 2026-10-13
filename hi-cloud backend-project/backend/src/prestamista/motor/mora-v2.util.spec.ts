/**
 * Motor financiero — Etapa 2, Fase 2A. Ver docs/prestamista/motor-financiero.md §6, §9.1 caso 14.
 */
import { calcularMora, tasaDiariaMora } from './mora-v2.util';

const CUOTA = { capitalPendiente: 8000, interesPendiente: 1456, diasDeAtraso: 15 };

describe('tasaDiariaMora (§6)', () => {
  it('base 360: tasa mensual ÷ 30 (igual que Etapa 1)', () => {
    expect(tasaDiariaMora(5, 360).toNumber()).toBeCloseTo(5 / 100 / 30, 10);
  });
  it('base 365: tasa mensual × 12 ÷ 365 (ACT/365), NO los días del mes en curso', () => {
    expect(tasaDiariaMora(5, 365).toNumber()).toBeCloseTo((5 / 100) * 12 / 365, 10);
  });
});

describe('calcularMora — las 3 bases', () => {
  it('capital_vencido: solo sobre capitalPendiente (8000 × 0.025 = 200.00)', () => {
    const mora = calcularMora({ base: 'capital_vencido', tasaOMonto: 5, baseDiasMora: 360 }, CUOTA);
    expect(mora).toBe(200);
  });

  it('cuota_vencida: sobre capital+interés (9456 × 0.025 = 236.40) — mismo caso que Etapa 1', () => {
    const mora = calcularMora({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360 }, CUOTA);
    expect(mora).toBe(236.4);
  });

  it('cuota_vencida con base 365: 9456 × (5%×12/365) × 15 = 233.16 (distinto de la base 360)', () => {
    const mora = calcularMora({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 365 }, CUOTA);
    expect(mora).toBe(233.16);
    expect(mora).not.toBe(236.4);
  });

  it('monto_fijo por día: 50 × 15 días = 750', () => {
    const mora = calcularMora({ base: 'monto_fijo', tasaOMonto: 50, periodoMontoFijo: 'dia', baseDiasMora: 360 }, CUOTA);
    expect(mora).toBe(750);
  });

  it('monto_fijo por cuota: 50 una sola vez, sin importar los días', () => {
    const mora = calcularMora({ base: 'monto_fijo', tasaOMonto: 50, periodoMontoFijo: 'cuota', baseDiasMora: 360 }, { ...CUOTA, diasDeAtraso: 40 });
    expect(mora).toBe(50);
  });

  it('monto_fijo por cuota: 0 si no hay atraso', () => {
    const mora = calcularMora({ base: 'monto_fijo', tasaOMonto: 50, periodoMontoFijo: 'cuota', baseDiasMora: 360 }, { ...CUOTA, diasDeAtraso: 0 });
    expect(mora).toBe(0);
  });
});

describe('calcularMora — tope', () => {
  it('tope por monto: la mora cruda (236.40) se recorta a 100', () => {
    const mora = calcularMora({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360, topeMora: { tipo: 'monto', valor: 100 } }, CUOTA);
    expect(mora).toBe(100);
  });

  it('tope por % del saldo de la cuota: 2% de 9456 = 189.12', () => {
    const mora = calcularMora({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360, topeMora: { tipo: 'porcentaje_saldo', valor: 2 } }, CUOTA);
    expect(mora).toBe(189.12);
  });

  it('si la mora cruda no supera el tope, no se recorta', () => {
    const mora = calcularMora({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360, topeMora: { tipo: 'monto', valor: 1000 } }, CUOTA);
    expect(mora).toBe(236.4);
  });
});
