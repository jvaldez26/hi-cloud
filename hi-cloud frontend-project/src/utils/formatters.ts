/**
 * El formateo de fechas vive en fechaRD.ts, con la zona de RD fijada.
 *
 * Antes se hacía aquí con un Intl.DateTimeFormat sin `timeZone`, o sea con la
 * zona del navegador: en una PC con la zona mal configurada —que las hay— una
 * factura de las 9:14 a.m. se mostraba a la 1:14 p.m. El locale 'es-DO' elige
 * el formato, no la zona, y eso hacía que el resultado pareciera correcto.
 *
 * `fmt.date` y `fmt.dateTime` se mantienen porque los usa medio ERP; ahora solo
 * delegan.
 */
import { fecha as fechaRD, fechaHora as fechaHoraRD } from './fechaRD';

/** Redondea a 2 decimales de forma segura evitando errores de punto flotante. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const fmt = {
  money: (n: any) => {
    const val = Number(n);
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(isNaN(val) ? 0 : val);
  },

  /** Igual que money() pero respeta la moneda de la factura (DOP → RD$, USD → US$, etc.) */
  moneyM: (n: any, moneda?: string) => {
    const val = Number(n);
    const m   = moneda || 'DOP';
    const simb = m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'RD$';
    return simb + ' ' + new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(isNaN(val) ? 0 : val);
  },

  number: (n: number) =>
    new Intl.NumberFormat('es-DO').format(n),

  percent: (n: number) =>
    `${n.toFixed(1)}%`,

  date: (d: string | Date) => fechaRD(d),

  dateTime: (d: string | Date) => fechaHoraRD(d),
};

export const estadoColor: Record<string, string> = {
  borrador:     'default',
  emitida:      'blue',
  pagada:       'green',
  cancelada:    'red',
  recibida:     'cyan',
  pendiente:    'orange',
  pagada_parcial: 'gold',
  vencida:      'red',
  anulada:      'default',
};
