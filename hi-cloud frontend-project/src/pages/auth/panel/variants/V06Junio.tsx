import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

/** Junio — Blanco. Casi nada. Espacio y ajuste tipográfico. */
export default function V06Junio() {
  return (
    <div style={{ ...PANEL_BASE, background: '#FCFCFD', color: '#12161B' }}>
      <Mark accent="#1B4FD8" />

      <p style={{
        fontFamily:    '"Instrument Serif", Georgia, serif',
        fontWeight:    400,
        fontSize:      33,
        lineHeight:    1.28,
        letterSpacing: '-0.005em',
        margin:        'auto 0 0',
        maxWidth:      '16ch',
      }}>
        El ERP que entiende cómo se factura en República Dominicana.
      </p>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   13.5,
        lineHeight: 1.65,
        color:      '#79838E',
        margin:     '18px 0 0',
        maxWidth:   '28ch',
      }}>
        e-CF, ITBIS, 606 y 607. Calculados, no configurados.
      </p>

      <div style={{ height: 1, background: '#E6E9ED', margin: '28px 0 0', width: 52 }} />

      <Spacer />
      <BackLink />
    </div>
  );
}
