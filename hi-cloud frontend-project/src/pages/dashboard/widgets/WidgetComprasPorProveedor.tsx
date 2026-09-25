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
import { EJEMPLO_COMPRAS_POR_PROVEEDOR } from './datosEjemplo';
import { TarjetaGrafica, COLORES, ejeMonto, SEMANTICO, estiloTooltip, useAltoGrafica } from './TarjetaGrafica';
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
  const navigate  = useNavigate();
  const altoGrafica = useAltoGrafica();

  const ahora = dRD();
  const desde = ahora.startOf('year').format('YYYY-MM-DD');
  const hasta = ahora.format('YYYY-MM-DD');

  const { data, refetch, isPending, isError } = useQuery<any>({
    queryKey: ['w-compras-proveedor', desde, hasta],
    queryFn:  () => api.get(
      `/reportes/compras/por-proveedor?fechaDesde=${desde}&fechaHasta=${hasta}`,
    ).then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
  });

  const filasReales = Array.isArray(data?.proveedores) ? data.proveedores : [];
  const vacioReal   = filasReales.length === 0;
  const modoEjemplo = useModoEjemplo();
  const usarEjemplo = modoEjemplo && vacioReal && !isPending && !isError;
  const filas: any[] = usarEjemplo ? EJEMPLO_COMPRAS_POR_PROVEEDOR.proveedores : filasReales;
  const datos = filas.slice(0, 8).map(r => ({
    nombre:  String(r.nombre ?? '—'),
    total:   Number(r.total ?? 0),
    compras: Number(r.cantidadCompras ?? 0),
  }));
  const total = usarEjemplo ? EJEMPLO_COMPRAS_POR_PROVEEDOR.total : Number(data?.total ?? 0);

  return (
    <TarjetaGrafica
      titulo="Compras por proveedor"
      subtitulo={`año ${ahora.year()}`}
      onRefresh={() => { void refetch(); }}
      alto={altoGrafica}
      cargando={isPending}
      error={isError}
      vacio={vacioReal && !usarEjemplo}
      mensajeVacio="Sin compras registradas este año"
      accionVacio={{ texto: 'Registrar una compra', onClick: () => navigate('/compras/nueva') }}
      alClic={usarEjemplo ? undefined : () => navigate('/proveedores')}
      ejemplo={usarEjemplo}
      pieEtiqueta="COMPRADO EN EL AÑO"
      pieValor={fmt.money(total)}
      pieColor={SEMANTICO.alerta}
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
