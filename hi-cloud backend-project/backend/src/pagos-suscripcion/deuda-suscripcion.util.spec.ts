import { calcularDeudaSuscripcion, MAX_PERIODOS_VENCIDOS } from './deuda-suscripcion.util';

describe('calcularDeudaSuscripcion', () => {
  const HOY = '2026-09-05';
  const BASE = {
    diaCorte:      5,
    modalidad:     'mensual',
    precioMensual: 5200,
    hoy:           HOY,
  };

  it('suscripción al día (vence hoy) — RD$0.00', () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'activa', fechaVencimiento: HOY });
    expect(r).toEqual({ periodosVencidos: 0, monto: 0, tope: false });
  });

  it('suscripción adelantada (vence en el futuro) — RD$0.00, nunca negativa', () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'activa', fechaVencimiento: '2026-12-05' });
    expect(r).toEqual({ periodosVencidos: 0, monto: 0, tope: false });
  });

  it('un período vencido (venció hace 10 días) — 1 × precio', () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'activa', fechaVencimiento: '2026-08-05' });
    expect(r).toEqual({ periodosVencidos: 1, monto: 5200, tope: false });
  });

  it('tres períodos vencidos — 3 × precio', () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'suspendida', fechaVencimiento: '2026-06-05' });
    expect(r).toEqual({ periodosVencidos: 3, monto: 15_600, tope: false });
  });

  it("estado 'prueba' — RD$0.00 aunque la fecha esté vencida", () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'prueba', fechaVencimiento: '2020-01-01' });
    expect(r).toEqual({ periodosVencidos: 0, monto: 0, tope: false });
  });

  it("estado 'cancelada' — RD$0.00 aunque la fecha esté vencida (dejó de devengar)", () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'cancelada', fechaVencimiento: '2020-01-01' });
    expect(r).toEqual({ periodosVencidos: 0, monto: 0, tope: false });
  });

  it('sin precio configurado — RD$0.00, no intenta calcular', () => {
    const r = calcularDeudaSuscripcion({
      ...BASE, precioMensual: 0, estado: 'activa', fechaVencimiento: '2026-01-05',
    });
    expect(r).toEqual({ periodosVencidos: 0, monto: 0, tope: false });
  });

  it('modalidad anual — multiplica el precio mensual × 12 por período', () => {
    const r = calcularDeudaSuscripcion({
      ...BASE, modalidad: 'anual', estado: 'activa', fechaVencimiento: '2025-09-05',
    });
    expect(r).toEqual({ periodosVencidos: 1, monto: 62_400, tope: false });
  });

  it('abandono extremo — corta en MAX_PERIODOS_VENCIDOS y marca tope', () => {
    const r = calcularDeudaSuscripcion({ ...BASE, estado: 'activa', fechaVencimiento: '2000-01-05' });
    expect(r.periodosVencidos).toBe(MAX_PERIODOS_VENCIDOS);
    expect(r.monto).toBe(redondear(MAX_PERIODOS_VENCIDOS * 5200));
    expect(r.tope).toBe(true);
  });

  function redondear(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
});
