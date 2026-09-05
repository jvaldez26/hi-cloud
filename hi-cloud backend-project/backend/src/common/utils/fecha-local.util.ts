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
 * 'YYYY-MM-DD' → 'DD/MM/YYYY', partiendo el texto y sin pasar por Date.
 *
 * Para fechas de CALENDARIO que ya vienen como cadena: un ciclo de facturación,
 * un vencimiento, una fecha de corte. No hay nada que convertir, así que
 * convertirlas es justamente donde se pierde el día: `new Date('2026-08-05')`
 * es medianoche UTC, que en RD es el día 4 a las 8 de la noche.
 *
 * Para un Date de verdad, usar `fechaTextoRD`.
 *
 * @example fechaISOaDO('2026-08-05') // '05/08/2026'
 */
export function fechaISOaDO(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
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

/**
 * Solo la hora, en zona RD. Por defecto 'hh:mm a. m.'.
 *
 * Es la que va en los pies de los PDF ("Generado: …") y en las comandas. Sin
 * fijar la zona salían cuatro horas adelantadas, o sea con la hora de un
 * documento que el cliente se lleva impreso.
 */
export function horaTextoRD(
  d: Date = new Date(),
  opciones: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  return d.toLocaleTimeString('es-DO', { timeZone: ZONA_HORARIA, ...opciones });
}

/** Fecha y hora en una sola cadena, formato corto: '22/8/2026 9:14 a. m.'. */
export function fechaYHoraRD(d: Date = new Date()): string {
  return `${fechaTextoRD(d)} ${horaTextoRD(d)}`;
}

/**
 * Días de calendario entre `fecha` y hoy (RD), sin horas de por medio.
 * Positivo = `fecha` quedó en el pasado; negativo = en el futuro.
 *
 * Ancla ambas fechas al mediodía UTC antes de restar — mismo truco que ya usa
 * calcIndicadorNC en e34.builder.ts para esto mismo: comparar por DÍA sin que
 * la resta de dos `Date` a medianoche cruce el borde por el desfase UTC-4 de
 * RD. Acepta 'YYYY-MM-DD' o un Date (columnas `date` de Postgres llegan como
 * Date a medianoche UTC del día que se guardó).
 *
 * @example diferenciaDiasRD('2027-09-07') // negativo: un año en el futuro
 */
export function diferenciaDiasRD(fecha: Date | string): number {
  const iso = typeof fecha === 'string' ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  const objetivo = new Date(Date.UTC(yyyy, mm - 1, dd, 12));

  const [hy, hm, hd] = fechaHoyRD().split('-').map(Number);
  const hoy = new Date(Date.UTC(hy, hm - 1, hd, 12));

  return Math.round((hoy.getTime() - objetivo.getTime()) / 86_400_000);
}
