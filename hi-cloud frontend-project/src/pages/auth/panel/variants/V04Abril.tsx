import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

const LEDGER: [string, string][] = [
  ['Ventas del día',  '▸ Diario general'],
  ['Compra recibida', '▸ Inventario · CxP'],
  ['Recibo de cobro', '▸ Caja · CxC'],
];

/** Abril — Libro mayor. Papel rayado de contabilidad con línea roja. */
export default function V04Abril() {
  return (
    <div style={{
      ...PANEL_BASE,
      color:      '#1D2A22',
      background: 'repeating-linear-gradient(#FAFBF7 0 33px, #EDF2E9 33px 34px), #FAFBF7',
      position:   'absolute', // ya está en PANEL_BASE pero lo reafirmamos
    }}>
      {/* Línea roja de margen — simula la del libro contable */}
      <div style={{
        position:      'absolute',
        left:          78,
        top:           0,
        bottom:        0,
        width:         1,
        background:    '#C9483E',
        opacity:       0.5,
        pointerEvents: 'none',
      }} />

      <Mark accent="#2C6B4F" style={{ position: 'relative' }} />

      <div style={{
        position:      'relative',
        fontFamily:    '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight:    600,
        fontSize:      34,
        lineHeight:    1.18,
        letterSpacing: '-0.022em',
        margin:        'auto 0 0',
        maxWidth:      '13ch',
      }}>
        Una sola vez.<br />Todo cuadrado.
      </div>

      <p style={{
        position:   'relative',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   14,
        lineHeight: 1.62,
        color:      '#4A574F',
        margin:     '14px 0 0',
        maxWidth:   '27ch',
      }}>
        Registra la operación y el asiento contable se genera detrás.
      </p>

      <div style={{ position: 'relative', margin: '24px 0 0', borderTop: '2px solid #2C4136', paddingTop: 9 }}>
        {LEDGER.map(([k, v]) => (
          <div key={k} style={{
            display:        'flex',
            justifyContent: 'space-between',
            fontFamily:     '"IBM Plex Mono", monospace',
            fontWeight:     400,
            fontSize:       12.5,
            lineHeight:     2.05,
            color:          '#3B4A41',
          }}>
            <span>{k}</span>
            <b style={{ fontWeight: 500 }}>{v}</b>
          </div>
        ))}
      </div>

      <Spacer />
      <BackLink style={{ position: 'relative' }} />
    </div>
  );
}
