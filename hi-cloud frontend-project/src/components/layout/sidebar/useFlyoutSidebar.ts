import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/**
 * Comportamiento del flyout del sidebar colapsado. ÚNICO para los dos sitios
 * que lo usan —AppLayout y SuperAdminPage—: antes cada uno llevaba su propio
 * estado con un toggle por clic, y dos implementaciones del mismo menú acaban
 * divergiendo en silencio.
 *
 * ── Lo que había y por qué no servía ────────────────────────────────────────
 *
 * 1. Un overlay `position: fixed; inset: 0; z-index: 149` para detectar el clic
 *    afuera. El sidebar está en z-index 100, así que el overlay lo TAPABA: con
 *    un flyout abierto, el ratón sobre otro ícono tocaba el overlay y no el
 *    botón —sin hover, sin tooltip— y un clic en otro ícono solo cerraba el
 *    actual. Hacían falta dos clics para cambiar de menú.
 *
 * 2. El flyout solo se abría por clic. Quitar el overlay no bastaba: pasar el
 *    ratón por los íconos no cambiaba nada.
 *
 * 3. El listener de clic-afuera comprobaba `sidebarRef.contains(target)`, pero
 *    el panel es `position: fixed` y HERMANO del sidebar, no hijo. Un mousedown
 *    dentro del flyout contaba como «afuera» y lo cerraba. Los ítems funcionaban
 *    de rebote: la animación de salida dejaba el panel 140 ms en pantalla y el
 *    `click` aún lo alcanzaba. Bastaba acortar esa animación para romper los
 *    clics del menú sin que nadie supiera por qué. Aquí la contención incluye
 *    el panel.
 *
 * ── Ratón, toque y el caso híbrido ───────────────────────────────────────────
 *
 * El hover se decide por EVENTO con `pointerType === 'mouse'`, no por
 * dispositivo con `matchMedia('(hover: hover)')`. Una laptop con pantalla
 * táctil responde que sí tiene hover y aun así recibe toques: con matchMedia,
 * un toque abriría por hover y el `click` que le sigue lo cerraría en el acto.
 *
 * Con pointer events eso no pasa. Un toque dispara `pointerenter` con
 * `pointerType: 'touch'` —que aquí se ignora— y los eventos de ratón de
 * compatibilidad que el navegador emite después son `mouseenter`/`mousedown`,
 * no pointer events, así que tampoco llegan a estos handlers. El toque solo
 * produce el `click`, y el click abre o cierra una vez.
 */

/** Tiempo para cruzar del ícono al panel sin que se cierre por el camino. */
export const RETARDO_CIERRE_MS = 150;

export interface PanelFlyout {
  id:     string;
  top:    number;
  /**
   * Abierto por clic/toque. Un panel fijado no se cierra al sacar el ratón,
   * solo con otro clic, clic afuera o Escape.
   */
  fijado: boolean;
}

export function useFlyoutSidebar({ activo, sidebarRef }: {
  /** El sidebar está colapsado. Expandido, el flyout no existe. */
  activo:     boolean;
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  const [panel, setPanel] = useState<PanelFlyout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelarCierre = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const cerrar = useCallback(() => {
    cancelarCierre();
    setPanel(null);
  }, [cancelarCierre]);

  /** Hover sobre un ícono: abre el suyo y sustituye al que hubiera. */
  const abrirPorHover = useCallback((id: string, top: number) => {
    cancelarCierre();
    // Si ya es ese, se deja como está — re-entrar no debe desfijarlo.
    setPanel(prev => (prev?.id === id ? prev : { id, top, fijado: false }));
  }, [cancelarCierre]);

  /** Salida del ícono o del panel: cierra tras el retardo, salvo que esté fijado. */
  const programarCierre = useCallback(() => {
    cancelarCierre();
    timer.current = setTimeout(() => {
      timer.current = null;
      setPanel(prev => (prev && !prev.fijado ? null : prev));
    }, RETARDO_CIERRE_MS);
  }, [cancelarCierre]);

  /**
   * Clic o toque en un ícono.
   * - Con ratón, el hover ya lo abrió: el clic lo FIJA. Otro clic lo cierra.
   * - Con toque no hubo hover: abre fijado. Otro toque en el mismo lo cierra.
   */
  const clicEnIcono = useCallback((id: string, top: number) => {
    cancelarCierre();
    setPanel(prev => (prev?.id === id && prev.fijado ? null : { id, top, fijado: true }));
  }, [cancelarCierre]);

  /** Handlers de hover para cada ícono. Solo reaccionan al ratón. */
  const hoverIcono = useCallback((id: string) => ({
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      abrirPorHover(id, e.currentTarget.getBoundingClientRect().top);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      programarCierre();
    },
  }), [abrirPorHover, programarCierre]);

  /** Handlers del panel: dentro no se cierra; al salir, retardo. */
  const hoverPanel = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') cancelarCierre();
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') programarCierre();
    },
  };

  // Al expandir el sidebar no hay flyout que mostrar.
  useEffect(() => { if (!activo) cerrar(); }, [activo, cerrar]);

  // Clic afuera — con contención del sidebar Y del panel (ver punto 3 arriba).
  useEffect(() => {
    if (!panel) return;
    const alPulsar = (e: PointerEvent) => {
      const t = e.target as Node;
      if (sidebarRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      cerrar();
    };
    document.addEventListener('pointerdown', alPulsar);
    return () => document.removeEventListener('pointerdown', alPulsar);
  }, [panel, sidebarRef, cerrar]);

  // Escape.
  useEffect(() => {
    if (!panel) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [panel, cerrar]);

  // Sin esto, desmontar con un cierre pendiente dejaba un setTimeout colgando
  // que llamaba a setState sobre un componente ya desmontado.
  useEffect(() => cancelarCierre, [cancelarCierre]);

  return { panel, panelRef, cerrar, clicEnIcono, hoverIcono, hoverPanel };
}
