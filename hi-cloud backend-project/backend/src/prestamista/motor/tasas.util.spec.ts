/**
 * Motor financiero — Etapa 2, Fase 2A. Ver docs/prestamista/motor-financiero.md §2, §9.1 caso 10.
 */
import { tasaPeriodoPagoRegular, tasaDiaria, resumenTasaParaMostrar, periodosPorAnioRegular } from './tasas.util';

describe('tasaPeriodoPagoRegular — nominal (§2.2)', () => {
  it('mismo período expresado y de pago: identidad', () => {
    const i = tasaPeriodoPagoRegular({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, 'mensual');
    expect(i.toNumber()).toBeCloseTo(0.03, 10);
  });

  it('mensual → semanal: tasaAnualNominal=0.36, ÷52', () => {
    const i = tasaPeriodoPagoRegular({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, 'semanal');
    expect(i.toNumber()).toBeCloseTo(0.36 / 52, 10);
  });

  it('anual → mensual: tasaAnualNominal=0.36, ÷12 = 0.03', () => {
    const i = tasaPeriodoPagoRegular({ valor: 0.36, periodoExpresado: 'anual', tipo: 'nominal', baseDias: 360 }, 'mensual');
    expect(i.toNumber()).toBeCloseTo(0.03, 10);
  });
});

describe('tasaPeriodoPagoRegular — efectiva (§2.2)', () => {
  it('mismo período expresado y de pago: round-trip exacto (anualiza y vuelve a desanualizar)', () => {
    const i = tasaPeriodoPagoRegular({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'efectiva', baseDias: 360 }, 'mensual');
    expect(i.toNumber()).toBeCloseTo(0.03, 9);
  });

  it('3% efectivo mensual → anual efectiva = 1.03^12 − 1 ≈ 42.576%', () => {
    // Verificación manual: (1.03)^12 = 1.42576088685...
    const i = tasaPeriodoPagoRegular({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'efectiva', baseDias: 360 }, 'anual');
    expect(i.toNumber()).toBeCloseTo(0.4257608869, 8);
  });
});

describe('tasaDiaria (§2.4)', () => {
  it('3% nominal mensual, base 360 → tasaAnualNominal=0.36, ÷360 = 0.001', () => {
    const t = tasaDiaria({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 });
    expect(t.toNumber()).toBeCloseTo(0.001, 10);
  });

  it('36% nominal anual, base 365 → ÷365', () => {
    const t = tasaDiaria({ valor: 0.36, periodoExpresado: 'anual', tipo: 'nominal', baseDias: 365 });
    expect(t.toNumber()).toBeCloseTo(0.36 / 365, 10);
  });

  it('3% efectivo mensual, base 365 → vía anual efectiva (1.03^12−1), luego raíz 365', () => {
    const t = tasaDiaria({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'efectiva', baseDias: 365 });
    const anualEfectiva = Math.pow(1.03, 12) - 1;
    const esperado = Math.pow(1 + anualEfectiva, 1 / 365) - 1;
    expect(t.toNumber()).toBeCloseTo(esperado, 9);
  });
});

describe('resumenTasaParaMostrar (§2.3)', () => {
  it('tasaAnualNominal y TEA correctas a partir de la tasa por período', () => {
    const i = tasaPeriodoPagoRegular({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, 'mensual');
    const r = resumenTasaParaMostrar(i, periodosPorAnioRegular('mensual'));
    expect(r.tasaEquivalentePorPeriodo).toBeCloseTo(0.03, 10);
    expect(r.tasaAnualNominal).toBeCloseTo(0.36, 10);
    expect(r.tea).toBeCloseTo(Math.pow(1.03, 12) - 1, 8);
  });
});
