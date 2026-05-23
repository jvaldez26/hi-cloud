/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Factura Electrónica v3
   Diseño exacto según referencia · Puppeteer HTML → PDF A4
───────────────────────────────────────────────────────────────────────────── */

export interface FacturaPDFData {
  // Factura
  numero:             string;
  fechaEmision:       string;
  fechaVencimiento?:  string;
  tipo:               'CONTADO' | 'CRÉDITO';
  condicionPago?:     string;
  diasCredito?:       number;
  notas?:             string;
  moneda:             string;
  esOriginal:         boolean;
  // e-CF
  ecfNumero?:          string;
  ecfTipo?:            string;
  ecfTipoDescripcion?: string;
  ecfCodigoSeguridad?: string;
  ecfEstadoDGII?:      string;
  ecfFechaFirma?:      string;   // Fecha firma digital MSeller (timestamp)
  ecfFechaVigencia?:   string;   // Fecha vencimiento secuencia NCF (de DGII)
  // Empresa (emisor)
  empresaNombre:       string;
  empresaRNC:          string;
  empresaDireccion:    string;
  empresaCiudad?:      string;
  empresaTelefono?:    string;
  empresaEmail?:       string;
  empresaSitioWeb?:    string;
  empresaLogo?:        string;
  empresaColorPrimario?: string;
  empresaPieFactura?:  string;
  empresaTerminos?:    string;
  // Usuario / Sucursal
  vendedorNombre?:     string;
  sucursalNombre?:     string;
  // Cliente
  clienteNombre:       string;
  clienteRNC?:         string;
  clienteDireccion?:   string;
  clienteCiudad?:      string;
  clienteTelefono?:    string;
  clienteEmail?:       string;
  tipoCliente:         'RNC' | 'CEDULA' | 'CONSUMIDOR';
  // Items
  items:               FacturaPDFItem[];
  // Totales
  subtotalGravado:     number;
  subtotalExento:      number;
  subtotalGeneral:     number;
  descuentoTotal:      number;
  itbisTotal:          number;
  totalGeneral:        number;
  montoEnLetras:       string;
  // QR base64 (generado desde ecf.qrUrl de MSeller — CodigoSeguridadNCF real)
  qrBase64?:           string;
}

export interface FacturaPDFItem {
  numero:          number;
  codigo?:         string;
  descripcion:     string;
  cantidad:        number;
  unidadMedida?:   string;
  precioUnitario:  number;
  descuentoPct:    number;
  subtotal:        number;
  itbisPct:        number;
  importeItbis:    number;
  total:           number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(n: number | undefined | null): string {
  if (n == null) return 'RD$ 0.00';
  return 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateFmt(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch { return String(s); }
}

function dateTimeFmt(s: string | undefined | null): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, '0');
    const min  = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch { return String(s); }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mapea código ECF → título completo del documento */
function ecfTipoTitulo(tipo?: string): string {
  const map: Record<string, string> = {
    E31: 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
    E32: 'FACTURA DE CONSUMO ELECTRÓNICA',
    E33: 'NOTA DE DÉBITO ELECTRÓNICA',
    E34: 'NOTA DE CRÉDITO ELECTRÓNICA',
    E41: 'COMPROBANTE DE COMPRAS ELECTRÓNICO',
    E44: 'REGÍMENES ESPECIALES ELECTRÓNICO',
    E45: 'GUBERNAMENTAL ELECTRÓNICO',
    E47: 'COMPROBANTE PARA GASTOS MENORES ELECTRÓNICO',
  };
  return tipo ? (map[tipo] ?? 'FACTURA ELECTRÓNICA') : 'FACTURA ELECTRÓNICA';
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLFactura(d: FacturaPDFData): string {
  const DARK  = '#111111';
  const GRAY  = '#555555';
  const LGRAY = '#f5f5f5';
  const GREEN = '#15803D';
  const BORDER= '#aaaaaa';

  // ── Logo ──────────────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" style="height:70px;max-width:150px;object-fit:contain;display:block;flex-shrink:0;" onerror="this.style.display='none'">`
    : `<div style="width:60px;height:60px;background:${DARK};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;flex-shrink:0;">${iniciales}</div>`;

  // ── Título del documento ──────────────────────────────────────────────────
  const docTitulo = ecfTipoTitulo(d.ecfTipo);

  // ── Filas info (columna derecha del header) ───────────────────────────────
  const infoRows: Array<[string, string]> = [
    ['Número Factura', esc(d.numero)],
    ...(d.vendedorNombre ? [['Vendedor',       esc(d.vendedorNombre)] as [string, string]] : []),
    ['Moneda',          esc(d.moneda)],
    ['Tipo de Factura', esc(d.condicionPago ?? d.tipo)],
    ...(d.sucursalNombre ? [['Sucursal',        esc(d.sucursalNombre)] as [string, string]] : []),
    ['Fecha Emisión',   dateFmt(d.fechaEmision)],
  ];

  const infoRowsHtml = infoRows.map(([label, val]) =>
    `<div style="display:flex;justify-content:flex-end;gap:6px;font-size:9.5px;line-height:1.85;">
      <span style="color:${GRAY};">${label}:</span>
      <span style="color:${DARK};font-weight:700;">${val}</span>
    </div>`
  ).join('');

  // ── Filas de productos ────────────────────────────────────────────────────
  const itemRows = d.items.map((item, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : LGRAY;
    const descVal = item.descuentoPct > 0
      ? `${item.descuentoPct}%`
      : `<span style="color:#bbb;">-</span>`;
    const itbisVal = item.itbisPct === 0
      ? `<span style="font-size:8.5px;background:#D1FAE5;color:${GREEN};padding:1px 4px;border-radius:2px;font-weight:700;">EXENTO</span>`
      : money(item.importeItbis);
    return `
      <tr style="background:${bg};border-bottom:1px solid #e8e8e8;">
        <td style="padding:7px 10px;font-size:10px;color:${DARK};">${esc(item.descripcion)}</td>
        <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${Number(item.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
        <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${money(item.precioUnitario)}</td>
        <td style="padding:7px 8px;font-size:10px;color:${GRAY};text-align:right;">${descVal}</td>
        <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${money(item.subtotal)}</td>
        <td style="padding:7px 8px;font-size:10px;text-align:right;">${itbisVal}</td>
        <td style="padding:7px 10px;font-size:10px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(item.total)}</td>
      </tr>`;
  }).join('');

  // ── Bloque QR / Seguridad DGII ────────────────────────────────────────────
  const qrImgHtml = d.qrBase64
    ? `<img src="data:image/png;base64,${d.qrBase64}" style="width:120px;height:120px;display:block;margin:8px auto;" alt="QR DGII">`
    : `<div style="width:120px;height:120px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#bbb;text-align:center;margin:8px auto;border:1px solid #ddd;">QR<br>pendiente</div>`;

  const seguridadHtml = `
    <div style="border:1px solid ${BORDER};padding:12px 14px;text-align:center;width:210px;flex-shrink:0;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:2px;">Seguridad Fiscal DGII</div>
      ${qrImgHtml}
      ${d.ecfCodigoSeguridad
        ? `<div style="font-size:9px;color:${GRAY};margin-top:4px;">Código de Seguridad: <strong style="color:${DARK};font-family:monospace;letter-spacing:1px;">${esc(d.ecfCodigoSeguridad)}</strong></div>`
        : ''}
      ${d.ecfFechaFirma
        ? `<div style="font-size:9px;color:${GRAY};margin-top:3px;">Fecha Firma Digital: <strong style="color:${DARK};">${dateTimeFmt(d.ecfFechaFirma)}</strong></div>`
        : ''}
      <div style="font-size:8px;color:#888;margin-top:8px;font-style:italic;line-height:1.5;">La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.</div>
    </div>`;

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalesFilas: Array<[string, string]> = [
    ['Subtotal Gravado',  money(d.subtotalGravado)],
    ['Subtotal Exento',   money(d.subtotalExento)],   // siempre visible
    ['Subtotal General',  money(d.subtotalGeneral)],
    ...(d.descuentoTotal > 0 ? [['Descuento', `-${money(d.descuentoTotal)}`] as [string, string]] : []),
    ['ITBIS Total (18%)', money(d.itbisTotal)],
  ];

  const totalesRowsHtml = totalesFilas.map(([label, val]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
      <span style="font-size:10.5px;color:${GRAY};">${label}:</span>
      <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${val}</span>
    </div>`).join('');

  // ── Notas ─────────────────────────────────────────────────────────────────
  const notasHtml = d.notas?.trim() ? `
    <div style="margin-top:12px;padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;">
      <div style="font-size:9px;font-weight:700;color:#777;text-transform:uppercase;margin-bottom:3px;">Notas</div>
      <div style="font-size:9.5px;color:#555;line-height:1.6;">${esc(d.notas)}</div>
    </div>` : '';

  // ── Mensaje del footer (pie de factura o default) ─────────────────────────
  const mensajePie = d.empresaPieFactura?.trim() || '¡Gracias por su preferencia!';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${esc(d.numero)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#fff; color:${DARK}; font-size:11px; }
  @page { size:A4; margin:0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .page { width:794px; min-height:1123px; background:#fff; display:flex; flex-direction:column; padding:28px 36px 24px; }
  table { border-collapse:collapse; width:100%; }
</style>
</head>
<body>
<div class="page">

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 1: ENCABEZADO — logo/empresa (izq) · tipo doc + NCF (der)
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px;">

    <!-- Columna izquierda: Logo + datos empresa -->
    <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
      ${logoHtml}
      <div style="min-width:0;">
        <div style="font-size:15px;font-weight:900;color:${DARK};text-transform:uppercase;line-height:1.3;margin-bottom:6px;">${esc(d.empresaNombre)}</div>
        <div style="font-size:9.5px;color:${GRAY};line-height:1.85;">
          ${d.empresaDireccion
            ? `<div>C/ ${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}.</div>`
            : ''}
          ${d.empresaEmail
            ? `<div>Correo: ${esc(d.empresaEmail)}</div>`
            : ''}
          ${d.empresaTelefono
            ? `<div>Teléfono: ${esc(d.empresaTelefono)}</div>`
            : ''}
          <div><strong style="color:${DARK};">RNC: ${esc(d.empresaRNC)}</strong></div>
        </div>
      </div>
    </div>

    <!-- Columna derecha: tipo documento + e-NCF + vigencia + info -->
    <div style="text-align:right;flex-shrink:0;min-width:230px;max-width:260px;">
      <div style="font-size:10px;font-weight:700;color:${DARK};text-transform:uppercase;line-height:1.4;">${docTitulo}</div>
      <div style="margin-top:5px;">
        <span style="font-size:10px;color:${GRAY};">e-NCF : </span>
        <span style="font-size:16px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:1px;">${esc(d.ecfNumero ?? '—')}</span>
      </div>
      ${d.ecfFechaVigencia
        ? `<div style="font-size:9.5px;color:${GREEN};margin-top:2px;">Válida hasta: ${dateFmt(d.ecfFechaVigencia)}</div>`
        : ''}
      <div style="margin-top:8px;">${infoRowsHtml}</div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SEPARADOR negro grueso
  ══════════════════════════════════════════════════════════════════ -->
  <div style="height:3px;background:${DARK};margin-bottom:12px;"></div>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 2: DATOS DEL CLIENTE
  ══════════════════════════════════════════════════════════════════ -->
  <div style="border:1px solid ${BORDER};padding:10px 14px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:7px;">Datos del Cliente</div>
    <div style="font-size:10.5px;color:${GRAY};margin-bottom:3px;">
      RNC o Cédula: <strong style="color:${DARK};">${esc(d.clienteRNC || '—')}</strong>
    </div>
    <div style="font-size:10.5px;color:${GRAY};">
      Nombre o Razón Social: <strong style="color:${DARK};">${esc(d.clienteNombre)}</strong>
    </div>
    ${d.clienteDireccion
      ? `<div style="font-size:9.5px;color:#888;margin-top:4px;">${esc(d.clienteDireccion)}${d.clienteCiudad ? ', ' + esc(d.clienteCiudad) : ''}</div>`
      : ''}
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 3: TABLA DE PRODUCTOS
  ══════════════════════════════════════════════════════════════════ -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr style="background:#2d2d2d;">
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:left;">Descripción</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:55px;">Cant.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:90px;">Precio U.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:55px;">Desc.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:90px;">Subtotal</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:85px;">ITBIS</th>
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.3px;text-align:right;width:90px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 4: SEGURIDAD DGII (izq) + TOTALES (der)
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;gap:20px;align-items:flex-start;">

    <!-- Izquierda: Seguridad Fiscal DGII -->
    ${seguridadHtml}

    <!-- Derecha: Totales -->
    <div style="flex:1;">
      ${totalesRowsHtml}
      <!-- TOTAL GENERAL A PAGAR -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:2px solid ${DARK};margin-top:4px;">
        <span style="font-size:12px;font-weight:700;color:${DARK};">TOTAL GENERAL A PAGAR:</span>
        <span style="font-size:18px;font-weight:900;color:${DARK};font-variant-numeric:tabular-nums;font-family:monospace;">${money(d.totalGeneral)}</span>
      </div>
      <div style="margin-top:4px;font-size:8.5px;color:#888;text-align:right;font-style:italic;">${esc(d.montoEnLetras)}</div>
    </div>
  </div>

  <!-- Notas -->
  ${notasHtml}

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 5: FOOTER
  ══════════════════════════════════════════════════════════════════ -->
  <div style="margin-top:auto;padding-top:16px;border-top:1px solid #ddd;text-align:center;">
    <div style="font-size:12px;font-weight:600;color:#333;">${esc(mensajePie)}</div>
    ${d.empresaSitioWeb
      ? `<div style="font-size:9px;color:#777;margin-top:5px;">Visítanos en: ${esc(d.empresaSitioWeb)}</div>`
      : ''}
    <div style="font-size:8.5px;color:#aaa;margin-top:5px;">Documento generado por <strong style="color:#666;">HiCloud ERP</strong></div>
  </div>

</div>
</body>
</html>`;
}
