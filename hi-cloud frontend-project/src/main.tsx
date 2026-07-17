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
      .then(reg => {
        console.debug('[SW] registrado:', reg.scope);

        // Cuando el SW activa una nueva versión, envía SW_UPDATED.
        // Recargamos la página para que el usuario reciba los assets nuevos.
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SW_UPDATED') {
            console.info('[SW] Nueva versión detectada — recargando…');
            window.location.reload();
          }
        });
      })
      .catch(err => console.warn('[SW] error al registrar:', err));
  });
}

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
