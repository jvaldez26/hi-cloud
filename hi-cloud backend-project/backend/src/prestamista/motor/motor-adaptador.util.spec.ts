/**
 * Motor v2 — Fase 2B. Puente configuración (BD) ↔ motor puro.
 */
import { resolverMotorConfig, aplicarOverridesSolicitud, construirParametrosPrestamo, configFiscalVacia } from './motor-adaptador.util';

describe('resolverMotorConfig', () => {
  it('producto con motorConfig explícito: se usa tal cual', () => {
    const producto = { motorConfig: { frecuencia: 'semanal', tasa: { valor: 0.01, periodoExpresado: 'semanal', tipo: 'nominal', baseDias: 360 }, metodo: 'aleman' } };
    expect(resolverMotorConfig(producto).frecuencia).toBe('semanal');
  });

  it('producto legacy (sin motorConfig): sintetiza francés/alemán mensual nominal desde los campos planos', () => {
    const producto = { motorConfig: null, tasaInteresMensual: 3, metodoAmortizacion: 'aleman', porcentajeMora: 5 };
    const config = resolverMotorConfig(producto);
    expect(config.frecuencia).toBe('mensual');
    expect(config.metodo).toBe('aleman');
    expect(config.tasa).toEqual({ valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 });
    expect(config.mora).toEqual({ base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360 });
    expect(config.cargos).toBeUndefined(); // cargoCierre nunca se traduce a un cargo real
  });
});

describe('aplicarOverridesSolicitud', () => {
  const base = { frecuencia: 'mensual' as const, tasa: { valor: 0.03, periodoExpresado: 'mensual' as const, tipo: 'nominal' as const, baseDias: 360 as const }, metodo: 'frances' as const };

  it('sin overrides: devuelve la config igual', () => {
    expect(aplicarOverridesSolicitud(base, {})).toEqual(base);
  });

  it('ajusta la tasa si viene tasaInteresMensual en la solicitud', () => {
    const r = aplicarOverridesSolicitud(base, { tasaInteresMensual: 4 });
    expect(r.tasa.valor).toBe(0.04);
  });

  it('ajusta la frecuencia si se pide', () => {
    const r = aplicarOverridesSolicitud(base, { frecuencia: 'quincenal' });
    expect(r.frecuencia).toBe('quincenal');
  });

  it('si el producto NO permite ajuste (permiteAjusteSolicitud=false), ignora los overrides', () => {
    const r = aplicarOverridesSolicitud({ ...base, permiteAjusteSolicitud: false }, { tasaInteresMensual: 10, frecuencia: 'semanal' });
    expect(r.tasa.valor).toBe(0.03);
    expect(r.frecuencia).toBe('mensual');
  });

  it('no muta la config original', () => {
    const copia = { ...base, tasa: { ...base.tasa } };
    aplicarOverridesSolicitud(copia, { tasaInteresMensual: 9 });
    expect(copia.tasa.valor).toBe(0.03);
  });

  it('REGRESIÓN: tasaInteresMensual=null (solicitud aprobada sin tasaAprobada explícita) NO pone la tasa en 0', () => {
    // El merge típico es `data.tasaInteresMensual ?? sol.tasaAprobada` — si
    // ninguno de los dos vino, el resultado es null (no undefined), y
    // null/100 = 0 silenciosamente si el chequeo es "!== undefined".
    const r = aplicarOverridesSolicitud(base, { tasaInteresMensual: null as any });
    expect(r.tasa.valor).toBe(0.03);
  });

  it('REGRESIÓN: frecuencia=null tampoco pisa la frecuencia del producto', () => {
    const r = aplicarOverridesSolicitud(base, { frecuencia: null as any });
    expect(r.frecuencia).toBe('mensual');
  });
});

describe('construirParametrosPrestamo', () => {
  it('arma los ParametrosPrestamo completos, incluido el calendario de feriados para diaria', () => {
    const config = {
      frecuencia: 'diaria' as const,
      frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: true },
      tasa: { valor: 0.03, periodoExpresado: 'mensual' as const, tipo: 'nominal' as const, baseDias: 360 as const },
      metodo: 'frances' as const,
    };
    const feriados = new Set(['2026-12-25']);
    const params = construirParametrosPrestamo(config, {
      montoPrincipal: 10000, fechaDesembolso: '2026-10-01', fechaPrimerPago: '2026-10-02', plazoPeriodos: 5,
    }, feriados);

    expect(params.frecuencia).toBe('diaria');
    expect(params.diaria?.excluirDomingos).toBe(true);
    expect(params.diaria?.feriados).toBe(feriados);
    expect(params.montoPrincipal).toBe(10000);
  });
});

describe('configFiscalVacia', () => {
  it('nace con los 5 conceptos base, los tres campos en null', () => {
    const fiscal = configFiscalVacia();
    expect(Object.keys(fiscal).sort()).toEqual(['apertura', 'gastos', 'interes', 'mora', 'seguro']);
    for (const concepto of Object.values(fiscal)) {
      expect(concepto).toEqual({ generaComprobante: null, tipoEcf: null, tratamientoItbis: null });
    }
  });
});
