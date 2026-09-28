/**
 * ¿El carrito tiene algún ítem con precio modificado que necesita una
 * sesión de supervisor VIGENTE para cobrar? Mismo patrón que
 * ventaCreditoGate.ts.
 *
 * El caso que esto cierra: un carrito con un precio/descuento autorizado
 * por supervisor se guarda (persistencia, ver carritoStorage.ts), la
 * sesión de supervisor expira (8h, o se cierra a mano), y el carrito se
 * restaura más tarde — sin este chequeo, `precioModificado` sigue en `true`
 * en el ítem y nada vuelve a pedir autorización antes de cobrar. No es
 * exclusivo de un carrito "recuperado": un carrito que simplemente se dejó
 * abierto hasta que la sesión de supervisor venció tiene el mismo problema.
 *
 * Solo mira `precioModificado` — no reevalúa CUÁNTO cambió el precio, eso
 * ya lo decidió quien lo autorizó en su momento. El backend además valida
 * de verdad la sesión declarada al crear la factura (ver
 * FacturasService.resolverSupervisorSessionId) — esto es la UX que evita
 * llegar hasta ahí con una autorización ya vencida.
 */
export function requiereSupervisorPorPrecioModificado<T extends { precioModificado?: boolean }>(
  cart: T[],
  supervisorActive: boolean,
): boolean {
  return !supervisorActive && cart.some(item => item.precioModificado === true);
}
