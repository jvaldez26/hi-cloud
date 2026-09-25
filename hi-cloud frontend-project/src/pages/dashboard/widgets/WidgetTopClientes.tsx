import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { dRD } from '../../../utils/fechaRD';
import { useModoEjemplo } from '../../../hooks/useModoEjemplo';
import { EJEMPLO_TOP_CLIENTES } from './datosEjemplo';
import { TarjetaGrafica, COLORES, ejeMonto, SEMANTICO, estiloTooltip, useAltoGrafica } from './TarjetaGrafica';

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
  const navigate  = useNavigate();
  const altoGrafica = useAltoGrafica();

  const ahora = dRD();
  const desde = ahora.startOf('year').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch, isPending, isError } = useQuery<any[]>({
    queryKey: ['w-top-clientes', desde, hasta],
    queryFn:  () => api.get(`/analytics/top-clientes?limit=8&desde=${desde}&hasta=${hasta}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filasReales = Array.isArray(data) ? data : [];
  const vacioReal   = filasReales.length === 0;
  const modoEjemplo = useModoEjemplo();
  const usarEjemplo = modoEjemplo && vacioReal && !isPending && !isError;
  const filas = usarEjemplo ? EJEMPLO_TOP_CLIENTES : filasReales;
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
      alto={altoGrafica}
      cargando={isPending}
      error={isError}
      vacio={vacioReal && !usarEjemplo}
      mensajeVacio="Sin ventas registradas este año"
      accionVacio={{ texto: 'Registrar una venta', onClick: () => navigate('/facturas/nueva') }}
      alClic={usarEjemplo ? undefined : () => navigate('/clientes')}
      ejemplo={usarEjemplo}
      pieEtiqueta="SUMAN ENTRE LOS 8"
      pieValor={fmt.money(total)}
      pieColor={SEMANTICO.neutro}
    >
      <ResponsiveContainer width="100%" height={altoGrafica}>
        <BarChart accessibilityLayer data={datos} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={token.colorBorderSecondary} />
          <XAxis type="number" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} tickFormatter={ejeMonto} />
          <YAxis type="category" dataKey="nombre" width={92}
            tick={{ fontSize: 11, fill: token.colorTextTertiary }}
            axisLine={false} tickLine={false} tickFormatter={(v: string) => recorta(v)} />
          <Tooltip
            contentStyle={estiloTooltip(token)}
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
