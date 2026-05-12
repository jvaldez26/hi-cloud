/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template PDF para Nota de Débito (E33) y Nota de Crédito (E34)
   Diseño profesional A4 · Puppeteer HTML → PDF
───────────────────────────────────────────────────────────────────────────── */

export interface NotaPDFData {
  tipo:                'DEBITO' | 'CREDITO';
  numero:              string;
  fecha:               string;
  tipoNcf:             string;
  ecfNumero?:          string;
  ecfEstado?:          string;
  // Empresa
  empresaNombre:       string;
  empresaRNC:          string;
  empresaDireccion:    string;
  empresaCiudad?:      string;
  empresaTelefono?:    string;
  empresaEmail?:       string;
  empresaLogo?:        string;
  empresaColor?:       string;
  // Cliente
  clienteNombre:       string;
  clienteRNC?:         string;
  clienteDireccion?:   string;
  clienteTelefono?:    string;
  clienteEmail?:       string;
  // Documento origen
  facturaOriginalFolio?: string;
  ncfOriginal?:          string;
  // Items
  items: Array<{
    descripcion:    string;
    cantidad:       number;
    precioUnitario: number;
    porcentajeIva:  number;
    importeIva:     number;
    total:          number;
  }>;
  // Totales
  subtotal:   number;
  iva:        number;
  total:      number;
  // Texto
  descripcionMotivo?: string;
  notas?:             string;
  estado:             string;
}

function fmt(v: number): string {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);
}
function fmtFecha(s: string): string {
  try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

export function generarHTMLNota(d: NotaPDFData): string {
  const esDebito = d.tipo === 'DEBITO';
  const color    = d.empresaColor ?? (esDebito ? '#d97706' : '#1a56db');
  const colorLt  = esDebito ? '#fffbeb' : '#eff6ff';
  const tipoLabel = esDebito ? 'NOTA DE DÉBITO' : 'NOTA DE CRÉDITO';
  const tipoSub   = esDebito ? 'Comprobante de Cargo Adicional · E33' : 'Comprobante de Crédito / Devolución · E34';
  const signo     = esDebito ? '+' : '-';
  const estadoBadge = d.estado === 'emitida'  ? `<span style="background:#dcfce7;color:#15803d;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px">EMITIDA</span>`
                   : d.estado === 'borrador' ? `<span style="background:#fef9c3;color:#92400e;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px">BORRADOR</span>`
                   : `<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px">ANULADA</span>`;

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo.startsWith('data:') ? d.empresaLogo : `data:image/jpeg;base64,${d.empresaLogo}`}" style="max-height:60px;max-width:160px;object-fit:contain" />`
    : `<div style="font-size:22px;font-weight:900;color:${color};letter-spacing:-1px">${d.empresaNombre.substring(0,2).toUpperCase()}</div>`;

  const itemRows = d.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:8px 10px;font-size:12px;color:#1e293b">${it.descripcion}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569">${Number(it.cantidad).toLocaleString('es-DO')}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569">${fmt(it.precioUnitario)}</td>
      <td style="padding:8px 10px;text-align:center;font-size:12px;color:#475569">${it.porcentajeIva}%</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569">${fmt(it.importeIva)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:#1e293b">${fmt(it.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#1e293b; background:#fff; font-size:13px; line-height:1.5; }
  .page { width:210mm; min-height:297mm; padding:14mm 14mm 12mm; }
  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
  .header-left { flex:1; }
  .header-right { text-align:right; }
  .doc-type-badge {
    display:inline-block; background:${color}; color:#fff;
    padding:6px 18px; border-radius:6px; font-size:15px; font-weight:800;
    letter-spacing:.5px; margin-bottom:6px;
  }
  .doc-number { font-size:20px; font-weight:900; color:#0f172a; font-family:monospace; }
  .doc-sub { font-size:11px; color:#64748b; margin-top:2px; }
  /* Strip */
  .strip { height:4px; background:${color}; border-radius:2px; margin:16px 0; }
  /* Parties */
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
  .party-box { border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; }
  .party-label { font-size:10px; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:.8px; margin-bottom:6px; }
  .party-name { font-size:14px; font-weight:700; color:#0f172a; margin-bottom:3px; }
  .party-info { font-size:11px; color:#64748b; line-height:1.7; }
  /* Reference box */
  .ref-box { background:${colorLt}; border:1px solid ${color}30; border-left:4px solid ${color}; border-radius:6px; padding:10px 14px; margin-bottom:16px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
  .ref-label { font-size:10px; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:.6px; }
  .ref-value { font-size:13px; font-weight:700; color:#0f172a; font-family:monospace; }
  .ref-encf { font-size:11px; color:#64748b; }
  /* Table */
  .items-table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  .items-table thead tr { background:${color}; }
  .items-table thead th { padding:9px 10px; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
  .items-table thead th:first-child { text-align:left; border-radius:6px 0 0 0; }
  .items-table thead th:last-child  { border-radius:0 6px 0 0; }
  .items-table tbody tr:last-child td { border-bottom:1px solid #e2e8f0; }
  /* Totals */
  .totals-wrap { display:flex; justify-content:flex-end; margin-bottom:16px; }
  .totals-box { min-width:260px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
  .totals-row { display:flex; justify-content:space-between; padding:7px 14px; font-size:12px; }
  .totals-row:nth-child(odd) { background:#f8fafc; }
  .totals-row-total { background:${color}!important; color:#fff; font-weight:800; font-size:14px; padding:10px 14px; display:flex; justify-content:space-between; }
  /* Notes */
  .notes-box { border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:11px; color:#475569; }
  .notes-label { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
  /* Footer */
  .footer { border-top:1px solid #e2e8f0; padding-top:10px; display:flex; justify-content:space-between; align-items:flex-end; }
  .footer-legal { font-size:10px; color:#94a3b8; max-width:340px; line-height:1.5; }
  .ecf-badge { text-align:right; }
  .ecf-num { font-family:monospace; font-size:11px; font-weight:700; color:${color}; }
  .ecf-estado { font-size:10px; color:#64748b; }
  .powered { font-size:9px; color:#cbd5e1; margin-top:4px; }
  .date-info { display:flex; gap:20px; margin-bottom:16px; }
  .date-block { border:1px solid #e2e8f0; border-radius:6px; padding:8px 14px; }
  .date-label { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
  .date-val { font-size:13px; font-weight:700; color:#0f172a; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      <div style="margin-top:8px">
        <div style="font-size:15px;font-weight:800;color:#0f172a">${d.empresaNombre}</div>
        <div style="font-size:11px;color:#64748b">RNC: ${d.empresaRNC}</div>
        ${d.empresaDireccion ? `<div style="font-size:11px;color:#64748b">${d.empresaDireccion}${d.empresaCiudad ? ', ' + d.empresaCiudad : ''}</div>` : ''}
        ${d.empresaTelefono ? `<div style="font-size:11px;color:#64748b">Tel: ${d.empresaTelefono}</div>` : ''}
        ${d.empresaEmail    ? `<div style="font-size:11px;color:#64748b">${d.empresaEmail}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="doc-type-badge">${tipoLabel}</div>
      <div class="doc-number">${d.numero}</div>
      <div class="doc-sub">${tipoSub}</div>
      <div style="margin-top:8px">${estadoBadge}</div>
    </div>
  </div>

  <div class="strip"></div>

  <!-- FECHA -->
  <div class="date-info">
    <div class="date-block">
      <div class="date-label">Fecha de emisión</div>
      <div class="date-val">${fmtFecha(d.fecha)}</div>
    </div>
    <div class="date-block">
      <div class="date-label">Tipo NCF</div>
      <div class="date-val" style="color:${color};font-family:monospace">${d.tipoNcf}</div>
    </div>
    ${d.ecfNumero ? `
    <div class="date-block">
      <div class="date-label">e-CF Emitido</div>
      <div class="date-val" style="font-family:monospace;font-size:12px">${d.ecfNumero}</div>
    </div>` : ''}
  </div>

  <!-- EMISOR / RECEPTOR -->
  <div class="parties">
    <div class="party-box">
      <div class="party-label">Emisor</div>
      <div class="party-name">${d.empresaNombre}</div>
      <div class="party-info">
        RNC: ${d.empresaRNC}<br/>
        ${d.empresaDireccion ?? ''}${d.empresaCiudad ? ', ' + d.empresaCiudad : ''}
        ${d.empresaTelefono ? `<br/>Tel: ${d.empresaTelefono}` : ''}
      </div>
    </div>
    <div class="party-box">
      <div class="party-label">Receptor / Cliente</div>
      <div class="party-name">${d.clienteNombre}</div>
      <div class="party-info">
        ${d.clienteRNC ? `RNC/Cédula: ${d.clienteRNC}<br/>` : ''}
        ${d.clienteDireccion ?? ''}
        ${d.clienteTelefono ? `<br/>Tel: ${d.clienteTelefono}` : ''}
        ${d.clienteEmail    ? `<br/>${d.clienteEmail}` : ''}
      </div>
    </div>
  </div>

  <!-- REFERENCIA A FACTURA ORIGINAL -->
  ${(d.facturaOriginalFolio || d.ncfOriginal) ? `
  <div class="ref-box">
    <div>
      <div class="ref-label">Modifica a</div>
      ${d.facturaOriginalFolio ? `<div class="ref-value">Factura: ${d.facturaOriginalFolio}</div>` : ''}
      ${d.ncfOriginal ? `<div class="ref-encf">eNCF original: ${d.ncfOriginal}</div>` : ''}
    </div>
    ${d.descripcionMotivo ? `
    <div style="border-left:1px solid ${color}30;padding-left:14px">
      <div class="ref-label">Motivo</div>
      <div style="font-size:12px;color:#1e293b">${d.descripcionMotivo}</div>
    </div>` : ''}
  </div>` : ''}

  <!-- TABLA DE ÍTEMS -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="text-align:left;width:38%">Descripción</th>
        <th style="text-align:right;width:9%">Cant.</th>
        <th style="text-align:right;width:14%">Precio Unit.</th>
        <th style="text-align:center;width:9%">ITBIS%</th>
        <th style="text-align:right;width:13%">ITBIS</th>
        <th style="text-align:right;width:17%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">Sin ítems</td></tr>`}
    </tbody>
  </table>

  <!-- TOTALES -->
  <div class="totals-wrap">
    <div class="totals-box">
      <div class="totals-row">
        <span style="color:#64748b">Subtotal</span>
        <span style="font-weight:600">${fmt(d.subtotal)}</span>
      </div>
      <div class="totals-row">
        <span style="color:#64748b">ITBIS (18%)</span>
        <span style="font-weight:600">${fmt(d.iva)}</span>
      </div>
      <div class="totals-row-total">
        <span>${esDebito ? 'Total a Cobrar' : 'Total a Acreditar'}</span>
        <span>${signo}${fmt(d.total)}</span>
      </div>
    </div>
  </div>

  <!-- NOTAS -->
  ${d.notas ? `
  <div class="notes-box">
    <div class="notes-label">Notas</div>
    <div>${d.notas}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-legal">
      ${esDebito
        ? 'Este documento es una Nota de Débito (E33) emitida conforme a la normativa de la DGII de la República Dominicana. Modifica el monto de la factura referenciada aumentándolo.'
        : 'Este documento es una Nota de Crédito (E34) emitida conforme a la normativa de la DGII de la República Dominicana. Modifica el monto de la factura referenciada reduciéndolo.'
      }
      <div class="powered">Generado por HiCloud ERP · hicloud.app</div>
    </div>
    <div class="ecf-badge">
      ${d.ecfNumero ? `
        <div class="ecf-num">${d.ecfNumero}</div>
        <div class="ecf-estado">${d.ecfEstado?.toUpperCase() ?? ''}</div>
      ` : `<div style="font-size:11px;color:#cbd5e1">Sin e-CF emitido</div>`}
    </div>
  </div>

</div>
</body>
</html>`;
}
