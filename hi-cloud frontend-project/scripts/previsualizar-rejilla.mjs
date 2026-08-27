/**
 * Banco de pruebas de la REJILLA del dashboard.
 *
 * No es una captura de producción: es la geometría de la rejilla, leída de los
 * archivos reales (`registro.ts`, `tipos.ts`, `RejillaDashboard.tsx`,
 * `MontarAlVerse.tsx`) para que no pueda desviarse del código. Responde a dos
 * cosas que no se ven de otra forma sin sesión abierta:
 *
 *   1. Cómo queda el panel a 1 / 2 / 3 columnas y si el orden estricto deja
 *      huecos.
 *   2. CUÁNTAS gráficas entran dentro del alcance del IntersectionObserver
 *      (alto de ventana + rootMargin) al abrir.
 *
 * Sobre el punto 2: el ancho de ventana se SIMULA fijando el ancho del
 * contenedor y el número de columnas con la misma regla que
 * `useColumnasDashboard`. Lo que NO se simula son las posiciones: se miden con
 * getBoundingClientRect sobre el DOM ya maquetado. Sobre esas medidas reales se
 * aplica la regla del observador (`top < alto + rootMargin`) para varias alturas
 * de ventana. Es medición de la maquetación, no una estimación de cuánto ocupa
 * cada tarjeta.
 *
 * Uso: node scripts/previsualizar-rejilla.mjs > rejilla.html
 */
import { readFileSync } from 'node:fs';

const DIR = 'src/pages/dashboard/widgets';
const leer = p => readFileSync(p, 'utf8');

const tipos = leer(`${DIR}/tipos.ts`);
const ALTO = {
  ancha: Number((tipos.match(/ancha:\s*(\d+)/) ?? [])[1]),
  media: Number((tipos.match(/media:\s*(\d+)/) ?? [])[1]),
};

const rejilla = leer(`${DIR}/RejillaDashboard.tsx`);
const CORTES  = [...rejilla.matchAll(/min-width:\s*(\d+)px/g)].map(m => Number(m[1])).sort((a, b) => a - b);
const GAP     = Number((rejilla.match(/gap:\s*(\d+)/) ?? [])[1]);
const MARGEN  = Number((leer(`${DIR}/MontarAlVerse.tsx`).match(/rootMargin:\s*'(\d+)px/) ?? [])[1]);

const tiposCatalogo = leer('../hi-cloud backend-project/backend/src/preferencias/dashboard-widgets.catalogo.ts');
/** Lee WIDGETS_POR_DEFECTO del servidor, respetando su orden. */
function catalogoDefectos(txt) {
  const m = txt.match(/WIDGETS_POR_DEFECTO = \[([\s\S]*?)\] as const;/);
  return [...(m?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]);
}

const registro = leer(`${DIR}/registro.ts`);
const widgets = [];
{
  let slug = null;
  for (const l of registro.split(/\r?\n/)) {
    const m = l.match(/^  '([a-z0-9-]+)': \{/);
    if (m) slug = m[1];
    const t = l.match(/titulo:\s*'([^']+)'/);
    if (t && slug) widgets.push({ slug, titulo: t[1], ancho: null });
    const a = l.match(/ancho:\s*'([a-z]+)'/);
    if (a && widgets.length) widgets[widgets.length - 1].ancho = a[1];
  }
}

const FIJAS = [
  { slug: '_bancos',    titulo: 'Cuentas de Bancos', ancho: 'media', fija: true },
  { slug: '_actividad', titulo: 'Actividad',         ancho: 'media', fija: true },
  { slug: '_facturas',  titulo: 'Facturas & Cobros', ancho: 'media', fija: true },
];
const DEFECTOS = (() => {
  const bloque = catalogoDefectos(tiposCatalogo);
  return bloque;
})();

// En el ORDEN de los defaults, no en el del catalogo: es justo lo que se mide.
const panelDefecto = [...FIJAS, ...DEFECTOS.map(s => widgets.find(w => w.slug === s)).filter(Boolean)];
const panelLleno   = [...FIJAS, ...widgets];

/** Misma regla que useColumnasDashboard. */
const columnasDe = w => (w >= CORTES[1] ? 3 : w >= CORTES[0] ? 2 : 1);

const tile = (w, cols) => `<div class="celda ${w.ancho}${w.fija ? ' fija' : ''}" style="grid-column:span ${w.ancho === 'ancha' ? Math.min(2, cols) : 1}">
  <div class="tarjeta" style="min-height:${ALTO[w.ancho]}px">
    <div class="cab"><span>${w.titulo}</span>${w.fija ? '<em>fija</em>' : '<b>🗑</b>'}</div>
    <div class="cuerpo"><span class="ph">${w.ancho} · ${ALTO[w.ancho]}px</span></div>
    <div class="pie"><span>TOTAL</span><span>RD$ —</span></div>
  </div>
</div>`;

const bloque = (id, anchoSim, escala, titulo, lista) => {
  const cols = columnasDe(anchoSim);
  return `
<h2>${titulo} <small>ventana simulada ${anchoSim}px → ${cols} columna${cols > 1 ? 's' : ''} · ${lista.length} tarjetas</small></h2>
<div class="marco">
  <div class="lienzo" style="width:${anchoSim}px; zoom:${escala}">
    <div class="rejilla" id="${id}" data-escala="${escala}" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
      ${lista.map(w => tile(w, cols)).join('')}
    </div>
  </div>
</div>`;
};

/** Empaqueta los spans en `cols` columnas y cuenta celdas vacias. */
function huecos(lista, cols) {
  let usadas = 0, huecosMedio = 0;
  for (const w of lista) {
    const span = w.ancho === 'ancha' ? Math.min(2, cols) : 1;
    const libre = cols - (usadas % cols);
    if (span > libre) { huecosMedio += libre; usadas += libre; }  // salta de fila
    usadas += span;
  }
  const cola = usadas % cols === 0 ? 0 : cols - (usadas % cols);
  return { medio: huecosMedio, cola, filas: Math.ceil(usadas / cols) };
}

const informe = [
  ['Panel por defecto', panelDefecto, [1, 2, 3]],
  ['Panel lleno',       panelLleno,   [1, 2, 3]],
].flatMap(([nombre, lista, colss]) =>
  colss.map(c => {
    const h = huecos(lista, c);
    return `${nombre} · ${c} col: ${h.medio} hueco(s) en medio, ${h.cola} al final, ${h.filas} filas`;
  }));
console.error(informe.join('\n'));

process.stdout.write(`<!doctype html><meta charset="utf-8">
<title>Rejilla del dashboard</title>
<style>
  :root { --borde:#e5e7eb; --fondo:#f7f8fa; --card:#fff; --texto:#1f2937; --gris:#9ca3af; }
  * { box-sizing:border-box }
  body { margin:0; padding:18px 22px 40px; background:var(--fondo); color:var(--texto);
         font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif }
  h1 { font-size:17px; margin:0 0 4px }
  h2 { font-size:13px; margin:22px 0 8px; font-weight:600 }
  h2 small { color:var(--gris); font-weight:400; margin-left:6px }
  .meta { color:var(--gris); font-size:12px; margin-bottom:6px }
  .marco { overflow:hidden }
  .rejilla { display:grid; gap:${GAP}px; align-items:stretch }
  .celda { display:flex; min-width:0 }
  .tarjeta { flex:1; display:flex; flex-direction:column; background:var(--card);
             border:1px solid var(--borde); border-radius:12px; overflow:hidden }
  .celda.fija .tarjeta { border-style:dashed }
  .cab { display:flex; justify-content:space-between; align-items:center;
         padding:14px 16px; border-bottom:1px solid var(--borde); font-weight:600; font-size:14px }
  .cab em { color:var(--gris); font-style:normal; font-size:11px }
  .cab b { color:var(--gris) }
  .cuerpo { flex:1; display:flex; align-items:center; justify-content:center;
            background:repeating-linear-gradient(45deg,#fafbfc,#fafbfc 8px,#f3f4f6 8px,#f3f4f6 16px) }
  .ph { color:var(--gris); font-size:11px; letter-spacing:.06em; text-transform:uppercase }
  .pie { display:flex; justify-content:space-between; padding:10px 16px;
         border-top:1px solid var(--borde); background:#fafbfc; font-size:11px; color:var(--gris) }
  table { border-collapse:collapse; margin-top:8px; font-size:12px; background:#fff }
  th,td { border:1px solid var(--borde); padding:5px 10px; text-align:left }
  th { background:#fafbfc; font-weight:600 }
  #medicion { margin:14px 0 6px }
  #medicion table { margin:4px 16px 10px 0; display:inline-table; vertical-align:top }
  #medicion h2 { margin:10px 0 2px }
</style>
<h1>Rejilla del dashboard — banco de pruebas</h1>
<div class="meta">
  Geometría leída del código: cortes ${CORTES.join(' / ')}px · gap ${GAP}px ·
  alto mínimo ancha ${ALTO.ancha}px / media ${ALTO.media}px · rootMargin ${MARGEN}px.
  Borde discontinuo = tarjeta fija (no se puede quitar). Sin relleno denso: orden estricto.
</div>
<div id="medicion">midiendo…</div>
${bloque('lleno3', 1920, 0.42, 'Panel lleno a 3 columnas', panelLleno)}
${bloque('def2',   1360, 0.42, 'Panel por defecto a 2 columnas', panelDefecto)}
${bloque('movil',  420,  0.42, 'Móvil, 1 columna — panel por defecto', panelDefecto)}
${bloque('movilLleno', 420, 0.16, 'Móvil, 1 columna — panel lleno (el caso que el montaje diferido existe para cubrir)', panelLleno)}
<script>
  const MARGEN = ${MARGEN};
  // Alturas de ventana habituales, descontando la barra del navegador.
  const ALTURAS = [1080, 900, 800, 660];

  function medir(id) {
    const rej = document.getElementById(id);
    // El bloque se dibuja con zoom para que quepa en la captura, y
    // getBoundingClientRect devuelve las cajas YA escaladas. Se deshace la
    // escala para volver a pixeles reales: sin esto el panel parece 2,4 veces
    // mas corto de lo que es y salen montando todas.
    const esc = Number(rej.dataset.escala) || 1;
    const cero = rej.getBoundingClientRect().top;
    return [...rej.children].map(c => {
      const r = c.getBoundingClientRect();
      return { top: (r.top - cero) / esc, alto: r.height / esc };
    });
  }

  function tabla(id, etiqueta) {
    const celdas = medir(id);
    const filas = ALTURAS.map(h => {
      const dentro = celdas.filter(c => c.top < h + MARGEN).length;
      return '<tr><td>' + h + 'px</td><td>' + (h + MARGEN) + 'px</td>' +
             '<td><b>' + dentro + '</b> de ' + celdas.length + '</td></tr>';
    }).join('');
    const total = celdas.length ? Math.round(celdas.at(-1).top + celdas.at(-1).alto) : 0;
    return '<h2>' + etiqueta + ' <small>alto total del panel: ' + total + 'px</small></h2>' +
      '<table><tr><th>Alto de ventana</th><th>Alcance (+' + MARGEN + ')</th>' +
      '<th>Tarjetas que montan al abrir</th></tr>' + filas + '</table>';
  }

  requestAnimationFrame(() => setTimeout(() => {
    document.getElementById('medicion').innerHTML =
      tabla('lleno3', 'Montaje — panel lleno, 3 columnas (1920px)') +
      tabla('def2',   'Montaje — panel por defecto, 2 columnas (1360px)') +
      tabla('movil',  'Montaje — móvil, 1 columna, panel por defecto (420px)') +
      tabla('movilLleno', 'Montaje — móvil, 1 columna, panel LLENO (420px)');
  }, 400));
</script>
`);
