import { describe, it, expect } from 'vitest';
import { filtrosERDesdeURL, filtrosERAURLParams, FiltrosEstadoResultados } from './filtrosEstadoResultados';

describe('filtrosERDesdeURL (Estado de Resultados)', () => {
  it('URL vacía: cae a los defaults (sin comparar, detallado, ocultar en cero, % visibles)', () => {
    const r = filtrosERDesdeURL(new URLSearchParams(''));
    expect(r.comparacion).toBe('ninguna');
    expect(r.detalle).toBe('detallado');
    expect(r.mostrarCodigo).toBe(false);
    expect(r.ocultarCuentasEnCero).toBe(true);
    expect(r.redondearSinDecimales).toBe(false);
    expect(r.mostrarPorcentajes).toBe(true);
    expect(r.desde).toMatch(/^\d{4}-01-01$/);
    expect(r.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lee desde, hasta, comparacion, detalle y los toggles de la URL', () => {
    const r = filtrosERDesdeURL(new URLSearchParams(
      '?desde=2026-01-01&hasta=2026-06-30&comparacion=anio-anterior&detalle=resumido&mostrarCodigo=true&ocultarCuentasEnCero=false',
    ));
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta).toBe('2026-06-30');
    expect(r.comparacion).toBe('anio-anterior');
    expect(r.detalle).toBe('resumido');
    expect(r.mostrarCodigo).toBe(true);
    expect(r.ocultarCuentasEnCero).toBe(false);
  });

  it('un valor desconocido (typo, link viejo) cae al default, no explota', () => {
    const r = filtrosERDesdeURL(new URLSearchParams('?comparacion=inventado&detalle=inventado'));
    expect(r.comparacion).toBe('ninguna');
    expect(r.detalle).toBe('detallado');
  });
});

describe('filtrosERAURLParams (Estado de Resultados)', () => {
  const base: FiltrosEstadoResultados = {
    desde: '2026-01-01', hasta: '2026-06-30', comparacion: 'ninguna', detalle: 'detallado',
    mostrarCodigo: false, ocultarCuentasEnCero: true, redondearSinDecimales: false, mostrarPorcentajes: true,
  };

  it('todo en default: solo desde/hasta van a la URL', () => {
    expect(filtrosERAURLParams(base).toString()).toBe('desde=2026-01-01&hasta=2026-06-30');
  });

  it('comparacion, detalle y toggles no-default sí se escriben', () => {
    const p = filtrosERAURLParams({ ...base, comparacion: 'por-mes', detalle: 'resumido', mostrarCodigo: true });
    expect(p.get('comparacion')).toBe('por-mes');
    expect(p.get('detalle')).toBe('resumido');
    expect(p.get('mostrarCodigo')).toBe('true');
  });

  it('ida y vuelta: armar la URL y volver a leerla reconstruye el mismo filtro — para las 4 vistas de comparación', () => {
    for (const comparacion of ['ninguna', 'mes-vs-acumulado', 'anio-anterior', 'por-mes'] as const) {
      const original: FiltrosEstadoResultados = { ...base, comparacion, detalle: 'resumido', mostrarPorcentajes: false };
      expect(filtrosERDesdeURL(filtrosERAURLParams(original))).toEqual(original);
    }
  });
});
