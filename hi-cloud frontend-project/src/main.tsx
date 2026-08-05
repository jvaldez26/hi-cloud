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
// Cuando el SW activa una nueva versión y toma control del tab, los import()
// de chunks con hash viejo pueden fallar si el SW aborta el fetch en tránsito.
// Primera falla → recarga automática una vez. Segunda falla → deja propagar el
// error para que el ErrorBoundary muestre el botón de "Recargar página".
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault(); // suprime el uncaught rejection de Vite
  if (!sessionStorage.getItem('_preload_reloaded')) {
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
