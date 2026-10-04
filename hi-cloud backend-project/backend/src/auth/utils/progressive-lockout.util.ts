/**
 * Escalada de bloqueo compartida entre LoginAttemptsService y
 * SupervisorAttemptsService — mismo criterio pedido para los dos:
 *
 *   5 fallos en 10 min → bloqueo de 1 minuto.
 *   Si la MISMA cubeta vuelve a bloquearse dentro de las siguientes 24h:
 *     2da vez → 5 minutos. 3ra vez y siguientes → 15 minutos (tope).
 *   Se reinicia por completo al primer acierto.
 *
 * "Vuelve a bloquearse" se cuenta por BLOQUEOS, no por intentos: cada
 * servicio resetea su contador de intentos de la ventana de 10 min al
 * bloquear, así que la próxima vez hacen falta 5 fallos NUEVOS — pero el
 * contador de "veces bloqueado en 24h" NO se toca hasta el próximo acierto,
 * y es ese contador el que decide cuánto dura el próximo bloqueo.
 */

export const LOCKOUT_VENTANA_INTENTOS_MS = 10 * 60_000; // 10 minutos
export const LOCKOUT_VENTANA_ESCALADA_MS = 24 * 60 * 60_000; // 24 horas

/** Duración en segundos del bloqueo N — índice 0 = primer bloqueo. Tope en el último valor. */
const TIERS_SEGUNDOS = [60, 300, 900]; // 1 min, 5 min, 15 min

/**
 * @param bloqueosPrevios cuántas veces ya se bloqueó esta cubeta en las
 *   últimas 24h ANTES de este bloqueo (0 = primera vez).
 */
export function duracionBloqueoSegundos(bloqueosPrevios: number): number {
  const idx = Math.min(Math.max(bloqueosPrevios, 0), TIERS_SEGUNDOS.length - 1);
  return TIERS_SEGUNDOS[idx];
}

/** "1 minuto" / "5 minutos" / "15 minutos" — para el mensaje único pedido:
 *  "Demasiados intentos. Espera X minuto(s)." */
export function formatMinutos(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
}

export function mensajeBloqueo(segundos: number): string {
  return `Demasiados intentos. Espera ${formatMinutos(segundos)}.`;
}

/**
 * Segundo nivel, SOLO para login (no supervisor): bloqueo de la cuenta
 * completa sin importar la IP — 20 fallos en 60 min → 15 min fijos (no
 * escala con repeticiones, a diferencia del nivel por cuenta+IP de arriba).
 *
 * Por qué dos niveles: bloquear solo por cuenta (sin IP) deja que
 * cualquiera que sepa el correo de otra persona la bloquee a voluntad con
 * solo fallar 5 veces desde fuera, y mantenerla bloqueada repitiéndolo.
 * Bloquear solo por (cuenta, IP) no frena un ataque distribuido (muchas
 * IPs, pocos fallos cada una). Con los dos: un intento desde fuera no
 * molesta al usuario que trabaja desde su propia IP (la tienda), y un
 * ataque repartido en muchas IPs igual se frena al llegar al umbral
 * global de la cuenta.
 */
export const LOCKOUT_GLOBAL_VENTANA_MS        = 60 * 60_000; // 60 minutos
export const LOCKOUT_GLOBAL_UMBRAL_INTENTOS   = 20;
export const LOCKOUT_GLOBAL_DURACION_SEGUNDOS = 15 * 60;     // 15 minutos, fijo
