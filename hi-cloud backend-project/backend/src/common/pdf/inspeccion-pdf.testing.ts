/* ──────────────────────────────────────────────────────────────────────────────
   Utilidades de PRUEBA para mirar lo que un PDF dibuja de verdad.

   Sirven para comprobar que un importe cae entero en una sola línea. No valen
   assertions sobre el cálculo de anchos: eso comprueba la aritmética del test,
   no el render. Aquí se descomprime el content stream, se extraen los
   fragmentos de texto con su posición y se agrupan por línea base.

   La firma de que un importe se partió es un fragmento con solo el símbolo de
   moneda ("RD$ ") en su propia línea, porque PDFKit envuelve por ese espacio.
   ──────────────────────────────────────────────────────────────────────────── */

import * as zlib from 'zlib';

export interface FragmentoPDF {
  x: number;
  y: number;
  texto: string;
}

/** Todos los fragmentos de texto dibujados, con su posición en la página. */
export function fragmentos(pdf: Buffer): FragmentoPDF[] {
  const streams: string[] = [];
  let i = 0;
  while ((i = pdf.indexOf('stream', i)) > -1) {
    let s = i + 'stream'.length;
    if (pdf[s] === 0x0d) s++;
    if (pdf[s] === 0x0a) s++;
    const e = pdf.indexOf('endstream', s);
    if (e < 0) break;
    try {
      streams.push(zlib.inflateSync(pdf.subarray(s, e)).toString('latin1'));
    } catch {
      /* stream no inflable (imagen, fuente) — no interesa */
    }
    i = e;
  }

  const out: FragmentoPDF[] = [];
  const bloque = /BT\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+\/\S+ [\d.]+ Tf\s+\[([\s\S]*?)\]\s*TJ/g;
  for (const stream of streams) {
    let m: RegExpExecArray | null;
    while ((m = bloque.exec(stream)) !== null) {
      const texto = (m[3].match(/<([0-9a-fA-F]*)>/g) ?? [])
        .map(h => h.slice(1, -1))
        .join('')
        .replace(/../g, (par: string) => String.fromCharCode(parseInt(par, 16)));
      if (texto.trim()) out.push({ x: +m[1], y: +m[2], texto });
    }
  }
  return out;
}

/** Los fragmentos agrupados por línea base, en orden de izquierda a derecha. */
export function lineas(pdf: Buffer): string[] {
  const grupos = new Map<string, FragmentoPDF[]>();
  for (const f of fragmentos(pdf)) {
    const clave = f.y.toFixed(1);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(f);
  }
  return [...grupos.values()].map(g =>
    g.sort((a, b) => a.x - b.x).map(f => f.texto).join(''),
  );
}

/**
 * Fragmentos que contienen SOLO el símbolo de moneda: la firma exacta de un
 * importe partido en dos líneas. Debe salir vacío siempre.
 */
export function simbolosSueltos(pdf: Buffer): FragmentoPDF[] {
  return fragmentos(pdf).filter(f => /^(RD\$|US\$|€)\s*$/.test(f.texto));
}

/** Formatea un importe igual que los generadores de PDF. */
export function importe(n: number, simbolo = 'RD$'): string {
  return `${simbolo} ` + n.toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** Comprueba que cada importe aparece entero dentro de una misma línea base. */
export function esperarImportesEnteros(pdf: Buffer, importes: string[]): void {
  const ls = lineas(pdf);
  const partidos = importes.filter(v => !ls.some(l => l.includes(v)));
  if (partidos.length > 0) {
    throw new Error(
      `Importes que no caen enteros en una línea: ${partidos.join(', ')}`,
    );
  }
}
