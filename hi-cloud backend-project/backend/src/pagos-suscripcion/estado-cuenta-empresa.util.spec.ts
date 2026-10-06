import { construirEstadoFechas, construirEstadoCuenta, EntradaEstadoCuenta } from './estado-cuenta-empresa.util';

const BASE: EntradaEstadoCuenta = {
  estado:           'activa',
  fechaInicio:      '2026-01-05',
  fechaVencimiento: '2026-10-05',
  diaCorte:         5,
  modalidad:        'mensual',
  precioMensual:    5200,
  enPeriodoGracia:  false,
  abonoDisponible:  0,
  cargosPendientes: [],
  hoy:              '2026-10-06',
};

describe('construirEstadoCuenta — caso real: deuda de suscripción + cargo, sin pagos', () => {
  it('saldo pendiente = cargo + período vencido, exactamente como MOTO REPUESTO MANOLIN (RD$4,800 + RD$5,200 = RD$10,000)', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    });

    expect(r.saldoSuscripcion).toBe(5200); // 1 período vencido (venció 05/10, hoy 06/10)
    expect(r.saldoCargos).toBe(4800);
    expect(r.totalAdeudado).toBe(10000);
    expect(r.abonoDisponible).toBe(0);
    expect(r.saldoNeto).toBe(10000); // positivo = debe
  });
});

describe('construirEstadoCuenta — pago parcial', () => {
  it('un cargo pagado a medias deja el saldo restante, no el monto completo', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      estado: 'prueba', // sin devengo de suscripción, para aislar el cargo
      cargosPendientes: [{ id: 1, concepto: 'Cargo parcial', monto: 1000, montoPagado: 600 }],
    });

    expect(r.saldoSuscripcion).toBe(0);
    expect(r.saldoCargos).toBe(400);
    expect(r.totalAdeudado).toBe(400);
    expect(r.saldoNeto).toBe(400);
  });

  it('un cargo totalmente pagado (montoPagado = monto) NO cuenta — a diferencia del viejo "saldo" que sumaba el monto completo sin mirar montoPagado', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      estado: 'prueba',
      cargosPendientes: [
        { id: 29, concepto: 'eliminación de remanente', monto: 5200, montoPagado: 5200 },
        { id: 30, concepto: 'SERVICIOS PROFESIONALES', monto: 10000, montoPagado: 10000 },
      ],
    });

    expect(r.cargosPendientes).toHaveLength(0);
    expect(r.saldoCargos).toBe(0);
    expect(r.totalAdeudado).toBe(0);
  });
});

describe('construirEstadoCuenta — pago mayor que la deuda: crédito a favor REAL', () => {
  it('abonoDisponible superando lo adeudado da saldoNeto negativo (crédito), nunca por un acumulado histórico ciego', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      estado: 'activa',
      fechaVencimiento: '2027-01-05', // al día, sin deuda de suscripción
      abonoDisponible: 2000,
      cargosPendientes: [],
    });

    expect(r.totalAdeudado).toBe(0);
    expect(r.saldoNeto).toBe(-2000); // crédito real de RD$2,000
  });

  it('abono que NO alcanza a cubrir toda la deuda nueva: saldoNeto sigue positivo (deuda), no se esconde tras el abono viejo', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      abonoDisponible: 3000, // menos que los 10,000 que debe
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    });

    expect(r.totalAdeudado).toBe(10000);
    expect(r.saldoNeto).toBe(7000); // 10000 - 3000, sigue debiendo
  });

  it('al día, sin cargos ni abono: saldoNeto es exactamente 0', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      fechaVencimiento: '2027-01-05',
      cargosPendientes: [],
    });
    expect(r.saldoNeto).toBe(0);
  });
});

describe('construirEstadoFechas — fechas siempre como YYYY-MM-DD, nunca Date crudo', () => {
  it('acepta un Date (como lo devuelve pg para columnas date) y lo normaliza a string', () => {
    const r = construirEstadoFechas({
      ...BASE,
      fechaVencimiento: new Date('2026-10-05T00:00:00.000Z'),
      hoy: '2026-10-01',
    });
    expect(r.fechaVencimiento).toBe('2026-10-05');
    expect(typeof r.fechaVencimiento).toBe('string');
  });

  it('diasRestantes es exacto en RD, sin el corrimiento de un día que da new Date(iso).getTime()', () => {
    const r = construirEstadoFechas({ ...BASE, fechaVencimiento: '2026-10-10', hoy: '2026-10-05' });
    expect(r.diasRestantes).toBe(5);
  });

  it('sin suscripción (fechaVencimiento null): no revienta, todo en cero', () => {
    const r = construirEstadoFechas({ ...BASE, fechaVencimiento: null });
    expect(r.fechaVencimiento).toBeNull();
    expect(r.diasRestantes).toBe(0);
    expect(r.saldoSuscripcion).toBe(0);
  });

  it('gracia vencida pero estado aún "activa" en BD: se reporta "suspendida" en tiempo real con motivo GRACIA_VENCIDA', () => {
    const r = construirEstadoFechas({
      ...BASE,
      estado: 'activa',
      enPeriodoGracia: true,
      fechaFinGracia: '2026-10-01',
      hoy: '2026-10-05',
    });
    expect(r.estado).toBe('suspendida');
    expect(r.motivoSuspension).toBe('GRACIA_VENCIDA');
  });

  it('en gracia y todavía dentro del plazo: estado se mantiene, diasGraciaRestantes cuenta hacia abajo', () => {
    const r = construirEstadoFechas({
      ...BASE,
      estado: 'activa',
      enPeriodoGracia: true,
      fechaFinGracia: '2026-10-11',
      hoy: '2026-10-06',
    });
    expect(r.estado).toBe('activa');
    expect(r.diasGraciaRestantes).toBe(5);
  });
});

describe('construirEstadoCuenta / construirEstadoFechas — mismo número para el mismo dato (garantía de "panel y cliente devuelven lo mismo")', () => {
  it('llamar dos veces con la misma entrada da exactamente el mismo resultado — es pura, sin estado oculto', () => {
    const entrada: EntradaEstadoCuenta = {
      ...BASE,
      cargosPendientes: [{ id: 85, concepto: 'ECF', monto: 4800, montoPagado: 0 }],
    };
    const r1 = construirEstadoCuenta(entrada);
    const r2 = construirEstadoCuenta(entrada);
    expect(r1).toEqual(r2);
  });
});
