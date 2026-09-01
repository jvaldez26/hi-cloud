/**
 * Cuántos períodos cubre un pago y qué vencimiento deja.
 *
 * Fórmula ÚNICA. La usan las tres cosas que antes la escribían por separado:
 * `registrarPago`, `confirmarTransferencia` y el preview que el admin lee en el
 * Popconfirm antes de confirmar. Ese preview vivía en el frontend
 * (`CobrosPage.calcularPreviewPago`) — la misma cuenta sobre el mismo dinero,
 * escrita dos veces, prometiéndole al admin un vencimiento que el backend
 * volvía a calcular medio segundo después. Mismo criterio que el efectivo
 * esperado del cierre de caja: el cliente no calcula dinero, muestra lo que
 * llega.
 *
 * Pura y exportada para poder verificarla — ver preview-pago.util.spec.ts.
 */
import { fechaHoyRD } from '../common/utils/fecha-local.util';

export interface EntradaPreview {
  monto:            number;
  /** Precio del plan por MES. En modalidad anual se multiplica por 12. */
  precioMensual:    number;
  /** Vencimiento actual: 'YYYY-MM-DD', ISO, o el Date que devuelve pg. */
  venceSuscripcion: string | Date;
  diaCorte:         number;
  modalidad:        string;
  /** Hoy en RD ('YYYY-MM-DD'). Solo se pasa en los tests. */
  hoy?:             string;
}

export interface PreviewPago {
  /** Períodos completos que cubre el pago. 0 = queda como abono. */
  periodos:         number;
  precioPorPeriodo: number;
  /** Vencimiento resultante, 'YYYY-MM-DD'. null si no cubre ni un período. */
  nuevaFecha:       string | null;
  /** Lo que falta para completar un período. 0 si ya lo cubre. */
  faltante:         number;
  /** El nuevo vencimiento SIGUE en el pasado: venía muy atrasada. */
  enPasado:         boolean;
  /** El plan no tiene precio configurado: no hay nada que calcular. */
  sinPrecio:        boolean;
}

/**
 * La fecha de calendario de un vencimiento, venga como venga.
 *
 * `pg` convierte una columna `date` en un Date a medianoche LOCAL del proceso
 * (el servidor corre en UTC), así que `toISOString()` conserva el día. Una
 * cadena se recorta y ya: puede traer hora pegada detrás.
 */
export function fechaDeVencimiento(v: string | Date): string {
  return typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/**
 * Aplica N períodos a un vencimiento, anclando el día al `diaCorte`.
 *
 * Del vencimiento actual solo se usa el AÑO y el MES: el día lo pone el ancla,
 * no la fecha anterior. Así un corte 31 no se degrada para siempre al pasar por
 * un mes de 30 — abril lo recorta a 30 y mayo vuelve a 31.
 */
export function calcularNuevaFecha(
  fechaStr:  string,
  diaCorte:  number,
  periodos:  number,
  modalidad: string,
): string {
  const [y, m] = fechaStr.slice(0, 7).split('-').map(Number);
  let ny = y, nm = m;
  if (modalidad === 'anual') {
    ny += periodos;
  } else {
    nm += periodos;
    while (nm > 12) { nm -= 12; ny += 1; }
  }
  const ultimoDia = new Date(ny, nm, 0).getDate();
  const nd = Math.min(diaCorte, ultimoDia);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function calcularPreviewPago(e: EntradaPreview): PreviewPago {
  const precioMensual    = Number(e.precioMensual ?? 0);
  const precioPorPeriodo = e.modalidad === 'anual' ? precioMensual * 12 : precioMensual;

  // Sin precio no se puede decir nada. Antes el frontend seguía adelante y
  // anunciaba "faltan RD$-1,500.00" mientras el backend rechazaba el pago.
  if (!Number.isFinite(precioPorPeriodo) || precioPorPeriodo <= 0) {
    return { periodos: 0, precioPorPeriodo: 0, nuevaFecha: null, faltante: 0, enPasado: false, sinPrecio: true };
  }

  const monto    = Number(e.monto ?? 0);
  const periodos = Math.floor(monto / precioPorPeriodo);

  if (periodos < 1) {
    return {
      periodos:  0,
      precioPorPeriodo,
      nuevaFecha: null,
      // Redondeado: 1500 − 1499.99 en coma flotante son 0.010000000000218279.
      faltante:  Math.round((precioPorPeriodo - monto) * 100) / 100,
      enPasado:  false,
      sinPrecio: false,
    };
  }

  const nuevaFecha = calcularNuevaFecha(
    fechaDeVencimiento(e.venceSuscripcion), Number(e.diaCorte), periodos, e.modalidad,
  );

  // Se comparan DÍAS, no instantes: 'YYYY-MM-DD' ordena igual como texto que
  // como fecha. Vencer HOY no es estar vencida — la suscripción vale todo el
  // día. El preview del frontend lo daba por vencido a partir del mediodía.
  return {
    periodos,
    precioPorPeriodo,
    nuevaFecha,
    faltante:  0,
    enPasado:  nuevaFecha < (e.hoy ?? fechaHoyRD()),
    sinPrecio: false,
  };
}
