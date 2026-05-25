/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — PDF de Nota de Débito (E33) y Nota de Crédito (E34) con PDFKit
   Reemplaza a: BrowserService.htmlToPDF(generarHTMLNota(data))
   Usado por: notas-debito/nota-pdf.service.ts  +  notas-credito/nc-pdf.service.ts
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export interface NotaPDFData {
  tipo:                'DEBITO' | 'CREDITO';
  numero:              string;
  fecha:               string;
  tipoNcf:             string;
  ecfNumero?:          string;
  ecfEstado?:          string;
  empresaNombre:       string;
  empresaRNC:          string;
  empresaDireccion:    string;
  empresaCiudad?:      string;
  empresaTelefono?:    string;
  empresaEmail?:       string;
  empresaLogo?:        string;
  empresaColor?:       string;
  clienteNombre:       string;
  clienteRNC?:         string;
  clienteDireccion?:   string;
  clienteTelefono?:    string;
  clienteEmail?:       string;
  facturaOriginalFolio?: string;
  ncfOriginal?:          string;
  items: Array<{
    descripcion:    string;
    cantidad:       number;
    precioUnitario: number;
    porcentajeIva:  number;
    importeIva:     number;
    total:          number;
  }>;
  subtotal:   number;
  iva:        number;
  total:      number;
  descripcionMotivo?: string;
  notas?:             string;
  estado:             string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
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

// ── Generador ────────────────────────────────────────────────────────────────

export async function generarNotaPDF(d: NotaPDFData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW      = doc.page.width;
    const PH      = doc.page.height;
    const PL      = 40;
    const PR      = PW - 40;
    const W       = PR - PL;
    const DARK    = '#111111';
    const THEAD   = '#2d2d2d';
    const GRAY    = '#555555';
    const LGRAY   = '#f5f5f5';
    const esDebito = d.tipo === 'DEBITO';
    const tipoLabel = esDebito ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'NOTA DE CRÉDITO ELECTRÓNICA';
    const tipoNcfLbl = esDebito ? 'E33' : 'E34';

    let y = 36;

    // ── ENCABEZADO IZQUIERDO ────────────────────────────────────────────────

    const iniciales = (d.empresaNombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    doc.rect(PL, y, 48, 48).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text(iniciales, PL, y + 16, { width: 48, align: 'center' });

    const infoX = PL + 56;
    const infoW = 220;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
      .text(d.empresaNombre.toUpperCase(), infoX, y, { width: infoW });

    let iy = y + 20;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    if (d.empresaDireccion) {
      const dir = d.empresaDireccion +
        (d.empresaCiudad ? ', ' + d.empresaCiudad : '') + '.';
      doc.text(dir, infoX, iy, { width: infoW }); iy += 11;
    }
    if (d.empresaEmail) {
      doc.text('Correo: ' + d.empresaEmail, infoX, iy, { width: infoW }); iy += 11;
    }
    if (d.empresaTelefono) {
      doc.text('Teléfono: ' + d.empresaTelefono, infoX, iy, { width: infoW }); iy += 11;
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
      .text('RNC: ' + d.empresaRNC, infoX, iy);

    const leftBottom = Math.max(y + 52, iy + 14);

    // ── ENCABEZADO DERECHO: tipo nota + e-NCF + info ─────────────────────────

    const rightW = 210;
    const rightX = PR - rightW;
    let ry = y;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
      .text(tipoLabel, rightX, ry, { width: rightW, align: 'right' });
    ry += 13;

    // e-NCF prominente
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
      .text('e-NCF:', rightX, ry, { width: rightW, align: 'right' });
    ry += 11;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14)
      .text(d.ecfNumero ?? '—', rightX, ry, { width: rightW, align: 'right' });
    ry += 18;

    doc.fillColor(GRAY).font('Helvetica').fontSize(9);
    doc.text('Número: ' + d.numero,    rightX, ry, { width: rightW, align: 'right' }); ry += 12;
    doc.text('Tipo NCF: ' + tipoNcfLbl,rightX, ry, { width: rightW, align: 'right' }); ry += 12;
    doc.text('Fecha: ' + fmtF(d.fecha), rightX, ry, { width: rightW, align: 'right' }); ry += 14;

    // Estado badge
    const estadoBadge = (lbl: string, bg: string, tx: string) => {
      const bW = Math.max(80, lbl.length * 6 + 22);
      const bX = PR - bW;
      doc.roundedRect(bX, ry, bW, 18, 4).fill(bg);
      doc.fillColor(tx).font('Helvetica-Bold').fontSize(8)
        .text(lbl, bX, ry + 4, { width: bW, align: 'center' });
      ry += 22;
    };
    if (d.estado === 'emitida')  estadoBadge('EMITIDA',  '#dcfce7', '#15803d');
    else if (d.estado === 'borrador') estadoBadge('BORRADOR', '#fef3c7', '#92400e');
    else estadoBadge('ANULADA', '#fee2e2', '#991b1b');

    y = Math.max(leftBottom, ry) + 14;

    // ── SEPARADOR ────────────────────────────────────────────────────────────

    doc.rect(PL, y, W, 3).fill(DARK);
    y += 12;

    // ── DATOS DEL CLIENTE ────────────────────────────────────────────────────

    const cliLines: string[] = [];
    cliLines.push('RNC o Cédula: ' + (d.clienteRNC || '—'));
    cliLines.push('Nombre o Razón Social: ' + d.clienteNombre);
    if (d.clienteDireccion) cliLines.push(d.clienteDireccion);

    const cliBoxH = 20 + cliLines.length * 13 + 6;
    doc.rect(PL, y, W, cliBoxH).stroke('#aaaaaa');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
      .text('DATOS DEL CLIENTE', PL + 10, y + 8);
    let py = y + 20;
    for (const line of cliLines) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(10)
        .text(line, PL + 10, py, { width: W - 20 });
      py += 13;
    }
    y += cliBoxH + 10;

    // ── MODIFICA A (documento original) ─────────────────────────────────────

    const hasMod = d.facturaOriginalFolio || d.ncfOriginal || d.descripcionMotivo;
    if (hasMod) {
      const modParts: string[] = [];
      if (d.facturaOriginalFolio) modParts.push('Factura: ' + d.facturaOriginalFolio);
      if (d.ncfOriginal)          modParts.push('e-NCF original: ' + d.ncfOriginal);
      if (d.descripcionMotivo)    modParts.push('Motivo: ' + d.descripcionMotivo);
      const modBoxH = 16 + 14 + modParts.length * 13 + 4;
      doc.rect(PL, y, W, modBoxH).fill('#fafafa').stroke('#dddddd');
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text('MODIFICA A', PL + 10, y + 8);
      let my = y + 20;
      for (const part of modParts) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(10)
          .text(part, PL + 10, my, { width: W - 20 }); my += 13;
      }
      y += modBoxH + 10;
    }

    // ── TABLA DE ÍTEMS ───────────────────────────────────────────────────────

    const cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[] = [
      { label: 'Descripción',  width: W - 55 - 88 - 75 - 75 - 90, align: 'left'   },
      { label: 'Cant.',        width: 55,                          align: 'right'  },
      { label: 'P. Unit.',     width: 88,                          align: 'right'  },
      { label: 'ITBIS %',      width: 75,                          align: 'center' },
      { label: 'ITBIS',        width: 75,                          align: 'right'  },
      { label: 'Total',        width: 90,                          align: 'right'  },
    ];

    // Cabecera tabla
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
      if (y + 20 > PH - 70) { doc.addPage(); y = 40; }
      const bg = idx % 2 === 0 ? '#ffffff' : LGRAY;
      doc.rect(PL, y, W, 20).fill(bg)
        .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      const cells: { text: string; width: number; align: 'left' | 'right' | 'center' }[] = [
        { text: item.descripcion,               width: cols[0].width, align: 'left'   },
        { text: String(item.cantidad),           width: cols[1].width, align: 'right'  },
        { text: fmtM(item.precioUnitario),       width: cols[2].width, align: 'right'  },
        { text: item.porcentajeIva + '%',        width: cols[3].width, align: 'center' },
        { text: fmtM(item.importeIva),           width: cols[4].width, align: 'right'  },
        { text: fmtM(item.total),                width: cols[5].width, align: 'right'  },
      ];

      let rx = PL;
      for (const cell of cells) {
        doc.fillColor(DARK).font('Helvetica').fontSize(8)
          .text(cell.text, rx + 3, y + 5, {
            width: cell.width - 6, align: cell.align, ellipsis: true,
          });
        rx += cell.width;
      }
      y += 20;
    }
    if (d.items.length === 0) {
      doc.rect(PL, y, W, 22).fill(LGRAY);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Sin ítems registrados', PL, y + 6, { width: W, align: 'center' });
      y += 22;
    }
    y += 10;

    // ── TOTALES ──────────────────────────────────────────────────────────────

    const totW = 265;
    const totX = PR - totW;
    const signo = esDebito ? '+' : '-';

    // Subtotal
    doc.fillColor(GRAY).font('Helvetica').fontSize(10).text('Subtotal:', totX, y, { width: 130 });
    doc.fillColor(DARK).font('Helvetica').fontSize(10)
      .text(fmtM(d.subtotal), totX + 130, y, { width: totW - 130, align: 'right' });
    doc.moveTo(totX, y + 14).lineTo(PR, y + 14).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
    doc.lineWidth(1);
    y += 15;

    // ITBIS
    doc.fillColor(GRAY).font('Helvetica').fontSize(10).text('ITBIS (18%):', totX, y, { width: 130 });
    doc.fillColor(DARK).font('Helvetica').fontSize(10)
      .text(fmtM(d.iva), totX + 130, y, { width: totW - 130, align: 'right' });
    doc.moveTo(totX, y + 14).lineTo(PR, y + 14).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
    doc.lineWidth(1);
    y += 15;

    // Total
    y += 4;
    doc.moveTo(totX, y).lineTo(PR, y).strokeColor(DARK).lineWidth(2).stroke();
    doc.lineWidth(1);
    y += 7;
    const totalLabel = esDebito ? 'TOTAL A COBRAR' : 'TOTAL A ACREDITAR';
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(totalLabel + ':', totX, y, { width: 155 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK)
      .text(signo + fmtM(d.total), totX + 140, y - 1, { width: totW - 140, align: 'right' });
    y += 24;

    // ── NOTAS ────────────────────────────────────────────────────────────────

    if (d.notas) {
      y += 6;
      const nh = Math.max(36, doc.heightOfString(d.notas, { width: W - 20 }) + 24);
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
    const pieText = esDebito
      ? 'Este documento es una Nota de Débito (E33) emitida conforme a la normativa de la DGII.'
      : 'Este documento es una Nota de Crédito (E34) emitida conforme a la normativa de la DGII.';
    doc.fillColor('#555555').font('Helvetica').fontSize(8)
      .text(pieText, PL, footerY + 8, { width: W, align: 'center' });
    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(7.5)
      .text('Documento generado por HiCloud ERP', PL, footerY + 20, {
        width: W, align: 'center',
      });

    doc.end();
  });
}
