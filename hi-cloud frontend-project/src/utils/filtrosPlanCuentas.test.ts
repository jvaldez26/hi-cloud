import { describe, it, expect } from 'vitest';
import { filtrosDesdeURL, filtrosAURLParams } from './filtrosPlanCuentas';

/**
 * Plan de Cuentas — chips de clasificación/estado en la URL, para que el
 * filtro sea compartible y sobreviva a un F5. Lo que le da sentido a este
 * archivo es la ida Y vuelta: un filtro armado en pantalla tiene que
 * producir la MISMA URL que, leída de vuelta, reconstruye el mismo filtro.
 */
describe('filtrosDesdeURL', () => {
  it('URL vacía: cae a los defaults (todas las clasificaciones, solo activas)', () => {
    expect(filtrosDesdeURL(new URLSearchParams(''))).toEqual({
      search: '', clasificacion: 'todas', estado: 'activas',
    });
  });

  it('lee clasificacion + estado + search de la URL', () => {
    const r = filtrosDesdeURL(new URLSearchParams('?clasificacion=gastos&estado=activas&search=caja'));
    expect(r).toEqual({ search: 'caja', clasificacion: 'gastos', estado: 'activas' });
  });

  it('un valor desconocido en la URL (typo, versión vieja del link) cae al default, no explota', () => {
    const r = filtrosDesdeURL(new URLSearchParams('?clasificacion=inventado&estado=raro'));
    expect(r.clasificacion).toBe('todas');
    expect(r.estado).toBe('activas');
  });

  it('estado=todas y estado=grupo se leen tal cual', () => {
    expect(filtrosDesdeURL(new URLSearchParams('?estado=todas')).estado).toBe('todas');
    expect(filtrosDesdeURL(new URLSearchParams('?estado=grupo')).estado).toBe('grupo');
  });
});

describe('filtrosAURLParams', () => {
  it('todo en default: URL vacía, sin params sueltos', () => {
    const p = filtrosAURLParams({ search: '', clasificacion: 'todas', estado: 'activas' });
    expect(p.toString()).toBe('');
  });

  it('gastos + activas (el ejemplo del encargo): "activas" es el default, no se escribe', () => {
    const p = filtrosAURLParams({ search: '', clasificacion: 'gastos', estado: 'activas' });
    expect(p.toString()).toBe('clasificacion=gastos');
  });

  it('búsqueda con espacios al borde: se recorta antes de ir a la URL', () => {
    const p = filtrosAURLParams({ search: '  caja  ', clasificacion: 'todas', estado: 'activas' });
    expect(p.get('search')).toBe('caja');
  });

  it('ida y vuelta: armar la URL y volver a leerla reconstruye el mismo filtro (sobrevive a un F5)', () => {
    const original = { search: 'banco', clasificacion: 'pasivos' as const, estado: 'inactivas' as const };
    const params = filtrosAURLParams(original);
    const reconstruido = filtrosDesdeURL(params);
    expect(reconstruido).toEqual(original);
  });

  it('ida y vuelta con estado=grupo', () => {
    const original = { search: '', clasificacion: 'todas' as const, estado: 'grupo' as const };
    expect(filtrosDesdeURL(filtrosAURLParams(original))).toEqual(original);
  });
});
