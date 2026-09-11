import { imputarPago, EntradaImputacion, CargoPendienteEntrada } from './imputacion-pago.util';

/**
 * Los 8 escenarios pedidos explícitamente para la corrección de imputación de
 * pagos (cargos pendientes → períodos de plan → abono). Ver imputacion-pago.util.ts
 * para el porqué del orden.
 */
describe('imputarPago', () => {
  const HOY = '2026-09-05';
  const BASE: Omit<EntradaImputacion, 'monto' | 'abonoDisponible' | 'cargosPendientes'> = {
    precioMensual:    5200,
    venceSuscripcion: '2026-09-05',
    diaCorte:         5,
    modalidad:        'mensual',
    hoy:              HOY,
  };

  function cargo(id: number, concepto: string, saldoPendiente: number): CargoPendienteEntrada {
    return { id, concepto, saldoPendiente };
  }

  // 1. Pago que liquida EXACTAMENTE un cargo y nada más: cero períodos, fecha sin mover.
  it('liquida exactamente un cargo y nada más — cero períodos, fecha sin mover', () => {
    const r = imputarPago({
      ...BASE,
      monto:            18_000,
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
    });

    expect(r.cargosLiquidados).toEqual([
      { cargoId: 1, concepto: 'Activación e-CF', montoAplicado: 18_000, saldoRestante: 0 },
    ]);
    expect(r.montoACargos).toBe(18_000);
    expect(r.periodos).toBe(0);
    expect(r.montoAPeriodos).toBe(0);
    expect(r.nuevaFecha).toBeNull();
    expect(r.abonoFinal).toBe(0);
  });

  // 2. Pago que cubre un cargo más EXACTAMENTE dos mensualidades.
  it('cubre un cargo más exactamente dos mensualidades', () => {
    const r = imputarPago({
      ...BASE,
      monto:            18_000 + 2 * 5_200, // 28,400
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
    });

    expect(r.cargosLiquidados).toEqual([
      { cargoId: 1, concepto: 'Activación e-CF', montoAplicado: 18_000, saldoRestante: 0 },
    ]);
    expect(r.montoACargos).toBe(18_000);
    expect(r.periodos).toBe(2);
    expect(r.montoAPeriodos).toBe(10_400);
    expect(r.nuevaFecha).toBe('2026-11-05');
    expect(r.abonoFinal).toBe(0);
  });

  // 3. Pago que cubre un cargo y deja remanente insuficiente para un período: abono, fecha sin mover.
  it('cubre un cargo y deja remanente insuficiente para un período — abono, fecha sin mover', () => {
    const r = imputarPago({
      ...BASE,
      monto:            18_000 + 3_000, // 21,000 — el resto (3,000) no llega a 5,200
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
    });

    expect(r.montoACargos).toBe(18_000);
    expect(r.periodos).toBe(0);
    expect(r.nuevaFecha).toBeNull();
    expect(r.abonoFinal).toBe(3_000);
  });

  // 4. Pago parcial sobre un cargo: el cargo queda con saldo, cero períodos.
  it('pago parcial sobre un cargo — el cargo queda con saldo, cero períodos', () => {
    const r = imputarPago({
      ...BASE,
      monto:            10_000,
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
    });

    expect(r.cargosLiquidados).toEqual([
      { cargoId: 1, concepto: 'Activación e-CF', montoAplicado: 10_000, saldoRestante: 8_000 },
    ]);
    expect(r.montoACargos).toBe(10_000);
    expect(r.periodos).toBe(0);
    expect(r.nuevaFecha).toBeNull();
    expect(r.abonoFinal).toBe(0);
  });

  // 5. Dos cargos pendientes de distintas fechas: se liquida primero el viejo.
  it('dos cargos pendientes — se liquida primero el más viejo (FIFO, ya ordenado por el caller)', () => {
    const r = imputarPago({
      ...BASE,
      monto:            5_000,
      abonoDisponible:  0,
      // El caller ya los entrega ordenados del más antiguo al más reciente.
      cargosPendientes: [
        cargo(1, 'Cargo viejo — contabilidad', 3_000),
        cargo(2, 'Cargo nuevo — excedente e-CF', 4_000),
      ],
    });

    expect(r.cargosLiquidados).toEqual([
      { cargoId: 1, concepto: 'Cargo viejo — contabilidad',   montoAplicado: 3_000, saldoRestante: 0 },
      { cargoId: 2, concepto: 'Cargo nuevo — excedente e-CF', montoAplicado: 2_000, saldoRestante: 2_000 },
    ]);
    expect(r.montoACargos).toBe(5_000);
    expect(r.periodos).toBe(0);
    expect(r.abonoFinal).toBe(0);
  });

  // 6. Abono preexistente más pago nuevo: se suman antes de imputar.
  it('abono preexistente más pago nuevo — se suman antes de imputar', () => {
    const r = imputarPago({
      ...BASE,
      monto:            2_000,
      abonoDisponible:  3_200,
      cargosPendientes: [],
    });

    // 2,000 + 3,200 = 5,200 = exactamente 1 período, sin cargos que liquidar.
    expect(r.montoTotalImputado).toBe(5_200);
    expect(r.periodos).toBe(1);
    expect(r.nuevaFecha).toBe('2026-10-05');
    expect(r.abonoFinal).toBe(0);
  });

  // 7. Cliente sin cargos: comportamiento idéntico al actual (regresión).
  it('cliente sin cargos — se comporta como antes (regresión): monto/precio → períodos', () => {
    const r = imputarPago({
      ...BASE,
      monto:            3 * 5_200,
      abonoDisponible:  0,
      cargosPendientes: [],
    });

    expect(r.cargosLiquidados).toEqual([]);
    expect(r.montoACargos).toBe(0);
    expect(r.periodos).toBe(3);
    expect(r.montoAPeriodos).toBe(15_600);
    expect(r.nuevaFecha).toBe('2026-12-05');
    expect(r.abonoFinal).toBe(0);
  });

  // 8. Override 'solo_suscripcion' con cargos pendientes: avanza períodos y deja los cargos intactos.
  it("override 'solo_suscripcion' con cargos pendientes — avanza períodos y deja los cargos intactos", () => {
    const r = imputarPago({
      ...BASE,
      monto:            18_000 + 5_200, // alcanzaría para liquidar el cargo + 1 período
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
      override:         'solo_suscripcion',
    });

    expect(r.cargosLiquidados).toEqual([]);
    expect(r.montoACargos).toBe(0);
    // floor(23,200 / 5,200) = 4 períodos — todo el monto va a suscripción.
    expect(r.periodos).toBe(4);
    expect(r.nuevaFecha).toBe('2027-01-05');
    expect(r.abonoFinal).toBe(2_400); // 23,200 − 4×5,200 = 2,400
  });

  // Extra: override 'solo_cargos' — ignora períodos aunque sobre dinero después de liquidar cargos.
  it("override 'solo_cargos' — ignora períodos, el resto queda de abono", () => {
    const r = imputarPago({
      ...BASE,
      monto:            18_000 + 2 * 5_200,
      abonoDisponible:  0,
      cargosPendientes: [cargo(1, 'Activación e-CF', 18_000)],
      override:         'solo_cargos',
    });

    expect(r.montoACargos).toBe(18_000);
    expect(r.periodos).toBe(0);
    expect(r.nuevaFecha).toBeNull();
    expect(r.abonoFinal).toBe(10_400);
  });
});
