import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

const MONO = '"IBM Plex Mono", monospace';
const yr   = new Date().getFullYear();

const KV: [string, string][] = [
  ['Ejercicio', String(yr)],
  ['Cierre',    '31 · 12'],
];

/** Diciembre — Cierre de año. Verde pino con una sola regla dorada. */
export default function V12Diciembre() {
  return (
    <div style={{ ...PANEL_BASE, background: '#123527', color: '#EAF2ED' }}>
      <Mark accent="#C8A24A" />

      {/* Regla dorada — el único adorno */}
      <div style={{ height: 2, background: '#C8A24A', width: '100%', margin: 'auto 0 24px' }} />

      <p style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontWeight: 400,
        fontSize:   40,
        lineHeight: 1.12,
        margin:     0,
        maxWidth:   '13ch',
      }}>
        Cierra el año con los{' '}
        <em style={{ fontStyle: 'italic', color: '#D6B463' }}>libros al día</em>.
      </p>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   14,
        lineHeight: 1.62,
        color:      '#A8C2B4',
        margin:     '18px 0 0',
        maxWidth:   '27ch',
      }}>
        Balance general, estado de resultados y declaraciones, listos cuando los necesites.
      </p>

      <div style={{
        margin:    '26px 0 0',
        borderTop: '1px solid #1D4735',
        paddingTop: 12,
      }}>
        {KV.map(([k, v]) => (
          <div key={k} style={{
            display:        'flex',
            justifyContent: 'space-between',
            fontFamily:     MONO,
            fontWeight:     400,
            fontSize:       12.5,
            lineHeight:     2,
            color:          '#7C9C8B',
          }}>
            <span>{k}</span>
            <b style={{ color: '#C8A24A', fontWeight: 500 }}>{v}</b>
          </div>
        ))}
      </div>

      <Spacer />
      <BackLink />
    </div>
  );
}
