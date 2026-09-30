/**
 * Idempotencia del checkout del POS. Causa real de los borradores huérfanos
 * (FAC-15784/FAC-15785, 2026-09-23): la emisión del e-CF fallaba después de
 * crear la factura, el modal de aviso NO vaciaba antes el carrito, y el
 * cajero — sin saber que ya había un borrador esperando — volvía a teclear
 * la MISMA venta desde cero, creando una segunda factura por el mismo monto.
 *
 * `intentoCobroRef` guarda el último intento que se quedó en borrador
 * (factura, claveIdempotencia, y la firma del payload que lo creó). Si el
 * PRÓXIMO intento de cobro manda un payload IDÉNTICO — nada cambió en el
 * carrito, cliente, forma de pago ni descuento — se retoma ESA factura en
 * vez de crear otra. Cualquier cambio en el payload (el cajero corrigió algo
 * antes de reintentar) rompe la coincidencia a propósito: reutilizar a ciegas
 * arriesgaría emitir a la DGII datos distintos a los que el cajero ve en
 * pantalla. Ese caso simplemente crea una factura nueva — el borrador viejo
 * queda huérfano, igual que hoy, en vez de arriesgar una emisión incorrecta.
 */
export interface IntentoCobroPrevio {
  factura: unknown;
  claveIdempotencia: string;
  payloadStr: string;
}

export function resolverIntentoCobro(
  previo: IntentoCobroPrevio | null,
  payloadStr: string,
): { reusar: true; factura: unknown; claveIdempotencia: string } | { reusar: false } {
  if (previo && previo.payloadStr === payloadStr) {
    return { reusar: true, factura: previo.factura, claveIdempotencia: previo.claveIdempotencia };
  }
  return { reusar: false };
}
