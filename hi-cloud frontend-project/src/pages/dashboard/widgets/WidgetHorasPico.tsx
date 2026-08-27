import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tooltip as AntTooltip, theme } from 'antd';
import api from '../../../api/client';
import { TarjetaGrafica } from './TarjetaGrafica';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Mapa de calor de días y horas con más ventas, últimos 3 meses.
 *
 * No usa recharts: no trae mapa de calor y montarlo con un scatter de celdas
 * cuadradas sale peor que una rejilla CSS de 7 filas. Aquí la rejilla ES el
 * gráfico.
 *
 * Solo se pintan las horas que aparecen en los datos, de la primera a la última.
 * Una ferretería que abre de 8 a 6 no necesita 24 columnas de las que 14 están
 * siempre vacías: reparte el ancho entre las que dicen algo.
 *
 * El backend devuelve el top 50 de combinaciones (día, hora) ordenado por
 * cantidad, así que la rejilla es dispersa por diseño — los huecos son horas sin
 * ventas o fuera del top, y en los dos casos lo que se lee es lo mismo: ahí no
 * pasa nada.
 */
export function WidgetHorasPico() {
  const { token } = theme.useToken();

  const { data, refetch } = useQuery<any[]>({
    queryKey: ['w-horas-pico'],
    queryFn:  () => api.get('/analytics/horas-pico?meses=3')
      .then((r: any) => r.data?.data ?? r.data),
    staleTime: 10 * 60_000,
  });

  const filas = Array.isArray(data) ? data : [];

  // 'HH:00' → HH
  const horaNum = (h: string) => Number(String(h).slice(0, 2));
  const horas   = [...new Set(filas.map(r => horaNum(r.hora)))].sort((a, b) => a - b);
  const desde   = horas[0] ?? 8;
  const hasta   = horas[horas.length - 1] ?? 18;
  const columnas = Array.from({ length: Math.max(1, hasta - desde + 1) }, (_, i) => desde + i);

  const porCelda = new Map<string, number>();
  for (const r of filas) porCelda.set(`${r.dia}|${horaNum(r.hora)}`, Number(r.cantidad ?? 0));
  const maximo = Math.max(1, ...filas.map(r => Number(r.cantidad ?? 0)));

  const totalVentas = filas.reduce((s, r) => s + Number(r.cantidad ?? 0), 0);
  const mejor = filas.reduce(
    (best, r) => (Number(r.cantidad ?? 0) > Number(best?.cantidad ?? -1) ? r : best),
    null as any,
  );

  return (
    <TarjetaGrafica
      titulo="Horas y días pico"
      subtitulo="últimos 3 meses"
      onRefresh={() => { void refetch(); }}
      vacio={filas.length === 0}
      mensajeVacio="Sin ventas en los últimos 3 meses"
      pieEtiqueta="MÁS MOVIDO"
      pieValor={mejor ? `${mejor.dia} ${mejor.hora} · ${mejor.cantidad}` : '—'}
      pieColor="#0EA5E9"
    >
      <div style={{ padding: '14px 16px 16px', overflowX: 'auto', flex: 1 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `34px repeat(${columnas.length}, minmax(16px, 1fr))`,
          gap: 3,
          minWidth: columnas.length * 19 + 34,
        }}>
          {/* Cabecera de horas */}
          <div />
          {columnas.map(h => (
            <div key={`h${h}`} style={{
              fontSize: 9, color: token.colorTextTertiary, textAlign: 'center',
            }}>
              {h % 2 === 0 ? h : ''}
            </div>
          ))}

          {DIAS.map(dia => (
            <Fragment key={dia}>
              <div style={{
                fontSize: 11, color: token.colorTextTertiary,
                display: 'flex', alignItems: 'center',
              }}>
                {dia}
              </div>
              {columnas.map(h => {
                const n = porCelda.get(`${dia}|${h}`) ?? 0;
                // La intensidad arranca en 0.12 para que una celda con UNA venta
                // se distinga de una vacía: si escalara desde 0, lo poco y lo
                // nada se verían igual.
                const intensidad = n === 0 ? 0 : 0.12 + (n / maximo) * 0.88;
                return (
                  <AntTooltip
                    key={`${dia}-${h}`}
                    title={n > 0 ? `${dia} ${String(h).padStart(2, '0')}:00 — ${n} factura${n === 1 ? '' : 's'}` : undefined}
                  >
                    <div style={{
                      height: 22, borderRadius: 4,
                      background: n === 0
                        ? token.colorFillAlter
                        : `rgba(14, 165, 233, ${intensidad})`,
                    }} />
                  </AntTooltip>
                );
              })}
            </Fragment>
          ))}
        </div>

        <div style={{
          marginTop: 10, fontSize: 11, color: token.colorTextTertiary, textAlign: 'right',
        }}>
          {totalVentas.toLocaleString('es-DO')} facturas en el período
        </div>
      </div>
    </TarjetaGrafica>
  );
}
