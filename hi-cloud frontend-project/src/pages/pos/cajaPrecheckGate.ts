/**
 * Precheck de caja antes de cobrar (POSPage.tsx, ventaMut) — decide si
 * DEBE bloquear el cobro según lo que GET /caja/hoy?vendedorId= devolvió.
 *
 * Incidente real (2026-10-16, empresa 44, Ventas Populares R&M): este
 * precheck SÍ bloqueaba antes, lanzando SIN_CAJA sin llegar nunca al
 * backend — las 231 facturas emitidas ese mismo día (con la caja realmente
 * abierta) y CERO rechazos en audit_logs lo prueban: el bloqueo ocurría
 * puramente en el cliente.
 *
 * /caja/hoy solo reconoce la caja de HOY para el vendedorId que el cliente
 * cree tener en ese instante — una pregunta estrecha y frágil (vendedorId
 * obsoleto, un refresh de token a mitad de turno, el timing del polling de
 * 30s). El backend real (esCajaAbiertaVendedor, caja.service.ts) es la
 * ÚNICA autoridad: acepta cualquier caja abierta del vendedor sin importar
 * el día, y es quien de verdad rechaza si no hay ninguna — con un mensaje
 * que el manejador de errores del cobro YA reconoce (isSinCaja) y muestra
 * igual.
 *
 * Por eso esta función SIEMPRE devuelve false: el precheck informa (el
 * banner "Caja no detectada en caché"), nunca bloquea. Si en el futuro
 * alguien quiere volver a bloquear aquí, que rompa este test a propósito.
 */
export function debeBloquearPorCajaPrecheck(
  _cajaStatus: 'abierta' | 'cerrada' | 'desconocida',
): boolean {
  return false;
}
