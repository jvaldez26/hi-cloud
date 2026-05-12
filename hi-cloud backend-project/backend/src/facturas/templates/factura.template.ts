/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Factura Electrónica
   Diseño profesional para el mercado dominicano · Puppeteer HTML → PDF A4
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
  // QR base64
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
  return 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateFmt(s: string | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch { return s; }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLFactura(d: FacturaPDFData): string {
  const COLOR = d.empresaColorPrimario || '#1E3A8A';
  const DARK  = '#111827';
  const GRAY  = '#6B7280';
  const LGRAY = '#F3F4F6';
  const TEXT  = '#1F2937';
  const GREEN = '#15803D';
  const RED   = '#DC2626';

  // ── Logo ──────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" style="height:72px;max-width:160px;object-fit:contain;" onerror="this.style.display='none'">`
    : `<div style="width:64px;height:64px;background:${COLOR};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;">${iniciales}</div>`;

  // ── Badge ORIGINAL / COPIA ────────────────────────────────────────
  const badgeLabel = d.esOriginal ? 'ORIGINAL' : 'COPIA';
  const badgeColor = d.esOriginal ? COLOR : '#9CA3AF';

  // ── Estado e-CF ───────────────────────────────────────────────────
  const ecfColor = d.ecfEstadoDGII === 'aceptado' ? GREEN
    : d.ecfEstadoDGII === 'rechazado' ? RED
    : '#D97706';

  // ── Filas de items ────────────────────────────────────────────────
  const itemRows = d.items.map((item, i) => {
    const bg = i % 2 === 0 ? '#fff' : LGRAY;
    const itbisLabel = item.itbisPct === 0
      ? `<span style="font-size:9px;background:#D1FAE5;color:${GREEN};padding:1px 5px;border-radius:3px;font-weight:700;">EXENTO</span>`
      : `${item.itbisPct}%`;
    return `
      <tr style="background:${bg};border-bottom:1px solid #E5E7EB;">
        <td style="padding:8px 10px;font-size:10px;color:${GRAY};font-family:monospace;white-space:nowrap;">${esc(item.codigo ?? '')}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};font-weight:500;max-width:200px;">${esc(item.descripcion)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${Number(item.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 10px;font-size:10px;color:${GRAY};text-align:center;">${esc(item.unidadMedida ?? 'UN')}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${money(item.precioUnitario)}</td>
        <td style="padding:8px 10px;font-size:10px;text-align:center;color:${GRAY};">${itbisLabel}</td>
        <td style="padding:8px 10px;font-size:11px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(item.total)}</td>
      </tr>`;
  }).join('');

  // ── QR / ECF block ────────────────────────────────────────────────
  const ecfAceptado = ['aceptado'].includes(d.ecfEstadoDGII ?? '');
  const sinEcf      = !d.ecfNumero;

  const qrBlock = d.qrBase64
    ? `<img src="data:image/png;base64,${d.qrBase64}" style="width:100px;height:100px;display:block;margin:0 auto;" alt="QR DGII">`
    : `<div style="width:100px;height:100px;background:#E5E7EB;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;color:${GRAY};text-align:center;margin:0 auto;">QR<br>pendiente</div>`;

  const ecfSection = sinEcf ? `
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">⚠️</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:#92400E;">Comprobante Fiscal Electrónico en proceso</div>
        <div style="font-size:10px;color:#B45309;margin-top:2px;">El e-NCF se actualizará cuando sea aceptado por la DGII.</div>
      </div>
    </div>` : `
    <div style="border:1px solid #D1FAE5;border-radius:8px;background:#F0FDF4;padding:14px 16px;display:flex;gap:16px;align-items:center;">
      <div style="flex-shrink:0;">
        ${qrBlock}
        <div style="font-size:8px;color:${GRAY};text-align:center;margin-top:4px;">Escanear en DGII</div>
      </div>
      <div style="flex:1;">
        <div style="font-size:10px;font-weight:800;color:${GREEN};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🔒 Comprobante Fiscal Electrónico</div>
        <div style="font-size:15px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:-0.5px;">${esc(d.ecfNumero)}</div>
        <div style="font-size:10px;color:${GRAY};margin-top:4px;">${esc(d.ecfTipoDescripcion ?? d.ecfTipo ?? '')}</div>
        ${d.ecfCodigoSeguridad ? `
        <div style="margin-top:6px;">
          <span style="font-size:10px;color:${GRAY};">Código de Seguridad: </span>
          <span style="font-size:11px;font-weight:700;color:${DARK};font-family:monospace;letter-spacing:2px;">${esc(d.ecfCodigoSeguridad)}</span>
        </div>` : ''}
        ${d.ecfEstadoDGII ? `
        <div style="margin-top:6px;">
          <span style="background:${ecfColor}22;color:${ecfColor};font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;">${(d.ecfEstadoDGII).toUpperCase()}</span>
        </div>` : ''}
        <div style="margin-top:8px;font-size:9px;color:${GRAY};">Verifique en: <strong>ecf.dgii.gov.do</strong></div>
      </div>
    </div>`;

  // ── Fila de info de la factura ─────────────────────────────────────
  const infoRows: [string, string][] = [
    ['Fecha',     dateFmt(d.fechaEmision)],
    ['Factura No.', esc(d.numero)],
    ['Tipo e-CF',   esc(d.ecfTipo ? `${d.ecfTipo} — ${d.ecfTipoDescripcion ?? ''}` : '—')],
    ['Tipo Pago',   esc(d.condicionPago ?? d.tipo)],
    ...(d.tipo === 'CRÉDITO' && d.diasCredito ? [['Plazo', `${d.diasCredito} días`] as [string, string]] : []),
    ...(d.fechaVencimiento ? [['Vencimiento', dateFmt(d.fechaVencimiento)] as [string, string]] : []),
    ['Moneda',      esc(d.moneda)],
    ...(d.vendedorNombre ? [['Vendedor', esc(d.vendedorNombre)] as [string, string]] : []),
    ...(d.sucursalNombre  ? [['Sucursal',  esc(d.sucursalNombre)] as [string, string]]  : []),
  ];

  const infoRowsHtml = infoRows.map(([label, val]) => `
    <tr>
      <td style="padding:5px 10px;font-size:10px;font-weight:600;color:${GRAY};text-transform:uppercase;white-space:nowrap;border-bottom:1px solid #E5E7EB;">${label}</td>
      <td style="padding:5px 10px;font-size:11px;font-weight:700;color:${DARK};border-bottom:1px solid #E5E7EB;">${val}</td>
    </tr>`).join('');

  // ── Badge tipo cliente ─────────────────────────────────────────────
  const badgeTipoCliente = d.tipoCliente === 'RNC'
    ? `<span style="background:#DBEAFE;color:#1D4ED8;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;">CONTRIBUYENTE RNC</span>`
    : d.tipoCliente === 'CEDULA'
    ? `<span style="background:#D1FAE5;color:${GREEN};font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;">PERSONA FÍSICA</span>`
    : `<span style="background:#F3F4F6;color:${GRAY};font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;">CONSUMIDOR FINAL</span>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<title>Factura ${esc(d.numero)}</title>
<style>
  *  { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter','Segoe UI',Arial,sans-serif; background:#fff; color:${TEXT}; font-size:12px; }
  @page { size:A4; margin:0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .page { width:794px; min-height:1123px; background:#fff; display:flex; flex-direction:column; }
  table { border-collapse:collapse; width:100%; }
  .mono { font-variant-numeric:tabular-nums; }
</style>
</head>
<body>
<div class="page">

  <!-- ▌ Franja superior color ──────────────────────────────────────── -->
  <div style="height:5px;background:${COLOR};"></div>

  <!-- ▌ SECCIÓN 1: Encabezado ──────────────────────────────────────── -->
  <div style="padding:22px 36px 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">

    <!-- Logo + datos empresa -->
    <div style="display:flex;gap:14px;align-items:flex-start;flex:1;">
      ${logoHtml}
      <div>
        <div style="font-size:16px;font-weight:900;color:${DARK};line-height:1.2;text-transform:uppercase;">${esc(d.empresaNombre)}</div>
        <div style="margin-top:5px;">
          <span style="font-size:9px;font-weight:700;background:${DARK};color:#fff;padding:2px 8px;border-radius:10px;letter-spacing:.5px;">RNC ${esc(d.empresaRNC)}</span>
        </div>
        <div style="margin-top:7px;font-size:10px;color:${GRAY};line-height:1.8;">
          ${d.empresaDireccion ? `<div>${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}</div>` : ''}
          ${d.empresaTelefono  ? `<div>Tel. ${esc(d.empresaTelefono)}</div>` : ''}
          ${d.empresaEmail     ? `<div>${esc(d.empresaEmail)}</div>` : ''}
          ${d.empresaSitioWeb  ? `<div style="color:${COLOR};">${esc(d.empresaSitioWeb)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Título + badge ORIGINAL/COPIA -->
    <div style="text-align:right;flex-shrink:0;min-width:180px;">
      <div style="display:inline-block;border:2px solid ${badgeColor};border-radius:6px;padding:4px 18px;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:900;color:${badgeColor};letter-spacing:2px;">${badgeLabel}</div>
      </div>
      <div style="font-size:11px;font-weight:700;color:${GRAY};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Factura Electrónica</div>
      <div style="font-size:20px;font-weight:900;color:${COLOR};font-family:monospace;letter-spacing:-1px;">${esc(d.numero)}</div>
      <div style="font-size:12px;font-weight:600;color:${DARK};margin-top:4px;">${dateFmt(d.fechaEmision)}</div>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:2px;background:${COLOR};margin:0 36px;"></div>

  <!-- ▌ SECCIÓN 2: Info factura + datos cliente ─────────────────────── -->
  <div style="display:flex;gap:16px;padding:16px 36px;">

    <!-- Datos de la factura -->
    <div style="flex:0 0 240px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <div style="background:${COLOR};padding:7px 12px;">
        <span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.8px;">📋 Datos de la Factura</span>
      </div>
      <table>
        <tbody>${infoRowsHtml}</tbody>
      </table>
    </div>

    <!-- Datos del cliente -->
    <div style="flex:1;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <div style="background:${DARK};padding:7px 12px;">
        <span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.8px;">👤 Cliente</span>
      </div>
      <div style="padding:12px 14px;">
        <div style="margin-bottom:6px;">${badgeTipoCliente}</div>
        <div style="font-size:15px;font-weight:900;color:${DARK};line-height:1.3;margin-top:4px;">${esc(d.clienteNombre)}</div>
        ${d.clienteRNC ? `<div style="font-size:10px;color:${GRAY};margin-top:4px;">RNC / Cédula: <strong style="color:${DARK};">${esc(d.clienteRNC)}</strong></div>` : ''}
        ${d.clienteDireccion ? `<div style="font-size:10px;color:${GRAY};margin-top:4px;">${esc(d.clienteDireccion)}${d.clienteCiudad ? ', ' + esc(d.clienteCiudad) : ''}</div>` : ''}
        <div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap;">
          ${d.clienteTelefono ? `<span style="font-size:10px;color:${GRAY};">Tel. ${esc(d.clienteTelefono)}</span>` : ''}
          ${d.clienteEmail    ? `<span style="font-size:10px;color:${GRAY};">${esc(d.clienteEmail)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- ▌ SECCIÓN 3: Tabla de items ────────────────────────────────────── -->
  <div style="padding:0 36px;flex:1;">
    <table>
      <thead>
        <tr style="background:${DARK};">
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:left;width:70px;">Código</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:left;">Descripción</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:60px;">Cant.</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:45px;">U/M</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Precio Unit.</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:60px;">ITBIS</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ▌ SECCIÓN 4: Totales ────────────────────────────────────────────── -->
  <div style="display:flex;justify-content:flex-end;padding:14px 36px 0;">
    <div style="width:300px;">
      ${[
        ['Subtotal Gravado',  money(d.subtotalGravado),  false],
        ...(d.subtotalExento > 0 ? [['Subtotal Exento', money(d.subtotalExento), false]] : []),
        ...(d.descuentoTotal > 0 ? [['Descuento', `-${money(d.descuentoTotal)}`, false]] : []),
        ['ITBIS 18%',         money(d.itbisTotal),       false],
      ].map(([label, val]) => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E5E7EB;">
          <span style="font-size:11px;color:${GRAY};">${label}</span>
          <span class="mono" style="font-size:11px;font-weight:600;color:${DARK};">${val}</span>
        </div>`).join('')}
      <!-- Total general -->
      <div style="background:${COLOR};border-radius:6px;padding:12px 16px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;font-weight:700;color:#fff;">TOTAL</span>
        <span class="mono" style="font-size:20px;font-weight:900;color:#fff;">${money(d.totalGeneral)}</span>
      </div>
      <div style="margin-top:6px;font-size:9px;color:${GRAY};text-align:right;font-style:italic;line-height:1.4;">${esc(d.montoEnLetras)}</div>
    </div>
  </div>

  <!-- ▌ SECCIÓN 5: e-CF + QR ──────────────────────────────────────────── -->
  <div style="padding:14px 36px 0;">
    ${ecfSection}
  </div>

  <!-- ▌ SECCIÓN 6: Notas ──────────────────────────────────────────────── -->
  ${(d.notas || d.empresaPieFactura) ? `
  <div style="padding:12px 36px 0;">
    <div style="background:#FFFBEB;border-left:3px solid #FCD34D;border-radius:0 6px 6px 0;padding:10px 14px;">
      <div style="font-size:9px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Notas</div>
      <div style="font-size:10px;color:#78350F;line-height:1.6;">${esc(d.notas || d.empresaPieFactura)}</div>
    </div>
  </div>` : ''}

  <!-- ▌ SECCIÓN 7: Firmas ──────────────────────────────────────────────── -->
  <div style="display:flex;gap:0;padding:20px 36px 0;margin-top:auto;">
    ${['ELABORADO POR', 'AUTORIZADO POR', 'RECIBIDO CONFORME'].map((label, i) => `
      <div style="flex:1;text-align:center;padding:0 12px;${i > 0 ? 'border-left:1px solid #E5E7EB;' : ''}">
        <div style="border-bottom:1px solid ${DARK};margin-bottom:6px;height:36px;"></div>
        <div style="font-size:9px;font-weight:700;color:${GRAY};text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        ${i === 0 && d.vendedorNombre ? `<div style="font-size:9px;color:${DARK};margin-top:2px;">${esc(d.vendedorNombre)}</div>` : ''}
        ${i === 2 ? `<div style="font-size:9px;color:${GRAY};margin-top:2px;">Cédula: _______________</div>` : ''}
      </div>`).join('')}
  </div>

  <!-- ▌ Footer ─────────────────────────────────────────────────────────── -->
  <div style="background:${DARK};padding:10px 36px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#9CA3AF;">
      Documento generado electrónicamente · Válido según <strong style="color:#D1D5DB;">Ley 32-23 DGII República Dominicana</strong>
    </div>
    <div style="font-size:9px;color:#6B7280;">
      <strong style="color:${COLOR === '#1E3A8A' ? '#60A5FA' : COLOR};">HiCloud</strong> ERP
    </div>
  </div>

  <!-- Franja inferior -->
  <div style="height:5px;background:${COLOR};"></div>

</div>
</body>
</html>`;
}
