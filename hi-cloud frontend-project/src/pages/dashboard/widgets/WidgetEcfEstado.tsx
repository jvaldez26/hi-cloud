import { useQuery } from '@tanstack/react-query';
import { theme } from 'antd';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { dRD } from '../../../utils/fechaRD';
import { TarjetaGrafica, SEMANTICO, GRIS_RESTO, estiloTooltip, useAltoGrafica } from './TarjetaGrafica';

/**
 * Colores POR ESTADO, no por posición.
 *
 * En un donut normal da igual qué color toca a qué porción. Aquí no: rechazado
 * tiene que ser rojo y aceptado verde SIEMPRE, o alguien lee el panel de un
 * vistazo y entiende lo contrario de lo que pasa. Es la gráfica que un dueño
 * mira para saber si la DGII le está aceptando las facturas.
 */
// Los estados de la DGII son su propio vocabulario, no la rampa categórica del
// panel: aquí el color SÍ significa, pero significa algo que solo existe en
// e-CF. Por eso los dos que no encajan en SEMANTICO se quedan literales — lima
// para el aceptado con reparos (verde pero no del todo) y violeta para el no
// encontrado (ni bien ni mal: no está). Forzarlos a la paleta genérica los
// haría parecer categorías intercambiables, que es justo lo que no son.
const COLOR_ESTADO: Record<string, string> = {
  aceptado:            SEMANTICO.ingreso,
  'aceptado condicional': '#84CC16',
  rechazado:           SEMANTICO.gasto,
  'en proceso':        SEMANTICO.alerta,
  enviado:             SEMANTICO.neutro,
  pendiente:           GRIS_RESTO,
  'no encontrado':     '#8B5CF6',
};

const colorDe = (estado: string) =>
  COLOR_ESTADO[String(estado).toLowerCase()] ?? GRIS_RESTO;

export function WidgetEcfEstado() {
  const { token } = theme.useToken();
  const altoGrafica = useAltoGrafica();

  // El mes en curso en zona RD: con la del navegador, un equipo mal configurado
  // pediría el mes equivocado el día 1.
  const ahora = dRD();
  const mes   = ahora.month() + 1;
  const anio  = ahora.year();

  const { data, refetch, isPending, isError } = useQuery<any>({
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
      alto={altoGrafica}
      cargando={isPending}
      error={isError}
      vacio={datos.length === 0}
      mensajeVacio="Sin comprobantes emitidos este mes"
      pieEtiqueta={rechazados > 0 ? 'RECHAZADOS' : 'TOTAL DEL MES'}
      pieValor={rechazados > 0 ? String(rechazados) : String(total)}
      // El pie destaca lo rechazado cuando lo hay: es lo único que exige una
      // acción, y ahogado entre los aceptados no se ve.
      pieColor={rechazados > 0 ? SEMANTICO.gasto : token.colorText}
    >
      {/* Nombre accesible: los donuts no admiten accessibilityLayer de Recharts,
          que solo existe para las gráficas cartesianas. */}
      <div role="img" aria-label={
        `Comprobantes electrónicos por estado DGII. ${total} en total: ` +
        datos.map(d => `${d.label}, ${d.value}`).join('; ')
      }>
      <ResponsiveContainer width="100%" height={altoGrafica}>
        <PieChart>
          <Pie data={datos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
            paddingAngle={2} dataKey="value" nameKey="label">
            {datos.map((d, i) => <Cell key={i} fill={colorDe(d.label)} />)}
          </Pie>
          <Tooltip
            contentStyle={estiloTooltip(token)}
            formatter={(v: number, name: string) => [`${v} comprobante${v === 1 ? '' : 's'}`, name]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        </PieChart>
      </ResponsiveContainer>
      </div>
    </TarjetaGrafica>
  );
}
