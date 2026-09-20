/**
 * calcularRecargosIntereses() — función pura, sin BD. Casos dorados
 * obligatorios del Commit 2 de Herramientas Fiscales.
 */
import { calcularRecargosIntereses, ParametrosRecargosIntereses, TramoParametro, ValorRecargoMora } from './recargos-intereses.calculo';
import { ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

const TRAMO_RECARGO_VIEJO: TramoParametro<ValorRecargoMora> = {
  valor: { primerMes: 10, mesesSiguientes: 4, tope: null },
  vigenciaDesde: '2000-01-01', vigenciaHasta: '2026-06-30', estado: 'VALIDADO',
};
const TRAMO_RECARGO_NUEVO: TramoParametro<ValorRecargoMora> = {
  valor: { porMes: 3, topePct: 100 },
  vigenciaDesde: '2026-07-01', vigenciaHasta: null, estado: 'VALIDADO',
};
const TRAMO_INTERES_CERO: TramoParametro<number> = {
  valor: 0, vigenciaDesde: '2000-01-01', vigenciaHasta: null, estado: 'VALIDADO',
};
const TRAMO_MODO_SIMPLE: TramoParametro<{ modo: 'simple' | 'acumulativo' }> = {
  valor: { modo: 'simple' }, vigenciaDesde: '2000-01-01', vigenciaHasta: null, estado: 'VALIDADO',
};
const TRAMO_DESCUENTO: TramoParametro<Record<string, number>> = {
  valor: { rectificacionVoluntaria: 90, aceptaEnAuditoria: 70, pagoTras30diasResolucion: 50, desisteRecurso: 30 },
  vigenciaDesde: '2026-06-18', vigenciaHasta: null, estado: 'VALIDADO',
};

const BASE_PARAMS: ParametrosRecargosIntereses = {
  tramosRecargoMora: [TRAMO_RECARGO_VIEJO, TRAMO_RECARGO_NUEVO],
  tramosInteres: [TRAMO_INTERES_CERO],
  tramoModoInteres: TRAMO_MODO_SIMPLE,
  tramoDescuentoProntoPago: TRAMO_DESCUENTO,
  tramoAmnistia: { valor: { topeMesesRecargoInteres: 12, vigenteHasta: '2026-12-31' }, vigenciaDesde: '2026-06-18', vigenciaHasta: '2026-12-31', estado: 'VALIDADO' },
};

describe('calcularRecargosIntereses() — casos dorados', () => {
  it('ITBIS RD$100,000, vence 20-ago-2026, paga 20-nov-2026 → 3 meses × 3% = RD$9,000 de recargo', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-11-20', situacion: 'normal', acogeAmnistia: false },
      BASE_PARAMS,
    );
    expect(r.mesesMora).toBe(3);
    expect(r.recargoBruto).toBe(9000);
    expect(r.recargoNeto).toBe(9000);
    expect(r.total).toBe(109_000);
  });

  it('el mismo caso con rectificación voluntaria → descuento 90%, recargo neto RD$900', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-11-20', situacion: 'rectificacionVoluntaria', acogeAmnistia: false },
      BASE_PARAMS,
    );
    expect(r.recargoBruto).toBe(9000);
    expect(r.descuentoPct).toBe(90);
    expect(r.descuentoMonto).toBe(8100);
    expect(r.recargoNeto).toBe(900);
  });

  it('deuda que cruza el 1-jul-2026: tramos mixtos (regla vieja + nueva) en el mismo cálculo', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-04-15', fechaPago: '2026-08-15', situacion: 'normal', acogeAmnistia: false },
      BASE_PARAMS,
    );
    expect(r.mesesMora).toBe(4);
    // mes1 (16-abr, vieja, primerMes 10%) + mes2 (16-may, vieja, 4%) + mes3 (16-jun, vieja, 4%) + mes4 (16-jul, nueva, 3%)
    expect(r.desglosePorMes.map(m => m.reglaRecargo)).toEqual(['vieja', 'vieja', 'vieja', 'nueva']);
    expect(r.desglosePorMes.map(m => m.pctRecargoMes)).toEqual([10, 4, 4, 3]);
    expect(r.recargoBruto).toBe(21_000); // 21% de 100,000
    expect(r.avisos.some(a => a.includes('transición'))).toBe(true);
  });

  it('recargo que toca el tope del 100% (regla nueva): se limita al monto adeudado', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 50_000, fechaLimite: '2026-07-05', fechaPago: '2030-01-06', situacion: 'normal', acogeAmnistia: false },
      BASE_PARAMS,
    );
    expect(r.mesesMora).toBeGreaterThan(33); // más de 33 meses × 3% ya supera 100%
    expect(r.recargoBruto).toBe(50_000);     // exactamente el tope: 100% del monto
    expect(r.avisos.some(a => a.includes('tope'))).toBe(true);
  });

  it('parámetro recargo_mora PENDIENTE_VALIDACION en la fecha: error controlado, nunca NaN', () => {
    const params: ParametrosRecargosIntereses = {
      ...BASE_PARAMS,
      tramosRecargoMora: [{ valor: null, vigenciaDesde: '2026-07-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' }],
    };
    expect(() => calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-11-20', situacion: 'normal', acogeAmnistia: false },
      params,
    )).toThrow(ParametroFiscalPendienteError);
  });
});

describe('calcularRecargosIntereses() — otros casos', () => {
  it('pagado dentro del plazo: sin recargo ni interés', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-08-20', situacion: 'normal', acogeAmnistia: false },
      BASE_PARAMS,
    );
    expect(r.mesesMora).toBe(0);
    expect(r.recargoBruto).toBe(0);
    expect(r.total).toBe(100_000);
  });

  it('interés modo simple: suma directa de la tasa mensual por cada mes de mora', () => {
    const params: ParametrosRecargosIntereses = {
      ...BASE_PARAMS,
      tramosInteres: [{ valor: 1.10, vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-12-31', estado: 'VALIDADO' }],
    };
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-11-20', situacion: 'normal', acogeAmnistia: false },
      params,
    );
    // 3 meses × 1.10% = 3.30% de 100,000 = 3,300
    expect(r.interes).toBe(3300);
  });

  it('interés modo acumulativo: compone mes sobre mes en vez de sumar', () => {
    const params: ParametrosRecargosIntereses = {
      ...BASE_PARAMS,
      tramoModoInteres: { valor: { modo: 'acumulativo' }, vigenciaDesde: '2000-01-01', vigenciaHasta: null, estado: 'VALIDADO' },
      tramosInteres: [{ valor: 1.10, vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-12-31', estado: 'VALIDADO' }],
    };
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2026-08-20', fechaPago: '2026-11-20', situacion: 'normal', acogeAmnistia: false },
      params,
    );
    // (1.011^3 - 1) × 100,000 ≈ 3,336.43 — más que el simple (3,300), porque compone
    expect(r.interes).toBeGreaterThan(3300);
    expect(r.interes).toBeCloseTo(3336.43, 1);
  });

  it('amnistía: limita recargo e interés a los primeros 12 meses de mora', () => {
    const r = calcularRecargosIntereses(
      { montoAdeudado: 100_000, fechaLimite: '2025-06-01', fechaPago: '2026-12-31', situacion: 'normal', acogeAmnistia: true },
      BASE_PARAMS,
    );
    const mesesCobrados = r.desglosePorMes.filter(m => !m.excluidoPorAmnistia);
    expect(mesesCobrados).toHaveLength(12);
    expect(r.mesesMora).toBeGreaterThan(12); // la mora real sigue siendo más larga
  });
});
