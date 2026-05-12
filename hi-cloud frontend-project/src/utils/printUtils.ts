/**
 * Utilidades de impresión para HiCloud ERP.
 * Genera PDFs llamando al backend (puppeteer) o abriendo ventanas HTML para imprimir.
 */

const authHeaders = () => {
  const token     = localStorage.getItem('access_token');
  const empresaId = localStorage.getItem('empresaId');
  return {
    Authorization:  `Bearer ${token}`,
    'X-Empresa-ID': empresaId ?? '',
  };
};

// ── PDF desde endpoint del backend (puppeteer) ────────────────────────────────

export async function descargarPDFDesdeURL(apiPath: string, nombreArchivo: string): Promise<void> {
  const res = await fetch(apiPath, { headers: authHeaders() });
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
  const res = await fetch(apiPath, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Error ${res.status} al generar PDF`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Imprimir HTML en ventana nueva ────────────────────────────────────────────

export function imprimirHtml(html: string): void {
  const pw = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!pw) { window.print(); return; }
  pw.document.open();
  pw.document.write(html);
  pw.document.close();

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    pw.focus();
    pw.print();
    pw.addEventListener('afterprint', () => pw.close());
    setTimeout(() => { try { pw.close(); } catch { /* noop */ } }, 60_000);
  };

  pw.onload = doPrint;
  setTimeout(() => { if (!pw.closed) doPrint(); }, 800);
}

// ── Imprimir elemento HTML (recibos térmicos POS) ─────────────────────────────

export function imprimirElemento(elementId: string, pageSize = '80mm auto'): void {
  const el = document.getElementById(elementId);
  if (!el) { console.warn(`[imprimirElemento] #${elementId} no encontrado`); return; }
  const content = el.innerHTML;
  if (!content.trim()) { console.warn(`[imprimirElemento] #${elementId} está vacío`); return; }

  const pw = window.open('', '_blank', 'width=420,height=700,scrollbars=yes');
  if (!pw) { _imprimirConCSS(elementId, pageSize); return; }

  pw.document.open();
  pw.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff}
@page{margin:3mm;size:${pageSize}}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>${content}</body></html>`);
  pw.document.close();

  // Flag para evitar doble impresión: onload + setTimeout se pueden disparar juntos
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    pw.focus();
    pw.print();
    pw.addEventListener('afterprint', () => pw.close());
    setTimeout(() => { try { pw.close(); } catch { /* noop */ } }, 60_000);
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
