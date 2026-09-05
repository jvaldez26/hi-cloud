import { useState, useEffect, useRef, useCallback } from 'react';
import { Select, Typography, theme, Tooltip as AntTooltip } from 'antd';
import { LineChartOutlined, BarChartOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '../../../api/client';
import { fmt } from '../../../utils/formatters';
import { EstadoGrafica, estadoDe, ejeMonto, SEMANTICO, estiloTooltip } from './TarjetaGrafica';
import { anioRD } from '../../../utils/fechaRD';
import { useMobile } from '../../../hooks/useMediaQuery';
import { CardWidget } from './CardWidget';

const { Text } = Typography;

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/**
 * Ingresos & Gastos del ano fiscal.
 *
 * Trae su propia consulta: si el usuario quita esta grafica del panel, el
 * componente se desmonta y la peticion deja de existir. No hay consulta padre
 * que la agrupe con las demas.
 */
export function WidgetIngresosGastos() {
  const { token } = theme.useToken();
  const qc        = useQueryClient();
  const isMobile  = useMobile();

  const [chartTipo, setChartTipo] = useState<'line' | 'bar'>(
    () => (localStorage.getItem('dash_chartTipo') as 'line' | 'bar') ?? 'line',
  );
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Enero a diciembre, no 12 meses rodantes. El rango lo decide el BACKEND:
  // calcularlo aqui lo dejaria a merced de la zona del navegador.
  const [anioChart, setAnioChart] = useState<number>(() => anioRD());
  // El exportador de PNG es un useCallback sin dependencias; la ref le da el
  // ano en curso sin tener que recrearlo en cada cambio del selector.
  const anioRef = useRef(anioChart);
  useEffect(() => { anioRef.current = anioChart; }, [anioChart]);

  const descargarGrafico = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const canvas  = document.createElement('canvas');
    canvas.width  = width  || 800;
    canvas.height = height || 280;
    const ctx  = canvas.getContext('2d');
    const img  = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      // El nombre lleva el ANO del grafico, no la fecha de descarga: el archivo
      // se guarda y se abre meses despues, y ahi lo que importa es que ano es.
      a.download = `ingresos-gastos-${anioRef.current}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }, []);

  const { data: aniosDisponibles } = useQuery<number[]>({
    queryKey: ['anios-con-datos'],
    queryFn:  () => api.get('/reportes/dashboard/anios-con-datos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 600_000,
  });

  const { data: chartAnualRaw, refetch: refetchAnual, isPending: cargandoAnual, isError: errorAnual } = useQuery<any>({
    queryKey: ['ingresos-gastos-anual', anioChart],
    queryFn:  () => api.get(
      `/reportes/dashboard/ingresos-gastos-anual?anio=${anioChart}`,
    ).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // El backend ya devuelve los 12 meses con ceros donde no hay datos: los meses
  // futuros salen VACIOS, no ocultos — ver el ano completo con la parte que
  // falta es informacion.
  const mesesAnual: any[] = Array.isArray(chartAnualRaw?.meses) ? chartAnualRaw.meses : [];
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const row = mesesAnual.find((r: any) => Number(r.mes) === i + 1);
    return {
      label:   MESES_CORTOS[i],
      ingreso: Number(row?.ingresos ?? 0),
      gasto:   Number(row?.gastos   ?? 0),
    };
  });

  // El backend rellena los 12 meses con ceros, asi que chartData NUNCA esta
  // vacio: sin este estado, cargando y fallando pintaban doce meses a cero —
  // que no parece "no hay datos", parece un ano sin ingresos ni gastos.
  const estadoAnual = estadoDe({
    cargando: cargandoAnual,
    error:    errorAnual,
    vacio:    chartData.every(d => d.ingreso === 0 && d.gasto === 0),
  });

  return (
    <CardWidget
      title="Ingresos & Gastos"
      extra={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Selector de año. Sin él, en enero el gráfico sale casi
                vacío y no habría forma de mirar el ejercicio recién
                cerrado. El año en curso siempre está en la lista, aunque
                todavía no tenga movimientos. */}
            <Select
              size="small"
              value={anioChart}
              onChange={setAnioChart}
              style={{ width: 88 }}
              options={(aniosDisponibles?.length ? aniosDisponibles : [anioRD()])
                .map(a => ({ value: a, label: String(a) }))}
            />
            <AntTooltip title={chartTipo === 'line' ? 'Ver como barras' : 'Ver como línea'}>
              <button
                onClick={() => setChartTipo(t => {
                  const next = t === 'line' ? 'bar' : 'line';
                  localStorage.setItem('dash_chartTipo', next);
                  return next;
                })}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: token.colorPrimary, padding: '2px 4px', borderRadius: 4,
                  display: 'flex', alignItems: 'center', fontSize: 14 }}
              >
                {chartTipo === 'line' ? <BarChartOutlined /> : <LineChartOutlined />}
              </button>
            </AntTooltip>
            <AntTooltip title="Actualizar datos">
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['ingresos-gastos-anual'] })}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: token.colorPrimary, padding: '2px 4px', borderRadius: 4,
                  display: 'flex', alignItems: 'center', fontSize: 14 }}
              >
                <ReloadOutlined />
              </button>
            </AntTooltip>
            <AntTooltip title="Guardar como imagen">
              <button
                onClick={descargarGrafico}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: token.colorPrimary, padding: '2px 4px', borderRadius: 4,
                  display: 'flex', alignItems: 'center', fontSize: 14 }}
              >
                <DownloadOutlined />
              </button>
            </AntTooltip>
          </div>
          <Text style={{ fontSize: 11, color: token.colorPrimary }}>
            {chartTipo === 'line' ? 'Switch to Bar Chart' : 'Switch to Line Chart'}
          </Text>
        </div>
      }
    >
      {/* Leyenda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: SEMANTICO.ingreso }} />
          <Text style={{ fontSize: 12 }}>Ingresos</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: token.colorTextTertiary }} />
          <Text style={{ fontSize: 12 }}>Gastos</Text>
        </div>
      </div>
      {/* Gráfico */}
      <EstadoGrafica estado={estadoAnual} alto={200} titulo="Ingresos & Gastos"
        mensajeVacio="Sin movimientos en el año seleccionado"
        onRefresh={() => { void refetchAnual(); }} />
      {estadoAnual === "ok" && (
      <div ref={chartContainerRef} style={{ padding: "0 8px 16px" }}>
        <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
          {chartTipo === 'line' ? (
            <LineChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />
              <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                axisLine={false} tickLine={false} tickFormatter={v => v.split(' ')[0]} />
              <YAxis tickFormatter={ejeMonto}
                tick={{ fontSize: 10, fill: token.colorTextTertiary }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number, n: string) => [fmt.money(v), n === 'ingreso' ? 'Ingresos' : 'Gastos']}
                contentStyle={estiloTooltip(token)} />
              <Line type="monotone" dataKey="ingreso" stroke={SEMANTICO.ingreso} strokeWidth={2}
                dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="gasto" stroke={token.colorTextTertiary} strokeWidth={2}
                dot={false} activeDot={{ r: 4 }} strokeDasharray="4 4" />
            </LineChart>
          ) : (
            <BarChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />
              <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                axisLine={false} tickLine={false} tickFormatter={v => v.split(' ')[0]} />
              <YAxis tickFormatter={ejeMonto}
                tick={{ fontSize: 10, fill: token.colorTextTertiary }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number, n: string) => [fmt.money(v), n === 'ingreso' ? 'Ingresos' : 'Gastos']}
                contentStyle={estiloTooltip(token)} />
              <Bar dataKey="ingreso" fill={SEMANTICO.ingreso} radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="gasto"   fill={token.colorTextTertiary} radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </CardWidget>

  );
}
