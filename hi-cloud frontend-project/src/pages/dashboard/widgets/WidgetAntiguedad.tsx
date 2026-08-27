import { theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { TarjetaGrafica, ejeMonto } from './TarjetaGrafica';

/**
 * Los tramos van SIEMPRE los cinco, aunque alguno esté a cero.
 *
 * Una antigüedad que solo pinta los tramos con saldo miente por omisión: si
 * desaparece «90+» porque hoy está limpio, mañana aparece y parece nuevo, cuando
 * lo que pasó es que algo cruzó los 90 días. Los cinco fijos hacen que la forma
 * de la barra se lea de un vistazo y de la misma manera cada día.
 */
const ANTIGUEDAD_CONFIG = [
  { key: 'corriente',    rango: 'Corriente', color: '#10B981' },
  { key: 'dias_0_30',    rango: '0-30',      color: '#0EA5E9' },
  { key: 'dias_31_60',   rango: '31-60',     color: '#F59E0B' },
  { key: 'dias_61_90',   rango: '61-90',     color: '#F97316' },
  { key: 'dias_90_plus', rango: '90+',       color: '#EF4444' },
];

function WidgetAntiguedad({ titulo, endpoint, queryKey, labelTotal, colorTotal }: {
  titulo: string; endpoint: string; queryKey: string;
  labelTotal: string; colorTotal: string;
}) {
  const { token } = theme.useToken();

  // La consulta vive DENTRO del widget: si no está en el panel, no se pide.
  const { data, refetch } = useQuery<any>({
    queryKey: [queryKey],
    queryFn:  () => api.get(endpoint).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const chartData = ANTIGUEDAD_CONFIG.map(c => ({
    rango: c.rango,
    monto: Number(data?.[c.key] ?? 0),
    color: c.color,
  }));
  const total = Number(data?.total ?? 0);

  return (
    <TarjetaGrafica
      titulo={titulo}
      onRefresh={() => { void refetch(); }}
      vacio={total === 0}
      mensajeVacio="Sin saldos pendientes"
      pieEtiqueta={labelTotal}
      pieValor={fmt.money(total)}
      pieColor={colorTotal}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical"
          margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false}
            stroke={token.colorBorderSecondary} />
          <XAxis type="number"
            tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} tickFormatter={ejeMonto} />
          <YAxis type="category" dataKey="rango" width={58}
            tick={{ fontSize: 11, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8, fontSize: 12,
            }}
            formatter={(v: number) => [fmt.money(v), 'Monto']}
          />
          <Bar dataKey="monto" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}

/** Antigüedad de lo que nos deben. */
export const WidgetAntiguedadCobrar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Cobrar"
    endpoint="/reportes/dashboard/antiguedad-cobrar"
    queryKey="antiguedad-cobrar"
    labelTotal="POR COBRAR TOTAL"
    colorTotal="#10B981"
  />
);

/** Antigüedad de lo que debemos. */
export const WidgetAntiguedadPagar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Pagar"
    endpoint="/reportes/dashboard/antiguedad-pagar"
    queryKey="antiguedad-pagar"
    labelTotal="POR PAGAR TOTAL"
    colorTotal="#EF4444"
  />
);
