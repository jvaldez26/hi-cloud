import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * En una tabla con `tableLayout="fixed"`, TODAS las columnas declaran su ancho.
 *
 * El caso real: en la Orden de Compra, «Producto» era la única columna sin
 * `width`. Con `tableLayout="fixed"` las que tienen ancho se reparten primero y
 * la que no lo declara se queda con lo que sobre. Mientras sobró espacio, se vio
 * bien. El día que se añadió la columna «Desc.» (126 px) dejó de sobrar dentro
 * del modal de 960 px del POS y el buscador **se colapsó a cero**: el cajero
 * escribía y no aparecía nada, ni los productos ni el enlace de creación
 * rápida, porque el `<Select>` no tenía dónde dibujarse.
 *
 * Lo que lo hace digno de vigilancia es la forma en que rompe: el commit que
 * añade una columna nueva no toca ni una línea del buscador, la pantalla sigue
 * compilando, y el fallo aparece en otro sitio, en otra pantalla y días
 * después. Nadie lo relaciona.
 *
 * El formulario de Factura, que declara el ancho de sus ocho columnas, no se ha
 * roto nunca por esto.
 */

const RAIZ = join(__dirname, '..', 'pages');

const listar = (dir: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
};

interface Hallazgo { archivo: string; linea: number; columna: string }

const hallazgos: Hallazgo[] = [];
let revisadas = 0;
let archivosFixed = 0;

for (const ruta of listar(RAIZ)) {
  const texto = readFileSync(ruta, 'utf8');
  if (!/tableLayout=["']fixed["']/.test(texto)) continue;

  archivosFixed++;
  const rel = ruta.slice(ruta.indexOf('pages')).replace(/\\/g, '/');

  // Cada columna se declara `{ title: '…', key: '…', width: N, … render: … }`.
  // Se mira desde el `title:` hasta el `render:` que lo cierra, que es donde
  // viven las props de la columna.
  for (const m of texto.matchAll(/\{\s*title:\s*(['"])([^'"]*)\1/g)) {
    const desde  = m.index!;
    const render = texto.indexOf('render:', desde);
    const hasta  = render === -1 ? desde + 220 : Math.min(render, desde + 400);
    const props  = texto.slice(desde, hasta);

    revisadas++;
    if (!/\bwidth:/.test(props)) {
      hallazgos.push({
        archivo: rel,
        linea:   texto.slice(0, desde).split('\n').length,
        columna: m[2] || '(sin título)',
      });
    }
  }
}

describe('Tablas con tableLayout="fixed" — toda columna declara su ancho', () => {
  it('encuentra las tablas y sus columnas', () => {
    // Si esto baja a cero, el escaneo dejó de mirar donde debía y la
    // comprobación siguiente pasaría en verde sin verificar nada.
    expect(archivosFixed).toBeGreaterThanOrEqual(2);
    expect(revisadas).toBeGreaterThan(10);
  });

  it('ninguna columna se queda sin ancho', () => {
    const informe = hallazgos
      .map(h => `${h.archivo}:${h.linea} → la columna «${h.columna}» no declara width: con tableLayout fixed se queda con lo que sobre, y el día que no sobre se colapsa a cero`)
      .join('\n');
    expect(informe).toBe('');
  });
});
