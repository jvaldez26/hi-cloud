import { Typography, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../../api/client';
import { dRD } from '../../../utils/fechaRD';
import { CardWidget } from './CardWidget';

const { Text } = Typography;

/**
 * Movimiento financiero de hoy y de la semana. Fija: no se puede quitar.
 *
 * Comparte queryKey con WidgetCuentasBancos — misma peticion, deduplicada.
 */
export function WidgetActividad() {
  const { token } = theme.useToken();

  const { data: tesoreriaRaw } = useQuery<any>({
    queryKey: ['bancos-dashboard'],
    queryFn:  () => api.get('/tesoreria/dashboard').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const actHoy    = tesoreriaRaw?.actividad?.hoy    ?? [];
  const actSemana = tesoreriaRaw?.actividad?.semana ?? [];

  return (
    <CardWidget title="Actividad">
      {actHoy.length === 0 && actSemana.length === 0 ? (
        <>
          <div style={{ padding: '10px 16px 12px' }}>
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
            <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
            </div>
          </div>
          <div style={{ padding: '10px 16px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
            <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
            <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
            </div>
          </div>
        </>
      ) : (
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {actHoy.length > 0 && (
            <div style={{ padding: '10px 16px' }}>
              <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
              <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
              {actHoy.slice(0, 5).map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                        color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                        {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </Text>
                    </div>
                    <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                      {l.hora ?? dRD(l.fecha).format('HH:mm')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {actSemana.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
              <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
              <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
              {actSemana.slice(0, 5).map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                        color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                        {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </Text>
                    </div>
                    <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                      {dayjs(l.fecha).format('DD/MM')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CardWidget>

  );
}
