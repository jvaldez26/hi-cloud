/**
 * printUtils.ts — 2026-10-08, diagnóstico de congelamiento del POS.
 *
 * Confirmado con Playwright (fuera de este archivo, en el reporte) que:
 *   1. El popup de escritorio NO bloqueaba clics a nivel de renderer, pero SE
 *      PERDÍA detrás de la ventana del POS sin forma obvia de encontrarlo —
 *      ahora es un iframe oculto en la misma pestaña, no hay ventana que perder.
 *   2. El overlay móvil SÍ bloqueaba clics de verdad (z-index máximo, sin
 *      pointer-events:none) mientras esperaba `afterprint` — hasta 60s.
 *   3. El listener de 'afterprint' nunca se quitaba si el evento no disparaba:
 *      300/300 ventas simuladas, cero removidos.
 *
 * Este test cubre lo que SÍ se puede verificar sin navegador real (jsdom):
 * listeners netos, nodos vivos tras el ciclo, cero blobs, y que ninguna de
 * las dos rutas bloquea la interacción con el resto de la página (CSS
 * pointer-events/visibility — el bloqueo visual en sí solo se puede probar
 * con Playwright, hecho aparte y reportado).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  imprimirReciboTermico, imprimirElemento, hayImpresionPendiente, msImpresionPendiente,
  onEventoImpresion, obtenerDeteccionImpresionDirecta, imprimirPDFA4,
} from './printUtils';

const TICKET_REAL_HTML = `<!DOCTYPE html><html><head><style>
  @page{size:58mm auto;margin:0}
  body{font-family:'Courier New',monospace;font-size:11px;width:58mm}
</style></head><body>
  <div style="text-align:center"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" /></div>
  <div>HiCloud Ferretería Pavel</div>
  <div>RNC: 101234567</div>
  <div>----------------------------</div>
  ${Array.from({ length: 10 }, (_, i) => `<div>Producto ${i + 1}  x1  RD$${(i + 1) * 50}.00</div>`).join('')}
  <div>----------------------------</div>
  <div>TOTAL: RD$2750.00</div>
  <div style="text-align:center"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="qr" /></div>
</body></html>`;

function contarListenersAfterprint(target: EventTarget): { adds: number; removes: number } {
  let adds = 0, removes = 0;
  const origAdd    = target.addEventListener.bind(target);
  const origRemove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation((type: any, ...rest: any[]) => {
    if (type === 'afterprint') adds++;
    return origAdd(type, ...(rest as [any, any]));
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type: any, ...rest: any[]) => {
    if (type === 'afterprint') removes++;
    return origRemove(type, ...(rest as [any, any]));
  });
  return { get adds() { return adds; }, get removes() { return removes; } } as any;
}

describe('printUtils — fuga de afterprint y bloqueo de pantalla (2026-10-08)', () => {
  let createObjectURLSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom no implementa URL.createObjectURL — lo poli-rellenamos solo para
    // poder espiarlo. El código bajo prueba no debería llamarlo nunca.
    if (typeof (URL as any).createObjectURL !== 'function') {
      (URL as any).createObjectURL = () => 'blob:mock';
    }
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');
    // jsdom no expone maxTouchPoints como accessor — hay que crearlo para
    // poder espiarlo con vi.spyOn(navigator, 'maxTouchPoints', 'get').
    if (!Object.getOwnPropertyDescriptor(Navigator.prototype, 'maxTouchPoints')?.get) {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
        configurable: true, get: () => 0,
      });
    }
    document.body.innerHTML = '';
    document.head.querySelectorAll('#__hc-ps').forEach(n => n.remove());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('300 tickets vía fallback (afterprint nunca dispara): cero listeners netos, cero overlays/iframes vivos', async () => {
    // Warm-up: crea el iframe singleton para poder espiar SU contentWindow
    // (los listeners de la ruta de escritorio van ahí, no en el window
    // principal — solo _reciboOverlay, la ruta móvil, usa window).
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(30_200);
    const iframeWin = (document.getElementById('__hc-print-iframe') as HTMLIFrameElement).contentWindow!;
    const contador = contarListenersAfterprint(iframeWin);

    for (let i = 0; i < 300; i++) {
      imprimirReciboTermico(TICKET_REAL_HTML, undefined);
      // El iframe espera a que carguen las imágenes (tope 2.5s) antes de
      // imprimir; el fallback dispara a los 30s.
      await vi.advanceTimersByTimeAsync(30_200);
    }

    expect((contador as any).adds).toBe(300);
    expect((contador as any).removes).toBe(300); // neto 0 — nunca se queda pegado uno

    // Un solo iframe singleton — nunca se acumulan.
    expect(document.querySelectorAll('#__hc-print-iframe').length).toBe(1);
    // La ruta de overlay (fallback de _printViaHiddenIframe si el iframe
    // fallara) no debería haberse usado — cero overlays vivos.
    expect(document.querySelectorAll('#__hc-po').length).toBe(0);
    expect(document.querySelectorAll('#__hc-ps').length).toBe(0);
  });

  it('300 tickets donde afterprint SÍ dispara normal: mismo resultado, cero listeners netos', async () => {
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(30_200);
    const iframeWin = (document.getElementById('__hc-print-iframe') as HTMLIFrameElement).contentWindow!;
    const contador = contarListenersAfterprint(iframeWin);

    for (let i = 0; i < 300; i++) {
      imprimirReciboTermico(TICKET_REAL_HTML, undefined);
      await vi.advanceTimersByTimeAsync(160); // deja que win.print() se llame
      iframeWin.dispatchEvent(new Event('afterprint'));
    }

    expect((contador as any).adds).toBe(300);
    expect((contador as any).removes).toBe(300);
    expect(document.querySelectorAll('#__hc-po').length).toBe(0);
  });

  it('nunca crea un blob URL — document.write directo, sin Blob que revocar', async () => {
    for (let i = 0; i < 10; i++) {
      imprimirReciboTermico(TICKET_REAL_HTML, undefined);
      await vi.advanceTimersByTimeAsync(30_200);
    }
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('imprimirElemento tampoco crea blob URL — mismo iframe, nunca hay nada que revocar', async () => {
    const el = document.createElement('div');
    el.id = 'panel-generico-test';
    el.innerHTML = '<div>contenido del panel</div>';
    document.body.appendChild(el);

    for (let i = 0; i < 10; i++) {
      imprimirElemento('panel-generico-test', '80mm auto', undefined);
      await vi.advanceTimersByTimeAsync(30_200);
    }
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('el iframe de impresión nunca es interactivo ni visible en pantalla (pointer-events:none)', async () => {
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10);
    const iframe = document.getElementById('__hc-print-iframe') as HTMLIFrameElement;
    expect(iframe.style.pointerEvents).toBe('none');
    await vi.advanceTimersByTimeAsync(30_200);
  });

  it('otros botones del DOM siguen respondiendo mientras la impresión está pendiente (nada los bloquea)', async () => {
    let clicks = 0;
    const btn = document.createElement('button');
    btn.id = 'boton-pos-test';
    btn.onclick = () => { clicks++; };
    document.body.appendChild(btn);

    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10); // overlay/iframe ya montado, print() aún no se llamó

    expect(hayImpresionPendiente()).toBe(true);
    btn.click();
    expect(clicks).toBe(1);

    await vi.advanceTimersByTimeAsync(30_200);
    expect(hayImpresionPendiente()).toBe(false);
  });

  it('móvil (Android): el overlay nunca es visible/interactivo en pantalla, solo en @media print', async () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 11; SM-T) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    );
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10);

    const overlay = document.getElementById('__hc-po') as HTMLDivElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.pointerEvents).toBe('none');
    expect(overlay.style.visibility).toBe('hidden');
    expect(Number(overlay.style.zIndex)).toBeLessThan(0);

    await vi.advanceTimersByTimeAsync(60_200);
    uaSpy.mockRestore();
  });

  // ── Hotfix 2026-10-08 (empresa 73, Bellamar González, PC Windows táctil) ──

  it('Windows + pantalla táctil (navigator.maxTouchPoints > 1): toma la ruta de ESCRITORIO (iframe), no la de overlay', async () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    );
    const touchSpy = vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(10);

    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10);

    // Ruta de escritorio: iframe montado, NINGÚN overlay — el bug reportado
    // era exactamente lo contrario (maxTouchPoints>1 mandaba a _reciboOverlay).
    expect(document.getElementById('__hc-print-iframe')).not.toBeNull();
    expect(document.getElementById('__hc-po')).toBeNull();

    await vi.advanceTimersByTimeAsync(30_200);
    uaSpy.mockRestore();
    touchSpy.mockRestore();
  });

  it('iPadOS 13+ disfrazado de "Macintosh" CON táctil: sigue tomando la ruta móvil (overlay)', async () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Safari/605.1.15',
    );
    const touchSpy = vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);

    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10);

    expect(document.getElementById('__hc-po')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(60_200);
    uaSpy.mockRestore();
    touchSpy.mockRestore();
  });

  it('Mac de escritorio real (sin táctil): toma la ruta de escritorio, no se confunde con un iPad', async () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    );
    const touchSpy = vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(0);

    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(10);

    expect(document.getElementById('__hc-print-iframe')).not.toBeNull();
    expect(document.getElementById('__hc-po')).toBeNull();

    await vi.advanceTimersByTimeAsync(30_200);
    uaSpy.mockRestore();
    touchSpy.mockRestore();
  });

  // HTML mínimo con UNA sola imagen (el logo) — evita la ambigüedad de
  // esperar también las 2 imágenes data: del ticket base, que en jsdom no
  // disparan 'load'/'error' por su cuenta igual que las remotas.
  const HTML_SOLO_LOGO = `<!DOCTYPE html><html><body>
    <img id="logo-remoto" src="https://cdn.example.com/logo-elido.png" />
    <div>HiCloud Ferretería Pavel</div>
  </body></html>`;

  it('NO imprime hasta que el logo (URL remota real, no data:) termine de cargar', async () => {
    imprimirReciboTermico(HTML_SOLO_LOGO, undefined);
    await vi.advanceTimersByTimeAsync(5); // iframe montado, documento escrito

    const win = (document.getElementById('__hc-print-iframe') as HTMLIFrameElement).contentWindow!;
    const printSpy = vi.spyOn(win, 'print');
    const logoImg = win.document.getElementById('logo-remoto') as HTMLImageElement;
    expect(logoImg).not.toBeNull();

    // Pasa el margen que antes (150ms) disparaba print() sin esperar nada —
    // con el logo todavía "cargando" (jsdom nunca dispara load por su cuenta),
    // print() NO debe haberse llamado aún.
    await vi.advanceTimersByTimeAsync(300);
    expect(printSpy).not.toHaveBeenCalled();

    // El logo termina de cargar — print() debe llamarse poco después.
    logoImg.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(10);
    expect(printSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_200);
  });

  it('si el logo NUNCA carga (URL rota, red caída), imprime igual tras el tope de 2.5s — no se queda esperando para siempre', async () => {
    imprimirReciboTermico(HTML_SOLO_LOGO, undefined);
    await vi.advanceTimersByTimeAsync(5);

    const win = (document.getElementById('__hc-print-iframe') as HTMLIFrameElement).contentWindow!;
    const printSpy = vi.spyOn(win, 'print');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(printSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600); // cruza el tope de 2.5s
    expect(printSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_200);
  });

  it('emite los eventos de impresión (inicio/fin con duración) para la telemetría', async () => {
    const eventos: any[] = [];
    const off = onEventoImpresion(e => eventos.push(e));

    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    expect(eventos).toEqual([{ tipo: 'inicio' }]);

    await vi.advanceTimersByTimeAsync(30_200);
    expect(eventos).toHaveLength(2);
    expect(eventos[1].tipo).toBe('fin');
    expect(eventos[1].duracionMs).toBeGreaterThanOrEqual(30_000);

    off();
  });

  it('msImpresionPendiente() refleja cuánto lleva una impresión sin terminar', async () => {
    expect(msImpresionPendiente()).toBeNull();
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(msImpresionPendiente()).toBeGreaterThanOrEqual(2_000);
    await vi.advanceTimersByTimeAsync(30_200);
    expect(msImpresionPendiente()).toBeNull();
  });
});

describe('obtenerDeteccionImpresionDirecta() — heurística de --kiosk-printing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('sin suficientes muestras (menos de 3 impresiones): no disponible', async () => {
    imprimirReciboTermico(TICKET_REAL_HTML, undefined);
    await vi.advanceTimersByTimeAsync(30_200);
    expect(obtenerDeteccionImpresionDirecta().disponible).toBe(false);
  });

  it('todas las impresiones terminan por FALLBACK (nunca por afterprint) — nunca "probablemente activa"', async () => {
    for (let i = 0; i < 5; i++) {
      imprimirReciboTermico(TICKET_REAL_HTML, undefined);
      await vi.advanceTimersByTimeAsync(30_200); // siempre vía fallback, nunca afterprint
    }
    const d = obtenerDeteccionImpresionDirecta();
    expect(d.disponible).toBe(true);
    expect(d.muestras).toBe(5);
    expect(d.probablementeActiva).toBe(false);
  });

  it('afterprint dispara rápido y consistente (<1.5s, nunca por fallback) — probablemente activa', async () => {
    for (let i = 0; i < 5; i++) {
      imprimirReciboTermico(TICKET_REAL_HTML, undefined);
      await vi.advanceTimersByTimeAsync(200); // deja que win.print() se llame
      const iframe = document.getElementById('__hc-print-iframe') as HTMLIFrameElement;
      iframe.contentWindow?.dispatchEvent(new Event('afterprint')); // dispara casi de inmediato
    }
    const d = obtenerDeteccionImpresionDirecta();
    expect(d.disponible).toBe(true);
    expect(d.medianaMs).toBeLessThan(1_500);
    expect(d.probablementeActiva).toBe(true);
  });

  it('localStorage deshabilitado/lleno: no revienta, solo queda "no disponible"', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => obtenerDeteccionImpresionDirecta()).not.toThrow();
    expect(obtenerDeteccionImpresionDirecta().disponible).toBe(false);
    spy.mockRestore();
  });
});

describe('imprimirPDFA4() — mismo iframe, para blobs de PDF (NC, cierre de caja)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (typeof (URL as any).createObjectURL !== 'function') (URL as any).createObjectURL = () => 'blob:mock';
    if (typeof (URL as any).revokeObjectURL !== 'function') (URL as any).revokeObjectURL = () => {};
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('nunca abre una ventana nueva — usa el mismo iframe singleton que el resto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4 contenido de prueba'], { type: 'application/pdf' })),
    }));
    const openSpy = vi.spyOn(window, 'open');

    const p = imprimirPDFA4('/api/v1/notas-credito/1/pdf');
    await vi.advanceTimersByTimeAsync(10); // fetch + createObjectURL resueltos
    // El iframe navega a la URL del blob — jsdom no dispara 'load' solo, el
    // fallback (30s) es el camino determinista aquí, igual que en los demás tests.
    await vi.advanceTimersByTimeAsync(30_200);
    await p;

    expect(openSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#__hc-print-iframe').length).toBe(1);
  });

  it('revoca el blob URL al terminar — nunca queda sin revocar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    }));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    const p = imprimirPDFA4('/api/v1/caja/1/pdf');
    await vi.advanceTimersByTimeAsync(30_200);
    await p;

    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });
});
