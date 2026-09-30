/**
 * Filtro "Empresa relacionada" de las tablas de HiCloud Xlink — el backend
 * no tiene este filtro (no hay columna de texto libre útil para buscar por
 * empresa contraparte sin exponer su empresaId), así que se aplica en el
 * cliente sobre lo ya paginado.
 */
export function filtrarPorRelacionado<T extends { contraparteNombre?: string }>(filas: T[], relacionado: string): T[] {
  if (!relacionado.trim()) return filas;
  const q = relacionado.trim().toLowerCase();
  return filas.filter(f => f.contraparteNombre?.toLowerCase().includes(q));
}
