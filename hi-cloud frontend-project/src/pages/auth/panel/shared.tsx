import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

/** Base para todos los paneles — absolute, fills container, flex column */
export const PANEL_BASE: CSSProperties = {
  position:      'absolute',
  inset:         0,
  display:       'flex',
  flexDirection: 'column',
  padding:       '44px 40px',
  overflow:      'hidden',
};

/** Logo Hi<Cloud> con acento configurable */
export function Mark({
  accent,
  style,
}: {
  accent: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      fontFamily:    '"IBM Plex Sans", system-ui, sans-serif',
      fontWeight:    600,
      fontSize:      15,
      lineHeight:    1,
      letterSpacing: '-0.01em',
      ...style,
    }}>
      Hi<span style={{ color: accent }}>Cloud</span>
    </div>
  );
}

/** Enlace "← Volver al inicio" — opacidad reducida por defecto */
export function BackLink({ style }: { style?: CSSProperties }) {
  return (
    <Link
      to="/"
      style={{
        fontSize:       12.5,
        opacity:        0.55,
        letterSpacing:  '0.01em',
        color:          'currentColor',
        textDecoration: 'none',
        display:        'block',
        ...style,
      }}
    >
      ← Volver al inicio
    </Link>
  );
}

/** Separador flexible que empuja el footer hacia abajo */
export function Spacer({ style }: { style?: CSSProperties }) {
  return <div style={{ flex: 1, ...style }} />;
}
