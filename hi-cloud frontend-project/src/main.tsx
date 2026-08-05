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
      .register('/sw.js', { scope: '/' })
      .then(reg => { console.debug('[SW] registrado:', reg.scope); })
      .catch(err => console.warn('[SW] error al registrar:', err));
  });
}

// ── Recuperación de chunk load errors (deploy mid-session) ───────────────────
// Cuando el SW activa mid-session, los import() de chunks viejos pueden fallar.
// Primera falla → recarga automática. Segunda → deja propagar al ErrorBoundary.
// En ambos casos dejamos un breadcrumb en Sentry para tener trazabilidad sin
// inundar el feed de errores (beforeSend ya filtra el evento de error en sí).
window.addEventListener('vite:preloadError', (event) => {
  const alreadyReloaded = !!sessionStorage.getItem('_preload_reloaded');

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
    sessionStorage.setItem('_preload_reloaded', '1');
    window.location.reload();
  }
  // Segunda falla: no prevenir default → ErrorBoundary lo captura
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
