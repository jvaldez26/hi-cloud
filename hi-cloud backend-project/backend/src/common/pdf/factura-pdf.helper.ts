/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — PDF de Factura Electrónica con PDFKit v4
   Diseño exacto según referencia · A4 · Márgenes ~15mm
   PDFKit se usa en TODOS los PDFs — no se usa Puppeteer/BrowserService
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

function fmtDT(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('/') + ' ' + [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
    ].join(':');
  } catch { return String(s); }
}

function ecfTipoTitulo(tipo?: string): string {
  const map: Record<string, string> = {
    E31: 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
    E32: 'FACTURA DE CONSUMO ELECTRÓNICA',
    E33: 'NOTA DE DÉBITO ELECTRÓNICA',
    E34: 'NOTA DE CRÉDITO ELECTRÓNICA',
    E41: 'COMPRA ELECTRÓNICA',
    E44: 'REGÍMENES ESPECIALES ELECTRÓNICA',
    E45: 'GUBERNAMENTAL ELECTRÓNICA',
    E47: 'PAGOS AL EXTERIOR ELECTRÓNICA',
  };
  return tipo ? (map[tipo] ?? 'FACTURA ELECTRÓNICA') : 'FACTURA ELECTRÓNICA';
}

// ── Generador ────────────────────────────────────────────────────────────────

/**
 * @param d       - datos de la factura
 * @param logoBuf - logo de la empresa descargado como Buffer (opcional)
 */
export async function generarFacturaPDF(
  d: FacturaPDFData,
  logoBuf?: Buffer,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW   = doc.page.width;   // 595.28
    const PH   = doc.page.height;  // 841.89
    const PL   = 42;               // margen izquierdo ≈ 15mm
    const PR   = PW - 42;          // margen derecho
    const W    = PR - PL;          // ancho útil ≈ 511

    const DARK   = '#111111';
    const GRAY   = '#555555';
    const GREEN  = '#16a34a';
    const THEAD  = '#1a3a5c';
    const BORDER = '#cccccc';

    let y = 36;

    // ── ENCABEZADO IZQUIERDO — Logo + datos empresa ──────────────────

    const leftColW = Math.round(W * 0.50);  // ~255
    const iniciales = (d.empresaNombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    let logoH = 0;
    if (logoBuf) {
      try {
        doc.image(logoBuf, PL, y, { fit: [110, 68] });
        logoH = 74;
      } catch {
        // falla la imagen → iniciales
        doc.rect(PL, y, 56, 56).fill(DARK);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18)
          .text(iniciales, PL, y + 19, { width: 56, align: 'center' });
        logoH = 62;
      }
    } else {
      doc.rect(PL, y, 56, 56).fill(DARK);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18)
        .text(iniciales, PL, y + 19, { width: 56, align: 'center' });
      logoH = 62;
    }

    // Nombre empresa (bold MAYÚSCULAS) debajo del logo
    let ly = y + logoH + 4;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
      .text(d.empresaNombre.toUpperCase(), PL, ly, { width: leftColW });
    // BUG1 FIX: usar doc.y después del texto para calcular altura real (maneja wrapping)
    ly = doc.y + 4;

    // Datos de contacto
    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    if (d.empresaDireccion) {
      const dir = 'C/ ' + d.empresaDireccion +
        (d.empresaCiudad ? ', ' + d.empresaCiudad : '') + '.';
      doc.text(dir, PL, ly, { width: leftColW }); ly += 12;
    }
    if (d.empresaEmail)    { doc.text('Correo: '   + d.empresaEmail,    PL, ly, { width: leftColW }); ly += 12; }
    if (d.empresaTelefono) { doc.text('Teléfono: ' + d.empresaTelefono, PL, ly, { width: leftColW }); ly += 12; }
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
      .text('RNC: ' + d.empresaRNC, PL, ly, { width: leftColW });
    const leftBottom = ly + 14;

    // ── ENCABEZADO DERECHO — Tipo doc + NCF + info rows ──────────────

    const rightColW = Math.round(W * 0.46);  // ~235
    const rightColX = PR - rightColW;
    let ry = y;

    // BUG2 FIX: Título del documento — usar ecfTipoDescripcion como fallback si ecfTipo no está mapeado
    const titulo = d.ecfTipo
      ? ecfTipoTitulo(d.ecfTipo)
      : (d.ecfTipoDescripcion?.toUpperCase() ?? 'FACTURA ELECTRÓNICA');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
      .text(titulo, rightColX, ry, { width: rightColW, align: 'right' });
    ry = doc.y + 4;

    // BUG3 FIX: e-NCF siempre visible (con '—' cuando no está asignado aún)
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
      .text('e-NCF:', rightColX, ry, { width: rightColW, align: 'right' });
    ry += 11;
    if (d.ecfNumero) {
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(15)
        .text(d.ecfNumero, rightColX, ry, { width: rightColW, align: 'right' });
      ry += 20;
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('— Pendiente de validación DGII —', rightColX, ry, { width: rightColW, align: 'right' });
      ry += 13;
    }

    // Válida hasta (verde)
    if (d.ecfFechaVigencia) {
      doc.fillColor(GREEN).font('Helvetica').fontSize(9)
        .text('Válida hasta: ' + fmtF(d.ecfFechaVigencia), rightColX, ry, {
          width: rightColW, align: 'right',
        });
      ry += 13;
    }

    // Info rows — label (gray) + valor (bold dark), ambos right-aligned
    const infoRows: Array<[string, string]> = [
      ['Número Factura', d.numero],
      ...(d.vendedorNombre  ? [['Vendedor',       d.vendedorNombre ]  as [string, string]] : []),
      ['Moneda',             d.moneda],
      ['Tipo de Factura',    d.condicionPago ?? d.tipo],
      // Plazo + Vence solo para facturas a crédito
      ...(d.diasCredito && d.diasCredito > 0 ? [['Plazo', `${d.diasCredito} días`] as [string, string]] : []),
      ...(d.fechaVencimiento ? [['Vence',         fmtF(d.fechaVencimiento)] as [string, string]] : []),
      ...(d.sucursalNombre  ? [['Sucursal',        d.sucursalNombre ]  as [string, string]] : []),
      ['Fecha Emisión',      fmtF(d.fechaEmision)],
    ];

    ry += 3;
    const labelColW = Math.round(rightColW * 0.55);
    const valueColW = rightColW - labelColW;
    for (const [label, val] of infoRows) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text(label + ':', rightColX, ry, { width: labelColW, align: 'right' });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
        .text(String(val ?? ''), rightColX + labelColW, ry, { width: valueColW, align: 'right' });
      ry += 13;
    }

    y = Math.max(leftBottom, ry) + 10;

    // ── SEPARADOR negro doble ────────────────────────────────────────

    doc.rect(PL, y, W, 3).fill(DARK);  y += 5;
    doc.rect(PL, y, W, 1).fill(DARK);  y += 12;

    // ── DATOS DEL CLIENTE ────────────────────────────────────────────

    const cliLines: string[] = [];
    if (d.clienteRNC) cliLines.push('RNC o Cédula: ' + d.clienteRNC);
    cliLines.push('Nombre o Razón Social: ' + d.clienteNombre);
    if (d.clienteDireccion) {
      cliLines.push(d.clienteDireccion + (d.clienteCiudad ? ', ' + d.clienteCiudad : ''));
    }
    const cliBoxH = 18 + cliLines.length * 13 + 6;

    doc.rect(PL, y, W, cliBoxH).strokeColor(BORDER).lineWidth(0.75).stroke();
    doc.lineWidth(1);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
      .text('DATOS DEL CLIENTE', PL + 10, y + 6);
    let py = y + 18;
    for (const line of cliLines) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text(line, PL + 10, py, { width: W - 20 }); py += 13;
    }
    y += cliBoxH + 10;

    // ── TABLA DE PRODUCTOS ───────────────────────────────────────────

    // Anchos de columna (% del ancho útil W)
    const rawCols = [
      { label: 'Descripción', pct: 0.35, align: 'left'   as const },
      { label: 'Cant.',       pct: 0.08, align: 'right'  as const },
      { label: 'Precio U.',   pct: 0.13, align: 'right'  as const },
      { label: 'Desc.',       pct: 0.08, align: 'center' as const },
      { label: 'Subtotal',    pct: 0.13, align: 'right'  as const },
      { label: 'ITBIS',       pct: 0.10, align: 'right'  as const },
      { label: 'Total',       pct: 0.13, align: 'right'  as const },
    ];
    // Convertir % a pts; la última columna absorbe los decimales
    const cols = rawCols.map((c, i) => ({
      ...c,
      w: i < rawCols.length - 1
        ? Math.floor(W * c.pct)
        : W - rawCols.slice(0, -1).reduce((s, x) => s + Math.floor(W * x.pct), 0),
    }));

    // Header azul oscuro
    const thH = 22;
    doc.rect(PL, y, W, thH).fill(THEAD);
    let hx = PL;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    for (const col of cols) {
      doc.text(col.label.toUpperCase(), hx + 4, y + 7, {
        width: col.w - 8, align: col.align,
      });
      hx += col.w;
    }
    y += thH;

    // Filas de productos (fondo blanco, borde inferior fino)
    const rowH = 18;
    for (const item of d.items) {
      if (y + rowH > PH - 90) { doc.addPage(); y = 40; }

      doc.rect(PL, y, W, rowH).fill('#ffffff');
      doc.rect(PL, y, W, rowH)
        .strokeColor('#dddddd').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      const descVal  = item.descuentoPct > 0 ? `${item.descuentoPct}%` : '-';
      const itbisVal = item.itbisPct === 0 ? 'EXENTO' : fmtM(item.importeItbis);
      const cells    = [
        item.descripcion.toUpperCase(),
        String(item.cantidad),
        fmtM(item.precioUnitario),
        descVal,
        fmtM(item.subtotal),
        itbisVal,
        fmtM(item.total),
      ];

      let rx = PL;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        const isBold = i === cols.length - 1;  // Total en bold
        doc.fillColor(DARK)
          .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8.5)
          .text(cells[i], rx + 4, y + 5, {
            width: col.w - 8, align: col.align,
            ellipsis: true, lineBreak: false,
          });
        rx += col.w;
      }
      y += rowH;
    }
    y += 10;

    // ── SECCIÓN INFERIOR: QR (38%) + TOTALES (62%) ───────────────────

    const qrBoxW  = Math.round(W * 0.38);
    const gapMid  = 14;
    const totW    = W - qrBoxW - gapMid;
    const totX    = PL + qrBoxW + gapMid;

    // Calcular altura del QR box
    const qrSize  = 100;
    const qrBoxH  = 26 + qrSize + 10
      + (d.ecfCodigoSeguridad ? 28 : 0)
      + (d.ecfFechaFirma      ? 28 : 0)
      + 32; // nota final

    // ── QR BOX ──────────────────────────────────────────────────────
    doc.rect(PL, y, qrBoxW, qrBoxH).strokeColor(BORDER).lineWidth(0.75).stroke();
    doc.lineWidth(1);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
      .text('SEGURIDAD FISCAL DGII', PL, y + 8, { width: qrBoxW, align: 'center' });

    let qy = y + 22;
    const qrX = PL + Math.round((qrBoxW - qrSize) / 2);
    // BUG4 FIX: si qrBase64 falla (excepción o vacío), siempre mostrar placeholder informativo
    let qrDibujado = false;
    if (d.qrBase64) {
      try {
        const qrBuf = Buffer.from(d.qrBase64, 'base64');
        doc.image(qrBuf, qrX, qy, { width: qrSize, height: qrSize });
        qrDibujado = true;
      } catch { /* fallback al placeholder */ }
    }
    if (!qrDibujado) {
      // Placeholder con borde y texto centrado vertical (~40% del alto)
      doc.rect(qrX, qy, qrSize, qrSize).fillAndStroke('#f5f5f5', '#cccccc');
      doc.fillColor('#777').font('Helvetica').fontSize(7.5)
        .text(
          'Comprobante en\nproceso de\nvalidación DGII',
          qrX, qy + Math.round(qrSize * 0.32),
          { width: qrSize, align: 'center', lineGap: 2 },
        );
    }
    qy += qrSize + 8;

    if (d.ecfCodigoSeguridad) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('Código de Seguridad:', PL, qy, { width: qrBoxW, align: 'center' }); qy += 11;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text(d.ecfCodigoSeguridad, PL, qy, { width: qrBoxW, align: 'center' }); qy += 13;
    }

    if (d.ecfFechaFirma) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('Fecha Firma Digital:', PL, qy, { width: qrBoxW, align: 'center' }); qy += 11;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
        .text(fmtDT(d.ecfFechaFirma), PL, qy, { width: qrBoxW, align: 'center' }); qy += 13;
    }

    const nota = 'La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.';
    doc.fillColor('#888').font('Helvetica-Oblique').fontSize(7)
      .text(nota, PL + 6, qy, { width: qrBoxW - 12, align: 'center' });

    // ── TOTALES ──────────────────────────────────────────────────────
    const totals: Array<[string, string]> = [
      ['Subtotal Gravado',   fmtM(d.subtotalGravado)],
      ['Subtotal Exento',    fmtM(d.subtotalExento)],   // siempre visible
      ['Subtotal General',   fmtM(d.subtotalGeneral)],
      ['ITBIS Total (18%)',  fmtM(d.itbisTotal)],
    ];

    const labelW2 = Math.round(totW * 0.57);
    const valueW2 = totW - labelW2;

    let ty = y;
    for (const [label, val] of totals) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text(label + ':', totX, ty, { width: labelW2, align: 'left' });
      doc.fillColor(DARK).font('Helvetica').fontSize(9.5)
        .text(val, totX + labelW2, ty, { width: valueW2, align: 'right' });
      doc.moveTo(totX, ty + 14).lineTo(totX + totW, ty + 14)
        .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
      doc.lineWidth(1);
      ty += 15;
    }

    // Descuento (si aplica)
    if (d.descuentoTotal > 0) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text('Descuento:', totX, ty, { width: labelW2, align: 'left' });
      doc.fillColor(DARK).font('Helvetica').fontSize(9.5)
        .text('-' + fmtM(d.descuentoTotal), totX + labelW2, ty, { width: valueW2, align: 'right' });
      ty += 15;
    }

    // TOTAL GENERAL A PAGAR
    ty += 4;
    doc.moveTo(totX, ty).lineTo(totX + totW, ty)
      .strokeColor(DARK).lineWidth(2).stroke();
    doc.lineWidth(1);
    ty += 8;

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text('TOTAL GENERAL A PAGAR:', totX, ty, { width: labelW2, align: 'left' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13.5)
      .text(fmtM(d.totalGeneral), totX + labelW2, ty - 1, { width: valueW2, align: 'right' });

    y += Math.max(qrBoxH, ty - y + 28) + 10;

    // ── NOTAS ────────────────────────────────────────────────────────

    if (d.notas?.trim()) {
      doc.fontSize(9);
      const nh = Math.max(36, 24 + doc.heightOfString(d.notas, { width: W - 24 }));
      doc.rect(PL, y, 3, nh).fill('#dddddd');
      doc.fillColor('#777').font('Helvetica-Bold').fontSize(8)
        .text('NOTAS', PL + 8, y + 5);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text(d.notas, PL + 8, y + 17, { width: W - 24 });
      y += nh + 10;
    }

    // ── PIE DE PÁGINA ────────────────────────────────────────────────

    const footerY = PH - 50;
    doc.moveTo(PL, footerY).lineTo(PR, footerY)
      .strokeColor('#dddddd').lineWidth(0.5).stroke();

    const pie = d.empresaPieFactura?.trim() || '¡Gracias por su preferencia!';
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(10.5)
      .text(pie, PL, footerY + 7, { width: W, align: 'center' });

    if (d.empresaSitioWeb) {
      doc.fillColor('#777').font('Helvetica').fontSize(8.5)
        .text('Visítanos en: ' + d.empresaSitioWeb, PL, footerY + 21, {
          width: W, align: 'center',
        });
    }

    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(7.5)
      .text('Documento generado por HiCloud ERP',
        PL,
        footerY + (d.empresaSitioWeb ? 33 : 21),
        { width: W, align: 'center' },
      );

    doc.end();
  });
}

// ── Recibo POS térmico (80mm) ────────────────────────────────────────────────

import type { ReciboPOSData } from '../../facturas/templates/recibo-termico.template';

export async function generarReciboPOSPDF(d: ReciboPOSData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
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
    if (d.vendedor)  center('Atendido por: ' + d.vendedor, 7);
    if (d.ecfNumero) center('e-NCF: ' + d.ecfNumero, 7);

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#000').lineWidth(1).stroke(); y += 4;

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
    totRow('ITBIS:',    d.itbis);
    totRow('TOTAL:',    d.total, true);

    y += 4;
    doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#ccc').lineWidth(0.5).stroke(); y += 6;

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

    doc.page.height = y + 20;
    doc.end();
  });
}
