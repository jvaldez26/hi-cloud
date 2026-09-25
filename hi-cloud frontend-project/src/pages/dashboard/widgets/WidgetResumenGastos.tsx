import { Button, theme } from 'antd';
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { useModoEjemplo } from '../../../hooks/useModoEjemplo';
import {
  EJEMPLO_RESUMEN_GASTOS_CATEGORIAS, EJEMPLO_RESUMEN_GASTOS_TOTAL,
  EJEMPLO_RESUMEN_GASTOS_TOTAL_MES_ANTERIOR, EJEMPLO_RESUMEN_GASTOS_CAMBIO_PORCENTAJE,
} from './datosEjemplo';
import {
  EstadoGrafica, estadoDe, SEMANTICO, COLORES, estiloTooltip, useAltoGrafica,
  BadgeEjemplo,
} from './TarjetaGrafica';

// ── Widget Resumen de Gastos (donut) ─────────────────────────────────────────
// Las categorías de gasto no significan nada por su color: solo hay que poder
// distinguirlas. Es la rampa categórica, no una lista propia — antes era una
// copia literal de COLORES que había que mantener a mano.

export function WidgetResumenGastos() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const altoGrafica = useAltoGrafica();

  // La consulta vive DENTRO del widget: si no esta en el panel, no se pide.
  const { data, refetch, isPending, isError } = useQuery<any>({
    queryKey: ['resumen-gastos-dash'],
    queryFn:  () => api.get('/reportes/dashboard/resumen-gastos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const onRefresh = () => { void refetch(); };
  const gastosReales: any[] = data?.gastos ?? [];
  const vacioReal   = gastosReales.length === 0;
  const modoEjemplo = useModoEjemplo();
  const usarEjemplo = modoEjemplo && vacioReal && !isPending && !isError;
  const gastos = usarEjemplo ? EJEMPLO_RESUMEN_GASTOS_CATEGORIAS : gastosReales;
  const total = usarEjemplo ? EJEMPLO_RESUMEN_GASTOS_TOTAL : Number(data?.total ?? 0);
  const mes   = usarEjemplo
    ? new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
    : (data?.mes ?? '');
  const cambioPorcentaje: number | null = usarEjemplo
    ? EJEMPLO_RESUMEN_GASTOS_CAMBIO_PORCENTAJE
    : (data?.cambioPorcentaje ?? null);
  const estado = estadoDe({ cargando: isPending, error: isError, vacio: vacioReal && !usarEjemplo });
  const clickeable = estado === 'ok' && !usarEjemplo;
  const topCategorias = gastos.slice(0, 4);
  const maxTop = Math.max(1, ...topCategorias.map(g => Number(g.monto ?? 0)));

  const verListado = () => {
    const mesNum  = data?.mesNumero;
    const anioNum = data?.anioNumero;
    navigate(mesNum && anioNum ? `/gastos?mes=${mesNum}&anio=${anioNum}` : '/gastos');
  };

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
      aria-label={clickeable ? 'Ver listado de gastos del mes' : undefined}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Resumen de Gastos</span>
          {mes && <span style={{ fontSize: 11, color: token.colorTextTertiary }}>{mes}</span>}
          {usarEjemplo && <BadgeEjemplo />}
        </div>
        <Button type="text" size="small" icon={<ReloadOutlined />}
          disabled={usarEjemplo}
          onClick={e => { e.stopPropagation(); onRefresh(); }}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Total — grande y visible, con comparación contra el mes anterior. */}
      {estado === 'ok' && (
        <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: SEMANTICO.gasto, lineHeight: 1.2 }}>
            {fmt.money(total)}
          </div>
          {cambioPorcentaje !== null && (
            <span style={{
              fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2,
              color: cambioPorcentaje > 0 ? SEMANTICO.gasto : cambioPorcentaje < 0 ? SEMANTICO.ingreso : token.colorTextTertiary,
            }}>
              {cambioPorcentaje > 0 ? <ArrowUpOutlined /> : cambioPorcentaje < 0 ? <ArrowDownOutlined /> : null}
              {Math.abs(cambioPorcentaje)}% vs mes anterior
            </span>
          )}
        </div>
      )}

      {/* Top categorías — mini lista, antes de la gráfica. */}
      {estado === 'ok' && topCategorias.length > 0 && (
        <div style={{ padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {topCategorias.map((g, i) => (
            <div key={g.categoria} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: token.colorTextSecondary, width: 90, flexShrink: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.categoria}
              </span>
              <div style={{ flex: 1, background: token.colorFillSecondary, borderRadius: 3, height: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${(Number(g.monto ?? 0) / maxTop) * 100}%`, height: '100%',
                  background: COLORES[i % COLORES.length], borderRadius: 3,
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: token.colorText, flexShrink: 0 }}>
                {fmt.money(Number(g.monto ?? 0))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Gráfica */}
      <EstadoGrafica
        estado={estado}
        titulo="Resumen de Gastos"
        mensajeVacio="Sin gastos registrados este mes"
        accionVacio={{ texto: 'Registrar un gasto', onClick: () => navigate('/gastos') }}
        onRefresh={onRefresh}
      />
      {/* Los donuts no admiten accessibilityLayer de Recharts —solo lo tienen las
          cartesianas— así que sin este nombre accesible un lector de pantalla no
          anuncia absolutamente nada de la tarjeta. */}
      {estado === 'ok' && (
        <div role="img" aria-label={
          `Gastos por categoría. Total ${fmt.money(total)} repartido en ` +
          `${gastos.length} categorías: ` +
          gastos.map((g: any) => `${g.categoria}, ${fmt.money(Number(g.monto ?? 0))}`).join('; ')
        } style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={altoGrafica}>
          <PieChart>
            <Pie data={gastos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
              paddingAngle={2} dataKey="monto" nameKey="categoria">
              {gastos.map((_: any, i: number) => (
                <Cell key={i} fill={COLORES[i % COLORES.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={estiloTooltip(token)}
              formatter={(v: number, name: string) => [fmt.money(v), name]}
            />
            <Legend iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          </PieChart>
        </ResponsiveContainer>
        </div>
      )}

      {clickeable && (
        <div style={{ padding: '4px 16px 12px', textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
            Ver listado del mes →
          </span>
        </div>
      )}
    </div>
  );
}
