import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Un servicio nunca entra en una alerta de stock bajo.
 *
 * ── El caso real ────────────────────────────────────────────────────────────
 * El correo diario de «Producto(s) con Stock Bajo» llegó con once filas, y casi
 * todas eran servicios: «ESCALA NO.01. SOFTWARE CONTABLE - FACTURACION
 * ELECTRONICA - SERVICIOS CONTABLES», con stock 0 y mínimo 0.
 *
 * Un servicio no tiene existencias. Nace con stock 0 y mínimo 0 —el formulario
 * de producto le borra esos campos— así que `stock <= stockMinimo` es SIEMPRE
 * verdadero para él. La alerta no estaba fallando de vez en cuando: para cada
 * servicio del catálogo se disparaba todos los días.
 *
 * ── Por qué este test recorre archivos en vez de probar una función ─────────
 * La condición estaba copiada en DOCE consultas repartidas por ocho módulos:
 * el correo, el push, el panel de alertas, el asistente, dos reportes, KPI,
 * inventario y el endpoint de productos. Arreglar una y dejar once es peor que
 * no arreglar ninguna, porque el mismo dato sale distinto según por dónde se
 * mire.
 *
 * Así que esto no comprueba una función: DESCUBRE consultas nuevas. Si alguien
 * añade otra alerta de stock sobre `productos` y se olvida del filtro, CI lo
 * dice sin que nadie tenga que acordarse de este archivo — el mismo criterio
 * que sesion-unica.spec.ts y jwt-expiry.spec.ts.
 */
describe('Alertas de stock bajo — los servicios quedan fuera', () => {
  const raizSrc = join(__dirname, '..');

  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const listar = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) listar(ruta, acc);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(ruta);
    }
    return acc;
  };

  /**
   * La comparación que define «stock bajo», en cualquiera de sus formas: SQL
   * crudo con y sin comillas, y QueryBuilder.
   */
  const ES_STOCK_BAJO = /\bstock\s*<=\s*(p\.)?"?stockMinimo"?/i;

  it('toda consulta de stock bajo sobre `productos` excluye los servicios', () => {
    const fuentes = listar(raizSrc);
    // Si esto falla, el test se está mirando a un árbol vacío y no vigila nada.
    expect(fuentes.length).toBeGreaterThan(200);

    const culpables: string[] = [];

    for (const ruta of fuentes) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      const lineas = codigo.split('\n');

      lineas.forEach((linea, i) => {
        if (!ES_STOCK_BAJO.test(linea)) return;

        // Solo interesan las consultas contra `productos`: las tablas de agro
        // (ag_insumos), farmacia (fa_medicamentos) y variantes no tienen
        // servicios, así que ahí el filtro no aplica.
        const bloque = lineas.slice(Math.max(0, i - 14), i + 3).join('\n');
        const esProductos = /\bFROM\s+productos\b/i.test(bloque)
          || /createQueryBuilder\(\s*['"]p['"]\s*\)/.test(bloque)
          || /productoRepository/.test(bloque);
        if (!esProductos) return;

        // Un CASE que solo ETIQUETA («critico» / «bajo») no filtra nada y no
        // hace falta que excluya: lo que importa es el WHERE de su consulta.
        if (/\bWHEN\b/i.test(linea)) return;

        if (!/tipo\s*(<>|!=)\s*['"]servicio['"]|tipo\s*=\s*['"]producto['"]/i.test(bloque)) {
          culpables.push(`${ruta.split('src')[1]}:${i + 1} → ${linea.trim()}`);
        }
      });
    }

    expect(culpables).toEqual([]);
  });
});
