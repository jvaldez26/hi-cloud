/* ─────────────────────────────────────────────────────────────────────────────
   HiCloud ERP — Template genérico de documento de negocio A4
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
  descripcion:    string;
  cantidad?:      number;
  unidad?:        string;
  precioUnitario?: number;
  importe:        number;
  nota?:          string;
}

export interface DocTotal {
  label: string;
  valor: number;
  bold?: boolean;
  color?: string;
}

export interface DocCampo {
  label: string;
  valor: string | number;
  mono?: boolean;
}

export interface DocData {
  tipo:        string;     // "RECIBO DE COBRO", "PRE-FACTURA", etc.
  tipoSub?:    string;     // subtítulo del tipo
  numero:      string;
  fecha:       string;
  estado?:     string;
  estadoColor?: string;    // 'green' | 'orange' | 'red' | 'blue'
  empresa:     DocEmpresa;
  participante?: DocParticipante;
  campos?:     DocCampo[];       // campos adicionales (método pago, ref, etc.)
  items?:      DocItem[];        // líneas de detalle
  totales?:    DocTotal[];
  notas?:      string;
  pie?:        string;           // texto legal del pie
}

function fmtM(v: number): string {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);
}
function fmtF(s: string): string {
  try { return new Date(s + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

export function generarDocumento(d: DocData): string {
  const color   = d.empresa.color ?? '#1a56db';
  const colorLt = color + '14';

  const estadoBadgeMap: Record<string, string> = {
    green: '#dcfce7;color:#15803d', blue: '#dbeafe;color:#1d4ed8',
    orange: '#fef3c7;color:#92400e', red: '#fee2e2;color:#991b1b',
  };
  const estadoBg = estadoBadgeMap[d.estadoColor ?? 'blue'] ?? estadoBadgeMap.blue;

  const logoHtml = d.empresa.logo
    ? `<img src="${d.empresa.logo}" style="max-height:56px;max-width:150px;object-fit:contain" />`
    : `<div style="font-size:24px;font-weight:900;color:${color}">${d.empresa.nombre.substring(0, 2).toUpperCase()}</div>`;

  const participanteHtml = d.participante ? `
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px">${d.participante.label}</div>
      <div style="font-size:14px;font-weight:700;color:#0f172a">${d.participante.nombre}</div>
      ${d.participante.rnc ? `<div style="font-size:11px;color:#64748b">RNC/Cédula: ${d.participante.rnc}</div>` : ''}
      ${d.participante.dir ? `<div style="font-size:11px;color:#64748b">${d.participante.dir}</div>` : ''}
      ${d.participante.tel ? `<div style="font-size:11px;color:#64748b">Tel: ${d.participante.tel}</div>` : ''}
      ${d.participante.email ? `<div style="font-size:11px;color:#64748b">${d.participante.email}</div>` : ''}
    </div>` : '';

  const camposHtml = d.campos && d.campos.length > 0 ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:14px">
      ${d.campos.map(c => `
        <div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px">
          <div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px">${c.label}</div>
          <div style="font-size:13px;font-weight:600;color:#1e293b;${c.mono ? 'font-family:monospace' : ''}">${c.valor}</div>
        </div>`).join('')}
    </div>` : '';

  const itemsHtml = d.items && d.items.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <thead>
        <tr style="background:${color}">
          <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left;border-radius:6px 0 0 0">Descripción</th>
          ${d.items.some(i => i.cantidad !== undefined) ? `<th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;text-align:right">Cant.</th>` : ''}
          ${d.items.some(i => i.unidad) ? `<th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;text-align:center">Ud.</th>` : ''}
          ${d.items.some(i => i.precioUnitario !== undefined) ? `<th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;text-align:right">P.Unit.</th>` : ''}
          <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;text-align:right;border-radius:0 6px 0 0">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${d.items.map((it, i) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
            <td style="padding:8px 10px;font-size:12px;color:#1e293b">
              ${it.descripcion}
              ${it.nota ? `<div style="font-size:10px;color:#94a3b8">${it.nota}</div>` : ''}
            </td>
            ${d.items!.some(x => x.cantidad !== undefined) ? `<td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569">${it.cantidad ?? ''}</td>` : ''}
            ${d.items!.some(x => x.unidad) ? `<td style="padding:8px 10px;text-align:center;font-size:12px;color:#475569">${it.unidad ?? ''}</td>` : ''}
            ${d.items!.some(x => x.precioUnitario !== undefined) ? `<td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569">${it.precioUnitario !== undefined ? fmtM(it.precioUnitario) : ''}</td>` : ''}
            <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:#1e293b">${fmtM(it.importe)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  const totalesHtml = d.totales && d.totales.length > 0 ? `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <div style="min-width:240px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        ${d.totales.map((t, i) => {
          const isLast = i === d.totales!.length - 1;
          return isLast
            ? `<div style="background:${color};color:#fff;display:flex;justify-content:space-between;padding:10px 14px;font-size:14px;font-weight:800">
                <span>${t.label}</span><span>${fmtM(t.valor)}</span>
               </div>`
            : `<div style="display:flex;justify-content:space-between;padding:7px 14px;font-size:12px;background:${i%2===0?'#fff':'#f8fafc'}">
                <span style="color:#64748b">${t.label}</span>
                <span style="font-weight:${t.bold ? 700 : 500};color:${t.color ?? '#1e293b'}">${fmtM(t.valor)}</span>
               </div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1e293b;background:#fff;font-size:13px;line-height:1.5}
  .page{width:210mm;min-height:297mm;padding:14mm 14mm 12mm}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      ${logoHtml}
      <div style="margin-top:7px">
        <div style="font-size:15px;font-weight:800;color:#0f172a">${d.empresa.nombre}</div>
        <div style="font-size:11px;color:#64748b">RNC: ${d.empresa.rnc}</div>
        ${d.empresa.direccion ? `<div style="font-size:11px;color:#64748b">${d.empresa.direccion}${d.empresa.ciudad ? ', ' + d.empresa.ciudad : ''}</div>` : ''}
        ${d.empresa.telefono ? `<div style="font-size:11px;color:#64748b">Tel: ${d.empresa.telefono}</div>` : ''}
        ${d.empresa.email ? `<div style="font-size:11px;color:#64748b">${d.empresa.email}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="display:inline-block;background:${color};color:#fff;padding:6px 18px;border-radius:6px;font-size:14px;font-weight:800;letter-spacing:.5px;margin-bottom:6px">${d.tipo}</div>
      ${d.tipoSub ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px">${d.tipoSub}</div>` : ''}
      <div style="font-size:20px;font-weight:900;color:#0f172a;font-family:monospace">${d.numero}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px">Fecha: ${fmtF(d.fecha)}</div>
      ${d.estado ? `<div style="margin-top:6px"><span style="background:${estadoBg};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${d.estado.toUpperCase()}</span></div>` : ''}
    </div>
  </div>

  <!-- STRIP -->
  <div style="height:4px;background:${color};border-radius:2px;margin-bottom:16px"></div>

  <!-- PARTICIPANTE -->
  ${participanteHtml}

  <!-- CAMPOS EXTRA -->
  ${camposHtml}

  <!-- ITEMS -->
  ${itemsHtml}

  <!-- TOTALES -->
  ${totalesHtml}

  <!-- NOTAS -->
  ${d.notas ? `
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:14px">
    <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Notas</div>
    <div style="font-size:12px;color:#475569">${d.notas}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end">
    <div style="font-size:10px;color:#94a3b8;max-width:400px;line-height:1.5">
      ${d.pie ?? 'Documento generado por HiCloud ERP · República Dominicana'}
    </div>
    <div style="font-size:9px;color:#cbd5e1">hicloud.app</div>
  </div>

</div>
</body>
</html>`;
}
