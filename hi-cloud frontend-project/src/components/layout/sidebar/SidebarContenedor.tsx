import { forwardRef, type ReactNode } from 'react';

/**
 * Dónde se coloca el menú lateral: a un lado en escritorio, en cajón sobre el
 * contenido en móvil.
 *
 * Va aparte de SidebarShell porque son dos cosas distintas: el shell pinta el
 * menú, esto decide dónde vive. Estaba dentro de AppLayout, y el panel de Super
 * Admin lo necesita igual — escribirlo dos veces es como acabamos con dos
 * plantillas térmicas.
 *
 * El traslado es literal: mismas medidas, mismo z-index, misma transición y el
 * mismo overlay (.mobile-drawer-overlay, en typography.css). El ERP no cambia
 * de comportamiento.
 */

export interface SidebarContenedorProps {
  esMovil:   boolean;
  /** Solo afecta al ancho de escritorio; en móvil el cajón siempre mide 240. */
  colapsado: boolean;
  /** Cajón desplegado. En escritorio se ignora. */
  abierto:   boolean;
  onCerrar:  () => void;
  children:  ReactNode;
}

export const ANCHO_SIDEBAR          = 240;
export const ANCHO_SIDEBAR_COLAPSADO = 64;

export const SidebarContenedor = forwardRef<HTMLDivElement, SidebarContenedorProps>(
  function SidebarContenedor({ esMovil, colapsado, abierto, onCerrar, children }, ref) {
    const ancho = colapsado ? ANCHO_SIDEBAR_COLAPSADO : ANCHO_SIDEBAR;

    // ── Escritorio: una columna más del layout ──────────────────────────────
    if (!esMovil) {
      return (
        <div
          ref={ref}
          style={{
            width:       ancho,
            minWidth:    ancho,
            height:      '100%',
            flexShrink:  0,
            transition:  'width 0.25s ease, min-width 0.25s ease',
            boxShadow:   '2px 0 8px rgba(0,0,0,0.18)',
            zIndex:      100,
            overflow:    'hidden',
          }}
        >
          {children}
        </div>
      );
    }

    // ── Móvil: cajón fijo sobre el contenido, que así recupera el ancho ─────
    return (
      <>
        {abierto && (
          <div className="mobile-drawer-overlay" onClick={onCerrar} />
        )}
        <div
          ref={ref}
          style={{
            position:   'fixed',
            top:        0,
            left:       0,
            height:     '100%',
            width:      ANCHO_SIDEBAR,
            zIndex:     200,
            transform:  abierto ? 'translateX(0)' : `translateX(-${ANCHO_SIDEBAR}px)`,
            transition: 'transform 0.25s ease',
            overflowY:  'hidden',
            boxShadow:  abierto ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
          }}
        >
          {children}
        </div>
      </>
    );
  },
);
