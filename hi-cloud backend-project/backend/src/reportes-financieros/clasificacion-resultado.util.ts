/**
 * Estado de Resultados (2026-09-21) — resolución de la clasificación
 * operacional/no operacional efectiva de cada cuenta, con herencia: una
 * cuenta con clasificacionResultado=null hereda de su cuenta madre, subiendo
 * la cadena hasta encontrar un valor; sin valor en toda la cadena →
 * 'operacional' (default). Función pura, sin DB — se resuelve UNA vez por
 * catálogo completo (no una consulta por cuenta), memoizada por id.
 */

export type ClasificacionResultado = 'operacional' | 'no_operacional';

export interface CuentaClasificable {
  id:                     number;
  codigo:                 string;
  clasificacionResultado?: ClasificacionResultado | null;
  cuentaPadreId?:         number | null;
}

/** Devuelve un Map<codigo, clasificación efectiva> para TODO el catálogo. */
export function resolverClasificacionResultado(
  catalogo: CuentaClasificable[],
): Map<string, ClasificacionResultado> {
  const porId    = new Map(catalogo.map(c => [c.id, c]));
  const cache    = new Map<number, ClasificacionResultado>();
  const enProceso = new Set<number>(); // ciclo defensivo — no debería darse con datos reales

  function resolver(c: CuentaClasificable): ClasificacionResultado {
    const previo = cache.get(c.id);
    if (previo) return previo;
    if (enProceso.has(c.id)) return 'operacional';
    if (c.clasificacionResultado) {
      cache.set(c.id, c.clasificacionResultado);
      return c.clasificacionResultado;
    }
    enProceso.add(c.id);
    const padre = c.cuentaPadreId != null ? porId.get(c.cuentaPadreId) : undefined;
    const resultado = padre ? resolver(padre) : 'operacional';
    enProceso.delete(c.id);
    cache.set(c.id, resultado);
    return resultado;
  }

  const out = new Map<string, ClasificacionResultado>();
  for (const c of catalogo) out.set(c.codigo, resolver(c));
  return out;
}
