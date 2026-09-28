import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { markNavigatingAway } from '../utils/sessionEvents';

/**
 * Cierre de sesión unificado: notifica al servidor (keepalive:true — sobrevive
 * al cierre de pestaña) y luego limpia el estado local antes de navegar.
 * Siempre marca la bandera antes de navegar para que Sentry, ErrorBoundary
 * y el interceptor de Axios no fallen en teardown.
 *
 * Antes vivía duplicado dentro de AppLayout.tsx; se extrae aquí porque el
 * orden de estos tres pasos es el que importa (ver el propio comentario),
 * y un segundo punto de entrada a la sesión (como el widget de cuenta del
 * Dashboard) no puede repetir la secuencia a mano sin arriesgar que un día
 * se corrija en un lado y no en el otro.
 */
export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);

  return useCallback(async () => {
    markNavigatingAway();
    try { await authApi.logout(); } catch { /* ignorar — token ya inválido o red caída */ }
    logout();
    navigate('/login');
  }, [logout, navigate]);
}
