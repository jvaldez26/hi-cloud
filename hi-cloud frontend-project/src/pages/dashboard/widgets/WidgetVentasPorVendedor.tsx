import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica, COLORES, ejeMonto } from './TarjetaGrafica';

/**
 * Ventas por vendedor del mes en curso.
 *
 * El backend agrupa por `nombreVendedor` y devuelve 'Sin vendedor' cuando la
 * factura no tiene ninguno. Esa barra se pinta en rojo a propósito: es dinero
 * que no entra en ningún cierre de caja, y en esta empresa hubo 249 facturas así
 * (ver docs/estado-actual.md §1). Verla destacada es media solución.
 */
export function WidgetVentasPorVendedor() {
  const { token } = theme.useToken();

  const ahora = dRD();
  const desde = ahora.startOf('month').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch, isPending, isError } = useQuery<any[]>({
    queryKey: ['w-ventas-vendedor', desde, hasta],
    queryFn:  () => api.get(`/analytics/ventas-por-vendedor?desde=${desde}&hasta=${hasta}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const filas  = Array.isArray(data) ? data : [];
  const datos  = filas.slice(0, 8).map(r => ({
    nombre: String(r.nombre ?? '—'),
    total:  Number(r.total ?? 0),
    sinVendedor: String(r.nombre ?? '').toLowerCase().includes('sin vendedor'),
  }));
  const total = filas.reduce((s, r) => s + Number(r.total ?? 0), 0);

  return (
    <TarjetaGrafica
      titulo="Ventas por vendedor"
      subtitulo={ahora.format('MMMM YYYY')}
      onRefresh={() => { void refetch(); }}
      cargando={isPending}
      error={isError}
      vacio={datos.length === 0}
      mensajeVacio="Sin ventas este mes"
      pieEtiqueta="TOTAL DEL MES"
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
            axisLine={false} tickLine={false}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8, fontSize: 12,
            }}
            formatter={(v: number) => [fmt.money(v), 'Vendido']}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {datos.map((d, i) => (
              <Cell key={i} fill={d.sinVendedor ? '#EF4444' : COLORES[i % COLORES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
