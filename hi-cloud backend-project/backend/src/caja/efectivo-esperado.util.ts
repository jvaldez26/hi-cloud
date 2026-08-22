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

/**
 * Versión de esta fórmula. Se guarda en cada cierre (`formulaVersion`) para que
 * sea auto-descriptivo y no haya que deducir por la fecha si dos cierres son
 * comparables. Ver el comentario de la columna en cierre-caja.entity.ts.
 *
 *   0 = sin calcular (FORMULA_SIN_CALCULAR)
 *   1 = fórmula original: sumaba TODOS los cobros y no contaba los anticipos
 *   2 = solo efectivo en el cajón — la de este archivo
 *
 * Súbela si cambia QUÉ se suma. No por un refactor que no altere el resultado.
 */
export const FORMULA_EFECTIVO_VERSION = 2;

/**
 * Marca de "nadie calculó nada". Para cierres que pasan a estado cerrado sin
 * que se ejecute ninguna fórmula — hoy solo el cierre por sistema al desactivar
 * el control de caja.
 *
 * Existe para que las consultas de alcance puedan separar los cierres AFECTADOS
 * por la fórmula vieja (versión 1) de los que simplemente nunca se cuadraron.
 * Contarlos juntos infla el problema.
 */
export const FORMULA_SIN_CALCULAR = 0;

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

/**
 * Disponible contra el que se valida un retiro que YA EXISTE (autorización de
 * un pendiente).
 *
 * Un retiro pendiente ya está restando del disponible desde el instante en que
 * se creó — cuenta con estado != 'anulado'. Si al autorizarlo lo comparásemos
 * contra el disponible tal cual, lo estaríamos comparando contra un número del
 * que él mismo ya se descontó, y ningún retiro podría autorizarse jamás.
 *
 * Se le vuelve a sumar su propio monto para responder la pregunta correcta:
 * "¿hay/hubo efectivo suficiente para este retiro?".
 */
export function disponibleParaAutorizar(
  disponibleActual: number, montoDelRetiro: number,
): number {
  return redondear(num(disponibleActual) + num(montoDelRetiro));
}

/** Los importes llegan de TypeORM como string (columnas decimal). */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function redondear(n: number): number {
  return Number(n.toFixed(2));
}
