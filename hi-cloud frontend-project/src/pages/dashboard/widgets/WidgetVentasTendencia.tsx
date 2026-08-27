import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { TarjetaGrafica, ejeMonto } from './TarjetaGrafica';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/** 'YYYY-MM' → 'Ago' (o 'Ago 25' si el año no es el actual). */
function etiquetaMes(periodo: string, anioActual: number) {
  const [a, m] = String(periodo).split('-').map(Number);
  const nombre = MESES[(m || 1) - 1] ?? periodo;
  return a === anioActual ? nombre : `${nombre} ${String(a).slice(2)}`;
}

/**
 * Ventas mes a mes, últimos 12.
 *
 * Área y no barras: aquí lo que importa es la forma de la curva —si sube, si se
 * hundió un mes— más que comparar meses sueltos entre sí.
 *
 * A diferencia del gráfico de Ingresos & Gastos, este es rodante: son los doce
 * meses anteriores a hoy, no el año fiscal. Las dos lecturas son útiles y por eso
 * conviven; el título lo dice para que nadie las confunda.
 */
export function WidgetVentasTendencia() {
  const { token } = theme.useToken();

  const { data, refetch } = useQuery<any[]>({
    queryKey: ['w-ventas-tendencia'],
    queryFn:  () => api.get('/analytics/ventas-tendencia?meses=12')
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filas = Array.isArray(data) ? data : [];
  const anioActual = new Date().getFullYear();
  const datos = filas.map(r => ({
    label: etiquetaMes(r.periodo, anioActual),
    total: Number(r.total ?? 0),
    facturas: Number(r.cantidad ?? 0),
  }));
  const total = datos.reduce((s, d) => s + d.total, 0);

  return (
    <TarjetaGrafica
      titulo="Ventas mensuales"
      subtitulo="últimos 12 meses"
      onRefresh={() => { void refetch(); }}
      vacio={datos.length === 0}
      mensajeVacio="Sin ventas en los últimos 12 meses"
      pieEtiqueta="TOTAL DEL PERÍODO"
      pieValor={fmt.money(total)}
      pieColor="#0EA5E9"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={datos} margin={{ top: 10, right: 14, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="gradVentasTendencia" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#0EA5E9" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={token.colorBorderSecondary} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} />
          <YAxis tickFormatter={ejeMonto} tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8, fontSize: 12,
            }}
            formatter={(v: number, _n, p: any) => [
              `${fmt.money(v)} · ${p?.payload?.facturas ?? 0} facturas`, 'Ventas',
            ]}
          />
          <Area type="monotone" dataKey="total" stroke="#0EA5E9" strokeWidth={2}
            fill="url(#gradVentasTendencia)" />
        </AreaChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
