import { useState, useEffect } from 'react';
import { Button, notification } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useVersionPing, VERSION_POLL_APP } from '../../hooks/useVersionPing';

const NOTIF_KEY  = 'new-version';
const CURRENT_BUILD = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;

/**
 * Detecta silenciosamente si el servidor desplegó una versión nueva (distinto
 * commit SHA en /api/v1/version → build_id) y muestra una notificación
 * persistente que el usuario puede cerrar o usar para recargar.
 * Solo reacciona en producción y cuando VITE_SENTRY_RELEASE está definido.
 *
 * El sondeo lo comparte con el indicador de conectividad del POS a través de
 * useVersionPing: una sola queryKey, un solo request. Este componente vive en
 * la raíz de App, así que fuera del POS el intervalo es de 5 min; con el POS
 * abierto, React Query usa el suyo (30 s) para ambos.
 */
export default function NewVersionBanner() {
  const [showing, setShowing] = useState(false);
  const { data } = useVersionPing(VERSION_POLL_APP);
  const serverBuild = data?.buildId ?? null;

  useEffect(() => {
    if (!CURRENT_BUILD || !import.meta.env.PROD) return;
    // `online: false` deja buildId en null → no se confunde una caída de red
    // con un deploy nuevo.
    if (serverBuild && serverBuild !== CURRENT_BUILD) setShowing(true);
  }, [serverBuild]);

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
