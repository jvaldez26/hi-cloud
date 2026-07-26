/**
 * Aritmética de mora — Prestamista.
 *
 * Funciones puras, sin BD, para poder probar el cálculo del dinero por separado
 * del cron que lo persiste.
 *
 * ── C3: por qué existe este archivo ────────────────────────────────────────
 * El cron calculaba la tasa diaria así:
 *
 *     Math.round(porcentajeMora / 30 / 100 * 100) / 100
 *
 * Ese redondeo es PREMATURO: aplasta la tasa diaria a 2 decimales antes de
 * multiplicarla por el saldo. Con 5 %/mes da 0.001666… → redondeado → **0**, así
 * que no se generaba ni un peso de mora. Con 15 %/mes daba 0.005 → redondeado a
 * 0.01, el DOBLE de lo que corresponde. Es decir: por debajo de ~15 % no cobraba
 * nada, y justo en 15 % cobraba de más.
 *
 * Regla: se redondea el DINERO (resultado final, 2 decimales), nunca la tasa.
 */

/** Redondeo monetario a 2 decimales. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tasa de mora diaria (fracción, no porcentaje) a partir de la tasa mensual.
 * Mes comercial de 30 días, igual que el resto del módulo.
 *
 * 5 %/mes → 0.001666… (NO se redondea: se usa tal cual en el producto)
 */
export function tasaMoraDiaria(porcentajeMoraMensual: number): number {
  const pct = Number(porcentajeMoraMensual);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return pct / 100 / 30;
}

/**
 * Mora acumulada de una cuota vencida.
 *
 * @param saldoBase  capital + interés pendientes de la cuota
 * @param porcentajeMoraMensual  tasa del préstamo, en % mensual
 * @param diasMora   días transcurridos desde el vencimiento
 * @returns monto en pesos, redondeado a 2 decimales
 */
export function calcularMoraCuota(
  saldoBase: number,
  porcentajeMoraMensual: number,
  diasMora: number,
): number {
  const base  = Number(saldoBase);
  const dias  = Number(diasMora);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(dias) || dias <= 0) return 0;

  const tasa = tasaMoraDiaria(porcentajeMoraMensual);
  if (tasa <= 0) return 0;

  return r2(base * tasa * dias);
}

/**
 * Saldo de mora PENDIENTE de una cuota: lo generado menos lo ya cobrado.
 *
 * ── C4: por qué existe ─────────────────────────────────────────────────────
 * El cron fijaba `pr_prestamos.saldoMora` con la suma BRUTA de la mora generada,
 * ignorando `moraPagada`. Como el registro de pagos lo deja NETO
 * (SUM(GREATEST(0, moraGenerada - moraPagada))), el cron de medianoche pisaba el
 * valor correcto y la mora ya cobrada reaparecía al día siguiente.
 * Ambos caminos deben usar la misma definición: la de aquí.
 */
export function saldoMoraPendiente(moraGenerada: number, moraPagada: number): number {
  const gen = Number(moraGenerada) || 0;
  const pag = Number(moraPagada)   || 0;
  return r2(Math.max(0, gen - pag));
}

/** Suma del saldo de mora pendiente de un conjunto de cuotas. */
export function sumarSaldoMoraPendiente(
  cuotas: { moraGenerada?: number | string; moraPagada?: number | string }[],
): number {
  return r2(
    cuotas.reduce(
      (acc, c) => acc + saldoMoraPendiente(Number(c.moraGenerada ?? 0), Number(c.moraPagada ?? 0)),
      0,
    ),
  );
}
