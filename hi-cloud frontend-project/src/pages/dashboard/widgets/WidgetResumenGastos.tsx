import { Button, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';

// ── Widget Resumen de Gastos (donut) ─────────────────────────────────────────
const COLORES_GASTOS = ['#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444','#F97316','#EC4899','#06B6D4'];

export function WidgetResumenGastos() {
  const { token } = theme.useToken();

  // La consulta vive DENTRO del widget: si no esta en el panel, no se pide.
  const { data, refetch } = useQuery<any>({
    queryKey: ['resumen-gastos-dash'],
    queryFn:  () => api.get('/reportes/dashboard/resumen-gastos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const onRefresh = () => { void refetch(); };
  const gastos: any[] = data?.gastos ?? [];
  const total = Number(data?.total ?? 0);
  const mes   = data?.mes ?? '';

  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Resumen de Gastos</span>
          {mes && <span style={{ fontSize: 11, color: token.colorTextTertiary, marginLeft: 8 }}>{mes}</span>}
        </div>
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Gráfica */}
      {gastos.length === 0 ? (
        <div style={{ height: 260, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 36 }}>📊</div>
          <div style={{ fontSize: 13, color: token.colorTextTertiary }}>
            Sin gastos registrados este mes
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={gastos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
              paddingAngle={2} dataKey="monto" nameKey="categoria">
              {gastos.map((_: any, i: number) => (
                <Cell key={i} fill={COLORES_GASTOS[i % COLORES_GASTOS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8, fontSize: 12,
              }}
              formatter={(v: number, name: string) => [fmt.money(v), name]}
            />
            <Legend iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* Footer total */}
      {total > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillAlter,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL GASTOS
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>
            {fmt.money(total)}
          </span>
        </div>
      )}
    </div>
  );
}
