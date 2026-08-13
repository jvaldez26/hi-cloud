import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

const MONO = '"IBM Plex Mono", monospace';

const yr = String(new Date().getFullYear());
const yrFirst = yr.slice(0, 2);
const yrLast  = yr.slice(2);

/** Enero — Cierre y apertura. El año en gran formato, la mitad apagada. */
export default function V01Enero() {
  return (
    <div style={{ ...PANEL_BASE, background: '#111820', color: '#E7ECF2' }}>
      <Mark accent="#7FA9F0" />

      {/* Año grande */}
      <div style={{
        fontFamily:    '"Archivo", sans-serif',
        fontWeight:    400,
        fontSize:      152,
        lineHeight:    0.78,
        letterSpacing: '-0.055em',
        color:         '#F4F7FB',
        margin:        '56px 0 0',
        userSelect:    'none',
      }}>
        {yrFirst}
        <em style={{ fontStyle: 'normal', color: '#3E5875' }}>{yrLast}</em>
      </div>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   21,
        lineHeight: 1.35,
        maxWidth:   '15ch',
        margin:     '26px 0 0',
        color:      '#CFD9E4',
      }}>
        Un año nuevo de secuencias por consumir.
      </p>

      <Spacer />

      {/* Regla + pares clave/valor */}
      <div style={{ height: 1, background: '#25313E', margin: '30px 0 16px' }} />
      {[
        ['Comprobantes disponibles', 'E32 · 1 – 5 000'],
        ['Vence',                   '31 · 12 · 2027'],
      ].map(([k, v]) => (
        <div key={k} style={{
          display:        'flex',
          justifyContent: 'space-between',
          fontFamily:     MONO,
          fontWeight:     400,
          fontSize:       12.5,
          lineHeight:     1.9,
          color:          '#7A8794',
        }}>
          <span>{k}</span>
          <b style={{ color: '#B9C6D3', fontWeight: 500 }}>{v}</b>
        </div>
      ))}

      <BackLink style={{ marginTop: 20 }} />
    </div>
  );
}
