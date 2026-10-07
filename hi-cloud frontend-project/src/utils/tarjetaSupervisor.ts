/**
 * Mismo criterio que backend/src/supervisor-tarjetas/tarjeta-codigo.util.ts
 * — duplicado a propósito (front y back son bundles separados): un código
 * de tarjeta de supervisor es el prefijo fijo "HSUP" + 26 caracteres
 * [A-Z0-9]. Se usa en dos sitios con el MISMO criterio:
 *   - POSPage.tsx: el escaneo del modal de supervisor identifica si lo que
 *     entró es una tarjeta (sin elegir supervisor de la lista) o texto
 *     normal.
 *   - POSPage.tsx: procesarScan() (búsqueda de producto) corta ANTES de
 *     tratar un escaneo con este prefijo como código de barras de producto.
 */
export const PREFIJO_TARJETA_SUPERVISOR = 'HSUP';

const PATRON_TARJETA_SUPERVISOR = new RegExp(`^${PREFIJO_TARJETA_SUPERVISOR}[A-Z0-9]{26}$`);

export function esFormatoTarjetaSupervisor(valor: string): boolean {
  return PATRON_TARJETA_SUPERVISOR.test(valor.trim().toUpperCase());
}
