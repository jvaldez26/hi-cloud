/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Cotización PDF  v2
   Mismo diseño que factura: header 2col | sep negro | caja | tabla dark | totales
───────────────────────────────────────────────────────────────────────────── */

export interface CotizacionPDFData {
  // Cotización
  numero:            string;
  fecha:             string;
  fechaVencimiento:  string;
  validezDias:       number;
  condicionesPago?:  string;
  notas?:            string;
  // Empresa
  empresaNombre:     string;
  empresaRNC:        string;
  empresaDireccion:  string;
  empresaCiudad?:    string;
  empresaTelefono?:  string;
  empresaEmail?:     string;
  empresaLogo?:      string;
  empresaColor?:     string;
  // Vendedor
  vendedorNombre?:   string;
  // Cliente
  clienteNombre:     string;
  clienteRNC?:       string;
  clienteDireccion?: string;
  clienteCiudad?:    string;
  clienteTelefono?:  string;
  clienteEmail?:     string;
  // Items
  items:             CotizacionPDFItem[];
  // Totales
  subtotal:          number;
  iva:               number;
  total:             number;
}

export interface CotizacionPDFItem {
  numero:          number;
  codigo?:         string;
  descripcion:     string;
  cantidad:        number;
  unidadMedida?:   string;
  precioUnitario:  number;
  itbisPct:        number;
  subtotal:        number;
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
    const d  = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch { return String(s); }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLCotizacion(d: CotizacionPDFData): string {
  const DARK   = '#111111';
  const THEAD  = '#2d2d2d';
  const GRAY   = '#555555';
  const LGRAY  = '#f5f5f5';
  const BORDER = '#aaaaaa';
  const GREEN  = '#15803D';
  const AMBER  = '#D97706';

  // ── Logo ─────────────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" style="height:68px;max-width:150px;object-fit:contain;display:block;flex-shrink:0;" onerror="this.style.display='none'">`
    : `<div style="width:56px;height:56px;background:${DARK};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0;">${iniciales}</div>`;

  // ── Filas de items ────────────────────────────────────────────────────────
  const itemRows = d.items.map((item, i) => {
    const bg = i % 2 === 0 ? '#fff' : LGRAY;
    const itbisLabel = item.itbisPct === 0
      ? `<span style="font-size:8.5px;background:#D1FAE5;color:${GREEN};padding:1px 4px;border-radius:2px;font-weight:700;">EXENTO</span>`
      : money(item.subtotal * (item.itbisPct / 100));
    return `
      <tr style="background:${bg};border-bottom:1px solid #e8e8e8;">
        <td style="padding:7px 10px;font-size:10px;color:${DARK};">${esc(item.descripcion)}</td>
        <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${Number(item.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
        <td style="padding:7px 8px;font-size:10px;color:${GRAY};text-align:center;">${esc(item.unidadMedida ?? 'UN')}</td>
        <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${money(item.precioUnitario)}</td>
        <td style="padding:7px 8px;font-size:10px;text-align:right;">${itbisLabel}</td>
        <td style="padding:7px 10px;font-size:10px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(item.total)}</td>
      </tr>`;
  }).join('');

  // ── Info derecha del header ───────────────────────────────────────────────
  const infoRows: Array<[string, string]> = [
    ['No. Cotización',  esc(d.numero)],
    ...(d.vendedorNombre ? [['Vendedor', esc(d.vendedorNombre)] as [string, string]] : []),
    ...(d.condicionesPago ? [['Cond. Pago', esc(d.condicionesPago)] as [string, string]] : []),
    ['Fecha Emisión',   dateFmt(d.fecha)],
  ];

  const infoHtml = infoRows.map(([label, val]) =>
    `<div style="display:flex;justify-content:flex-end;gap:6px;font-size:9.5px;line-height:1.85;">
      <span style="color:${GRAY};">${label}:</span>
      <span style="color:${DARK};font-weight:700;">${val}</span>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cotización ${esc(d.numero)}</title>
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
       ENCABEZADO — empresa (izq) · COTIZACIÓN + número (der)
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px;">

    <!-- Izquierda: Logo + empresa -->
    <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
      ${logoHtml}
      <div style="min-width:0;padding-top:2px;">
        <div style="font-size:15px;font-weight:900;color:${DARK};text-transform:uppercase;line-height:1.3;margin-bottom:6px;">${esc(d.empresaNombre)}</div>
        <div style="font-size:9.5px;color:${GRAY};line-height:1.85;">
          ${d.empresaDireccion
            ? `<div>${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}.</div>`
            : ''}
          ${d.empresaEmail    ? `<div>Correo: ${esc(d.empresaEmail)}</div>`   : ''}
          ${d.empresaTelefono ? `<div>Teléfono: ${esc(d.empresaTelefono)}</div>` : ''}
          <div><strong style="color:${DARK};">RNC: ${esc(d.empresaRNC)}</strong></div>
        </div>
      </div>
    </div>

    <!-- Derecha: COTIZACIÓN + número + vigencia + info -->
    <div style="text-align:right;flex-shrink:0;min-width:230px;max-width:260px;">
      <div style="font-size:11px;font-weight:700;color:${DARK};text-transform:uppercase;">COTIZACIÓN</div>
      <div style="font-size:18px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:.5px;margin-top:4px;">${esc(d.numero)}</div>
      <div style="font-size:9.5px;color:${AMBER};margin-top:3px;font-weight:600;">
        Válida hasta: ${dateFmt(d.fechaVencimiento)}
        <span style="font-size:8.5px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:8px;margin-left:4px;">${d.validezDias} días</span>
      </div>
      <div style="margin-top:8px;">${infoHtml}</div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SEPARADOR negro grueso
  ══════════════════════════════════════════════════════════════════ -->
  <div style="height:3px;background:${DARK};margin-bottom:12px;"></div>

  <!-- ══════════════════════════════════════════════════════════════════
       DATOS DEL CLIENTE
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
      ? `<div style="font-size:9.5px;color:#888;margin-top:3px;">${esc(d.clienteDireccion)}${d.clienteCiudad ? ', ' + esc(d.clienteCiudad) : ''}</div>`
      : ''}
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       TABLA DE PRODUCTOS
  ══════════════════════════════════════════════════════════════════ -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr style="background:${THEAD};">
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:left;">Descripción</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:58px;">Cant.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:center;width:45px;">U/M</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:95px;">Precio U.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:88px;">ITBIS</th>
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:95px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="6" style="padding:20px;text-align:center;color:${GRAY};font-style:italic;">Sin ítems</td></tr>`}
    </tbody>
  </table>

  <!-- ══════════════════════════════════════════════════════════════════
       TOTALES
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
    <div style="min-width:260px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">Subtotal:</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${money(d.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">ITBIS (18%):</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${money(d.iva)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:2px solid ${DARK};margin-top:4px;">
        <span style="font-size:12px;font-weight:700;color:${DARK};">TOTAL COTIZACIÓN:</span>
        <span style="font-size:18px;font-weight:900;color:${DARK};font-variant-numeric:tabular-nums;font-family:monospace;">${money(d.total)}</span>
      </div>
    </div>
  </div>

  <!-- NOTAS -->
  ${d.notas ? `
  <div style="padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">Notas</div>
    <div style="font-size:9.5px;color:#555;line-height:1.6;">${esc(d.notas)}</div>
  </div>` : ''}

  <!-- ══════════════════════════════════════════════════════════════════
       SECCIÓN DE ACEPTACIÓN
  ══════════════════════════════════════════════════════════════════ -->
  <div style="border:1px solid #ddd;padding:14px 16px;margin-top:auto;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${GRAY};margin-bottom:8px;">Para aceptar esta cotización</div>
    <div style="font-size:9.5px;color:${GRAY};margin-bottom:14px;">Firme y devuelva este documento o contáctenos a <strong style="color:${DARK};">${esc(d.empresaEmail ?? d.empresaTelefono ?? '')}</strong></div>
    <div style="display:flex;gap:24px;">
      ${['Firma del Cliente', 'Fecha de Aceptación', 'Sello de la Empresa'].map(label => `
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid ${DARK};margin-bottom:5px;height:32px;"></div>
          <div style="font-size:8.5px;font-weight:600;color:${GRAY};text-transform:uppercase;">${label}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       FOOTER
  ══════════════════════════════════════════════════════════════════ -->
  <div style="padding-top:14px;border-top:1px solid #ddd;text-align:center;">
    <div style="font-size:10px;color:#555;">¡Gracias por su preferencia!</div>
    ${d.empresaEmail ? `<div style="font-size:9px;color:#888;margin-top:4px;">${esc(d.empresaEmail)}</div>` : ''}
    <div style="font-size:8.5px;color:#aaa;margin-top:5px;">Documento generado por <strong style="color:#666;">HiCloud ERP</strong></div>
  </div>

</div>
</body>
</html>`;
}
