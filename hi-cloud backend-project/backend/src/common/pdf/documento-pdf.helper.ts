/* ──────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Generador PDF para Cotizaciones y Pre-Facturas
   Misma estructura visual que factura-pdf.helper.ts
   Sin sección e-NCF / QR (no son comprobantes fiscales)
   ──────────────────────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(v: number | null | undefined): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtF(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s + (String(s).includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return String(s);
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('/');
  } catch { return String(s); }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocumentoPDFData {
  /** 'COTIZACIÓN' | 'PRE-FACTURA' */
  tipo:              string;
  /** Subtítulo bajo el tipo (ej: "No válida como comprobante fiscal") */
  tipoSub?:          string;
  numero:            string;
  fecha:             string;
  /** Fecha hasta la que es válido el documento */
  fechaVencimiento?: string;
  /** Cantidad de días de validez (solo cotización) */
  validezDias?:      number;
  /** Condiciones de pago / plazo */
  condicionesPago?:  string;
  /** Estado del documento (borrador, enviada, aprobada…) */
  estado?:           string;
  /** Clave de color: 'green' | 'blue' | 'orange' | 'red' | 'purple' */
  estadoColor?:      string;
  // ── Empresa ────────────────────────────────────────────────────────────────
  empresaNombre:     string;
  empresaRNC:        string;
  empresaDireccion:  string;
  empresaCiudad?:    string;
  empresaTelefono?:  string;
  empresaEmail?:     string;
  empresaSitioWeb?:  string;
  /** Texto en el pie de página (se usa empresaPie si existe) */
  empresaPie?:       string;
  // ── Vendedor ───────────────────────────────────────────────────────────────
  vendedorNombre?:   string;
  // ── Cliente ────────────────────────────────────────────────────────────────
  clienteNombre:     string;
  clienteRNC?:       string;
  clienteDireccion?: string;
  clienteCiudad?:    string;
  clienteTelefono?:  string;
  clienteEmail?:     string;
  // ── Ítems ──────────────────────────────────────────────────────────────────
  items:             DocumentoPDFItem[];
  // ── Totales ────────────────────────────────────────────────────────────────
  subtotalGravado:   number;
  subtotalExento:    number;
  subtotalGeneral:   number;
  itbisTotal:        number;
  totalGeneral:      number;
  // ── Extras ─────────────────────────────────────────────────────────────────
  notas?:            string;
  /** Mostrar sección de firma/aceptación al final (solo cotización) */
  mostrarFirma?:     boolean;
}

export interface DocumentoPDFItem {
  descripcion:    string;
  cantidad:       number;
  unidadMedida?:  string;
  precioUnitario: number;
  itbisPct:       number;
  importeItbis:   number;
  subtotal:       number;
  total:          number;
}

// ── Generador ─────────────────────────────────────────────────────────────────

/**
 * Genera un PDF con la misma estructura visual que la Factura Electrónica,
 * adaptado para documentos sin comprobante fiscal (Cotización, Pre-Factura).
 *
 * @param d       Datos del documento
 * @param logoBuf Logo de empresa como Buffer (opcional)
 */
export async function generarDocumentoPDFFactura(
  d: DocumentoPDFData,
  logoBuf?: Buffer,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
    const chunks: Buffer[] = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const PL = 42;
    const PR = PW - 42;
    const W  = PR - PL;          // ~511

    const DARK   = '#111111';
    const GRAY   = '#555555';
    const AMBER  = '#D97706';
    const THEAD  = '#1a3a5c';
    const BORDER = '#cccccc';

    let y = 36;

    // ── LOGO / INICIALES (izquierda) ─────────────────────────────────────────

    const leftColW = Math.round(W * 0.50);
    const iniciales = (d.empresaNombre || 'HC')
      .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    let logoH = 0;
    if (logoBuf) {
      try {
        doc.image(logoBuf, PL, y, { fit: [110, 68] });
        logoH = 74;
      } catch {
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

    // Nombre empresa
    let ly = y + logoH + 4;
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
      .text(d.empresaNombre.toUpperCase(), PL, ly, { width: leftColW });
    ly = doc.y + 4;

    // Datos de contacto empresa
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

    // ── ENCABEZADO DERECHO ───────────────────────────────────────────────────

    const rightColW = Math.round(W * 0.46);
    const rightColX = PR - rightColW;
    let ry = y;

    // Tipo de documento (COTIZACIÓN / PRE-FACTURA)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
      .text(d.tipo, rightColX, ry, { width: rightColW, align: 'right' });
    ry = doc.y + 4;

    // Subtítulo (ej: "No válida como comprobante fiscal")
    if (d.tipoSub) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text(d.tipoSub, rightColX, ry, { width: rightColW, align: 'right' });
      ry = doc.y + 4;
    }

    // Número del documento (grande, estilo e-NCF)
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(15)
      .text(d.numero, rightColX, ry, { width: rightColW, align: 'right' });
    ry = doc.y + 6;

    // Badge de estado (pre-factura y cotización)
    if (d.estado) {
      const BADGE: Record<string, [string, string]> = {
        green:  ['#dcfce7', '#15803d'],
        blue:   ['#dbeafe', '#1d4ed8'],
        orange: ['#fef3c7', '#92400e'],
        red:    ['#fee2e2', '#991b1b'],
        purple: ['#f3e8ff', '#7c3aed'],
      };
      const [bgC, txC] = BADGE[d.estadoColor ?? 'orange'] ?? BADGE.orange;
      const lbl = d.estado.toUpperCase();
      const bW  = Math.max(70, lbl.length * 6 + 20);
      const bX  = PR - bW;
      doc.roundedRect(bX, ry, bW, 16, 3).fill(bgC);
      doc.fillColor(txC).font('Helvetica-Bold').fontSize(8)
        .text(lbl, bX, ry + 3, { width: bW, align: 'center' });
      ry += 22;
    }

    // Validez (ámbar) — solo cotización
    if (d.fechaVencimiento) {
      const validezStr = d.validezDias ? ` (${d.validezDias} días)` : '';
      doc.fillColor(AMBER).font('Helvetica').fontSize(9)
        .text('Válida hasta: ' + fmtF(d.fechaVencimiento) + validezStr,
          rightColX, ry, { width: rightColW, align: 'right' });
      ry += 13;
    }

    // Info rows: label (gris) + valor (bold oscuro), ambos alineados a la derecha
    const infoRows: Array<[string, string]> = [
      ...(d.vendedorNombre  ? [['Vendedor',      d.vendedorNombre]  as [string, string]] : []),
      ...(d.condicionesPago ? [['Cond. de Pago', d.condicionesPago] as [string, string]] : []),
      ['Fecha Emisión',        fmtF(d.fecha)],
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

    // ── SEPARADOR negro doble (igual que factura) ─────────────────────────────

    doc.rect(PL, y, W, 3).fill(DARK); y += 5;
    doc.rect(PL, y, W, 1).fill(DARK); y += 12;

    // ── DATOS DEL CLIENTE ────────────────────────────────────────────────────

    const cliLines: string[] = [];
    if (d.clienteRNC) cliLines.push('RNC o Cédula: ' + d.clienteRNC);
    cliLines.push('Nombre o Razón Social: ' + d.clienteNombre);
    if (d.clienteDireccion) {
      cliLines.push(d.clienteDireccion + (d.clienteCiudad ? ', ' + d.clienteCiudad : ''));
    }
    if (d.clienteTelefono || d.clienteEmail) {
      const ct = [
        d.clienteTelefono ? 'Tel. ' + d.clienteTelefono : '',
        d.clienteEmail    ? d.clienteEmail               : '',
      ].filter(Boolean).join('  ');
      if (ct) cliLines.push(ct);
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

    // ── TABLA DE PRODUCTOS ────────────────────────────────────────────────────
    // Mismas columnas que la factura (sin Descuento — cotizaciones no tienen descuento por línea)

    const rawCols = [
      { label: 'Descripción', pct: 0.34, align: 'left'   as const },
      { label: 'Cant.',       pct: 0.08, align: 'right'  as const },
      { label: 'U/M',         pct: 0.07, align: 'center' as const },
      { label: 'Precio U.',   pct: 0.15, align: 'right'  as const },
      { label: 'Subtotal',    pct: 0.13, align: 'right'  as const },
      { label: 'ITBIS',       pct: 0.10, align: 'right'  as const },
      { label: 'Total',       pct: 0.13, align: 'right'  as const },
    ];
    const cols = rawCols.map((c, i) => ({
      ...c,
      w: i < rawCols.length - 1
        ? Math.floor(W * c.pct)
        : W - rawCols.slice(0, -1).reduce((s, x) => s + Math.floor(W * x.pct), 0),
    }));

    // Header azul oscuro (igual que factura)
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

    // Filas de productos
    const rowH = 18;
    for (const item of d.items) {
      if (y + rowH > PH - 100) { doc.addPage(); y = 40; }

      doc.rect(PL, y, W, rowH).fill('#ffffff');
      doc.rect(PL, y, W, rowH).strokeColor('#dddddd').lineWidth(0.5).stroke();
      doc.lineWidth(1);

      const itbisVal = item.itbisPct === 0 ? 'EXENTO' : fmtM(item.importeItbis);
      const cells = [
        item.descripcion.toUpperCase(),
        String(item.cantidad),
        item.unidadMedida ?? 'UN',
        fmtM(item.precioUnitario),
        fmtM(item.subtotal),
        itbisVal,
        fmtM(item.total),
      ];

      let rx = PL;
      for (let i = 0; i < cols.length; i++) {
        const col    = cols[i];
        const isBold = i === cols.length - 1;
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

    // ── NOTAS (antes de totales, izquierda) ──────────────────────────────────

    if (d.notas?.trim()) {
      doc.fontSize(9);
      const nh = Math.max(36, 24 + doc.heightOfString(d.notas, { width: W - 24 }));
      doc.rect(PL, y, 3, nh).fill('#dddddd');
      doc.fillColor('#777').font('Helvetica-Bold').fontSize(8)
        .text('NOTAS', PL + 8, y + 5);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text(d.notas, PL + 8, y + 17, { width: W - 24 });
      y += nh + 12;
    }

    // ── TOTALES (lado derecho, sin QR) ───────────────────────────────────────
    // Ocupa la mitad derecha del ancho para alinearse visualmente con la factura

    const totW = Math.round(W * 0.55);
    const totX = PR - totW;

    const totals: Array<[string, string]> = [
      ['Subtotal Gravado',  fmtM(d.subtotalGravado)],
      ['Subtotal Exento',   fmtM(d.subtotalExento)],
      ['Subtotal General',  fmtM(d.subtotalGeneral)],
      ['ITBIS Total (18%)', fmtM(d.itbisTotal)],
    ];

    const labelW2 = Math.round(totW * 0.57);
    const valueW2 = totW - labelW2;

    let ty = y;
    for (const [label, val] of totals) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
        .text(label + ':', totX, ty, { width: labelW2, align: 'left' });
      doc.fillColor(DARK).font('Helvetica').fontSize(9.5)
        .text(val, totX + labelW2, ty, { width: valueW2, align: 'right' });
      ty += 14;
    }

    // Línea total
    ty += 4;
    doc.moveTo(totX, ty).lineTo(PR, ty)
      .strokeColor(DARK).lineWidth(2).stroke();
    doc.lineWidth(1);
    ty += 8;

    const totalLabel = d.tipo === 'COTIZACIÓN' ? 'TOTAL COTIZACIÓN:' : 'TOTAL PRE-FACTURA:';
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text(totalLabel, totX, ty, { width: labelW2, align: 'left' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13.5)
      .text(fmtM(d.totalGeneral), totX + labelW2, ty - 1, { width: valueW2, align: 'right' });

    y = ty + 32;

    // ── SECCIÓN DE FIRMA / ACEPTACIÓN (solo cotización) ──────────────────────

    if (d.mostrarFirma) {
      if (y > PH - 150) { doc.addPage(); y = 40; }

      doc.rect(PL, y, W, 84).strokeColor(BORDER).lineWidth(0.75).stroke();
      doc.lineWidth(1);

      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5)
        .text('ACEPTACIÓN DE COTIZACIÓN', PL + 12, y + 10);
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text(
          'Al firmar este documento, el cliente acepta los términos y condiciones de esta cotización. ' +
          'Para aceptar, firme y devuelva este documento o contáctenos a través de los medios indicados.',
          PL + 12, y + 22, { width: W - 24 },
        );

      const lineY = y + 62;
      const sigW  = Math.round((W - 48) / 3);
      const labels = ['Firma del Cliente', 'Fecha de Aceptación', 'Sello de la Empresa'];
      for (let i = 0; i < 3; i++) {
        const lx = PL + 12 + i * (sigW + 12);
        doc.moveTo(lx, lineY).lineTo(lx + sigW, lineY)
          .strokeColor(DARK).lineWidth(0.75).stroke();
        doc.lineWidth(1);
        doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
          .text(labels[i], lx, lineY + 5, { width: sigW, align: 'center' });
      }
      y += 96;
    }

    // ── PIE DE PÁGINA ────────────────────────────────────────────────────────

    const footerY = PH - 50;
    doc.moveTo(PL, footerY).lineTo(PR, footerY)
      .strokeColor('#dddddd').lineWidth(0.5).stroke();

    const pie = d.empresaPie?.trim() || '¡Gracias por su preferencia!';
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
