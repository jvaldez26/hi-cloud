import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

const FLAG = ['#002D62', '#FFF', '#CE1126', '#FFF'];

/** Agosto — Restauración. Cuatro píxeles de bandera; nada más patriótico. */
export default function V08Agosto() {
  return (
    <div style={{ ...PANEL_BASE, background: '#0D2149', color: '#E9EEF7' }}>
      {/* Franja de bandera */}
      <div style={{ display: 'flex', height: 4, width: 74, marginBottom: 'auto' }}>
        {FLAG.map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>

      <Mark accent="#8FB4EC" style={{ marginBottom: 26 }} />

      <p style={{
        fontFamily:    '"Instrument Serif", Georgia, serif',
        fontWeight:    400,
        fontSize:      38,
        lineHeight:    1.14,
        margin:        0,
        maxWidth:      '14ch',
      }}>
        Software fiscal hecho aquí, para los de aquí.
      </p>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   14,
        lineHeight: 1.62,
        color:      '#A9B9D4',
        margin:     '18px 0 0',
        maxWidth:   '27ch',
      }}>
        Cada comprobante que emites cumple la norma dominicana desde el primer día.
      </p>

      <div style={{
        fontFamily:    '"IBM Plex Mono", monospace',
        fontWeight:    500,
        fontSize:      11.5,
        lineHeight:    1,
        letterSpacing: '0.14em',
        color:         '#6F86AE',
        textTransform: 'uppercase' as const,
        marginTop:     26,
      }}>
        16 de agosto
      </div>

      <Spacer />
      <BackLink />
    </div>
  );
}
