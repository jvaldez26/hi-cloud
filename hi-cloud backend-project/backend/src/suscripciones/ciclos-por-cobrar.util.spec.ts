import { ciclosPorCobrar } from './ciclos-por-cobrar.util';

describe('ciclosPorCobrar', () => {
  const base = {
    fechaVencimiento: '2026-09-05',
    diaCorte:         5,
    modalidad:        'mensual',
    hoy:              '2026-09-06',
    fechaCorte:       '2026-09-01', // ya pasó el corte: no bloquea nada aquí
    cargosExistentes: [] as string[],
  };

  it('sin fechaCorte configurada, no genera nada — "sin configurar" no es "desde siempre"', () => {
    expect(ciclosPorCobrar({ ...base, fechaCorte: null })).toEqual([]);
  });

  it('vencida un día: un ciclo pendiente', () => {
    const r = ciclosPorCobrar(base);
    expect(r).toEqual([{ periodoInicio: '2026-09-05', periodoFin: '2026-10-05' }]);
  });

  it('EL BUG real: 34 días vencida (dos meses de diaCorte=5) da DOS ciclos, no uno — caso COMPRA Y VENTA', () => {
    const r = ciclosPorCobrar({
      ...base,
      fechaVencimiento: '2026-08-05',
      hoy:              '2026-09-06',
      fechaCorte:       '2026-01-01', // corte lejano: no debe tapar el bug real
    });
    expect(r).toEqual([
      { periodoInicio: '2026-08-05', periodoFin: '2026-09-05' },
      { periodoInicio: '2026-09-05', periodoFin: '2026-10-05' },
    ]);
  });

  it('no genera nada si todavía no venció', () => {
    expect(ciclosPorCobrar({ ...base, fechaVencimiento: '2026-09-10' })).toEqual([]);
  });

  it('el corte excluye los ciclos anteriores a él — el backlog no se toca', () => {
    // Vencida desde julio, pero el corte es el mismo día que hoy: solo el
    // ciclo que arranca ESE día (o después) cuenta.
    const r = ciclosPorCobrar({
      ...base,
      fechaVencimiento: '2026-07-05',
      hoy:              '2026-09-06',
      fechaCorte:       '2026-09-05',
    });
    expect(r).toEqual([{ periodoInicio: '2026-09-05', periodoFin: '2026-10-05' }]);
  });

  it('un ciclo con cargo existente no se repite — idempotencia además del índice único', () => {
    const r = ciclosPorCobrar({
      ...base,
      fechaVencimiento: '2026-08-05',
      hoy:              '2026-09-06',
      fechaCorte:       '2026-01-01', // corte lejano: lo que filtra aquí es el cargo, no el corte
      cargosExistentes: ['2026-08-05'],
    });
    expect(r).toEqual([{ periodoInicio: '2026-09-05', periodoFin: '2026-10-05' }]);
  });

  it('todos los ciclos ya cobrados: no queda nada pendiente', () => {
    const r = ciclosPorCobrar({
      ...base,
      cargosExistentes: ['2026-09-05'],
    });
    expect(r).toEqual([]);
  });

  it('modalidad anual: un año, no un mes', () => {
    const r = ciclosPorCobrar({
      ...base,
      modalidad: 'anual',
      fechaVencimiento: '2025-09-05',
      fechaCorte: '2025-01-01',
      hoy: '2026-09-05',
    });
    expect(r).toEqual([{ periodoInicio: '2025-09-05', periodoFin: '2026-09-05' }]);
  });

  it('respeta el ancla de diaCorte al pasar por meses cortos, igual que calcularNuevaFecha', () => {
    const r = ciclosPorCobrar({
      ...base,
      fechaVencimiento: '2026-01-31',
      fechaCorte:       '2026-01-01',
      diaCorte:         31,
      hoy:              '2026-03-31',
    });
    // ene→feb recorta a 28 (2026 no es bisiesto), feb→mar recorta a 31 de nuevo.
    expect(r).toEqual([
      { periodoInicio: '2026-01-31', periodoFin: '2026-02-28' },
      { periodoInicio: '2026-02-28', periodoFin: '2026-03-31' },
    ]);
  });
});
