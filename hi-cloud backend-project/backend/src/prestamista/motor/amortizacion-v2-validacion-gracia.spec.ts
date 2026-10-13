/**
 * Incidente Sentry 7790156766 (producción, 2026-10-13, release ae40086c):
 * POST /prestamista/prestamos → 500 "[DecimalError] Invalid argument:
 * undefined" en calcularTablaAmortizacion, rama gracia.tipo==='capital'.
 * Empresa 57, producto #3 (motorConfig.gracia={tipo:'capital',periodos:5}),
 * solicitud SOL-101 con plazoMeses=2 — gracia (5) >= plazo (2): el loop de
 * gracia (0..G-1) leía tasasPeriodo[k] más allá del array de `n` elementos.
 *
 * Causa raíz: nada validaba que la gracia configurada en el PRODUCTO
 * siguiera siendo válida para el plazo real de la solicitud/préstamo — un
 * producto pensado para préstamos largos (gracia=5) se usó con un plazo
 * corto (2 cuotas). Fix: `calcularTablaAmortizacion` valida TODOS los
 * parámetros del motor antes de calcular nada — si falta un dato o la
 * gracia no cabe en el plazo, lanza `ParametroMotorInvalidoError` (400, con
 * el campo exacto), nunca deja que Decimal.js reciba `undefined`.
 */
import { calcularTablaAmortizacion, ParametroMotorInvalidoError, ParametrosPrestamo } from './amortizacion-v2.util';

const BASE: ParametrosPrestamo = {
  montoPrincipal: 100000,
  frecuencia: 'mensual',
  fechaDesembolso: '2026-10-01',
  fechaPrimerPago: '2026-11-01',
  plazoPeriodos: 12,
  tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
  metodo: 'frances',
};

describe('Caso real empresa 57 (Sentry 7790156766) — gracia(5) >= plazo(2)', () => {
  const params: ParametrosPrestamo = {
    montoPrincipal: 40000,
    frecuencia: 'mensual',
    fechaDesembolso: '2026-10-13',
    fechaPrimerPago: '2026-11-13',
    plazoPeriodos: 2, // plazoMeses de SOL-101
    tasa: { valor: 0.04, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
    metodo: 'frances',
    gracia: { tipo: 'capital', periodos: 5 }, // motorConfig del producto #3
    cargos: [{ concepto: 'COMISION', tipo: 'fijo', monto: 500, momento: 'desembolso', tratamientoDesembolso: 'aparte' }],
  };

  it('ya NO revienta con DecimalError — lanza ParametroMotorInvalidoError (400) con el campo exacto', () => {
    expect(() => calcularTablaAmortizacion(params)).toThrow(ParametroMotorInvalidoError);
    try {
      calcularTablaAmortizacion(params);
      fail('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ParametroMotorInvalidoError);
      expect((e as ParametroMotorInvalidoError).campo).toBe('gracia.periodos');
      expect((e as ParametroMotorInvalidoError).message).toMatch(/MENOR al plazo/);
    }
  });

  it('con el mismo producto pero un plazo que sí deja cuotas (6 meses, gracia 5): calcula sin reventar', () => {
    const r = calcularTablaAmortizacion({ ...params, plazoPeriodos: 6 });
    expect(r.tabla).toHaveLength(6);
    expect(r.tabla[5].saldoRestante).toBe(0);
  });
});

describe('Validación de parámetros del motor — "el motor nunca recibe undefined"', () => {
  it.each([
    ['montoPrincipal', { montoPrincipal: undefined as any }],
    ['frecuencia', { frecuencia: undefined as any }],
    ['fechaDesembolso', { fechaDesembolso: undefined as any }],
    ['fechaPrimerPago', { fechaPrimerPago: undefined as any }],
    ['metodo', { metodo: undefined as any }],
    ['tasa', { tasa: undefined as any }],
    ['tasa.valor', { tasa: { ...BASE.tasa, valor: undefined as any } }],
    ['plazoPeriodos', { plazoPeriodos: undefined as any }],
  ])('campo "%s" faltante: 400 ParametroMotorInvalidoError con ese campo, no un crash', (campoEsperado, override) => {
    const params = { ...BASE, ...override };
    expect(() => calcularTablaAmortizacion(params)).toThrow(ParametroMotorInvalidoError);
    try {
      calcularTablaAmortizacion(params);
    } catch (e) {
      expect((e as ParametroMotorInvalidoError).campo).toBe(campoEsperado);
    }
  });

  it('montoPrincipal = 0 o negativo: 400 con el campo "montoPrincipal"', () => {
    expect(() => calcularTablaAmortizacion({ ...BASE, montoPrincipal: 0 })).toThrow(ParametroMotorInvalidoError);
    expect(() => calcularTablaAmortizacion({ ...BASE, montoPrincipal: -100 })).toThrow(ParametroMotorInvalidoError);
  });

  it('plazoPeriodos no entero o <= 0: 400 con el campo "plazoPeriodos"', () => {
    for (const plazoPeriodos of [0, -1, 1.5]) {
      try {
        calcularTablaAmortizacion({ ...BASE, plazoPeriodos });
        fail('debió lanzar');
      } catch (e) {
        expect(e).toBeInstanceOf(ParametroMotorInvalidoError);
        expect((e as ParametroMotorInvalidoError).campo).toBe('plazoPeriodos');
      }
    }
  });

  it('metodo="personalizado" no exige plazoPeriodos/gracia (usa cuotasPersonalizadas.length)', () => {
    const r = calcularTablaAmortizacion({
      ...BASE,
      plazoPeriodos: undefined as any, // deliberadamente ausente — no debe exigirse para personalizado
      metodo: 'personalizado',
      tasa: { ...BASE.tasa, valor: 0 }, // tasa 0 — una sola cuota = exactamente el principal, sin calcular interés a mano
      cuotasPersonalizadas: [{ fecha: '2026-11-01', montoTotal: 100000 }],
    });
    expect(r.tabla).toHaveLength(1);
  });
});

describe('Gracia vs. plazo — matriz de límites (tipo "capital")', () => {
  it('gracia = 1 período: válido, mínimo posible', () => {
    const r = calcularTablaAmortizacion({ ...BASE, plazoPeriodos: 12, gracia: { tipo: 'capital', periodos: 1 } });
    expect(r.tabla).toHaveLength(12);
    expect(r.tabla[0].esPeriodoGracia).toBe(true);
    expect(r.tabla[0].capital).toBe(0);
  });

  it('gracia = plazo − 1: válido, máximo posible (queda exactamente 1 cuota para pagar capital)', () => {
    const r = calcularTablaAmortizacion({ ...BASE, plazoPeriodos: 6, gracia: { tipo: 'capital', periodos: 5 } });
    expect(r.tabla).toHaveLength(6);
    expect(r.tabla[5].saldoRestante).toBe(0);
    expect(r.tabla[5].capital).toBeGreaterThan(0);
  });

  it('gracia = plazo (igual): rechazada — no queda ninguna cuota para pagar capital', () => {
    expect(() => calcularTablaAmortizacion({ ...BASE, plazoPeriodos: 5, gracia: { tipo: 'capital', periodos: 5 } }))
      .toThrow(ParametroMotorInvalidoError);
  });

  it('gracia > plazo: rechazada (el caso real de empresa 57)', () => {
    expect(() => calcularTablaAmortizacion({ ...BASE, plazoPeriodos: 2, gracia: { tipo: 'capital', periodos: 5 } }))
      .toThrow(ParametroMotorInvalidoError);
  });

  it('gracia.periodos no entero o <= 0: 400 con el campo "gracia.periodos"', () => {
    for (const periodos of [0, -1, 1.5]) {
      try {
        calcularTablaAmortizacion({ ...BASE, gracia: { tipo: 'capital', periodos } });
        fail('debió lanzar');
      } catch (e) {
        expect(e).toBeInstanceOf(ParametroMotorInvalidoError);
        expect((e as ParametroMotorInvalidoError).campo).toBe('gracia.periodos');
      }
    }
  });
});

describe('Gracia vs. plazo — mismos límites con tipo "total" (prorratea/capitaliza/primera_cuota)', () => {
  it.each(['prorratea', 'capitaliza', 'primera_cuota'] as const)(
    'tratamiento "%s": gracia = plazo − 1 válida, gracia >= plazo rechazada',
    (tratamiento) => {
      const valido = calcularTablaAmortizacion({
        ...BASE, plazoPeriodos: 6,
        gracia: { tipo: 'total', periodos: 5, tratamientoInteresGracia: tratamiento },
      });
      expect(valido.tabla).toHaveLength(6);
      expect(valido.tabla[5].saldoRestante).toBe(0);

      expect(() => calcularTablaAmortizacion({
        ...BASE, plazoPeriodos: 5,
        gracia: { tipo: 'total', periodos: 5, tratamientoInteresGracia: tratamiento },
      })).toThrow(ParametroMotorInvalidoError);
    },
  );
});

describe('Gracia vs. plazo — por cada frecuencia y método (matriz representativa)', () => {
  const frecuencias: Array<ParametrosPrestamo['frecuencia']> = ['semanal', 'quincenal', 'mensual', 'bimestral'];
  const metodos: Array<ParametrosPrestamo['metodo']> = ['frances', 'aleman', 'americano', 'flat'];

  it.each(frecuencias)('frecuencia "%s": gracia = plazo − 1 válida, gracia >= plazo rechazada (francés, capital)', (frecuencia) => {
    const comun = { ...BASE, frecuencia, plazoPeriodos: 6 };
    expect(() => calcularTablaAmortizacion({ ...comun, gracia: { tipo: 'capital', periodos: 5 } })).not.toThrow();
    expect(() => calcularTablaAmortizacion({ ...comun, gracia: { tipo: 'capital', periodos: 6 } })).toThrow(ParametroMotorInvalidoError);
  });

  it.each(metodos)('método "%s": gracia = plazo − 1 válida, gracia >= plazo rechazada (mensual, capital)', (metodo) => {
    const comun = { ...BASE, metodo, plazoPeriodos: 6 };
    expect(() => calcularTablaAmortizacion({ ...comun, gracia: { tipo: 'capital', periodos: 5 } })).not.toThrow();
    expect(() => calcularTablaAmortizacion({ ...comun, gracia: { tipo: 'capital', periodos: 6 } })).toThrow(ParametroMotorInvalidoError);
  });
});

describe('solo_interes_luego_amortiza — se normaliza a gracia de capital, mismos límites aplican', () => {
  it('periodosSoloInteres >= plazoPeriodos: rechazada igual que gracia.periodos', () => {
    expect(() => calcularTablaAmortizacion({
      ...BASE, plazoPeriodos: 3, metodo: 'solo_interes_luego_amortiza',
      periodosSoloInteres: 3, metodoPosteriorGracia: 'frances',
    })).toThrow(ParametroMotorInvalidoError);
  });

  it('periodosSoloInteres < plazoPeriodos: válido', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, plazoPeriodos: 6, metodo: 'solo_interes_luego_amortiza',
      periodosSoloInteres: 2, metodoPosteriorGracia: 'frances',
    });
    expect(r.tabla).toHaveLength(6);
  });
});
