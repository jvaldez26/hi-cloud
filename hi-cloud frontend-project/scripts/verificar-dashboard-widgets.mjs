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

// ── 5. Guardar no puede arrastrar a las gráficas ───────────────────────────
console.log('\nGuardar no dispara consultas de gráficas');
const hook = leer('src/hooks/useDashboardWidgets.ts');

// Se busca la LLAMADA (`algo.invalidateQueries(`), no la palabra: el propio
// hook la nombra en un comentario para explicar por qué no está.
ok('el hook no invalida nada al guardar',
   !/\w\.invalidateQueries\s*\(/.test(hook),
   'un invalidateQueries aquí volvería a pedir los datos de TODAS las gráficas montadas cada vez que se agrega o quita una');

ok('la caché de la preferencia se toca a mano (setQueryData)',
   /setQueryData/.test(hook),
   'sin esto el cambio no se ve hasta que vuelva la respuesta del servidor');

ok('el guardado es optimista (onMutate) y revierte si falla (onError)',
   /onMutate/.test(hook) && /onError/.test(hook));

// ── 6. Ningún queryKey lleva dentro la lista de widgets ────────────────────
console.log('\nNingún queryKey lleva dentro la lista activa');
const archivosConQuery = [
  'src/hooks/useDashboardWidgets.ts',
  PAGE,
  ...archivosWidget.map(f => join(DIR, f)),
];
for (const f of archivosConQuery) {
  const lineas = leer(f).split(LINEAS).filter(l => /queryKey:/.test(l));
  // Un queryKey que interpole la lista haría que agregar o quitar cualquier
  // gráfica cambiase la clave de las demás — y las volviera a pedir todas.
  const sospechosa = lineas.find(l => /queryKey:.*\b(slugs|widgets|tarjetas|disponibles)\b/.test(l));
  ok(`${f.split('/').pop()} no mete la lista en ningún queryKey`, !sospechosa,
     sospechosa ? `línea: ${sospechosa.trim()}` : '');
}

// ── 7. Móvil: el botón de quitar no depende del hover ──────────────────────
console.log('\nMóvil');
const marco = leer(join(DIR, 'MarcoWidget.tsx'));
ok('el botón de quitar es visible en móvil sin hover',
   /isMobile\s*\|\|\s*hover/.test(marco),
   'en táctil no hay hover: un botón que solo aparece al pasar el ratón no existe');
ok('el área táctil es de 44px',
   /width:\s*44[,\s]/.test(marco) && /height:\s*44[,\s]/.test(marco),
   'por debajo de 44px se falla el toque y se acaba pulsando la gráfica');

// ── 8. Carga por visibilidad ───────────────────────────────────────────────
console.log('\nCarga por visibilidad');
const lazy = leer(join(DIR, 'MontarAlVerse.tsx'));
ok('MontarAlVerse usa IntersectionObserver', /IntersectionObserver/.test(lazy));
ok('reserva altura mientras no está montada', /height:\s*alto/.test(lazy),
   'sin altura reservada el panel pega saltos cuando entra cada gráfica');
ok('el panel envuelve sus gráficas en MontarAlVerse',
   (page.match(/<MontarAlVerse/g) ?? []).length >= 2,
   'diez gráficas apiladas en un móvil dispararían diez peticiones al abrir');

// ── 9. Estado vacío con salida ─────────────────────────────────────────────
console.log('\nEstado vacío');
ok('hay salida cuando no queda ninguna gráfica',
   /slugs\.length === 0/.test(page) && /PanelSinGraficas/.test(page),
   'nadie puede quedarse mirando una pantalla vacía sin saber cómo salir');
const vacio = leer(join(DIR, 'PanelSinGraficas.tsx'));
ok('el estado vacío ofrece reponer las de siempre', /onReponer/.test(vacio));
ok('el estado vacío ofrece agregar una concreta', /botonAgregar/.test(vacio));

console.log(`\n${fallos === 0 ? '✅' : '❌'} ${total - fallos}/${total} comprobaciones`);
process.exit(fallos === 0 ? 0 : 1);
