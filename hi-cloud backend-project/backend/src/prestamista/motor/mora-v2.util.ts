import Decimal from 'decimal.js';
import { d, redondearDinero } from './dinero.util';

/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §6.
 *
 * Generaliza la mora de Etapa 1 (mora.util.ts, que sigue intacta y en uso
 * por mora.cron.ts/pagos.service.ts — esta es la versión del motor nuevo,
 * todavía sin conectar a ningún cron ni endpoint real) con 3 bases de
 * cálculo y un tope opcional. La integración con el cron/los endpoints es
 * una fase de implementación separada: esta función es pura y no asume de
 * dónde vienen `capitalPendiente`/`interesPendiente`.
 */

export type BaseMora = 'capital_vencido' | 'cuota_vencida' | 'monto_fijo';
export type PeriodoMontoFijo = 'dia' | 'cuota';

export interface ParametrosMora {
  base: BaseMora;
  tasaOMonto: number; // % mensual si base ≠ 'monto_fijo'; monto en pesos si base = 'monto_fijo'
  periodoMontoFijo?: PeriodoMontoFijo; // solo si base = 'monto_fijo'
  topeMora?: { tipo: 'monto' | 'porcentaje_saldo'; valor: number };
  baseDiasMora: 360 | 365;
}

export interface SaldoCuota {
  capitalPendiente: number;
  interesPendiente: number;
  diasDeAtraso: number;
}

/** §6 — tasa diaria de mora a partir de la tasa mensual configurada. Nunca usa los días del mes en curso. */
export function tasaDiariaMora(tasaMensualPct: number, baseDiasMora: 360 | 365): Decimal {
  const tasa = d(tasaMensualPct).div(100);
  return baseDiasMora === 360 ? tasa.div(30) : tasa.times(12).div(365);
}

/**
 * Mora de una cuota vencida, según la base configurada, con tope opcional.
 * `saldoBase` para el tope porcentual es capitalPendiente + interesPendiente
 * de la cuota (el total vencido), independiente de la base usada para el cálculo.
 */
export function calcularMora(params: ParametrosMora, cuota: SaldoCuota): number {
  const saldoTotalCuota = d(cuota.capitalPendiente).plus(cuota.interesPendiente);
  let mora: Decimal;

  if (params.base === 'monto_fijo') {
    const monto = d(params.tasaOMonto);
    mora = params.periodoMontoFijo === 'cuota'
      ? (cuota.diasDeAtraso > 0 ? monto : d(0))
      : monto.times(cuota.diasDeAtraso);
  } else {
    const saldoBase = params.base === 'capital_vencido' ? d(cuota.capitalPendiente) : saldoTotalCuota;
    const tasaDiaria = tasaDiariaMora(params.tasaOMonto, params.baseDiasMora);
    mora = saldoBase.times(tasaDiaria).times(cuota.diasDeAtraso);
  }

  if (params.topeMora) {
    const limite = params.topeMora.tipo === 'monto'
      ? d(params.topeMora.valor)
      : saldoTotalCuota.times(params.topeMora.valor).div(100);
    mora = Decimal.min(mora, limite);
  }

  return redondearDinero(mora);
}
