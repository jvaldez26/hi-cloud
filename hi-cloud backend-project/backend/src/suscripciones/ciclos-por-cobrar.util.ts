/**
 * Qué ciclos de una suscripción vencida todavía no tienen su cargo.
 *
 * Nace de un fallo real en el primer diseño: disparar el cargo por la
 * transición de `enPeriodoGracia` (false→true) solo captura el PRIMER ciclo
 * que se vence. Es un flag, no un contador — se queda en `true` hasta el
 * próximo pago, así que una suscripción que lleva ocho meses sin pagar
 * (suspendida o no) nunca generaría el cargo del mes 2 en adelante. Caso
 * real: "COMPRA Y VENTA DE INSUMOS AGRICOLA", 34 días vencida, dos períodos
 * de por medio — con el diseño del flag solo se habría generado uno.
 *
 * Por eso esto recorre CADA período elapsado, uno por uno, desde el
 * vencimiento hasta hoy — la misma cuenta que ya hace `calcularNuevaFecha`
 * (`preview-pago.util.ts`) para aplicar N períodos a un vencimiento, aquí
 * usada al revés: contar cuántos períodos hacen falta para alcanzar hoy.
 *
 * Pura y exportada para poder verificarla — ver ciclos-por-cobrar.util.spec.ts.
 */
import { calcularNuevaFecha, fechaDeVencimiento } from '../pagos-suscripcion/preview-pago.util';

export interface CicloPorCobrar {
  periodoInicio: string; // 'YYYY-MM-DD' — inicio del ciclo, inclusive
  periodoFin:    string; // 'YYYY-MM-DD' — vencimiento resultante de ese ciclo
}

export interface EntradaCiclosPorCobrar {
  fechaVencimiento: string | Date;
  diaCorte:         number;
  modalidad:        string;
  /** Hoy, 'YYYY-MM-DD' — normalmente fechaHoyRD(). Se pasa para poder probarlo. */
  hoy:              string;
  /**
   * Fecha de corte de `configuracion_cobros`. Ciclos con `periodoInicio`
   * ANTERIOR a esta fecha nunca se generan aquí — son el backlog que se
   * resuelve a mano con el "+ Cargo" que ya existe en el panel. `null` =
   * la función no genera nada (sin configurar, no "desde siempre").
   */
  fechaCorte:       string | null;
  /**
   * `periodoInicio` de los cargos que YA existen para esta suscripción
   * ('YYYY-MM-DD'). El índice único de `pagos_suscripcion` es el resguardo
   * de verdad; esto evita además que el propio cron intente crear un cargo
   * que ya sabe que existe.
   */
  cargosExistentes: string[];
}

/**
 * Límite defensivo: nada real debería acumular más de 60 ciclos sin
 * cancelarse. Sin este tope, un dato corrupto (una fecha de vencimiento
 * absurda) convertiría esto en un bucle que no termina.
 */
const MAX_CICLOS = 60;

export function ciclosPorCobrar(e: EntradaCiclosPorCobrar): CicloPorCobrar[] {
  if (!e.fechaCorte) return []; // sin configurar: no se genera nada

  const existentes = new Set(e.cargosExistentes);
  const resultado: CicloPorCobrar[] = [];

  let inicio = fechaDeVencimiento(e.fechaVencimiento);
  let vueltas = 0;

  while (inicio < e.hoy && vueltas < MAX_CICLOS) {
    vueltas++;
    const fin = calcularNuevaFecha(inicio, Number(e.diaCorte), 1, e.modalidad);

    if (inicio >= e.fechaCorte && !existentes.has(inicio)) {
      resultado.push({ periodoInicio: inicio, periodoFin: fin });
    }

    inicio = fin;
  }

  return resultado;
}
