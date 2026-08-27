/**
 * Verifica las reglas del dashboard configurable.
 *
 * Se ejecuta con `npm run verificar:widgets`. El frontend no tiene runner de
 * tests, así que esto lee los archivos reales —los dos lados, front y back— y
 * comprueba lo que no puede romperse en silencio:
 *
 *   1. Los slugs del registro del front existen en el catálogo del back. Un slug
 *      que solo existe de un lado es un panel roto o un 400 al guardar.
 *   2. Cada widget trae SU consulta dentro. Es lo que hace que quitar una gráfica
 *      no dispare las de las demás: si no está montada, no hay petición.
 *   3. DashboardPage NO conserva consultas de gráficas. Una consulta padre las
 *      volvería a agrupar y traería de vuelta el problema que esto arregla.
 *   4. Las cuatro por defecto están implementadas de verdad.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BACK = '../hi-cloud backend-project/backend/src/preferencias/dashboard-widgets.catalogo.ts';
const REG  = 'src/pages/dashboard/widgets/registro.ts';
const PAGE = 'src/pages/dashboard/DashboardPage.tsx';
const DIR  = 'src/pages/dashboard/widgets';

let fallos = 0, total = 0;
const ok = (nombre, bien, detalle = '') => {
  total++;
  if (bien) { console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? '\n      ' + detalle : ''}`); }
};

const leer = (p) => readFileSync(p, 'utf8');
const LINEAS = /\r?\n/;

// ── 1. Los slugs cuadran entre front y back ────────────────────────────────
const catalogo   = leer(BACK);
const slugsBack  = [...catalogo.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map(m => m[1]);
const registro   = leer(REG);
const slugsFront = [...registro.matchAll(/^\s{2}'([a-z0-9-]+)':/gm)].map(m => m[1]);

console.log('\nSlugs');
ok('el catálogo del backend no está vacío', slugsBack.length > 0, `leídos: ${slugsBack.length}`);
ok('el registro del frontend no está vacío', slugsFront.length > 0, `leídos: ${slugsFront.length}`);

const huerfanos = slugsFront.filter(s => !slugsBack.includes(s));
ok('ningún slug del frontend falta en el catálogo del backend',
   huerfanos.length === 0,
   huerfanos.length ? `sobran en el front: ${huerfanos.join(', ')}` : '');

// El caso contrario SÍ es válido: el back puede conocer gráficas que el front
// todavía no pinta (van llegando por fases). Solo se informa.
const pendientes = slugsBack.filter(s => !slugsFront.includes(s));
console.log(`  · ${pendientes.length} gráfica(s) en el catálogo aún sin implementar: ${pendientes.join(', ') || '—'}`);

// ── 2. Cada widget trae su consulta ────────────────────────────────────────
console.log('\nCada gráfica pide lo suyo');
const archivosWidget = readdirSync(DIR).filter(f => f.startsWith('Widget') && f.endsWith('.tsx'));
ok('hay archivos de widget', archivosWidget.length > 0, `encontrados: ${archivosWidget.length}`);

for (const f of archivosWidget) {
  const txt = leer(join(DIR, f));
  ok(`${f} tiene su propia useQuery`, /useQuery\s*[<(]/.test(txt),
     'sin consulta propia, sus datos tendrían que venir del padre — que es justo lo que se quitó');
}

// ── 3. La página no reconstruye una consulta padre ─────────────────────────
console.log('\nLa página no agrupa las consultas de las gráficas');
const page = leer(PAGE);
const PROHIBIDAS = [
  'antiguedad-cobrar',
  'antiguedad-pagar',
  'resumen-gastos-dash',
  'ingresos-gastos-anual',
  'anios-con-datos',
];

// Se permite INVALIDAR (lo hace el refresco del logo del sidebar); lo que no se
// permite es volver a CONSULTAR desde la página. Las dos cosas escriben
// `queryKey:` en la misma línea, así que hay que separarlas antes de mirar.
const lineasConsulta = page.split(LINEAS)
  .filter(l => /queryKey:/.test(l))
  .filter(l => !/invalidateQueries|refetchQueries|removeQueries/.test(l));

for (const clave of PROHIBIDAS) {
  const consulta = lineasConsulta.some(l => l.includes(`'${clave}'`));
  ok(`DashboardPage no consulta '${clave}'`, !consulta,
     'esa consulta debe vivir dentro de su widget');
}

// ── 4. Los defaults están implementados ────────────────────────────────────
console.log('\nDefaults');
const defaults = [...catalogo.matchAll(/^\s{2}'([a-z0-9-]+)',$/gm)].map(m => m[1]);
ok('el backend declara defaults', defaults.length > 0, `leídos: ${defaults.join(', ')}`);
for (const d of defaults) {
  ok(`'${d}' está implementado en el frontend`, slugsFront.includes(d),
     'un default que el front no sabe pintar deja el panel vacío al entrar por primera vez');
}

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${total - fallos}/${total} comprobaciones`);
process.exit(fallos === 0 ? 0 : 1);
