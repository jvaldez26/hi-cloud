/**
 * Efectivo esperado en el cajón al cerrar una caja — FUENTE ÚNICA.
 *
 * Antes esta fórmula estaba escrita tres veces y las tres divergían:
 *
 *   backend  (caja.service)      apertura + ventasEfectivo + cobrosRecibidos
 *                                − gastos − retiros
 *   frontend (CajaPage ×2)       apertura + ventasEfectivo + ventasTarjeta
 *                                + ventasTransferencia − gastos − retiros
 *
 * O sea: el número que el cajero veía en pantalla mientras contaba el dinero NO
 * era el que se guardaba como `diferencia`. El frontend sumaba tarjeta y
 * transferencia —dinero que no está en el cajón— y omitía los cobros.
 *
 * REGLA: aquí solo entra lo que está FÍSICAMENTE en el cajón. Tarjeta y
 * transferencia nunca, da igual que sean ingresos del turno.
 */

export interface EntradasEfectivo {
  /** Fondo con el que se abrió el turno. */
  saldoApertura: number;
  /** Ventas cobradas en efectivo (tipo DGII 1). */
  ventasEfectivo: number;
  /** Cobros de CxC recibidos en efectivo. Los de transferencia/cheque NO entran. */
  cobrosEfectivo: number;
  /** Anticipos de cliente recibidos en efectivo. */
  anticiposEfectivo: number;
  /** Gastos pagados en efectivo desde esta caja. */
  gastosEfectivo: number;
  /**
   * Retiros con estado != 'anulado'.
   *
   * Incluye los `pendiente` y los `rechazado` a propósito: el efectivo YA salió
   * del cajón, y el estado documenta si el supervisor lo avala, no si el dinero
   * volvió. Solo `anulado` revierte el monto.
   */
  retiros: number;
}

/**
 * Efectivo que debería haber en el cajón.
 *
 * PUEDE SER NEGATIVO, y se devuelve tal cual a propósito: si los retiros
 * exceden lo que entró, ese número es la señal de que algo hay que revisar.
 * Acotarlo a cero escondería el problema — y peor, convertiría un faltante en
 * un sobrante al restarlo del contado (0 − (−X) = +X).
 */
export function calcularEfectivoEsperado(e: EntradasEfectivo): number {
  const total =
      num(e.saldoApertura)
    + num(e.ventasEfectivo)
    + num(e.cobrosEfectivo)
    + num(e.anticiposEfectivo)
    - num(e.gastosEfectivo)
    - num(e.retiros);
  return redondear(total);
}

/**
 * Diferencia entre lo contado y lo esperado.
 *   > 0  sobrante   · < 0  faltante   · 0  cuadra
 */
export function calcularDiferencia(contado: number, esperado: number): number {
  return redondear(num(contado) - num(esperado));
}

/**
 * ¿El cierre está en estado inconsistente?
 *
 * Un esperado negativo significa que salió más efectivo del que entró: la
 * `diferencia` deja de tener el significado habitual y no puede presentarse
 * como un sobrante. Quien pinte este cierre debe mostrar la bandera roja.
 */
export function esperadoEsInconsistente(esperado: number): boolean {
  return num(esperado) < 0;
}

/** Cuánto exceden los retiros al efectivo disponible. Solo si es inconsistente. */
export function excesoDeRetiros(esperado: number): number {
  return esperadoEsInconsistente(esperado) ? redondear(Math.abs(num(esperado))) : 0;
}

/**
 * Efectivo disponible AHORA para retirar. Es el mismo cálculo que el esperado:
 * lo que hay en el cajón en este instante. Se expone aparte para que el punto
 * de uso se lea por lo que significa.
 */
export function calcularDisponibleParaRetiro(e: EntradasEfectivo): number {
  return calcularEfectivoEsperado(e);
}

/** Los importes llegan de TypeORM como string (columnas decimal). */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function redondear(n: number): number {
  return Number(n.toFixed(2));
}
