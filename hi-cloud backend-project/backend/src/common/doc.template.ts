/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template genérico de documento de negocio A4  v2
   Mismo diseño que factura: header 2col | sep negro | caja | tabla dark | totales
   Usado por: Recibos, Pre-Facturas, Conduces, Gastos, Retenciones, Presupuestos
───────────────────────────────────────────────────────────────────────────── */

export interface DocEmpresa {
  nombre:    string;
  rnc:       string;
  direccion: string;
  ciudad?:   string;
  telefono?: string;
  email?:    string;
  logo?:     string;
  color?:    string;
}

export interface DocParticipante {
  label:    string;
  nombre:   string;
  rnc?:     string;
  dir?:     string;
  tel?:     string;
  email?:   string;
}

export interface DocItem {
  descripcion:     string;
  cantidad?:       number;
  unidad?:         string;
  precioUnitario?: number;
  importe:         number;
  nota?:           string;
}

export interface DocTotal {
  label:  string;
  valor:  number;
  bold?:  boolean;
  color?: string;
}

export interface DocCampo {
  label: string;
  valor: string | number;
  mono?: boolean;
}

export interface DocData {
  tipo:         string;      // "RECIBO DE COBRO", "PRE-FACTURA", "CONDUCE", etc.
  tipoSub?:     string;      // subtítulo / descripción del tipo
  numero:       string;
  fecha:        string;
  estado?:      string;
  estadoColor?: string;      // 'green' | 'orange' | 'red' | 'blue'
  empresa:      DocEmpresa;
  participante?: DocParticipante;
  campos?:      DocCampo[];  // campos clave-valor adicionales
  items?:       DocItem[];
  totales?:     DocTotal[];
  notas?:       string;
  pie?:         string;      // texto del footer
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(v: number): string {
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

function esc(s?: string | number | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Generador ─────────────────────────────────────────────────────────────────

export function generarDocumento(d: DocData): string {
  const DARK   = '#111111';
  const THEAD  = '#2d2d2d';
  const GRAY   = '#555555';
  const LGRAY  = '#f5f5f5';
  const BORDER = '#aaaaaa';
  const GREEN  = '#15803D';

  // Estado badge colors
  const badgeBg: Record<string, string> = {
    green:  '#dcfce7', blue: '#dbeafe', orange: '#fef3c7', red: '#fee2e2',
  };
  const badgeTx: Record<string, string> = {
    green:  '#15803d', blue: '#1d4ed8', orange: '#92400e', red: '#991b1b',
  };
  const bc = d.estadoColor ?? 'blue';
  const estadoHtml = d.estado
    ? `<span style="background:${badgeBg[bc] ?? badgeBg.blue};color:${badgeTx[bc] ?? badgeTx.blue};font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;">${esc(d.estado)}</span>`
    : '';

  // ── Logo ─────────────────────────────────────────────────────────────────
  const iniciales = (d.empresa.nombre || 'HC')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  const logoHtml = d.empresa.logo
    ? `<img src="${d.empresa.logo}" style="height:68px;max-width:150px;object-fit:contain;display:block;flex-shrink:0;" onerror="this.style.display='none'">`
    : `<div style="width:56px;height:56px;background:${DARK};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0;">${iniciales}</div>`;

  // ── Campos adicionales (grid compacto) ────────────────────────────────────
  const camposHtml = (d.campos && d.campos.length > 0) ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
      ${d.campos.map(c => `
        <div style="border:1px solid #ddd;padding:6px 10px;border-radius:4px;min-width:140px;">
          <div style="font-size:8.5px;color:${GRAY};font-weight:600;text-transform:uppercase;letter-spacing:.4px;">${esc(c.label)}</div>
          <div style="font-size:12px;font-weight:600;color:${DARK};${c.mono ? 'font-family:monospace;' : ''}">${esc(c.valor)}</div>
        </div>`).join('')}
    </div>` : '';

  // ── Items table ───────────────────────────────────────────────────────────
  const hasCant  = (d.items ?? []).some(i => i.cantidad !== undefined);
  const hasUnid  = (d.items ?? []).some(i => i.unidad);
  const hasPUnit = (d.items ?? []).some(i => i.precioUnitario !== undefined);

  const itemsHtml = (d.items && d.items.length > 0) ? `
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      <thead>
        <tr style="background:${THEAD};">
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:left;">Descripción</th>
          ${hasCant  ? `<th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:58px;">Cant.</th>` : ''}
          ${hasUnid  ? `<th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:center;width:45px;">Ud.</th>` : ''}
          ${hasPUnit ? `<th style="padding:9px 8px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:95px;">P. Unit.</th>` : ''}
          <th style="padding:9px 10px;font-size:8.5px;font-weight:700;color:#fff;text-transform:uppercase;text-align:right;width:100px;">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${d.items.map((it, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : LGRAY};border-bottom:1px solid #e8e8e8;">
            <td style="padding:7px 10px;font-size:10px;color:${DARK};">
              ${esc(it.descripcion)}
              ${it.nota ? `<div style="font-size:9px;color:${GRAY};margin-top:2px;">${esc(it.nota)}</div>` : ''}
            </td>
            ${hasCant  ? `<td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;">${it.cantidad !== undefined ? esc(String(it.cantidad)) : ''}</td>` : ''}
            ${hasUnid  ? `<td style="padding:7px 8px;font-size:10px;color:${GRAY};text-align:center;">${esc(it.unidad ?? '')}</td>` : ''}
            ${hasPUnit ? `<td style="padding:7px 8px;font-size:10px;color:${DARK};text-align:right;font-variant-numeric:tabular-nums;">${it.precioUnitario !== undefined ? fmtM(it.precioUnitario) : ''}</td>` : ''}
            <td style="padding:7px 10px;font-size:10px;color:${DARK};font-weight:700;text-align:right;font-variant-numeric:tabular-nums;">${fmtM(it.importe)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  // ── Totales ───────────────────────────────────────────────────────────────
  const totalesHtml = (d.totales && d.totales.length > 0) ? (() => {
    const filas = d.totales!;
    const ultimaIdx = filas.length - 1;
    return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <div style="min-width:260px;">
        ${filas.map((t, i) => i < ultimaIdx
          ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e8e8e8;">
               <span style="font-size:10.5px;color:${GRAY};">${esc(t.label)}:</span>
               <span style="font-size:10.5px;font-weight:${t.bold ? 700 : 500};color:${t.color ?? DARK};font-variant-numeric:tabular-nums;">${fmtM(t.valor)}</span>
             </div>`
          : `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:2px solid ${DARK};margin-top:4px;">
               <span style="font-size:12px;font-weight:700;color:${DARK};">${esc(t.label).toUpperCase()}:</span>
               <span style="font-size:18px;font-weight:900;color:${DARK};font-variant-numeric:tabular-nums;font-family:monospace;">${fmtM(t.valor)}</span>
             </div>`
        ).join('')}
      </div>
    </div>`;
  })() : '';

  // ── Participante ──────────────────────────────────────────────────────────
  const participanteHtml = d.participante ? `
    <div style="border:1px solid ${BORDER};padding:10px 14px;margin-bottom:14px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${DARK};margin-bottom:7px;">Datos del ${esc(d.participante.label)}</div>
      ${d.participante.rnc
        ? `<div style="font-size:10.5px;color:${GRAY};margin-bottom:3px;">RNC o Cédula: <strong style="color:${DARK};">${esc(d.participante.rnc)}</strong></div>`
        : ''}
      <div style="font-size:10.5px;color:${GRAY};">Nombre o Razón Social: <strong style="color:${DARK};">${esc(d.participante.nombre)}</strong></div>
      ${d.participante.dir
        ? `<div style="font-size:9.5px;color:#888;margin-top:3px;">${esc(d.participante.dir)}</div>`
        : ''}
      ${(d.participante.tel || d.participante.email) ? `
        <div style="font-size:9.5px;color:${GRAY};margin-top:3px;">
          ${d.participante.tel   ? `Tel. ${esc(d.participante.tel)}  ` : ''}
          ${d.participante.email ? esc(d.participante.email) : ''}
        </div>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(d.tipo)} ${esc(d.numero)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; background:#fff; color:${DARK}; font-size:11px; }
  @page { size:A4; margin:0; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  .page { width:794px; min-height:1123px; background:#fff; display:flex; flex-direction:column; padding:28px 36px 24px; }
</style>
</head>
<body>
<div class="page">

  <!-- ══════════════════════════════════════════════════════════════════
       ENCABEZADO — empresa (izq) · tipo documento + info (der)
  ══════════════════════════════════════════════════════════════════ -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px;">

    <!-- Izquierda: Logo + empresa -->
    <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0;">
      ${logoHtml}
      <div style="min-width:0;padding-top:2px;">
        <div style="font-size:15px;font-weight:900;color:${DARK};text-transform:uppercase;line-height:1.3;margin-bottom:6px;">${esc(d.empresa.nombre)}</div>
        <div style="font-size:9.5px;color:${GRAY};line-height:1.85;">
          ${d.empresa.direccion
            ? `<div>${esc(d.empresa.direccion)}${d.empresa.ciudad ? ', ' + esc(d.empresa.ciudad) : ''}.</div>`
            : ''}
          ${d.empresa.email    ? `<div>Correo: ${esc(d.empresa.email)}</div>`   : ''}
          ${d.empresa.telefono ? `<div>Teléfono: ${esc(d.empresa.telefono)}</div>` : ''}
          <div><strong style="color:${DARK};">RNC: ${esc(d.empresa.rnc)}</strong></div>
        </div>
      </div>
    </div>

    <!-- Derecha: tipo + número + fecha + estado -->
    <div style="text-align:right;flex-shrink:0;min-width:220px;max-width:250px;">
      <div style="font-size:11px;font-weight:700;color:${DARK};text-transform:uppercase;line-height:1.35;">${esc(d.tipo)}</div>
      ${d.tipoSub ? `<div style="font-size:9px;color:${GRAY};margin-top:2px;">${esc(d.tipoSub)}</div>` : ''}
      <div style="font-size:18px;font-weight:900;color:${DARK};font-family:monospace;letter-spacing:.5px;margin-top:5px;">${esc(d.numero)}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:8px;font-size:9.5px;color:${GRAY};">
        <div>Fecha: <strong style="color:${DARK};">${fmtF(d.fecha)}</strong></div>
        ${estadoHtml ? `<div style="margin-top:2px;">${estadoHtml}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       SEPARADOR negro grueso
  ══════════════════════════════════════════════════════════════════ -->
  <div style="height:3px;background:${DARK};margin-bottom:12px;"></div>

  <!-- ══════════════════════════════════════════════════════════════════
       PARTICIPANTE (cliente / proveedor / beneficiario)
  ══════════════════════════════════════════════════════════════════ -->
  ${participanteHtml}

  <!-- CAMPOS ADICIONALES -->
  ${camposHtml}

  <!-- ══════════════════════════════════════════════════════════════════
       TABLA DE ÍTEMS
  ══════════════════════════════════════════════════════════════════ -->
  ${itemsHtml}

  <!-- ══════════════════════════════════════════════════════════════════
       TOTALES
  ══════════════════════════════════════════════════════════════════ -->
  ${totalesHtml}

  <!-- NOTAS -->
  ${d.notas ? `
  <div style="padding:8px 12px;background:#fafafa;border-left:3px solid #ddd;margin-bottom:12px;">
    <div style="font-size:9px;font-weight:700;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;">Notas</div>
    <div style="font-size:9.5px;color:#555;line-height:1.6;">${esc(d.notas)}</div>
  </div>` : ''}

  <!-- ══════════════════════════════════════════════════════════════════
       FOOTER
  ══════════════════════════════════════════════════════════════════ -->
  <div style="margin-top:auto;padding-top:14px;border-top:1px solid #ddd;text-align:center;">
    <div style="font-size:10px;color:#555;">
      ${d.pie ? esc(d.pie) : '¡Gracias por su preferencia!'}
    </div>
    ${d.empresa.email ? `<div style="font-size:9px;color:#888;margin-top:4px;">${esc(d.empresa.email)}</div>` : ''}
    <div style="font-size:8.5px;color:#aaa;margin-top:5px;">Documento generado por <strong style="color:#666;">HiCloud ERP</strong></div>
  </div>

</div>
</body>
</html>`;
}
