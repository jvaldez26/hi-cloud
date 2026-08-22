import {
  calcularEfectivoEsperado,
  calcularDiferencia,
  esperadoEsInconsistente,
  excesoDeRetiros,
  calcularDisponibleParaRetiro,
  type EntradasEfectivo,
} from './efectivo-esperado.util';

/** Turno vacío — cada test sobrescribe solo lo que le interesa. */
const base = (p: Partial<EntradasEfectivo> = {}): EntradasEfectivo => ({
  saldoApertura: 0, ventasEfectivo: 0, cobrosEfectivo: 0,
  anticiposEfectivo: 0, gastosEfectivo: 0, retiros: 0, ...p,
});

describe('calcularEfectivoEsperado — solo lo que está en el cajón', () => {
  it('turno normal: apertura + ventas en efectivo − gastos', () => {
    expect(calcularEfectivoEsperado(base({
      saldoApertura: 2000, ventasEfectivo: 15000, gastosEfectivo: 500,
    }))).toBe(16500);
  });

  it('suma los cobros en EFECTIVO', () => {
    expect(calcularEfectivoEsperado(base({ ventasEfectivo: 1000, cobrosEfectivo: 500 })))
      .toBe(1500);
  });

  it('suma los anticipos en EFECTIVO — hoy se calculaban y no entraban en la fórmula', () => {
    // Un anticipo en efectivo SÍ está en el cajón. Omitirlo generaba un
    // faltante aparente exactamente por su monto.
    expect(calcularEfectivoEsperado(base({ ventasEfectivo: 1000, anticiposEfectivo: 750 })))
      .toBe(1750);
  });

  it('resta los retiros', () => {
    expect(calcularEfectivoEsperado(base({ ventasEfectivo: 5000, retiros: 2000 })))
      .toBe(3000);
  });

  it('un turno completo cuadra al céntimo', () => {
    expect(calcularEfectivoEsperado(base({
      saldoApertura: 1000, ventasEfectivo: 12345.67, cobrosEfectivo: 2500.33,
      anticiposEfectivo: 1000, gastosEfectivo: 345.50, retiros: 5000,
    }))).toBe(11500.50);
  });

  it('tolera importes que llegan como string desde TypeORM', () => {
    expect(calcularEfectivoEsperado({
      saldoApertura: '1000' as any, ventasEfectivo: '500.50' as any,
      cobrosEfectivo: 0, anticiposEfectivo: 0, gastosEfectivo: 0, retiros: 0,
    })).toBe(1500.50);
  });
});

describe('lo que NO entra nunca — tarjeta y transferencia', () => {
  // Estos son los casos que motivaron el arreglo: el frontend los sumaba.
  it('un cobro por TRANSFERENCIA no suma al efectivo esperado', () => {
    // El cobro existe y es un ingreso del turno, pero no está en el cajón:
    // quien construye EntradasEfectivo debe haberlo filtrado por metodoPago.
    const conSoloEfectivo = base({ ventasEfectivo: 1000, cobrosEfectivo: 0 });
    expect(calcularEfectivoEsperado(conSoloEfectivo)).toBe(1000);
  });

  it('la firma no admite tarjeta ni transferencia — no hay forma de colarlas', () => {
    const claves = Object.keys(base());
    expect(claves).not.toContain('ventasTarjeta');
    expect(claves).not.toContain('ventasTransferencia');
    expect(claves.sort()).toEqual([
      'anticiposEfectivo', 'cobrosEfectivo', 'gastosEfectivo',
      'retiros', 'saldoApertura', 'ventasEfectivo',
    ]);
  });
});

describe('esperado negativo — no se acota ni se disfraza', () => {
  const turnoRoto = base({ saldoApertura: 0, ventasEfectivo: 3000, retiros: 8000 });

  it('devuelve el negativo tal cual, sin acotar a cero', () => {
    expect(calcularEfectivoEsperado(turnoRoto)).toBe(-5000);
  });

  it('se marca como inconsistente', () => {
    expect(esperadoEsInconsistente(calcularEfectivoEsperado(turnoRoto))).toBe(true);
    expect(excesoDeRetiros(calcularEfectivoEsperado(turnoRoto))).toBe(5000);
  });

  it('EL BUG: contado 0 sobre esperado negativo daba un SOBRANTE', () => {
    // Este es el caso del cierre reportado. La aritmética es correcta —
    // 0 − (−5000) = +5000 — y por eso el faltante se pintaba en azul como
    // sobrante. La diferencia se sigue calculando así, pero la bandera de
    // inconsistencia impide presentarla como un cuadre normal.
    const esperado = calcularEfectivoEsperado(turnoRoto);
    const dif = calcularDiferencia(0, esperado);
    expect(dif).toBe(5000);                       // aritméticamente, un "sobrante"
    expect(esperadoEsInconsistente(esperado)).toBe(true);  // pero NO es cuadrable
  });

  it('un turno sano no se marca como inconsistente', () => {
    const esperado = calcularEfectivoEsperado(base({ ventasEfectivo: 1000 }));
    expect(esperadoEsInconsistente(esperado)).toBe(false);
    expect(excesoDeRetiros(esperado)).toBe(0);
  });

  it('esperado exactamente 0 NO es inconsistente', () => {
    const esperado = calcularEfectivoEsperado(base({ ventasEfectivo: 1000, retiros: 1000 }));
    expect(esperado).toBe(0);
    expect(esperadoEsInconsistente(esperado)).toBe(false);
  });
});

describe('calcularDiferencia', () => {
  it('sobrante, faltante y cuadre', () => {
    expect(calcularDiferencia(1100, 1000)).toBe(100);
    expect(calcularDiferencia(900,  1000)).toBe(-100);
    expect(calcularDiferencia(1000, 1000)).toBe(0);
  });

  it('no arrastra error de coma flotante', () => {
    expect(calcularDiferencia(0.3, 0.1)).toBe(0.2);
  });
});

describe('calcularDisponibleParaRetiro', () => {
  it('es el efectivo en el cajón en este instante', () => {
    expect(calcularDisponibleParaRetiro(base({
      saldoApertura: 1000, ventasEfectivo: 4000, retiros: 1500,
    }))).toBe(3500);
  });

  it('con retiros previos que ya vaciaron la caja, no queda nada disponible', () => {
    expect(calcularDisponibleParaRetiro(base({ ventasEfectivo: 2000, retiros: 2000 })))
      .toBe(0);
  });
});
