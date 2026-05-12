import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resetea el scroll al navegar entre rutas.
 * El scroll ocurre en #main-content (no en el body): el layout usa
 * height:100vh + overflow:hidden para evitar saltos de posición.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const el = document.getElementById('main-content');
    if (el) el.scrollTop = 0;
  }, [pathname]);

  return null;
}
