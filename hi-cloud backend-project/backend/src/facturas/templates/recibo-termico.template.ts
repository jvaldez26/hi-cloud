/* ──────────────────────────────────────────────
   HiCloud ERP — Recibo Térmico POS 80mm
──────────────────────────────────────────────── */

export interface ReciboPOSData {
  empresaNombre:   string;
  empresaRNC:      string;
  empresaTelefono?: string;
  empresaWeb?:     string;
  vendedor?:       string;
  sucursal?:       string;
  fechaHora:       string;
  numero:          string;       // FAC-2026-0001
  ecfNumero?:      string;       // E320000000001
  metodoPago:      string;
  items: Array<{ descripcion: string; cantidad: number; precio: number; total: number }>;
  subtotal:   number;
  itbis:      number;
  total:      number;
  recibido?:             number;
  cambio?:               number;
  qrBase64?:             string;
  rncComprador?:         string;
  razonSocialComprador?: string;
}

function money(n: number): string {
  return 'RD$ ' + n.toLocaleString('es-DO', { minimumFractionDigits: 2 });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function line(char = '-', len = 48): string {
  return char.repeat(len);
}

export function generarHTMLRecibo(d: ReciboPOSData): string {
  const itemsHTML = d.items.map(item => {
    const desc  = truncate(item.descripcion, 26);
    const total = money(item.total);
    const spaces = Math.max(1, 48 - desc.length - total.length);
    return `<div style="display:flex;justify-content:space-between;margin:1px 0;">
      <span>${desc}</span><span style="font-weight:600;">${total}</span>
    </div>
    <div style="font-size:9px;color:#666;margin-bottom:3px;">
      ${item.cantidad} x ${money(item.precio)}
    </div>`;
  }).join('');

  const qrHtml = d.qrBase64
    ? `<img src="data:image/png;base64,${d.qrBase64}" style="width:60px;height:60px;" alt="QR">`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    width: 80mm;
    background: #fff;
    color: #000;
    padding: 4mm 4mm;
  }
  .center { text-align: center; }
  .right  { text-align: right;  }
  .bold   { font-weight: bold;  }
  .line   { border-top: 1px dashed #ccc; margin: 6px 0; }
  .line-solid { border-top: 2px solid #000; margin: 6px 0; }
  @media print {
    body { -webkit-print-color-adjust: exact; }
    @page { size: 80mm auto; margin: 0; }
  }
</style>
</head>
<body>

<!-- CABECERA -->
<div class="center bold" style="font-size:14px;letter-spacing:-0.3px;">${d.empresaNombre}</div>
<div class="center" style="font-size:10px;color:#555;">RNC: ${d.empresaRNC}</div>
${d.empresaTelefono ? `<div class="center" style="font-size:10px;color:#555;">${d.empresaTelefono}</div>` : ''}
${d.empresaWeb     ? `<div class="center" style="font-size:10px;color:#555;">${d.empresaWeb}</div>` : ''}

<div class="line"></div>

<!-- e-CF -->
${d.ecfNumero ? `
<div class="center bold" style="font-size:16px;letter-spacing:1px;">${d.ecfNumero}</div>
<div class="center" style="font-size:9px;color:#555;">Comprobante Fiscal Electrónico</div>
<div class="line"></div>
` : ''}

<!-- INFO -->
<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;">
  <span>Fecha:</span><span>${d.fechaHora}</span>
</div>
<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;">
  <span>Factura:</span><span class="bold">${d.numero}</span>
</div>
${d.vendedor ? `<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;"><span>Vendedor:</span><span>${d.vendedor}</span></div>` : ''}
${d.sucursal  ? `<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;"><span>Sucursal:</span><span>${d.sucursal}</span></div>`  : ''}
<div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;">
  <span>Pago:</span><span>${d.metodoPago}</span>
</div>

<div class="line"></div>

<!-- COMPRADOR (solo para e-CF con RNC declarado) -->
${(d.rncComprador || d.razonSocialComprador) ? `
<div class="bold" style="font-size:10px;margin-bottom:2px;">COMPRADOR:</div>
${d.rncComprador ? `<div style="font-size:10px;">RNC: ${d.rncComprador}</div>` : ''}
${d.razonSocialComprador ? `<div style="font-size:10px;">${d.razonSocialComprador}</div>` : ''}
<div class="line"></div>
` : ''}

<!-- ITEMS -->
<div class="bold" style="font-size:10px;margin-bottom:4px;">DETALLE DE COMPRA</div>
${itemsHTML}

<div class="line-solid"></div>

<!-- TOTALES -->
<div style="display:flex;justify-content:space-between;margin:3px 0;">
  <span>Subtotal:</span><span>${money(d.subtotal)}</span>
</div>
<div style="display:flex;justify-content:space-between;margin:3px 0;">
  <span>ITBIS 18%:</span><span>${money(d.itbis)}</span>
</div>

<div class="line-solid"></div>

<div style="display:flex;justify-content:space-between;margin:4px 0;">
  <span class="bold" style="font-size:14px;">TOTAL:</span>
  <span class="bold" style="font-size:14px;">${money(d.total)}</span>
</div>

${d.recibido ? `
<div style="display:flex;justify-content:space-between;margin:3px 0;font-size:11px;">
  <span>Recibido:</span><span>${money(d.recibido)}</span>
</div>
<div style="display:flex;justify-content:space-between;margin:3px 0;font-size:11px;">
  <span class="bold">Cambio:</span><span class="bold">${money(d.cambio || 0)}</span>
</div>
` : ''}

<div class="line"></div>

<!-- QR -->
${qrHtml ? `
<div class="center" style="margin:8px 0;">
  ${qrHtml}
  <div style="font-size:9px;color:#555;margin-top:2px;">Verificar en ecf.dgii.gov.do</div>
</div>
<div class="line"></div>
` : ''}

<!-- FOOTER -->
<div class="center bold" style="font-size:12px;margin:6px 0;">¡Gracias por su compra!</div>
<div class="center" style="font-size:9px;color:#777;">Generado por HiCloud ERP</div>
${d.empresaWeb ? `<div class="center" style="font-size:9px;color:#777;">${d.empresaWeb}</div>` : ''}
<div class="center" style="font-size:8px;color:#aaa;margin-top:4px;">Ley 32-23 · DGII República Dominicana</div>

<br><br>

</body>
</html>`;
}
