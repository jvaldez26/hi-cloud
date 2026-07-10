/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template PDF para Nota de Débito (E33) y Nota de Crédito (E34)  v2
   Mismo diseño que factura: header 2col | sep negro | caja | tabla dark | totales
───────────────────────────────────────────────────────────────────────────── */

export interface NotaPDFData {
  tipo:                'DEBITO' | 'CREDITO';
  numero:              string;
  fecha:               string;
  tipoNcf:             string;
  ecfNumero?:          string;
  ecfEstado?:          string;
  ecfCodigoSeguridad?: string;
  ecfFechaFirma?:      string;   // ISO string — se formatea con fmtDT()
  qrBase64?:           string;   // base64 sin prefijo data:
  fechaVencSecuencia?: string;   // ya formateada "DD/MM/YYYY"
  motivoConcepto?:     string;   // para E33 (ND)
  codigoModificacion?: string;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return 'RD$ ' + (v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtF(s: string): string {
  try {
    const d  = new Date(s + 'T12:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch { return s; }
}

function fmtDT(s?: string): string {
  if (!s) return '—';
  try {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return s;
    const f = new Intl.DateTimeFormat('es', {
      timeZone: 'America/Santo_Domingo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(f.formatToParts(dt).map(x => [x.type, x.value]));
    return `${p['day']}/${p['month']}/${p['year']} ${p['hour']}:${p['minute']}:${p['second']}`;
  } catch { return s; }
}

function esc(s?: string | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarHTMLNota(d: NotaPDFData): string {
  const esDebito  = d.tipo === 'DEBITO';
  const DARK      = '#111111';
  const THEAD     = '#2d2d2d';
  const GRAY      = '#555555';
  const LGRAY     = '#f5f5f5';
  const BORDER    = '#aaaaaa';
  const GREEN     = '#15803D';

  const tipoLabel  = esDebito ? 'NOTA DE DÉBITO ELECTRÓNICA' : 'NOTA DE CRÉDITO ELECTRÓNICA';
  const tipoNcfLbl = esDebito ? 'E33' : 'E34';
  const signo      = esDebito ? '+' : '-';

  // Estado badge
  const estadoBadge = d.estado === 'emitida'
    ? `<span style="background:#dcfce7;color:${GREEN};font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;">EMITIDA</span>`
    : d.estado === 'borrador'
    ? `<span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;">BORRADOR</span>`
    : `<span style="background:#fee2e2;color:#991b1b;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;">ANULADA</span>`;

  // ── Logo ─────────────────────────────────────────────────────────────────
  const iniciales = (d.empresaNombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresaLogo
    ? `<img src="${d.empresaLogo.startsWith('data:') ? d.empresaLogo : d.empresaLogo}" style="height:68px;max-width:150px;object-fit:contain;display:block;flex-shrink:0;" onerror="this.style.display='none'">`
    : `<div style="width:56px;height:56px;background:${DARK};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0;">${iniciales}</div>`;

  // ── Filas de items ────────────────────────────────────────────────────────
  const itemRows = d.items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : LGRAY};border-bottom:1px solid #e8e8e8;">
      <td style="padding:7px 10px;font-size:10px;color:${DARK};">${esc(it.descripcion)}</td>
      <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${Number(it.cantidad).toLocaleString('es-DO')}</td>
      <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${fmt(it.precioUnitario)}</td>
      <td style="padding:7px 8px;font-size:10px;color:${GRAY};text-align:center;">${it.porcentajeIva}%</td>
      <td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${fmt(it.importeIva)}</td>
      <td style="padding:7px 10px;font-size:10px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${fmt(it.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${tipoLabel} ${esc(d.numero)}</title>
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
       ENCABEZADO — empresa (izq) · tipo nota + e-NCF (der)
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

    <!-- Derecha: tipo nota + e-NCF + info -->
    <div style="text-align:right;flex-shrink:0;min-width:230px;max-width:260px;">
      <div style="font-size:10px;font-weight:700;color:${DARK};text-transform:uppercase;line-height:1.35;">${tipoLabel}</div>
      <div style="margin-top:5px;">
        <span style="font-size:10px;color:${GRAY};">e-NCF : </span>
        <span style="font-size:15px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:1px;">${esc(d.ecfNumero ?? '—')}</span>
      </div>
      <div style="margin-top:8px;font-size:9.5px;color:${GRAY};line-height:1.85;text-align:right;">
        <div>Número: <strong style="color:${DARK};">${esc(d.numero)}</strong></div>
        <div>Tipo NCF: <strong style="color:${DARK};font-family:monospace;">${tipoNcfLbl}</strong></div>
        <div>Fecha: <strong style="color:${DARK};">${fmtF(d.fecha)}</strong></div>
        ${d.fechaVencSecuencia ? `<div>Válida hasta: <strong style="color:${DARK};">${esc(d.fechaVencSecuencia)}</strong></div>` : ''}
        ${d.ecfCodigoSeguridad ? `<div>Seg.: <strong style="color:${DARK};font-family:monospace;">${esc(d.ecfCodigoSeguridad)}</strong></div>` : ''}
        ${d.ecfFechaFirma ? `<div>Firmado: <strong style="color:${DARK};">${fmtDT(d.ecfFechaFirma)}</strong></div>` : ''}
        <div style="margin-top:4px;">${estadoBadge}</div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SEPARADOR negro grueso
  ══════════════════════════════════════════════════════════════════ -->
  <div style="height:3px;background:${DARK};margin-bottom:12px;"></div>

  <!-- ══════════════════════════════════════════════════════════════════
       DATOS DEL CLIENTE
  ══════════════════════════════════════════════════════════════════ -->
  <div style="border:1px solid ${BORDER};padding:10px 14px;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:7px;">Datos del Cliente</div>
    <div style="font-size:10.5px;color:${GRAY};margin-bottom:3px;">
      RNC o Cédula: <strong style="color:${DARK};">${esc(d.clienteRNC || '—')}</strong>
    </div>
    <div style="font-size:10.5px;color:${GRAY};">
      Nombre o Razón Social: <strong style="color:${DARK};">${esc(d.clienteNombre)}</strong>
    </div>
    ${d.clienteDireccion ? `<div style="font-size:9.5px;color:#888;margin-top:3px;">${esc(d.clienteDireccion)}</div>` : ''}
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       REFERENCIA A DOCUMENTO ORIGINAL (si aplica)
  ══════════════════════════════════════════════════════════════════ -->
  ${(d.facturaOriginalFolio || d.ncfOriginal || d.descripcionMotivo || d.codigoModificacion || d.motivoConcepto) ? `
  <div style="border:1px solid #ddd;padding:10px 14px;margin-bottom:12px;background:#fafafa;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${DARK};margin-bottom:6px;">Modifica a</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      ${d.facturaOriginalFolio ? `<div style="font-size:10.5px;color:${GRAY};">Factura: <strong style="color:${DARK};font-family:monospace;">${esc(d.facturaOriginalFolio)}</strong></div>` : ''}
      ${d.ncfOriginal ? `<div style="font-size:10.5px;color:${GRAY};">e-NCF original: <strong style="color:${DARK};font-family:monospace;">${esc(d.ncfOriginal)}</strong></div>` : ''}
      ${d.codigoModificacion ? `<div style="font-size:10.5px;color:${GRAY};">Código: <strong style="color:${DARK};">${esc(d.codigoModificacion)}</strong></div>` : ''}
      ${d.motivoConcepto ? `<div style="font-size:10.5px;color:${GRAY};">Motivo: <strong style="color:${DARK};">${esc(d.motivoConcepto)}</strong></div>` : ''}
      ${d.descripcionMotivo ? `<div style="font-size:10.5px;color:${GRAY};">Descripción: <strong style="color:${DARK};">${esc(d.descripcionMotivo)}</strong></div>` : ''}
    </div>
  </div>` : ''}

  <!-- ══════════════════════════════════════════════════════════════════
       TABLA DE ÍTEMS
  ══════════════════════════════════════════════════════════════════ -->
  <table style="margin-bottom:16px;">
    <thead>
      <tr style="background:${THEAD};">
        <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:left;">Descripción</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:58px;">Cant.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:95px;">Precio Unit.</th>
        <th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:center;width:60px;">ITBIS %</th>
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
  <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
    <div style="min-width:260px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">Subtotal:</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${fmt(d.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
        <span style="font-size:10.5px;color:${GRAY};">ITBIS (18%):</span>
        <span style="font-size:10.5px;font-weight:500;color:${DARK};font-variant-numeric:tabular-nums;">${fmt(d.iva)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:2px solid ${DARK};margin-top:4px;">
        <span style="font-size:12px;font-weight:700;color:${DARK};">${esDebito ? 'TOTAL A COBRAR' : 'TOTAL A ACREDITAR'}:</span>
        <span style="font-size:18px;font-weight:900;color:${DARK};font-variant-numeric:tabular-nums;font-family:monospace;">${signo}${fmt(d.total)}</span>
      </div>
    </div>
  </div>

  <!-- NOTAS -->
  ${d.notas ? `
  <div style="padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">Notas</div>
    <div style="font-size:9.5px;color:#555;line-height:1.6;">${esc(d.notas)}</div>
  </div>` : ''}

  <!-- SEGURIDAD FISCAL DGII -->
  ${(d.qrBase64 || d.ecfCodigoSeguridad || d.ecfFechaFirma) ? `
  <div style="padding:10px 14px;border:1px solid #ddd;background:#fafafa;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:8px;">Seguridad Fiscal DGII</div>
    <div style="display:flex;gap:16px;align-items:flex-start;">
      ${d.qrBase64 ? `<img src="data:image/png;base64,${d.qrBase64}" style="width:72px;height:72px;flex-shrink:0;" alt="QR DGII">` : ''}
      <div style="font-size:9px;color:${GRAY};line-height:1.9;">
        ${d.ecfCodigoSeguridad ? `<div>Código de Seguridad: <strong style="color:${DARK};font-family:monospace;">${esc(d.ecfCodigoSeguridad)}</strong></div>` : ''}
        ${d.ecfFechaFirma ? `<div>Fecha y Hora de Firma: <strong style="color:${DARK};">${fmtDT(d.ecfFechaFirma)}</strong></div>` : ''}
        <div style="margin-top:4px;font-size:8.5px;color:#888;">La validez puede verificarse mediante el código QR ante la DGII.</div>
      </div>
    </div>
  </div>` : ''}

  <!-- ══════════════════════════════════════════════════════════════════
       FOOTER
  ══════════════════════════════════════════════════════════════════ -->
  <div style="margin-top:auto;padding-top:14px;border-top:1px solid #ddd;text-align:center;">
    <div style="font-size:10px;color:#555;">
      ${esDebito
        ? 'Este documento es una Nota de Débito (E33) emitida conforme a la normativa de la DGII de la República Dominicana.'
        : 'Este documento es una Nota de Crédito (E34) emitida conforme a la normativa de la DGII de la República Dominicana.'}
    </div>
    <div style="font-size:8.5px;color:#aaa;margin-top:5px;">Documento generado por <strong style="color:#666;">HiCloud ERP</strong></div>
  </div>

</div>
</body>
</html>`;
}
