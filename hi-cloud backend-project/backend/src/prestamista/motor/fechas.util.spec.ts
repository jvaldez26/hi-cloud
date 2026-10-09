/**
 * Motor financiero — Etapa 2, Fase 2A. Ver docs/prestamista/motor-financiero.md §1, §9.3.
 */
import { generarFechas, diasReales } from './fechas.util';

describe('generarFechas — frecuencias regulares', () => {
  it('semanal: +7 días cada una', () => {
    const fechas = generarFechas({ frecuencia: 'semanal', fechaPrimerPago: '2026-10-09', n: 4 });
    expect(fechas).toEqual(['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
  });

  it('quincenal cada_15_dias: +15 días cada una', () => {
    const fechas = generarFechas({ frecuencia: 'quincenal', fechaPrimerPago: '2026-10-01', n: 3, quincenal: { modo: 'cada_15_dias' } });
    expect(fechas).toEqual(['2026-10-01', '2026-10-16', '2026-10-31']);
  });

  it('quincenal dias_fijos: alterna 15 y último día del mes, desde la primera fecha ≥ fechaPrimerPago', () => {
    const fechas = generarFechas({ frecuencia: 'quincenal', fechaPrimerPago: '2026-10-05', n: 4, quincenal: { modo: 'dias_fijos' } });
    expect(fechas).toEqual(['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
  });

  it('quincenal dias_fijos: cruza diciembre→enero correctamente', () => {
    const fechas = generarFechas({ frecuencia: 'quincenal', fechaPrimerPago: '2026-12-20', n: 2, quincenal: { modo: 'dias_fijos' } });
    expect(fechas).toEqual(['2026-12-31', '2027-01-15']);
  });

  it('quincenal dias_fijos: si fechaPrimerPago es exactamente el 15, esa es la primera', () => {
    const fechas = generarFechas({ frecuencia: 'quincenal', fechaPrimerPago: '2026-10-15', n: 2, quincenal: { modo: 'dias_fijos' } });
    expect(fechas).toEqual(['2026-10-15', '2026-10-31']);
  });

  it('mensual: mismo día, un mes después', () => {
    const fechas = generarFechas({ frecuencia: 'mensual', fechaPrimerPago: '2026-10-05', n: 3 });
    expect(fechas).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
  });

  it('mensual con día 31: febrero cae 28 (no bisiesto), abril cae 30, marzo vuelve a 31 (sin arrastrar el recorte)', () => {
    const fechas = generarFechas({ frecuencia: 'mensual', fechaPrimerPago: '2026-01-31', n: 4 });
    expect(fechas).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('mensual con día 31, año bisiesto: febrero cae 29', () => {
    const fechas = generarFechas({ frecuencia: 'mensual', fechaPrimerPago: '2028-01-31', n: 2 });
    expect(fechas).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('bimestral/trimestral/semestral/anual: paso correcto en meses', () => {
    expect(generarFechas({ frecuencia: 'bimestral', fechaPrimerPago: '2026-01-15', n: 2 })).toEqual(['2026-01-15', '2026-03-15']);
    expect(generarFechas({ frecuencia: 'trimestral', fechaPrimerPago: '2026-01-15', n: 2 })).toEqual(['2026-01-15', '2026-04-15']);
    expect(generarFechas({ frecuencia: 'semestral', fechaPrimerPago: '2026-01-15', n: 2 })).toEqual(['2026-01-15', '2026-07-15']);
    expect(generarFechas({ frecuencia: 'anual', fechaPrimerPago: '2026-01-15', n: 2 })).toEqual(['2026-01-15', '2027-01-15']);
  });
});

describe('generarFechas — único y personalizado', () => {
  it('único: una sola fecha, la dada', () => {
    expect(generarFechas({ frecuencia: 'unico', fechaPrimerPago: '2026-12-01', n: 1 })).toEqual(['2026-12-01']);
  });

  it('personalizado: usa las fechas dadas tal cual', () => {
    const fechasPersonalizadas = ['2026-10-05', '2026-11-20', '2027-02-01'];
    expect(generarFechas({ frecuencia: 'personalizado', fechaPrimerPago: '2026-10-05', n: 3, fechasPersonalizadas })).toEqual(fechasPersonalizadas);
  });

  it('personalizado: rechaza fechas que no están en orden estrictamente creciente', () => {
    expect(() => generarFechas({ frecuencia: 'personalizado', fechaPrimerPago: '2026-10-05', n: 2, fechasPersonalizadas: ['2026-10-05', '2026-10-05'] }))
      .toThrow(/orden estrictamente creciente/);
    expect(() => generarFechas({ frecuencia: 'personalizado', fechaPrimerPago: '2026-10-05', n: 2, fechasPersonalizadas: ['2026-11-01', '2026-10-05'] }))
      .toThrow(/orden estrictamente creciente/);
  });
});

describe('generarFechas — diaria (§1.2, §9.3)', () => {
  it('sin exclusiones: un día de calendario tras otro', () => {
    const fechas = generarFechas({ frecuencia: 'diaria', fechaPrimerPago: '2026-10-09', n: 5, diaria: { excluirDomingos: false, excluirFeriados: false } });
    expect(fechas).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  });

  it('excluyendo domingos: 2026-10-09 es viernes — salta el domingo 11, nunca dos cuotas el mismo día', () => {
    const fechas = generarFechas({ frecuencia: 'diaria', fechaPrimerPago: '2026-10-09', n: 5, diaria: { excluirDomingos: true, excluirFeriados: false } });
    // vie 9, sáb 10, [dom 11 excluido] lun 12, mar 13, mié 14
    expect(fechas).toEqual(['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(new Set(fechas).size).toBe(fechas.length); // ninguna fecha repetida
  });

  it('rango que cruza DOS domingos: 10 cuotas, todas distintas y ninguna en domingo', () => {
    const fechas = generarFechas({ frecuencia: 'diaria', fechaPrimerPago: '2026-10-09', n: 10, diaria: { excluirDomingos: true, excluirFeriados: false } });
    expect(new Set(fechas).size).toBe(10);
    for (const f of fechas) {
      const dow = new Date(f).getUTCDay();
      expect(dow).not.toBe(0);
    }
  });

  it('racha de feriados consecutivos: ninguna fecha colapsa ni se repite', () => {
    const feriados = new Set(['2026-10-12', '2026-10-13']); // lunes y martes feriados
    const fechas = generarFechas({
      frecuencia: 'diaria', fechaPrimerPago: '2026-10-09', n: 6,
      diaria: { excluirDomingos: true, excluirFeriados: true, feriados },
    });
    expect(new Set(fechas).size).toBe(fechas.length);
    for (const f of fechas) expect(feriados.has(f)).toBe(false);
  });

  it('si fechaPrimerPago cae en día excluido, se ajusta al primer día hábil', () => {
    const fechas = generarFechas({ frecuencia: 'diaria', fechaPrimerPago: '2026-10-11', n: 1, diaria: { excluirDomingos: true, excluirFeriados: false } }); // domingo
    expect(fechas).toEqual(['2026-10-12']);
  });

  it('30 cuotas diarias sin domingos → 30 fechas estrictamente distintas', () => {
    const fechas = generarFechas({ frecuencia: 'diaria', fechaPrimerPago: '2026-10-09', n: 30, diaria: { excluirDomingos: true, excluirFeriados: false } });
    expect(new Set(fechas).size).toBe(30);
  });
});

describe('diasReales', () => {
  it('días consecutivos = 1', () => {
    expect(diasReales('2026-10-09', '2026-10-10')).toBe(1);
  });
  it('salta un domingo = 2 (sábado a lunes)', () => {
    expect(diasReales('2026-10-10', '2026-10-12')).toBe(2);
  });
  it('cruza fin de año', () => {
    expect(diasReales('2026-12-30', '2027-01-02')).toBe(3);
  });
});
