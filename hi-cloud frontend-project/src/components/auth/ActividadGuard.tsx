import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, theme } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import { markNavigatingAway } from '../../utils/sessionEvents';

/**
 * Actividad real del usuario: la reporta al backend y cierra la sesión si no hay.
 *
 * ── Por qué existe este componente ───────────────────────────────────────────
 * El backend no puede saber si hay una persona delante. Antes lo deducía del
 * tráfico —TenantMiddleware escribía `lastActivityAt` en cada request— y eso
 * medía lo contrario de lo que decía medir: el POS sondea cada 30 s y la caja
 * cada 5 s, así que una pestaña olvidada en el mostrador se marcaba como activa
 * toda la noche y su sesión no caducaba jamás.
 *
 * No se puede arreglar clasificando peticiones. Leer un reporte y sondear la
 * caja son el mismo verbo HTTP contra el mismo endpoint; el único sitio que sabe
 * POR QUÉ ocurre una petición es el cliente, y la única señal que un
 * `refetchInterval` no puede falsificar es la entrada física: ratón, teclado,
 * scroll, tacto. Eso es lo que este componente mide y reporta.
 *
 * ── Por qué se monta en la raíz y no en AppLayout ────────────────────────────
 * Antes los temporizadores de inactividad vivían dentro de AppLayout. Eso dejaba
 * fuera todas las páginas autenticadas que no cuelgan de él — con
 * `/super-admin/backups` como el peor caso: sondea cada 30 s y NO tenía cierre
 * por inactividad, así que era la página que mejor sabía mantener viva una
 * sesión que nadie estaba usando. Montado en la raíz cubre AppLayout, el panel
 * de Super Admin y el portal de empleados por igual.
 */

/** Sin actividad durante esto, se cierra la sesión. Comodidad de cliente: el que manda es el backend. */
const INACTIVIDAD_MS = 60 * 60 * 1000;
/** Aviso previo, con cuenta atrás. */
const ADVERTENCIA_MS = 55 * 60 * 1000;
/** Cada cuánto se reporta actividad al backend, como mucho. */
const LATIDO_MS = 5 * 60 * 1000;
/** Cada cuánto se revisa el estado. No hace falta más fino: los umbrales son de minutos. */
const TICK_MS = 15_000;

const EVENTOS = ['mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

export default function ActividadGuard() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const isAuth    = useAuthStore((s) => s.isAuth());
  const logout    = useAuthStore((s) => s.logout);

  const [avisoVisible, setAvisoVisible] = useState(false);
  const [restanteSeg,  setRestanteSeg]  = useState(300);

  /**
   * Marca de tiempo del último evento de entrada REAL.
   *
   * Es un ref y no estado a propósito: `mousemove` dispara decenas de veces por
   * segundo y no debe provocar ni un render. La implementación anterior
   * reiniciaba dos setTimeout en cada evento; esta solo escribe un número y deja
   * que un único intervalo compare.
   */
  const ultimaActividad = useRef<number>(Date.now());
  /** Último envío al backend. */
  const ultimoLatido    = useRef<number>(0);
  /** Evita que dos ticks lancen el cierre a la vez. */
  const cerrando        = useRef<boolean>(false);
  /** El aviso, en ref, para leerlo dentro del intervalo sin recrearlo en cada cambio. */
  const avisoRef        = useRef<boolean>(false);

  const cerrarPorInactividad = useCallback(async () => {
    if (cerrando.current) return;
    cerrando.current = true;

    markNavigatingAway();
    try { await authApi.logout(); } catch { /* token ya inválido o red caída */ }

    sessionStorage.setItem(
      'login_error',
      'Tu sesión se cerró por inactividad. Si tenías una venta en el POS, sigue ' +
      'guardada: la encontrarás en el carrito al entrar.',
    );

    // Se conserva el carrito: al cajero lo sacó un temporizador, no pidió salir.
    // Mismo criterio que 'displaced' y 'caducada'. El aislamiento entre empresas
    // no depende de esto — el carrito guarda su empresaId y POSPage lo descarta
    // al restaurar si no coincide.
    logout({ preservarCarritoPOS: true });
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const continuarSesion = useCallback(() => {
    ultimaActividad.current = Date.now();
    avisoRef.current = false;
    setAvisoVisible(false);
  }, []);

  // ── Escucha de entrada real ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuth) return;
    const handler = () => { ultimaActividad.current = Date.now(); };
    EVENTOS.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => EVENTOS.forEach(e => window.removeEventListener(e, handler));
  }, [isAuth]);

  // ── Latido al backend + control de inactividad ─────────────────────────────
  //
  // Un solo intervalo, sin dependencias que cambien: si `avisoVisible` estuviera
  // en las deps, cada cambio recrearía el intervalo y el reloj se reiniciaría.
  // Por eso el aviso se lee y escribe por ref.
  useEffect(() => {
    if (!isAuth) {
      cerrando.current = false;
      avisoRef.current = false;
      setAvisoVisible(false);
      return;
    }

    // Al montar, la sesión acaba de empezar o el usuario acaba de recargar.
    ultimaActividad.current = Date.now();
    ultimoLatido.current    = 0;
    cerrando.current        = false;

    const id = setInterval(() => {
      const ahora    = Date.now();
      const inactivo = ahora - ultimaActividad.current;

      // 1. Reportar actividad — solo si la hubo desde el último envío.
      //    Esta condición es la que impide que esto se convierta en otro sondeo:
      //    sin eventos de entrada no sale ni una petición.
      const huboActividad = ultimaActividad.current > ultimoLatido.current;
      if (huboActividad && ahora - ultimoLatido.current >= LATIDO_MS) {
        ultimoLatido.current = ahora;
        // Fire-and-forget: si falla, el siguiente tick lo reintenta. Un fallo aquí
        // no rompe nada — el backend tiene el respaldo por mutaciones.
        api.post('/auth/actividad').catch(() => { ultimoLatido.current = 0; });
      }

      // 2. Cierre por inactividad.
      if (inactivo >= INACTIVIDAD_MS) {
        avisoRef.current = false;
        setAvisoVisible(false);
        void cerrarPorInactividad();
        return;
      }

      // 3. Aviso con cuenta atrás.
      if (inactivo >= ADVERTENCIA_MS) {
        if (!avisoRef.current) {
          avisoRef.current = true;
          setAvisoVisible(true);
        }
        setRestanteSeg(Math.max(0, Math.ceil((INACTIVIDAD_MS - inactivo) / 1000)));
      } else if (avisoRef.current) {
        avisoRef.current = false;
        setAvisoVisible(false);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isAuth, cerrarPorInactividad]);

  // La cuenta atrás se refresca cada segundo solo mientras el aviso está visible.
  useEffect(() => {
    if (!avisoVisible) return;
    const id = setInterval(() => {
      setRestanteSeg(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [avisoVisible]);

  if (!isAuth || !avisoVisible) return null;

  const critico = restanteSeg <= 60;
  const alerta  = restanteSeg <= 120;

  return (
    <Modal
      open
      footer={null}
      closable={false}
      maskClosable={false}
      centered
      width={380}
      styles={{ mask: { backdropFilter: 'blur(2px)' } }}
    >
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: critico ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28,
        }}>
          🔐
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: token.colorText }}>
          Sesión por expirar
        </div>
        <div style={{ color: token.colorTextSecondary, fontSize: 13, marginBottom: 20 }}>
          Tu sesión cerrará automáticamente por inactividad en
        </div>
        <div style={{
          fontSize: 52, fontWeight: 900, fontFamily: '"SF Mono", "Fira Code", monospace',
          letterSpacing: 3, marginBottom: 24,
          color: critico ? '#EF4444' : (alerta ? '#F59E0B' : token.colorText),
          transition: 'color 0.3s',
        }}>
          {String(Math.floor(restanteSeg / 60)).padStart(2, '0')}
          <span style={{ opacity: 0.5, fontSize: 36 }}>:</span>
          {String(restanteSeg % 60).padStart(2, '0')}
        </div>
        <Button
          type="primary"
          size="large"
          block
          style={{ height: 44, fontSize: 15, fontWeight: 600 }}
          onClick={continuarSesion}
        >
          Continuar sesión
        </Button>
        <div style={{ marginTop: 12, fontSize: 12, color: token.colorTextSecondary }}>
          Haz clic en cualquier parte o presiona una tecla para continuar
        </div>
      </div>
    </Modal>
  );
}
