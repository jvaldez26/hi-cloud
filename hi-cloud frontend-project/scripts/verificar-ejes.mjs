/**
 * Verifica src/pages/dashboard/widgets/formatoEje.ts
 *
 * El bug: ejeMonto dividía SIEMPRE entre mil, así que fallaba en los dos
 * extremos de la cartera de clientes — y los dos existen:
 *
 *   RD$500       → «1K»     redondeaba hacia arriba. El colmado que factura
 *                           quinientos pesos en un mes veía mil en el eje.
 *   RD$1,200,000 → «1200K»  nadie escribe eso.
 *
 * El frontend no tiene runner de tests: esto transpila el módulo REAL con
 * esbuild y lo ejecuta, igual que verificar-desenvolver.mjs.
 *
 * `npm run verificar:ejes`
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir  = mkdtempSync(join(tmpdir(), 'ejes-'));
const dest = join(dir, 'mod.mjs');
const { outputFiles } = await build({
  entryPoints: ['src/pages/dashboard/widgets/formatoEje.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
writeFileSync(dest, outputFiles[0].text);
const { ejeMonto } = await import(pathToFileURL(dest).href);

let fallos = 0, total = 0;
const ok = (n, cond) => {
  total++;
  if (cond) console.log(`  ✓ ${n}`);
  else { fallos++; console.log(`  ✗ ${n}`); }
};
const es = (entrada, esperado) =>
  ok(`${entrada} → ${esperado}`, ejeMonto(entrada) === esperado);

console.log('\nLOS DOS CASOS DEL BUG\n');
// El colmado: quinientos pesos no son mil.
es(500, '500');
es(999, '999');
// El mayorista: 1.2 millones no son 1200 mil.
es(1_200_000, '1.2M');
es(15_000_000, '15M');

console.log('\nPor debajo de mil se enseña el número tal cual\n');
es(0, '0');
es(1, '1');
es(250, '250');
// Redondea al entero: un eje con decimales sueltos no se lee.
es(499.6, '500');

console.log('\nMiles\n');
es(1_000, '1K');
es(1_500, '1.5K');
es(9_900, '9.9K');
// A partir de 10K el decimal sobra y solo mete ruido.
es(10_000, '10K');
es(145_000, '145K');
es(999_400, '999K');

console.log('\nMillones\n');
es(1_000_000, '1M');
es(2_500_000, '2.5M');
// Sin decimal muerto: 2.0M se escribe 2M.
es(2_000_000, '2M');

console.log('\nNegativos: hay gráficas de saldo que bajan de cero\n');
es(-500, '-500');
es(-1_500, '-1.5K');
es(-2_000_000, '-2M');

console.log('\nEntradas rotas no revientan el eje\n');
ok('NaN → 0',       ejeMonto(NaN) === '0');
ok('Infinity → 0',  ejeMonto(Infinity) === '0');

console.log(`\n${total - fallos}/${total} correctas`);
if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
