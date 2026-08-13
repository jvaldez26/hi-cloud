import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

// Cada barra: [altura, anchura?]. Sin anchura = 3px por defecto.
const BARS: (number | [number, number])[] = [
  44, 26, [44, 6], 18, 38, [44, 5], 22, 44, [30, 7], 44, 16, [36, 4], 44, 24,
];

/** Noviembre — Inventario. Retícula de puntos + código de barras de líneas. */
export default function V11Noviembre() {
  return (
    <div style={{ ...PANEL_BASE, background: '#EFEBE4', color: '#241F19' }}>
      {/* Retícula de puntos — queda detrás del contenido */}
      <div style={{
        position:            'absolute',
        inset:               0,
        backgroundImage:     'radial-gradient(#CDC5B8 1.4px, transparent 1.4px)',
        backgroundSize:      '19px 19px',
        opacity:             0.85,
        pointerEvents:       'none',
      }} />

      {/* Todo el contenido necesita position:relative para quedar sobre la trama */}
      <Mark accent="#1B4FD8" style={{ position: 'relative' }} />

      <div style={{
        position:      'relative',
        fontFamily:    '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight:    600,
        fontSize:      35,
        lineHeight:    1.16,
        letterSpacing: '-0.024em',
        margin:        'auto 0 0',
        maxWidth:      '13ch',
      }}>
        Lo que hay en el estante y lo que dice el sistema.
      </div>

      <p style={{
        position:   'relative',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   14,
        lineHeight: 1.6,
        color:      '#5D544A',
        margin:     '15px 0 0',
        maxWidth:   '27ch',
      }}>
        Conteo físico, múltiples almacenes, lotes y balanza etiquetadora.
      </p>

      {/* Código de barras */}
      <div style={{
        position:    'relative',
        display:     'flex',
        gap:         3,
        alignItems:  'flex-end',
        height:      44,
        marginTop:   26,
        flexShrink:  0,
      }}>
        {BARS.map((b, i) => {
          const [h, w] = Array.isArray(b) ? b : [b, 3];
          return (
            <div
              key={i}
              style={{ width: w, height: h, background: '#241F19', display: 'block', flexShrink: 0 }}
            />
          );
        })}
      </div>

      <Spacer style={{ position: 'relative' }} />
      <BackLink style={{ position: 'relative' }} />
    </div>
  );
}
