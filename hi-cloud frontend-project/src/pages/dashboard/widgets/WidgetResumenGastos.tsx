import { theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { TarjetaGrafica, COLORES } from './TarjetaGrafica';

/** Gastos del mes por categoría. */
export function WidgetResumenGastos() {
  const { token } = theme.useToken();

  // La consulta vive DENTRO del widget: si no está en el panel, no se pide.
  const { data, refetch } = useQuery<any>({
    queryKey: ['resumen-gastos-dash'],
    queryFn:  () => api.get('/reportes/dashboard/resumen-gastos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const gastos: any[] = data?.gastos ?? [];
  const total = Number(data?.total ?? 0);
  const mes   = data?.mes ?? '';

  return (
    <TarjetaGrafica
      titulo="Resumen de Gastos"
      subtitulo={mes || undefined}
      onRefresh={() => { void refetch(); }}
      vacio={gastos.length === 0}
      mensajeVacio="Sin gastos registrados este mes"
      pieEtiqueta="TOTAL GASTOS"
      pieValor={fmt.money(total)}
      pieColor="#EF4444"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={gastos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
            paddingAngle={2} dataKey="monto" nameKey="categoria">
            {gastos.map((_: any, i: number) => (
              <Cell key={i} fill={COLORES[i % COLORES.length]} />
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
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        </PieChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
