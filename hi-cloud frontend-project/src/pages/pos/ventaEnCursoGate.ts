/**
 * Venta EN CURSO — desde que se llama ventaMut.mutate() (clic en
 * "Confirmar cobro") hasta que esa venta termina, con éxito o con fallo —
 * reglas de qué pasa con un producto agregado mientras tanto, y qué total
 * se le muestra a la cajera.
 *
 * A propósito NO es "modal de cobro abierto": antes de confirmar, el modal
 * puede estar abierto un buen rato (eligiendo forma de pago, el cliente
 * pidiendo "una cosa más") y un producto agregado en ese tramo debe entrar
 * a ESA venta con normalidad, con el total actualizándose en vivo — recién
 * al confirmar se congela el total y lo que se agregue después se desvía a
 * la próxima venta.
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
 * ¿Un producto agregado AHORA va a la cola de la próxima venta, o al
 * carrito actual? Depende de "venta en curso" (ventaMut.isPending),
 * NUNCA de si el modal de cobro está abierto (showPago): antes de hacer
 * clic en "Confirmar cobro" el modal puede llevar rato abierto —eligiendo
 * forma de pago, el cliente pidiendo "una cosa más"— y ese producto es
 * parte de ESTA venta, con el total actualizándose en vivo con él.
 */
export function debeEncolarAgregado(ventaEnCurso: boolean): boolean {
  return ventaEnCurso;
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
 * ¿Toca fusionar la cola AHORA? Detector de flanco genérico (true→false):
 * en POSPage.tsx se usa con "el carrito TENÍA productos" como "antes" y
 * "ahora" — o sea, dispara justo cuando el carrito se vacía.
 *
 * A propósito NO está atado a ventaMut.isPending: isPending también vuelve
 * a false cuando la mutación TERMINA CON UN FALLO (_emisionFallo,
 * _requiereSupervisor, onError) — y esos fallos dejan el carrito INTACTO a
 * propósito, para que el cajero pueda reintentar sin rehacer nada. Fusionar
 * ahí mezclaría la cola con un borrador que está a punto de reenviarse tal
 * cual. El carrito vaciándose, en cambio, SOLO pasa cuando la venta
 * terminó de verdad — con éxito (onSuccess lo limpia) o porque el cajero
 * abandonó el intento (botón "Vaciar"/F4) — así que es la señal correcta.
 * Si el cajero reintenta, el carrito vuelve a tener contenido, el gate
 * (ver debeEncolarAgregado, atado a ventaMut.isPending) se reactiva para lo
 * que se agregue en ESE nuevo tramo, y cuando ESE intento por fin concluya
 * (éxito o abandono), la cola completa se fusiona aquí.
 */
export function debeFusionarColaAhora(
  antes: boolean, ahora: boolean, colaLength: number,
): boolean {
  return antes && !ahora && colaLength > 0;
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
