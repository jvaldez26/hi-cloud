import { useState, useEffect, useRef } from 'react';
import { Button, notification } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useVersionPing, VERSION_POLL_APP } from '../../hooks/useVersionPing';
import { ahora } from '../../utils/fechaRD';

const NOTIF_KEY  = 'new-version';
const CURRENT_BUILD = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;

/**
 * Durante un despliegue hay unos minutos en los que nginx ya sirve el bundle
 * nuevo pero PM2 todavía corre el backend viejo. En esa ventana el desajuste es
 * REAL —conviven dos versiones— así que recargar no lo arregla: el aviso vuelve
 * a salir enseguida, y otra vez, hasta que termina el deploy.
 *
 * Un banner que reaparece después de obedecerlo enseña a ignorarlo. Y el día
 * que el aviso sea de verdad, nadie recargará. Así que:
 *
 *   - de un build_id por el que el usuario YA recargó no se vuelve a avisar;
 *   - y tras cualquier recarga se espera un rato antes de volver a insistir.
 */
export const CLAVE_RECARGA = 'hicloud-version-recargada';
export const ESPERA_TRAS_RECARGA_MS = 10 * 60_000;

export interface Recarga { build: string; ts: number }

/**
 * Decide si toca avisar. Está fuera del componente a propósito: es la única
 * parte con reglas de verdad, y dentro de un efecto de React no hay forma de
 * probarla.
 *
 * Devuelve `esperarMs` cuando la respuesta es "ahora no, pero vuelve a mirar":
 * el sondeo por sí solo no dispararía la reevaluación, porque el build_id del
 * servidor no cambia mientras dura el despliegue.
 */
export function decidirAviso(e: {
  buildBundle:   string | undefined;
  buildServidor: string | null;
  recarga:       Recarga | null;
  ahoraMs:       number;
}): { avisar: boolean; esperarMs?: number } {
  // Sin build embebido no hay con qué comparar (build local, preview, etc.).
  if (!e.buildBundle) return { avisar: false };
  // buildServidor null = el backend no respondió. Una caída de red no es un
  // despliegue.
  if (!e.buildServidor) return { avisar: false };
  if (e.buildServidor === e.buildBundle) return { avisar: false };

  const previa = e.recarga;
  if (previa) {
    // Ya recargó por este mismo build_id: pedírselo otra vez no cambia nada.
    if (previa.build === e.buildServidor) return { avisar: false };

    const transcurrido = e.ahoraMs - previa.ts;
    // Un reloj adelantado en el equipo daría un transcurrido negativo; se trata
    // como "acaba de recargar" en vez de dejar pasar el aviso.
    if (transcurrido < ESPERA_TRAS_RECARGA_MS) {
      return { avisar: false, esperarMs: Math.max(0, ESPERA_TRAS_RECARGA_MS - transcurrido) };
    }
  }

  return { avisar: true };
}

function leerRecarga(): Recarga | null {
  try {
    const crudo = localStorage.getItem(CLAVE_RECARGA);
    if (!crudo) return null;
    const r = JSON.parse(crudo) as Recarga;
    return typeof r?.build === 'string' && typeof r?.ts === 'number' ? r : null;
  } catch {
    return null;   // localStorage lleno, deshabilitado o valor corrupto
  }
}

function anotarRecarga(build: string) {
  // La hora sale de ahora(), que va con la del servidor: el reloj del equipo
  // puede estar mal y aquí se compara un intervalo.
  try {
    localStorage.setItem(CLAVE_RECARGA, JSON.stringify({ build, ts: ahora().getTime() }));
  } catch { /* si no se puede guardar, se avisará de nuevo: molesto, no roto */ }
}

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
  /** Sube cuando vence la espera, para volver a evaluar sin depender del sondeo. */
  const [reintento, setReintento] = useState(0);
  const { data } = useVersionPing(VERSION_POLL_APP);
  const serverBuild = data?.buildId ?? null;

  // El aviso se crea una vez y su botón captura el build de ese instante. Si
  // entretanto entra otro despliegue, hay que anotar el build ACTUAL —el que
  // seguirá sin cuadrar tras recargar—, no el que había al abrirlo.
  const ultimoBuild = useRef<string | null>(serverBuild);
  ultimoBuild.current = serverBuild;

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const d = decidirAviso({
      buildBundle:   CURRENT_BUILD,
      buildServidor: serverBuild,
      recarga:       leerRecarga(),
      ahoraMs:       ahora().getTime(),
    });

    if (d.avisar) { setShowing(true); return; }
    if (d.esperarMs !== undefined) {
      const t = setTimeout(() => setReintento(n => n + 1), d.esperarMs);
      return () => clearTimeout(t);
    }
  }, [serverBuild, reintento]);

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
            // Se anota ANTES de recargar: después de recargar este código ya no
            // corre. Queda constancia de por qué build recargó, que es lo que
            // impide volver a darle la lata con el mismo.
            if (ultimoBuild.current) anotarRecarga(ultimoBuild.current);
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
