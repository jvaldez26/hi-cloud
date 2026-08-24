/**
 * Las entradas del menú de Super Admin no son rutas: son claves de pestaña que
 * se comparan con `tab === '...'`. Si una clave del menú no coincide con ningún
 * handler, el botón funciona, el menú se pinta, y el usuario ve un panel VACÍO.
 * No falla el build ni el tipado — por eso hace falta comprobarlo aquí.
 *
 *   node scripts/verificar-menu-super-admin.mjs
 */
import { readFileSync } from 'node:fs';

const F = 'src/pages/super-admin/SuperAdminPage.tsx';
const src = readFileSync(F, 'utf8');

// ── Claves declaradas en el menú ────────────────────────────────────────────
const ini = src.indexOf('const gruposMenu: MenuCategory[]');
if (ini < 0) { console.error('✗ No se encontró gruposMenu'); process.exit(1); }
const bloque = src.slice(ini, src.indexOf('\n  ];', ini));

const claves = [...bloque.matchAll(/\bpath:\s*'([^']+)'/g)].map(m => m[1]);
const grupos = [...bloque.matchAll(/\bid:\s*'([^']+)',\s*label:\s*'([^']+)'/g)];

// ── Claves atendidas por el contenido ───────────────────────────────────────
const atendidas = new Set([...src.matchAll(/\btab === '([^']+)'/g)].map(m => m[1]));

let fallos = 0;
const err = m => { console.error('  ✗ ' + m); fallos++; };

console.log(`Grupos: ${grupos.length} — ${grupos.map(g => g[2]).join(' · ')}`);
console.log(`Entradas: ${claves.length}\n`);

// 1. Toda clave del menú debe tener contenido.
for (const k of claves) {
  if (!atendidas.has(k)) err(`la entrada '${k}' no tiene ningún "tab === '${k}'" — abriría un panel vacío`);
}

// 2. Todo contenido debe ser alcanzable desde el menú.
for (const k of atendidas) {
  if (!claves.includes(k)) err(`el panel '${k}' existe pero no se enlaza desde el menú — inalcanzable`);
}

// 3. Sin claves repetidas.
const vistas = new Set();
for (const k of claves) {
  if (vistas.has(k)) err(`la clave '${k}' está repetida`);
  vistas.add(k);
}

// 4. Las dos últimas pantallas añadidas siguen enlazadas.
for (const k of ['backups', 'activacion-ecf']) {
  if (!claves.includes(k)) err(`'${k}' desapareció del menú`);
}

// 5. La pestaña inicial debe existir.
const inicial = src.match(/useState\('([^']+)'\);\s*\r?\n\s*\r?\n\s*\/\/ ── Menú lateral/);
if (inicial && !claves.includes(inicial[1])) {
  err(`la pestaña inicial '${inicial[1]}' no está en el menú`);
}

// 6. El grupo abierto por defecto debe ser uno de los grupos reales.
const abierto = src.match(/useState<string \| null>\('([^']+)'\)/);
if (abierto && !grupos.some(g => g[1] === abierto[1])) {
  err(`el grupo abierto por defecto '${abierto[1]}' no existe (grupos: ${grupos.map(g => g[1]).join(', ')})`);
}

console.log(fallos === 0
  ? `✅ ${claves.length} entradas, todas con contenido y todas alcanzables`
  : `\n❌ ${fallos} problema(s)`);
process.exit(fallos ? 1 : 0);
