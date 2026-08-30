import { Frecuencia } from './entities/factura-recurrente.entity';

/**
 * Calendario de las facturas recurrentes.
 *
 * Todo se hace sobre cadenas 'YYYY-MM-DD' y aritmética de enteros, sin `Date`.
 * No es purismo: `Date` en este servidor es UTC y República Dominicana es UTC-4,
 * así que cualquier cuenta que pase por `new Date('2026-02-28')` y vuelva a
 * salir se corre un día según la hora a la que corra el cron. Un día de más en
 * la fecha de una factura con e-CF es una FechaEmision que la DGII rechaza.
 *
 * El cálculo anterior tenía además un fallo propio: hacía
 * `prox.setMonth(prox.getMonth() + 1)` y DESPUÉS acotaba el día. Partiendo de un
 * 31 de enero, setMonth desborda a 3 de marzo y febrero se saltaba entero.
 * Aquí el día se acota dentro del mes de destino, que es donde tiene sentido.
 */

export interface ReglaCalendario {
  frecuencia: Frecuencia;
  /** 1-31. 31 significa "último día del mes". Mensual y anual. */
  diaMes?:    number | null;
  /** 1=lunes … 7=domingo. Semanal. */
  diaSemana?: number | null;
  /** 'YYYY-MM-DD' — a partir de cuándo cuenta. No decide el día. */
  fechaInicio: string;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza a 'YYYY-MM-DD' lo que devuelva la BD (Date, string o timestamp). */
export function aFechaISO(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    // Las columnas `date` de pg llegan como Date a medianoche LOCAL del proceso.
    // getFullYear/getMonth/getDate leen esa misma zona, así que no se corre.
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v).substring(0, 10);
  return RE_FECHA.test(s) ? s : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function partes(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = fecha.split('-').map(Number);
  return { y, m, d };
}

/** Días que tiene el mes `m` (1-12) del año `y`. Cubre bisiestos. */
export function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * El día `dia` dentro del mes y/m, acotado a lo que ese mes tenga.
 *
 * Es la regla que resuelve febrero y los meses de 30: quien elige 31 quiere el
 * último día del mes, no saltarse los meses que no llegan. En febrero cae el 28
 * (o el 29), en abril el 30, y en enero el 31.
 */
export function diaDelMes(y: number, m: number, dia: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(dia, diasDelMes(y, m)))}`;
}

/** Suma días naturales a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const { y, m, d } = partes(fecha);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 1=lunes … 7=domingo, igual que ISO-8601 (JS usa 0=domingo). */
export function diaSemanaDe(fecha: string): number {
  const { y, m, d } = partes(fecha);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Suma meses conservando el día pedido, acotado al mes de destino. */
function sumarMeses(fecha: string, meses: number, dia: number): string {
  const { y, m } = partes(fecha);
  const total  = (y * 12) + (m - 1) + meses;
  const yDest  = Math.floor(total / 12);
  const mDest  = (total % 12) + 1;
  return diaDelMes(yDest, mDest, dia);
}

/**
 * Primera generación: la primera fecha que cumple la regla y no es anterior a
 * la fecha de inicio.
 *
 * Antes esto lo decidía la fecha de inicio a secas, así que el día elegido no
 * mandaba hasta el segundo ciclo: con día 5 y arranque el 20 de agosto, la
 * primera salía el 20 y sólo a partir de septiembre caía en el 5.
 */
export function primeraGeneracion(regla: ReglaCalendario): string {
  const inicio = regla.fechaInicio.substring(0, 10);

  switch (regla.frecuencia) {
    case Frecuencia.DIARIA:
      return inicio;

    case Frecuencia.SEMANAL: {
      const objetivo = regla.diaSemana ?? diaSemanaDe(inicio);
      const delta    = (objetivo - diaSemanaDe(inicio) + 7) % 7;
      return sumarDias(inicio, delta);
    }

    case Frecuencia.MENSUAL: {
      const { y, m } = partes(inicio);
      const dia      = regla.diaMes ?? partes(inicio).d;
      const esteMes  = diaDelMes(y, m, dia);
      return esteMes >= inicio ? esteMes : sumarMeses(inicio, 1, dia);
    }

    case Frecuencia.ANUAL: {
      const { y, m } = partes(inicio);
      const dia      = regla.diaMes ?? partes(inicio).d;
      const esteAnio = diaDelMes(y, m, dia);
      return esteAnio >= inicio ? esteAnio : diaDelMes(y + 1, m, dia);
    }
  }
}

/**
 * Siguiente generación después de haber generado en `ultima`.
 *
 * Siempre devuelve una fecha estrictamente posterior a `ultima`. El mes de
 * referencia sale de la fecha de inicio en el caso anual, para que una plantilla
 * anual no se desplace de mes con el paso de los años.
 */
export function siguienteGeneracion(regla: ReglaCalendario, ultima: string): string {
  const desde = ultima.substring(0, 10);

  switch (regla.frecuencia) {
    case Frecuencia.DIARIA:
      return sumarDias(desde, 1);

    case Frecuencia.SEMANAL:
      return sumarDias(desde, 7);

    case Frecuencia.MENSUAL: {
      const dia = regla.diaMes ?? partes(regla.fechaInicio).d;
      return sumarMeses(desde, 1, dia);
    }

    case Frecuencia.ANUAL: {
      const { m }  = partes(regla.fechaInicio);
      const dia    = regla.diaMes ?? partes(regla.fechaInicio).d;
      const { y }  = partes(desde);
      const cand   = diaDelMes(y, m, dia);
      return cand > desde ? cand : diaDelMes(y + 1, m, dia);
    }
  }
}

/**
 * Cuántas generaciones se perdieron entre la que tocaba y hoy.
 *
 * Cuando el servidor estuvo caído, se genera UNA sola factura —tres
 * comprobantes fiscales de golpe por un fallo de infraestructura es peor que
 * uno— pero el número de ciclos saltados se cuenta para avisarlo. El tope de
 * 500 iteraciones es una red contra una plantilla diaria con la fecha de la
 * próxima generación corrompida hacia el pasado remoto.
 */
export function ciclosSaltados(
  regla: ReglaCalendario, prevista: string, hoy: string,
): number {
  let cursor = prevista.substring(0, 10);
  let n = 0;
  while (cursor < hoy && n < 500) {
    cursor = siguienteGeneracion(regla, cursor);
    if (cursor <= hoy) n++;
  }
  return n;
}

/** Texto para la interfaz: qué significa el día elegido en los meses cortos. */
export function explicarDiaMes(dia: number): string {
  if (dia <= 28) return `Se genera el día ${dia} de cada mes.`;
  return (
    `Se genera el día ${dia} de cada mes. En los meses que no llegan al ${dia} ` +
    `se genera el último día del mes (febrero: 28 o 29; abril, junio, septiembre ` +
    `y noviembre: 30). Nunca se salta un mes.`
  );
}
