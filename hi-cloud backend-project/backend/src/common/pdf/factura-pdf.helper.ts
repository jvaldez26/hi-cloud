/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — PDF de Factura Electrónica con PDFKit
   Reemplaza a: BrowserService.htmlToPDF(generarHTMLFactura(data))
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import type { FacturaPDFData } from '../../facturas/templates/factura.template';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtM(v: number | null | undefined): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtF(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('/');
  } catch { return String(s); }
}

// ── Generador ────────────────────────────────────────────────────────────────

export async function generarFacturaPDF(d: FacturaPDFData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW   = doc.page.width;
    const PH   = doc.page.height;
    const PL   = 40;
    const PR   = PW - 40;
    const W    = PR - PL;

    const DARK  = '#111111';
    const THEAD = '#1e3a8a';   // azul oscuro para facturas (igual al conduce)
    const GRAY  = '#555555';
    const LGRAY = '#f5f5f5';

    let y = 36;

    // ── ENCABEZADO IZQUIERDO ─────────────────────────────────────────────────

    const iniciales = (d.empresaNombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    doc.rect(PL, y, 48, 48).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text(iniciales, PL, y + 16, { width: 48, align: 'center' });

    const infoX = PL + 56;
    const infoW = 215;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
      .text(d.empresaNombre.toUpperCase(), infoX, y, { width: infoW });

    let iy = y + 20;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    if (d.empresaDireccion) {
      const dir = d.empresaDireccion +
        (d.empresaCiudad ? ', ' + d.empresaCiudad : '') + '.';
      doc.text(dir, infoX, iy, { width: infoW }); iy += 11;
    }
    if (d.empresaEmail)    { doc.text('Correo: '    + d.empresaEmail,    infoX, iy, { width: infoW }); iy += 11; }
    if (d.empresaTelefono) { doc.text('Teléfono: '  + d.empresaTelefono, infoX, iy, { width: infoW }); iy += 11; }
    if (d.empresaSitioWeb) { doc.text(d.empresaSitioWeb, infoX, iy, { width: infoW }); iy += 11; }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
      .text('RNC: ' + d.empresaRNC, infoX, iy);

    const leftBottom = Math.max(y + 52, iy + 14);

    // ── ENCABEZADO DERECHO: e-NCF + folio + tipo + fecha ─────────────────────

    const rightW = 205;
    const rightX = PR - rightW;
    let ry = y;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
      .text('FACTURA ELECTRÓNICA', rightX, ry, { width: rightW, align: 'right' });
    ry += 13;

    if (d.ecfNumero) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('e-NCF:', rightX, ry, { width: rightW, align: 'right' }); ry += 11;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
        .text(d.ecfNumero, rightX, ry, { width: rightW, align: 'right' }); ry += 17;
    }

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16)
      .text(d.numero, rightX, ry, { width: rightW, align: 'right' }); ry += 21;

    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5);
    doc.text('Fecha emisión: ' + fmtF(d.fechaEmision), rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    if (d.fechaVencimiento) {
      doc.text('Vence: ' + fmtF(d.fechaVencimiento), rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    }
    doc.text('Tipo: ' + d.tipo, rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    if (d.vendedorNombre) {
      doc.text('Vendedor: ' + d.vendedorNombre, rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    }

    // Badge ORIGINAL / e-CF estado
    const estadoLbl = d.esOriginal ? 'ORIGINAL' : 'COPIA';
    const badgeW    = 70;
    const badgeX    = PR - badgeW;
    ry += 2;
    doc.roundedRect(badgeX, ry, badgeW, 18, 4).fill(THEAD);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
      .text(estadoLbl, badgeX, ry + 4, { width: badgeW, align: 'center' });
    ry += 22;

    y = Math.max(leftBottom, ry) + 14;

    // ── SEPARADOR ────────────────────────────────────────────────────────────

    doc.rect(PL, y, W, 3).fill(DARK);
    y += 12;

    // ── DATOS DEL CLIENTE ────────────────────────────────────────────────────

    const cliLines: string[] = [];
    if (d.clienteRNC) cliLines.push('RNC o Cédula: ' + d.clienteRNC);
    cliLines.push('Nombre o Razón Social: ' + d.clienteNombre);
    if (d.clienteDireccion) {
      cliLines.push(d.clienteDireccion +
        (d.clienteCiudad ? ', ' + d.clienteCiudad : ''));
    }
    const ctLine = [
      d.clienteTelefono ? 'Tel. ' + d.clienteTelefono : '',
      d.clienteEmail ?? '',
    ].filter(Boolean).join('  ');
    if (ctLine) cliLines.push(ctLine);

    const cliBoxH = 20 + cliLines.length * 13 + 6;
    doc.rect(PL, y, W, cliBoxH).stroke('#aaaaaa');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
      .text('DATOS DEL COMPRADOR', PL + 10, y + 8);
    let py = y + 20;
    for (const line of cliLines) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(10)
        .text(line, PL + 10, py, { width: W - 20 }); py += 13;
    }
    y += cliBoxH + 10;

    // ── TABLA DE ÍTEMS ───────────────────────────────────────────────────────

    const hasCode = d.items.some(i => i.codigo);
    const descW   = W - 24 - (hasCode ? 55 : 0) - 55 - 42 - 88 - 75 - 85;
    const cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[] = [
      { label: '#',          width: 24,                      align: 'center' },
      ...(hasCode ? [{ label: 'Código',   width: 55, align: 'left' as const }] : []),
      { label: 'Descripción',width: descW,                   align: 'left'   },
      { label: 'Cant.',      width: 55,                      align: 'right'  },
      { label: 'Ud.',        width: 42,                      align: 'center' },
      { label: 'P. Unit.',   width: 88,                      align: 'right'  },
      { label: 'ITBIS %',    width: 75,                      align: 'center' },
      { label: 'Total',      width: 85,                      align: 'right'  },
    ];

    // Cabecera
    doc.rect(PL, y, W, 20).fill(THEAD);
    let hx = PL;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    for (const col of cols) {
      doc.text(col.label.toUpperCase(), hx + 2, y + 5, {
        width: col.width - 4, align: col.align,
      });
      hx += col.width;
    }
    y += 20;

    // Filas
    for (let idx = 0; idx < d.items.length; idx++) {
      const item = d.items[idx];
      if (y + 20 > PH - 90) { doc.addPage(); y = 40; }
      const bg = idx % 2 === 0 ? '#ffffff' : LGRAY;
      doc.rect(PL, y, W, 20).fill(bg)
        .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      const cells: { text: string; width: number; align: 'left' | 'right' | 'center' }[] = [
        { text: String(item.numero),             width: 24,    align: 'center' },
        ...(hasCode ? [{ text: item.codigo ?? '', width: 55, align: 'left' as const }] : []),
        { text: item.descripcion,                width: descW, align: 'left'   },
        { text: String(item.cantidad),           width: 55,    align: 'right'  },
        { text: item.unidadMedida ?? 'UN',       width: 42,    align: 'center' },
        { text: fmtM(item.precioUnitario),       width: 88,    align: 'right'  },
        { text: item.itbisPct + '%',             width: 75,    align: 'center' },
        { text: fmtM(item.total),                width: 85,    align: 'right'  },
      ];

      let rx = PL;
      for (const cell of cells) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
          .text(cell.text, rx + 2, y + 5, {
            width: cell.width - 4, align: cell.align, ellipsis: true,
          });
        rx += cell.width;
      }
      y += 20;
    }
    y += 10;

    // ── TOTALES + QR ─────────────────────────────────────────────────────────

    // QR (izquierda inferior)
    const qrSize = 80;
    let qrDrawn  = false;
    if (d.qrBase64) {
      try {
        const qrBuf = Buffer.from(d.qrBase64, 'base64');
        doc.image(qrBuf, PL, y, { width: qrSize, height: qrSize });
        qrDrawn = true;
      } catch { /* continuar sin QR si falla */ }
    }

    // Totales (derecha)
    const totW = 265;
    const totX = PR - totW;

    const totRows: Array<[string, number, boolean]> = [];
    if (d.subtotalGravado > 0) totRows.push(['Subtotal Gravado', d.subtotalGravado, false]);
    if (d.subtotalExento  > 0) totRows.push(['Subtotal Exento',  d.subtotalExento,  false]);
    totRows.push(['ITBIS (18%)',   d.itbisTotal,   false]);
    totRows.push(['TOTAL GENERAL', d.totalGeneral, true]);

    let ty = y;
    for (let i = 0; i < totRows.length; i++) {
      const [lbl, val, isBold] = totRows[i];
      if (i < totRows.length - 1) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(10)
          .text(lbl + ':', totX, ty, { width: 135 });
        doc.fillColor(DARK).font('Helvetica').fontSize(10)
          .text(fmtM(val), totX + 135, ty, { width: totW - 135, align: 'right' });
        doc.moveTo(totX, ty + 14).lineTo(PR, ty + 14)
          .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
        doc.lineWidth(1);
        ty += 15;
      } else {
        ty += 4;
        doc.moveTo(totX, ty).lineTo(PR, ty).strokeColor(DARK).lineWidth(2).stroke();
        doc.lineWidth(1); ty += 7;
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
          .text(String(lbl) + ':', totX, ty, { width: 135 });
        doc.font('Helvetica-Bold').fontSize(15).fillColor(DARK)
          .text(fmtM(val), totX + 130, ty - 1, { width: totW - 130, align: 'right' });
        ty += 22;
      }
    }

    // Monto en letras
    if (d.montoEnLetras) {
      ty += 4;
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('Son: ' + d.montoEnLetras, totX, ty, { width: totW, align: 'right' });
      ty += 12;
    }

    y = Math.max(ty, y + (qrDrawn ? qrSize + 10 : 0)) + 10;

    // ── NOTAS ────────────────────────────────────────────────────────────────

    if (d.notas) {
      const nh = Math.max(36, doc.heightOfString(d.notas, { width: W - 20 }) + 24);
      doc.rect(PL, y, 3, nh).fill('#dddddd');
      doc.fillColor('#777777').font('Helvetica-Bold').fontSize(8).text('NOTAS', PL + 8, y + 5);
      doc.fillColor('#555555').font('Helvetica').fontSize(9)
        .text(d.notas, PL + 8, y + 17, { width: W - 20 });
      y += nh + 10;
    }

    // ECF info footer box
    if (d.ecfNumero || d.ecfFechaFirma) {
      const ecfLines = [
        d.ecfNumero       ? 'e-NCF: ' + d.ecfNumero               : null,
        d.ecfTipo         ? 'Tipo NCF: ' + d.ecfTipo               : null,
        d.ecfFechaFirma   ? 'Firma digital: ' + fmtF(d.ecfFechaFirma) : null,
        d.ecfFechaVigencia? 'Secuencia válida hasta: ' + fmtF(d.ecfFechaVigencia) : null,
      ].filter(Boolean) as string[];

      const ecfH = 12 + ecfLines.length * 11 + 8;
      doc.rect(PL, y, W, ecfH).fill('#f8fafc').stroke('#e2e8f0');
      let ey = y + 8;
      for (const line of ecfLines) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(8)
          .text(line, PL + 10, ey, { width: W - 20 }); ey += 11;
      }
      y += ecfH + 8;
    }

    // ── PIE DE PÁGINA ────────────────────────────────────────────────────────

    const footerY = PH - 48;
    doc.moveTo(PL, footerY).lineTo(PR, footerY)
      .strokeColor('#dddddd').lineWidth(0.5).stroke();

    const pie = d.empresaPieFactura
      ?? 'Gracias por su preferencia. Este comprobante fiscal es emitido conforme a las normativas de la DGII de la República Dominicana.';
    doc.fillColor('#555555').font('Helvetica').fontSize(8)
      .text(pie, PL, footerY + 8, { width: W, align: 'center' });
    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(7.5)
      .text('Documento generado por HiCloud ERP', PL, footerY + 22, {
        width: W, align: 'center',
      });

    doc.end();
  });
}

// ── Recibo POS térmico (80mm) ────────────────────────────────────────────────

import type { ReciboPOSData } from '../../facturas/templates/recibo-termico.template';

export async function generarReciboPOSPDF(d: ReciboPOSData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // Ancho 58mm en puntos: 58 * 72 / 25.4 ≈ 164pt; usamos 200pt para legibilidad
    const TW  = 200;
    const doc = new PDFDocument({ size: [TW, 800], margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PL = 8;
    const PR = TW - 8;
    const W  = PR - PL;
    let y    = 10;

    const center = (text: string, fontSize: number, font = 'Helvetica', color = '#000') => {
      doc.fillColor(color).font(font).fontSize(fontSize)
        .text(text, PL, y, { width: W, align: 'center' });
      y += fontSize + 3;
    };

    center(d.empresaNombre.toUpperCase(), 11, 'Helvetica-Bold');
    if (d.empresaRNC)     center('RNC: ' + d.empresaRNC,   8);
    if (d.empresaTelefono) center(d.empresaTelefono,        8);
    if (d.empresaWeb)     center(d.empresaWeb,              7);

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#ccc').lineWidth(0.5).stroke(); y += 6;

    center('RECIBO DE COMPRA', 10, 'Helvetica-Bold');
    center(d.numero, 11, 'Helvetica-Bold');
    center(d.fechaHora, 8);
    if (d.vendedor) center('Atendido por: ' + d.vendedor, 7);
    if (d.ecfNumero) center('e-NCF: ' + d.ecfNumero, 7);

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#000').lineWidth(1).stroke(); y += 4;

    // Header items
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(7);
    doc.text('Descripción', PL, y, { width: W * 0.5 });
    doc.text('Cant', PL + W * 0.5, y, { width: W * 0.2, align: 'right' });
    doc.text('Total', PL + W * 0.7, y, { width: W * 0.3, align: 'right' });
    y += 11;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#000').lineWidth(0.5).stroke(); y += 4;

    for (const item of d.items) {
      doc.fillColor('#000').font('Helvetica').fontSize(7);
      doc.text(item.descripcion, PL, y, { width: W * 0.5, ellipsis: true });
      doc.text(String(item.cantidad), PL + W * 0.5, y, { width: W * 0.2, align: 'right' });
      doc.text(fmtM(item.total), PL + W * 0.7, y, { width: W * 0.3, align: 'right' });
      y += 11;
    }

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#000').lineWidth(0.5).stroke(); y += 4;

    const totRow = (lbl: string, val: number, bold = false) => {
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      const size = bold ? 9 : 8;
      doc.fillColor('#000').font(font).fontSize(size);
      doc.text(lbl, PL, y, { width: W * 0.6 });
      doc.text(fmtM(val), PL + W * 0.5, y, { width: W * 0.5, align: 'right' });
      y += size + 4;
    };
    totRow('Subtotal:', d.subtotal);
    totRow('ITBIS:', d.itbis);
    totRow('TOTAL:', d.total, true);

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#ccc').lineWidth(0.5).stroke(); y += 6;

    // QR
    if (d.qrBase64) {
      try {
        const qrBuf = Buffer.from(d.qrBase64, 'base64');
        const qrS   = W * 0.7;
        doc.image(qrBuf, PL + (W - qrS) / 2, y, { width: qrS, height: qrS });
        y += qrS + 6;
      } catch { /* sin QR */ }
    }

    center('¡Gracias por su compra!', 8);
    center('HiCloud ERP', 7, 'Helvetica', '#888');

    // Ajustar altura de página al contenido
    doc.page.height = y + 20;

    doc.end();
  });
}
