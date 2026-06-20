/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Factura Electrónica v4
   Diseño exacto según referencia · Puppeteer HTML → PDF A4
   Margen 15 mm · Fuente Arial · Header doble columna · QR DGII
───────────────────────────────────────────────────────────────────────────── */

export interface FacturaPDFData {
  // Factura
  numero:             string;
  // Retenciones (E31)
  aplicaRetenciones?: boolean;
  montoRetencionItbis?: number;
  montoRetencionIsr?:   number;
  netoCobrar?:          number;
  fechaEmision:       string;
  fechaVencimiento?:  string;
  tipo:               'CONTADO' | 'CRÉDITO';
  condicionPago?:     string;
  diasCredito?:       number;
  notas?:             string;
  moneda:             string;
  tipoCambio?:        number;   // tasa de cambio si moneda != DOP
  esOriginal:         boolean;
  // e-CF
  ecfNumero?:          string;
  ecfTipo?:            string;
  ecfTipoDescripcion?: string;
  ecfCodigoSeguridad?: string;
  ecfEstadoDGII?:      string;
  ecfFechaFirma?:      string;   // timestamp firma digital
  ecfFechaVigencia?:   string;   // vencimiento secuencia NCF (de DGII)
  // Empresa (emisor)
  empresaNombre:       string;
  empresaRNC:          string;
  empresaDireccion:    string;
  empresaCiudad?:      string;
  empresaTelefono?:    string;
  empresaEmail?:       string;
  empresaSitioWeb?:    string;
  empresaLogo?:        string;   // URL → se convierte a base64 antes de llamar
  empresaColorPrimario?: string;
  empresaPieFactura?:  string;
  empresaTerminos?:    string;
  // Usuario / Sucursal
  vendedorNombre?:     string;
  sucursalNombre?:     string;
  // Cliente
  clienteNombre:                  string;
  clienteRNC?:                    string;
  clienteIdentificadorExtranjero?: string;  // para E46/E47
  clienteDireccion?:              string;
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
  // QR base64 (generado desde ecf.qrUrl)
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
  descuentoMonto?: number;
  subtotal:        number;
  itbisPct:        number;
  importeItbis:    number;
  total:           number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function moneyWithSimbolo(n: number | undefined | null, simbolo: string): string {
  if (n == null) return `${simbolo} 0.00`;
  return `${simbolo} ` + Number(n).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mapea código ECF → título completo del documento */
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

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLFactura(d: FacturaPDFData): string {
  const simbolo = d.moneda === 'USD' ? 'US$' : d.moneda === 'EUR' ? '€' : 'RD$';
  const money = (n: number | undefined | null) => moneyWithSimbolo(n, simbolo);

  const DARK    = '#111111';
  const GRAY    = '#555555';
  const GREEN   = '#16a34a';
  const BORDER  = '#cccccc';
  const TH_BG   = '#1a3a5c';
  const TH_TEXT = '#ffffff';

  // ── Logo ──────────────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const fallbackLogoHtml =
    `<div style="width:64px;height:64px;background:${DARK};border-radius:6px;` +
    `display:inline-flex;align-items:center;justify-content:center;` +
    `font-size:22px;font-weight:900;color:#fff;margin-bottom:7px;` +
    `font-family:Arial,sans-serif;">${iniciales}</div>`;

  // empresaLogo llega como base64 data URL (desde pdf.service) → nunca falla al cargar.
  // Sin onerror: las dobles comillas en style="..." dentro del atributo onerror="..."
  // corrompían el HTML produciendo el artefacto "VG-'>" en el PDF.
  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" ` +
      `style="max-width:120px;max-height:80px;object-fit:contain;display:block;margin-bottom:7px;" ` +
      `alt="Logo empresa">`
    : fallbackLogoHtml;

  // ── Título del documento ──────────────────────────────────────────────────
  const docTitulo = ecfTipoTitulo(d.ecfTipo);

  // ── Filas info header derecho ─────────────────────────────────────────────
  const infoRowDefs: Array<[string, string]> = [
    ['Número Factura', esc(d.numero)],
    ...(d.vendedorNombre  ? [['Vendedor',        esc(d.vendedorNombre)]  as [string, string]] : []),
    ['Moneda',             esc(d.moneda)],
    ['Tipo de Factura',    esc(d.condicionPago ?? d.tipo)],
    ...(d.diasCredito     ? [['Plazo',            `${d.diasCredito} días`] as [string, string]] : []),
    ...(d.fechaVencimiento? [['Vence',            dateFmt(d.fechaVencimiento)] as [string, string]] : []),
    ...(d.sucursalNombre  ? [['Sucursal',         esc(d.sucursalNombre)]  as [string, string]] : []),
    ['Fecha Emisión',      dateFmt(d.fechaEmision)],
  ];

  // line-height compacto: las filas se ven como bloque, no flotando separadas
  const infoRowsHtml = infoRowDefs.map(([label, val]) =>
    `<div style="display:flex;justify-content:flex-end;gap:6px;font-size:9px;line-height:1.4;margin-bottom:1px;">` +
    `<span style="color:${GRAY};white-space:nowrap;">${label}:</span>` +
    `<span style="color:${DARK};font-weight:700;white-space:nowrap;">${val}</span>` +
    `</div>`
  ).join('');

  // ── Filas de productos ────────────────────────────────────────────────────
  const itemRows = d.items.map(item => {
    const descVal = (item.descuentoMonto ?? 0) > 0
      ? money(item.descuentoMonto!)
      : item.descuentoPct > 0 ? `${item.descuentoPct}%` : '-';
    const itbisVal = item.itbisPct === 0
      ? `<span style="font-size:7.5px;background:#D1FAE5;color:${GREEN};padding:1px 4px;border-radius:2px;font-weight:700;">EXENTO</span>`
      : money(item.importeItbis);
    return (
      `<tr style="background:#fff;border-bottom:1px solid #ddd;">` +
      `<td style="padding:6px 10px;font-size:9px;color:${DARK};text-transform:uppercase;">${esc(item.descripcion)}</td>` +
      `<td style="padding:6px 8px;font-size:9px;color:${DARK};text-align:right;">${Number(item.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>` +
      `<td style="padding:6px 8px;font-size:9px;color:${DARK};text-align:right;">${money(item.precioUnitario)}</td>` +
      `<td style="padding:6px 8px;font-size:9px;color:${DARK};text-align:center;">${descVal}</td>` +
      `<td style="padding:6px 8px;font-size:9px;color:${DARK};text-align:right;">${money(item.subtotal)}</td>` +
      `<td style="padding:6px 8px;font-size:9px;text-align:right;">${itbisVal}</td>` +
      `<td style="padding:6px 10px;font-size:9px;color:${DARK};font-weight:700;text-align:right;">${money(item.total)}</td>` +
      `</tr>`
    );
  }).join('');

  // ── Bloque QR / Seguridad DGII ──────────────────────────────────────────
  // BUG4: Sin recuadro/caja. Si no hay e-NCF → no mostrar nada.
  // Si hay e-NCF → mostrar solo QR + datos de seguridad, sin borde exterior.
  const seguridadHtml = d.ecfNumero
    ? `<div style="text-align:center;padding:8px 0;">` +
      `<div style="font-size:9px;font-weight:700;text-transform:uppercase;` +
      `letter-spacing:.5px;color:${DARK};margin-bottom:6px;">Seguridad Fiscal DGII</div>` +
      (d.qrBase64
        ? `<img src="data:image/png;base64,${d.qrBase64}" ` +
          `style="width:100px;height:100px;display:block;margin:0 auto 6px;" alt="QR DGII">`
        : '') +
      (d.ecfCodigoSeguridad
        ? `<div style="font-size:8.5px;color:${GRAY};margin-top:5px;line-height:1.85;">` +
          `Código de Seguridad:<br>` +
          `<strong style="color:${DARK};font-family:monospace;letter-spacing:1px;">${esc(d.ecfCodigoSeguridad)}</strong>` +
          `</div>`
        : '') +
      (d.ecfFechaFirma
        ? `<div style="font-size:8.5px;color:${GRAY};margin-top:5px;line-height:1.85;">` +
          `Fecha Firma Digital:<br>` +
          `<strong style="color:${DARK};">${dateTimeFmt(d.ecfFechaFirma)}</strong>` +
          `</div>`
        : '') +
      `<div style="font-size:7.5px;color:#888;margin-top:10px;font-style:italic;` +
      `line-height:1.65;padding:0 6px;">` +
      `La validez de este comprobante puede ser verificada mediante el código QR ante la DGII.` +
      `</div>` +
      `</div>`
    : '';

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalesFilas: Array<[string, string]> = [
    ['Subtotal Gravado',   money(d.subtotalGravado)],
    ['Subtotal Exento',    money(d.subtotalExento)],   // siempre visible aunque sea 0
    ['Subtotal General',   money(d.subtotalGeneral)],
    ...(d.descuentoTotal > 0 ? [['Descuento', `-${money(d.descuentoTotal)}`] as [string, string]] : []),
    ['ITBIS Total (18%)',  money(d.itbisTotal)],
    ...(d.aplicaRetenciones && (d.montoRetencionItbis ?? 0) > 0 ? [['(-) Retención ITBIS', `-${money(d.montoRetencionItbis)}`] as [string, string]] : []),
    ...(d.aplicaRetenciones && (d.montoRetencionIsr ?? 0) > 0   ? [['(-) Retención ISR',   `-${money(d.montoRetencionIsr)}`]   as [string, string]] : []),
  ];

  // BUG5: Sin border-bottom entre subtotales — solo la línea antes del TOTAL GENERAL
  const totalesRowsHtml = totalesFilas.map(([label, val]) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">` +
    `<span style="font-size:9.5px;color:${GRAY};">${label}:</span>` +
    `<span style="font-size:9.5px;color:${DARK};">${val}</span>` +
    `</div>`
  ).join('');

  // ── Notas y términos ──────────────────────────────────────────────────────
  const notasHtml = d.notas?.trim()
    ? `<div style="margin-top:14px;padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;">` +
      `<div style="font-size:8px;font-weight:700;color:#777;text-transform:uppercase;margin-bottom:3px;">Notas</div>` +
      `<div style="font-size:9px;color:#555;line-height:1.6;">${esc(d.notas)}</div>` +
      `</div>`
    : '';

  const terminosHtml = d.empresaTerminos?.trim()
    ? `<div style="margin-top:10px;padding:8px 12px;background:#fafafa;border:1px solid #e8e8e8;">` +
      `<div style="font-size:8px;font-weight:700;color:#777;text-transform:uppercase;margin-bottom:3px;">Términos y condiciones</div>` +
      `<div style="font-size:8.5px;color:#666;line-height:1.6;">${esc(d.empresaTerminos)}</div>` +
      `</div>`
    : '';

  // ── Mensaje del footer ────────────────────────────────────────────────────
  const mensajePie = d.empresaPieFactura?.trim() || '¡Gracias por su preferencia!';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${esc(d.numero)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; background:#fff; color:#111; font-size:10px; }
  @page { size:A4; margin:15mm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  table { border-collapse:collapse; width:100%; }
</style>
</head>
<body>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 1: ENCABEZADO — Logo+Empresa (izq) · Tipo doc+NCF (der)
       BUG1+BUG2: tabla en vez de flex; font-size 12px para nombre empresa
       BUG3: e-NCF solo si existe (sin placeholder "—")
  ══════════════════════════════════════════════════════════════════ -->
  <table width="100%" style="border-collapse:collapse;margin-bottom:12px;" cellspacing="0" cellpadding="0">
    <tr>
      <!-- Columna izquierda: Logo arriba, datos empresa abajo -->
      <td width="55%" valign="top" style="padding-right:20px;">
        ${logoHtml}
        <div style="font-size:12px;font-weight:700;color:${DARK};text-transform:uppercase;
                    line-height:1.2;margin-bottom:5px;">${esc(d.empresaNombre)}</div>
        <div style="font-size:9px;color:${GRAY};line-height:1.95;">
          ${d.empresaDireccion
            ? `<div>C/ ${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}.</div>`
            : ''}
          ${d.empresaEmail
            ? `<div>Correo: ${esc(d.empresaEmail)}</div>`
            : ''}
          ${d.empresaTelefono
            ? `<div>Teléfono: ${esc(d.empresaTelefono)}</div>`
            : ''}
          <div style="color:${DARK};font-weight:700;font-size:9.5px;margin-top:1px;">RNC: ${esc(d.empresaRNC)}</div>
        </div>
      </td>
      <!-- Columna derecha: tipo documento + e-NCF (solo si existe) + info rows -->
      <td width="45%" valign="top" style="text-align:right;">
        <div style="font-size:10px;font-weight:700;color:${DARK};text-transform:uppercase;
                    line-height:1.4;margin-bottom:5px;">${docTitulo}</div>
        ${d.ecfNumero
          ? `<div style="margin-bottom:2px;">` +
            `<span style="font-size:9.5px;color:${GRAY};">e-NCF: </span>` +
            `<span style="font-size:16px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:1px;">${esc(d.ecfNumero)}</span>` +
            `</div>` +
            (d.ecfFechaVigencia
              ? `<div style="font-size:8.5px;color:${GREEN};margin-bottom:7px;">Válida hasta: ${dateFmt(d.ecfFechaVigencia)}</div>`
              : '<div style="height:7px;"></div>')
          : '<div style="height:7px;"></div>'}
        ${infoRowsHtml}
      </td>
    </tr>
  </table>

  <!-- ══════════════════════════════════════════════════════════════════
       SEPARADOR negro doble grueso
  ══════════════════════════════════════════════════════════════════ -->
  <div style="height:3px;background:#111;margin-bottom:2px;"></div>
  <div style="height:1px;background:#111;margin-bottom:14px;"></div>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 2: DATOS DEL CLIENTE
  ══════════════════════════════════════════════════════════════════ -->
  <div style="border:1px solid ${BORDER};padding:9px 14px;margin-bottom:14px;">
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;
                letter-spacing:.5px;color:${DARK};margin-bottom:5px;">Datos del Cliente</div>
    <div style="font-size:9.5px;color:${GRAY};margin-bottom:2px;">
      RNC o Cédula: <strong style="color:${DARK};font-family:monospace;">${esc(d.clienteRNC || '—')}</strong>
    </div>
    <div style="font-size:9.5px;color:${GRAY};margin-bottom:2px;">
      Nombre o Razón Social: <strong style="color:${DARK};">${esc(d.clienteNombre)}</strong>
    </div>
    ${d.clienteIdentificadorExtranjero
      ? `<div style="font-size:8.5px;color:${GRAY};margin-bottom:1px;">ID Extranjero: <strong style="color:${DARK};font-family:monospace;">${esc(d.clienteIdentificadorExtranjero)}</strong></div>`
      : ''}
    ${d.clienteDireccion?.trim()
      ? `<div style="font-size:8.5px;color:#888;margin-top:2px;">${esc(d.clienteDireccion.trim())}${d.clienteCiudad ? ', ' + esc(d.clienteCiudad) : ''}</div>`
      : ''}
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 3: TABLA DE PRODUCTOS
  ══════════════════════════════════════════════════════════════════ -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr style="background:${TH_BG};">
        <th style="padding:8px 10px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:left;width:35%;">Descripción</th>
        <th style="padding:8px 8px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:right;width:8%;">Cant.</th>
        <th style="padding:8px 8px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:right;width:13%;">Precio U.</th>
        <th style="padding:8px 8px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:center;width:8%;">Desc.</th>
        <th style="padding:8px 8px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:right;width:13%;">Subtotal</th>
        <th style="padding:8px 8px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:right;width:10%;">ITBIS</th>
        <th style="padding:8px 10px;font-size:8px;font-weight:700;color:${TH_TEXT};
                   text-transform:uppercase;text-align:right;width:13%;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 4: SEGURIDAD DGII (38%, solo si hay e-NCF) + TOTALES
       BUG4: columna QR solo se muestra cuando hay e-NCF
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:20px;">

    <!-- Izquierda: Seguridad Fiscal DGII (solo si hay e-NCF) -->
    ${seguridadHtml ? `<div style="width:38%;flex-shrink:0;">${seguridadHtml}</div>` : ''}

    <!-- Derecha: totales -->
    <div style="flex:1;">
      ${totalesRowsHtml}
      <!-- TOTAL GENERAL A PAGAR -->
      <div style="display:flex;justify-content:space-between;align-items:baseline;
                  padding:8px 0;border-top:2px solid ${DARK};margin-top:3px;">
        <span style="font-size:11px;font-weight:700;color:${DARK};">TOTAL GENERAL A PAGAR:</span>
        <span style="font-size:14px;font-weight:900;color:${DARK};
                     font-family:monospace;">${money(d.totalGeneral)}</span>
      </div>
      ${d.aplicaRetenciones && (d.netoCobrar ?? 0) > 0
        ? `<div style="display:flex;justify-content:space-between;align-items:baseline;
                padding:6px 0;border-top:2px solid #059669;margin-top:2px;">
            <span style="font-size:11px;font-weight:700;color:#059669;">NETO A COBRAR (después de retenciones):</span>
            <span style="font-size:14px;font-weight:900;color:#059669;font-family:monospace;">${money(d.netoCobrar)}</span>
           </div>`
        : ''}
      ${d.montoEnLetras
        ? `<div style="font-size:7.5px;color:#888;text-align:right;font-style:italic;margin-top:3px;">${esc(d.montoEnLetras)}</div>`
        : ''}
      ${d.moneda !== 'DOP' && d.tipoCambio && d.tipoCambio > 1
        ? `<div style="font-size:7.5px;color:#888;text-align:right;margin-top:4px;">` +
          `Tasa de cambio: RD$ ${Number(d.tipoCambio).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} por ${d.moneda} 1` +
          `</div>`
        : ''}
    </div>
  </div>

  ${notasHtml}
  ${terminosHtml}

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN 5: FOOTER
  ══════════════════════════════════════════════════════════════════ -->
  <div style="margin-top:20px;padding-top:12px;border-top:1px solid #ddd;text-align:center;">
    <div style="font-size:11px;font-weight:600;color:#333;">${esc(mensajePie)}</div>
    ${d.empresaSitioWeb
      ? `<div style="font-size:8.5px;color:#777;margin-top:5px;">Visítanos en: ${esc(d.empresaSitioWeb)}</div>`
      : ''}
    <div style="font-size:8px;color:#aaa;margin-top:5px;">
      Documento generado por <strong style="color:#666;">HiCloud ERP</strong>
    </div>
  </div>

</body>
</html>`;
}
