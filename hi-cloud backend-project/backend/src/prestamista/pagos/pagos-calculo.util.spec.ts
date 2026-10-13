import { distribuirPago, moraACuotaEnFecha, calcularSaldoLiquidacion, CuotaPendiente } from './pagos-calculo.util';

function cuota(over: Partial<CuotaPendiente> = {}): CuotaPendiente {
  return {
    id: 1, numeroCuota: 1, fechaVencimiento: '2026-09-01',
    capital: 1000, interes: 100, capitalPagado: 0, interesPagado: 0,
    moraGenerada: 0, moraPagada: 0, cargos: null, cargosPagados: 0,
    ...over,
  };
}

describe('pagos-calculo.util — distribuirPago()', () => {
  it('orden mora -> interés -> capital -> cargos, dentro de UNA cuota', () => {
    const c = cuota({ id: 1, moraGenerada: 50, cargos: [{ concepto: 'Seguro', monto: 30 }] });
    const r = distribuirPago([c], 1180, new Map([[1, 50]]));
    expect(r.aplicadoMora).toBe(50);
    expect(r.aplicadoInteres).toBe(100);
    expect(r.aplicadoCapital).toBe(1000);
    expect(r.aplicadoCargos).toBe(30);
    expect(r.restanteSinAplicar).toBe(0);
    expect(r.lineas[0].quedaPagada).toBe(true);
  });

  it('monto insuficiente para una cuota: queda parcial, nunca negativo', () => {
    const c = cuota({ id: 1 });
    const r = distribuirPago([c], 50, new Map());
    expect(r.aplicadoInteres).toBe(50);
    expect(r.aplicadoCapital).toBe(0);
    expect(r.lineas[0].quedaPagada).toBe(false);
    expect(r.restanteSinAplicar).toBe(0);
  });

  it('excedente pasa a la SIGUIENTE cuota pendiente, en orden', () => {
    const c1 = cuota({ id: 1, numeroCuota: 1 });
    const c2 = cuota({ id: 2, numeroCuota: 2, fechaVencimiento: '2026-10-01' });
    const r = distribuirPago([c1, c2], 1500, new Map());
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0].quedaPagada).toBe(true);
    expect(r.lineas[1].pagInt + r.lineas[1].pagCap).toBe(400); // 1500 - 1100 de la primera
    expect(r.restanteSinAplicar).toBe(0);
  });

  it('dinero de más que todas las cuotas: restanteSinAplicar lo refleja (el caller decide destino)', () => {
    const c = cuota({ id: 1 });
    const r = distribuirPago([c], 5000, new Map());
    expect(r.totalAplicado).toBe(1100);
    expect(r.restanteSinAplicar).toBe(3900);
  });

  it('cuota sin nada pendiente (ya saldada por error de datos): se ignora sin tocar el monto', () => {
    const c = cuota({ id: 1, capitalPagado: 1000, interesPagado: 100 });
    const r = distribuirPago([c], 500, new Map());
    expect(r.lineas).toHaveLength(0);
    expect(r.restanteSinAplicar).toBe(500);
  });
});

describe('pagos-calculo.util — moraACuotaEnFecha()', () => {
  const c = cuota({ fechaVencimiento: '2026-09-01', capital: 1000, interes: 100 });

  it('sin días de atraso en la fecha dada: 0, aunque hoy ya esté vencida', () => {
    expect(moraACuotaEnFecha(c, '2026-09-01', 0, 5, null)).toBe(0);
  });

  it('dentro de la gracia en la fecha dada: 0', () => {
    expect(moraACuotaEnFecha(c, '2026-09-05', 10, 5, null)).toBe(0);
  });

  it('más allá de la gracia: usa los DÍAS A ESA FECHA, no los de hoy', () => {
    // 10 días de atraso al 2026-09-11, tasa 5%/mes legacy
    const m = moraACuotaEnFecha(c, '2026-09-11', 0, 5, null);
    expect(m).toBeGreaterThan(0);
    // Mismo cálculo con una fecha más lejana da más mora — confirma que usa `fechaPago`, no "hoy".
    const mTarde = moraACuotaEnFecha(c, '2026-10-01', 0, 5, null);
    expect(mTarde).toBeGreaterThan(m);
  });

  it('con config de mora v2: usa calcularMoraV2 en vez de la fórmula legacy', () => {
    const m = moraACuotaEnFecha(c, '2026-09-11', 0, 0, {
      base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360,
    });
    expect(m).toBeGreaterThan(0);
  });
});

describe('pagos-calculo.util — calcularSaldoLiquidacion()', () => {
  it('suma capital + interés pendiente de TODAS las cuotas + mora a la fecha', () => {
    const c1 = cuota({ id: 1, fechaVencimiento: '2026-09-01' }); // vencida
    const c2 = cuota({ id: 2, numeroCuota: 2, fechaVencimiento: '2026-11-01' }); // futura, sin mora
    const total = calcularSaldoLiquidacion([c1, c2], '2026-09-15', 0, 5, null);
    const moraEsperada = moraACuotaEnFecha(c1, '2026-09-15', 0, 5, null);
    expect(total).toBe(2200 + moraEsperada); // (1000+100)*2 + mora de la vencida
  });
});
