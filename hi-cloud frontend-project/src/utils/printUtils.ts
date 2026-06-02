/**
 * Utilidades de impresión para HiCloud ERP.
 * Genera PDFs llamando al backend (puppeteer) o abriendo ventanas HTML para imprimir.
 */

// JWT está en cookie httpOnly — las cookies se envían automáticamente con credentials: 'include'.
// No se usa localStorage para tokens.

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

// ── Imprimir elemento HTML (recibos térmicos POS) ─────────────────────────────

export function imprimirElemento(elementId: string, pageSize = '80mm auto', onDone?: () => void): void {
  const el = document.getElementById(elementId);
  if (!el) { console.warn(`[imprimirElemento] #${elementId} no encontrado`); return; }
  const content = el.innerHTML;
  if (!content.trim()) { console.warn(`[imprimirElemento] #${elementId} está vacío`); return; }

  const receiptHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;transform:none!important;-webkit-transform:none!important}
body{background:#fff;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.4;
  -webkit-font-smoothing:none;-moz-osx-font-smoothing:unset;font-smooth:never;color:#000}
@page{margin:3mm;size:${pageSize}}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>${content}</body></html>`;
  const blob2 = new Blob([receiptHtml], { type: 'text/html' });
  const url2  = URL.createObjectURL(blob2);
  const pw    = window.open(url2, '_blank', 'width=420,height=700,scrollbars=yes');
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
