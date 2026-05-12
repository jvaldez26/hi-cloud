import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/typography.css';
import './styles/darkmode.css';
import dayjs from 'dayjs';
import 'dayjs/locale/es-do';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.locale('es-do');

// ── Service Worker (PWA) — solo en producción ─────────────────────────────────
// En desarrollo el SW cachea módulos de Vite y rompe HMR y el module graph.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(reg => console.debug('[SW] registrado:', reg.scope))
      .catch(err => console.warn('[SW] error al registrar:', err));
  });
}

// En desarrollo: desregistrar el SW si quedó uno activo de una sesión anterior
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
