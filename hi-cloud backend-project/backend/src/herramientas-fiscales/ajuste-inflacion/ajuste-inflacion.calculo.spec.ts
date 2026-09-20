import { calcularAjusteInflacion } from './ajuste-inflacion.calculo';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

describe('calcularAjusteInflacion — parámetro PENDIENTE (estado real del sistema hoy)', () => {
  const entradaBase = {
    costoFiscal: 1_000_000,
    fechaAdquisicion: '2020-03-01',
    fechaEnajenacion: '2026-06-01',
    categoria: 'inmueble',
    valorEnajenacion: 1_500_000,
  };

  it('sin parámetro (null) lanza ParametroFiscalNoEncontradoError', () => {
    expect(() => calcularAjusteInflacion(entradaBase, null)).toThrow(ParametroFiscalNoEncontradoError);
  });

  it('con tramo PENDIENTE_VALIDACION lanza ParametroFiscalPendienteError', () => {
    const tramo = { valor: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' as const };
    expect(() => calcularAjusteInflacion(entradaBase, tramo)).toThrow(ParametroFiscalPendienteError);
  });

  it('el error nombra la clave correcta', () => {
    try {
      calcularAjusteInflacion(entradaBase, null);
      fail('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ParametroFiscalNoEncontradoError);
      expect((err as ParametroFiscalNoEncontradoError).clave).toBe('indice_inflacion_dgii');
    }
  });
});

describe('calcularAjusteInflacion — validación de entrada (no depende del parámetro)', () => {
  it('fecha de enajenación anterior a la de adquisición lanza error antes de resolver el parámetro', () => {
    const entradaInvalida = {
      costoFiscal: 1_000_000, fechaAdquisicion: '2026-06-01', fechaEnajenacion: '2020-01-01',
      categoria: 'inmueble', valorEnajenacion: 1_500_000,
    };
    expect(() => calcularAjusteInflacion(entradaInvalida, null)).toThrow(/anterior a la fecha de adquisición/i);
  });

  it('año de adquisición ausente en la tabla de índices lanza error nombrando el año', () => {
    const tramo = {
      valor: { '2026': 120.5 }, // falta 2020, el año de adquisición
      vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'VALIDADO' as const,
    };
    const entrada = {
      costoFiscal: 1_000_000, fechaAdquisicion: '2020-03-01', fechaEnajenacion: '2026-06-01',
      categoria: 'inmueble', valorEnajenacion: 1_500_000,
    };
    expect(() => calcularAjusteInflacion(entrada, tramo)).toThrow(/2020/);
  });
});

// ── Casos dorados — bloqueados hasta que Jean cargue los índices de
// inflación DGII reales por año.
describe.skip('calcularAjusteInflacion — casos dorados (pendientes de validación de Jean)', () => {
  it.todo('costo fiscal 1,000,000 adquirido en un año con índice validado, enajenado en otro con índice validado → costo ajustado y factor correctos');
  it.todo('ganancia de capital: valor de enajenación mayor que el costo ajustado');
  it.todo('pérdida de capital: valor de enajenación menor que el costo ajustado');
  it.todo('mismo año de adquisición y enajenación → factor 1.0000, costo ajustado = costo fiscal');
});
