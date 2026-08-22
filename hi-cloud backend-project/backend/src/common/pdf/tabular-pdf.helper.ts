/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Helper para reportes tabulares con PDFKit
   Reemplaza a: BrowserService.htmlToPDF() para declaraciones y reportes financieros
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { fechaHoraRD } from '../utils/fecha-local.util';

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface TabularColumn {
  header:  string;
  key:     string;
  width?:  number;         // porcentaje del ancho útil; si no se da, distribuye igual
  align?:  'left' | 'right' | 'center';
  money?:  boolean;
  date?:   boolean;
}

export interface TabularReportData {
  titulo:     string;
  subtitulo?: string;
  periodo?:   string;
  rnc?:       string;
  empresa?:   string;
  columns:    TabularColumn[];
  rows:       Record<string, any>[];
  summaryCards?: { label: string; value: string; red?: boolean }[];
  totalRow?:  Record<string, any>;   // fila de totales al final
}

// ── Helpers internos ─────────────────────────────────────────────────────────

function fmtM(v: number): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtD(d: any): string {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return [
      String(dt.getDate()).padStart(2, '0'),
      String(dt.getMonth() + 1).padStart(2, '0'),
      dt.getFullYear(),
    ].join('/');
  } catch { return String(d); }
}

// ── Generador ────────────────────────────────────────────────────────────────

export async function generarReportePDF(data: TabularReportData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW    = doc.page.width;
    const PH    = doc.page.height;
    const PL    = 28;
    const PR    = PW - 28;
    const W     = PR - PL;
    const BLUE  = '#1a3c8f';
    const DARK  = '#111111';
    const GRAY  = '#555555';
    const LGRAY = '#f4f6fb';

    // ── ENCABEZADO ───────────────────────────────────────────────────────────

    const HEADER_H = 56;
    doc.rect(0, 0, PW, HEADER_H).fill(BLUE);

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
      .text(data.empresa ?? 'HiCloud ERP', PL, 10, { width: W * 0.55 });
    if (data.rnc) {
      doc.fillColor('rgba(255,255,255,0.75)').font('Helvetica').fontSize(9)
        .text('RNC: ' + data.rnc, PL, 27, { width: W * 0.55 });
    }

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
      .text('REPORTE FINANCIERO', PL + W * 0.55, 8, { width: W * 0.45, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(16)
      .text(data.titulo, PL + W * 0.55, 20, { width: W * 0.45, align: 'right' });
    if (data.subtitulo) {
      doc.font('Helvetica').fontSize(9)
        .text(data.subtitulo, PL + W * 0.55, 40, { width: W * 0.45, align: 'right' });
    }

    let y = HEADER_H + 14;

    // Periodo / generado
    doc.fillColor(GRAY).font('Helvetica').fontSize(8);
    if (data.periodo) {
      doc.text('Período: ' + data.periodo, PL, y);
    }
    doc.text('Generado: ' + fechaHoraRD(), PL, y + 10);
    y += 24;

    // ── TARJETAS RESUMEN ─────────────────────────────────────────────────────

    if (data.summaryCards && data.summaryCards.length > 0) {
      const cardW   = Math.floor((W - (data.summaryCards.length - 1) * 8) / data.summaryCards.length);
      let cx = PL;
      for (const card of data.summaryCards) {
        doc.rect(cx, y, cardW, 44).fill(LGRAY).stroke('#d0d8f0');
        doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
          .text(card.label, cx + 8, y + 8, { width: cardW - 16 });
        doc.fillColor(card.red ? '#c0392b' : BLUE).font('Helvetica-Bold').fontSize(12)
          .text(card.value, cx + 8, y + 20, { width: cardW - 16 });
        cx += cardW + 8;
      }
      y += 54;
    }

    // ── CALCULAR ANCHOS DE COLUMNAS ──────────────────────────────────────────

    const totalPct = data.columns.reduce((s, c) => s + (c.width ?? 0), 0);
    const colWidths = data.columns.map(c => {
      if (c.width) return (c.width / (totalPct || 100)) * W;
      const withWidth    = data.columns.filter(x => x.width).reduce((s, x) => s + x.width!, 0);
      const withoutCount = data.columns.filter(x => !x.width).length;
      const remaining    = W - (withWidth / (totalPct || 100)) * W;
      return remaining / (withoutCount || 1);
    });

    const ROW_H = 18;

    // Función para dibujar cabecera de tabla (reutilizable en new pages)
    const drawTableHeader = () => {
      doc.rect(PL, y, W, ROW_H).fill('#1a3c8f');
      let hx = PL;
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      for (let i = 0; i < data.columns.length; i++) {
        const col = data.columns[i];
        const cw  = colWidths[i];
        doc.text(col.header.toUpperCase(), hx + 3, y + 4, {
          width: cw - 6, align: col.align ?? 'left',
        });
        hx += cw;
      }
      y += ROW_H;
    };

    drawTableHeader();

    // ── FILAS ────────────────────────────────────────────────────────────────

    for (let ri = 0; ri < data.rows.length; ri++) {
      if (y + ROW_H > PH - 60) {
        doc.addPage();
        y = 30;
        drawTableHeader();
      }

      const row = data.rows[ri];
      const bg  = ri % 2 === 0 ? '#ffffff' : LGRAY;
      doc.rect(PL, y, W, ROW_H).fill(bg)
        .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      let rx = PL;
      for (let ci = 0; ci < data.columns.length; ci++) {
        const col  = data.columns[ci];
        const cw   = colWidths[ci];
        const raw  = row[col.key];
        let txt    = '';
        if (raw === null || raw === undefined) {
          txt = '—';
        } else if (col.money) {
          txt = fmtM(Number(raw));
        } else if (col.date) {
          txt = fmtD(raw);
        } else {
          txt = String(raw);
        }
        doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
          .text(txt, rx + 3, y + 4, {
            width: cw - 6, align: col.align ?? 'left', ellipsis: true,
          });
        rx += cw;
      }
      y += ROW_H;
    }

    if (data.rows.length === 0) {
      doc.rect(PL, y, W, 28).fill(LGRAY);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Sin registros en el período', PL, y + 9, { width: W, align: 'center' });
      y += 28;
    }

    // ── FILA TOTALES ─────────────────────────────────────────────────────────

    if (data.totalRow) {
      doc.rect(PL, y, W, ROW_H + 2).fill('#eef2fb').stroke('#1a3c8f');
      let tx = PL;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8);
      for (let ci = 0; ci < data.columns.length; ci++) {
        const col = data.columns[ci];
        const cw  = colWidths[ci];
        const raw = data.totalRow[col.key];
        const txt = raw !== undefined
          ? (col.money ? fmtM(Number(raw)) : String(raw))
          : '';
        doc.text(txt, tx + 3, y + 5, { width: cw - 6, align: col.align ?? 'left' });
        tx += cw;
      }
      y += ROW_H + 12;
    }

    // ── PIE DE PÁGINA ────────────────────────────────────────────────────────

    const footerY = PH - 30;
    doc.moveTo(PL, footerY).lineTo(PR, footerY)
      .strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.fillColor('#999999').font('Helvetica').fontSize(7.5)
      .text(
        `HiCloud ERP · ${data.empresa ?? ''}  —  Generado: ${fechaHoraRD()}`,
        PL, footerY + 8, { width: W, align: 'center' },
      );

    doc.end();
  });
}
