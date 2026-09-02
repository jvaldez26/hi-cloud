/**
 * El ciclo de facturación de una empresa: del día de corte al día de corte.
 *
 * Fórmula ÚNICA. La usan el contador de cuota de e-CF, el panel de excedentes,
 * el cargo que genera el super admin y el script `scripts/medir-consumo-ecf.js`.
 * Mismo criterio que `preview-pago.util.ts`: el número que promete la pantalla
 * y el que se cobra medio segundo después salen de la misma cuenta, o acaban
 * siendo dos.
 *
 * Por qué NO se mide por mes calendario: el ciclo de cobro va por
 * `suscripciones."diaCorte"` y el vencimiento se ancla ahí
 * (`preview-pago.util.ts → calcularNuevaFecha`). Un contador que se reinicia el
 * día 1 mide un período que no le corresponde a ninguna factura, y un cargo por
 * excedente tiene que corresponder al período que se le cobra al cliente. La
 * empresa que más factura lleva dos ciclos con esa diferencia: 5.736 e-CF
 * contados por calendario contra 5.699 contados por su ciclo real.
 *
 * El día se ancla igual que el vencimiento: del corte solo se usa el NÚMERO de
 * día, no una fecha anterior. Así un corte 31 pasa por abril como 30 y vuelve a
 * 31 en mayo, en vez de degradarse para siempre al primer mes corto.
 *
 * Todo son fechas de calendario 'YYYY-MM-DD', nunca Date. El servidor corre en
 * UTC y RD es UTC-4: un `new Date()` a las 9pm de RD ya es el día siguiente en
 * UTC, y eso movería el borde del ciclo un día entero. Ver `fecha-local.util.ts`.
 */
import { fechaHoyRD } from '../common/utils/fecha-local.util';

export interface Ciclo {
  /** Primer día del ciclo, INCLUSIVO. */
  inicio: string;
  /** Primer día del ciclo siguiente, EXCLUSIVO. */
  fin: string;
}

/**
 * El día que le toca al corte en un mes concreto.
 *
 * Un corte 31 en abril es 30; un corte 0 o ausente es 1. El recorte es solo
 * para ese mes: `cicloVigente` vuelve a partir del número original, que es lo
 * que evita la degradación permanente.
 */
export function diaAnclado(anio: number, mes: number, diaCorte: number): number {
  const ultimoDia = new Date(anio, mes, 0).getDate();   // mes 1-12 → día 0 del siguiente
  const corte = Number.isFinite(diaCorte) ? Math.trunc(diaCorte) : 1;
  return Math.min(Math.max(1, corte), ultimoDia);
}

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Retrocede un mes sobre el par (año, mes) con mes en 1-12. */
function mesAnterior(anio: number, mes: number): [number, number] {
  return mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
}

/** Avanza un mes sobre el par (año, mes) con mes en 1-12. */
function mesSiguiente(anio: number, mes: number): [number, number] {
  return mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
}

/**
 * El ciclo que contiene a `hoy`.
 *
 * Si hoy es el propio día de corte, el ciclo EMPIEZA hoy: el corte abre período,
 * no lo cierra. Es la misma convención que `calcularNuevaFecha`, donde pagar el
 * día del vencimiento cubre desde ese día.
 *
 * @param diaCorte  `suscripciones."diaCorte"` (1-31).
 * @param hoy       'YYYY-MM-DD'. Solo se pasa en los tests.
 */
export function cicloVigente(diaCorte: number, hoy: string = fechaHoyRD()): Ciclo {
  const [anio, mes, dia] = hoy.slice(0, 10).split('-').map(Number);

  // Si aún no hemos llegado al corte de este mes, el ciclo abrió el mes pasado.
  const [iy, im] = dia < diaAnclado(anio, mes, diaCorte)
    ? mesAnterior(anio, mes)
    : [anio, mes];

  const [fy, fm] = mesSiguiente(iy, im);

  return {
    inicio: iso(iy, im, diaAnclado(iy, im, diaCorte)),
    fin:    iso(fy, fm, diaAnclado(fy, fm, diaCorte)),
  };
}

/**
 * Los `n` ciclos más recientes, del que contiene a `hoy` hacia atrás.
 *
 * Lo usa el panel de excedentes (que solo mira ciclos ya CERRADOS) y el script
 * de medición cuando se le pide histórico.
 */
export function ciclosRecientes(diaCorte: number, n: number, hoy: string = fechaHoyRD()): Ciclo[] {
  const vigente = cicloVigente(diaCorte, hoy);
  const ciclos: Ciclo[] = [vigente];

  let [y, m] = vigente.inicio.slice(0, 7).split('-').map(Number);
  for (let i = 1; i < Math.max(1, n); i++) {
    const [py, pm] = mesAnterior(y, m);
    ciclos.push({
      inicio: iso(py, pm, diaAnclado(py, pm, diaCorte)),
      fin:    iso(y,  m,  diaAnclado(y,  m,  diaCorte)),
    });
    y = py; m = pm;
  }
  return ciclos;
}

/**
 * El último ciclo CERRADO, es decir el anterior al vigente.
 *
 * Es el único que se puede cobrar: un ciclo en curso todavía puede sumar e-CF,
 * y un cargo emitido a mitad de período quedaría corto en cuanto el cliente
 * facture otra vez.
 */
export function ultimoCicloCerrado(diaCorte: number, hoy: string = fechaHoyRD()): Ciclo {
  return ciclosRecientes(diaCorte, 2, hoy)[1];
}

/** ¿Este ciclo ya terminó? `fin` es exclusivo, así que el día de `fin` ya cerró. */
export function estaCerrado(ciclo: Ciclo, hoy: string = fechaHoyRD()): boolean {
  return hoy.slice(0, 10) >= ciclo.fin;
}
