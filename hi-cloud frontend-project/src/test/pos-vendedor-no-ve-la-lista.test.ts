import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un usuario con rol vendedor NUNCA recibe la lista completa de cajeros en el
 * POS: o su propio perfil, o nada.
 *
 * El caso real, visto en producción: un cajero con rol vendedor y sin perfil
 * vinculado abría el POS y el desplegable «Cajero responsable» le mostraba a sus
 * compañeros —`VEN-002 — Bellamar González`, `VEN-001 — Karla Jiménez`— y podía
 * abrir turno a nombre de cualquiera de ellos.
 *
 * La condición era:
 *
 *     const vendedoresPOS = (esRolVendedor && miVendedor) ? [miVendedor] : vendedores;
 *
 * Con `miVendedor` en null el `&&` falla y cae al `else`, que es la lista
 * ENTERA. Y `miVendedor` es null siempre que `vendedores.usuarioId` esté vacío,
 * que es justo como nacen los vendedores recién creados. Es decir: la
 * restricción se desactivaba sola precisamente en el caso en que hacía falta.
 *
 * Se lee del código porque el fallo no está en ninguna petición ni en ningún
 * cálculo —`GET /vendedores` devuelve la empresa entera a cualquier rol, y eso
 * es lo que hace hoy— sino en la forma de una expresión.
 *
 * Ojo: esto NO sustituye a la validación del backend. `POST /caja/abrir` sigue
 * aceptando cualquier `vendedorId` de la empresa sin comprobar que sea el del
 * usuario, así que esta prueba cubre la pantalla, no la puerta. Está anotado en
 * `docs/estado-actual.md`.
 */

const POS = join(__dirname, '..', 'pages', 'pos', 'POSPage.tsx');

describe('POS — el vendedor no ve la lista de cajeros', () => {
  // Sin comentarios: el propio comentario que explica el arreglo cita la forma
  // vieja, y sin quitarlos la prueba se dispara contra la documentación en vez
  // de contra el código.
  const codigo = readFileSync(POS, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('encuentra la asignación que decide qué cajeros se ven', () => {
    // Si el nombre cambia, esta prueba deja de vigilar nada y hay que
    // enterarse aquí, no en producción.
    expect(codigo).toMatch(/const\s+vendedoresPOS\s*:/);
  });

  it('no vuelve a la forma que se desactivaba sola', () => {
    // `esRolVendedor && miVendedor` es exactamente el `&&` que fallaba en null.
    expect(codigo).not.toMatch(/esRolVendedor\s*&&\s*miVendedor/);
  });

  it('el rol decide la rama, no la existencia del perfil', () => {
    const asignacion = codigo.match(/const\s+vendedoresPOS\s*:[^=]*=\s*([\s\S]{0,200}?);/);
    expect(asignacion).not.toBeNull();
    const expr = asignacion![1].replace(/\s+/g, ' ');
    // La lista completa solo puede estar en la rama de «no es vendedor».
    expect(expr).toMatch(/esRolVendedor\s*\?/);
    expect(expr).toMatch(/:\s*vendedores\s*$/);
  });
});
