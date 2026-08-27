import { useState } from 'react';
import { Button, Typography, theme } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { CardWidget } from './CardWidget';

const { Text } = Typography;

/**
 * Cuentas de bancos. Fija: no se puede quitar del panel.
 *
 * Comparte queryKey con WidgetActividad porque las dos salen de
 * /tesoreria/dashboard. React Query lo deduplica: montar las dos hace UNA sola
 * peticion, no dos.
 */
export function WidgetCuentasBancos() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const [grupoAbierto, setGrupoAbierto] = useState(true);

  const { data: tesoreriaRaw } = useQuery<any>({
    queryKey: ['bancos-dashboard'],
    queryFn:  () => api.get('/tesoreria/dashboard').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const bancos        = tesoreriaRaw?.cuentas ?? [];
  const balanceBancos = tesoreriaRaw?.balanceTotal ?? 0;

  return (
      <CardWidget
      title="Cuentas de Bancos"
      extra={
        <Button type="text" size="small" style={{ color: token.colorTextTertiary, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
          onClick={() => navigate('/bancos')}>⋯</Button>
      }
    >
      {/* Grupo expandible */}
      <div
        onClick={() => setGrupoAbierto(v => !v)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', cursor: 'pointer',
          background: grupoAbierto ? token.colorFillAlter : 'transparent',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: token.colorTextSecondary }}>
          <span style={{ fontSize: 10 }}>{grupoAbierto ? '▾' : '›'}</span>
          Efectivo y Cuentas
        </span>
        <Text style={{ fontSize: 13, fontWeight: 500 }}>
          {fmt.money(balanceBancos)}
        </Text>
      </div>

      {/* Cuentas individuales */}
      {grupoAbierto && (
        bancos.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <Text type="secondary" style={{ fontSize: 13 }}>Sin cuentas configuradas</Text>
            <div>
              <Button type="link" size="small" onClick={() => navigate('/bancos')}>
                Ir a Bancos →
              </Button>
            </div>
          </div>
        ) : (
          bancos.slice(0, 5).map((b: any, i: number) => (
            <div key={b.id ?? i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px 10px 24px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: '#10B981',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <DollarOutlined style={{ color: '#FFF', fontSize: 16 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre ?? 'Cuenta'}</div>
                <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                  {b.tipo ?? 'corriente'} · {b.moneda ?? 'DOP'}
                </div>
              </div>
              <Text style={{ fontSize: 13, fontWeight: 500 }}>
                {fmt.money(Number(b.saldo ?? 0))}
              </Text>
            </div>
          ))
        )
      )}

      {/* Balance total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: token.colorFillAlter,
      }}>
        <Text strong style={{ fontSize: 14 }}>Balance</Text>
        <Text strong style={{ fontSize: 14, color: '#0EA5E9' }}>
          DOP${balanceBancos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
        </Text>
      </div>
    </CardWidget>

  );
}
