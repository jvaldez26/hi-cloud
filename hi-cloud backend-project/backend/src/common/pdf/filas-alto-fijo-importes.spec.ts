/**
 * Guarda de altura en las tablas de fila de alto FIJO.
 *
 * compras-pdf.service.ts (rowH = 16) y tabular-pdf.helper.ts (ROW_H = 18)
 * dibujan cada celda a `y + 4` y luego avanzan una altura constante. Sus
 * columnas monetarias son holgadas —aguantan ocho cifras— así que hoy no
 * parten ningún importe, y por eso NO se les tocan los anchos.
 *
 * Lo que sí se les añade es la guarda de una línea. Sin ella, el día que un
 * importe no quepa, PDFKit lo envuelve y la segunda línea se dibuja encima de
 * la fila siguiente, porque la altura de la fila no crece. Un documento
 * solapado se lee peor que uno con el texto recortado: con la guarda, el que
 * no cabe se corta con puntos suspensivos y cada fila se queda en su sitio.
 *
 * Estas pruebas fuerzan importes por encima del ancho de columna a propósito.
 */

import { ComprasPdfService } from '../../compras/compras-pdf.service';
import { generarReportePDF } from './tabular-pdf.helper';
import { fragmentos, lineas, simbolosSueltos } from './inspeccion-pdf.testing';

/** PDFKit escribe los puntos suspensivos como 0x85 en WinAnsi. */
const ELIPSIS = '';

// ── tabular-pdf.helper.ts ───────────────────────────────────────────────────

describe('Reportes tabulares — guarda de una línea en filas de alto fijo', () => {
  /** Columna monetaria deliberadamente estrecha, como podría definirla un caller. */
  const reporteEstrecho = () => ({
    titulo: 'Reporte de prueba',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 88 },
      { header: 'Monto',    key: 'monto',    width: 12, money: true, align: 'right' as const },
    ],
    rows: [
      { concepto: 'Primera fila',  monto: 123456789.01 },
      { concepto: 'Segunda fila',  monto: 987654321.99 },
      { concepto: 'Tercera fila',  monto: 42.5 },
    ],
  });

  it('no parte el importe aunque no quepa: lo recorta', async () => {
    const pdf = await generarReportePDF(reporteEstrecho());

    expect(simbolosSueltos(pdf)).toEqual([]);
    expect(lineas(pdf).some(l => l.includes(ELIPSIS))).toBe(true);
  });

  it('no deja la cifra huérfana en la línea de abajo', async () => {
    const pdf = await generarReportePDF(reporteEstrecho());

    // Al envolver, PDFKit parte "RD$ 123,456,789.01" en el símbolo y la cifra.
    // `simbolosSueltos` caza la cabeza; esto caza la cola, que es la que se
    // dibujaría encima de la fila siguiente.
    const colas = fragmentos(pdf).filter(f => /^[\d,]+\.\d{2}$/.test(f.texto));
    expect(colas).toEqual([]);
  });

  it('deja intacto un reporte con columnas holgadas (no hay regresión)', async () => {
    const pdf = await generarReportePDF({
      titulo: 'Resumen',
      columns: [
        { header: 'Concepto', key: 'concepto', width: 70 },
        { header: 'Monto',    key: 'monto',    width: 30, money: true, align: 'right' as const },
      ],
      rows: [{ concepto: 'Ventas gravadas', monto: 1234567.89 }],
    });

    expect(simbolosSueltos(pdf)).toEqual([]);
    expect(lineas(pdf).some(l => l.includes('RD$ 1,234,567.89'))).toBe(true);
    expect(lineas(pdf).some(l => l.includes(ELIPSIS))).toBe(false);
  });
});

// ── compras-pdf.service.ts ──────────────────────────────────────────────────

describe('PDF de compra E41 — guarda de una línea en filas de alto fijo', () => {
  // generarE41PDF solo usa PDFKit y qrcode; los repos no se tocan.
  const servicio = new ComprasPdfService(null as any, null as any, null as any, null as any);

  const generar = (precioUnitario: number, cantidad = 1) =>
    (servicio as any).generarE41PDF(
      {
        folio: 'OC-000123',
        fecha: '2026-08-28',
        detalles: [{ descripcion: 'Equipo industrial', cantidad, precioUnitario, porcentajeItbis: 18 }],
        subtotal: precioUnitario * cantidad,
        itbis: precioUnitario * cantidad * 0.18,
        total: precioUnitario * cantidad * 1.18,
      },
      { nombre: 'Comercial Del Este SRL', rnc: '130123456', direccion: 'Av. Churchill 45' },
      { nombre: 'Proveedor Nacional SRL', rnc: '101234567' },
      { numero: 'E410000000123', codigoSeguridad: 'ABC123' },
    ) as Promise<Buffer>;

  it('no parte el importe aunque no quepa: lo recorta', async () => {
    // La columna Importe mide 70pt y "RD$ 123,456,789.01" no cabe a 7.5pt.
    const pdf = await generar(123456789.01);

    expect(simbolosSueltos(pdf)).toEqual([]);
    expect(lineas(pdf).some(l => l.includes(ELIPSIS))).toBe(true);
  });

  it('deja intacta una compra de importes normales (no hay regresión)', async () => {
    const pdf = await generar(1234.56, 2);

    expect(simbolosSueltos(pdf)).toEqual([]);
    expect(lineas(pdf).some(l => l.includes('RD$ 1,234.56'))).toBe(true);
    expect(lineas(pdf).some(l => l.includes(ELIPSIS))).toBe(false);
  });
});
