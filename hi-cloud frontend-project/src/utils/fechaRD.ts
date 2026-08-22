/**
 * Fechas y horas SIEMPRE en República Dominicana, pase lo que pase en el equipo.
 *
 * Dos cosas distintas se rompen en la caja de un cliente y hay que resolver las
 * dos por separado:
 *
 *   1. LA ZONA del equipo está mal (o simplemente no es la de RD). Formatear con
 *      `toLocaleTimeString('es-DO')` no la arregla: el locale elige el FORMATO
 *      (a. m./p. m., día/mes/año), no la zona. Un instante correcto del servidor
 *      se pinta con la zona del navegador. Solución: fijar `timeZone` en todos
 *      los formateos. Es lo que hacen las funciones de este archivo.
 *
 *   2. EL RELOJ del equipo está mal. Aquí no hay formateo que valga: si la PC
 *      cree que son las 3 y son las 9, cualquier hora que salga de `new Date()`
 *      es falsa — y esa hora acaba impresa en tickets. Solución: `ahora()`, que
 *      devuelve la hora del SERVIDOR, deducida de la cabecera `Date` que trae
 *      toda respuesta HTTP.
 *
 * Regla: en el frontend nadie llama a `new Date()` para saber qué hora es, ni
 * formatea fechas sin pasar por aquí.
 */
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const ZONA_RD = 'America/Santo_Domingo';

// ─────────────────────────────────────────────────────────────────────────────
// Hora del servidor
// ─────────────────────────────────────────────────────────────────────────────

/** servidor − dispositivo, en ms. 0 mientras no haya llegado ninguna respuesta. */
let desfaseMs = 0;
let sincronizado = false;

/**
 * Se llama desde el interceptor de respuestas con la cabecera `Date`.
 *
 * Toda respuesta HTTP la trae por norma, así que no hace falta un endpoint
 * dedicado ni una petición extra: la primera llamada a la API ya sincroniza.
 * La cabecera tiene resolución de segundo y el viaje de red añade su parte, así
 * que esto NO sirve para medir milisegundos — sirve para no imprimir una hora
 * con horas de error, que es el problema real.
 */
export function registrarHoraServidor(cabeceraDate?: string | null): void {
  if (!cabeceraDate) return;
  const t = Date.parse(cabeceraDate);
  if (Number.isNaN(t)) return;
  desfaseMs    = t - Date.now();
  sincronizado = true;
}

/**
 * Ahora, según el servidor. Usar SIEMPRE en lugar de `new Date()` cuando la
 * fecha vaya a mostrarse, imprimirse o enviarse.
 *
 * Si aún no ha llegado ninguna respuesta, cae al reloj del equipo: es lo único
 * que hay, y es mejor que no pintar nada.
 */
export function ahora(): Date {
  return new Date(Date.now() + desfaseMs);
}

/** Igual que ahora(), como dayjs ya pinneado a RD. */
export function ahoraRD(): Dayjs {
  return dayjs(ahora()).tz(ZONA_RD);
}

/**
 * Desfase del reloj del equipo en minutos (positivo = el equipo va atrasado).
 * `null` si todavía no se ha sincronizado con el servidor.
 *
 * Para avisar al usuario de que su PC tiene la hora mal: no le rompe nada
 * —todo lo que se muestra ya va corregido— pero es la clase de cosa que
 * conviene que sepa antes de que le extrañe algo.
 */
export function desfaseRelojMinutos(): number | null {
  return sincronizado ? Math.round(desfaseMs / 60000) : null;
}

/**
 * Hoy en RD como 'YYYY-MM-DD'. Sustituye a `new Date().toISOString().split('T')[0]`,
 * que estaba por todo el frontend y tenía DOS errores a la vez:
 *
 *   - `toISOString()` da la fecha UTC. Después de las 8pm en RD ya es el día
 *     siguiente en UTC, así que un pago registrado a las 9pm se fechaba mañana.
 *     No es cosmético: esa fecha se envía al backend y queda en el registro.
 *   - Sale del reloj del equipo, que puede estar mal.
 *
 * Es la contraparte de `fechaHoyRD()` del backend.
 */
export function hoyRD(): string {
  // 'en-CA' produce siempre YYYY-MM-DD
  return ahora().toLocaleDateString('en-CA', { timeZone: ZONA_RD });
}

/** Año en curso en RD. Para los selectores de año/periodo. */
export function anioRD(): number {
  return Number(hoyRD().substring(0, 4));
}

/** Mes en curso en RD, 1-12 (no 0-11: eso es fuente de errores por sí sola). */
export function mesRD(): number {
  return Number(hoyRD().substring(5, 7));
}

/** Hora del día en RD, 0-23. Para los saludos del tipo "Buenos días". */
export function horaDelDiaRD(): number {
  return Number(
    ahora().toLocaleString('en-GB', { timeZone: ZONA_RD, hour: '2-digit', hour12: false }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formateo — todo pinneado a la zona de RD
// ─────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' a secas: una fecha de calendario, sin hora y sin zona. */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Lleva marca de zona ('Z' o '+04:00')? Entonces es un instante inequívoco. */
const CON_ZONA = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Convierte lo que llegue en un instante.
 *
 * El caso peliagudo son las cadenas con hora pero SIN marca de zona
 * ('2026-08-22 13:14:00'), que salen de consultas SQL crudas. `new Date()` las
 * interpreta como hora LOCAL del navegador; vienen de una base en UTC. Se
 * fuerzan a UTC para que no dependan del equipo.
 *
 * Devuelve null si no hay nada que pintar (así los render de tabla no escupen
 * "Invalid Date").
 */
function aInstante(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v !== 'string') return null;

  const s = v.trim();
  if (SOLO_FECHA.test(s)) return null;          // no es un instante: ver fecha()

  const iso = CON_ZONA.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d   = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

const opciones = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions =>
  ({ timeZone: ZONA_RD, ...o });

// Los Intl.DateTimeFormat se construyen una vez: crearlos en cada celda de una
// tabla es de las cosas más caras que se pueden hacer en un render.
const F_FECHA      = new Intl.DateTimeFormat('es-DO', opciones({ day: '2-digit', month: '2-digit', year: 'numeric' }));
const F_HORA       = new Intl.DateTimeFormat('es-DO', opciones({ hour: '2-digit', minute: '2-digit', hour12: true }));
const F_HORA_SEG   = new Intl.DateTimeFormat('es-DO', opciones({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
const F_FECHA_LARGA = new Intl.DateTimeFormat('es-DO', opciones({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
const F_FECHA_HORA = new Intl.DateTimeFormat('es-DO', opciones({
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
}));

/**
 * Fecha: '22/08/2026'.
 *
 * Una 'YYYY-MM-DD' se formatea COMO TEXTO, sin construir ningún Date. Es una
 * fecha de calendario —un vencimiento, el día de un cierre—, no un instante:
 * convertirla de zona la movería un día. Este es el error contrario al de las
 * horas y es igual de real.
 */
export function fecha(v: unknown): string {
  if (typeof v === 'string') {
    const m = SOLO_FECHA.exec(v.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = aInstante(v);
  return d ? F_FECHA.format(d) : '';
}

/** Fecha larga: 'sábado, 22 de agosto de 2026' — cabeceras y portadas. */
export function fechaLarga(v: unknown): string {
  const d = aInstante(v);
  return d ? F_FECHA_LARGA.format(d) : '';
}

/** Hora: '9:14 a. m.' */
export function hora(v: unknown): string {
  const d = aInstante(v);
  return d ? F_HORA.format(d) : '';
}

/** Hora con segundos: '9:14:05 a. m.' — para relojes y tickets. */
export function horaConSegundos(v: unknown): string {
  const d = aInstante(v);
  return d ? F_HORA_SEG.format(d) : '';
}

/** Fecha y hora: '22/08/2026, 9:14 a. m.' */
export function fechaHora(v: unknown): string {
  if (typeof v === 'string' && SOLO_FECHA.test(v.trim())) return fecha(v);
  const d = aInstante(v);
  return d ? F_FECHA_HORA.format(d) : '';
}

/**
 * dayjs ya pinneado a RD, para los sitios que necesitan un formato propio
 * (`.format('DD-MM-YYYY HH:mm:ss')` de los e-CF, por ejemplo).
 *
 * Sin argumento devuelve AHORA según el servidor, no según el equipo.
 */
export function dRD(v?: unknown): Dayjs {
  if (v == null) return ahoraRD();
  if (typeof v === 'string' && SOLO_FECHA.test(v.trim())) {
    // Fecha de calendario: se ancla al mediodía RD para que ningún formateo
    // posterior la empuje al día anterior.
    return dayjs.tz(v.trim() + ' 12:00:00', ZONA_RD);
  }
  const d = aInstante(v);
  return dayjs(d ?? undefined).tz(ZONA_RD);
}
