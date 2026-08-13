import { useQuery } from '@tanstack/react-query';
import api from '../../../../api/client';
import { PANEL_BASE, Mark, BackLink, Spacer } from '../shared';
import V06Junio from './V06Junio';

/** Septiembre — Un número honesto. El dato es real, con caché 24 h. */
export default function V09Septiembre() {
  const { data, isPending, isError } = useQuery({
    queryKey:  ['auth-stats-plataforma'],
    queryFn:   () =>
      api.get('/auth/stats-plataforma').then(r => r.data?.data ?? r.data) as Promise<{ ecfAceptados: number }>,
    staleTime: 24 * 60 * 60 * 1000,
    retry:     1,
    // No invalidar por cambios de foco — dato de plataforma, no de usuario
    refetchOnWindowFocus: false,
  });

  // Fallback si el endpoint falla o el dato no es positivo
  if (isError || (!isPending && (data?.ecfAceptados ?? -1) <= 0)) {
    return <V06Junio />;
  }

  const num = isPending ? null : data.ecfAceptados;

  return (
    <div style={{ ...PANEL_BASE, background: '#12332C', color: '#E8F2EE' }}>
      <Mark accent="#7FE0BC" />

      {/* Número grande */}
      <div style={{
        fontFamily:    '"Archivo", sans-serif',
        fontWeight:    400,
        fontSize:      120,
        lineHeight:    0.86,
        letterSpacing: '-0.05em',
        margin:        'auto 0 0',
        color:         '#7FE0BC',
        // Reservar espacio mientras carga para evitar un salto
        minHeight:     103,
        display:       'flex',
        alignItems:    'flex-end',
      }}>
        {num !== null ? num.toLocaleString('es-DO') : ' '}
      </div>

      <p style={{
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        fontWeight: 400,
        fontSize:   15.5,
        lineHeight: 1.5,
        color:      '#B4CFC6',
        margin:     '18px 0 0',
        maxWidth:   '24ch',
      }}>
        comprobantes fiscales electrónicos aceptados por la DGII.
      </p>

      <p style={{
        fontFamily:  '"IBM Plex Mono", monospace',
        fontWeight:  400,
        fontSize:    12.5,
        lineHeight:  1.7,
        color:       '#5F8479',
        margin:      '26px 0 0',
        borderTop:   '1px solid #21473E',
        paddingTop:  14,
      }}>
        Sin un solo rechazo por estructura desde julio.
      </p>

      <Spacer />
      <BackLink />
    </div>
  );
}
