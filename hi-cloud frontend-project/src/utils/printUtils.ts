/**
 * Utilidades de impresión para HiCloud ERP.
 * Genera PDFs llamando al backend (puppeteer) o abriendo ventanas HTML para imprimir.
 *
 * 2026-10-08 — diagnóstico de congelamiento del POS: dos problemas reales
 * confirmados (código + Playwright), corregidos aquí:
 *   1. imprimirReciboTermico() en escritorio abría una ventana emergente
 *      (window.open) para imprimir. Confirmado con Playwright que el popup NO
 *      bloquea la pestaña principal a nivel de renderer — pero si la cajera
 *      hace clic fuera, la ventana queda detrás y no hay forma obvia de
 *      encontrarla; el flujo de venta queda "atascado" esperando esa ventana
 *      perdida. Reemplazado por un iframe oculto en la MISMA pestaña — no hay
 *      ventana que perder.
 *   2. _reciboOverlay() (fallback móvil/Android) montaba un <div> a pantalla
 *      completa con z-index máximo SIN pointer-events:none — bloqueaba
 *      clics de verdad mientras estuviera en el DOM (hasta 60s si
 *      `afterprint` no disparaba, que es justo lo que pasa con apps de
 *      impresión BT interceptando). Ahora es invisible y no interactivo en
 *      pantalla SIEMPRE — solo se hace visible dentro de @media print.
 *   3. El listener de 'afterprint' nunca se quitaba si no disparaba (fuga
 *      confirmada: 300/300 ventas simuladas, cero removidos). Ahora cleanup
 *      se ejecuta UNA sola vez por cualquiera de los 2 caminos (evento o
 *      fallback) y siempre remueve su propio listener.
 *   4. imprimirElemento() nunca revocaba el blob URL del ticket. Corregido.
 *
 * Los fallbacks bajaron de 60s/30s a unos pocos segundos (pedido explícito:
 * "el fallback debe ser de segundos, no 60") — ya no hace falta ese margen
 * porque nada bloquea la pantalla mientras espera.
 */

// JWT está en cookie httpOnly — las cookies se envían automáticamente con credentials: 'include'.
// No se usa localStorage para tokens.
import { imprimirHtmlEnBT } from '../services/thermalPrinter';

// ── Estado de impresión — para telemetría (posTelemetria.ts) ─────────────────
// Un solo ciclo "en curso" a la vez es suficiente: el POS imprime un ticket
// por venta, nunca varios en paralelo desde el mismo flujo.
export type EventoImpresion = { tipo: 'inicio' } | { tipo: 'fin'; duracionMs: number };
type ListenerImpresion = (e: EventoImpresion) => void;
let _impresionListeners: ListenerImpresion[] = [];
let _impresionIniciadaEn: number | null = null;

export function onEventoImpresion(fn: ListenerImpresion): () => void {
  _impresionListeners.push(fn);
  return () => { _impresionListeners = _impresionListeners.filter(f => f !== fn); };
}
/** true si hay un ciclo de impresión que empezó y todavía no terminó. */
export function hayImpresionPendiente(): boolean {
  return _impresionIniciadaEn != null;
}
/** ms transcurridos desde que empezó la impresión pendiente, o null si no hay ninguna. */
export function msImpresionPendiente(): number | null {
  return _impresionIniciadaEn != null ? Date.now() - _impresionIniciadaEn : null;
}
function _marcarImpresionIniciada(): void {
  _impresionIniciadaEn = Date.now();
  _impresionListeners.forEach(fn => fn({ tipo: 'inicio' }));
}
function _marcarImpresionTerminada(viaFallback: boolean): void {
  const duracionMs = _impresionIniciadaEn != null ? Date.now() - _impresionIniciadaEn : 0;
  _impresionIniciadaEn = null;
  _impresionListeners.forEach(fn => fn({ tipo: 'fin', duracionMs }));
  _registrarDuracionParaDeteccion(duracionMs, viaFallback);
}

// ── Detección heurística de "impresión directa" (--kiosk-printing) ──────────
// Nunca se hace un print de prueba solo para detectar esto (imprimiría algo
// real sin que el usuario lo pidiera). En cambio, se observan las impresiones
// REALES que ya ocurren por las ventas del día: con --kiosk-printing, Chrome
// imprime sin cuadro y `afterprint` dispara casi de inmediato (sub-segundo,
// nunca por el fallback); sin él, o tarda más (el cajero interactuando con
// el cuadro) o nunca dispara y cae siempre al fallback. No es una detección
// 100% segura (un cajero muy rápido con el cuadro real podría parecer
// "directa"), por eso se basa en la MEDIANA de varias muestras, no en una sola.
const HISTORIAL_IMPRESION_KEY = 'hc_pos_duraciones_impresion';
const HISTORIAL_IMPRESION_MAX = 20;

function _registrarDuracionParaDeteccion(duracionMs: number, viaFallback: boolean): void {
  try {
    const raw = localStorage.getItem(HISTORIAL_IMPRESION_KEY);
    const arr: { ms: number; fallback: boolean }[] = raw ? JSON.parse(raw) : [];
    arr.push({ ms: duracionMs, fallback: viaFallback });
    while (arr.length > HISTORIAL_IMPRESION_MAX) arr.shift();
    localStorage.setItem(HISTORIAL_IMPRESION_KEY, JSON.stringify(arr));
  } catch { /* localStorage lleno/deshabilitado — no crítico, no es más que una sugerencia en pantalla */ }
}

export interface DeteccionImpresionDirecta {
  disponible: boolean;
  muestras: number;
  medianaMs: number | null;
  probablementeActiva: boolean | null;
}

/** Lee el historial local de duraciones reales de impresión y estima si el
 *  navegador probablemente tiene --kiosk-printing activo. Ver nota arriba. */
export function obtenerDeteccionImpresionDirecta(): DeteccionImpresionDirecta {
  try {
    const raw = localStorage.getItem(HISTORIAL_IMPRESION_KEY);
    const arr: { ms: number; fallback: boolean }[] = raw ? JSON.parse(raw) : [];
    if (arr.length < 3) return { disponible: false, muestras: arr.length, medianaMs: null, probablementeActiva: null };
    const ordenados = [...arr.map(a => a.ms)].sort((a, b) => a - b);
    const medianaMs = ordenados[Math.floor(ordenados.length / 2)];
    const ningunoPorFallback = arr.every(a => !a.fallback);
    return {
      disponible: true,
      muestras: arr.length,
      medianaMs,
      probablementeActiva: ningunoPorFallback && medianaMs < 1_500,
    };
  } catch {
    return { disponible: false, muestras: 0, medianaMs: null, probablementeActiva: null };
  }
}

// ── Impresión vía iframe oculto en la MISMA pestaña ───────────────────────────
// Reemplaza window.open(): nunca hay una ventana separada que la cajera
// pueda perder detrás de otra. Un solo iframe singleton, reutilizado en cada
// impresión — así tampoco acumula iframes en el DOM.
const IFRAME_FALLBACK_MS = 6_000; // segundos, no 60 — nada bloquea pantalla mientras tanto

function _getIframeImpresion(): HTMLIFrameElement {
  let iframe = document.getElementById('__hc-print-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = '__hc-print-iframe';
    // Fuera de pantalla y sin interacción — invisible pero con tamaño real
    // (0×0 hace que algunos navegadores no rendericen el contenido para imprimir).
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;pointer-events:none;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
  }
  return iframe;
}

function _printViaHiddenIframe(html: string, onDone?: () => void): void {
  const iframe = _getIframeImpresion();
  const win = iframe.contentWindow;
  if (!win) { _reciboOverlay(html, onDone); return; }

  win.document.open();
  win.document.write(html);
  win.document.close();

  _marcarImpresionIniciada();
  let terminado = false;
  const finish = (viaFallback: boolean) => {
    if (terminado) return;
    terminado = true;
    win.removeEventListener('afterprint', onAfterprint);
    clearTimeout(fallback);
    _marcarImpresionTerminada(viaFallback);
    onDone?.();
  };
  const onAfterprint = () => finish(false);
  win.addEventListener('afterprint', onAfterprint, { once: true });
  const fallback = setTimeout(() => finish(true), IFRAME_FALLBACK_MS);

  // No todas las plantillas de ticket son iguales: ticketTermico.ts y
  // buildCierreCajaHTML incrustan su propio <script> que llama window.print()
  // solo (apuntaban al popup viejo, que nunca lo llamaba). docTermico.ts, el
  // builder más usado, NO lo incrusta — espera que el llamador imprima. Si
  // llamáramos win.print() SIEMPRE, las plantillas con script propio
  // imprimirían DOS veces. Detectamos el script y solo llamamos nosotros si
  // no está — cualquiera de los dos caminos sigue disparando 'afterprint' en
  // `win`, que es lo único que finish() necesita.
  const autoImprime = /<script[^>]*>[\s\S]*?window\.print\s*\(/i.test(html);
  if (!autoImprime) {
    // Pequeño margen para que el iframe termine de montar su documento antes
    // de llamar print() — igual que el popup viejo esperaba 'load'/800ms.
    setTimeout(() => { try { win.focus(); win.print(); } catch { finish(true); } }, 150);
  }
}

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

export function imprimirReciboTermico(
  html: string,
  onDone?: () => void,
  tipoImpresora?: string,
  onError?: (err: any) => void,
): void {
  if (tipoImpresora === 'bluetooth') {
    imprimirHtmlEnBT(html)
      .then(() => onDone?.())
      .catch(err => {
        console.error('[BT] Error al imprimir:', err?.message);
        // Sin esto el fallo de la BT era mudo: el modal se cerraba como si
        // hubiera impreso y el cajero se enteraba al mirar la impresora.
        onError?.(err);
        onDone?.();
      });
    return;
  }
  // En Android/tablet la app de impresión BT intercepta window.open() antes de
  // que document.write() cargue el contenido → la pestaña queda en about:blank.
  // En escritorio: iframe oculto en la MISMA pestaña — nunca hay una ventana
  // emergente que la cajera pueda perder detrás de otra (ver nota 2026-10-08
  // al inicio del archivo). En móvil sin BT: overlay (ver _reciboOverlay).
  const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  if (!esMovil) {
    _printViaHiddenIframe(html, onDone);
    return;
  }
  _reciboOverlay(html, onDone);
}

// Imprime el recibo inyectando su contenido como overlay en la página actual y
// llamando window.print(). No usa window.open() — funciona en Android sin permisos
// de popup. window.print() sí puede llamarse desde setTimeout/async en Android Chrome.
//
// 2026-10-08: el overlay NUNCA debe bloquear la pantalla ni los clics del POS
// mientras espera a que `afterprint` dispare (puede no disparar nunca con
// apps BT interceptando — confirmado: antes quedaba hasta 60s con z-index
// máximo y SIN pointer-events:none, bloqueando de verdad). Ahora es invisible
// y no interactivo EN PANTALLA siempre — solo @media print lo hace visible,
// que es cuando realmente se necesita.
const OVERLAY_FALLBACK_MS = 6_000; // segundos, no 60 — ya no bloquea nada mientras tanto

function _reciboOverlay(html: string, onDone?: () => void): void {
  // Extraer <style> y <body> del HTML completo del recibo
  const cssMatch  = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const receiptCss  = cssMatch  ? cssMatch[1]  : '';
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Overlay con el contenido del recibo — invisible y sin interacción EN
  // PANTALLA (z-index negativo, visibility:hidden, pointer-events:none).
  // Solo @media print lo trae al frente y lo hace visible.
  const overlay = document.createElement('div');
  overlay.id = '__hc-po';
  overlay.innerHTML = bodyContent;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:-1;overflow:auto;background:#fff;visibility:hidden;pointer-events:none;';
  document.body.appendChild(overlay);

  // Inyectar los estilos del recibo (incluye @page size 80mm, body font/width)
  // más reglas de impresión para ocultar el resto de la app al imprimir
  const styleEl = document.createElement('style');
  styleEl.id = '__hc-ps';
  styleEl.textContent = receiptCss + `
    @media print{
      html,body{visibility:hidden!important}
      #__hc-po{visibility:visible!important;position:static!important;display:block!important;z-index:auto!important;pointer-events:auto!important}
      #__hc-po *{visibility:visible!important}
    }`;
  document.head.appendChild(styleEl);

  _marcarImpresionIniciada();
  let terminado = false;
  const finish = (viaFallback: boolean) => {
    if (terminado) return;
    terminado = true;
    window.removeEventListener('afterprint', onAfterprint);
    clearTimeout(fallback);
    try { if (document.body.contains(overlay)) document.body.removeChild(overlay); } catch { /* noop */ }
    try { if (document.head.contains(styleEl)) document.head.removeChild(styleEl); } catch { /* noop */ }
    _marcarImpresionTerminada(viaFallback);
    onDone?.();
  };

  const onAfterprint = () => finish(false);
  window.addEventListener('afterprint', onAfterprint, { once: true });
  const fallback = setTimeout(() => finish(true), OVERLAY_FALLBACK_MS);

  // Mismo detector que _printViaHiddenIframe — algunas plantillas ya llaman
  // window.print() ellas mismas (ver nota ahí); no duplicar la llamada.
  const autoImprime = /<script[^>]*>[\s\S]*?window\.print\s*\(/i.test(html);
  // 400 ms para que el overlay renderice antes de abrir el diálogo de impresión
  if (!autoImprime) {
    setTimeout(() => { try { window.print(); } catch { finish(true); } }, 400);
  }
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
  // Mismo iframe oculto que imprimirReciboTermico — sin popup que perder, sin
  // blob URL que quede sin revocar (antes: nunca se revocaba en el camino
  // feliz, solo cuando el popup venía bloqueado).
  _printViaHiddenIframe(receiptHtml, onDone);
}
