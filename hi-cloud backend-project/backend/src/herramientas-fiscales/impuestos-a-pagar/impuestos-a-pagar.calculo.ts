import Decimal from 'decimal.js';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

/**
 * Impuestos a Pagar (Commit 3 de Herramientas Fiscales) — Fase 1: ITBIS,
 * ISR PJ, ISR asalariados, ISR persona física (IR-1), retenciones IR-17,
 * dividendos. Cada uno es un calculador PURO registrado en CALCULADORES
 * {tipo → función} — agregar IPI, transferencia inmobiliaria, sucesiones,
 * ISC u operaciones financieras (Fase 2) es añadir una entrada, no tocar
 * el resto. Todas leen su(s) parámetro(s) ya resueltos — nunca BD aquí.
 */

export interface TramoParametro<T> {
  valor: T | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  estado: 'VALIDADO' | 'PENDIENTE_VALIDACION';
}

function resolverValor<T>(tramo: TramoParametro<T> | null, fecha: string, clave: string): T {
  if (!tramo) throw new ParametroFiscalNoEncontradoError(clave, fecha);
  if (tramo.estado !== 'VALIDADO' || tramo.valor === null) throw new ParametroFiscalPendienteError(clave, fecha);
  return tramo.valor;
}

// ── ITBIS ────────────────────────────────────────────────────────────────

export interface EntradaItbis {
  fecha: string;
  debitoFiscal: number;      // ITBIS facturado en ventas
  creditoFiscal: number;     // ITBIS pagado en compras/gastos, deducible
  retencionesSufridas: number; // ITBIS que le retuvieron a esta empresa
  saldoAFavorAnterior: number;
}
export interface ResultadoItbis {
  debitoFiscal: number; creditoFiscal: number; retencionesSufridas: number;
  saldoAFavorAnterior: number; itbisAPagar: number; saldoAFavorNuevo: number;
}
export function calcularItbis(e: EntradaItbis): ResultadoItbis {
  const neto = new Decimal(e.debitoFiscal)
    .minus(e.creditoFiscal).minus(e.retencionesSufridas).minus(e.saldoAFavorAnterior)
    .toDecimalPlaces(2);
  return {
    debitoFiscal: e.debitoFiscal, creditoFiscal: e.creditoFiscal,
    retencionesSufridas: e.retencionesSufridas, saldoAFavorAnterior: e.saldoAFavorAnterior,
    itbisAPagar:     neto.greaterThan(0) ? neto.toNumber() : 0,
    saldoAFavorNuevo: neto.lessThan(0) ? neto.abs().toNumber() : 0,
  };
}

// ── ISR Personas Jurídicas ──────────────────────────────────────────────

export type ValorIsrPj = { general: number; transitorio: { tasa: number; umbralIngresos: number; desde: number; hasta: number } };
export interface EntradaIsrPj {
  anio: number;
  rentaNetaImponible: number;
  ingresosTotales: number; // para evaluar el umbral del régimen transitorio
  anticipos: number; retenciones: number; saldoAFavorAnterior: number;
}
export interface ResultadoIsrPj {
  tasaAplicada: number; regimen: 'general' | 'transitorio';
  impuestoBruto: number; anticipos: number; retenciones: number; saldoAFavorAnterior: number;
  isrAPagar: number; saldoAFavorNuevo: number;
}
export function calcularIsrPj(e: EntradaIsrPj, tramo: TramoParametro<ValorIsrPj> | null): ResultadoIsrPj {
  const valor = resolverValor(tramo, `${e.anio}-01-01`, 'isr_pj');
  const enTransitorio = e.ingresosTotales > valor.transitorio.umbralIngresos
    && e.anio >= valor.transitorio.desde && e.anio <= valor.transitorio.hasta;
  const tasa = enTransitorio ? valor.transitorio.tasa : valor.general;

  const bruto = new Decimal(e.rentaNetaImponible).times(tasa).div(100).toDecimalPlaces(2);
  const neto = bruto.minus(e.anticipos).minus(e.retenciones).minus(e.saldoAFavorAnterior).toDecimalPlaces(2);

  return {
    tasaAplicada: tasa, regimen: enTransitorio ? 'transitorio' : 'general',
    impuestoBruto: bruto.toNumber(),
    anticipos: e.anticipos, retenciones: e.retenciones, saldoAFavorAnterior: e.saldoAFavorAnterior,
    isrAPagar:        neto.greaterThan(0) ? neto.toNumber() : 0,
    saldoAFavorNuevo: neto.lessThan(0) ? neto.abs().toNumber() : 0,
  };
}

// ── Escala ISR Personas Físicas — compartida por asalariados e IR-1 ──────

export type TramoEscalaIsrPf = { limiteSuperior: number | null; tasa: number; excesoSobre: number; acumuladoFijo: number };
export type ValorEscalaIsrPf = { exento: number; tramos: TramoEscalaIsrPf[] };

/** Aplica la escala progresiva del Art. 296 sobre una renta ANUAL. */
function aplicarEscalaIsrPf(rentaAnual: number, escala: ValorEscalaIsrPf): { isrAnual: Decimal; tramo: string } {
  if (rentaAnual <= escala.exento) return { isrAnual: new Decimal(0), tramo: 'Exento' };
  const tramo = escala.tramos.find(t => t.limiteSuperior === null || rentaAnual <= t.limiteSuperior);
  if (!tramo) throw new Error('La escala ISR PF no tiene un tramo que cubra este monto — parámetro incompleto.');
  const exceso = new Decimal(rentaAnual).minus(tramo.excesoSobre);
  const isrAnual = exceso.times(tramo.tasa).div(100).plus(tramo.acumuladoFijo);
  return { isrAnual, tramo: `${tramo.tasa}%` };
}

export interface EntradaIsrAsalariados {
  anio: number;
  periodo: 'mensual' | 'anual';
  rentaNetaGravable: number; // si periodo='mensual', es el salario neto de ese mes (después de AFP/SFS)
}
export interface ResultadoIsrAsalariados {
  rentaNetaAnual: number; tramo: string; isrAnual: number; isrDelPeriodo: number;
}
export function calcularIsrAsalariados(
  e: EntradaIsrAsalariados, tramo: TramoParametro<ValorEscalaIsrPf> | null,
): ResultadoIsrAsalariados {
  const escala = resolverValor(tramo, `${e.anio}-01-01`, 'escala_isr_pf');
  const rentaAnual = e.periodo === 'mensual' ? new Decimal(e.rentaNetaGravable).times(12) : new Decimal(e.rentaNetaGravable);
  const { isrAnual, tramo: nombreTramo } = aplicarEscalaIsrPf(rentaAnual.toNumber(), escala);
  const isrDelPeriodo = e.periodo === 'mensual' ? isrAnual.div(12) : isrAnual;

  return {
    rentaNetaAnual: rentaAnual.toDecimalPlaces(2).toNumber(),
    tramo: nombreTramo,
    isrAnual: isrAnual.toDecimalPlaces(2).toNumber(),
    isrDelPeriodo: isrDelPeriodo.toDecimalPlaces(2).toNumber(),
  };
}

export interface EntradaIsrPf {
  anio: number;
  rentaNetaImponibleAnual: number; // IR-1: renta de trabajo independiente/otras rentas, ya neta
  retenciones: number; anticipos: number;
}
export interface ResultadoIsrPf {
  rentaNetaAnual: number; tramo: string; isrAnual: number;
  retenciones: number; anticipos: number; isrAPagar: number; saldoAFavorNuevo: number;
}
export function calcularIsrPf(e: EntradaIsrPf, tramo: TramoParametro<ValorEscalaIsrPf> | null): ResultadoIsrPf {
  const escala = resolverValor(tramo, `${e.anio}-01-01`, 'escala_isr_pf');
  const { isrAnual, tramo: nombreTramo } = aplicarEscalaIsrPf(e.rentaNetaImponibleAnual, escala);
  const neto = isrAnual.minus(e.retenciones).minus(e.anticipos).toDecimalPlaces(2);

  return {
    rentaNetaAnual: e.rentaNetaImponibleAnual, tramo: nombreTramo,
    isrAnual: isrAnual.toDecimalPlaces(2).toNumber(),
    retenciones: e.retenciones, anticipos: e.anticipos,
    isrAPagar:        neto.greaterThan(0) ? neto.toNumber() : 0,
    saldoAFavorNuevo: neto.lessThan(0) ? neto.abs().toNumber() : 0,
  };
}

// ── Retenciones IR-17 (por concepto) ─────────────────────────────────────

export interface EntradaRetencionIR17 {
  fecha: string;
  concepto: string; // clave dentro del jsonb de retenciones_ir17, p. ej. 'alquileres'
  montoBruto: number;
}
export interface ResultadoRetencionIR17 {
  concepto: string; tasaAplicada: number; montoRetenido: number; montoNeto: number;
}
export function calcularRetencionIR17(
  e: EntradaRetencionIR17, tramo: TramoParametro<Record<string, number>> | null,
): ResultadoRetencionIR17 {
  const tabla = resolverValor(tramo, e.fecha, 'retenciones_ir17');
  const tasa = tabla[e.concepto];
  if (tasa === undefined) {
    throw new Error(`El concepto "${e.concepto}" no está en la tabla de retenciones IR-17 vigente al ${e.fecha}.`);
  }
  const retenido = new Decimal(e.montoBruto).times(tasa).div(100).toDecimalPlaces(2);
  return {
    concepto: e.concepto, tasaAplicada: tasa,
    montoRetenido: retenido.toNumber(),
    montoNeto: new Decimal(e.montoBruto).minus(retenido).toDecimalPlaces(2).toNumber(),
  };
}

// ── Dividendos ────────────────────────────────────────────────────────────

export interface EntradaDividendos {
  fecha: string;
  montoDistribuido: number;
}
export interface ResultadoDividendos {
  tasaAplicada: number; isrRetenido: number; montoNeto: number;
}
export function calcularDividendos(
  e: EntradaDividendos, tramo: TramoParametro<{ tasa: number }> | null,
): ResultadoDividendos {
  const valor = resolverValor(tramo, e.fecha, 'isr_dividendos');
  const retenido = new Decimal(e.montoDistribuido).times(valor.tasa).div(100).toDecimalPlaces(2);
  return {
    tasaAplicada: valor.tasa,
    isrRetenido: retenido.toNumber(),
    montoNeto: new Decimal(e.montoDistribuido).minus(retenido).toDecimalPlaces(2).toNumber(),
  };
}
