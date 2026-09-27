/**
 * Filtro "solo mis facturas" del panel genérico del POS (POSPanel, tab
 * Facturas) — el backend YA lo fuerza igual sin importar esto
 * (facturas.service.ts), así que este cálculo es solo para que la UI no
 * pida de entrada un listado que el backend va a recortar de todas formas.
 *
 * admin/contador: nunca filtran, ven todo.
 * vendedor con sesión de supervisor ACTIVA: ve todo, como admin.
 * vendedor sin supervisor activo: filtra por su propio vendedorId (POS).
 */
export function construirFiltroVendedorPOS(params: {
  esAdmin: boolean;
  supervisorSessionActive?: boolean;
  vendedorId?: string | null;
}): string {
  if (params.esAdmin || params.supervisorSessionActive || !params.vendedorId) return '';
  return `&vendedorId=${params.vendedorId}`;
}
