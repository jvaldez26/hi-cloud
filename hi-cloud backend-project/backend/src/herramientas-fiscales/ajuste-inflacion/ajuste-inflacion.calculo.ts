import Decimal from 'decimal.js';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

/**
 * Calculadora de Ajuste por Inflación (Commit 6 de Herramientas
 * Fiscales) — función PURA. costoAjustado = costoFiscal × (índice del año
 * de enajenación / índice del año de adquisición); ganancia o pérdida de
 * capital = valor de enajenación − costoAjustado. La tabla de índices
 * ('indice_inflacion_dgii', clave por año) ya está sembrada desde el
 * Commit 1 con valor NULL — PENDIENTE_VALIDACION — así que esta
 * calculadora no puede producir un resultado hasta que Jean cargue los
 * índices reales publicados por la DGII.
 *
 * `categoria` se recibe y se refleja en el resultado (trazabilidad /
 * reportes) pero no cambia el cálculo — el índice DGII es único por año,
 * no por categoría de activo, salvo que Jean indique lo contrario al
 * validar el parámetro.
 */

export interface TramoParametro<T> {
  valor: T | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  estado: 'VALIDADO' | 'PENDIENTE_VALIDACION';
}

export type ValorIndiceInflacion = Record<string, number>; // año ('YYYY') → índice DGII

export interface EntradaAjusteInflacion {
  costoFiscal: number;
  fechaAdquisicion: string;  // 'YYYY-MM-DD'
  fechaEnajenacion: string;  // 'YYYY-MM-DD' — venta o cierre de ejercicio
  categoria: string;
  valorEnajenacion: number;  // precio de venta, o valor de mercado al cierre
}

export interface ResultadoAjusteInflacion {
  categoria: string;
  anioAdquisicion: number;
  anioEnajenacion: number;
  indiceAdquisicion: number;
  indiceEnajenacion: number;
  factorAjuste: number; // 4 decimales
  costoFiscal: number;
  costoAjustado: number;
  valorEnajenacion: number;
  gananciaPerdidaCapital: number; // positivo = ganancia, negativo = pérdida
}

function resolverValor<T>(tramo: TramoParametro<T> | null, fecha: string, clave: string): T {
  if (!tramo) throw new ParametroFiscalNoEncontradoError(clave, fecha);
  if (tramo.estado !== 'VALIDADO' || tramo.valor === null) throw new ParametroFiscalPendienteError(clave, fecha);
  return tramo.valor;
}

function indiceDelAnio(tabla: ValorIndiceInflacion, anio: number): Decimal {
  const indice = tabla[String(anio)];
  if (indice === undefined) {
    throw new Error(`No hay índice de inflación DGII cargado para el año ${anio} en la tabla 'indice_inflacion_dgii'.`);
  }
  return new Decimal(indice);
}

export function calcularAjusteInflacion(
  e: EntradaAjusteInflacion, tramo: TramoParametro<ValorIndiceInflacion> | null,
): ResultadoAjusteInflacion {
  if (e.fechaEnajenacion < e.fechaAdquisicion) {
    throw new Error('La fecha de enajenación/cierre no puede ser anterior a la fecha de adquisición.');
  }

  const tabla = resolverValor(tramo, e.fechaEnajenacion, 'indice_inflacion_dgii');
  const anioAdquisicion = Number(e.fechaAdquisicion.slice(0, 4));
  const anioEnajenacion = Number(e.fechaEnajenacion.slice(0, 4));

  const indiceAdquisicion = indiceDelAnio(tabla, anioAdquisicion);
  const indiceEnajenacion = indiceDelAnio(tabla, anioEnajenacion);

  const factorAjuste = indiceEnajenacion.div(indiceAdquisicion).toDecimalPlaces(4);
  const costoAjustado = new Decimal(e.costoFiscal).times(factorAjuste).toDecimalPlaces(2);
  const gananciaPerdidaCapital = new Decimal(e.valorEnajenacion).minus(costoAjustado).toDecimalPlaces(2);

  return {
    categoria: e.categoria,
    anioAdquisicion, anioEnajenacion,
    indiceAdquisicion: indiceAdquisicion.toNumber(),
    indiceEnajenacion: indiceEnajenacion.toNumber(),
    factorAjuste: factorAjuste.toNumber(),
    costoFiscal: e.costoFiscal,
    costoAjustado: costoAjustado.toNumber(),
    valorEnajenacion: e.valorEnajenacion,
    gananciaPerdidaCapital: gananciaPerdidaCapital.toNumber(),
  };
}
