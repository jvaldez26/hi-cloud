/**
 * Venta en curso (modal de cobro abierto): reglas de qué pasa con un
 * producto agregado mientras tanto, y qué total se le muestra a la cajera.
 *
 * Root cause real: FAC-1746 (empresa 73, 2026-10-08) — un producto
 * agregado (scan de la siguiente venta, casi siempre) durante la espera de
 * la emisión del e-CF (puede tardar varios segundos, ver el comentario
 * "síncrono 8s" en ventaMut) se mezclaba con el carrito que se estaba
 * cobrando: nada bloqueaba agregar mientras tanto, y el total mostrado en
 * el modal/impreso en el ticket se recalculaba en vivo de ese carrito ya
 * contaminado. La factura en sí nunca estuvo en riesgo — el payload ya
 * salía como copia fija al hacer clic en "Confirmar cobro" — pero el
 * NÚMERO que veía la cajera y el que salía en el primer ticket sí podían
 * reflejar un producto que no era de esa venta.
 */

interface ItemConProducto {
  produto: { id: number };
  cantidad: number;
  esBalanza?: boolean;
}

/**
 * Fusiona la cola de "próxima venta" dentro del carrito actual — mismo
 * producto ⇒ se suman las cantidades; una línea de balanza (esBalanza)
 * SIEMPRE se antepone como línea nueva, nunca se combina (dos paquetes del
 * mismo PLU pesan distinto — mismo criterio que addBalanzaToCart).
 */
export function fusionarColaEnCarrito<T extends ItemConProducto>(
  carritoActual: T[], cola: T[],
): T[] {
  let resultado = carritoActual;
  for (const item of cola) {
    const idx = resultado.findIndex(i => i.produto.id === item.produto.id);
    resultado = (idx >= 0 && !item.esBalanza)
      ? resultado.map((it, i) => (i === idx ? { ...it, cantidad: it.cantidad + item.cantidad } : it))
      : [item, ...resultado];
  }
  return resultado;
}

/**
 * ¿Toca fusionar la cola AHORA? Solo en el flanco de bajada del modal de
 * cobro (showPago true → false): la venta en curso terminó, con éxito
 * (el carrito ya quedó vacío) o porque el cajero canceló/abandonó el
 * intento (el carrito sigue siendo el borrador a reintentar — la cola se
 * suma a ESE). Mientras el modal se queda abierto esperando un reintento
 * (una emisión fallida NO cierra el modal, a propósito, para que el cajero
 * pueda reintentar sin rehacer nada), no se fusiona: mezclar ahí
 * contaminaría un carrito que está a punto de reenviarse tal cual.
 */
export function debeFusionarColaAhora(
  showPagoAntes: boolean, showPagoAhora: boolean, colaLength: number,
): boolean {
  return showPagoAntes && !showPagoAhora && colaLength > 0;
}

/**
 * Total que debe mostrar el modal de cobro: congelado mientras la venta
 * está en curso (isPending), para que el número que ve la cajera sea
 * siempre exactamente el que se envió al hacer clic en "Confirmar cobro" —
 * nunca uno recalculado del carrito en vivo mientras se espera la
 * respuesta del servidor.
 */
export function totalMostradoEnModal(
  isPending: boolean, totalCongelado: number | null, totalEnVivo: number,
): number {
  return isPending && totalCongelado != null ? totalCongelado : totalEnVivo;
}
