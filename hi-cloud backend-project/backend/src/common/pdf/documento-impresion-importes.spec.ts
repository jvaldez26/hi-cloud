/**
 * Importes largos en la tabla de ítems de cotizaciones, pre-facturas y conduces.
 *
 * Clon geométrico de la tabla de la factura: mismos %, mismo A4, misma fuente.
 * Y por tanto el mismo bug, con los mismos umbrales medidos:
 *
 *   ITBIS      43.0pt de texto  → parte desde RD$    100.00
 *   Subtotal   58.0pt           → parte desde RD$ 100,000.00
 *   Precio U.  68.0pt           → parte desde RD$ 1,000,000.00
 *   Total      62.3pt           → parte desde RD$ 1,000,000.00
 *
 * O sea que se parte en casi cualquier cotización real, no solo con importes
 * grandes. Aquí ni siquiera había `ellipsis`, solo el `lineBreak: false` que
 * no protege de nada (ver columnas-numericas.helper.ts).
 */

import { generarDocumentoPDFFactura } from './documento-pdf.helper';
import type { DocumentoPDFData, DocumentoPDFItem } from './documento-pdf.helper';
import { lineas, simbolosSueltos, importe } from './inspeccion-pdf.testing';

function item(over: Partial<DocumentoPDFItem> = {}): DocumentoPDFItem {
  return {
    descripcion: 'Servicio de mantenimiento',
    cantidad: 1,
    unidadMedida: 'UN',
    precioUnitario: 1000,
    itbisPct: 18,
    importeItbis: 180,
    subtotal: 1000,
    total: 1180,
    ...over,
  };
}

function documento(over: Partial<DocumentoPDFData> = {}): DocumentoPDFData {
  return {
    tipo: 'COTIZACIÓN',
    numero: 'COT-000123',
    fecha: '2026-08-28',
    empresaNombre: 'Comercial Del Este SRL',
    empresaRNC: '130123456',
    empresaDireccion: 'Av. Winston Churchill 45',
    empresaCiudad: 'Santo Domingo',
    clienteNombre: 'Distribuidora Nacional SRL',
    clienteRNC: '101234567',
    items: [item()],
    subtotalGravado: 1000,
    subtotalExento: 0,
    subtotalGeneral: 1000,
    itbisTotal: 180,
    totalGeneral: 1180,
    ...over,
  };
}

/** Cotización de importes grandes: seis y siete cifras con separadores. */
function documentoImportesGrandes(): DocumentoPDFData {
  return documento({
    items: [
      item({
        descripcion: 'Equipo industrial de refrigeración modelo XR-4400',
        cantidad: 12,
        precioUnitario: 123456.78,
        subtotal: 1481481.36,
        importeItbis: 266666.64,
        total: 1748148.00,
      }),
      item({
        descripcion: 'Instalación y puesta en marcha',
        precioUnitario: 1080,
        subtotal: 1080,
        importeItbis: 194.4,
        total: 1274.4,
      }),
      item({
        descripcion: 'Póliza de servicio exenta',
        precioUnitario: 549.15,
        itbisPct: 0,
        importeItbis: 0,
        subtotal: 549.15,
        total: 549.15,
      }),
    ],
    subtotalGravado: 1482561.36,
    subtotalExento: 549.15,
    subtotalGeneral: 1483110.51,
    itbisTotal: 266861.04,
    totalGeneral: 1749971.55,
  });
}

function importesEsperados(d: DocumentoPDFData): string[] {
  const de: string[] = [];
  for (const it of d.items) {
    de.push(importe(it.precioUnitario), importe(it.subtotal), importe(it.total));
    if (it.itbisPct !== 0) de.push(importe(it.importeItbis));
  }
  de.push(
    importe(d.subtotalGravado), importe(d.subtotalExento),
    importe(d.subtotalGeneral), importe(d.itbisTotal), importe(d.totalGeneral),
  );
  return [...new Set(de)];
}

describe('PDF de cotización/pre-factura — importes largos', () => {
  it('no parte el ITBIS de tres cifras, que es el caso de todos los días', async () => {
    // RD$ 180.00 ocupa 45.36pt y la columna daba 43pt: se partía siempre.
    const d   = documento();
    const pdf = await generarDocumentoPDFFactura(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(v))).toBe(true);
    }
  });

  it('no parte ningún importe de seis o siete cifras', async () => {
    const d   = documentoImportesGrandes();
    const pdf = await generarDocumentoPDFFactura(d);
    const ls  = lineas(pdf);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(ls.some(l => l.includes(v))).toBe(true);
    }
  });

  it('mantiene el importe del total del documento en una sola línea', async () => {
    const d   = documentoImportesGrandes();
    const pdf = await generarDocumentoPDFFactura(d);

    expect(lineas(pdf).some(l => l.includes(importe(d.totalGeneral)))).toBe(true);
  });

  it('deja intacta una cotización de importes de dos cifras', async () => {
    const d = documento({
      items: [item({ precioUnitario: 50, subtotal: 50, importeItbis: 9, total: 59 })],
      subtotalGravado: 50, subtotalGeneral: 50, itbisTotal: 9, totalGeneral: 59,
    });
    const pdf = await generarDocumentoPDFFactura(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
    for (const v of importesEsperados(d)) {
      expect(lineas(pdf).some(l => l.includes(v))).toBe(true);
    }
  });

  it('deja a la descripción el ancho que sobra, y esa sí puede envolver', async () => {
    const d = documento({
      items: [item({
        descripcion:
          'Equipo industrial de refrigeración modelo XR-4400 con compresor de doble ' +
          'etapa y garantía extendida de treinta y seis meses incluida en el precio',
        precioUnitario: 123456.78,
        subtotal: 123456.78,
        importeItbis: 22222.22,
        total: 145679,
      })],
      subtotalGravado: 123456.78, subtotalGeneral: 123456.78,
      itbisTotal: 22222.22, totalGeneral: 145679,
    });
    const pdf = await generarDocumentoPDFFactura(d);
    const ls  = lineas(pdf);

    expect(ls.filter(l => /GARANTÍA|COMPRESOR|EQUIPO INDUSTRIAL/i.test(l)).length)
      .toBeGreaterThan(1);
    expect(ls.some(l => l.includes('RD$ 123,456.78'))).toBe(true);
    expect(ls.some(l => l.includes('RD$ 22,222.22'))).toBe(true);
  });

  it('funciona igual en pre-factura, que usa el mismo generador', async () => {
    const d   = documentoImportesGrandes();
    d.tipo    = 'PRE-FACTURA';
    const pdf = await generarDocumentoPDFFactura(d);

    expect(simbolosSueltos(pdf)).toEqual([]);
  });
});
