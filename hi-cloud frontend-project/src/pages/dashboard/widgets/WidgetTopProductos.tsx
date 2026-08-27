import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica, COLORES, ejeMonto } from './TarjetaGrafica';
import { recorta } from './WidgetTopClientes';

/**
 * Top productos del AÑO en curso, por INGRESOS.
 *
 * Por ingresos y no por unidades vendidas: en una ferretería el artículo más
 * vendido son los tornillos, y eso no es lo que sostiene el negocio. Las
 * unidades van en el tooltip, que es donde importan cuando ya sabes de qué
 * producto estás hablando.
 */
export function WidgetTopProductos() {
  const { token } = theme.useToken();

  const ahora = dRD();
  const desde = ahora.startOf('year').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch } = useQuery<any[]>({
    queryKey: ['w-top-productos', desde, hasta],
    queryFn:  () => api.get(`/analytics/top-productos?limit=8&desde=${desde}&hasta=${hasta}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filas = Array.isArray(data) ? data : [];
  const datos = filas.map(r => ({
    nombre:   String(r.nombre ?? '—'),
    ingresos: Number(r.ingresos ?? 0),
    unidades: Number(r.cantidadVendida ?? 0),
  }));
  const total = datos.reduce((s, d) => s + d.ingresos, 0);

  return (
    <TarjetaGrafica
      titulo="Top productos"
      subtitulo={`año ${ahora.year()}`}
      onRefresh={() => { void refetch(); }}
      vacio={datos.length === 0}
      mensajeVacio="Sin ventas registradas este año"
      pieEtiqueta="SUMAN ENTRE LOS 8"
      pieValor={fmt.money(total)}
      pieColor="#10B981"
    >
      <ResponsiveContainer width="100%" height={260}>
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
              // Las unidades pueden tener decimales (se vende por metro, por libra).
              `${fmt.money(v)} · ${Number(p?.payload?.unidades ?? 0).toLocaleString('es-DO', { maximumFractionDigits: 2 })} u.`,
              'Vendido',
            ]}
          />
          <Bar dataKey="ingresos" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {datos.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
