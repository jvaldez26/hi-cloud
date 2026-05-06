/* ────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Factura Electrónica PDF
   Diseño profesional único para el mercado dominicano
──────────────────────────────────────────────────────────────────── */

export interface FacturaPDFData {
  // Factura
  numero: string;
  fechaEmision: string;
  tipo: 'CONTADO' | 'CRÉDITO';
  condicionPago?: string;
  notas?: string;
  moneda: string;
  // e-CF
  ecfNumero?: string;
  ecfTipo?: string;
  ecfTipoDescripcion?: string;
  ecfCodigoSeguridad?: string;
  ecfEstadoDGII?: string;
  // Totales
  subtotalGravado: number;
  subtotalExento: number;
  subtotalGeneral: number;
  descuentoTotal: number;
  itbisTotal: number;
  totalGeneral: number;
  montoEnLetras: string;
  // Empresa (emisor)
  empresaNombre: string;
  empresaRNC: string;
  empresaDireccion: string;
  empresaCiudad?: string;
  empresaTelefono?: string;
  empresaEmail?: string;
  empresaSitioWeb?: string;
  empresaLogo?: string;          // URL o base64
  empresaColorPrimario?: string; // hex personalizado
  // Usuario / Sucursal
  vendedorNombre?: string;
  sucursalNombre?: string;
  // Cliente
  clienteNombre: string;
  clienteRNC?: string;
  clienteDireccion?: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  tipoCliente: 'RNC' | 'CEDULA' | 'CONSUMIDOR';
  // Items
  items: FacturaPDFItem[];
  // QR base64
  qrBase64?: string;
}

export interface FacturaPDFItem {
  numero:         number;
  descripcion:    string;
  cantidad:       number;
  precioUnitario: number;
  descuentoPct:   number;
  subtotal:       number;
  itbisPct:       number;
  importeItbis:   number;
  total:          number;
}

// ── Helpers de formato ────────────────────────────────────────────
function money(n: number | undefined | null): string {
  if (n == null) return 'RD$ 0.00';
  return 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(s: string | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return s; }
}

function esc(s?: string): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador principal ───────────────────────────────────────────
export function generarHTMLFactura(d: FacturaPDFData): string {
  const COLOR  = d.empresaColorPrimario || '#1E40AF';
  const DARK   = '#0F172A';
  const LIGHT  = '#F8FAFC';
  const TEXT   = '#1E293B';
  const GRAY   = '#64748B';
  const BLUE   = '#EFF6FF';
  const GREEN  = '#059669';
  const YELLOW = '#FCD34D';

  // Iniciales para logo fallback
  const iniciales = (d.empresaNombre || 'ERP')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" style="height:60px;max-width:200px;object-fit:contain;border-radius:4px;" onerror="this.style.display='none'">`
    : `<div style="width:60px;height:60px;background:${COLOR};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff;font-family:'Inter','Segoe UI',sans-serif;">${iniciales}</div>`;

  // Badge tipo cliente
  const badgeCliente = d.tipoCliente === 'RNC'
    ? `<span style="background:#DBEAFE;color:#1E40AF;font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;letter-spacing:.5px;">CONTRIBUYENTE RNC</span>`
    : d.tipoCliente === 'CEDULA'
    ? `<span style="background:#D1FAE5;color:${GREEN};font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;letter-spacing:.5px;">PERSONA FÍSICA CÉDULA</span>`
    : `<span style="background:#D1FAE5;color:${GREEN};font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;letter-spacing:.5px;">CONSUMIDOR FINAL</span>`;

  // Badge e-CF estado
  const estadoColor = d.ecfEstadoDGII === 'aceptado' ? GREEN : d.ecfEstadoDGII === 'rechazado' ? '#DC2626' : '#D97706';
  const badgeEstado = d.ecfEstadoDGII
    ? `<span style="background:${estadoColor}22;color:${estadoColor};font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;">${(d.ecfEstadoDGII||'').toUpperCase()}</span>`
    : '';

  // Filas de items
  const itemRows = d.items.map((item, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#F8FAFC';
    const descuentoHtml = item.descuentoPct > 0
      ? `<span style="color:#DC2626;font-weight:600;">${item.descuentoPct}%</span>`
      : '<span style="color:#94A3B8;">—</span>';
    const itbisHtml = item.itbisPct === 0
      ? `<span style="color:${GREEN};font-size:9px;font-weight:700;background:#D1FAE5;padding:1px 5px;border-radius:4px;">EXENTO</span>`
      : `<span style="color:#374151;">${item.itbisPct}%</span>`;
    return `
      <tr style="background:${bg};border-bottom:1px solid #E2E8F0;">
        <td style="padding:10px 12px;color:${GRAY};font-size:11px;text-align:center;">${item.numero}</td>
        <td style="padding:10px 12px;font-size:12px;color:${TEXT};font-weight:500;max-width:220px;">${esc(item.descripcion)}</td>
        <td style="padding:10px 12px;font-size:12px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${item.cantidad.toLocaleString('es-DO')}</td>
        <td style="padding:10px 12px;font-size:12px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${money(item.precioUnitario)}</td>
        <td style="padding:10px 12px;text-align:center;">${descuentoHtml}</td>
        <td style="padding:10px 12px;font-size:12px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${money(item.subtotal)}</td>
        <td style="padding:10px 12px;text-align:center;">${itbisHtml}</td>
        <td style="padding:10px 12px;font-size:12px;color:${TEXT};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(item.total)}</td>
      </tr>`;
  }).join('');

  // QR
  const qrHtml = d.qrBase64
    ? `<img src="data:image/png;base64,${d.qrBase64}" style="width:80px;height:80px;" alt="QR DGII">`
    : `<div style="width:80px;height:80px;background:#E2E8F0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;color:${GRAY};text-align:center;">QR<br>DGII</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<title>Factura ${esc(d.numero)} — HiCloud ERP</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', -apple-system, Arial, sans-serif; background: #fff; color: ${TEXT}; font-size: 12px; }
  @page { size: A4; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .page { width: 794px; min-height: 1123px; background: #fff; position: relative; display: flex; flex-direction: column; }
  table { border-collapse: collapse; width: 100%; }
  .mono { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
</style>
</head>
<body>
<div class="page">

  <!-- ═══ FRANJA SUPERIOR COLOR ═══════════════════════════════════════ -->
  <div style="height:6px;background:${COLOR};"></div>

  <!-- ═══ SECCIÓN 1 — HEADER ══════════════════════════════════════════ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px 36px 20px;">

    <!-- Columna izquierda: Empresa -->
    <div style="display:flex;gap:16px;align-items:flex-start;flex:1;">
      ${logoHtml}
      <div>
        <div style="font-size:18px;font-weight:900;color:${DARK};text-transform:uppercase;letter-spacing:-0.3px;line-height:1.2;">${esc(d.empresaNombre)}</div>
        <div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;">
          <span style="font-size:9px;font-weight:700;background:${DARK};color:#fff;padding:2px 8px;border-radius:12px;letter-spacing:.5px;">RNC ${esc(d.empresaRNC)}</span>
        </div>
        <div style="margin-top:6px;font-size:11px;color:${GRAY};line-height:1.7;">
          <div>${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}</div>
          ${d.empresaTelefono ? `<div>📞 ${esc(d.empresaTelefono)}${d.empresaEmail ? '  ·  ✉ ' + esc(d.empresaEmail) : ''}</div>` : ''}
          ${d.empresaSitioWeb ? `<div style="color:${COLOR};">🌐 ${esc(d.empresaSitioWeb)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Columna derecha: Datos factura -->
    <div style="text-align:right;min-width:220px;">
      <div style="display:inline-block;background:${DARK};color:#fff;font-size:10px;font-weight:700;padding:5px 14px;border-radius:20px;letter-spacing:1px;margin-bottom:10px;">FACTURA ELECTRÓNICA</div>
      ${d.ecfNumero ? `
      <div style="font-size:24px;font-weight:900;color:${COLOR};letter-spacing:-1px;font-variant-numeric:tabular-nums;">${esc(d.ecfNumero)}</div>
      <div style="font-size:10px;color:${GRAY};margin-bottom:2px;">${esc(d.ecfTipoDescripcion || d.ecfTipo || '')} ${badgeEstado}</div>
      ` : `<div style="font-size:16px;font-weight:700;color:${GRAY};margin-bottom:6px;">Sin e-CF asignado</div>`}
      <div style="font-size:15px;font-weight:800;color:${DARK};margin-top:4px;">${esc(d.numero)}</div>
      <div style="font-size:11px;color:${GRAY};margin-top:2px;">${date(d.fechaEmision)}</div>
    </div>
  </div>

  <!-- Separador acento -->
  <div style="height:2px;background:linear-gradient(to right, ${COLOR}, ${DARK});margin:0 36px;border-radius:2px;"></div>

  <!-- ═══ SECCIÓN 2 — INFO FISCAL + CLIENTE ═══════════════════════ -->
  <div style="display:flex;gap:16px;padding:18px 36px;">

    <!-- Información de la factura -->
    <div style="flex:1;background:${LIGHT};border-left:3px solid ${COLOR};border-radius:8px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;color:${COLOR};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">📋 Información de la Factura</div>
      ${[
        ['Tipo', d.tipo],
        ['Condición', d.condicionPago || 'Al Contado'],
        ['Moneda', d.moneda || 'DOP — Peso Dominicano'],
        ...(d.vendedorNombre ? [['Vendedor', d.vendedorNombre]] : []),
        ...(d.sucursalNombre  ? [['Sucursal',  d.sucursalNombre]]  : []),
      ].map(([label, valor]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #E2E8F0;">
          <span style="font-size:10px;font-weight:600;color:${GRAY};text-transform:uppercase;letter-spacing:.3px;">${label}</span>
          <span style="font-size:11px;font-weight:700;color:${DARK};">${esc(valor as string)}</span>
        </div>`).join('')}
    </div>

    <!-- Datos del cliente -->
    <div style="flex:1;background:${BLUE};border-left:3px solid #3B82F6;border-radius:8px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;color:#1E40AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">👤 Datos del Cliente</div>
      <div style="margin-bottom:6px;">${badgeCliente}</div>
      ${d.clienteRNC ? `<div style="font-size:10px;color:${GRAY};font-weight:600;margin-top:6px;">RNC / Cédula: <span style="color:${DARK};font-weight:700;">${esc(d.clienteRNC)}</span></div>` : ''}
      <div style="font-size:14px;font-weight:900;color:${DARK};margin-top:6px;line-height:1.3;">${esc(d.clienteNombre)}</div>
      ${d.clienteDireccion ? `<div style="font-size:11px;color:${GRAY};margin-top:4px;">${esc(d.clienteDireccion)}</div>` : ''}
      <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;">
        ${d.clienteTelefono ? `<span style="font-size:10px;color:${GRAY};">📞 ${esc(d.clienteTelefono)}</span>` : ''}
        ${d.clienteEmail    ? `<span style="font-size:10px;color:${GRAY};">✉ ${esc(d.clienteEmail)}</span>` : ''}
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 3 — TABLA DE ITEMS ══════════════════════════════ -->
  <div style="padding:0 36px;flex:1;">
    <table>
      <thead>
        <tr style="background:${DARK};">
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:32px;">#</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:left;">Descripción</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:55px;">Cant.</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Precio Unit.</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:65px;">Dcto.</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Subtotal</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:65px;">ITBIS</th>
          <th style="padding:11px 12px;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <!-- ═══ SECCIÓN 4 — TOTALES ══════════════════════════════════════ -->
  <div style="display:flex;justify-content:flex-end;padding:16px 36px 0;">
    <div style="width:320px;background:${LIGHT};border-radius:8px;padding:16px;">
      ${[
        ['Subtotal Gravado',  money(d.subtotalGravado)],
        ...(d.subtotalExento > 0 ? [['Subtotal Exento', money(d.subtotalExento)]] : []),
        ['Subtotal General',  money(d.subtotalGeneral)],
        ...(d.descuentoTotal > 0 ? [[`Descuento`, `<span style="color:#DC2626;">-${money(d.descuentoTotal)}</span>`]] : []),
        ['ITBIS 18%',         money(d.itbisTotal)],
      ].map(([label, valor]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #CBD5E1;">
          <span style="font-size:11px;color:${GRAY};">${label}</span>
          <span class="mono" style="font-size:12px;font-weight:600;color:${DARK};">${valor}</span>
        </div>`).join('')}

      <!-- Total general -->
      <div style="background:${DARK};border-radius:8px;padding:14px 20px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:700;color:#fff;letter-spacing:.5px;">TOTAL GENERAL</span>
        <span class="mono" style="font-size:18px;font-weight:900;color:#fff;">${money(d.totalGeneral)}</span>
      </div>

      <!-- Monto en letras -->
      <div style="margin-top:8px;font-style:italic;font-size:10px;color:${GRAY};line-height:1.4;text-align:right;">
        ${esc(d.montoEnLetras)}
      </div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 5 — NOTAS + VERIFICACIÓN DGII ═══════════════════ -->
  <div style="display:flex;gap:16px;padding:16px 36px 20px;">

    <!-- Notas -->
    <div style="flex:1;background:#FFFBEB;border:1px solid ${YELLOW};border-radius:8px;padding:14px 16px;min-height:80px;">
      <div style="font-size:10px;font-weight:800;color:#92400E;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📝 Notas</div>
      <div style="font-size:11px;color:#78350F;line-height:1.6;">${esc(d.notas || 'Gracias por su preferencia. Documento emitido en cumplimiento con la Ley 32-23 y normativas DGII.')}</div>
    </div>

    <!-- Verificación DGII -->
    <div style="width:220px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;align-items:center;text-align:center;">
      <div style="font-size:10px;font-weight:800;color:#15803D;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🔒 Verificar en DGII</div>
      ${qrHtml}
      ${d.ecfCodigoSeguridad ? `
      <div style="margin-top:8px;font-size:11px;color:#374151;font-weight:700;letter-spacing:2px;font-variant-numeric:tabular-nums;">${esc(d.ecfCodigoSeguridad)}</div>
      <div style="font-size:9px;color:${GRAY};margin-top:2px;">Código de seguridad</div>
      ` : ''}
      <div style="font-size:9px;color:${GRAY};margin-top:4px;line-height:1.4;">Escanee para verificar<br>en <strong>ecf.dgii.gov.do</strong></div>
    </div>
  </div>

  <!-- ═══ SECCIÓN 6 — FOOTER ══════════════════════════════════════ -->
  <div style="background:${LIGHT};border-top:1px solid #E2E8F0;padding:12px 36px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:11px;color:${GRAY};">
        <span style="font-weight:700;color:${DARK};">¡Gracias por su preferencia!</span>
        ${d.empresaSitioWeb ? `&nbsp;·&nbsp; ${esc(d.empresaSitioWeb)}` : ''}
      </div>
      <div style="text-align:center;font-size:10px;color:${GRAY};">
        <span style="font-weight:700;color:${COLOR};">HiCloud</span> ERP &nbsp;·&nbsp; Generado automáticamente
      </div>
      <div style="font-size:10px;color:${GRAY};text-align:right;">
        Documento válido según<br><strong>Ley 32-23 · DGII República Dominicana</strong>
      </div>
    </div>
  </div>

  <!-- Franja inferior color -->
  <div style="height:6px;background:${COLOR};"></div>

</div>
</body>
</html>`;
}
