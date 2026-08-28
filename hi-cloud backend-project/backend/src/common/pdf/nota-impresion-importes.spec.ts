/**
 * Importes largos en la tabla de ítems de notas de crédito y débito.
 *
 * Mismo bug que factura y cotización, pero mucho menos apretado: las columnas
 * son más anchas (68–85pt) y la fuente más chica (7.5pt). Umbrales medidos:
 *
 *   ITBIS      62.0pt de texto  → parte desde RD$ 10,000,000.00
 *   P. Unit.   79.0pt           → aguanta 8 cifras
 *   Total      74.0pt           → aguanta 8 cifras
 *
 * O sea que solo se rompe en notas de más de diez millones. Es preventivo,
 * no urgente — pero la nota de crédito de una factura grande llega ahí.
 */

import { generarNotaPDF } from './nota-pdf.helper';
import type { NotaPDFData } from './nota-pdf.helper';
import { lineas, simbolosSueltos, importe } from './inspeccion-pdf.testing';

type NotaItem = NotaPDFData['items'][number];

function item(over: Partial<NotaItem> = {}): NotaItem {
  return {
    descripcion: 'Devolución de mercancía',
    cantidad: 1,
    precioUnitario: 1000,
    porcentajeIva: 18,
    importeIva: 180,
    total: 1180,
    ...over,
  };
}

function nota(over: Partial<NotaPDFData> = {}): NotaPDFData {
  return {
    tipo: 'CREDITO',
    numero: 'NC-000123',
    fecha: '2026-08-28',
    tipoNcf: 'E34',
    empresaNombre: 'Comercial Del Este SRL',
    empresaRNC: '130123456',
    empresaDireccion: 'Av. Winston Churchill 45',
    clienteNombre: 'Distribuidora Nacional SRL',
    clienteRNC: '101234567',
    estado: 'EMITIDA',
    items: [item()],
    subtotal: 1000,
    iva: 180,
    total: 1180,
    ...over,
  };
}

/** Nota de ocho cifras: por encima del umbral medido de la columna ITBIS. */
function notaImportesEnormes(): NotaPDFData {
  return nota({
    items: [
      item({
        descripcion: 'Devolución de lote industrial completo',
        cantidad: 720,
        precioUnitario: 123456.78,
        importeIva: 16000000.00,
        total: 104888888.88,
      }),
      item({
        descripcion: 'Ajuste de flete',
        precioUnitario: 1080,
        importeIva: 194.4,
        total: 1274.4,
      }),
    ],
    subtotal: 88888888.88,
    iva: 16000000.00,
    total: 104888888.88,
  });
}

function importesEsperados(d: NotaPDFData): string[] {
  const de: string[] = [];
  for (const it of d.items) {
    de.push(importe(it.precioUnitario), importe(it.importeIva), importe(it.total));
  }
  de.push(importe(d.subtotal), importe(d.iva), importe(d.total));
  return [...new Set(de)];
}

describe('PDF de nota de crédito/débito — importes largos', () => {
  it('no parte importes de ocho cifras, que es donde se rompía', async () => {
    // RD$ 16,000,000.00 no cabía en los 62pt de la columna ITBIS.
    const d   = notaImportesEnormes();
    const pdf = await generarNotaPDF(d);
    const ls  = lineas(pdf);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(ls.some(l => l.includes(v))).toBe(true);
    }
  });

  it('mantiene enteros los importes de la fila de totales', async () => {
    const d   = notaImportesEnormes();
    const pdf = await generarNotaPDF(d);
    const ls  = lineas(pdf);

    for (const v of [importe(d.subtotal), importe(d.iva), importe(d.total)]) {
      expect(ls.some(l => l.includes(v))).toBe(true);
    }
  });

  it('sigue sin partir importes de siete cifras (ya iba bien)', async () => {
    const d = nota({
      items: [item({ precioUnitario: 1234567.89, importeIva: 222222.22, total: 1456790.11 })],
      subtotal: 1234567.89, iva: 222222.22, total: 1456790.11,
    });
    const pdf = await generarNotaPDF(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(v))).toBe(true);
    }
  });

  it('deja intacta una nota de importes cortos', async () => {
    const d   = nota();
    const pdf = await generarNotaPDF(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(v))).toBe(true);
    }
  });

  it('recorta la descripción en una línea: la fila es de alto fijo', async () => {
    // A diferencia de factura y cotización, aquí la fila mide 18pt fijos. Si la
    // descripción envolviera, la segunda línea se comería la fila siguiente. Se
    // recorta con puntos suspensivos, que es lo que el `ellipsis` original ya
    // pretendía; el ancho que sobra sigue yendo a esta columna.
    const d = nota({
      items: [item({
        descripcion:
          'Devolución de lote industrial completo por defecto de fábrica detectado ' +
          'en la inspección de recepción del almacén central',
        precioUnitario: 88888888.88,
        importeIva: 16000000.00,
        total: 104888888.88,
      })],
      subtotal: 88888888.88, iva: 16000000.00, total: 104888888.88,
    });
    const pdf = await generarNotaPDF(d);
    const ls  = lineas(pdf);

    expect(ls.filter(l => /Devolución|fábrica|almacén|inspección/i.test(l)))
      .toHaveLength(1);
    // Sin esto el assert de abajo lo satisface la fila de totales, que es más
    // ancha, y la celda partida pasaría desapercibida.
    expect(simbolosSueltos(pdf)).toEqual([]);
    expect(ls.some(l => l.includes('RD$ 16,000,000.00'))).toBe(true);
  });

  it('funciona igual en nota de débito', async () => {
    const d   = notaImportesEnormes();
    d.tipo    = 'DEBITO';
    d.tipoNcf = 'E33';
    const pdf = await generarNotaPDF(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
  });
});
