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
 * Compras por proveedor del año en curso.
 *
 * OJO con los nombres de los parámetros: este endpoint usa `fechaDesde` y
 * `fechaHasta` (FiltroFechaDto, con @IsDateString), mientras que los de
 * /analytics usan `desde` y `hasta`. Mandar los de /analytics aquí devuelve un
 * 400 de validación, no un rango por defecto.
 */
export function WidgetComprasPorProveedor() {
  const { token } = theme.useToken();

  const ahora = dRD();
  const desde = ahora.startOf('year').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch } = useQuery<any>({
    queryKey: ['w-compras-proveedor', desde, hasta],
    queryFn:  () => api.get(
      `/reportes/compras/por-proveedor?fechaDesde=${desde}&fechaHasta=${hasta}`,
    ).then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filas: any[] = Array.isArray(data?.proveedores) ? data.proveedores : [];
  const datos = filas.slice(0, 8).map(r => ({
    nombre:  String(r.nombre ?? '—'),
    total:   Number(r.total ?? 0),
    compras: Number(r.cantidadCompras ?? 0),
  }));
  const total = Number(data?.total ?? 0);

  return (
    <TarjetaGrafica
      titulo="Compras por proveedor"
      subtitulo={`año ${ahora.year()}`}
      onRefresh={() => { void refetch(); }}
      vacio={datos.length === 0}
      mensajeVacio="Sin compras registradas este año"
      pieEtiqueta="COMPRADO EN EL AÑO"
      pieValor={fmt.money(total)}
      pieColor="#F59E0B"
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
              `${fmt.money(v)} · ${p?.payload?.compras ?? 0} compras`, 'Comprado',
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
