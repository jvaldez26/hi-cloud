import { PANEL_BASE, Mark, BackLink } from '../shared';

const BANDS = [
  { left: -40, color: '#B4324F' },
  { left:  52, color: '#D98A1F' },
  { left: 144, color: '#1F6E6B' },
  { left: 236, color: '#E4DACB' },
];

/** Febrero — Carnaval. Bandas diagonales de La Vega sobre papel crudo. */
export default function V02Febrero() {
  return (
    <div style={{ ...PANEL_BASE, background: '#F6F2EC', color: '#231B15', overflow: 'hidden' }}>
      {/* Bandas diagonales */}
      {BANDS.map(b => (
        <div key={b.left} style={{
          position:  'absolute',
          top:       '-30%',
          bottom:    '-30%',
          left:      b.left,
          width:     82,
          transform: 'rotate(16deg)',
          background: b.color,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Contenido sobre las bandas */}
      <Mark accent="#B4324F" style={{ position: 'relative' }} />

      <p style={{
        position:      'relative',
        fontFamily:    '"Instrument Serif", Georgia, serif',
        fontStyle:     'normal',
        fontWeight:    400,
        fontSize:      46,
        lineHeight:    1.02,
        letterSpacing: '-0.012em',
        margin:        'auto 0 0',
        maxWidth:      '11ch',
      }}>
        Que el único desorden sea el de la calle.
      </p>

      <p style={{
        position:   'relative',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   14.5,
        lineHeight: 1.6,
        color:      '#5A4B3D',
        margin:     '16px 0 0',
        maxWidth:   '26ch',
      }}>
        Facturación electrónica, inventario y caja para PYMEs dominicanas.
      </p>

      <div style={{ height: 34, position: 'relative' }} />
      <BackLink style={{ position: 'relative' }} />
    </div>
  );
}
