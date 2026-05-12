import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ minimum: 0.2, speed: 250, trickleSpeed: 150, showSpinner: false });

const CSS = `
  #nprogress .bar { background: #1677ff !important; height: 2px !important; z-index: 9999 !important; }
  #nprogress .peg { box-shadow: 0 0 8px #1677ff, 0 0 4px #1677ff !important; }
`;

export default function NavigationProgress() {
  const { pathname } = useLocation();
  const styleInjected = useRef(false);

  // Inyectar CSS solo una vez, dentro de React (no a nivel de módulo)
  useEffect(() => {
    if (!styleInjected.current && !document.getElementById('nprogress-custom')) {
      const el = document.createElement('style');
      el.id = 'nprogress-custom';
      el.textContent = CSS;
      document.head.appendChild(el);
      styleInjected.current = true;
    }
  }, []);

  useEffect(() => {
    NProgress.start();
    const t = setTimeout(() => NProgress.done(), 120);
    return () => { clearTimeout(t); NProgress.done(); };
  }, [pathname]);

  return null;
}
