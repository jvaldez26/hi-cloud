import Decimal from 'decimal.js';

/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §7.
 *
 * ÚNICA función de redondeo monetario de todo el motor nuevo. Los cálculos
 * intermedios del motor se hacen en Decimal (aritmética decimal exacta, sin
 * el riesgo de borde IEEE-754 de los floats binarios — ej. un valor que
 * matemáticamente es x.xx5 pero el float lo representa como x.xx49999...).
 * Solo se convierte a `number` redondeado aquí, en la frontera de salida.
 *
 * ROUND_HALF_UP para ser consistente con el comportamiento de Math.round()
 * que ya usa el resto del sistema (Etapa 1 `r2()`) — en este dominio no hay
 * montos negativos, así que "half up" es inequívoco.
 */
export function redondearDinero(n: Decimal.Value): number {
  return redondearDecimal(n).toNumber();
}

/**
 * Igual que `redondearDinero`, pero devuelve un `Decimal` (no `number`) —
 * para usar ENTRE pasos intermedios del motor (interés, capital, saldo de
 * cada cuota), de forma que el siguiente paso parta de un valor ya
 * redondeado a 2 decimales en aritmética decimal exacta, nunca de un float
 * binario. Es lo que permite que la última cuota cierre el saldo en cero
 * EXACTO (§7.3): si cada paso previo ya es un Decimal de 2 decimales
 * limpio, la resta final también lo es, sin necesidad de un ajuste de
 * punto flotante aparte.
 */
export function redondearDecimal(n: Decimal.Value): Decimal {
  return new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Atajo para construir un Decimal desde cualquier valor numérico/string de Postgres. */
export function d(n: Decimal.Value): Decimal {
  return new Decimal(n);
}
