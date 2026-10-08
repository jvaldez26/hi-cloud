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

describe('construirEstadoCuenta — 2026-10-08, empresa 73 (VENTAS DIVERSAS ELIDO): el cron ya generó el cargo de renovación', () => {
  it('cargo de renovación YA generado + cargo de ECF: el pendiente es la suma de los cargos, UNA sola vez — no + saldoSuscripcion encima', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      cargosPendientes: [
        { id: 201, concepto: 'Renovación plan Plus — ciclo 05/10/2026 al 05/11/2026', monto: 7600, montoPagado: 0 },
        { id: 202, concepto: 'ECF', monto: 2400, montoPagado: 0 },
      ],
      precioMensual: 7600, // plan Plus
    });

    // El período que generarCargosRenovacion() ya facturó deja de contarse
    // aparte — la deuda real es exactamente la suma de los dos cargos.
    expect(r.saldoCargos).toBe(10000);
    expect(r.saldoSuscripcion).toBe(0);
    expect(r.totalAdeudado).toBe(10000); // NO 17600
    expect(r.saldoNeto).toBe(10000);
  });

  it('tres períodos vencidos pero el cron solo alcanzó a facturar uno: los otros DOS siguen contando vía saldoSuscripcion', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      fechaVencimiento: '2026-08-05', // 08/05→09/05, 09/05→10/05, 10/05→11/05: 3 ciclos vencidos al 06/10
      cargosPendientes: [
        { id: 203, concepto: 'Renovación plan Plus — ciclo 05/08/2026 al 05/09/2026', monto: 7600, montoPagado: 0 },
      ],
      precioMensual: 7600,
    });

    expect(r.periodosVencidos).toBe(3);
    expect(r.saldoCargos).toBe(7600);         // el único cargo ya generado
    expect(r.saldoSuscripcion).toBe(15200);   // los 2 períodos SIN cargo todavía (2 × 7600)
    expect(r.totalAdeudado).toBe(22800);      // 7600 + 15200
  });

  it('cargo de renovación ya PAGADO (no aparece en cargosPendientes): el período vuelve a contar vía saldoSuscripcion hasta que el cron o un pago avancen fechaVencimiento', () => {
    const r = construirEstadoCuenta({
      ...BASE,
      cargosPendientes: [], // el cargo de renovación ya se pagó y se filtró
      precioMensual: 7600,
    });
    expect(r.saldoSuscripcion).toBe(7600);
    expect(r.totalAdeudado).toBe(7600);
  });

  it('ambos cargos de renovación de la empresa 73 confirmados en el historial real, sin otros cargos: pendiente exacto RD$10,000', () => {
    // Reproduce el caso exacto de la captura: "Renovación plan Plus" RD$7,600
    // + "ECF" RD$2,400, ambos CONFIRMADO/CARGO, 06/10/2026.
    const r = construirEstadoCuenta({
      ...BASE,
      hoy: '2026-10-06',
      fechaVencimiento: '2026-10-05',
      precioMensual: 7600,
      cargosPendientes: [
        { id: 301, concepto: 'Renovación plan Plus — ciclo 05/10/2026 al 05/11/2026', monto: 7600, montoPagado: 0, creadoEn: '2026-10-06' },
        { id: 302, concepto: 'ECF', monto: 2400, montoPagado: 0, creadoEn: '2026-10-06' },
      ],
    });
    expect(r.totalAdeudado).toBe(10000);
    expect(r.saldoNeto).toBe(10000);
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
