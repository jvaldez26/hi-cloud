import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica, COLORES, ejeMonto } from './TarjetaGrafica';

/** Corta un nombre largo sin dejarlo en mitad de una palabra a lo bruto. */
export const recorta = (v: string, n = 14) =>
  (v ?? '').length > n ? `${v.slice(0, n - 1)}…` : (v ?? '');

/**
 * Top clientes del AÑO en curso.
 *
 * El período es el año y no el mes a propósito: un ranking de clientes de los
 * primeros días de enero no dice nada, y quien mira esto quiere saber de quién
 * depende su facturación, que es una pregunta de fondo, no del día.
 */
export function WidgetTopClientes() {
  const { token } = theme.useToken();

  const ahora = dRD();
  const desde = ahora.startOf('year').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch } = useQuery<any[]>({
    queryKey: ['w-top-clientes', desde, hasta],
    queryFn:  () => api.get(`/analytics/top-clientes?limit=8&desde=${desde}&hasta=${hasta}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filas = Array.isArray(data) ? data : [];
  const datos = filas.map(r => ({
    nombre:   String(r.nombre ?? '—'),
    total:    Number(r.total ?? 0),
    facturas: Number(r.facturas ?? 0),
  }));
  const total = datos.reduce((s, d) => s + d.total, 0);

  return (
    <TarjetaGrafica
      titulo="Top clientes"
      subtitulo={`año ${ahora.year()}`}
      onRefresh={() => { void refetch(); }}
      vacio={datos.length === 0}
      mensajeVacio="Sin ventas registradas este año"
      pieEtiqueta="SUMAN ENTRE LOS 8"
      pieValor={fmt.money(total)}
      pieColor="#0EA5E9"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={token.colorBorderSecondary} />
          <XAxis type="number" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} tickFormatter={ejeMonto} />
          <YAxis type="category" dataKey="nombre" width={92}
            tick={{ fontSize: 11, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} tickFormatter={(v: string) => recorta(v)} />
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8, fontSize: 12,
            }}
            formatter={(v: number, _n, p: any) => [
              `${fmt.money(v)} · ${p?.payload?.facturas ?? 0} facturas`, 'Comprado',
            ]}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {datos.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
