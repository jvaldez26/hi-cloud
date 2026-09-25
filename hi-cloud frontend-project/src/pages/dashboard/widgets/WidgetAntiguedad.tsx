import { Button, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { useModoEjemplo } from '../../../hooks/useModoEjemplo';
import { EJEMPLO_ANTIGUEDAD_COBRAR, EJEMPLO_ANTIGUEDAD_PAGAR } from './datosEjemplo';
import {
  EstadoGrafica, estadoDe, ejeMonto, RAMPA_SEVERIDAD, SEMANTICO, estiloTooltip,
  BadgeEjemplo, MarcaAguaEjemplo,
} from './TarjetaGrafica';

const ANTIGUEDAD_CONFIG = [
  { key: 'corriente',   rango: 'Corriente', color: RAMPA_SEVERIDAD[0] },
  { key: 'dias_0_30',   rango: '0-30',      color: RAMPA_SEVERIDAD[1] },
  { key: 'dias_31_60',  rango: '31-60',     color: RAMPA_SEVERIDAD[2] },
  { key: 'dias_61_90',  rango: '61-90',     color: RAMPA_SEVERIDAD[3] },
  { key: 'dias_90_plus',rango: '90+',       color: RAMPA_SEVERIDAD[4] },
];

function WidgetAntiguedad({
  titulo, endpoint, queryKey, labelTotal, colorTotal, rutaListado, accionVacio, datosEjemplo,
}: {
  titulo: string; endpoint: string; queryKey: string;
  labelTotal: string; colorTotal: string; rutaListado: string;
  accionVacio: { texto: string; ruta: string };
  datosEjemplo: { corriente: number; dias_0_30: number; dias_31_60: number; dias_61_90: number; dias_90_plus: number; total: number };
}) {
  const { token } = theme.useToken();
  const navigate  = useNavigate();

  // La consulta vive DENTRO del widget: si no esta en el panel, no se pide.
  const { data: dataReal, refetch, isPending, isError } = useQuery<any>({
    queryKey: [queryKey],
    queryFn:  () => api.get(endpoint).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const onRefresh = () => { void refetch(); };
  const vacioReal = ANTIGUEDAD_CONFIG.every(c => Number(dataReal?.[c.key] ?? 0) === 0);
  const modoEjemplo = useModoEjemplo();
  const usarEjemplo = modoEjemplo && vacioReal && !isPending && !isError;
  const data = usarEjemplo ? datosEjemplo : dataReal;
  const chartData = ANTIGUEDAD_CONFIG.map(c => ({
    rango:  c.rango,
    monto:  Number(data?.[c.key] ?? 0),
    color:  c.color,
  }));
  const total = Number(data?.total ?? 0);
  // Sin esto, cargando y fallando pintaban cinco barras a cero: no dice «no hay
  // datos», dice «todo vale cero», que es peor porque parece un dato.
  const estado = estadoDe({
    cargando: isPending, error: isError,
    vacio: vacioReal && !usarEjemplo,
  });
  const clickeable = estado === 'ok' && !usarEjemplo;
  const verListado = () => navigate(rutaListado);

  return (
    <div
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 12, overflow: 'hidden',
        cursor: clickeable ? 'pointer' : 'default',
      }}
      onClick={clickeable ? verListado : undefined}
      role={clickeable ? 'button' : undefined}
      aria-label={clickeable ? `Ver listado de ${titulo}` : undefined}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</span>
          {usarEjemplo && <BadgeEjemplo />}
        </div>
        <Button type="text" size="small" icon={<ReloadOutlined />}
          disabled={usarEjemplo}
          onClick={e => { e.stopPropagation(); onRefresh(); }}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Total — grande y visible, lo primero que se lee de la tarjeta. */}
      {estado === 'ok' && (
        <div style={{ padding: '14px 16px 4px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: colorTotal, lineHeight: 1.2 }}>
            {fmt.money(total)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {labelTotal}
          </div>
        </div>
      )}

      {/* Gráfica */}
      <EstadoGrafica estado={estado} alto={220} titulo={titulo}
        mensajeVacio="Sin saldos pendientes"
        accionVacio={{ texto: accionVacio.texto, onClick: () => navigate(accionVacio.ruta) }}
        onRefresh={onRefresh} />
      {estado === "ok" && (
      <div style={{ padding: "8px 0 0", position: 'relative' }}>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart accessibilityLayer data={chartData} layout="vertical"
            margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false}
              stroke={token.colorBorderSecondary} />
            <XAxis type="number"
              tick={{ fontSize: 10, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false}
              tickFormatter={ejeMonto} />
            <YAxis type="category" dataKey="rango" width={58}
              tick={{ fontSize: 11, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={estiloTooltip(token)}
              formatter={(v: number) => [fmt.money(v), 'Monto']}
            />
            <Bar dataKey="monto" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {usarEjemplo && <MarcaAguaEjemplo />}
      </div>
      )}

      {clickeable && (
        <div style={{
          padding: '8px 16px 12px', textAlign: 'right',
        }}>
          <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
            Ver listado completo →
          </span>
        </div>
      )}
    </div>
  );
}


/** Antiguedad de lo que nos deben. */
export const WidgetAntiguedadCobrar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Cobrar"
    endpoint="/reportes/dashboard/antiguedad-cobrar"
    queryKey="antiguedad-cobrar"
    labelTotal="POR COBRAR TOTAL"
    colorTotal={SEMANTICO.ingreso}
    rutaListado="/cxc"
    accionVacio={{ texto: 'Registrar una venta a crédito', ruta: '/facturas/nueva' }}
    datosEjemplo={EJEMPLO_ANTIGUEDAD_COBRAR}
  />
);

/** Antiguedad de lo que debemos. */
export const WidgetAntiguedadPagar = () => (
  <WidgetAntiguedad
    titulo="Antigüedad por Pagar"
    endpoint="/reportes/dashboard/antiguedad-pagar"
    queryKey="antiguedad-pagar"
    labelTotal="POR PAGAR TOTAL"
    colorTotal={SEMANTICO.gasto}
    rutaListado="/cxp"
    accionVacio={{ texto: 'Registrar una compra', ruta: '/compras/nueva' }}
    datosEjemplo={EJEMPLO_ANTIGUEDAD_PAGAR}
  />
);
