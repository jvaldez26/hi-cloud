import { calcularAnticiposISR, elegirRegimen, ParametrosAnticiposISR } from './anticipos-isr.calculo';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

describe('elegirRegimen', () => {
  it('ejercicio 2026 → TET', () => {
    expect(elegirRegimen('2026-01-01')).toBe('TET');
  });
  it('ejercicio 2027 → LEY_30_26', () => {
    expect(elegirRegimen('2027-01-01')).toBe('LEY_30_26');
  });
  it('ejercicio muy anterior sigue en TET', () => {
    expect(elegirRegimen('2021-06-01')).toBe('TET');
  });
});

describe('calcularAnticiposISR — parámetros PENDIENTES (estado real del sistema hoy)', () => {
  it('régimen TET sin parámetro (null) lanza ParametroFiscalNoEncontradoError', () => {
    const parametros: ParametrosAnticiposISR = { tramo: null };
    expect(() => calcularAnticiposISR(
      { isrEjercicioAnterior: 1_000_000, fechaInicioEjercicio: '2026-01-01' }, parametros,
    )).toThrow(ParametroFiscalNoEncontradoError);
  });

  it('régimen TET con tramo PENDIENTE_VALIDACION lanza ParametroFiscalPendienteError', () => {
    const parametros: ParametrosAnticiposISR = {
      tramo: { valor: null, vigenciaDesde: '2020-01-01', vigenciaHasta: '2026-12-31', estado: 'PENDIENTE_VALIDACION' },
    };
    expect(() => calcularAnticiposISR(
      { isrEjercicioAnterior: 1_000_000, fechaInicioEjercicio: '2026-06-01' }, parametros,
    )).toThrow(ParametroFiscalPendienteError);
  });

  it('régimen LEY_30_26 con tramo PENDIENTE_VALIDACION lanza ParametroFiscalPendienteError', () => {
    const parametros: ParametrosAnticiposISR = {
      tramo: { valor: null, vigenciaDesde: '2027-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' },
    };
    expect(() => calcularAnticiposISR(
      { isrEjercicioAnterior: 1_000_000, fechaInicioEjercicio: '2027-01-01', tamanoEmpresa: 'medianaGrande' }, parametros,
    )).toThrow(ParametroFiscalPendienteError);
  });

  it('el mensaje de error nombra la clave correcta según el régimen elegido', () => {
    const parametros: ParametrosAnticiposISR = { tramo: null };
    try {
      calcularAnticiposISR({ isrEjercicioAnterior: 500_000, fechaInicioEjercicio: '2027-03-01' }, parametros);
      fail('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ParametroFiscalNoEncontradoError);
      expect((err as ParametroFiscalNoEncontradoError).clave).toBe('anticipos_isr_ley30_26');
    }
  });
});

// ── Casos dorados — bloqueados hasta que Jean valide las tasas/tramos reales.
// Se dejan aquí, ya redactados con la forma de entrada/salida esperada, para
// activarlos (quitar el .skip lógico) en cuanto haya un valor VALIDADO.
describe.skip('calcularAnticiposISR — casos dorados (pendientes de validación de Jean)', () => {
  it.todo('TET: ISR del ejercicio anterior de RD$1,200,000 con tasa y cuotas validadas produce el monto por cuota correcto');
  it.todo('TET: calendario de vencimientos cae en el día y periodicidad validados, sin saltarse ningún mes');
  it.todo('LEY_30_26: microempresa exenta → anticipoAnualTotal = 0 y calendario vacío, con aviso de exención');
  it.todo('LEY_30_26: mediana/grande con tasa validada produce el monto por cuota y calendario correctos');
});
