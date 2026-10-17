import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import { SoundOutlined, CloseOutlined } from '@ant-design/icons';
import { autorizacionRemotaApi } from '../../api/autorizacionRemota.api';
import { useAuthStore } from '../../store/auth.store';
import { useAutorizacionRemotaSonidoStore } from '../../store/autorizacionRemotaSonido.store';
import { reproducirBeepAutorizacion } from './beepAutorizacion';
import { solicitudesQueDebenSonar, hayPendientesSinVer, contarPendientesSinVer, type SolicitudParaSonido } from './autorizacionSonidoGate';
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

  const sinVer = hayPendientesSinVer(pendientes, vistas, Date.now());
  const cantidadSinVer = contarPendientesSinVer(pendientes, vistas, Date.now());

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

  const mostrarBanner = sinVer && preferencia == null;
  if (!mostrarBanner) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 1100,
        background: '#1e293b', color: '#fff', borderRadius: 10,
        padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        display: 'flex', alignItems: 'center', gap: 10, maxWidth: 340,
      }}
    >
      <SoundOutlined style={{ fontSize: 18, color: '#fbbf24', flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
        {cantidadSinVer > 1 ? `${cantidadSinVer} autorizaciones pendientes` : 'Autorización pendiente'} —
        activa el sonido para enterarte sin revisar la pantalla.
      </div>
      <Button
        size="small" type="primary"
        onClick={() => {
          reproducirBeepAutorizacion();
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
          }
          guardarPreferencia('on');
        }}
      >
        Activar sonido
      </Button>
      <CloseOutlined
        style={{ cursor: 'pointer', color: 'rgba(255,255,255,.6)', flexShrink: 0 }}
        onClick={() => setPreferencia('off')} // no guarda 'off' en localStorage: solo descarta por ahora, vuelve a preguntar la próxima vez
      />
    </div>
  );
}
