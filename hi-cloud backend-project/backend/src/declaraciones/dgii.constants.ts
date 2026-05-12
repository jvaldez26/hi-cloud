/** Tabla oficial DGII — Tipos de bienes y servicios para Formato 606 */
export const TIPOS_BIENES_606: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Trabajo, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};

/** Tabla oficial DGII — Formas de pago */
export const FORMAS_PAGO_DGII: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque / Transferencia / Depósito',
  '03': 'Tarjeta de Débito / Crédito',
  '04': 'Compra a Crédito',
  '05': 'Permuta',
  '06': 'Nota de Crédito',
  '07': 'Mixto',
};

/** Tabla oficial DGII — Tipos de ingreso para Formato 607 */
export const TIPOS_INGRESO_607: Record<string, string> = {
  '01': 'Ingresos por operaciones (no financieros)',
  '02': 'Ingresos financieros',
  '03': 'Ingresos extraordinarios',
  '04': 'Ingresos por arrendamientos',
  '05': 'Ingresos por venta de activos depreciables',
  '06': 'Otros ingresos',
};

/** Mapeo método de pago HiCloud → código DGII */
export function mapFormaPagoDgii(metodo: string | undefined | null): string {
  const m = (metodo ?? '').toLowerCase().trim();
  if (m.includes('tarjeta') || m.includes('card'))    return '03';
  if (m.includes('transfer') || m.includes('cheque')) return '02';
  if (m.includes('crédito') || m.includes('credito')) return '04';
  if (m.includes('permuta'))                           return '05';
  if (m.includes('nota'))                              return '06';
  if (m.includes('mixto'))                             return '07';
  return '01'; // efectivo por defecto
}

/** Tipo de ingreso para 607 — ventas normales = '01' */
export function mapTipoIngreso607(tipoNcf: string | undefined | null): string {
  switch (tipoNcf) {
    case 'E44': return '01'; // zona franca → operaciones
    case 'E45': return '01'; // gubernamental → operaciones
    case 'E46':
    case 'E47': return '01'; // exportaciones → operaciones
    default:    return '01'; // E31, E32 → operaciones normales
  }
}

/** Monto a entero sin decimales (centavos DGII: x100, luego redondear) */
export function montoEntero(valor: number | string | undefined | null): number {
  return Math.round(Number(valor ?? 0) * 100);
}

/** Fecha al formato AAAAMMDD requerido por DGII */
export function fechaDgii(d: Date | string | undefined | null): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** Valida formato RNC (9 dígitos) */
export function esRncValido(rnc: string | undefined | null): boolean {
  return /^\d{9}$/.test((rnc ?? '').trim());
}

/** Valida formato cédula (11 dígitos) */
export function esCedulaValida(cedula: string | undefined | null): boolean {
  return /^\d{11}$/.test((cedula ?? '').trim());
}

/** Detecta si un valor es RNC (9), cédula (11), pasaporte u otro */
export function tipoIdDgii(valor: string | undefined | null): '1' | '2' | '3' | '' {
  const v = (valor ?? '').replace(/\D/g, '');
  if (v.length === 9)  return '1'; // RNC
  if (v.length === 11) return '2'; // Cédula
  if (v.length > 0)    return '3'; // Pasaporte u otro
  return '';
}
