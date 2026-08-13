import { Mark, BackLink } from '../shared';

const BLOCKS = [
  '#1B4FD8', '#F2F3F5',
  '#F2F3F5', '#E8503A',
  '#DDE0E4', '#F2F3F5',
];

/** Julio — Bloques. Seis rectángulos planos, sin degradado. */
export default function V07Julio() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#F2F3F5' }}>
      {/* Cuadrícula 2×3 de bloques planos */}
      <div style={{
        position:            'absolute',
        inset:               0,
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows:    '1fr 1fr 1fr',
      }}>
        {BLOCKS.map((bg, i) => (
          <div key={i} style={{ background: bg }} />
        ))}
      </div>

      {/* Contenido sobre los bloques */}
      <div style={{
        position:      'absolute',
        inset:         0,
        padding:       '44px 40px',
        display:       'flex',
        flexDirection: 'column',
        color:         '#12161B',
      }}>
        <Mark accent="#A8C4FA" style={{ color: '#FFFFFF' }} />

        <div style={{
          fontFamily:    '"Archivo", sans-serif',
          fontWeight:    800,
          fontSize:      40,
          lineHeight:    1.05,
          letterSpacing: '-0.03em',
          margin:        'auto 0 0',
          maxWidth:      '12ch',
          color:         '#0F1419',
        }}>
          Vende. Factura. Declara.
        </div>

        <p style={{
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontWeight: 400,
          fontSize:   14,
          lineHeight: 1.6,
          color:      '#39424D',
          margin:     '16px 0 0',
          maxWidth:   '26ch',
        }}>
          Los tres pasos en un solo sistema, sin exportar nada a nadie.
        </p>

        <div style={{ height: 30 }} />
        <BackLink style={{ color: '#39424D' }} />
      </div>
    </div>
  );
}
