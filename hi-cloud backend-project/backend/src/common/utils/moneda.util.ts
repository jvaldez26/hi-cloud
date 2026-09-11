/**
 * Redondeo a 2 decimales para montos en pesos — evita el runout de coma
 * flotante que produce cosas como 23200 - 18000 = 5199.999999999998.
 *
 * Toda la imputación de pagos de suscripción (cargos → períodos → abono, ver
 * imputacion-pago.util.ts) pasa cada monto intermedio por aquí antes de
 * sumarlo o compararlo — sin esto un "sobran RD$0.00" real se guardaría como
 * -0.000000000002 y el próximo pago heredaría el arrastre.
 */
export function redondearMoneda(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
