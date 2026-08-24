/**
 * Verifica src/api/desenvolver.ts.
 *
 * El bug: VideosTutorialesAdminPage hacía `return res.data`, recibía el
 * envoltorio { success, data } entero, y el .map() de la tabla reventaba con
 * "T.map is not a function" justo después de un 200.
 *
 * Lo importante no es solo desenvolver: es que quien pide una LISTA reciba
 * siempre un array. Un helper que solo desenvuelva deja al siguiente consumidor
 * expuesto igual.
 *
 * `npm run verificar:desenvolver`
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir  = mkdtempSync(join(tmpdir(), 'desenv-'));
const dest = join(dir, 'mod.mjs');
const { outputFiles } = await build({
  entryPoints: ['src/api/desenvolver.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
writeFileSync(dest, outputFiles[0].text);
const M = await import(pathToFileURL(dest).href);

let fallos = 0, total = 0;
const ok = (n, cond) => {
  total++;
  if (cond) console.log(`  ✓ ${n}`);
  else { fallos++; console.log(`  ✗ ${n}`); }
};

/** Simula lo que devuelve axios. */
const resp = (cuerpo) => ({ data: cuerpo });
/** El envoltorio que pone el interceptor global del backend. */
const sobre = (carga) => resp({ success: true, data: carga, timestamp: 'x' });

console.log('\ndesenvolver() — quita el sobre, nada más\n');
ok('saca la carga del envoltorio',        JSON.stringify(M.desenvolver(sobre([1, 2]))) === '[1,2]');
ok('un objeto sale igual de entero',      M.desenvolver(sobre({ a: 1 })).a === 1);
ok('sin envoltorio (@Res) no toca nada',  JSON.stringify(M.desenvolver(resp([9]))) === '[9]');
ok('null no revienta',                    M.desenvolver(resp(null)) === null);
ok('un string crudo pasa tal cual',       M.desenvolver(resp('hola')) === 'hola');
// La comprobación es de forma EXACTA: si solo mirara `data`, un paginado sin
// envoltorio se desenvolvería de más y perdería su `meta`.
ok('un paginado SIN envoltorio no se desenvuelve de más',
   M.desenvolver(resp({ data: [1], meta: { total: 1 } })).meta.total === 1);

console.log('\ndesenvolverArray() — si pides lista, recibes lista\n');
ok('array dentro del sobre',              M.desenvolverArray(sobre([1, 2, 3])).length === 3);
ok('array sin sobre',                     M.desenvolverArray(resp([1])).length === 1);
ok('paginado { data, meta } → las filas', M.desenvolverArray(sobre({ data: [1, 2], meta: {} })).length === 2);
ok('paginado { data, total } → las filas',M.desenvolverArray(sobre({ data: [1], total: 1 })).length === 1);
ok('paginado { items, total } → las filas',M.desenvolverArray(sobre({ items: [1, 2, 3], total: 3 })).length === 3);

console.log('\nEL CASO DEL BUG: nunca algo que no sea array\n');
for (const [nombre, entrada] of [
  ['el envoltorio entero mal desenvuelto', resp({ success: true, data: [1] })], // ← sí es array
  ['un objeto suelto',                     sobre({ a: 1 })],
  ['null',                                 sobre(null)],
  ['undefined',                            sobre(undefined)],
  ['un número',                            sobre(42)],
  ['un string',                            sobre('texto')],
  ['respuesta vacía',                      resp(undefined)],
]) {
  ok(`${nombre} → sigue siendo array`, Array.isArray(M.desenvolverArray(entrada)));
}
ok('un objeto suelto da lista VACÍA, no el objeto', M.desenvolverArray(sobre({ a: 1 })).length === 0);
ok('nunca devuelve undefined',                      M.desenvolverArray(resp(undefined)) !== undefined);

try { unlinkSync(dest); } catch { /* da igual */ }
console.log(`\n${total - fallos}/${total} comprobaciones OK`);
process.exit(fallos ? 1 : 0);
