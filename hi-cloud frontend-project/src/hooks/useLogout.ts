import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from 'antd';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import { markNavigatingAway } from '../utils/sessionEvents';
import { contarBorradoresDeUsuario, descartarBorradoresDeUsuario } from './useFormDraft';

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
 * se corrija en un lado y no en el otro. El mismo motivo aplica al aviso de
 * borradores sin guardar (useFormDraft): vive aquí, no en cada botón de salir.
 */
export function useLogout() {
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);

  return useCallback(async () => {
    const { user, empresaActual } = useAuthStore.getState();
    const nBorradores = await contarBorradoresDeUsuario(user?.id, empresaActual);

    if (nBorradores > 0) {
      const descartarYSalir = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: `Tienes ${nBorradores} borrador${nBorradores === 1 ? '' : 'es'} sin guardar`,
          content: 'Si sales ahora los pierdes. Puedes conservarlos (quedan guardados 7 días) y salir luego, o descartarlos y salir ya.',
          okText: 'Descartar y salir',
          okButtonProps: { danger: true },
          cancelText: 'Conservar',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!descartarYSalir) return; // "Conservar" — no se cierra la sesión
      await descartarBorradoresDeUsuario(user?.id, empresaActual);
    }

    markNavigatingAway();
    try { await authApi.logout(); } catch { /* ignorar — token ya inválido o red caída */ }
    logout();
    navigate('/login');
  }, [logout, navigate]);
}
