import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica } from './TarjetaGrafica';

/**
 * Colores POR ESTADO, no por posición.
 *
 * En un donut normal da igual qué color toca a qué porción. Aquí no: rechazado
 * tiene que ser rojo y aceptado verde SIEMPRE, o alguien lee el panel de un
 * vistazo y entiende lo contrario de lo que pasa. Es la gráfica que un dueño
 * mira para saber si la DGII le está aceptando las facturas.
 */
const COLOR_ESTADO: Record<string, string> = {
  aceptado:            '#10B981',
  'aceptado condicional': '#84CC16',
  rechazado:           '#EF4444',
  'en proceso':        '#F59E0B',
  enviado:             '#0EA5E9',
  pendiente:           '#94A3B8',
  'no encontrado':     '#8B5CF6',
};

const colorDe = (estado: string) =>
  COLOR_ESTADO[String(estado).toLowerCase()] ?? '#94A3B8';

export function WidgetEcfEstado() {
  const { token } = theme.useToken();

  // El mes en curso en zona RD: con la del navegador, un equipo mal configurado
  // pediría el mes equivocado el día 1.
  const ahora = dRD();
  const mes   = ahora.month() + 1;
  const anio  = ahora.year();

  const { data, refetch } = useQuery<any>({
    queryKey: ['w-ecf-estado', mes, anio],
    queryFn:  () => api.get(`/reportes/fiscal/ecf?mes=${mes}&anio=${anio}`)
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  const datos: { label: string; value: number }[] = Array.isArray(data?.grafica) ? data.grafica : [];
  const total = datos.reduce((s, d) => s + Number(d.value ?? 0), 0);
  const rechazados = datos
    .filter(d => String(d.label).toLowerCase().includes('rechaz'))
    .reduce((s, d) => s + Number(d.value ?? 0), 0);

  return (
    <TarjetaGrafica
      titulo="e-CF por estado DGII"
      subtitulo={ahora.format('MMMM YYYY')}
      onRefresh={() => { void refetch(); }}
      vacio={datos.length === 0}
      mensajeVacio="Sin comprobantes emitidos este mes"
      pieEtiqueta={rechazados > 0 ? 'RECHAZADOS' : 'TOTAL DEL MES'}
      pieValor={rechazados > 0 ? String(rechazados) : String(total)}
      // El pie destaca lo rechazado cuando lo hay: es lo único que exige una
      // acción, y ahogado entre los aceptados no se ve.
      pieColor={rechazados > 0 ? '#EF4444' : token.colorText}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={datos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
            paddingAngle={2} dataKey="value" nameKey="label">
            {datos.map((d, i) => <Cell key={i} fill={colorDe(d.label)} />)}
          </Pie>
          <Tooltip
            contentStyle={{
              background: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8, fontSize: 12,
            }}
            formatter={(v: number, name: string) => [`${v} comprobante${v === 1 ? '' : 's'}`, name]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        </PieChart>
      </ResponsiveContainer>
    </TarjetaGrafica>
  );
}
