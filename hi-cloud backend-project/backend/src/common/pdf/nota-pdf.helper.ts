/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — PDF de Nota de Débito (E33) y Nota de Crédito (E34) con PDFKit
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

function fmtDT(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const fmt = new Intl.DateTimeFormat('es', {
      timeZone: 'America/Santo_Domingo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  } catch { return String(s); }
}

export interface NotaPDFData {
  tipo:                'DEBITO' | 'CREDITO';
  numero:              string;
  fecha:               string;
  tipoNcf:             string;
  ecfNumero?:          string;
  ecfEstado?:          string;
  ecfCodigoSeguridad?: string;
  ecfFechaFirma?:      string;
  qrBase64?:           string;
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
  facturaOriginalFolio?:  string;
  ncfOriginal?:           string;
  codigoModificacion?:    string;   // "3 — Ajuste de montos", etc.
  fechaNcfModificado?:    string;
  fechaVencSecuencia?:    string;   // E33: fecha vencimiento de la secuencia DGII
  motivoConcepto?:        string;   // E33: motivo legible (cargo adicional, flete, etc.)
  items: Array<{
    descripcion:    string;
    cantidad:       number;
    precioUnitario: number;
    porcentajeIva:  number;
    importeIva:     number;
    total:          number;
  }>;
  subtotal:           number;
  iva:                number;
  total:              number;
  descripcionMotivo?: string;
  notas?:             string;
  estado:             string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Generador ─────────────────────────────────────────────────────────────────

export async function generarNotaPDF(d: NotaPDFData): Promise<Buffer> {
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
    const THEAD = '#1a2c5b';
    const GRAY  = '#555555';
    const LGRAY = '#f8f9fa';
    const esDebito = d.tipo === 'DEBITO';
    const tipoLabel = esDebito ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'NOTA DE CRÉDITO ELECTRÓNICA';
    const tipoNcfLbl = esDebito ? 'E33' : 'E34';

    let y = 36;

    // ── ENCABEZADO IZQUIERDO — empresa ────────────────────────────────────────

    const iniciales = (d.empresaNombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    doc.rect(PL, y, 48, 48).fill(THEAD);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text(iniciales, PL, y + 16, { width: 48, align: 'center' });

    const infoX = PL + 56;
    const infoW = 210;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12)
      .text(d.empresaNombre, infoX, y, { width: infoW });

    let iy = y + 18;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY);
    if (d.empresaDireccion) {
      const dir = d.empresaDireccion + (d.empresaCiudad ? ', ' + d.empresaCiudad : '') + '.';
      doc.text(dir, infoX, iy, { width: infoW }); iy += 11;
    }
    if (d.empresaEmail)   { doc.text('Correo: '   + d.empresaEmail,   infoX, iy, { width: infoW }); iy += 11; }
    if (d.empresaTelefono){ doc.text('Teléfono: ' + d.empresaTelefono, infoX, iy, { width: infoW }); iy += 11; }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
      .text('RNC: ' + d.empresaRNC, infoX, iy);

    const leftBottom = Math.max(y + 52, iy + 14);

    // ── ENCABEZADO DERECHO — tipo nota + e-NCF + info ─────────────────────────

    const rightW = 215;
    const rightX = PR - rightW;
    let ry = y;

    doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(9.5)
      .text(tipoLabel, rightX, ry, { width: rightW, align: 'right' });
    ry += 14;

    // e-NCF prominente
    doc.fillColor('#0047AB').font('Helvetica-Bold').fontSize(16)
      .text(d.ecfNumero ?? '—', rightX, ry, { width: rightW, align: 'right' });
    ry += 20;

    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5);
    doc.text('Número interno: ' + d.numero,    rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    doc.text('Tipo NCF: '       + tipoNcfLbl,  rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    doc.text('Fecha: '          + fmtF(d.fecha), rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    if (esDebito && d.fechaVencSecuencia) {
      doc.text('Válida hasta: ' + d.fechaVencSecuencia, rightX, ry, { width: rightW, align: 'right' }); ry += 11;
    }
    ry += 2;

    // Estado badge
    const badgeCfg: Record<string, [string, string]> = {
      emitida:  ['#dcfce7', '#15803d'],
      borrador: ['#fef3c7', '#92400e'],
      anulada:  ['#fee2e2', '#991b1b'],
    };
    const [bgBadge, txBadge] = badgeCfg[d.estado] ?? ['#f1f5f9', '#475569'];
    const badgeLbl = (d.estado ?? '').toUpperCase();
    const bW = Math.max(76, badgeLbl.length * 6 + 22);
    const bX = PR - bW;
    doc.roundedRect(bX, ry, bW, 17, 4).fill(bgBadge);
    doc.fillColor(txBadge).font('Helvetica-Bold').fontSize(8)
      .text(badgeLbl, bX, ry + 4, { width: bW, align: 'center' });
    ry += 22;

    y = Math.max(leftBottom, ry) + 12;

    // ── SEPARADOR ─────────────────────────────────────────────────────────────

    doc.rect(PL, y, W, 2).fill(THEAD);
    y += 10;

    // ── DATOS DEL CLIENTE ─────────────────────────────────────────────────────

    const cliLines: string[] = [];
    if (d.clienteRNC) cliLines.push('RNC o Cédula: ' + d.clienteRNC);
    cliLines.push('Nombre o Razón Social: ' + d.clienteNombre);
    if (d.clienteDireccion) cliLines.push('Dirección: ' + d.clienteDireccion);
    if (d.clienteTelefono)  cliLines.push('Teléfono: '  + d.clienteTelefono);

    const cliBoxH = 18 + cliLines.length * 13 + 6;
    doc.rect(PL, y, W, cliBoxH).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.lineWidth(1);
    doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(7.5)
      .text('DATOS DEL CLIENTE', PL + 10, y + 6);
    let py = y + 18;
    for (const line of cliLines) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text(line, PL + 10, py, { width: W - 20 });
      py += 13;
    }
    y += cliBoxH + 10;

    // ── MODIFICA A — comprobante original ─────────────────────────────────────

    const hasMod = d.facturaOriginalFolio || d.ncfOriginal || d.codigoModificacion || d.descripcionMotivo;
    if (hasMod) {
      const modParts: string[] = [];
      if (d.facturaOriginalFolio) modParts.push('Factura original: '   + d.facturaOriginalFolio);
      if (d.ncfOriginal)          modParts.push('e-NCF modificado: '   + d.ncfOriginal);
      if (d.fechaNcfModificado)   modParts.push('Fecha comprobante: '  + d.fechaNcfModificado);
      if (d.codigoModificacion)   modParts.push('Código modificación: '+ d.codigoModificacion);
      if (d.descripcionMotivo)    modParts.push('Razón: '              + d.descripcionMotivo);

      const modBoxH = 18 + modParts.length * 13 + 6;
      doc.rect(PL, y, W, modBoxH).fillAndStroke('#f8f9fa', '#dddddd');
      doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(7.5)
        .text('MODIFICA A', PL + 10, y + 6);
      let my = y + 18;
      for (const part of modParts) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
          .text(part, PL + 10, my, { width: W - 20 }); my += 13;
      }
      y += modBoxH + 10;
    }

    // ── TABLA DE ÍTEMS ────────────────────────────────────────────────────────

    const NUM_W  = 24;
    const DESC_W = W - NUM_W - 50 - 85 - 60 - 68 - 80;
    const cols: { label: string; width: number; align: 'left' | 'right' | 'center' }[] = [
      { label: '#',          width: NUM_W,  align: 'center' },
      { label: 'Descripción',width: DESC_W, align: 'left'   },
      { label: 'Cant.',      width: 50,     align: 'right'  },
      { label: 'P. Unit.',   width: 85,     align: 'right'  },
      { label: 'ITBIS %',    width: 60,     align: 'center' },
      { label: 'ITBIS',      width: 68,     align: 'right'  },
      { label: 'Total',      width: 80,     align: 'right'  },
    ];

    // Cabecera
    doc.rect(PL, y, W, 18).fill(THEAD);
    let hx = PL;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    for (const col of cols) {
      doc.text(col.label.toUpperCase(), hx + 3, y + 5, { width: col.width - 6, align: col.align });
      hx += col.width;
    }
    y += 18;

    // Filas
    for (let idx = 0; idx < d.items.length; idx++) {
      const item = d.items[idx];
      if (y + 18 > PH - 80) { doc.addPage(); y = 40; }
      const bg = idx % 2 === 0 ? '#ffffff' : LGRAY;
      doc.rect(PL, y, W, 18).fill(bg);
      doc.moveTo(PL, y + 18).lineTo(PR, y + 18).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      const cells: { text: string; width: number; align: 'left' | 'right' | 'center' }[] = [
        { text: String(idx + 1),           width: NUM_W,  align: 'center' },
        { text: item.descripcion,           width: DESC_W, align: 'left'   },
        { text: String(item.cantidad),      width: 50,     align: 'right'  },
        { text: fmtM(item.precioUnitario),  width: 85,     align: 'right'  },
        { text: item.porcentajeIva + '%',   width: 60,     align: 'center' },
        { text: fmtM(item.importeIva),      width: 68,     align: 'right'  },
        { text: fmtM(item.total),           width: 80,     align: 'right'  },
      ];

      let rx = PL;
      for (const cell of cells) {
        doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
          .text(cell.text, rx + 3, y + 5, { width: cell.width - 6, align: cell.align, ellipsis: true });
        rx += cell.width;
      }
      y += 18;
    }
    if (d.items.length === 0) {
      doc.rect(PL, y, W, 20).fill(LGRAY);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Sin ítems registrados', PL, y + 5, { width: W, align: 'center' });
      y += 20;
    }
    y += 12;

    // ── CONCEPTO DE LA NOTA DE DÉBITO ────────────────────────────────────────
    if (esDebito && (d.motivoConcepto || d.descripcionMotivo)) {
      const conceptoLines: string[] = [];
      if (d.motivoConcepto)    conceptoLines.push('Motivo: ' + d.motivoConcepto);
      if (d.descripcionMotivo) conceptoLines.push('Detalle: ' + d.descripcionMotivo);
      const cH = 16 + conceptoLines.length * 13 + 6;
      doc.rect(PL, y, W, cH).fillAndStroke('#fffbeb', '#f59e0b');
      doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(7.5)
        .text('CONCEPTO DE LA NOTA DE DÉBITO', PL + 10, y + 6);
      let cy = y + 18;
      for (const line of conceptoLines) {
        doc.fillColor('#555555').font('Helvetica').fontSize(9.5)
          .text(line, PL + 10, cy, { width: W - 20 }); cy += 13;
      }
      y += cH + 10;
    }

    // ── TOTALES ───────────────────────────────────────────────────────────────

    const totW  = 265;
    const totX  = PR - totW;
    const signo = esDebito ? '+' : '-';

    const addTotalRow = (label: string, valor: number, bold = false, color = DARK) => {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text(label + ':', totX, y, { width: 140 });
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
        .text(fmtM(valor), totX + 140, y, { width: totW - 140, align: 'right' });
      doc.moveTo(totX, y + 14).lineTo(PR, y + 14).strokeColor('#e8e8e8').lineWidth(0.5).stroke();
      doc.lineWidth(1);
      y += 15;
    };

    addTotalRow('Subtotal', d.subtotal);
    addTotalRow('ITBIS (18%)', d.iva, false, '#e07000');

    y += 4;
    doc.moveTo(totX, y).lineTo(PR, y).strokeColor(DARK).lineWidth(1.5).stroke();
    doc.lineWidth(1);
    y += 6;
    const totalLabel = esDebito ? 'TOTAL A COBRAR' : 'TOTAL A ACREDITAR';
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(totalLabel + ':', totX, y, { width: 155 });
    const totalColor = esDebito ? '#1a6e2a' : '#cc1818';
    doc.font('Helvetica-Bold').fontSize(15).fillColor(totalColor)
      .text(signo + fmtM(d.total), totX + 140, y - 1, { width: totW - 140, align: 'right' });
    y += 26;

    // ── NOTAS ─────────────────────────────────────────────────────────────────

    if (d.notas) {
      const nh = Math.max(34, doc.heightOfString(d.notas, { width: W - 20 }) + 22);
      doc.rect(PL, y, 3, nh).fill('#dddddd');
      doc.fillColor('#777777').font('Helvetica-Bold').fontSize(7.5)
        .text('NOTAS', PL + 8, y + 5);
      doc.fillColor('#555555').font('Helvetica').fontSize(8.5)
        .text(d.notas, PL + 8, y + 16, { width: W - 20 });
      y += nh + 10;
    }

    // ── SEGURIDAD FISCAL DGII — QR ────────────────────────────────────────────

    if (d.ecfNumero && (d.qrBase64 || d.ecfCodigoSeguridad)) {
      y += 8;
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#cccccc').lineWidth(1).stroke();
      y += 10;
      doc.fillColor(THEAD).font('Helvetica-Bold').fontSize(9)
        .text('SEGURIDAD FISCAL DGII', PL, y);
      y += 14;

      const QR_SIZE = 82;
      const qrY = y;

      if (d.qrBase64) {
        try {
          const qrBuf = Buffer.from(d.qrBase64, 'base64');
          doc.image(qrBuf, PL, qrY, { width: QR_SIZE, height: QR_SIZE });
        } catch { /* imagen no disponible */ }
      }

      const sx = PL + (d.qrBase64 ? QR_SIZE + 14 : 0);
      const sw = W - (d.qrBase64 ? QR_SIZE + 14 : 0);
      let sy = qrY;

      if (d.ecfCodigoSeguridad) {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(DARK)
          .text(`Código de Seguridad: ${d.ecfCodigoSeguridad}`, sx, sy, { width: sw });
        sy += 13;
      }
      if (d.ecfFechaFirma) {
        doc.fontSize(8).font('Helvetica').fillColor(GRAY)
          .text('Fecha y Hora de Firma:', sx, sy, { width: sw }); sy += 11;
        doc.fontSize(8).font('Helvetica-Bold').fillColor(DARK)
          .text(fmtDT(d.ecfFechaFirma), sx, sy, { width: sw }); sy += 13;
      }
      doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
        .text('La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.', sx, sy, { width: sw });
      sy += 18;
      doc.fontSize(7).fillColor('#888888')
        .text('Escanear para verificar en: ecf.dgii.gov.do', sx, sy, { width: sw });

      y = qrY + QR_SIZE + 12;
    }

    // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────

    const footerY = PH - 36;
    doc.moveTo(PL, footerY).lineTo(PR, footerY).strokeColor('#dddddd').lineWidth(0.5).stroke();
    let pieText: string;
    if (esDebito && d.ncfOriginal) {
      pieText = `Este documento modifica el comprobante ${d.ncfOriginal}. ` +
        `Emitido de acuerdo a la Ley 32-23 y normativa DGII República Dominicana.`;
    } else if (esDebito) {
      pieText = 'Nota de Débito Electrónica (E33) — emitida conforme a normativa DGII República Dominicana';
    } else {
      pieText = 'Nota de Crédito Electrónica (E34) — emitida conforme a normativa DGII República Dominicana';
    }
    doc.fillColor('#666666').font('Helvetica').fontSize(7.5)
      .text(pieText, PL, footerY + 8, { width: W, align: 'center' });

    doc.end();
  });
}
