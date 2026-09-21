/**
 * Balance General detallado (2026-09-21) — construcción del árbol jerárquico
 * a partir del catálogo de cuentas (madre/hija vía cuentaPadreId) y los
 * saldos por cuenta (SaldosCuentasService, única fuente de verdad).
 *
 * Funciones PURAS (sin DB) para poder probar a fondo los casos límite
 * (huérfana sin madre, división por cero, nivel de detalle, cancelación de
 * signos) sin depender de Postgres — la integración real (que el catálogo y
 * los saldos vengan scopeados por empresaId) se prueba aparte, contra
 * hicloud_test, en balance-general-detallado.service.spec.ts.
 */

export interface CuentaCatalogo {
  id:                 number;
  codigo:             string;
  nombre:             string;
  tipo:               string;
  naturaleza:         string;
  nivel:              number;
  permiteMovimientos: boolean;
  cuentaPadreId?:     number | null;
}

export interface NodoBalanceGeneral {
  codigo:             string;
  nombre:             string;
  nivel:              number;
  tipo:               string;
  esCuentaGrupo:      boolean;
  monto:              number;
  porcentajeVertical: number;
  comparado?:         number;
  diferencia?:        number;
  diferenciaPct?:      number | null;
  hijos:              NodoBalanceGeneral[];
}

/** cuentaPadreId apunta a una cuenta que no existe (o está inactiva, ya
 * excluida del catálogo pasado aquí) → se trata como raíz, nunca se descarta
 * ni se rompe la construcción del árbol. */
function resolverPadreId(c: CuentaCatalogo, porId: Map<number, CuentaCatalogo>): number | null {
  return c.cuentaPadreId != null && porId.has(c.cuentaPadreId) ? c.cuentaPadreId : null;
}

/**
 * Suma cada cuenta + todos sus descendientes (postorder). saldosDirectos
 * solo trae cuentas con movimiento (HAVING de SaldosCuentasService) — las
 * demás (cuentas de agrupación, cuentas sin movimiento) valen 0 propio, pero
 * igual pueden tener un agregado > 0 vía sus hijas.
 */
export function calcularSaldosAgregados(
  catalogo: CuentaCatalogo[],
  saldosDirectos: Map<string, number>,
): Map<string, number> {
  const porId = new Map(catalogo.map(c => [c.id, c]));
  const hijosPorId = new Map<number, CuentaCatalogo[]>();
  for (const c of catalogo) {
    const padreId = resolverPadreId(c, porId);
    if (padreId !== null) {
      if (!hijosPorId.has(padreId)) hijosPorId.set(padreId, []);
      hijosPorId.get(padreId)!.push(c);
    }
  }

  const agregados = new Map<string, number>();
  const enProceso = new Set<number>(); // ciclo defensivo — no debería darse con datos reales

  function calcular(c: CuentaCatalogo): number {
    const previo = agregados.get(c.codigo);
    if (previo !== undefined) return previo;
    if (enProceso.has(c.id)) return 0;
    enProceso.add(c.id);
    const propio = saldosDirectos.get(c.codigo) ?? 0;
    const hijos  = hijosPorId.get(c.id) ?? [];
    const total  = +(propio + hijos.reduce((s, h) => s + calcular(h), 0)).toFixed(2);
    enProceso.delete(c.id);
    agregados.set(c.codigo, total);
    return total;
  }

  for (const c of catalogo) calcular(c);
  return agregados;
}

/** Suma de las cuentas raíz (sin madre, o con madre huérfana) de un tipo —
 * el total real de la sección, independiente del nivel de detalle mostrado. */
export function calcularTotalRaices(
  catalogo: CuentaCatalogo[],
  tipo: string,
  agregados: Map<string, number>,
): number {
  const porId = new Map(catalogo.map(c => [c.id, c]));
  const raices = catalogo.filter(c => c.tipo === tipo && resolverPadreId(c, porId) === null);
  return +raices.reduce((s, c) => s + (agregados.get(c.codigo) ?? 0), 0).toFixed(2);
}

/**
 * Árbol visible de un tipo (activo/pasivo/patrimonio), recortado a
 * nivelDetalleNum (null = todos los niveles). El monto de cada nodo es
 * SIEMPRE el agregado completo (incluye descendientes más allá del nivel
 * mostrado) — el nivel de detalle es una capa de presentación, no un
 * recorte de datos.
 *
 * ocultarCeros descarta un nodo solo si su propio agregado Y todos sus
 * hijos visibles quedaron en 0 — un nodo con hijos que cancelan a 0 pero
 * con algún hijo individualmente ≠ 0 nunca se descarta junto con ese hijo.
 */
export function construirNodos(
  catalogo:            CuentaCatalogo[],
  tipo:                string,
  agregados:           Map<string, number>,
  agregadosComparado:  Map<string, number> | null,
  nivelDetalleNum:     number | null,
  ocultarCeros:        boolean,
  totalGrupo:          number,
): NodoBalanceGeneral[] {
  const porId    = new Map(catalogo.map(c => [c.id, c]));
  const delTipo  = catalogo.filter(c => c.tipo === tipo);
  const visibles = delTipo.filter(c => nivelDetalleNum === null || c.nivel <= nivelDetalleNum);
  const idsVisibles = new Set(visibles.map(c => c.id));

  const build = (c: CuentaCatalogo): NodoBalanceGeneral | null => {
    const monto = agregados.get(c.codigo) ?? 0;
    const hijosCatalogo = visibles.filter(h => idsVisibles.has(h.id) && resolverPadreId(h, porId) === c.id);
    const hijos = hijosCatalogo
      .map(build)
      .filter((n): n is NodoBalanceGeneral => n !== null)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    if (ocultarCeros && monto === 0 && hijos.length === 0) return null;

    const nodo: NodoBalanceGeneral = {
      codigo: c.codigo,
      nombre: c.nombre,
      nivel:  c.nivel,
      tipo:   c.tipo,
      esCuentaGrupo: !c.permiteMovimientos,
      monto,
      porcentajeVertical: totalGrupo !== 0 ? +((monto / totalGrupo) * 100).toFixed(1) : 0,
      hijos,
    };

    if (agregadosComparado) {
      const comparado  = agregadosComparado.get(c.codigo) ?? 0;
      const diferencia = +(monto - comparado).toFixed(2);
      nodo.comparado     = comparado;
      nodo.diferencia    = diferencia;
      nodo.diferenciaPct = comparado !== 0
        ? +((diferencia / Math.abs(comparado)) * 100).toFixed(1)
        : (monto === 0 ? 0 : null);
    }

    return nodo;
  };

  const raices = visibles.filter(c => resolverPadreId(c, porId) === null);
  return raices
    .map(build)
    .filter((n): n is NodoBalanceGeneral => n !== null)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Aplana el árbol a filas para exportar (Excel/CSV/PDF), con indentación
 * por nivel para conservar la jerarquía en un formato tabular plano. */
export interface FilaAplanada {
  seccion:        string;
  codigo:         string;
  nombre:         string; // ya indentado con espacios según profundidad
  esCuentaGrupo:  boolean;
  monto:          number;
  porcentajeVertical: number;
  comparado?:     number;
  diferencia?:    number;
  diferenciaPct?: number | null;
}

export function aplanarNodos(nodos: NodoBalanceGeneral[], seccion: string, profundidad = 0): FilaAplanada[] {
  const filas: FilaAplanada[] = [];
  for (const n of nodos) {
    filas.push({
      seccion,
      codigo: n.codigo,
      nombre: '  '.repeat(profundidad) + n.nombre,
      esCuentaGrupo: n.esCuentaGrupo,
      monto: n.monto,
      porcentajeVertical: n.porcentajeVertical,
      comparado: n.comparado,
      diferencia: n.diferencia,
      diferenciaPct: n.diferenciaPct,
    });
    filas.push(...aplanarNodos(n.hijos, seccion, profundidad + 1));
  }
  return filas;
}
