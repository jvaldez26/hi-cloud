/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Generador PDF basado en PDFKit para DocData genérico
   Reemplaza a: BrowserService.htmlToPDF(generarDocumento(data))
   Usado por: Gastos, Presupuestos, Recibos de Cobro, Pre-Facturas, Retenciones,
              Compras, Cotizaciones y cualquier módulo que use DocData.
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import type { DocData } from '../doc.template';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtF(s: string): string {
  try {
    const d = new Date(s + (s.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return s;
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('/');
  } catch { return s; }
}

// ── Generador principal ──────────────────────────────────────────────────────

export async function generarDocumentoPDF(d: DocData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const PL = 40;
    const PR = PW - 40;
    const W  = PR - PL;          // 515.28

    const DARK  = '#111111';
    const THEAD = '#2d2d2d';
    const GRAY  = '#555555';
    const LGRAY = '#f5f5f5';

    let y = 36;

    // ── ENCABEZADO IZQUIERDO: iniciales + datos empresa ──────────────────────

    const iniciales = (d.empresa.nombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    // Caja de iniciales 48×48
    doc.rect(PL, y, 48, 48).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text(iniciales, PL, y + 16, { width: 48, align: 'center' });

    const infoX = PL + 56;
    const infoW = 220;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
      .text(d.empresa.nombre.toUpperCase(), infoX, y, { width: infoW });

    let iy = y + 20;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    if (d.empresa.direccion) {
      const dir = d.empresa.direccion +
        (d.empresa.ciudad ? ', ' + d.empresa.ciudad : '') + '.';
      doc.text(dir, infoX, iy, { width: infoW });
      iy += 11;
    }
    if (d.empresa.email) {
      doc.text('Correo: ' + d.empresa.email, infoX, iy, { width: infoW });
      iy += 11;
    }
    if (d.empresa.telefono) {
      doc.text('Teléfono: ' + d.empresa.telefono, infoX, iy, { width: infoW });
      iy += 11;
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
      .text('RNC: ' + d.empresa.rnc, infoX, iy);

    const leftBottom = Math.max(y + 52, iy + 14);

    // ── ENCABEZADO DERECHO: tipo documento + número + fecha + estado ─────────

    const rightW = 205;
    const rightX = PR - rightW;
    let ry = y;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
      .text(d.tipo, rightX, ry, { width: rightW, align: 'right' });
    ry += 14;

    if (d.tipoSub) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text(d.tipoSub, rightX, ry, { width: rightW, align: 'right' });
      ry += 11;
    }

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(17)
      .text(d.numero, rightX, ry, { width: rightW, align: 'right' });
    ry += 22;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
      .text('Fecha: ' + fmtF(d.fecha), rightX, ry, { width: rightW, align: 'right' });
    ry += 14;

    if (d.estado) {
      const BADGE: Record<string, [string, string]> = {
        green:  ['#dcfce7', '#15803d'],
        blue:   ['#dbeafe', '#1d4ed8'],
        orange: ['#fef3c7', '#92400e'],
        red:    ['#fee2e2', '#991b1b'],
      };
      const [bg, tx] = BADGE[d.estadoColor ?? 'blue'] ?? BADGE.blue;
      const lbl   = d.estado.toUpperCase();
      const bW    = Math.max(80, lbl.length * 6 + 22);
      const bX    = PR - bW;
      doc.roundedRect(bX, ry, bW, 18, 4).fill(bg);
      doc.fillColor(tx).font('Helvetica-Bold').fontSize(8)
        .text(lbl, bX, ry + 4, { width: bW, align: 'center' });
      ry += 22;
    }

    y = Math.max(leftBottom, ry) + 14;

    // ── SEPARADOR ────────────────────────────────────────────────────────────

    doc.rect(PL, y, W, 3).fill(DARK);
    y += 12;

    // ── PARTICIPANTE ─────────────────────────────────────────────────────────

    if (d.participante) {
      const p = d.participante;
      const lines: string[] = [];
      if (p.rnc) lines.push('RNC o Cédula: ' + p.rnc);
      lines.push('Nombre o Razón Social: ' + p.nombre);
      if (p.dir) lines.push(p.dir);
      const ct = [p.tel ? 'Tel. ' + p.tel : '', p.email ?? ''].filter(Boolean).join('  ');
      if (ct) lines.push(ct);

      const boxH = 20 + lines.length * 13 + 6;
      doc.rect(PL, y, W, boxH).stroke('#aaaaaa');

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text(('Datos del ' + p.label).toUpperCase(), PL + 10, y + 8);

      let py = y + 20;
      for (const line of lines) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(10)
          .text(line, PL + 10, py, { width: W - 20 });
        py += 13;
      }
      y += boxH + 10;
    }

    // ── CAMPOS ADICIONALES ───────────────────────────────────────────────────

    if (d.campos && d.campos.length > 0) {
      const numCols = Math.min(d.campos.length, 4);
      const cW      = Math.floor((W - (numCols - 1) * 8) / numCols);
      let cx = PL, cy = y, rowBottom = cy + 38;

      for (let i = 0; i < d.campos.length; i++) {
        if (i > 0 && i % numCols === 0) {
          cy = rowBottom + 6;
          cx = PL;
          rowBottom = cy + 38;
        }
        const c = d.campos[i];
        doc.rect(cx, cy, cW, 38).stroke('#dddddd');
        doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7)
          .text(c.label.toUpperCase(), cx + 6, cy + 5, { width: cW - 12 });
        doc.fillColor(DARK).font(c.mono ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(10)
          .text(String(c.valor), cx + 6, cy + 18, { width: cW - 12, ellipsis: true });
        cx += cW + 8;
        rowBottom = Math.max(rowBottom, cy + 38);
      }
      y = rowBottom + 10;
    }

    // ── TABLA DE ÍTEMS ───────────────────────────────────────────────────────

    if (d.items && d.items.length > 0) {
      const hasCant  = d.items.some(i => i.cantidad  !== undefined);
      const hasUnid  = d.items.some(i => i.unidad);
      const hasPUnit = d.items.some(i => i.precioUnitario !== undefined);

      const importW = 90;
      const cantW   = hasCant  ? 55 : 0;
      const unidW   = hasUnid  ? 42 : 0;
      const punitW  = hasPUnit ? 88 : 0;
      const numW    = 24;
      const descW   = W - numW - importW - cantW - unidW - punitW;

      const cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[] = [
        { label: '#',           width: numW,    align: 'center' },
        { label: 'Descripción', width: descW,   align: 'left'   },
        ...(hasCant  ? [{ label: 'Cant.',    width: cantW,  align: 'right'  as const }] : []),
        ...(hasUnid  ? [{ label: 'Ud.',       width: unidW,  align: 'center' as const }] : []),
        ...(hasPUnit ? [{ label: 'P. Unit.',  width: punitW, align: 'right'  as const }] : []),
        { label: 'Importe',     width: importW, align: 'right'  },
      ];

      // Cabecera
      doc.rect(PL, y, W, 20).fill(THEAD);
      let hx = PL;
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      for (const col of cols) {
        doc.text(col.label.toUpperCase(), hx + 3, y + 5, {
          width: col.width - 6, align: col.align,
        });
        hx += col.width;
      }
      y += 20;

      // Filas
      for (let idx = 0; idx < d.items.length; idx++) {
        const item  = d.items[idx];
        const rowH  = item.nota ? 30 : 20;

        if (y + rowH > PH - 70) { doc.addPage(); y = 40; }

        const bg = idx % 2 === 0 ? '#ffffff' : LGRAY;
        doc.rect(PL, y, W, rowH).fill(bg)
          .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
        doc.lineWidth(1);

        const cells: { text: string; note?: string; width: number; align: 'left' | 'right' | 'center' }[] = [
          { text: String(idx + 1),                                         width: numW,    align: 'center' },
          { text: item.descripcion, note: item.nota,                       width: descW,   align: 'left'   },
          ...(hasCant  ? [{ text: item.cantidad !== undefined ? String(item.cantidad) : '', width: cantW,  align: 'right'  as const }] : []),
          ...(hasUnid  ? [{ text: item.unidad ?? '',                        width: unidW,  align: 'center' as const }] : []),
          ...(hasPUnit ? [{ text: item.precioUnitario !== undefined ? fmtM(item.precioUnitario) : '', width: punitW, align: 'right' as const }] : []),
          { text: fmtM(item.importe),                                      width: importW, align: 'right'  },
        ];

        let rx = PL;
        for (const cell of cells) {
          doc.fillColor(DARK).font('Helvetica').fontSize(8)
            .text(cell.text, rx + 3, y + 4, {
              width: cell.width - 6, align: cell.align, ellipsis: true,
            });
          if (cell.note) {
            doc.fillColor(GRAY).font('Helvetica').fontSize(7)
              .text(cell.note, rx + 3, y + 16, { width: cell.width - 6 });
          }
          rx += cell.width;
        }
        y += rowH;
      }
      y += 10;
    }

    // ── TOTALES ──────────────────────────────────────────────────────────────

    if (d.totales && d.totales.length > 0) {
      const totW    = 265;
      const totX    = PR - totW;
      const lastIdx = d.totales.length - 1;

      for (let i = 0; i < d.totales.length; i++) {
        const t = d.totales[i];

        if (i < lastIdx) {
          doc.fillColor(GRAY).font('Helvetica').fontSize(10)
            .text(t.label + ':', totX, y, { width: 130 });
          doc.fillColor(t.color ?? DARK)
            .font(t.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
            .text(fmtM(t.valor), totX + 130, y, { width: totW - 130, align: 'right' });
          doc.moveTo(totX, y + 14).lineTo(PR, y + 14)
            .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
          doc.lineWidth(1);
          y += 15;
        } else {
          y += 4;
          doc.moveTo(totX, y).lineTo(PR, y).strokeColor(DARK).lineWidth(2).stroke();
          doc.lineWidth(1);
          y += 7;
          doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
            .text(t.label.toUpperCase() + ':', totX, y, { width: 135 });
          doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK)
            .text(fmtM(t.valor), totX + 130, y - 1, { width: totW - 130, align: 'right' });
          y += 22;
        }
      }
      y += 8;
    }

    // ── NOTAS ────────────────────────────────────────────────────────────────

    if (d.notas) {
      const nh   = Math.max(36, doc.heightOfString(d.notas, { width: W - 20 }) + 24);
      doc.rect(PL, y, 3, nh).fill('#dddddd');
      doc.fillColor('#777777').font('Helvetica-Bold').fontSize(8)
        .text('NOTAS', PL + 8, y + 5);
      doc.fillColor('#555555').font('Helvetica').fontSize(9)
        .text(d.notas, PL + 8, y + 17, { width: W - 20 });
      y += nh + 10;
    }

    // ── PIE DE PÁGINA ────────────────────────────────────────────────────────

    const footerY = PH - 44;
    doc.moveTo(PL, footerY).lineTo(PR, footerY)
      .strokeColor('#dddddd').lineWidth(0.5).stroke();

    const pie = d.pie ?? '¡Gracias por su preferencia!';
    doc.fillColor('#555555').font('Helvetica').fontSize(8.5)
      .text(pie, PL, footerY + 8, { width: W, align: 'center' });
    if (d.empresa.email) {
      doc.fillColor('#888888').font('Helvetica').fontSize(8)
        .text(d.empresa.email, PL, footerY + 19, { width: W, align: 'center' });
    }
    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(7.5)
      .text('Documento generado por HiCloud ERP', PL, footerY + 29, {
        width: W, align: 'center',
      });

    doc.end();
  });
}
