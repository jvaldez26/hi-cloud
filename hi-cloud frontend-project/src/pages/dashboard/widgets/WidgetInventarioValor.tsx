import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { TarjetaGrafica, COLORES, GRIS_RESTO } from './TarjetaGrafica';

/**
 * Valor del inventario por categoría.
 *
 * El backend devuelve TODAS las categorías. Aquí se pintan las 7 mayores y el
 * resto se agrupa en «Otras»: un donut de veinte porciones no se lee, y las que
 * quedan fuera son por definición las que menos valor tienen. La suma sigue
 * cuadrando con el total del pie, que es lo que alguien va a comparar.
 *
 * Es una foto de HOY, no de un período: `stock * precio` con las existencias
 * actuales. Por eso no lleva selector de fechas.
 */
export function WidgetInventarioValor() {
  const { token } = theme.useToken();

  const { data, refetch, isPending, isError } = useQuery<any>({
    queryKey: ['w-inventario-valor'],
    queryFn:  () => api.get('/reportes/inventario/valor')
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const todas: { label: string; value: number }[] =
    Array.isArray(data?.grafica) ? data.grafica : [];

  const MAX = 7;
  const principales = todas.slice(0, MAX);
  const resto       = todas.slice(MAX);
  const datos = resto.length > 0
    ? [...principales, {
        label: `Otras (${resto.length})`,
        value: resto.reduce((s, r) => s + Number(r.value ?? 0), 0),
      }]
    : principales;

  const totalValor = Number(data?.resumen?.valorTotal ?? 0);
  const unidades   = Number(data?.resumen?.totalUnidades ?? 0);

  return (
    <TarjetaGrafica
      titulo="Valor de inventario"
      subtitulo={unidades > 0
        ? `${unidades.toLocaleString('es-DO', { maximumFractionDigits: 0 })} unidades`
        : undefined}
      onRefresh={() => { void refetch(); }}
      cargando={isPending}
      error={isError}
      vacio={datos.length === 0 || totalValor === 0}
      mensajeVacio="Sin existencias valorizadas"
      pieEtiqueta="VALOR TOTAL"
      pieValor={fmt.money(totalValor)}
      pieColor={COLORES[3]}
    >
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={datos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
            paddingAngle={2} dataKey="value" nameKey="label">
            {datos.map((d, i) => (
              // «Otras» siempre en gris: no es una categoría, es un cajón de sastre.
              <Cell key={i} fill={d.label.startsWith('Otras') ? GRIS_RESTO : COLORES[i % COLORES.length]} />
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
