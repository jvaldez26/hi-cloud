/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Anchos y celdas de tablas de importes en PDFKit

   Existe por un bug que apareció igual en factura, documento y nota: la columna
   de ITBIS medía un 10% del ancho útil (51pt, o sea 43pt de texto) y
   "RD$ 180.00" ocupa 45.36pt a Helvetica 8.5. El importe salía partido en dos
   líneas y en papel se lee como un dato roto.

   ── Lo contraintuitivo ──────────────────────────────────────────────────────
   Pasar `lineBreak: false` NO evita que PDFKit envuelva. En pdfkit 0.18 esa
   opción solo sirve para saltarse el cálculo del `width` por defecto; en cuanto
   se le pasa un `width` explícito —que es justo lo que hace falta para alinear
   a la derecha— el LineWrapper entra igual y parte por el espacio de "RD$ ".
   `ellipsis: true` tampoco protege por sí solo: solo se dispara al topar el
   límite de ALTURA, nunca el de ancho.

   La única combinación que resuelve una celda en una sola línea es
   `height: <alto de una línea>` junto con `ellipsis: true`. Eso es lo que
   encapsula `celdaSinEnvolver()`; no lo escribas a mano.
   ──────────────────────────────────────────────────────────────────────────── */

export interface ColumnaTabla {
  label: string;
  align: 'left' | 'right' | 'center';
  /** Ancho mínimo en pt: el aspecto de siempre cuando los importes son cortos. */
  minW: number;
  /** La única columna que puede envolver — absorbe el ancho que sobra. */
  envuelve?: boolean;
  /** Se mide con Helvetica-Bold (la columna de Total suele ir en negrita). */
  bold?: boolean;
}

export interface OpcionesReparto {
  /** Ancho útil de la tabla. */
  W: number;
  /** Padding horizontal total de la celda (lo que se resta al dibujar). */
  pad: number;
  /** Suelo de la columna que envuelve, para que no quede ilegible. */
  descMin: number;
  fuenteCelda: string;
  tamanoCelda: number;
  fuenteCabecera: string;
  tamanoCabecera: number;
}

/**
 * Reparte el ancho de la tabla midiendo el contenido real.
 *
 * Los `minW` son el mínimo, no el ancho final: cada columna se estira hasta
 * caber el texto más largo que va a aparecer de verdad en ese documento
 * —cabecera incluida— y la columna marcada `envuelve` cede el resto. Si ni así
 * llega a `descMin`, las demás se recortan a prorrata; entonces se elipsan,
 * pero nunca envuelven.
 *
 * @param filas Todas las celdas ya formateadas, en el mismo orden que `cols`.
 * @returns Los anchos en pt, alineados con `cols`.
 */
export function repartirAnchos(
  doc: PDFKit.PDFDocument,
  cols: ColumnaTabla[],
  filas: string[][],
  o: OpcionesReparto,
): number[] {
  const iEnvuelve = cols.findIndex(c => c.envuelve);
  if (iEnvuelve < 0) throw new Error('repartirAnchos: falta la columna que envuelve');

  const necesario = (i: number): number => {
    doc.font(o.fuenteCabecera).fontSize(o.tamanoCabecera);
    let max = doc.widthOfString(cols[i].label.toUpperCase());
    doc.font(cols[i].bold ? 'Helvetica-Bold' : o.fuenteCelda).fontSize(o.tamanoCelda);
    for (const celdas of filas) max = Math.max(max, doc.widthOfString(celdas[i] ?? ''));
    return Math.ceil(max) + o.pad;
  };

  const anchos = cols.map((c, i) =>
    i === iEnvuelve ? 0 : Math.max(c.minW, necesario(i)),
  );

  const suma = () => anchos.reduce((s, w, i) => (i === iEnvuelve ? s : s + w), 0);

  if (o.W - suma() < o.descMin) {
    const factor = (o.W - o.descMin) / suma();
    for (let i = 0; i < anchos.length; i++) {
      if (i !== iEnvuelve) anchos[i] = Math.floor(anchos[i] * factor);
    }
  }
  anchos[iEnvuelve] = o.W - suma();
  return anchos;
}

/** Alto de una línea para esa fuente y tamaño. */
export function altoDeLinea(
  doc: PDFKit.PDFDocument,
  fuente: string,
  tamano: number,
): number {
  doc.font(fuente).fontSize(tamano);
  return doc.currentLineHeight(true);
}

/**
 * Opciones para una celda que NUNCA debe envolver: si el texto no cabe se
 * recorta con puntos suspensivos, pero se queda en una sola línea. Ver la nota
 * de arriba sobre por qué no basta con `lineBreak: false`.
 */
export function celdaSinEnvolver(
  width: number,
  align: 'left' | 'right' | 'center',
  altoLinea: number,
): PDFKit.Mixins.TextOptions {
  return { width, align, lineBreak: false, height: altoLinea, ellipsis: true };
}

/** Opciones para la única celda que sí puede envolver (la descripción). */
export function celdaQueEnvuelve(
  width: number,
  align: 'left' | 'right' | 'center' = 'left',
): PDFKit.Mixins.TextOptions {
  return { width, align, lineBreak: true };
}
