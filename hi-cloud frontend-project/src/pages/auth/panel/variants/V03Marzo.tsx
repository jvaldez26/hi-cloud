import { BackLink } from '../shared';

const MONO = '"IBM Plex Mono", monospace';

const ROWS: [string, string][] = [
  ['Módulo',       'Punto de Venta'],
  ['Fiscal',       'e-CF · DGII'],
  ['Inventario',   'Multi-almacén'],
  ['Contabilidad', 'Automática'],
];

function Dashed() {
  return <div style={{ borderTop: '1px dashed #C3BFB8', margin: '12px 0' }} />;
}

/** Marzo — El comprobante. El panel es un ticket térmico real. */
export default function V03Marzo() {
  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      display:       'flex',
      flexDirection: 'column',
      padding:       '38px 34px',
      background:    '#4A5058',
      color:         '#20252B',
    }}>
      {/* Papel del ticket */}
      <div style={{
        background:    '#FDFCFA',
        flex:          1,
        padding:       '30px 26px',
        display:       'flex',
        flexDirection: 'column',
        boxShadow:     '0 2px 14px rgba(0,0,0,.22)',
        fontFamily:    MONO,
      }}>
        <div style={{ textAlign: 'center', fontSize: 12.5, letterSpacing: '0.03em' }}>
          HICLOUD ERP
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#7A756D' }}>
          República Dominicana
        </div>

        <Dashed />

        <div style={{
          fontSize:      15,
          fontWeight:    600,
          letterSpacing: '0.06em',
          textAlign:     'center',
          margin:        '2px 0 14px',
        }}>
          ACCESO AL SISTEMA
        </div>

        <Dashed />

        {ROWS.map(([k, v]) => (
          <div key={k} style={{
            display:        'flex',
            justifyContent: 'space-between',
            fontSize:       12,
            lineHeight:     2,
          }}>
            <span>{k}</span>
            <b style={{ fontWeight: 500 }}>{v}</b>
          </div>
        ))}

        <Dashed />

        <div style={{
          fontSize:      21,
          fontWeight:    600,
          letterSpacing: '-0.01em',
          display:       'flex',
          justifyContent:'space-between',
          margin:        '6px 0',
        }}>
          <span>TOTAL</span>
          <span>1 sistema</span>
        </div>

        <Dashed />

        <div style={{
          fontSize:    11,
          textAlign:   'center',
          color:       '#7A756D',
          letterSpacing:'0.02em',
          marginTop:   'auto',
          paddingTop:  16,
        }}>
          Emite, cobra y declara sin rehacer nada.
        </div>
      </div>

      <BackLink style={{ color: '#D3D7DC', paddingTop: 16, fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }} />
    </div>
  );
}
