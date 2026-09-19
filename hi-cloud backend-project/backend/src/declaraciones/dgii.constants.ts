import { MetodoPago } from '../common/enums/metodo-pago.enum';

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

/**
 * Traduce MetodoPago (el enum real de PagoRealizado — common/enums/metodo-pago.enum.ts,
 * el mismo que usa CxP al registrar un pago a proveedor) al código DGII de
 * forma de pago. Match exacto, no adivinanza por substring — la versión
 * anterior de esta función nunca se llamaba desde ningún lado (código
 * muerto) y encima tenía un bug: 'otro' caía en el fallback y se reportaba
 * como '01' Efectivo, silenciosamente incorrecto.
 *
 * 'otro' (y cualquier valor no reconocido) devuelve null a propósito: no
 * hay código DGII confiable para "otro", y asumir uno en silencio es
 * exactamente el tipo de error que esta tarea existe para eliminar. El
 * caller decide qué hacer con null (típicamente: dejar la clasificación
 * existente de la compra, no pisarla con una suposición).
 */
export function mapFormaPagoDgii(metodo: MetodoPago | string | undefined | null): string | null {
  switch (metodo) {
    case MetodoPago.EFECTIVO:      return '01';
    case MetodoPago.TRANSFERENCIA: return '02';
    case MetodoPago.CHEQUE:        return '02';
    case MetodoPago.TARJETA:       return '03';
    default:                       return null; // 'otro', vacío, o algo no reconocido
  }
}

/**
 * Resuelve la forma de pago DGII de una compra a partir de TODOS sus pagos
 * reales (PagoRealizado.metodoPago — puede haber varios, uno por cada abono
 * parcial contra la CxP). "Mixto" se decide sobre el CÓDIGO DGII ya
 * traducido, no sobre el enum crudo de HiCloud: cheque y transferencia son
 * métodos distintos para nosotros pero el MISMO código DGII ('02'), así que
 * pagar parte por cheque y parte por transferencia no es "mixto" para
 * DGII — sí lo es pagar parte en efectivo y parte por transferencia
 * ('01' vs '02'), donde no hay forma correcta de elegir "el más reciente"
 * o "el primero" sin falsear cómo se pagó realmente.
 *
 * Los métodos sin traducción confiable ('otro') se ignoran para esta
 * resolución en vez de forzar un null total — si hay al menos un pago con
 * código DGII conocido, se usa ese; solo cuando NINGÚN pago tiene una
 * traducción confiable (o no hay pagos) se devuelve null y no se pisa lo
 * que la compra ya tenía.
 */
export function resolverFormaPagoCompra(metodos: (MetodoPago | string)[]): string | null {
  const codigos = metodos
    .map(m => mapFormaPagoDgii(m))
    .filter((c): c is string => c !== null);
  if (codigos.length === 0) return null;
  const unicos = [...new Set(codigos)];
  if (unicos.length > 1) return '07'; // Mixto
  return unicos[0];
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
