import Decimal from 'decimal.js';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

/**
 * Calculadora de Proporcionalidad del ITBIS (Commit 5 de Herramientas
 * Fiscales) — función PURA. Factor = (ventas gravadas + exportaciones) /
 * ventas totales, con 4 decimales; ITBIS deducible = ITBIS común × factor,
 * redondeado a 2 decimales como todo resultado final. La periodicidad
 * (mensual con ajuste anual, o solo anual) es un PARÁMETRO — el enunciado
 * la marca así explícitamente — y hoy está PENDIENTE_VALIDACION (clave
 * 'proporcionalidad_itbis_periodo', Commit 5), así que esta calculadora no
 * puede producir un resultado hasta que Jean confirme cuál aplica.
 */

export interface TramoParametro<T> {
  valor: T | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  estado: 'VALIDADO' | 'PENDIENTE_VALIDACION';
}

export type PeriodoProrrata = 'mensualConAjusteAnual' | 'anual';
export type ValorPeriodoProrrata = { periodo: PeriodoProrrata };

export interface EntradaProporcionalidadItbis {
  fecha: string; // 'YYYY-MM-DD'
  ventasGravadas: number;
  ventasExportaciones: number;
  ventasExentas: number;
  itbisComun: number; // ITBIS de costos y gastos comunes, no atribuible directamente a un tipo de venta
}

export interface ResultadoProporcionalidadItbis {
  periodo: PeriodoProrrata;
  ventasTotales: number;
  factor: number; // 4 decimales
  itbisComun: number;
  itbisDeducible: number;
  itbisNoDeducible: number;
}

function resolverValor<T>(tramo: TramoParametro<T> | null, fecha: string, clave: string): T {
  if (!tramo) throw new ParametroFiscalNoEncontradoError(clave, fecha);
  if (tramo.estado !== 'VALIDADO' || tramo.valor === null) throw new ParametroFiscalPendienteError(clave, fecha);
  return tramo.valor;
}

export function calcularProporcionalidadItbis(
  e: EntradaProporcionalidadItbis, tramoPeriodo: TramoParametro<ValorPeriodoProrrata> | null,
): ResultadoProporcionalidadItbis {
  const { periodo } = resolverValor(tramoPeriodo, e.fecha, 'proporcionalidad_itbis_periodo');

  const ventasTotales = new Decimal(e.ventasGravadas).plus(e.ventasExportaciones).plus(e.ventasExentas);
  if (ventasTotales.isZero()) {
    throw new Error('Las ventas totales del período son cero — no se puede calcular el factor de proporcionalidad.');
  }

  const factor = new Decimal(e.ventasGravadas).plus(e.ventasExportaciones).div(ventasTotales).toDecimalPlaces(4);
  const itbisDeducible = new Decimal(e.itbisComun).times(factor).toDecimalPlaces(2);
  const itbisNoDeducible = new Decimal(e.itbisComun).minus(itbisDeducible).toDecimalPlaces(2);

  return {
    periodo,
    ventasTotales: ventasTotales.toDecimalPlaces(2).toNumber(),
    factor: factor.toNumber(),
    itbisComun: e.itbisComun,
    itbisDeducible: itbisDeducible.toNumber(),
    itbisNoDeducible: itbisNoDeducible.toNumber(),
  };
}
