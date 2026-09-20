import Decimal from 'decimal.js';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

/**
 * Calculadora de recargos e intereses por mora (Commit 2 de Herramientas
 * Fiscales) — función PURA: nada de BD, nada de Date.now(), toda fecha
 * entra como 'YYYY-MM-DD' y sale igual. El service (impuro) resuelve los
 * parámetros vigentes contra ParametrosFiscalesService y le pasa a esta
 * función las listas completas — la función misma decide, por fecha, qué
 * fila de cada lista aplica a cada mes de mora. Así se puede probar sin
 * levantar ninguna base de datos: los tests le dan arrays fijos.
 */

export type Situacion =
  | 'normal'
  | 'rectificacionVoluntaria'
  | 'aceptaEnAuditoria'
  | 'pagoTras30diasResolucion'
  | 'desisteRecurso';

export type ValorRecargoMoraViejo = { primerMes: number; mesesSiguientes: number; tope: number | null };
export type ValorRecargoMoraNuevo = { porMes: number; topePct: number };
export type ValorRecargoMora = ValorRecargoMoraViejo | ValorRecargoMoraNuevo;

export interface TramoParametro<T> {
  valor: T | null;
  vigenciaDesde: string;         // 'YYYY-MM-DD'
  vigenciaHasta: string | null;
  estado: 'VALIDADO' | 'PENDIENTE_VALIDACION';
}

export interface EntradaRecargosIntereses {
  montoAdeudado: number;
  fechaLimite: string;   // 'YYYY-MM-DD' — vencimiento original
  fechaPago: string;     // 'YYYY-MM-DD'
  situacion: Situacion;
  acogeAmnistia: boolean;
}

export interface ParametrosRecargosIntereses {
  tramosRecargoMora: TramoParametro<ValorRecargoMora>[];
  tramosInteres: TramoParametro<number>[];
  tramoModoInteres: TramoParametro<{ modo: 'simple' | 'acumulativo' }> | null;
  tramoDescuentoProntoPago: TramoParametro<Record<Exclude<Situacion, 'normal'>, number>> | null;
  tramoAmnistia: TramoParametro<{ topeMesesRecargoInteres: number; vigenteHasta: string }> | null;
}

export interface DesgloseMes {
  numero:        number;   // 1-based, mes de mora
  desde:         string;
  hasta:         string;
  reglaRecargo:  'vieja' | 'nueva';
  pctRecargoMes: number;
  pctInteresMes: number;
  excluidoPorAmnistia: boolean;
}

export interface ResultadoRecargosIntereses {
  impuesto:        number;
  mesesMora:       number;
  recargoBruto:    number;
  descuentoPct:    number;
  descuentoMonto:  number;
  recargoNeto:     number;
  interes:         number;
  total:           number;
  desglosePorMes:  DesgloseMes[];
  avisos:          string[];
}

/** 'YYYY-MM-DD' + n días, anclado a mediodía UTC (evita que el borde de mes/año se corra por huso horario). */
function sumarDiasISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' + n meses (mismo día del mes; si no existe, el último día de destino — comportamiento de Date). */
function sumarMesesISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d, 12));
  return dt.toISOString().slice(0, 10);
}

function resolverTramo<T>(tramos: TramoParametro<T>[], fecha: string, clave: string): T {
  // Última fila cuyo rango cubre la fecha — ORDER BY vigenciaDesde DESC en el service real.
  const filas = tramos
    .filter(t => t.vigenciaDesde <= fecha && (!t.vigenciaHasta || t.vigenciaHasta >= fecha))
    .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1));
  const fila = filas[0];
  if (!fila) throw new ParametroFiscalNoEncontradoError(clave, fecha);
  if (fila.estado !== 'VALIDADO' || fila.valor === null) throw new ParametroFiscalPendienteError(clave, fecha);
  return fila.valor;
}

function esRegLaVieja(v: ValorRecargoMora): v is ValorRecargoMoraViejo {
  return 'primerMes' in v;
}

export function calcularRecargosIntereses(
  entrada: EntradaRecargosIntereses,
  parametros: ParametrosRecargosIntereses,
): ResultadoRecargosIntereses {
  const { montoAdeudado, fechaLimite, fechaPago, situacion, acogeAmnistia } = entrada;
  const monto = new Decimal(montoAdeudado);
  const avisos: string[] = [];

  const diaInicioMora = sumarDiasISO(fechaLimite, 1);

  if (fechaPago < diaInicioMora) {
    return {
      impuesto: monto.toDecimalPlaces(2).toNumber(), mesesMora: 0,
      recargoBruto: 0, descuentoPct: 0, descuentoMonto: 0, recargoNeto: 0, interes: 0,
      total: monto.toDecimalPlaces(2).toNumber(), desglosePorMes: [],
      avisos: ['Pagado dentro del plazo — no aplica recargo ni interés.'],
    };
  }

  // ── Amnistía: tope de meses cargables (Art. 8 Ley 30-26) ──────────────────
  let topeMesesAmnistia: number | null = null;
  if (acogeAmnistia) {
    const amnistia = resolverTramo(
      parametros.tramoAmnistia ? [parametros.tramoAmnistia] : [], fechaPago, 'amnistia_ley_30_26',
    );
    if (fechaPago <= amnistia.vigenteHasta) {
      topeMesesAmnistia = amnistia.topeMesesRecargoInteres;
    } else {
      avisos.push(`Se pidió acogerse a la amnistía, pero el pago (${fechaPago}) es posterior a su vigencia (${amnistia.vigenteHasta}) — no se aplicó.`);
    }
  }

  // ── Recorrido mes a mes (1 día de mora = 1 mes completo) ──────────────────
  const desglosePorMes: DesgloseMes[] = [];
  let cursor = diaInicioMora;
  let numero = 0;

  let recargoBrutoPct = new Decimal(0);
  let toppePctRecargo: number | null = null; // el de la regla NUEVA, si algún mes cae bajo ella
  let interesTotal = new Decimal(0);
  let productoInteres = new Decimal(1); // para modo acumulativo

  const modoInteres = parametros.tramoModoInteres
    ? resolverTramo(parametros.tramoModoInteres ? [parametros.tramoModoInteres] : [], fechaPago, 'interes_indemnizatorio_modo').modo
    : 'simple';

  while (cursor <= fechaPago) {
    numero++;
    const desdeMes = cursor;
    const hastaMes = sumarDiasISO(sumarMesesISO(cursor, 1), -1);

    const regla = resolverTramo(parametros.tramosRecargoMora, desdeMes, 'recargo_mora');
    const esVieja = esRegLaVieja(regla);

    const pctRecargoMes = esVieja
      ? (numero === 1 ? (regla as ValorRecargoMoraViejo).primerMes : (regla as ValorRecargoMoraViejo).mesesSiguientes)
      : (regla as ValorRecargoMoraNuevo).porMes;
    if (!esVieja) toppePctRecargo = (regla as ValorRecargoMoraNuevo).topePct;

    const tasaInteresAnual = resolverTramo(parametros.tramosInteres, desdeMes, 'interes_indemnizatorio_mensual');

    const excluidoPorAmnistia = topeMesesAmnistia !== null && numero > topeMesesAmnistia;

    if (!excluidoPorAmnistia) {
      recargoBrutoPct = recargoBrutoPct.plus(pctRecargoMes);
      if (modoInteres === 'acumulativo') {
        productoInteres = productoInteres.times(new Decimal(1).plus(new Decimal(tasaInteresAnual).div(100)));
      } else {
        interesTotal = interesTotal.plus(tasaInteresAnual);
      }
    }

    desglosePorMes.push({
      numero, desde: desdeMes, hasta: hastaMes,
      reglaRecargo: esVieja ? 'vieja' : 'nueva',
      pctRecargoMes, pctInteresMes: tasaInteresAnual,
      excluidoPorAmnistia,
    });

    cursor = sumarMesesISO(cursor, 1);
  }

  const reglasUsadas = new Set(desglosePorMes.map(m => m.reglaRecargo));
  if (reglasUsadas.size > 1) {
    avisos.push(
      'La mora cruza el 1-jul-2026: el criterio de transición entre la regla anterior y la de la Ley 30-26 ' +
      '(cómo se reparte un mes que empieza antes y termina después del corte) está pendiente de validación — ' +
      'ver el desglose por mes.',
    );
  }

  // Tope del 100% (u otro) de la regla nueva, sobre el recargo TOTAL acumulado.
  let recargoBrutoPctFinal = recargoBrutoPct;
  if (toppePctRecargo !== null && recargoBrutoPct.greaterThan(toppePctRecargo)) {
    avisos.push(`El recargo acumulado (${recargoBrutoPct.toFixed(2)}%) superó el tope de ${toppePctRecargo}% — se limita al tope.`);
    recargoBrutoPctFinal = new Decimal(toppePctRecargo);
  }

  const recargoBruto = monto.times(recargoBrutoPctFinal).div(100).toDecimalPlaces(2);

  // ── Descuento de pronto pago — SOLO sobre el recargo, nunca el interés ────
  let descuentoPct = 0;
  if (situacion !== 'normal') {
    const tabla = resolverTramo(
      parametros.tramoDescuentoProntoPago ? [parametros.tramoDescuentoProntoPago] : [], fechaPago, 'descuento_pronto_pago_recargos',
    );
    descuentoPct = tabla[situacion] ?? 0;
  }
  const descuentoMonto = recargoBruto.times(descuentoPct).div(100).toDecimalPlaces(2);
  const recargoNeto = recargoBruto.minus(descuentoMonto).toDecimalPlaces(2);

  const interes = (modoInteres === 'acumulativo'
    ? monto.times(productoInteres.minus(1))
    : monto.times(interesTotal).div(100)
  ).toDecimalPlaces(2);

  const total = monto.plus(recargoNeto).plus(interes).toDecimalPlaces(2);

  return {
    impuesto:       monto.toDecimalPlaces(2).toNumber(),
    mesesMora:      numero,
    recargoBruto:   recargoBruto.toNumber(),
    descuentoPct,
    descuentoMonto: descuentoMonto.toNumber(),
    recargoNeto:    recargoNeto.toNumber(),
    interes:        interes.toNumber(),
    total:          total.toNumber(),
    desglosePorMes,
    avisos,
  };
}
