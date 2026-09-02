import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, theme } from 'antd';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';
import { mensajesApi, type MensajeBandeja } from '../../api/mensajes.api';
import { useAuthStore } from '../../store/auth.store';
import { posEstado } from '../../utils/posEstado';

/** Cada cuánto se consulta al servidor si hay mensajes nuevos.
 *  NUNCA bajar de 1 min — hay clientes con el POS abierto todo el día. */
const POLL_MS   = 5 * 60 * 1000;

/** El toast se cierra solo a los 10 s. */
const AUTOCLOSE = 10_000;

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
 * ── Por qué no usa el canal WebSocket ───────────────────────────────────────
 * useRealtime solo emite `cambio` para entidades de negocio (facturas,
 * productos, clientes…). Los mensajes del Super Admin no pasan por ese canal;
 * añadirlos requeriría cambios en el gateway. Un sondeo cada 5 min es
 * suficiente para notificaciones de esta naturaleza y no genera carga perceptible.
 *
 * ── Por qué este sondeo NO cuenta como actividad de sesión ──────────────────
 * ActividadGuard mide eventos de entrada del usuario (mouse, teclado, scroll).
 * Los GET automáticos no disparan esos eventos → la sesión se cierra igual
 * por inactividad.
 */
export default function MensajeNotificador() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const isAuth    = useAuthStore(s => s.isAuth());
  const user      = useAuthStore(s => s.user);

  // El Super Admin envía mensajes pero no los recibe.
  // El empleado puede recibirlos según el destinatario que configure el SA.
  const activo = isAuth && user?.role !== 'super_admin';

  // IDs que ya procesamos en esta sesión (complementa el vistoEn del servidor)
  const procesadosRef = useRef<Set<string>>(new Set());
  // IDs pendientes de mostrar (esperando que el POS cierre su modal de cobro)
  const pendingRef    = useRef<string[]>([]);

  const [visible,  setVisible]  = useState(false);
  const [msgs,     setMsgs]     = useState<MensajeBandeja[]>([]);
  const [progreso, setProgreso] = useState(100);

  // ── Polling ────────────────────────────────────────────────────────────────
  const { data: novedadesIds = [] } = useQuery({
    queryKey:        ['mensajes-novedades-no-vistas'],
    queryFn:         mensajesApi.getNovedadesNoVistas,
    enabled:         activo,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime:       POLL_MS,
  });

  // Cuando el servidor devuelve IDs nuevos, los encola
  useEffect(() => {
    if (!novedadesIds.length) return;
    const nuevos = novedadesIds.filter(id => !procesadosRef.current.has(id));
    if (!nuevos.length) return;

    nuevos.forEach(id => {
      procesadosRef.current.add(id);
      // Marca visto en el servidor para que el próximo poll no lo repita.
      // Fire-and-forget: si falla una sola vez no pasa nada grave — el siguiente
      // poll lo devolverá y el procesadosRef lo filtrará en esta sesión.
      mensajesApi.marcarVisto(id).catch(() => {});
    });

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
      const todos      = [...principal, ...novedades];
      const relevantes = todos.filter(m => ids.includes(m.id));
      if (!relevantes.length) return; // ya archivados o eliminados
      setMsgs(relevantes);
      setVisible(true);
    } catch {
      // Red caída: devolvemos los IDs para el siguiente tick
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
  const cerrar = useCallback(() => {
    setVisible(false);
    setMsgs([]);
    setProgreso(100);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setProgreso(100);
    const inicio  = Date.now();
    const tickId  = setInterval(() => {
      const elapsed = Date.now() - inicio;
      setProgreso(Math.max(0, 100 - (elapsed / AUTOCLOSE) * 100));
    }, 80);
    const closeId = setTimeout(cerrar, AUTOCLOSE);
    return () => { clearInterval(tickId); clearTimeout(closeId); };
  }, [visible, cerrar]);

  if (!visible || !msgs.length) return null;

  const count = msgs.length;
  const first = msgs[0];

  return (
    <>
      <style>{`
        @keyframes hc-notif-in {
          from { transform: translateY(-116%); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
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
          animation:    'hc-notif-in 0.28s cubic-bezier(.22,.68,0,1.2)',
        }}
      >
        {/* Barra de progreso — se vacía en 10 s */}
        <div style={{ height: 3, background: token.colorFillTertiary }}>
          <div style={{
            height:     '100%',
            width:      `${progreso}%`,
            background: token.colorPrimary,
            transition: 'width 80ms linear',
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
              <MessageOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
              <span style={{
                fontSize:      11,
                color:         token.colorTextSecondary,
                fontWeight:    600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Mensaje de HiCloud
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
