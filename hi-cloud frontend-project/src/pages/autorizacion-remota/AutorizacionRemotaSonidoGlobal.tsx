import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { autorizacionRemotaApi } from '../../api/autorizacionRemota.api';
import { useAuthStore } from '../../store/auth.store';
import { useAutorizacionRemotaSonidoStore } from '../../store/autorizacionRemotaSonido.store';
import { reproducirBeepAutorizacion, intentarDesbloquearAudio } from './beepAutorizacion';
import { solicitudesQueDebenSonar, hayPendientesSinVer, contarPendientesSinVer, type SolicitudParaSonido } from './autorizacionSonidoGate';
import { debeIntentarDesbloqueoEnGesto } from './desbloqueoAudioGate';
import { leerPreferenciaSonido, guardarPreferenciaSonido } from './autorizacionSonidoPreferencia';

/**
 * Componente SIEMPRE montado (igual que SupervisorAuthGlobal, App.tsx) —
 * reproduce el sonido de "autorización pendiente" sin importar en qué
 * pantalla esté el supervisor, incluido el POS, que vive fuera de
 * AppLayout. Solo para ADMIN/CONTADOR: son quienes reciben la solicitud.
 *
 * Incidente que motiva esto: un supervisor con el panel de Equipo abierto
 * en otra pestaña no se enteraba de que un cajero esperaba autorización
 * hasta minutos después, cuando revisaba la campanita por costumbre.
 */
export default function AutorizacionRemotaSonidoGlobal() {
  const isAuth = useAuthStore(s => s.isAuth());
  const rol = useAuthStore(s => s.user?.role);
  if (!isAuth || (rol !== 'admin' && rol !== 'contador')) return null;
  return <AutorizacionRemotaSonidoGlobalInner />;
}

function AutorizacionRemotaSonidoGlobalInner() {
  const navigate = useNavigate();
  const userId = useAuthStore(s => s.user?.id);
  const vistas = useAutorizacionRemotaSonidoStore(s => s.vistas);
  const preferencia = useAutorizacionRemotaSonidoStore(s => s.preferencia);
  const setPreferencia = useAutorizacionRemotaSonidoStore(s => s.setPreferencia);

  // Mismo queryKey que SolicitudesAutorizacionPage.tsx — si ambos están
  // montados, React Query deduplica la petición; si no, cada uno trae su
  // propio caché con el mismo intervalo de respaldo del WebSocket.
  const { data: pendientesRaw = [] } = useQuery({
    queryKey: ['autorizacion-remota-pendientes'],
    queryFn:  autorizacionRemotaApi.pendientes,
    refetchInterval: 10_000,
    enabled: !!userId,
  });

  // Carga la preferencia guardada al store UNA vez por sesión — después de
  // esto, el store es la fuente de verdad (Perfil también escribe ahí, y
  // este componente, siempre montado, lo ve al instante sin recargar).
  useEffect(() => {
    if (userId != null) setPreferencia(leerPreferenciaSonido(userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const guardarPreferencia = (v: 'on' | 'off') => {
    setPreferencia(v);
    if (userId != null) guardarPreferenciaSonido(userId, v);
  };

  const pendientes: (SolicitudParaSonido & { titulo: string })[] = useMemo(
    () => pendientesRaw.map(p => ({
      id: p.id,
      expiraEnMs: new Date(p.expiraEn).getTime(),
      titulo: `${p.cajeroNombre} — ${p.clave}`,
    })),
    [pendientesRaw],
  );

  // Refs: el tick de 1s lee el valor más reciente sin recrear el interval
  // en cada cambio (evitaría perder el timing exacto de repetición).
  const pendientesRef = useRef(pendientes);
  pendientesRef.current = pendientes;
  const vistasRef = useRef(vistas);
  vistasRef.current = vistas;
  const preferenciaRef = useRef(preferencia);
  preferenciaRef.current = preferencia;
  const ultimoSonidoRef = useRef<Record<number, number>>({});
  const tituloOriginalRef = useRef<string>(document.title);
  const parpadeoVisibleRef = useRef(true);

  useEffect(() => {
    const id = setInterval(() => {
      const ahora = Date.now();
      const actuales = pendientesRef.current;
      const vistasActuales = vistasRef.current;

      // ── Parpadeo del título ──────────────────────────────────────────────
      const hayPend = hayPendientesSinVer(actuales, vistasActuales, ahora);
      if (hayPend) {
        const n = contarPendientesSinVer(actuales, vistasActuales, ahora);
        parpadeoVisibleRef.current = !parpadeoVisibleRef.current;
        document.title = parpadeoVisibleRef.current
          ? `(${n}) Autorización pendiente`
          : tituloOriginalRef.current;
      } else if (document.title !== tituloOriginalRef.current) {
        document.title = tituloOriginalRef.current;
      }

      // ── Sonido + notificación de sistema ─────────────────────────────────
      if (preferenciaRef.current !== 'on') return;
      const aSonar = solicitudesQueDebenSonar(actuales, vistasActuales, ultimoSonidoRef.current, ahora);
      if (!aSonar.length) return;

      reproducirBeepAutorizacion();
      for (const sid of aSonar) ultimoSonidoRef.current[sid] = ahora;

      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = aSonar.length;
        const unica = n === 1 ? actuales.find(s => s.id === aSonar[0]) : undefined;
        try {
          const notif = new Notification(
            n === 1 ? 'Autorización pendiente' : `${n} autorizaciones pendientes`,
            { body: unica?.titulo ?? 'Toca para revisar las solicitudes pendientes.', tag: 'autorizacion-remota', silent: true },
          );
          notif.onclick = () => {
            window.focus();
            navigate(unica ? `/autorizacion-remota?id=${unica.id}` : '/autorizacion-remota');
            notif.close();
          };
        } catch { /* best-effort — nunca debe romper el tick */ }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [navigate]);

  // Restaura el título real al desmontar (logout, etc.) — nunca dejar la
  // pestaña parpadeando para un usuario que ya no tiene sesión.
  useEffect(() => () => { document.title = tituloOriginalRef.current; }, []);

  // Desbloqueo automático con el PRIMER gesto real del usuario en cualquier
  // parte de la app — tocar "Ver y responder", el menú o cualquier botón
  // ya activa el sonido, sin un paso extra ni un banner aparte. Si el
  // usuario lo apagó a mano en Perfil, este listener no hace nada (nunca
  // se reactiva solo). `{ once: true }` en cada tipo de evento: basta un
  // gesto para decidir si el audio quedó desbloqueado o no.
  useEffect(() => {
    const onGesto = () => {
      const st = useAutorizacionRemotaSonidoStore.getState();
      if (!debeIntentarDesbloqueoEnGesto(st.preferencia)) return;
      void intentarDesbloquearAudio().then((ok) => {
        st.setAudioDesbloqueado(ok);
        if (!ok) return;
        guardarPreferencia('on');
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      });
    };
    window.addEventListener('pointerdown', onGesto, { once: true });
    window.addEventListener('keydown', onGesto, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesto);
      window.removeEventListener('keydown', onGesto);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}
