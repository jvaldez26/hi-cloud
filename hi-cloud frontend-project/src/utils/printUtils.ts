/**
 * Utilidades de impresión para HiCloud ERP.
 * Genera PDFs llamando al backend (puppeteer) o abriendo ventanas HTML para imprimir.
 */

// JWT está en cookie httpOnly — las cookies se envían automáticamente con credentials: 'include'.
// No se usa localStorage para tokens.
import { imprimirHtmlEnBT } from '../services/thermalPrinter';

// ── PDF desde endpoint del backend (puppeteer) ────────────────────────────────

export async function descargarPDFDesdeURL(apiPath: string, nombreArchivo: string): Promise<void> {
  const res = await fetch(apiPath, { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status} al generar PDF`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export async function verPDFDesdeURL(apiPath: string): Promise<void> {
  const res = await fetch(apiPath, { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status} al generar PDF`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Obtiene el HTML preview de una factura y abre el diálogo de impresión.
 *  Equivalente al botón "Imprimir" del módulo de Facturas (/preview → window.print()). */
export async function imprimirFacturaPreviewA4(facturaId: number): Promise<void> {
  const res = await fetch(`/api/v1/facturas/${facturaId}/preview`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status} al generar preview de factura`);
  const html = await res.text();
  imprimirHtml(html);
}

/** Descarga el PDF A4 desde el backend y abre el diálogo de impresión.
 *  Idéntico al patrón de los módulos de escritorio (FacturasPage, etc.). */
export async function imprimirPDFA4(apiPath: string): Promise<void> {
  const res = await fetch(apiPath, { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status} al generar PDF`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const pw   = window.open(url, '_blank', 'width=900,height=700,scrollbars=yes');
  if (!pw) { window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60_000); return; }
  const cleanup = () => { try { pw.close(); } catch { /* noop */ } URL.revokeObjectURL(url); };
  pw.addEventListener('load', () => {
    pw.focus();
    pw.print();
    pw.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 60_000);
  });
  // Fallback si load no dispara (algunos navegadores con blob PDF)
  setTimeout(() => { if (!pw.closed) { pw.focus(); pw.print(); } }, 800);
}

// ── Imprimir HTML en ventana nueva ────────────────────────────────────────────

export function imprimirHtml(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const pw   = window.open(url, '_blank', 'width=900,height=700,scrollbars=yes');
  if (!pw) { window.print(); URL.revokeObjectURL(url); return; }

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    pw.focus();
    pw.print();
    pw.addEventListener('afterprint', () => { pw.close(); URL.revokeObjectURL(url); });
    setTimeout(() => { try { pw.close(); URL.revokeObjectURL(url); } catch { /* noop */ } }, 60_000);
  };

  pw.onload = doPrint;
  setTimeout(() => { if (!pw.closed) doPrint(); }, 800);
}

// ── Imprimir recibo térmico POS ───────────────────────────────────────────────
// Usa document.write (no blob URL) para evitar rasterización/texto borroso.
// Fallback: overlay en la página actual + window.print() — no requiere popup
// ni gesto del usuario, funciona en Android/iOS desde cualquier contexto async.

export function imprimirReciboTermico(html: string, onDone?: () => void, tipoImpresora?: string): void {
  if (tipoImpresora === 'bluetooth') {
    imprimirHtmlEnBT(html)
      .then(() => onDone?.())
      .catch(err => { console.error('[BT] Error al imprimir:', err?.message); onDone?.(); });
    return;
  }
  // En Android/tablet la app de impresión BT intercepta window.open() antes de
  // que document.write() cargue el contenido → la pestaña queda en about:blank.
  // En móvil: usar overlay + window.print() directamente (sí llega al contenido).
  const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  if (!esMovil) {
    const pw = window.open('', '_blank', 'width=360,height=640,toolbar=0,menubar=0,location=0,scrollbars=yes');
    if (pw) {
      pw.document.open();
      pw.document.write(html);
      pw.document.close();
      pw.focus();
      // El HTML del recibo ya incluye window.print() en load y window.close() en afterprint.
      // Solo registramos el listener para llamar onDone() cuando se cierre.
      pw.addEventListener('afterprint', () => { pw.close(); onDone?.(); }, { once: true });
      // Fallback: si afterprint nunca dispara (PDF virtual, cancelación rápida)
      setTimeout(() => { try { if (!pw.closed) { pw.close(); onDone?.(); } } catch { /* noop */ } }, 30_000);
      return;
    }
  }
  _reciboOverlay(html, onDone);
}

// Imprime el recibo inyectando su contenido como overlay en la página actual y
// llamando window.print(). No usa window.open() — funciona en Android sin permisos
// de popup. window.print() sí puede llamarse desde setTimeout/async en Android Chrome.
function _reciboOverlay(html: string, onDone?: () => void): void {
  // Extraer <style> y <body> del HTML completo del recibo
  const cssMatch  = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const receiptCss  = cssMatch  ? cssMatch[1]  : '';
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Overlay pantalla completa con el contenido del recibo
  const overlay = document.createElement('div');
  overlay.id = '__hc-po';
  overlay.innerHTML = bodyContent;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#fff';
  document.body.appendChild(overlay);

  // Inyectar los estilos del recibo (incluye @page size 80mm, body font/width)
  // más reglas de impresión para ocultar el resto de la app al imprimir
  const styleEl = document.createElement('style');
  styleEl.id = '__hc-ps';
  styleEl.textContent = receiptCss + `
    @media print{
      html,body{visibility:hidden!important}
      #__hc-po{visibility:visible!important;position:static!important;display:block!important}
      #__hc-po *{visibility:visible!important}
    }`;
  document.head.appendChild(styleEl);

  const cleanup = () => {
    try { if (document.body.contains(overlay))  document.body.removeChild(overlay);  } catch { /* noop */ }
    try { if (document.head.contains(styleEl)) document.head.removeChild(styleEl); } catch { /* noop */ }
    onDone?.();
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  // 400 ms para que el overlay renderice antes de abrir el diálogo de impresión
  setTimeout(() => { window.print(); setTimeout(cleanup, 60_000); }, 400);
}

// ── Imprimir elemento HTML (recibos térmicos POS) ─────────────────────────────

export function imprimirElemento(elementId: string, pageSize = '80mm auto', onDone?: () => void): void {
  const el = document.getElementById(elementId);
  if (!el) { console.warn(`[imprimirElemento] #${elementId} no encontrado`); return; }
  const content = el.innerHTML;
  if (!content.trim()) { console.warn(`[imprimirElemento] #${elementId} está vacío`); return; }

  // Derivar ancho en mm del pageSize para ajustar viewport y popup al papel exacto.
  // Sin esto el navegador escala el contenido al imprimir → texto borroso.
  const mmMatch = pageSize.match(/^(\d+(\.\d+)?)mm/);
  const mmWidth = mmMatch ? parseFloat(mmMatch[1]) : 80;
  const pxWidth = Math.round(mmWidth * 3.7795); // 1 mm = 3.7795 px a 96 dpi

  const receiptHtml = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${pxWidth},initial-scale=1,shrink-to-fit=no">
<title>Recibo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;transform:none!important;-webkit-transform:none!important}
html{width:${mmWidth}mm}
body{
  width:${mmWidth}mm;max-width:${mmWidth}mm;
  background:#fff;
  font-family:'Courier New',Courier,monospace;
  font-size:12px;line-height:1.4;
  -webkit-font-smoothing:none;-moz-osx-font-smoothing:unset;font-smooth:never;
  color:#000
}
@page{margin:2mm;size:${pageSize}}
@media print{
  html,body{width:${mmWidth}mm}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head><body>${content}</body></html>`;
  const blob2 = new Blob([receiptHtml], { type: 'text/html' });
  const url2  = URL.createObjectURL(blob2);
  // Popup con ancho exacto al papel + 18px de scrollbar para evitar reflow
  const pw    = window.open(url2, '_blank', `width=${pxWidth + 18},height=700,scrollbars=yes`);
  if (!pw) { _imprimirConCSS(elementId, pageSize); URL.revokeObjectURL(url2); onDone?.(); return; }

  // Flag para evitar doble impresión: onload + setTimeout se pueden disparar juntos
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    pw.focus();
    pw.print();
    pw.addEventListener('afterprint', () => { pw.close(); onDone?.(); });
    setTimeout(() => { try { pw.close(); onDone?.(); } catch { /* noop */ } }, 60_000);
  };

  pw.onload = doPrint;
  // Fallback solo si onload no disparó (algunos navegadores/popups bloqueados)
  setTimeout(() => { if (!pw.closed) doPrint(); }, 800);
}

function _imprimirConCSS(elementId: string, pageSize: string): void {
  const styleId = '__hc-print-override';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `@media print{body *{visibility:hidden!important}
    #${elementId},#${elementId} *{visibility:visible!important}
    #${elementId}{position:fixed!important;top:0!important;left:0!important;width:auto!important}
    @page{margin:3mm;size:${pageSize}}}`;
  window.print();
  setTimeout(() => { if (style && document.head.contains(style)) document.head.removeChild(style); }, 3_000);
}
