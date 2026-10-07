/**
 * Mismo criterio que backend/src/supervisor-tarjetas/tarjeta-codigo.util.ts
 * — duplicado a propósito (front y back son bundles separados): un código
 * de tarjeta de supervisor es el prefijo fijo numérico "90" + 22 dígitos.
 *
 * Antes era alfanumérico (HSUP + 26 [A-Z0-9], Code128 Set B) — se cambió a
 * SOLO DÍGITOS (reporte real, 2026-10-07): con 30 caracteres alfanuméricos
 * el Code128 impreso en papel carta normal no se leía con un escáner de
 * caja. Solo dígitos permite Code Set C (la mitad de módulos que Set B),
 * con eso cabe con un módulo ancho y zona de silencio de sobra.
 *
 * Se usa en dos sitios con el MISMO criterio:
 *   - POSPage.tsx: el escaneo del modal de supervisor identifica si lo que
 *     entró es una tarjeta (sin elegir supervisor de la lista) o texto
 *     normal.
 *   - POSPage.tsx: procesarScan() (búsqueda de producto) corta ANTES de
 *     tratar un escaneo con este prefijo como código de barras de producto
 *     — un código de producto real (EAN-13, UPC-A, codigo/codigoBarras
 *     interno) nunca llega a 24 dígitos, así que la longitud por sí sola ya
 *     descarta cualquier confusión.
 */
export const PREFIJO_TARJETA_SUPERVISOR = '90';
const LONGITUD_ALEATORIA = 22;

const PATRON_TARJETA_SUPERVISOR = new RegExp(`^${PREFIJO_TARJETA_SUPERVISOR}\\d{${LONGITUD_ALEATORIA}}$`);

export function esFormatoTarjetaSupervisor(valor: string): boolean {
  return PATRON_TARJETA_SUPERVISOR.test(valor.trim());
}
