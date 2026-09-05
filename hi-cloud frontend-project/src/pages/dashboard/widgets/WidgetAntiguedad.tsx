import { Button, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { EstadoGrafica, estadoDe, ejeMonto, RAMPA_SEVERIDAD, SEMANTICO, estiloTooltip } from './TarjetaGrafica';

const ANTIGUEDAD_CONFIG = [
  { key: 'corriente',   rango: 'Corriente', color: RAMPA_SEVERIDAD[0] },
  { key: 'dias_0_30',   rango: '0-30',      color: RAMPA_SEVERIDAD[1] },
  { key: 'dias_31_60',  rango: '31-60',     color: RAMPA_SEVERIDAD[2] },
  { key: 'dias_61_90',  rango: '61-90',     color: RAMPA_SEVERIDAD[3] },
  { key: 'dias_90_plus',rango: '90+',       color: RAMPA_SEVERIDAD[4] },
];

function WidgetAntiguedad({ titulo, endpoint, queryKey, labelTotal, colorTotal }: {
  titulo: string; endpoint: string; queryKey: string;
  labelTotal: string; colorTotal: string;
}) {
  const { token } = theme.useToken();

  // La consulta vive DENTRO del widget: si no esta en el panel, no se pide.
  const { data, refetch, isPending, isError } = useQuery<any>({
    queryKey: [queryKey],
    queryFn:  () => api.get(endpoint).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const onRefresh = () => { void refetch(); };
  const chartData = ANTIGUEDAD_CONFIG.map(c => ({
    rango:  c.rango,
    monto:  Number(data?.[c.key] ?? 0),
    color:  c.color,
  }));
  const total = Number(data?.total ?? 0);
  // Sin esto, cargando y fallando pintaban cinco barras a cero: no dice «no hay
  // datos», dice «todo vale cero», que es peor porque parece un dato.
  const estado = estadoDe({
    cargando: isPending, error: isError,
    vacio: chartData.every(d => d.monto === 0),
  });

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
        <span style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</span>
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Gráfica */}
      <EstadoGrafica estado={estado} alto={220} titulo={titulo}
        mensajeVacio="Sin saldos pendientes" onRefresh={onRefresh} />
      {estado === "ok" && (
      <div style={{ padding: "8px 0 0" }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart accessibilityLayer data={chartData} layout="vertical"
            margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false}
              stroke={token.colorBorderSecondary} />
            <XAxis type="number"
              tick={{ fontSize: 10, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false}
              tickFormatter={ejeMonto} />
            <YAxis type="category" dataKey="rango" width={58}
              tick={{ fontSize: 11, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={estiloTooltip(token)}
              formatter={(v: number) => [fmt.money(v), 'Monto']}
            />
            <Bar dataKey="monto" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Footer total — oculto mientras no haya datos reales que totalizar. */}
      {estado === "ok" && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {labelTotal}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: colorTotal }}>
          {fmt.money(total)}
        </span>
      </div>
      )}
    </div>
  );
}


/** Antiguedad de lo que nos deben. */
export const WidgetAntiguedadCobrar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Cobrar"
    endpoint="/reportes/dashboard/antiguedad-cobrar"
    queryKey="antiguedad-cobrar"
    labelTotal="POR COBRAR TOTAL"
    colorTotal={SEMANTICO.ingreso}
  />
);

/** Antiguedad de lo que debemos. */
export const WidgetAntiguedadPagar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Pagar"
    endpoint="/reportes/dashboard/antiguedad-pagar"
    queryKey="antiguedad-pagar"
    labelTotal="POR PAGAR TOTAL"
    colorTotal={SEMANTICO.gasto}
  />
);
