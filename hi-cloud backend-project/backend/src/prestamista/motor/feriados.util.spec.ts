/**
 * Motor financiero — Etapa 2, Fase 2A. Ver docs/prestamista/motor-financiero.md §1.5, §9.1 caso 15.
 */
import { calcularPascua, feriadosDeFabrica, esDiaHabil, primerDiaHabilDesde, siguienteDiaHabilEstricto, sumarDias, diaSemana } from './feriados.util';

describe('calcularPascua — verificado contra fechas públicas conocidas', () => {
  it.each([
    [2023, '2023-04-09'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('Pascua %i = %s', (anio, esperado) => {
    expect(calcularPascua(anio as number)).toBe(esperado);
  });
});

describe('feriadosDeFabrica', () => {
  it('Viernes Santo = Pascua − 2 días, Corpus Christi = Pascua + 60 días (2026)', () => {
    const feriados = feriadosDeFabrica(2026);
    const viernesSanto = feriados.find(f => f.nombre === 'Viernes Santo')!;
    const corpusChristi = feriados.find(f => f.nombre === 'Corpus Christi')!;
    expect(viernesSanto.fecha).toBe('2026-04-03'); // Pascua 2026-04-05 − 2
    expect(corpusChristi.fecha).toBe('2026-06-04'); // Pascua 2026-04-05 + 60
  });

  it('los 5 feriados de fecha fija están marcados confirmado=true', () => {
    const feriados = feriadosDeFabrica(2026);
    const fijos = ['Año Nuevo', 'Virgen de la Altagracia', 'Día de Duarte', 'Virgen de las Mercedes', 'Navidad'];
    for (const nombre of fijos) {
      expect(feriados.find(f => f.nombre.startsWith(nombre))?.confirmado).toBe(true);
    }
  });

  it('los 3 trasladables al lunes quedan marcados confirmado=false (requieren verificación anual)', () => {
    const feriados = feriadosDeFabrica(2026);
    const trasladables = feriados.filter(f => !f.confirmado);
    expect(trasladables).toHaveLength(3);
    expect(trasladables.map(f => f.fecha).sort()).toEqual(['2026-05-01', '2026-08-16', '2026-11-06']);
  });
});

describe('esDiaHabil / primerDiaHabilDesde / siguienteDiaHabilEstricto', () => {
  const config = { excluirDomingos: true, excluirFeriados: true, feriados: new Set(['2026-01-01']) };

  it('un domingo no es día hábil si excluirDomingos=true', () => {
    expect(diaSemana('2026-10-11')).toBe(0); // domingo
    expect(esDiaHabil('2026-10-11', config)).toBe(false);
  });

  it('un feriado del calendario no es día hábil', () => {
    expect(esDiaHabil('2026-01-01', config)).toBe(false);
  });

  it('un día normal es hábil', () => {
    expect(esDiaHabil('2026-10-09', config)).toBe(true); // viernes
  });

  it('primerDiaHabilDesde: si ya es hábil, se queda igual', () => {
    expect(primerDiaHabilDesde('2026-10-09', config)).toBe('2026-10-09');
  });

  it('primerDiaHabilDesde: domingo avanza al lunes', () => {
    expect(primerDiaHabilDesde('2026-10-11', config)).toBe('2026-10-12');
  });

  it('siguienteDiaHabilEstricto: siempre estrictamente posterior, aunque la fecha dada ya sea hábil', () => {
    expect(siguienteDiaHabilEstricto('2026-10-09', config)).toBe('2026-10-10'); // sábado, hábil (no se excluye sábado)
  });

  it('racha de feriados consecutivos: sigue avanzando hasta encontrar un día libre', () => {
    const configRacha = { excluirDomingos: false, excluirFeriados: true, feriados: new Set(['2026-10-10', '2026-10-11', '2026-10-12']) };
    expect(primerDiaHabilDesde('2026-10-10', configRacha)).toBe('2026-10-13');
  });
});

describe('sumarDias', () => {
  it('cruza fin de mes correctamente', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
  });
  it('cruza año bisiesto (2028) correctamente', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2028-02-29', 1)).toBe('2028-03-01');
  });
  it('año no bisiesto (2026) no tiene 29 de febrero', () => {
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
  });
});
