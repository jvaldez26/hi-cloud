import './instrument'; // Sentry.init — debe ejecutarse antes que cualquier otro módulo
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/typography.css';
import './styles/darkmode.css';
import dayjs from 'dayjs';
import 'dayjs/locale/es-do';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.locale('es-do');

// ── Service Worker (PWA) — solo en producción ────────────────────────────────
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // updateViaCache:'none' → el script del SW y sus imports se piden SIEMPRE
      // saltándose la HTTP cache. /sw.js no lleva hash en el nombre, así que si
      // el servidor lo marca cacheable (hoy sale con max-age=31536000,immutable)
      // el navegador podría quedarse con un service worker viejo que nunca se
      // actualiza: no ejecuta `activate`, no purga cachés y sigue sirviendo lo
      // que tenga guardado.
      //
      // Chrome ya acota eso por su cuenta (revalida el script principal y limita
      // su caché a 24 h), pero los cajeros usan WebViews y navegadores viejos
      // donde ese límite no está garantizado. Son dos líneas y cubren el caso
      // que no se puede medir desde aquí. La cabecera del servidor se arregla
      // aparte; esto no depende de ella.
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(reg => { console.debug('[SW] registrado:', reg.scope); })
      .catch(err => console.warn('[SW] error al registrar:', err));
  });
}

// ── Recuperación de chunk load errors (deploy mid-session) ───────────────────
// Cuando el SW activa mid-session, los import() de chunks viejos pueden fallar.
// Primera falla → recarga automática. Segunda → deja propagar al ErrorBoundary.
// En ambos casos dejamos un breadcrumb en Sentry para tener trazabilidad sin
// inundar el feed de errores (beforeSend ya filtra el evento de error en sí).
/** Ventana mínima entre auto-recargas. Ver VENTANA_RECARGA_MS abajo. */
const VENTANA_RECARGA_MS = 60_000;

window.addEventListener('vite:preloadError', (event) => {
  // Antes esto era un booleano que NUNCA se limpiaba: la primera falla de la
  // sesión recargaba y todas las siguientes iban directas al ErrorBoundary. En
  // un POS abierto desde la mañana con varios deploys al día, eso significa que
  // solo el primer deploy se recuperaba solo.
  //
  // Ahora se guarda el TIMESTAMP de la última auto-recarga:
  //   - Hace más de 60 s  → fue otro incidente (otro deploy): recargar.
  //   - Hace menos de 60 s → la recarga anterior no arregló nada; insistir sería
  //     un bucle infinito de recargas. Se deja pasar al ErrorBoundary, y si ni
  //     eso pinta, la red de seguridad de index.html da la salida a los 15 s.
  let ultimaRecarga = 0;
  try { ultimaRecarga = Number(sessionStorage.getItem('_preload_reloaded')) || 0; } catch { /* modo privado */ }
  const alreadyReloaded = ultimaRecarga > 0 && (Date.now() - ultimaRecarga) < VENTANA_RECARGA_MS;

  // Breadcrumb en Sentry (solo si está inicializado) — da contexto sin ruido
  try {
    const S = (window as any).__SENTRY__;
    if (S?.hub?.addBreadcrumb) {
      S.hub.addBreadcrumb({
        category:  'chunk-load-error',
        message:   `vite:preloadError — ${alreadyReloaded ? 'second failure, not reloading' : 'auto-reloading'}`,
        level:     'warning',
        data:      { url: (event as any).payload?.toString?.() ?? '' },
      });
    }
  } catch { /* Sentry no disponible */ }

  if (!alreadyReloaded) {
    event.preventDefault(); // suprime el uncaught rejection de Vite
    try { sessionStorage.setItem('_preload_reloaded', String(Date.now())); } catch { /* modo privado */ }
    window.location.reload();
  }
  // Falla dentro de la ventana: no prevenir default → ErrorBoundary lo captura
});

// En desarrollo: desregistrar cualquier SW activo para no interferir con HMR
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Señal para la red de seguridad del arranque (script inline de index.html).
// Ese script muestra una pantalla de recuperación si a los 15 s React no ha
// montado. Marcarlo aquí, después de render(), es lo que la cancela.
//
// Se pone también en un microtask: si un error de render dejara el árbol a
// medias, la bandera ya estaría puesta y perderíamos el rescate. Con el
// microtask, un throw síncrono durante el primer render impide llegar aquí.
queueMicrotask(() => { (window as any).__APP_MONTADA = true; });

// El primer arranque limpio de la sesión invalida la marca de auto-recarga:
// si la app carga bien, el siguiente deploy vuelve a tener derecho a recuperar
// automáticamente en vez de mandar al usuario al ErrorBoundary.
try { sessionStorage.removeItem('_preload_reloaded'); } catch { /* modo privado */ }

// El loader HTML se reemplaza automáticamente cuando React monta #root.
// Este cleanup es defensa extra por si el nodo persiste en algún edge case.
const _hideLoader = () => {
  const l = document.getElementById('app-loader');
  if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 300); }
};
if (document.readyState === 'complete') {
  setTimeout(_hideLoader, 400);
} else {
  window.addEventListener('load', () => setTimeout(_hideLoader, 400));
}
