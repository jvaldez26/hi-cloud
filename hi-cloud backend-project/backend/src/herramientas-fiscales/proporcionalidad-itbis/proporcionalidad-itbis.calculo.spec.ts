import { calcularProporcionalidadItbis } from './proporcionalidad-itbis.calculo';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

describe('calcularProporcionalidadItbis — parámetro PENDIENTE (estado real del sistema hoy)', () => {
  const entradaBase = {
    fecha: '2026-06-01',
    ventasGravadas: 600_000,
    ventasExportaciones: 200_000,
    ventasExentas: 200_000,
    itbisComun: 50_000,
  };

  it('sin parámetro (null) lanza ParametroFiscalNoEncontradoError', () => {
    expect(() => calcularProporcionalidadItbis(entradaBase, null)).toThrow(ParametroFiscalNoEncontradoError);
  });

  it('con tramo PENDIENTE_VALIDACION lanza ParametroFiscalPendienteError', () => {
    const tramo = { valor: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'PENDIENTE_VALIDACION' as const };
    expect(() => calcularProporcionalidadItbis(entradaBase, tramo)).toThrow(ParametroFiscalPendienteError);
  });

  it('el error nombra la clave correcta', () => {
    try {
      calcularProporcionalidadItbis(entradaBase, null);
      fail('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ParametroFiscalNoEncontradoError);
      expect((err as ParametroFiscalNoEncontradoError).clave).toBe('proporcionalidad_itbis_periodo');
    }
  });
});

describe('calcularProporcionalidadItbis — validación de entrada (con un tramo hipotéticamente validado)', () => {
  it('ventas totales en cero lanza error de negocio, no una división por cero silenciosa', () => {
    const entradaCero = { fecha: '2026-06-01', ventasGravadas: 0, ventasExportaciones: 0, ventasExentas: 0, itbisComun: 10_000 };
    const tramoHipotetico = { valor: { periodo: 'anual' as const }, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'VALIDADO' as const };
    expect(() => calcularProporcionalidadItbis(entradaCero, tramoHipotetico)).toThrow(/ventas totales/i);
  });
});

// ── Casos dorados — bloqueados hasta que Jean valide la periodicidad
// ('proporcionalidad_itbis_periodo'). La fórmula del factor y del ITBIS
// deducible ya está fijada por el enunciado, pero la calculadora completa
// no puede correr sin ese parámetro — ver el describe anterior.
describe.skip('calcularProporcionalidadItbis — casos dorados (pendientes de validación de Jean)', () => {
  it.todo('gravadas 600,000 + exportaciones 200,000 + exentas 200,000 → factor 0.8000, ITBIS común 50,000 → deducible 40,000.00');
  it.todo('periodo mensualConAjusteAnual: el resultado de cada mes se marca como provisional hasta la regularización de fin de año');
  it.todo('periodo anual: un solo cálculo por ejercicio, sin regularización posterior');
});
