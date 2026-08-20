import { useState, useEffect, useRef } from 'react';
import { Button, notification } from 'antd';
import { SyncOutlined } from '@ant-design/icons';

const POLL_MS    = 5 * 60 * 1000; // 5 minutos
const NOTIF_KEY  = 'new-version';
const CURRENT_BUILD = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;

/**
 * Detecta silenciosamente si el servidor desplegó una versión nueva (distinto
 * commit SHA en /api/v1/version → build_id) y muestra una notificación
 * persistente que el usuario puede cerrar o usar para recargar.
 * Usa /version en lugar de /health para no disparar 18 queries de DB por tick.
 * Solo activo en producción y cuando VITE_SENTRY_RELEASE está definido.
 */
export default function NewVersionBanner() {
  const [showing, setShowing] = useState(false);
  const timer  = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!CURRENT_BUILD || !import.meta.env.PROD) return;

    const check = async () => {
      try {
        const res = await fetch('/api/v1/health/version', { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) return;
        const json = await res.json();
        const serverBuild = json?.data?.build_id as string | undefined | null;
        if (serverBuild && serverBuild !== CURRENT_BUILD) {
          clearInterval(timer.current);
          setShowing(true);
        }
      } catch {
        // error de red — ignorar, reintentar en el próximo tick
      }
    };

    timer.current = setInterval(check, POLL_MS);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    if (!showing) return;
    notification.info({
      key:      NOTIF_KEY,
      duration: 0,
      message:  'Versión nueva disponible',
      description: 'Hay una actualización del sistema. Recarga cuando puedas para aplicarla.',
      placement: 'bottomRight',
      btn: (
        <Button
          type="primary"
          size="small"
          icon={<SyncOutlined />}
          onClick={() => {
            notification.destroy(NOTIF_KEY);
            window.location.reload();
          }}
        >
          Recargar ahora
        </Button>
      ),
      onClose: () => setShowing(false),
    });
    return () => notification.destroy(NOTIF_KEY);
  }, [showing]);

  return null;
}
