import {
  calcularItbis, calcularIsrPj, calcularIsrAsalariados, calcularIsrPf,
  calcularRetencionIR17, calcularDividendos, TramoParametro,
  ValorIsrPj, ValorEscalaIsrPf,
} from './impuestos-a-pagar.calculo';
import { ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

describe('calcularItbis()', () => {
  it('débito > crédito+retenciones+saldo a favor: hay que pagar la diferencia', () => {
    const r = calcularItbis({ fecha: '2026-09-01', debitoFiscal: 50_000, creditoFiscal: 20_000, retencionesSufridas: 5_000, saldoAFavorAnterior: 0 });
    expect(r.itbisAPagar).toBe(25_000);
    expect(r.saldoAFavorNuevo).toBe(0);
  });

  it('crédito+retenciones+saldo a favor > débito: queda saldo a favor, nada que pagar', () => {
    const r = calcularItbis({ fecha: '2026-09-01', debitoFiscal: 10_000, creditoFiscal: 20_000, retencionesSufridas: 0, saldoAFavorAnterior: 0 });
    expect(r.itbisAPagar).toBe(0);
    expect(r.saldoAFavorNuevo).toBe(10_000);
  });
});

describe('calcularIsrPj()', () => {
  const TRAMO: TramoParametro<ValorIsrPj> = {
    valor: { general: 27, transitorio: { tasa: 30, umbralIngresos: 1_000_000_000, desde: 2026, hasta: 2028 } },
    vigenciaDesde: '2015-01-01', vigenciaHasta: null, estado: 'VALIDADO',
  };

  it('bajo el umbral: régimen general 27%', () => {
    const r = calcularIsrPj({ anio: 2026, rentaNetaImponible: 1_000_000, ingresosTotales: 5_000_000, anticipos: 0, retenciones: 0, saldoAFavorAnterior: 0 }, TRAMO);
    expect(r.regimen).toBe('general');
    expect(r.tasaAplicada).toBe(27);
    expect(r.impuestoBruto).toBe(270_000);
    expect(r.isrAPagar).toBe(270_000);
  });

  it('sobre el umbral y dentro del rango de años: régimen transitorio 30%', () => {
    const r = calcularIsrPj({ anio: 2027, rentaNetaImponible: 1_000_000, ingresosTotales: 2_000_000_000, anticipos: 0, retenciones: 0, saldoAFavorAnterior: 0 }, TRAMO);
    expect(r.regimen).toBe('transitorio');
    expect(r.tasaAplicada).toBe(30);
    expect(r.impuestoBruto).toBe(300_000);
  });

  it('resta anticipos/retenciones/saldo a favor — puede dar saldo a favor nuevo', () => {
    const r = calcularIsrPj({ anio: 2026, rentaNetaImponible: 1_000_000, ingresosTotales: 5_000_000, anticipos: 300_000, retenciones: 0, saldoAFavorAnterior: 0 }, TRAMO);
    expect(r.isrAPagar).toBe(0);
    expect(r.saldoAFavorNuevo).toBe(30_000); // pagó 300k de anticipo contra 270k de impuesto
  });

  it('parámetro isr_pj pendiente: error controlado', () => {
    const pendiente: TramoParametro<ValorIsrPj> = { valor: null, vigenciaDesde: '2015-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' };
    expect(() => calcularIsrPj({ anio: 2026, rentaNetaImponible: 1_000_000, ingresosTotales: 1, anticipos: 0, retenciones: 0, saldoAFavorAnterior: 0 }, pendiente))
      .toThrow(ParametroFiscalPendienteError);
  });
});

const ESCALA_2026: TramoParametro<ValorEscalaIsrPf> = {
  valor: {
    exento: 416_220,
    tramos: [
      { limiteSuperior: 624_329,  tasa: 15, excesoSobre: 416_220, acumuladoFijo: 0 },
      { limiteSuperior: 867_123,  tasa: 20, excesoSobre: 624_329, acumuladoFijo: 31_216.20 },
      { limiteSuperior: null,     tasa: 25, excesoSobre: 867_123, acumuladoFijo: 79_776.60 },
    ],
  },
  vigenciaDesde: '2026-01-01', vigenciaHasta: '2026-12-31', estado: 'VALIDADO',
};

describe('calcularIsrAsalariados()', () => {
  it('renta bajo el exento: ISR cero', () => {
    const r = calcularIsrAsalariados({ anio: 2026, periodo: 'anual', rentaNetaGravable: 300_000 }, ESCALA_2026);
    expect(r.isrAnual).toBe(0);
    expect(r.tramo).toBe('Exento');
  });

  it('renta en el segundo tramo (20%): aplica exceso + acumulado fijo', () => {
    // 700,000 anual -> tramo 20%: (700,000 - 624,329) * 20% + 31,216.20 = 15,134.2 + 31,216.20 = 46,350.40
    const r = calcularIsrAsalariados({ anio: 2026, periodo: 'anual', rentaNetaGravable: 700_000 }, ESCALA_2026);
    expect(r.isrAnual).toBe(46_350.40);
  });

  it('periodo mensual: anualiza el salario ×12 y devuelve el ISR del mes (÷12)', () => {
    // 58,333.33/mes × 12 ≈ 700,000 anual -> mismo ISR anual que el caso anterior, dividido entre 12
    const r = calcularIsrAsalariados({ anio: 2026, periodo: 'mensual', rentaNetaGravable: 58_333.33 }, ESCALA_2026);
    expect(r.rentaNetaAnual).toBeCloseTo(699_999.96, 1);
    expect(r.isrDelPeriodo).toBeGreaterThan(3_800);
    expect(r.isrDelPeriodo).toBeLessThan(3_900);
  });

  it('escala_isr_pf pendiente (2027, límites no confirmados): error controlado', () => {
    const pendiente2027: TramoParametro<ValorEscalaIsrPf> = { valor: null, vigenciaDesde: '2027-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' };
    expect(() => calcularIsrAsalariados({ anio: 2027, periodo: 'anual', rentaNetaGravable: 600_000 }, pendiente2027))
      .toThrow(ParametroFiscalPendienteError);
  });
});

describe('calcularIsrPf() — IR-1', () => {
  it('misma escala que asalariados, resta retenciones y anticipos', () => {
    const r = calcularIsrPf({ anio: 2026, rentaNetaImponibleAnual: 700_000, retenciones: 10_000, anticipos: 0 }, ESCALA_2026);
    expect(r.isrAnual).toBe(46_350.40);
    expect(r.isrAPagar).toBe(36_350.40);
  });
});

describe('calcularRetencionIR17()', () => {
  const TABLA: TramoParametro<Record<string, number>> = {
    valor: { alquileres: 10, honorarios: 10 },
    vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'VALIDADO',
  };

  it('aplica la tasa del concepto', () => {
    const r = calcularRetencionIR17({ fecha: '2026-09-01', concepto: 'alquileres', montoBruto: 50_000 }, TABLA);
    expect(r.montoRetenido).toBe(5_000);
    expect(r.montoNeto).toBe(45_000);
  });

  it('concepto que no está en la tabla vigente: error, no un valor inventado', () => {
    expect(() => calcularRetencionIR17({ fecha: '2026-09-01', concepto: 'dividendos', montoBruto: 1_000 }, TABLA))
      .toThrow(/no está en la tabla/);
  });

  it('sin parámetro real (retenciones_ir17 sigue PENDIENTE en el seed): error controlado', () => {
    const pendiente: TramoParametro<Record<string, number>> = { valor: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' };
    expect(() => calcularRetencionIR17({ fecha: '2026-09-01', concepto: 'alquileres', montoBruto: 1_000 }, pendiente))
      .toThrow(ParametroFiscalPendienteError);
  });
});

describe('calcularDividendos()', () => {
  it('sin parámetro real (isr_dividendos sigue PENDIENTE en el seed): error controlado', () => {
    const pendiente: TramoParametro<{ tasa: number }> = { valor: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' };
    expect(() => calcularDividendos({ fecha: '2026-09-01', montoDistribuido: 100_000 }, pendiente))
      .toThrow(ParametroFiscalPendienteError);
  });

  it('con un parámetro validado (hipotético, para probar la aritmética): retiene la tasa dada', () => {
    const tramo: TramoParametro<{ tasa: number }> = { valor: { tasa: 10 }, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'VALIDADO' };
    const r = calcularDividendos({ fecha: '2026-09-01', montoDistribuido: 100_000 }, tramo);
    expect(r.isrRetenido).toBe(10_000);
    expect(r.montoNeto).toBe(90_000);
  });
});
