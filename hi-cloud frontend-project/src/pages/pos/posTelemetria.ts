/**
 * Telemetría del POS (Paso 2, 2026-10-08) — reporte URGENTE: varios usuarios
 * dicen que el POS "se congela" tras horas de uso y una pestaña nueva lo
 * arregla. Esto sube datos REALES de producción mientras se investiga/corrige
 * la causa (un listener `afterprint` que queda pegado en `window` por cada
 * venta impresa — ver printUtils.ts::_reciboOverlay — confirmado con
 * Playwright: 300/300 ventas simuladas, cero removidos).
 *
 * Tres señales, todas vía Sentry (ya inicializado en instrument.ts, con el
 * mismo scrubbing de PII fiscal):
 *   1. Long task > 2s en el hilo principal → warning inmediato con contexto
 *      (empresa, horas que lleva la pestaña abierta, memoria, ventas hechas
 *      en ESTA pestaña, última acción).
 *   2. Muestra cada 15 min de memoria/DOM/horas — solo se envía si supera un
 *      umbral, para no generar ruido en Sentry con pestañas sanas.
 *   3. Segunda pestaña del POS detectada (BroadcastChannel) — la UI decide
 *      cómo avisarlo; este módulo solo detecta y notifica por callback.
 *
 * Deliberadamente NO toca memoria pesada por sí mismo: nada de arrays que
 * crezcan, un solo intervalo, un solo PerformanceObserver, un solo canal.
 */
import * as Sentry from '@sentry/react';
import { onEventoImpresion, msImpresionPendiente, type EventoImpresion } from '../../utils/printUtils';

// ── Umbrales — ajustables cuando haya datos reales de 1-2 días ─────────────
const LONGTASK_MS_UMBRAL   = 2_000;
const HEAP_MB_UMBRAL        = 200;   // performance.memory.usedJSHeapSize
const DOM_NODES_UMBRAL      = 5_000; // document.getElementsByTagName('*').length
// Si una impresión tarda más que esto en terminar (afterprint o fallback),
// reportar — sirve para confirmar/descartar en producción si los
// congelamientos reportados coinciden con impresiones que tardan minutos.
const IMPRESION_LENTA_MS_UMBRAL = 5_000;
// Al recuperar el foco de la pestaña, si hay una impresión que lleva más de
// esto sin terminar, avisar al cajero — puede estar atascada esperando que
// cierre el cuadro de impresión de Chrome.
const IMPRESION_PENDIENTE_AL_VOLVER_MS_UMBRAL = 3_000;

/** true si una impresión tardó más de lo esperado en terminar. */
export function debeAlertarImpresionLenta(duracionMs: number): boolean {
  return duracionMs > IMPRESION_LENTA_MS_UMBRAL;
}

/** true si, al volver a la pestaña, una impresión pendiente lleva demasiado
 *  tiempo sin terminar como para asumir que el cajero sigue esperando algo. */
export function debeAvisarImpresionPendienteAlVolver(msPendiente: number | null): boolean {
  return msPendiente != null && msPendiente > IMPRESION_PENDIENTE_AL_VOLVER_MS_UMBRAL;
}

/** true si un long task debe reportarse — duración en ms. */
export function debeAlertarLongtask(durationMs: number): boolean {
  return durationMs > LONGTASK_MS_UMBRAL;
}

/** true si la muestra periódica (cada 15 min) debe reportarse a Sentry —
 *  solo cuando algo ya luce anormal, nunca "porque pasaron 15 minutos". */
export function debeAlertarMuestraPeriodica(m: {
  heapMB:   number | null;
  domNodes: number;
}): boolean {
  if (m.heapMB != null && m.heapMB > HEAP_MB_UMBRAL) return true;
  if (m.domNodes > DOM_NODES_UMBRAL) return true;
  return false;
}

export function horasAbiertaDesde(abiertaEnMs: number, ahoraMs = Date.now()): number {
  return +((ahoraMs - abiertaEnMs) / 3_600_000).toFixed(2);
}

function heapMBActual(): number | null {
  const mem = (performance as any).memory;
  return mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : null;
}

function domNodesActual(): number {
  return document.getElementsByTagName('*').length;
}

function iframesActual(): number {
  return document.getElementsByTagName('iframe').length;
}

// ── Estado de esta pestaña — vive mientras la pestaña viva, se resetea al
//    recargar. Es justamente lo que se quiere medir: qué se acumula POR
//    PESTAÑA con cada venta. ───────────────────────────────────────────────
let abiertaEnMs    = Date.now();
let ventasEnPestana = 0;
let ultimaAccion    = 'ninguna';
let empresaIdActual: string | number | null | undefined;

/** Llamar una vez por venta completada (éxito del cobro). */
export function registrarVentaCompletada(): void {
  ventasEnPestana++;
}

/** Llamar en los puntos de interés del POS (escaneo, cobro, cambio de panel...)
 *  para que el reporte de un long task diga qué estaba haciendo el cajero. */
export function registrarAccionPOS(accion: string): void {
  ultimaAccion = accion;
}

function contextoComun() {
  return {
    empresaId:       empresaIdActual != null ? String(empresaIdActual) : '(desconocida)',
    horasAbierta:     horasAbiertaDesde(abiertaEnMs),
    ventasEnPestana,
    ultimaAccion,
    heapMB:           heapMBActual(),
    domNodes:         domNodesActual(),
    iframes:          iframesActual(),
  };
}

let longtaskObserver: PerformanceObserver | null = null;
let muestraIntervalId: ReturnType<typeof setInterval> | null = null;
let bc: BroadcastChannel | null = null;
const TAB_ID = (() => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; }
})();

export interface TelemetriaPOSCallbacks {
  /** Segunda pestaña del POS detectada — la UI decide cómo avisarlo. */
  onOtraPestanaAbierta: () => void;
  /** Al volver a la pestaña, había una impresión sin terminar hace rato. */
  onImpresionPendienteAlVolver: () => void;
}

/**
 * Arranca la telemetría — llamar UNA VEZ al montar POSPage. Devuelve una
 * función de limpieza para el cleanup del useEffect.
 */
export function iniciarTelemetriaPOS(
  empresaId: string | number | null | undefined,
  callbacks: TelemetriaPOSCallbacks,
): () => void {
  const { onOtraPestanaAbierta, onImpresionPendienteAlVolver } = callbacks;
  empresaIdActual = empresaId;
  abiertaEnMs = Date.now();
  ventasEnPestana = 0;

  // 1. Long tasks > 2s en el hilo principal.
  try {
    longtaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (debeAlertarLongtask(entry.duration)) {
          Sentry.captureMessage('[POS] Long task > 2s en el hilo principal', {
            level: 'warning',
            tags: { origen: 'pos-telemetria', tipo: 'longtask' },
            extra: { duracionMs: Math.round(entry.duration), ...contextoComun() },
          });
        }
      }
    });
    longtaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // PerformanceObserver/longtask no soportado en este navegador — no es crítico.
  }

  // 2. Muestra periódica cada 15 min — solo se envía si supera el umbral.
  muestraIntervalId = setInterval(() => {
    const m = { heapMB: heapMBActual(), domNodes: domNodesActual() };
    if (debeAlertarMuestraPeriodica(m)) {
      Sentry.captureMessage('[POS] Muestra periódica por encima del umbral', {
        level: 'warning',
        tags: { origen: 'pos-telemetria', tipo: 'muestra-periodica' },
        extra: contextoComun(),
      });
    }
  }, 15 * 60_000);

  // 3. Segunda pestaña del POS — ping/pong por BroadcastChannel.
  try {
    bc = new BroadcastChannel('hicloud-pos-tabs');
    bc.onmessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; tabId?: string } | undefined;
      if (!data || data.tabId === TAB_ID) return;
      if (data.type === 'ping') bc?.postMessage({ type: 'pong', tabId: TAB_ID });
      if (data.type === 'pong') onOtraPestanaAbierta();
    };
    bc.postMessage({ type: 'ping', tabId: TAB_ID });
  } catch {
    // BroadcastChannel no soportado (Safari viejo) — no es crítico.
  }

  // 4. Eventos de impresión — breadcrumb siempre, warning si tarda demasiado.
  // Sirve para correlacionar: cuando llegue un longtask/muestra, el trail de
  // breadcrumbs de Sentry ya muestra si había una impresión en curso.
  const offImpresion = onEventoImpresion((e: EventoImpresion) => {
    Sentry.addBreadcrumb({
      category: 'pos-impresion',
      message:  e.tipo === 'inicio' ? 'inicio' : `fin (${e.duracionMs}ms)`,
      level:    'info',
    });
    if (e.tipo === 'fin' && debeAlertarImpresionLenta(e.duracionMs)) {
      Sentry.captureMessage('[POS] Impresión tardó más de lo esperado', {
        level: 'warning',
        tags:  { origen: 'pos-telemetria', tipo: 'impresion-lenta' },
        extra: { duracionMs: e.duracionMs, ...contextoComun() },
      });
    }
  });

  // 5. Al recuperar el foco, si queda una impresión pendiente hace rato, avisar.
  const onVisibleImpresion = () => {
    if (document.visibilityState !== 'visible') return;
    if (debeAvisarImpresionPendienteAlVolver(msImpresionPendiente())) {
      onImpresionPendienteAlVolver();
    }
  };
  document.addEventListener('visibilitychange', onVisibleImpresion);

  return () => {
    longtaskObserver?.disconnect();
    longtaskObserver = null;
    if (muestraIntervalId) clearInterval(muestraIntervalId);
    muestraIntervalId = null;
    bc?.close();
    bc = null;
    offImpresion();
    document.removeEventListener('visibilitychange', onVisibleImpresion);
  };
}
