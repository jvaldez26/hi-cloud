import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';

/** Mayo — Mostrador. Bronce de ferretería, tipografía de rótulo pintado. */
export default function V05Mayo() {
  return (
    <div style={{ ...PANEL_BASE, background: '#8A5A22', color: '#FBF4E9' }}>
      <Mark accent="#F0C481" />

      <div style={{
        fontFamily:    '"Archivo", sans-serif',
        fontWeight:    800,
        fontSize:      52,
        lineHeight:    0.98,
        letterSpacing: '-0.035em',
        margin:        'auto 0 0',
        maxWidth:      '9ch',
        textTransform: 'uppercase' as const,
      }}>
        Del mostrador a la DGII
      </div>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   15,
        lineHeight: 1.6,
        color:      '#EBD8BC',
        margin:     '20px 0 0',
        maxWidth:   '26ch',
      }}>
        Lo que cobras en el punto de venta llega al comprobante sin que nadie lo teclee dos veces.
      </p>

      <div style={{
        display:       'inline-block',
        marginTop:     26,
        border:        '1px solid #C69353',
        color:         '#F3E3CB',
        fontFamily:    '"IBM Plex Mono", monospace',
        fontWeight:    500,
        fontSize:      11.5,
        lineHeight:    1,
        letterSpacing: '0.12em',
        padding:       '9px 13px',
        textTransform: 'uppercase' as const,
      }}>
        Ferreterías · Colmados · Repuestos
      </div>

      <Spacer />
      <BackLink />
    </div>
  );
}
