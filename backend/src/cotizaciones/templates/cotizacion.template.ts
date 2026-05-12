/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template de Cotización PDF
   Puppeteer HTML → PDF A4
───────────────────────────────────────────────────────────────────────────── */

export interface CotizacionPDFData {
  // Cotización
  numero:           string;
  fecha:            string;
  fechaVencimiento: string;
  validezDias:      number;
  condicionesPago?: string;
  notas?:           string;
  // Empresa
  empresaNombre:    string;
  empresaRNC:       string;
  empresaDireccion: string;
  empresaCiudad?:   string;
  empresaTelefono?: string;
  empresaEmail?:    string;
  empresaLogo?:     string;
  empresaColor?:    string;
  // Vendedor
  vendedorNombre?:  string;
  // Cliente
  clienteNombre:    string;
  clienteRNC?:      string;
  clienteDireccion?: string;
  clienteCiudad?:   string;
  clienteTelefono?: string;
  clienteEmail?:    string;
  // Items
  items:            CotizacionPDFItem[];
  // Totales
  subtotal:         number;
  iva:              number;
  total:            number;
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

function dateFmt(s: string | undefined): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    const dd   = String(d.getDate()).padStart(2, '0');
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch { return s; }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLCotizacion(d: CotizacionPDFData): string {
  const COLOR = d.empresaColor || '#1E3A8A';
  const DARK  = '#111827';
  const GRAY  = '#6B7280';
  const LGRAY = '#F3F4F6';
  const TEXT  = '#1F2937';
  const GREEN = '#15803D';

  // ── Logo ──────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo}" style="height:72px;max-width:160px;object-fit:contain;" onerror="this.style.display='none'">`
    : `<div style="width:64px;height:64px;background:${COLOR};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;">${iniciales}</div>`;

  // ── Filas de items ────────────────────────────────────────────────
  const itemRows = d.items.map((item, i) => {
    const bg = i % 2 === 0 ? '#fff' : LGRAY;
    const itbisLabel = item.itbisPct === 0
      ? `<span style="font-size:9px;background:#D1FAE5;color:${GREEN};padding:1px 5px;border-radius:3px;font-weight:700;">EXENTO</span>`
      : `${item.itbisPct}%`;
    return `
      <tr style="background:${bg};border-bottom:1px solid #E5E7EB;">
        <td style="padding:8px 10px;font-size:10px;color:${GRAY};font-family:monospace;">${esc(item.codigo ?? '')}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};font-weight:500;">${esc(item.descripcion)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${Number(item.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
        <td style="padding:8px 10px;font-size:10px;color:${GRAY};text-align:center;">${esc(item.unidadMedida ?? 'UN')}</td>
        <td style="padding:8px 10px;font-size:11px;color:${TEXT};text-align:right;font-variant-numeric:tabular-nums;">${money(item.precioUnitario)}</td>
        <td style="padding:8px 10px;font-size:10px;text-align:center;">${itbisLabel}</td>
        <td style="padding:8px 10px;font-size:11px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${money(item.total)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<title>Cotización ${esc(d.numero)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
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

  <!-- Franja superior -->
  <div style="height:5px;background:${COLOR};"></div>

  <!-- ENCABEZADO ──────────────────────────────────────────────────── -->
  <div style="padding:22px 36px 16px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">

    <!-- Logo + empresa -->
    <div style="display:flex;gap:14px;align-items:flex-start;flex:1;">
      ${logoHtml}
      <div>
        <div style="font-size:16px;font-weight:900;color:${DARK};line-height:1.2;text-transform:uppercase;">${esc(d.empresaNombre)}</div>
        <div style="margin-top:5px;">
          <span style="font-size:9px;font-weight:700;background:${DARK};color:#fff;padding:2px 8px;border-radius:10px;letter-spacing:.5px;">RNC ${esc(d.empresaRNC)}</span>
        </div>
        <div style="margin-top:7px;font-size:10px;color:${GRAY};line-height:1.8;">
          ${d.empresaDireccion ? `<div>${esc(d.empresaDireccion)}${d.empresaCiudad ? ', ' + esc(d.empresaCiudad) : ''}</div>` : ''}
          ${d.empresaTelefono ? `<div>Tel. ${esc(d.empresaTelefono)}</div>` : ''}
          ${d.empresaEmail    ? `<div>${esc(d.empresaEmail)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Título COTIZACIÓN -->
    <div style="text-align:right;flex-shrink:0;min-width:190px;">
      <div style="display:inline-block;border:2px solid ${COLOR};border-radius:6px;padding:4px 20px;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:900;color:${COLOR};letter-spacing:2px;">COTIZACIÓN</div>
      </div>
      <div style="font-size:20px;font-weight:900;color:${COLOR};font-family:monospace;letter-spacing:-1px;">${esc(d.numero)}</div>
      <div style="font-size:11px;color:${GRAY};margin-top:6px;">Emitida: <strong style="color:${DARK};">${dateFmt(d.fecha)}</strong></div>
      <div style="font-size:11px;color:${GRAY};margin-top:3px;">Válida hasta: <strong style="color:#D97706;">${dateFmt(d.fechaVencimiento)}</strong>
        <span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:8px;margin-left:4px;">${d.validezDias} días</span>
      </div>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:2px;background:${COLOR};margin:0 36px;"></div>

  <!-- INFO COTIZACIÓN + CLIENTE ───────────────────────────────────── -->
  <div style="display:flex;gap:16px;padding:16px 36px;">

    <!-- Datos cotización -->
    <div style="flex:0 0 220px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <div style="background:${COLOR};padding:7px 12px;">
        <span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.8px;">📋 Datos</span>
      </div>
      <table>
        <tbody>
          ${[
            ['No. Cotización', esc(d.numero)],
            ['Fecha emisión',  dateFmt(d.fecha)],
            ['Válida hasta',   dateFmt(d.fechaVencimiento)],
            ...(d.condicionesPago ? [['Condiciones pago', esc(d.condicionesPago)]] : []),
            ...(d.vendedorNombre  ? [['Vendedor', esc(d.vendedorNombre)]] : []),
          ].map(([label, val]) => `
            <tr>
              <td style="padding:5px 10px;font-size:9px;font-weight:600;color:${GRAY};text-transform:uppercase;border-bottom:1px solid #E5E7EB;white-space:nowrap;">${label}</td>
              <td style="padding:5px 10px;font-size:10px;font-weight:700;color:${DARK};border-bottom:1px solid #E5E7EB;">${val}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- Cliente -->
    <div style="flex:1;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <div style="background:${DARK};padding:7px 12px;">
        <span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.8px;">👤 Cotizado a</span>
      </div>
      <div style="padding:12px 14px;">
        <div style="font-size:15px;font-weight:900;color:${DARK};line-height:1.3;">${esc(d.clienteNombre)}</div>
        ${d.clienteRNC ? `<div style="font-size:10px;color:${GRAY};margin-top:4px;">RNC / Cédula: <strong style="color:${DARK};">${esc(d.clienteRNC)}</strong></div>` : ''}
        ${d.clienteDireccion ? `<div style="font-size:10px;color:${GRAY};margin-top:4px;">${esc(d.clienteDireccion)}${d.clienteCiudad ? ', ' + esc(d.clienteCiudad) : ''}</div>` : ''}
        <div style="display:flex;gap:14px;margin-top:6px;">
          ${d.clienteTelefono ? `<span style="font-size:10px;color:${GRAY};">Tel. ${esc(d.clienteTelefono)}</span>` : ''}
          ${d.clienteEmail    ? `<span style="font-size:10px;color:${GRAY};">${esc(d.clienteEmail)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- TABLA DE ITEMS ──────────────────────────────────────────────── -->
  <div style="padding:0 36px;flex:1;">
    <table>
      <thead>
        <tr style="background:${DARK};">
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:left;width:70px;">Código</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:left;">Descripción</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:60px;">Cant.</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:45px;">U/M</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Precio Unit.</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:center;width:55px;">ITBIS</th>
          <th style="padding:9px 10px;font-size:9px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.5px;text-align:right;width:100px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows || `<tr><td colspan="7" style="padding:20px;text-align:center;color:${GRAY};font-style:italic;">Sin items</td></tr>`}</tbody>
    </table>
  </div>

  <!-- TOTALES ─────────────────────────────────────────────────────── -->
  <div style="display:flex;justify-content:flex-end;padding:14px 36px 0;">
    <div style="width:300px;">
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E5E7EB;">
        <span style="font-size:11px;color:${GRAY};">Subtotal</span>
        <span class="mono" style="font-size:11px;font-weight:600;color:${DARK};">${money(d.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #E5E7EB;">
        <span style="font-size:11px;color:${GRAY};">ITBIS 18%</span>
        <span class="mono" style="font-size:11px;font-weight:600;color:${DARK};">${money(d.iva)}</span>
      </div>
      <div style="background:${COLOR};border-radius:6px;padding:12px 16px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;font-weight:700;color:#fff;">TOTAL</span>
        <span class="mono" style="font-size:20px;font-weight:900;color:#fff;">${money(d.total)}</span>
      </div>
    </div>
  </div>

  <!-- NOTAS ───────────────────────────────────────────────────────── -->
  ${d.notas ? `
  <div style="padding:14px 36px 0;">
    <div style="background:#FFFBEB;border-left:3px solid #FCD34D;border-radius:0 6px 6px 0;padding:10px 14px;">
      <div style="font-size:9px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Notas</div>
      <div style="font-size:10px;color:#78350F;line-height:1.6;">${esc(d.notas)}</div>
    </div>
  </div>` : ''}

  <!-- SECCIÓN DE ACEPTACIÓN ──────────────────────────────────────── -->
  <div style="padding:18px 36px 0;margin-top:auto;">
    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;background:#F9FAFB;">
      <div style="font-size:10px;font-weight:700;color:${GRAY};text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Para aceptar esta cotización</div>
      <div style="font-size:10px;color:${GRAY};margin-bottom:16px;">Firme y devuelva este documento o contáctenos a <strong style="color:${DARK};">${esc(d.empresaEmail ?? d.empresaTelefono ?? '')}</strong></div>
      <div style="display:flex;gap:32px;">
        <div style="flex:1;">
          <div style="border-bottom:1px solid ${DARK};margin-bottom:6px;height:36px;"></div>
          <div style="font-size:9px;font-weight:700;color:${GRAY};text-transform:uppercase;">Firma del cliente</div>
        </div>
        <div style="flex:1;">
          <div style="border-bottom:1px solid ${DARK};margin-bottom:6px;height:36px;"></div>
          <div style="font-size:9px;font-weight:700;color:${GRAY};text-transform:uppercase;">Fecha de aceptación</div>
        </div>
        <div style="flex:1;">
          <div style="border-bottom:1px solid ${DARK};margin-bottom:6px;height:36px;"></div>
          <div style="font-size:9px;font-weight:700;color:${GRAY};text-transform:uppercase;">Sello de la empresa</div>
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER ─────────────────────────────────────────────────────── -->
  <div style="background:${DARK};padding:10px 36px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#9CA3AF;">
      ${esc(d.empresaNombre)} · ${esc(d.empresaDireccion)} · ${d.empresaTelefono ? 'Tel. ' + esc(d.empresaTelefono) : ''}
    </div>
    <div style="font-size:9px;color:#6B7280;">
      <strong style="color:#60A5FA;">HiCloud</strong> ERP · Cotización generada automáticamente
    </div>
  </div>

  <div style="height:5px;background:${COLOR};"></div>

</div>
</body>
</html>`;
}
