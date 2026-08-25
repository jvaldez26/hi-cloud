/**
 * Comprobador de maquetación móvil — se pega en la consola del navegador.
 *
 * El scroll horizontal del body es el síntoma que delata casi todo lo demás:
 * una tabla que no cabe, un modal más ancho que la pantalla, una rejilla que no
 * se apila. Pero decir "hay scroll" no sirve de nada si no dice QUIÉN lo causa,
 * así que esto señala el elemento concreto.
 *
 *   1. Abre la pantalla en el ancho que quieras comprobar.
 *   2. Pega esto en la consola.
 *   3. Lo que salga en rojo es lo que hay que arreglar.
 *
 * Devuelve un objeto con los hallazgos, así que también sirve desde un script.
 *
 * Acepta una ventana distinta de la actual —`verificarMovil(iframe.contentWindow)`—
 * para poder medir varios anchos sin redimensionar el navegador: Chrome en
 * Windows no baja de ~500px, así que a 375px solo se llega con un iframe.
 */
globalThis.verificarMovil = (win = window) => {
  const document = win.document;
  const getComputedStyle = win.getComputedStyle.bind(win);
  const VP = document.documentElement.clientWidth;
  const MIN_PULSABLE = 44;   // altura mínima cómoda para un dedo
  const MIN_FUENTE   = 16;   // por debajo, iOS hace zoom al enfocar un campo

  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const describir = el => {
    const id  = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    const txt = (el.textContent ?? '').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}…"` : ''}`;
  };

  // ── 1. ¿Desborda el body? ─────────────────────────────────────────────────
  const de = document.documentElement;
  const desborde = Math.max(de.scrollWidth, document.body.scrollWidth) - VP;

  // ── 2. Quién se sale del ancho ────────────────────────────────────────────
  // Solo interesan los que NO están dentro de un contenedor con scroll propio:
  // una tabla ancha dentro de un div con overflow-x:auto es correcta.
  const enScrollPropio = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
    }
    return false;
  };

  const culpables = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= VP + 1 && r.left >= -1) continue;
    if (enScrollPropio(el)) continue;
    culpables.push({ el, desde: Math.round(r.left), hasta: Math.round(r.right), ancho: Math.round(r.width) });
  }
  // Quedarse con los de fuera: si el padre ya se sale, el hijo sobra en el informe.
  const raices = culpables.filter(c => !culpables.some(o => o !== c && o.el.contains(c.el)));

  // ── 3. Cosas pulsables demasiado pequeñas ─────────────────────────────────
  const pequenos = [];
  for (const el of document.querySelectorAll('button, a, [role="button"], .ant-btn, input[type="checkbox"]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < MIN_PULSABLE) pequenos.push({ el, alto: Math.round(r.height) });
  }

  // ── 4. Campos que provocan zoom en iOS ────────────────────────────────────
  const zoom = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < MIN_FUENTE) zoom.push({ el, px });
  }

  // ── Informe ───────────────────────────────────────────────────────────────
  const vOk = 'color:#16a34a;font-weight:700', vMal = 'color:#dc2626;font-weight:700';

  console.log(`%c── Maquetación móvil · ancho ${VP}px ──`, 'font-weight:700;font-size:13px');

  if (desborde > 0) {
    console.log(`%c✗ El body se sale ${desborde}px`, vMal);
    if (raices.length) {
      console.log('  Culpables (los de fuera, no sus hijos):');
      for (const c of raices.slice(0, 10)) {
        console.log(`    ${describir(c.el)}  →  ocupa ${c.desde}..${c.hasta}px (ancho ${c.ancho})`, c.el);
      }
      if (raices.length > 10) console.log(`    …y ${raices.length - 10} más`);
    } else {
      console.log('  Ningún elemento suelto se sale: probablemente sea un margen o un padding negativo.');
    }
  } else {
    console.log('%c✔ Sin scroll horizontal en el body', vOk);
  }

  if (pequenos.length) {
    console.log(`%c✗ ${pequenos.length} elemento(s) pulsables por debajo de ${MIN_PULSABLE}px de alto`, vMal);
    for (const p of pequenos.slice(0, 8)) console.log(`    ${describir(p.el)} — ${p.alto}px`, p.el);
    if (pequenos.length > 8) console.log(`    …y ${pequenos.length - 8} más`);
  } else {
    console.log(`%c✔ Todo lo pulsable llega a ${MIN_PULSABLE}px`, vOk);
  }

  if (zoom.length) {
    console.log(`%c✗ ${zoom.length} campo(s) con fuente < ${MIN_FUENTE}px — iOS hará zoom al enfocarlos`, vMal);
    for (const z of zoom.slice(0, 8)) console.log(`    ${describir(z.el)} — ${z.px}px`, z.el);
    if (zoom.length > 8) console.log(`    …y ${zoom.length - 8} más`);
  } else {
    console.log(`%c✔ Ningún campo provoca zoom en iOS`, vOk);
  }

  return {
    ancho: VP,
    desbordeBodyPx: Math.max(0, desborde),
    culpables: raices.map(c => ({ el: describir(c.el), hasta: c.hasta })),
    pulsablesPequenos: pequenos.length,
    camposConZoom: zoom.length,
    limpio: desborde <= 0 && pequenos.length === 0 && zoom.length === 0,
  };
};

// Pegado en la consola, se ejecuta solo sobre la pantalla que estés viendo.
globalThis.verificarMovil();
