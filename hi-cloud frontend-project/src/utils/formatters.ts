/**
 * Convierte una cadena de fecha a objeto Date sin desfase de zona horaria.
 * "2026-05-04" → new Date(2026, 4, 4) en lugar de UTC midnight que en RD
 * (UTC-4) se convertiría al día anterior.
 */
function parseLocalDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  // Formato ISO puro YYYY-MM-DD → parsear como fecha local
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
}

const DATE_FMT = new Intl.DateTimeFormat('es-DO', {
  day:   '2-digit',
  month: '2-digit',
  year:  'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('es-DO', {
  day:    '2-digit',
  month:  '2-digit',
  year:   'numeric',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: true,
});

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

  date: (d: string | Date) =>
    d ? DATE_FMT.format(parseLocalDate(d as string)) : '',

  dateTime: (d: string | Date) =>
    d ? DATETIME_FMT.format(parseLocalDate(d as string)) : '',
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
