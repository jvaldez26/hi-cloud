/**
 * Todo id que se manda a imprimir existe de verdad en el JSX de su archivo.
 *
 * El bug: en Recibos de Cobro, el botón «Imprimir» llamaba a
 * `imprimirElemento(RECIBO_PRINT_ID, …)` con RECIBO_PRINT_ID =
 * 'hc-recibo-cobro-print', pero el div oculto se registraba como
 * `id={`${RECIBO_PRINT_ID}-wrapper`}`. getElementById devolvía null,
 * imprimirElemento avisaba con un console.warn y volvía sin hacer nada.
 *
 * Es de las que no se ven: no hay excepción, no hay pantalla roja, no hay
 * petición fallida en la pestaña de red. El cajero pulsa, no sale papel, lo
 * pulsa otra vez, y acaba llamando por teléfono. Estuvo así hasta que un
 * cliente lo reportó.
 *
 * Aquí se comprueba lo único que hace falta para que no vuelva: que la cadena
 * que se le pasa a imprimirElemento aparezca como `id=` en el mismo archivo,
 * SIN nada pegado detrás. El sufijo era justo el fallo.
 *
 * `npm run verificar:ids-impresion`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

const listar = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) listar(ruta, acc);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) acc.push(ruta);
  }
  return acc;
};

const culpables = [];
let revisadas = 0;

for (const ruta of listar(RAIZ)) {
  if (ruta.includes('printUtils')) continue;   // ahí vive la función, no se la llama
  const texto = readFileSync(ruta, 'utf8');

  for (const m of texto.matchAll(/imprimirElemento\(\s*([A-Za-z0-9_]+|'[^']+'|"[^"]+")/g)) {
    revisadas++;
    const arg = m[1];
    const linea = texto.slice(0, m.index).split('\n').length;

    // El id puede llegar como literal o por una constante del propio archivo.
    let valor = null;
    if (/^['"]/.test(arg)) {
      valor = arg.slice(1, -1);
    } else {
      const def = texto.match(new RegExp(`\\b${arg}\\s*=\\s*['"]([^'"]+)['"]`));
      if (!def) {
        culpables.push(`${ruta}:${linea} → ${arg} no se define en este archivo`);
        continue;
      }
      valor = def[1];
    }

    // `id={X}`, `id="hc-…"` o `id={\`${X}\`}` — pero nada detrás del cierre:
    // un `${X}-wrapper` es otro id, y es exactamente el que rompió esto.
    // Las dos formas válidas y NADA más: id={CONST} o id={`${CONST}`}. El cierre
    // es obligatorio a propósito — dejarlo opcional deja pasar
    // id={`${CONST}-wrapper`}, que es el id equivocado con el que empezó todo.
    const literal  = new RegExp(`id=\\s*["'\`]${valor}["'\`]`);
    const porConst = /^['"]/.test(arg)
      ? null
      : new RegExp(`id=\\s*\\{\\s*(?:${arg}|\`\\$\\{${arg}\\}\`)\\s*\\}`);

    if (!literal.test(texto) && !(porConst && porConst.test(texto))) {
      culpables.push(`${ruta}:${linea} → imprime «${valor}», que no existe como id en el archivo`);
    }
  }
}

console.log('\nIds pasados a imprimirElemento que existen en el JSX\n');
if (culpables.length === 0) {
  console.log(`  ✓ ${revisadas} llamada(s), todas apuntan a un id real`);
  console.log('\n1/1 correctas');
} else {
  culpables.forEach(c => console.log(`  ✗ ${c}`));
  console.error(
    `\n${culpables.length} boton(es) de impresion no harian nada al pulsarlos.` +
    `\nimprimirElemento solo hace console.warn si el id no existe: el fallo es mudo.`,
  );
  process.exit(1);
}
