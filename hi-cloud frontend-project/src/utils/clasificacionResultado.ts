/**
 * Estado de Resultados (2026-09-21) — resolución de la clasificación
 * operacional/no operacional efectiva de una cuenta, con herencia. Copia
 * frontend de resolverClasificacionResultado() del backend (mismo patrón
 * que utils/totalesDocumento.ts — dos copias que un test cruzado mantiene
 * en sincronía) — aquí solo hace falta resolver UNA cuenta a la vez (el
 * hint "Heredaría: ..." del formulario), no el catálogo completo.
 */
export type ClasificacionResultado = 'operacional' | 'no_operacional';

export interface CuentaClasificable {
  id: number;
  clasificacionResultado?: ClasificacionResultado | null;
  cuentaPadreId?: number | null;
}

/** Clasificación efectiva de `cuentaPadreId` subiendo la cadena — la que heredaría una cuenta hija nueva. */
export function clasificacionHeredada(
  cuentaPadreId: number | null | undefined,
  catalogo: CuentaClasificable[],
  visitados = new Set<number>(),
): ClasificacionResultado {
  if (cuentaPadreId == null) return 'operacional';
  if (visitados.has(cuentaPadreId)) return 'operacional'; // ciclo defensivo
  const padre = catalogo.find(c => c.id === cuentaPadreId);
  if (!padre) return 'operacional';
  if (padre.clasificacionResultado) return padre.clasificacionResultado;
  visitados.add(cuentaPadreId);
  return clasificacionHeredada(padre.cuentaPadreId, catalogo, visitados);
}
