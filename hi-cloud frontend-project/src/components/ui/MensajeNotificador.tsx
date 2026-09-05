import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, theme } from 'antd';
import { MessageOutlined, CloseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { mensajesApi, type MensajeBandeja } from '../../api/mensajes.api';
import { MENSAJES_KEYS } from '../../hooks/useMensajes';
import { useAuthStore } from '../../store/auth.store';
import { posEstado } from '../../utils/posEstado';
import { getGlobalSocket, useRealtimeStatus } from '../../hooks/useRealtime';

/** Cada cuánto se consulta al servidor si hay mensajes nuevos.
 *  NUNCA bajar de 1 min — hay clientes con el POS abierto todo el día. */
const POLL_MS   = 5 * 60 * 1000;

/** El toast se cierra solo a los 10 s. */
const AUTOCLOSE = 10_000;

/** Veces que se reintenta registrar el visto antes de rendirse. Sin tope, un
 *  endpoint caído repetiría el toast cada 10 s para siempre. */
const MAX_REINTENTOS_VISTO = 3;

/**
 * EL TIPO NO DECIDE SI SE NOTIFICA. DECIDE CÓMO SE VE.
 *
 * Los dos tipos interrumpen igual. Lo que cambia es el icono, el color de acento
 * y la etiqueta, para que se vea de un vistazo si es "el sistema estuvo caído" o
 * "hay una función nueva".
 *
 * Antes el tipo sí decidía: la consulta filtraba `tipo = 'novedad'` y los avisos
 * no se notificaban nunca. En producción eso significó que los cinco mensajes
 * que existían —caídas de servicio, e-CF rechazados— no llegaran a nadie, que es
 * justo lo contrario de lo razonable.
 *
 * Si algún día hace falta un tipo que NO interrumpa, eso es un campo propio
 * ("notificar sí/no" en el formulario de redacción), no un efecto lateral de
 * elegir un tipo u otro. Nadie puede adivinar desde el formulario que escoger
 * "Aviso" significaba "que no lo vea nadie".
 *
 * Nada de rojo: esto informa, no alarma.
 */
type TipoMensaje = 'aviso' | 'novedad' | string;

function estiloDeTipo(tipo: TipoMensaje, token: Record<string, any>) {
  // Aviso operativo: ámbar. Novedad de producto: el azul de la marca.
  return tipo === 'aviso'
    ? { acento: token.colorWarning, etiqueta: 'Aviso de HiCloud',   esAviso: true  }
    : { acento: token.colorPrimary, etiqueta: 'Novedad de HiCloud', esAviso: false };
}

// ── Accesibilidad: mismo patrón que SkeletonTabla.tsx / SkeletonProductos.tsx ──
// Sin suscripción a cambios en vivo (igual que en esos dos archivos): se lee al
// renderizar, que es cuando el toast se monta — no hace falta más para esto.
function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Notificador flotante de mensajes nuevos del Super Admin.
 *
 * ── Por qué se monta en la raíz y no dentro de AppLayout ────────────────────
 * El POS y /super-admin/* viven fuera de AppLayout. Montado aquí (junto a
 * ActividadGuard) cubre todas las rutas autenticadas sin excepción.
 *
 * ── Cómo evita interrumpir una venta ────────────────────────────────────────
 * Antes de mostrar consulta posEstado.modalCobroAbierto. Si el POS tiene
 * el modal de cobro abierto, espera (tick de 1 s) hasta que se cierre.
 *
 * ── Cómo llega el aviso: canal primero, sondeo de respaldo ──────────────────
 * Al publicar, el backend emite `mensaje:nuevo` por el mismo socket que ya usa
 * el ERP, y aquí se consulta al instante. El sondeo de 5 min se queda como
 * respaldo y NO se toca: es la única vía cuando no hay canal (/portal-empleado,
 * sin empresaId, pestaña dormida o socket caído — Socket.IO no reencola nada).
 *
 * Bajar el intervalo del sondeo no era la respuesta: con el POS abierto todo el
 * día, sondear cada pocos segundos son miles de peticiones diarias por usuario
 * para algo que ocurre una vez a la semana.
 *
 * Un mensaje PROGRAMADO no dispara evento a su hora: nadie lo está esperando.
 * Lo recoge el sondeo, así que puede tardar hasta 5 minutos en aparecer.
 *
 * ── Por qué este sondeo NO cuenta como actividad de sesión ──────────────────
 * ActividadGuard mide eventos de entrada del usuario (mouse, teclado, scroll).
 * Los GET automáticos no disparan esos eventos → la sesión se cierra igual
 * por inactividad.
 */
export default function MensajeNotificador() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  // Solo para re-enganchar el listener cuando el socket conecta o reconecta
  const estadoRealtime = useRealtimeStatus();
  const isAuth    = useAuthStore(s => s.isAuth());
  const user      = useAuthStore(s => s.user);

  // El Super Admin envía mensajes pero no los recibe.
  // El empleado puede recibirlos según el destinatario que configure el SA.
  const activo = isAuth && user?.role !== 'super_admin';

  // IDs que ya procesamos en esta sesión (complementa el vistoEn del servidor)
  const procesadosRef = useRef<Set<string>>(new Set());
  // IDs pendientes de mostrar (esperando que el POS cierre su modal de cobro)
  const pendingRef    = useRef<string[]>([]);
  // Cuántas veces ha fallado ya el registro del visto, por id
  const reintentosRef = useRef<Map<string, number>>(new Map());

  const [visible,  setVisible]  = useState(false);
  const [msgs,     setMsgs]     = useState<MensajeBandeja[]>([]);
  const reducirMovimiento = usePrefersReducedMotion();

  // ── Polling ────────────────────────────────────────────────────────────────
  const { data: novedadesIds = [] } = useQuery({
    // La clave sale de MENSAJES_KEYS y no como literal: si otro sitio
    // invalida esta consulta, tiene que ser exactamente la misma cadena.
    queryKey:        MENSAJES_KEYS.mensajesNoVistos,
    queryFn:         mensajesApi.getMensajesNoVistos,
    enabled:         activo,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime:       POLL_MS,
  });

  // ── Aviso inmediato por el canal en tiempo real ───────────────────────────
  // El sondeo de arriba tarda hasta 5 min. Cuando el Super Admin publica, el
  // backend emite `mensaje:nuevo` por el socket y aquí se consulta al instante.
  //
  // El evento viene VACÍO a propósito: solo dice "vuelve a preguntar". El
  // contenido y el filtrado por destinatario siguen en el servidor, así que por
  // el socket no viaja ningún mensaje que no fuera para este usuario.
  //
  // ── El sondeo NO se sustituye, se adelanta ─────────────────────────────────
  // Sigue siendo la única vía cuando no hay canal, y hay tres casos reales:
  //   · /portal-empleado — queda fuera de AppLayout, que es donde se monta
  //     useRealtime, así que ahí NUNCA hay socket;
  //   · sin `empresaId` en localStorage, useRealtime no llega a conectar;
  //   · pestaña dormida o socket caído: el navegador suspende los WebSocket en
  //     segundo plano y Socket.IO no reencola lo que se perdió.
  //
  // Se re-engancha cuando cambia el estado de la conexión: el notificador vive
  // en la raíz y se monta ANTES que AppLayout, así que al principio el socket
  // todavía no existe.
  useEffect(() => {
    if (!activo) return;
    const socket = getGlobalSocket();
    if (!socket) return;

    const alPublicarse = () => {
      qc.invalidateQueries({ queryKey: MENSAJES_KEYS.mensajesNoVistos });
    };
    socket.on('mensaje:nuevo', alPublicarse);
    return () => { socket.off('mensaje:nuevo', alPublicarse); };
  }, [activo, estadoRealtime, qc]);

  // Cuando el servidor devuelve IDs nuevos, los encola.
  //
  // Aquí NO se marca visto. Se marca cuando el toast aparece de verdad, en
  // mostrarPendiente() — que es el contrato que documenta el backend
  // ("el frontend muestra el toast y llama marcarVisto").
  //
  // Marcarlo aquí perdía mensajes: si el cajero tenía el modal de cobro abierto
  // y recargaba antes de que el tick lo mostrara, el mensaje quedaba visto en el
  // servidor y no se enseñaba nunca. Justo el escenario que la espera del POS
  // pretende proteger.
  useEffect(() => {
    if (!novedadesIds.length) return;
    const nuevos = novedadesIds.filter(id => !procesadosRef.current.has(id));
    if (!nuevos.length) return;

    // procesadosRef solo evita re-encolar el mismo id en cada poll de 5 min
    nuevos.forEach(id => procesadosRef.current.add(id));
    pendingRef.current = [...new Set([...pendingRef.current, ...nuevos])];
  }, [novedadesIds]);

  // ── Mostrar la notificación pendiente ─────────────────────────────────────
  const mostrarPendiente = useCallback(async () => {
    const ids = [...pendingRef.current];
    pendingRef.current = [];

    try {
      // Buscamos en ambas pestañas de la bandeja (avisos + novedades)
      const [principal, novedades] = await Promise.all([
        mensajesApi.getBandeja('principal'),
        mensajesApi.getBandeja('novedades'),
      ]);
      // Deduplicado por id: si un mensaje sale en las dos pestañas, sin esto se
      // cuenta dos veces y el toast anuncia "2 mensajes nuevos" habiendo uno.
      const porId = new Map<string, MensajeBandeja>();
      for (const m of [...principal, ...novedades]) {
        if (ids.includes(m.id)) porId.set(m.id, m);
      }
      const relevantes = [...porId.values()];
      if (!relevantes.length) return; // ya archivados o eliminados
      setMsgs(relevantes);
      setVisible(true);

      // El toast ya está en pantalla: AHORA se registra el visto.
      //
      // Si el POST falla, el id vuelve a la cola para que el siguiente tick lo
      // reintente. Tragarse el error dejaba al servidor sin constancia de que se
      // mostró, así que al recargar volvía a salir igualmente — con la
      // diferencia de que nadie se enteraba de que el registro no se hizo.
      //
      // Reintentos acotados: si el endpoint está caído, sin tope el toast se
      // repetiría cada 10 s indefinidamente.
      for (const m of relevantes) {
        mensajesApi.marcarVisto(m.id).catch(() => {
          const intentos = (reintentosRef.current.get(m.id) ?? 0) + 1;
          reintentosRef.current.set(m.id, intentos);
          if (intentos >= MAX_REINTENTOS_VISTO) return;
          procesadosRef.current.delete(m.id);
          pendingRef.current = [...new Set([...pendingRef.current, m.id])];
        });
      }
    } catch {
      // Red caída al leer la bandeja: devolvemos los IDs para el siguiente tick
      pendingRef.current = ids;
    }
  }, []);

  // Tick de 1 s — comprueba si se puede mostrar la notificación pendiente
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => {
      if (!pendingRef.current.length) return;
      if (visible) return;
      if (posEstado.modalCobroAbierto) return; // espera a que se cierre la venta
      mostrarPendiente();
    }, 1000);
    return () => clearInterval(id);
  }, [activo, visible, mostrarPendiente]);

  // ── Auto-cierre con barra de progreso ─────────────────────────────────────
  // La barra ya no depende de estado de React: es una animación CSS de
  // `transform: scaleX()` que corre sola durante AUTOCLOSE ms (ver el JSX más
  // abajo). Antes se recalculaba con setInterval cada 80ms y forzaba un
  // re-render de todo el componente en cada tick (~125 renders por toast); el
  // cierre real siempre fue este setTimeout, independiente de esos renders.
  const cerrar = useCallback(() => {
    setVisible(false);
    setMsgs([]);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const closeId = setTimeout(cerrar, AUTOCLOSE);
    return () => clearTimeout(closeId);
  }, [visible, cerrar]);

  if (!visible || !msgs.length) return null;

  const count = msgs.length;
  const first = msgs[0];

  // Con varios a la vez manda el aviso: si entre ellos hay uno operativo, el
  // toast se pinta como aviso. Rebajarlo a "novedad" escondería lo urgente
  // detrás de lo accesorio.
  const hayAviso = msgs.some(m => m.tipo === 'aviso');
  const { acento, etiqueta, esAviso } = estiloDeTipo(hayAviso ? 'aviso' : 'novedad', token);
  const Icono = esAviso ? InfoCircleOutlined : MessageOutlined;

  return (
    <>
      <style>{`
        @keyframes hc-notif-in {
          from { transform: translateY(-116%); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
        }
        /* prefers-reduced-motion: se queda el fundido, se quita el desplazamiento */
        @keyframes hc-notif-in-reducida {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes hc-progreso {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position:     'fixed',
          top:          16,
          right:        16,
          width:        360,
          maxWidth:     'calc(100vw - 32px)',
          zIndex:       2000,
          borderRadius: 12,
          overflow:     'hidden',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.15)',
          background:   token.colorBgElevated,
          border:       `1px solid ${token.colorBorderSecondary}`,
          // Franja de acento: distingue aviso de novedad sin tener que leer
          borderLeft:   `3px solid ${acento}`,
          animation: reducirMovimiento
            ? 'hc-notif-in-reducida 0.28s ease-out'
            : 'hc-notif-in 0.28s cubic-bezier(.22,.68,0,1.2)',
        }}
      >
        {/* Barra de progreso — se vacía en 10 s.
            `transform: scaleX()` en vez de `width`: no dispara layout/paint en
            cada frame, solo compositing. `transform-origin: left` para que se
            achique hacia la derecha manteniendo el borde izquierdo fijo —
            igual que se veía con el `width` decreciente. Con reduced-motion
            se queda fija y llena: el autocierre (el setTimeout de arriba) no
            depende de esto y sigue funcionando igual. */}
        <div style={{ height: 3, background: token.colorFillTertiary }}>
          <div style={{
            height:         '100%',
            width:          '100%',
            transformOrigin: 'left',
            background:     token.colorPrimary,
            ...(reducirMovimiento
              ? { transform: 'scaleX(1)' }
              : { animation: `hc-progreso ${AUTOCLOSE}ms linear forwards` }),
          }} />
        </div>

        <div style={{ padding: '12px 14px 14px' }}>
          {/* Encabezado */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icono style={{ color: acento, fontSize: 14 }} />
              <span style={{
                fontSize:      11,
                color:         token.colorTextSecondary,
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {etiqueta}
              </span>
            </div>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 11 }} />}
              onClick={cerrar}
              aria-label="Cerrar"
              style={{ padding: 0, height: 24, width: 24, minWidth: 24 }}
            />
          </div>

          {/* Contenido */}
          {count === 1 ? (
            <>
              <div style={{
                fontWeight:   600,
                fontSize:     14,
                color:        token.colorText,
                marginBottom: 4,
                lineHeight:   1.4,
              }}>
                {first.titulo}
              </div>
              <div style={{
                fontSize:          13,
                color:             token.colorTextSecondary,
                lineHeight:        1.5,
                display:           '-webkit-box',
                WebkitLineClamp:   2,
                WebkitBoxOrient:   'vertical',
                overflow:          'hidden',
              }}>
                {first.cuerpo}
              </div>
            </>
          ) : (
            <div style={{
              fontWeight: 600,
              fontSize:   14,
              color:      token.colorText,
            }}>
              Tienes {count} mensajes nuevos de HiCloud
            </div>
          )}

          {/* Acciones — área táctil de 44 px en móvil */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              type="primary"
              size="small"
              style={{ flex: 1, height: 44, fontSize: 13, fontWeight: 500 }}
              onClick={() => { cerrar(); navigate('/bandeja'); }}
            >
              Ver mensaje{count > 1 ? 's' : ''}
            </Button>
            <Button
              size="small"
              style={{ flex: 1, height: 44, fontSize: 13 }}
              onClick={cerrar}
            >
              Después
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
