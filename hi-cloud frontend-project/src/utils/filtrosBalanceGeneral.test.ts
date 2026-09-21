import { describe, it, expect } from 'vitest';
import { filtrosDesdeURL, filtrosAURLParams, FiltrosBalanceGeneral } from './filtrosBalanceGeneral';

describe('filtrosDesdeURL (Balance General)', () => {
  it('URL vacía: cae a los defaults (nivel 2, sin comparar, ocultar en cero, % vertical visible)', () => {
    const r = filtrosDesdeURL(new URLSearchParams(''));
    expect(r.compararCon).toBe('ninguno');
    expect(r.nivelDetalle).toBe(2);
    expect(r.mostrarCodigo).toBe(false);
    expect(r.ocultarCuentasEnCero).toBe(true);
    expect(r.redondearSinDecimales).toBe(false);
    expect(r.mostrarPorcentajeVertical).toBe(true);
    expect(r.fechaCorte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lee fechaCorte, compararCon, nivelDetalle y los toggles de la URL', () => {
    const r = filtrosDesdeURL(new URLSearchParams(
      '?fechaCorte=2026-06-30&compararCon=cierre-anio-anterior&nivelDetalle=3&mostrarCodigo=true&ocultarCuentasEnCero=false',
    ));
    expect(r.fechaCorte).toBe('2026-06-30');
    expect(r.compararCon).toBe('cierre-anio-anterior');
    expect(r.nivelDetalle).toBe(3);
    expect(r.mostrarCodigo).toBe(true);
    expect(r.ocultarCuentasEnCero).toBe(false);
  });

  it("nivelDetalle='todos' se lee tal cual, no como NaN", () => {
    expect(filtrosDesdeURL(new URLSearchParams('?nivelDetalle=todos')).nivelDetalle).toBe('todos');
  });

  it('compararCon=fecha-manual trae su fechaComparacion', () => {
    const r = filtrosDesdeURL(new URLSearchParams('?compararCon=fecha-manual&fechaComparacion=2025-03-15'));
    expect(r.compararCon).toBe('fecha-manual');
    expect(r.fechaComparacion).toBe('2025-03-15');
  });

  it('un valor desconocido (typo, link viejo) cae al default, no explota', () => {
    const r = filtrosDesdeURL(new URLSearchParams('?compararCon=inventado&nivelDetalle=99'));
    expect(r.compararCon).toBe('ninguno');
    expect(r.nivelDetalle).toBe(2);
  });
});

describe('filtrosAURLParams (Balance General)', () => {
  const base: FiltrosBalanceGeneral = {
    fechaCorte: '2026-06-30', compararCon: 'ninguno', nivelDetalle: 2,
    mostrarCodigo: false, ocultarCuentasEnCero: true, redondearSinDecimales: false, mostrarPorcentajeVertical: true,
  };

  it('todo en default: solo fechaCorte va a la URL', () => {
    expect(filtrosAURLParams(base).toString()).toBe('fechaCorte=2026-06-30');
  });

  it('nivelDetalle y toggles no-default sí se escriben', () => {
    const p = filtrosAURLParams({ ...base, nivelDetalle: 'todos', mostrarCodigo: true, ocultarCuentasEnCero: false });
    expect(p.get('nivelDetalle')).toBe('todos');
    expect(p.get('mostrarCodigo')).toBe('true');
    expect(p.get('ocultarCuentasEnCero')).toBe('false');
  });

  it('fechaComparacion solo se escribe cuando compararCon=fecha-manual', () => {
    const conFechaManual = filtrosAURLParams({ ...base, compararCon: 'fecha-manual', fechaComparacion: '2025-01-01' });
    expect(conFechaManual.get('fechaComparacion')).toBe('2025-01-01');

    // aunque venga seteada, si compararCon no es fecha-manual no se escribe (quedaría inconsistente)
    const sinManual = filtrosAURLParams({ ...base, compararCon: 'ninguno', fechaComparacion: '2025-01-01' });
    expect(sinManual.get('fechaComparacion')).toBeNull();
  });

  it('ida y vuelta: armar la URL y volver a leerla reconstruye el mismo filtro', () => {
    const original: FiltrosBalanceGeneral = {
      fechaCorte: '2026-03-15', compararCon: 'mismo-mes-anio-anterior', nivelDetalle: 3,
      mostrarCodigo: true, ocultarCuentasEnCero: false, redondearSinDecimales: true, mostrarPorcentajeVertical: false,
    };
    expect(filtrosDesdeURL(filtrosAURLParams(original))).toEqual(original);
  });

  it('ida y vuelta con fecha manual', () => {
    const original: FiltrosBalanceGeneral = {
      ...base, compararCon: 'fecha-manual', fechaComparacion: '2024-12-31',
    };
    expect(filtrosDesdeURL(filtrosAURLParams(original))).toEqual(original);
  });
});
