const base = (titulo: string, cuerpo: string) => `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
  .card{background:#fff;max-width:600px;margin:0 auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)}
  .header{background:#1a56db;color:#fff;padding:20px 24px}
  .header h1{margin:0;font-size:18px}
  .header p{margin:4px 0 0;font-size:13px;opacity:.85}
  .body{padding:24px}
  .alerta{background:#fff3cd;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin:16px 0}
  .tabla{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  .tabla th{background:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280}
  .tabla td{padding:8px 12px;border-bottom:1px solid #e5e7eb}
  .monto{font-weight:700;color:#dc2626}
  .footer{background:#f9fafb;padding:16px 24px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
  .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700}
  .badge-danger{background:#fee2e2;color:#dc2626}
  .badge-warn{background:#fef3c7;color:#d97706}
  .badge-info{background:#dbeafe;color:#1d4ed8}
</style></head>
<body><div class="card">
  <div class="header"><h1>HiCloud ERP</h1><p>${titulo}</p></div>
  <div class="body">${cuerpo}</div>
  <div class="footer">Este es un mensaje automático del sistema HiCloud ERP. No responder.</div>
</div></body></html>`;

export const Templates = {

  cxcVencida: (items: { folio: string; cliente: string; total: number; diasVencido: number }[]) => ({
    asunto: `⚠️ ${items.length} Cuenta(s) por Cobrar Vencida(s)`,
    html: base(
      `Cuentas por Cobrar Vencidas — ${new Date().toLocaleDateString('es-DO')}`,
      `<p>Las siguientes cuentas por cobrar se encuentran <strong>vencidas</strong>. Se requiere gestión de cobro inmediata:</p>
       <table class="tabla">
         <tr><th>Factura</th><th>Cliente</th><th>Monto</th><th>Días Vencido</th></tr>
         ${items.map(i => `<tr>
           <td>${i.folio}</td><td>${i.cliente}</td>
           <td class="monto">RD$ ${i.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
           <td><span class="badge badge-danger">${i.diasVencido} días</span></td>
         </tr>`).join('')}
       </table>
       <div class="alerta">💡 Ingresa al módulo CxC en HiCloud ERP para registrar cobros o enviar recordatorios a los clientes.</div>`,
    ),
  }),

  cxpPorVencer: (items: { folio: string; proveedor: string; total: number; diasVence: number }[]) => ({
    asunto: `📅 ${items.length} Pago(s) a Proveedores próximos a vencer`,
    html: base(
      `Cuentas por Pagar próximas a vencer`,
      `<p>Los siguientes pagos a proveedores <strong>vencen en los próximos días</strong>:</p>
       <table class="tabla">
         <tr><th>Compra</th><th>Proveedor</th><th>Monto</th><th>Vence en</th></tr>
         ${items.map(i => `<tr>
           <td>${i.folio}</td><td>${i.proveedor}</td>
           <td class="monto">RD$ ${i.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
           <td><span class="badge badge-warn">${i.diasVence} días</span></td>
         </tr>`).join('')}
       </table>
       <div class="alerta">💡 Gestiona los pagos en el módulo CxP para evitar mora con proveedores.</div>`,
    ),
  }),

  stockBajo: (productos: { codigo: string; nombre: string; stock: number; stockMinimo: number }[]) => ({
    asunto: `📦 ${productos.length} Producto(s) con Stock Bajo`,
    html: base(
      `Alerta de Stock Bajo — Inventario`,
      `<p>Los siguientes productos tienen stock <strong>igual o por debajo del mínimo</strong>:</p>
       <table class="tabla">
         <tr><th>Código</th><th>Producto</th><th>Stock Actual</th><th>Stock Mínimo</th></tr>
         ${productos.map(p => `<tr>
           <td>${p.codigo}</td><td>${p.nombre}</td>
           <td><span class="badge ${p.stock === 0 ? 'badge-danger' : 'badge-warn'}">${p.stock}</span></td>
           <td>${p.stockMinimo}</td>
         </tr>`).join('')}
       </table>
       <div class="alerta">💡 Genera una orden de compra en HiCloud ERP para reponer el inventario.</div>`,
    ),
  }),

  ecfSecuenciaVence: (secuencias: { tipo: string; secuenciaActual: number; secuenciaFinal: number; fechaVencimiento: string }[]) => ({
    asunto: `🔔 Secuencias e-CF próximas a vencer`,
    html: base(
      `Alerta de Secuencias e-CF DGII`,
      `<p>Las siguientes secuencias de e-CF <strong>están próximas a agotarse o vencer</strong>:</p>
       <table class="tabla">
         <tr><th>Tipo</th><th>Disponibles</th><th>Vencimiento</th></tr>
         ${secuencias.map(s => {
           const disponibles = s.secuenciaFinal - s.secuenciaActual + 1;
           return `<tr>
             <td>${s.tipo}</td>
             <td><span class="badge badge-warn">${disponibles} números</span></td>
             <td>${s.fechaVencimiento}</td>
           </tr>`;
         }).join('')}
       </table>
       <div class="alerta">⚠️ Solicita nueva autorización de secuencias en la DGII antes de que se agoten para evitar interrupciones en la facturación electrónica.</div>`,
    ),
  }),

  resumenDiario: (data: {
    cxcVencidas: number; totalCxCVencido: number;
    cxpPorVencer: number; totalCxPPorVencer: number;
    productosStockBajo: number;
  }) => ({
    asunto: `📊 Resumen Diario HiCloud ERP — ${new Date().toLocaleDateString('es-DO')}`,
    html: base(
      `Resumen del día`,
      `<p>Aquí tienes el resumen de alertas del día:</p>
       <table class="tabla">
         <tr><th>Indicador</th><th>Cantidad</th><th>Monto</th></tr>
         <tr><td>⚠️ CxC Vencidas</td><td>${data.cxcVencidas}</td>
             <td class="monto">RD$ ${data.totalCxCVencido.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td></tr>
         <tr><td>📅 CxP por Vencer (3 días)</td><td>${data.cxpPorVencer}</td>
             <td class="monto">RD$ ${data.totalCxPPorVencer.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td></tr>
         <tr><td>📦 Productos Stock Bajo</td><td>${data.productosStockBajo}</td><td>—</td></tr>
       </table>
       <div class="alerta">Ingresa a HiCloud ERP para más detalles.</div>`,
    ),
  }),

  estadoCuenta: (data: {
    clienteNombre: string;
    empresaNombre: string;
    fechaCorte: string;
    facturas: { folio: string; fecha: string; total: number; pagado: number; pendiente: number; vencimiento: string; estado: string }[];
    totalPendiente: number;
    totalVencido: number;
  }) => {
    const filas = data.facturas.map(f => {
      const vencida = new Date(f.vencimiento) < new Date() && f.pendiente > 0;
      return `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${f.folio}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${new Date(f.fecha).toLocaleDateString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right">RD$ ${f.total.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;color:#059669">RD$ ${f.pagado.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:700;color:${vencida?'#dc2626':'#d97706'}">RD$ ${f.pendiente.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${vencida?'#dc2626':'#6b7280'}">${new Date(f.vencimiento).toLocaleDateString('es-DO')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:12px">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${vencida?'#fee2e2':'#fef3c7'};color:${vencida?'#dc2626':'#d97706'};font-weight:600">
            ${vencida ? 'Vencida' : 'Pendiente'}
          </span>
        </td>
      </tr>`;
    }).join('');

    return {
      asunto: `Estado de Cuenta — ${data.clienteNombre} — ${data.empresaNombre}`,
      html: `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<style>body{margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif}</style>
</head><body>
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%);padding:28px 32px">
    <table width="100%"><tr>
      <td>
        <div style="font-size:20px;font-weight:700;color:#fff">HiCloud ERP</div>
        <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:2px">${data.empresaNombre}</div>
      </td>
      <td align="right">
        <div style="background:rgba(255,255,255,.2);border-radius:8px;padding:8px 16px">
          <div style="font-size:11px;color:rgba(255,255,255,.8);text-transform:uppercase">Estado de Cuenta</div>
          <div style="font-size:13px;color:#fff;font-weight:600">Al ${new Date(data.fechaCorte).toLocaleDateString('es-DO',{day:'2-digit',month:'long',year:'numeric'})}</div>
        </div>
      </td>
    </tr></table>
  </div>

  <div style="padding:24px 32px 0">
    <p style="margin:0 0 4px;font-size:16px;color:#111">Estimado/a <strong>${data.clienteNombre}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555">A continuación encontrará el estado de sus facturas pendientes de pago.</p>

    ${data.totalVencido > 0 ? `<div style="background:#fee2e2;border-left:4px solid #dc2626;border-radius:6px;padding:12px 16px;margin-bottom:16px">
      <strong style="color:#dc2626">⚠️ Facturas vencidas por RD$ ${data.totalVencido.toLocaleString('es-DO',{minimumFractionDigits:2})}</strong>
      <div style="font-size:13px;color:#7f1d1d;margin-top:4px">Por favor regularice su cuenta lo antes posible.</div>
    </div>` : ''}
  </div>

  <div style="padding:0 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f8f9fa">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Factura</th>
          <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#6b7280">Fecha</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Total</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Pagado</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280">Pendiente</th>
          <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#6b7280">Vencimiento</th>
          <th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#6b7280">Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr style="background:#f8f9fa">
          <td colspan="4" style="padding:12px;font-size:13px;font-weight:700;text-align:right;color:#374151">Total Pendiente:</td>
          <td style="padding:12px;font-size:15px;font-weight:700;text-align:right;color:#dc2626">RD$ ${data.totalPendiente.toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div style="padding:20px 32px 24px;text-align:center;margin-top:16px">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Para realizar su pago o consultar, contáctenos directamente.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">${data.empresaNombre} · HiCloud ERP</p>
  </div>
</div>
</body></html>`,
    };
  },

};
