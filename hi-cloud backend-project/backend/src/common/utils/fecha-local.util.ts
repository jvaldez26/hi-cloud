/**
 * Utilidades de fecha con zona horaria correcta.
 *
 * El servidor corre en UTC. República Dominicana es UTC-4.
 * new Date().toISOString().split('T')[0] devuelve la fecha UTC,
 * lo que entre las 8pm y medianoche local da el día siguiente.
 *
 * Usar siempre fechaHoyRD() para obtener "hoy" en operaciones de negocio.
 */

const ZONA_HORARIA = 'America/Santo_Domingo';

/**
 * Fecha de hoy en América/Santo_Domingo como 'YYYY-MM-DD'.
 * @example fechaHoyRD() // '2026-05-21'
 */
export function fechaHoyRD(): string {
  // 'en-CA' locale produce siempre el formato ISO YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
}

/**
 * Mes actual en América/Santo_Domingo como 'YYYY-MM'.
 * @example mesHoyRD() // '2026-05'
 */
export function mesHoyRD(): string {
  return fechaHoyRD().substring(0, 7);
}
