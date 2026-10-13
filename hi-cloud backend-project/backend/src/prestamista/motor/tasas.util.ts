import Decimal from 'decimal.js';
import { d } from './dinero.util';

/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §2.
 */

export type PeriodoTasa = 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'anual';
export type TipoTasa = 'nominal' | 'efectiva';
export type BaseDias = 360 | 365;

export type FrecuenciaRegular =
  | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

/** §2.1 — períodos por año, fijos por calendario, para las frecuencias regulares. */
const PERIODOS_POR_ANIO_REGULAR: Record<FrecuenciaRegular, number> = {
  semanal: 52,
  quincenal: 24,
  mensual: 12,
  bimestral: 6,
  trimestral: 4,
  semestral: 2,
  anual: 1,
};

export function periodosPorAnioRegular(frecuencia: FrecuenciaRegular): number {
  return PERIODOS_POR_ANIO_REGULAR[frecuencia];
}

/** periodosPorAño de `periodoExpresado` (el período en que el usuario capturó la tasa). */
function periodosPorAnioExpresado(periodo: PeriodoTasa, baseDias: BaseDias): number {
  if (periodo === 'diaria') return baseDias;
  return PERIODOS_POR_ANIO_REGULAR[periodo as FrecuenciaRegular];
}

export interface ParametrosTasa {
  valor: number;
  periodoExpresado: PeriodoTasa;
  tipo: TipoTasa;
  baseDias: BaseDias;
}

/**
 * §2.2 — tasa ingresada → tasa del período de pago, para frecuencias
 * regulares (semanal a anual). `i` constante, igual en todos los períodos.
 */
export function tasaPeriodoPagoRegular(tasa: ParametrosTasa, frecuenciaPago: FrecuenciaRegular): Decimal {
  const m = periodosPorAnioExpresado(tasa.periodoExpresado, tasa.baseDias);
  const p = periodosPorAnioRegular(frecuenciaPago);
  const valor = d(tasa.valor);

  if (tasa.tipo === 'nominal') {
    const tasaAnualNominal = valor.times(m);
    return tasaAnualNominal.div(p);
  }
  // efectiva
  const tasaAnualEfectiva = d(1).plus(valor).pow(m).minus(1);
  return d(1).plus(tasaAnualEfectiva).pow(d(1).div(p)).minus(1);
}

/**
 * §2.4 — tasa diaria para `diaria`/`único`/`personalizado`. Deriva de
 * `baseDias` (360/365), no de un número fijo de "períodos de un día".
 */
export function tasaDiaria(tasa: ParametrosTasa): Decimal {
  const m = periodosPorAnioExpresado(tasa.periodoExpresado, tasa.baseDias);
  const valor = d(tasa.valor);

  if (tasa.tipo === 'nominal') {
    const tasaAnualNominal = valor.times(m);
    return tasaAnualNominal.div(tasa.baseDias);
  }
  // efectiva
  const tasaAnualEfectiva = d(1).plus(valor).pow(m).minus(1);
  return d(1).plus(tasaAnualEfectiva).pow(d(1).div(tasa.baseDias)).minus(1);
}

/** §2.3 — qué se muestra siempre en pantalla, dado un `tasaPeriodoPago` y los períodos/año de ese período. */
export function resumenTasaParaMostrar(tasaPeriodoPago: Decimal, periodosPorAnio: number) {
  const tasaAnualNominal = tasaPeriodoPago.times(periodosPorAnio);
  const tea = d(1).plus(tasaPeriodoPago).pow(periodosPorAnio).minus(1);
  return {
    tasaEquivalentePorPeriodo: tasaPeriodoPago.toNumber(),
    tasaAnualNominal: tasaAnualNominal.toNumber(),
    tea: tea.toNumber(),
  };
}
