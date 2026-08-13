import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

const MONO = '"IBM Plex Mono", monospace';

const LINES: { cls: 'prompt' | 'ok' | 'hi' | 'dim'; text: string }[] = [
  { cls: 'prompt', text: '$ emitir e-CF · E32' },
  { cls: 'ok',     text: '✓ firmado · 0.4s' },
  { cls: 'ok',     text: '✓ transmitido a DGII' },
  { cls: 'hi',     text: '✓ aceptado · E320000000041' },
];

const COLOR: Record<string, string> = {
  prompt: '#5B6470',
  ok:     '#9BC48C',
  hi:     '#E9E4D9',
  dim:    '#5B6470',
};

/** Octubre — Consola. Verde apagado sobre pizarra, sin el cliché del verde ácido. */
export default function V10Octubre() {
  return (
    <div style={{
      ...PANEL_BASE,
      background: '#1A1D22',
      color:      '#D8D2C6',
      fontFamily: MONO,
    }}>
      <Mark accent="#9BC48C" style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, color: '#E9E4D9' }} />

      {/* Terminal output */}
      <div style={{ margin: 'auto 0 0', fontSize: 13, lineHeight: 2.1 }}>
        {LINES.map((l, i) => (
          <div key={i} style={{ color: COLOR[l.cls] }}>{l.text}</div>
        ))}
        {/* Cursor parpadeante */}
        <div style={{ color: '#5B6470' }}>
          ${' '}
          <span style={{
            display:       'inline-block',
            width:         8,
            height:        15,
            background:    '#9BC48C',
            verticalAlign: -2,
            marginLeft:    4,
            animation:     'cur-blink 1s steps(1) infinite',
          }} />
        </div>
      </div>

      <div style={{
        fontFamily:    '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight:    600,
        fontSize:      25,
        lineHeight:    1.28,
        letterSpacing: '-0.018em',
        color:         '#F0EBE0',
        margin:        '30px 0 0',
        maxWidth:      '17ch',
      }}>
        Cuatro segundos entre el cobro y el comprobante.
      </div>

      <Spacer />
      <BackLink />
    </div>
  );
}
