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

/**
 * Fecha y hora para MOSTRARLE a un dominicano: '22/8/2026, 9:14:00 a. m.'
 *
 * El locale 'es-DO' elige el FORMATO, no la zona horaria: `toLocaleString('es-DO')`
 * a secas usa la zona del proceso, que en el servidor es UTC. Un cierre anulado a
 * las 9:14 de la mañana quedaba escrito como "1:14:00 p. m.", cuatro horas en el
 * futuro. Y cuando ese texto se guarda —como en la nota de anulación de caja— el
 * error es permanente: ya no hay nada que convertir en el cliente.
 *
 * Regla: cualquier fecha que el backend convierta a texto pasa por aquí.
 */
export function fechaHoraRD(d: Date = new Date()): string {
  return d.toLocaleString('es-DO', { timeZone: ZONA_HORARIA });
}

/**
 * Solo la fecha, en zona RD. Acepta las mismas opciones que toLocaleDateString
 * para los sitios que piden mes en letra o día de dos cifras.
 *
 * Sin la zona, entre las 8pm y medianoche RD imprime el día siguiente: un
 * reporte generado el lunes a las 9pm se fecha el martes.
 */
export function fechaTextoRD(
  d: Date = new Date(),
  opciones: Intl.DateTimeFormatOptions = {},
): string {
  return d.toLocaleDateString('es-DO', { timeZone: ZONA_HORARIA, ...opciones });
}
