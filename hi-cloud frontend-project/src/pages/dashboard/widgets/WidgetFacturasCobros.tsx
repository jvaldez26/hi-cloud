import { Button, Tag, Typography, theme } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { CardWidget } from './CardWidget';

const { Text } = Typography;

/** Facturas emitidas pendientes de cobro. Fija: no se puede quitar. */
export function WidgetFacturasCobros() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();

  const { data: factPendRaw } = useQuery<any>({
    queryKey: ['fact-pend-cf'],
    queryFn:  () => api.get('/facturas?limit=8&estado=emitida').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    staleTime: 60_000,
  });

  const facturas = Array.isArray(factPendRaw) ? factPendRaw : [];

  return (
      <CardWidget
      title="Facturas & Cobros"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/cxc')}
          style={{ fontSize: 12 }}>Ver todo →</Button>
      }
    >
      {facturas.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>Sin facturas pendientes de cobro</Text>
          <div style={{ marginTop: 8 }}>
            <Button type="link" size="small" onClick={() => navigate('/facturas')}>Ir a Facturas →</Button>
          </div>
        </div>
      ) : (
        <div>
          {facturas.slice(0, 8).map((f: any, i: number) => (
            <div
              key={f.id ?? i}
              onClick={() => navigate(`/facturas/${f.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                borderBottom: i < Math.min(facturas.length, 8) - 1
                  ? `1px solid ${token.colorBorderSecondary}` : 'none',
                cursor: 'pointer', transition: 'background 0.12s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = token.colorFillAlter)}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileTextOutlined style={{ color: '#0EA5E9', fontSize: 16 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: 500, display: 'block' }} ellipsis>
                  {f.cliente?.nombre ?? 'Cliente'}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {f.folio ?? f.numero} · {f.fecha ? dayjs(f.fecha).format('DD/MM/YYYY') : ''}
                </Text>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0EA5E9' }}>
                  {fmt.money(Number(f.total ?? 0))}
                </div>
                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>PENDIENTE</Tag>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardWidget>

  );
}
