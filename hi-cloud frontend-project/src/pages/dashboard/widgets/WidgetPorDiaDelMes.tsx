import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica, ejeMonto, SEMANTICO, estiloTooltip, useAltoGrafica } from './TarjetaGrafica';

/**
 * Un mes día a día, en barras. Sirve igual para ventas que para compras: los dos
 * endpoints devuelven la misma forma (`detalle: [{dia, total, cantidad}]`).
 *
 * Se pintan TODOS los días del mes, incluidos los que no tuvieron movimiento.
 * Un mes con huecos visibles dice algo —cerró, no vendió, hubo feriado— que un
 * gráfico que solo muestra los días con datos esconde: sin los huecos, tres
 * ventas en tres semanas parecen tres días seguidos.
 */
function PorDiaDelMes({
  titulo, endpoint, claveQuery, color, etiquetaPie,
}: {
  titulo: string; endpoint: string; claveQuery: string;
  color: string; etiquetaPie: string;
}) {
  const { token } = theme.useToken();
  const altoGrafica = useAltoGrafica();

  const ahora = dRD();
  const mes   = ahora.month() + 1;
  const anio  = ahora.year();
  const diasDelMes = ahora.daysInMonth();

  const { data, refetch, isPending, isError } = useQuery<any>({
    queryKey: [claveQuery, mes, anio],
    queryFn:  () => api.get(`${endpoint}?mes=${mes}&anio=${anio}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const detalle: any[] = Array.isArray(data?.detalle) ? data.detalle : [];
  const porDia = new Map(detalle.map(r => [Number(r.dia), r]));

  const datos = Array.from({ length: diasDelMes }, (_, i) => {
    const dia = i + 1;
    const r   = porDia.get(dia);
    return {
      dia,
      total:    Number(r?.total ?? 0),
      cantidad: Number(r?.cantidad ?? 0),
    };
  });
  const total = datos.reduce((s, d) => s + d.total, 0);

  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={ahora.format('MMMM YYYY')}
      onRefresh={() => { void refetch(); }}
      alto={altoGrafica}
      cargando={isPending}
      error={isError}
      vacio={detalle.length === 0}
      mensajeVacio="Sin movimientos este mes"
      pieEtiqueta={etiquetaPie}
      pieValor={fmt.money(total)}
      pieColor={color}
    >
      <ResponsiveContainer width="100%" height={altoGrafica}>
        <BarChart accessibilityLayer data={datos} margin={{ top: 10, right: 14, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={token.colorBorderSecondary} />
          <XAxis
            dataKey="dia"
            tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false}
            interval={0}
            // 31 etiquetas no caben ni en la columna ancha: se rotulan los días
            // 1, 5, 10... y el resto queda como marca sin número.
            tickFormatter={(d: number) => (d === 1 || d % 5 === 0 ? String(d) : '')}
          />
          <YAxis tickFormatter={ejeMonto} tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: token.colorFillAlter }}
            contentStyle={estiloTooltip(token)}
            labelFormatter={(d: number) => `Día ${d}`}
            formatter={(v: number, _n, p: any) => [
              `${fmt.money(v)} · ${p?.payload?.cantidad ?? 0} doc.`, 'Total',
            ]}
          />
          <Bar dataKey="total" fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}

export const WidgetVentasPorDia = () => (
  <PorDiaDelMes
    titulo="Ventas por día"
    endpoint="/reportes/ventas/por-dia"
    claveQuery="w-ventas-por-dia"
    color={SEMANTICO.ingreso}
    etiquetaPie="VENDIDO ESTE MES"
  />
);

export const WidgetComprasPorDia = () => (
  <PorDiaDelMes
    titulo="Compras por día"
    endpoint="/reportes/compras/por-dia"
    claveQuery="w-compras-por-dia"
    color={SEMANTICO.alerta}
    etiquetaPie="COMPRADO ESTE MES"
  />
);
