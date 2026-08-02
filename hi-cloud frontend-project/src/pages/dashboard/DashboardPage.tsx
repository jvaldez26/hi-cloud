import { Row, Col, Card, Table, Typography, Spin, Tag, Space, Button, theme, DatePicker, Empty, Tooltip as AntTooltip, Skeleton } from 'antd';
import {
  DollarOutlined, FileTextOutlined, RightOutlined, ReloadOutlined,
  LineChartOutlined, BarChartOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { reportesApi } from '../../api/reportes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

// ── Saludo contextual + línea de contexto ────────────────────────────────────
function ContextoHeader() {
  const { user }   = useAuthStore();
  const role       = user?.role ?? 'admin';
  const navigate   = useNavigate();
  const { token }  = theme.useToken();

  // Fechas calculadas UNA SOLA VEZ (hora local del navegador → ISO UTC para el backend)
  const params = useMemo(() => {
    const now              = new Date();
    const inicioHoyLocal   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const inicioAyerLocal  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const mismaHoraAyer    = new Date(inicioAyerLocal.getTime() + (now.getTime() - inicioHoyLocal.getTime()));
    return {
      inicioHoy:     inicioHoyLocal.toISOString(),
      ahoraLocal:    now.toISOString(),
      inicioAyer:    inicioAyerLocal.toISOString(),
      mismaHoraAyer: mismaHoraAyer.toISOString(),
    };
  }, []);

  const { data: ctx, isLoading } = useQuery<any>({
    queryKey: ['dash-contexto', params.inicioHoy],
    queryFn:  () => reportesApi.contexto(params),
    staleTime: 2 * 60_000,
  });

  // Saludo según hora LOCAL del navegador
  const hora          = new Date().getHours();
  const saludoTexto   = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primerNombre  = (user?.nombre ?? '').split(' ')[0];

  // Resolución de prioridad de la línea de contexto
  const ctxLine = useMemo(() => {
    if (!ctx) return null;
    const esAdmin = role === 'admin' || role === 'contador';

    if (esAdmin && ctx.ecfRechazados > 0) {
      const n = ctx.ecfRechazados;
      return { tipo: 'alert', text: `${n} e-CF rechazado${n > 1 ? 's' : ''} por DGII hoy`, href: '/fiscal/ecf' };
    }
    if (esAdmin && ctx.stockCero > 0) {
      const n = ctx.stockCero;
      return { tipo: 'warn', text: `${n} producto${n > 1 ? 's' : ''} sin existencia`, href: '/inventario' };
    }
    if (esAdmin && ctx.facturasVencidas?.count > 0) {
      const { count: n, total } = ctx.facturasVencidas;
      return { tipo: 'warn', text: `${n} factura${n > 1 ? 's' : ''} vencida${n > 1 ? 's' : ''} por ${fmt.money(total)}`, href: '/cxc' };
    }
    if (ctx.ventasHoy > 0 && ctx.ventasAyerMismaHora > 0) {
      const delta = ((ctx.ventasHoy - ctx.ventasAyerMismaHora) / ctx.ventasAyerMismaHora) * 100;
      const sube  = delta >= 0;
      return {
        tipo: 'compare',
        text: `Llevas ${fmt.money(ctx.ventasHoy)} hoy — ${sube ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}% ${sube ? 'más' : 'menos'} que ayer a esta hora`,
        href: '/facturas',
        sube,
        superaSemana: ctx.ventasHoy > ctx.ventasHaceSemana,
      };
    }
    if (ctx.ventasHoy > 0) {
      return { tipo: 'info', text: `Llevas ${fmt.money(ctx.ventasHoy)} en ventas hoy`, href: '/facturas' };
    }
    if (ctx.topProductoHoy) {
      return { tipo: 'info', text: `Lo más vendido hoy: ${ctx.topProductoHoy.nombre} · ${fmt.money(ctx.topProductoHoy.total)}`, href: '/facturas' };
    }
    return { tipo: 'vacio', text: null, href: null };
  }, [ctx, role]);

  return (
    <div style={{ marginBottom: 12 }}>
      {isLoading ? (
        <Skeleton active title={{ width: 320 }} paragraph={false} />
      ) : (
        <div
          onClick={() => ctxLine?.href && navigate(ctxLine.href)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: ctxLine?.href ? 'pointer' : 'default',
            flexWrap: 'wrap',
            rowGap: 2,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 500, color: token.colorTextSecondary, lineHeight: 1.4 }}>
            {saludoTexto}, {primerNombre}
          </span>

          {ctxLine?.tipo === 'vacio' ? (
            <>
              <span style={{ margin: '0 8px', color: token.colorTextTertiary, fontSize: 13 }}>·</span>
              <span style={{ fontSize: 14, color: token.colorTextTertiary }}>
                Sin ventas aún —{' '}
                <a
                  onClick={e => { e.stopPropagation(); navigate('/pos'); }}
                  style={{ color: token.colorPrimary, textDecoration: 'underline' }}
                >
                  abrir POS
                </a>
              </span>
            </>
          ) : ctxLine ? (
            <>
              <span style={{ margin: '0 8px', color: token.colorTextTertiary, fontSize: 13 }}>·</span>
              <span
                style={{ fontSize: 14, color: token.colorTextSecondary }}
                onMouseEnter={e => { if (ctxLine.href) (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
              >
                {ctxLine.text}
              </span>
              {ctxLine.superaSemana && (
                <span style={{
                  marginLeft: 10, fontSize: 11, fontWeight: 500,
                  color: token.colorTextTertiary, letterSpacing: '0.01em',
                }}>
                  ↑ semana pasada
                </span>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Dashboard simplificado para vendedores ────────────────────────────────────
function DashboardVendedor() {
  const [periodo, setPeriodo] = useState(dayjs());
  const mes  = periodo.month() + 1;
  const anio = periodo.year();
  const navigate  = useNavigate();
  const { token } = theme.useToken();

  const desde = periodo.startOf('month').format('YYYY-MM-DD');
  const hasta  = periodo.endOf('month').format('YYYY-MM-DD');

  const { data: misFacturas, isLoading: loadFact } = useQuery<any>({
    queryKey: ['mis-facturas-dash', mes, anio],
    queryFn:  () => api.get(`/facturas?limit=8&desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: misCotizaciones, isLoading: loadCot } = useQuery<any>({
    queryKey: ['mis-cot-dash', mes, anio],
    queryFn:  () => api.get(`/cotizaciones?limit=8`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  const factData = Array.isArray(misFacturas?.data) ? misFacturas.data : (Array.isArray(misFacturas) ? misFacturas : []);
  const cotData  = Array.isArray(misCotizaciones?.data) ? misCotizaciones.data : (Array.isArray(misCotizaciones) ? misCotizaciones : []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <ContextoHeader />
        <DatePicker.MonthPicker value={periodo} onChange={v => v && setPeriodo(v)} format="MMMM YYYY" allowClear={false} />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas facturas" extra={<Button size="small" onClick={() => navigate('/facturas')}>Ver todas</Button>}>
            <Table dataSource={factData.slice(0, 6)} rowKey="id" size="small" loading={loadFact} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Folio',   dataIndex: 'folio',  width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',          ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total',  width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'green' : v === 'emitida' ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas cotizaciones" extra={<Button size="small" onClick={() => navigate('/cotizaciones')}>Ver todas</Button>}>
            <Table dataSource={cotData.slice(0, 6)} rowKey="id" size="small" loading={loadCot} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Número', dataIndex: 'numero', width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',         ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={{ aceptada: 'green', enviada: 'blue', borrador: 'default', rechazada: 'red', vencida: 'orange' }[v] ?? 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Widget base reutilizable ─────────────────────────────────────────────────
function CardWidget({ title, extra, children, noPad }: {
  title: string; extra?: React.ReactNode;
  children: React.ReactNode; noPad?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <Text strong style={{ fontSize: 15 }}>{title}</Text>
        {extra}
      </div>
      <div style={noPad ? undefined : undefined}>{children}</div>
    </div>
  );
}

// ── Dashboard Admin — estilo Cashflow ─────────────────────────────────────────
function DashboardAdmin() {
  const navigate  = useNavigate();
  const { token } = theme.useToken();
  const qc        = useQueryClient();
  const isMobile  = useMobile();
  const [grupoAbierto,  setGrupoAbierto]  = useState(true);
  const [chartTipo,     setChartTipo]     = useState<'line' | 'bar'>('line');
  const chartContainerRef = useRef<HTMLDivElement>(null);

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
      a.download = `ingresos-gastos-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }, []);

  // Listener para el evento 'dashboard:refresh' disparado por el logo del sidebar
  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['bancos-dashboard'] });
    qc.invalidateQueries({ queryKey: ['kpis-cf'] });
    qc.invalidateQueries({ queryKey: ['actividad-cf'] });
    qc.invalidateQueries({ queryKey: ['gastos-anual-cf'] });
    qc.invalidateQueries({ queryKey: ['fact-pend-cf'] });
    qc.invalidateQueries({ queryKey: ['antiguedad-cobrar'] });
    qc.invalidateQueries({ queryKey: ['antiguedad-pagar'] });
    qc.invalidateQueries({ queryKey: ['resumen-gastos-dash'] });
  }, [qc]);

  useEffect(() => {
    window.addEventListener('dashboard:refresh', refreshAll);
    return () => window.removeEventListener('dashboard:refresh', refreshAll);
  }, [refreshAll]);

  const mesActual  = dayjs().month() + 1;
  const anioActual = dayjs().year();

  // Widget tesorería: cuentas + balance + actividad financiera
  const { data: tesoreriaRaw } = useQuery<any>({
    queryKey: ['bancos-dashboard'],
    queryFn:  () => api.get('/tesoreria/dashboard').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // KPIs del mes
  const { data: kpis } = useQuery<any>({
    queryKey: ['kpis-cf', mesActual, anioActual],
    queryFn:  () => reportesApi.kpis(mesActual, anioActual),
    staleTime: 120_000,
  });

  // Actividad (audit log — se mantiene para otros usos futuros)
  const { data: auditRaw } = useQuery<any>({
    queryKey: ['actividad-cf'],
    queryFn:  () => api.get('/auditoria?limit=12').then((r: any) => r.data?.data ?? r.data),
    staleTime: 30_000,
  });

  // Gastos anuales para el gráfico
  const { data: gastosAnualRaw } = useQuery<any>({
    queryKey: ['gastos-anual-cf', anioActual],
    queryFn:  () => api.get(`/gastos/anual?anio=${anioActual}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 300_000,
  });

  // Facturas pendientes
  const { data: factPendRaw } = useQuery<any>({
    queryKey: ['fact-pend-cf'],
    queryFn:  () => api.get('/facturas?limit=8&estado=emitida').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    staleTime: 60_000,
  });

  // Normalizar datos
  const bancos      = tesoreriaRaw?.cuentas ?? [];
  const balanceBancos = tesoreriaRaw?.balanceTotal ?? 0;
  const actHoy    = tesoreriaRaw?.actividad?.hoy    ?? [];
  const actSemana = tesoreriaRaw?.actividad?.semana ?? [];

  const auditLogs   = Array.isArray(auditRaw?.data) ? auditRaw.data : (Array.isArray(auditRaw) ? auditRaw : []);
  const facturas    = Array.isArray(factPendRaw) ? factPendRaw : [];
  const gastosAnual = Array.isArray(gastosAnualRaw) ? gastosAnualRaw : (gastosAnualRaw?.data ?? []);

  const ahora = dayjs();

  // Antigüedad CxC
  const { data: antiguedadCxC, refetch: refetchCxC } = useQuery<any>({
    queryKey: ['antiguedad-cobrar'],
    queryFn:  () => api.get('/reportes/dashboard/antiguedad-cobrar').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // Antigüedad CxP
  const { data: antiguedadCxP, refetch: refetchCxP } = useQuery<any>({
    queryKey: ['antiguedad-pagar'],
    queryFn:  () => api.get('/reportes/dashboard/antiguedad-pagar').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // Resumen gastos
  const { data: resumenGastos, refetch: refetchGastos } = useQuery<any>({
    queryKey: ['resumen-gastos-dash'],
    queryFn:  () => api.get('/reportes/dashboard/resumen-gastos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // Datos del gráfico — 12 meses
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const d    = dayjs().subtract(11 - i, 'month');
    const mes  = d.month() + 1;
    const anio = d.year();
    const gastoRow = (Array.isArray(gastosAnual) ? gastosAnual : [])
      .find((r: any) => Number(r.mes) === mes && Number(r.anio ?? anioActual) === anio);
    const gasto   = Number(gastoRow?.total ?? 0);
    // Usar dopTotal si disponible (solo DOP) para no mezclar con USD
    const ingresoMes = kpis?.ventas?.dopTotal ?? kpis?.ventas?.mes ?? 0;
    const ingreso = (mes === mesActual && anio === anioActual)
      ? Number(ingresoMes) : 0;
    return { label: d.format('MMM YYYY'), ingreso, gasto };
  });

  return (
    <div>
      <ContextoHeader />

      <Row gutter={[16, 0]}>
        {/* ══ Columna izquierda ══════════════════════════════════════ */}
        <Col xs={24} lg={9}>

          {/* Widget: Cuentas de Bancos */}
          <CardWidget
            title="Cuentas de Bancos"
            extra={
              <Button type="text" size="small" style={{ color: token.colorTextTertiary, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                onClick={() => navigate('/bancos')}>⋯</Button>
            }
          >
            {/* Grupo expandible */}
            <div
              onClick={() => setGrupoAbierto(v => !v)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', cursor: 'pointer',
                background: grupoAbierto ? token.colorFillAlter : 'transparent',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: token.colorTextSecondary }}>
                <span style={{ fontSize: 10 }}>{grupoAbierto ? '▾' : '›'}</span>
                Efectivo y Cuentas
              </span>
              <Text style={{ fontSize: 13, fontWeight: 500 }}>
                {fmt.money(balanceBancos)}
              </Text>
            </div>

            {/* Cuentas individuales */}
            {grupoAbierto && (
              bancos.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Sin cuentas configuradas</Text>
                  <div>
                    <Button type="link" size="small" onClick={() => navigate('/bancos')}>
                      Ir a Bancos →
                    </Button>
                  </div>
                </div>
              ) : (
                bancos.slice(0, 5).map((b: any, i: number) => (
                  <div key={b.id ?? i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px 10px 24px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: '#10B981',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <DollarOutlined style={{ color: '#FFF', fontSize: 16 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre ?? 'Cuenta'}</div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        {b.tipo ?? 'corriente'} · {b.moneda ?? 'DOP'}
                      </div>
                    </div>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>
                      {fmt.money(Number(b.saldo ?? 0))}
                    </Text>
                  </div>
                ))
              )
            )}

            {/* Balance total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: token.colorFillAlter,
            }}>
              <Text strong style={{ fontSize: 14 }}>Balance</Text>
              <Text strong style={{ fontSize: 14, color: '#0EA5E9' }}>
                DOP${balanceBancos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </Text>
            </div>
          </CardWidget>

          {/* Widget: Actividad */}
          <CardWidget title="Actividad">
            {actHoy.length === 0 && actSemana.length === 0 ? (
              <>
                <div style={{ padding: '10px 16px 12px' }}>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
                  <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
                  </div>
                </div>
                <div style={{ padding: '10px 16px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
                  <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {actHoy.length > 0 && (
                  <div style={{ padding: '10px 16px' }}>
                    <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
                    <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
                    {actHoy.slice(0, 5).map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                              color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                              {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </Text>
                          </div>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {l.hora ?? dayjs(l.fecha).format('HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {actSemana.length > 0 && (
                  <div style={{ padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                    <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
                    <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
                    {actSemana.slice(0, 5).map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                              color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                              {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </Text>
                          </div>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {dayjs(l.fecha).format('DD/MM')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardWidget>
        </Col>

        {/* ══ Columna derecha ════════════════════════════════════════ */}
        <Col xs={24} lg={15}>

          {/* Widget: Ingresos & Gastos */}
          <CardWidget
            title="Ingresos & Gastos"
            extra={
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AntTooltip title={chartTipo === 'line' ? 'Ver como barras' : 'Ver como línea'}>
                    <button
                      onClick={() => setChartTipo(t => t === 'line' ? 'bar' : 'line')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: token.colorPrimary, padding: '2px 4px', borderRadius: 4,
                        display: 'flex', alignItems: 'center', fontSize: 14 }}
                    >
                      {chartTipo === 'line' ? <BarChartOutlined /> : <LineChartOutlined />}
                    </button>
                  </AntTooltip>
                  <AntTooltip title="Actualizar datos">
                    <button
                      onClick={() => qc.invalidateQueries({ queryKey: ['kpis-cf'] })}
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
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
                <Text style={{ fontSize: 12 }}>Ingresos</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E5E7EB' }} />
                <Text style={{ fontSize: 12 }}>Gastos</Text>
              </div>
            </div>
            {/* Gráfico */}
            <div ref={chartContainerRef} style={{ padding: '0 8px 16px' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
                {chartTipo === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                      axisLine={false} tickLine={false} tickFormatter={v => v.split(' ')[0]} />
                    <YAxis tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: token.colorTextTertiary }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number, n: string) => [fmt.money(v), n === 'ingreso' ? 'Ingresos' : 'Gastos']}
                      contentStyle={{ background: token.colorBgElevated,
                        border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="ingreso" stroke="#10B981" strokeWidth={2}
                      dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="gasto" stroke="#9CA3AF" strokeWidth={2}
                      dot={false} activeDot={{ r: 4 }} strokeDasharray="4 4" />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                      axisLine={false} tickLine={false} tickFormatter={v => v.split(' ')[0]} />
                    <YAxis tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: token.colorTextTertiary }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number, n: string) => [fmt.money(v), n === 'ingreso' ? 'Ingresos' : 'Gastos']}
                      contentStyle={{ background: token.colorBgElevated,
                        border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="ingreso" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="gasto"   fill="#9CA3AF" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardWidget>

          {/* Widget: KPIs multi-moneda (solo visible si hay operaciones USD) */}
          {((kpis?.ventas?.usdTotal ?? 0) > 0 || (kpis?.compras?.usdTotal ?? 0) > 0) && (
            <CardWidget title="Resumen en Divisas (USD)">
              <div style={{ padding: '10px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {(kpis?.ventas?.usdTotal ?? 0) > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Ventas del mes (USD)</Text>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#b45309' }}>
                      US$ {Number(kpis.ventas.usdTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>DOP: {fmt.money(Number(kpis.ventas.dopTotal ?? 0))}</Text>
                  </div>
                )}
                {(kpis?.compras?.usdTotal ?? 0) > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Compras del mes (USD)</Text>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>
                      US$ {Number(kpis.compras.usdTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>DOP: {fmt.money(Number(kpis.compras.dopTotal ?? 0))}</Text>
                  </div>
                )}
              </div>
            </CardWidget>
          )}

          {/* Widget: Facturas & Cobros */}
          <CardWidget
            title="Facturas & Cobros"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/cxc')}
                style={{ fontSize: 12 }}>Ver todo →</Button>
            }
          >
            {facturas.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Sin facturas pendientes de cobro</Text>
                <div style={{ marginTop: 8 }}>
                  <Button type="link" size="small" onClick={() => navigate('/facturas')}>Ir a Facturas →</Button>
                </div>
              </div>
            ) : (
              <div>
                {facturas.slice(0, 8).map((f: any, i: number) => (
                  <div
                    key={f.id ?? i}
                    onClick={() => navigate(`/facturas/${f.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px',
                      borderBottom: i < Math.min(facturas.length, 8) - 1
                        ? `1px solid ${token.colorBorderSecondary}` : 'none',
                      cursor: 'pointer', transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = token.colorFillAlter)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileTextOutlined style={{ color: '#0EA5E9', fontSize: 16 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: 500, display: 'block' }} ellipsis>
                        {f.cliente?.nombre ?? 'Cliente'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {f.folio ?? f.numero} · {f.fecha ? dayjs(f.fecha).format('DD/MM/YYYY') : ''}
                      </Text>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0EA5E9' }}>
                        {fmt.money(Number(f.total ?? 0))}
                      </div>
                      <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>PENDIENTE</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardWidget>
        </Col>
      </Row>

      {/* ══ Fila 2: Antigüedad CxC | Antigüedad CxP | Resumen Gastos ══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 16,
        marginTop: 16,
      }}
        className="dashboard-widgets-row"
      >
        {/* ── Antigüedad por Cobrar ── */}
        <WidgetAntiguedad
          titulo="Antigüedad por Cobrar"
          data={antiguedadCxC}
          labelTotal="POR COBRAR TOTAL"
          colorTotal="#10B981"
          onRefresh={refetchCxC}
        />

        {/* ── Antigüedad por Pagar ── */}
        <WidgetAntiguedad
          titulo="Antigüedad por Pagar"
          data={antiguedadCxP}
          labelTotal="POR PAGAR TOTAL"
          colorTotal="#EF4444"
          onRefresh={refetchCxP}
        />

        {/* ── Resumen de Gastos ── */}
        <WidgetResumenGastos
          data={resumenGastos}
          onRefresh={refetchGastos}
        />
      </div>
    </div>
  );
}

// ── Widget Antigüedad (CxC o CxP) ────────────────────────────────────────────
const ANTIGUEDAD_CONFIG = [
  { key: 'corriente',   rango: 'Corriente', color: '#10B981' },
  { key: 'dias_0_30',   rango: '0-30',      color: '#0EA5E9' },
  { key: 'dias_31_60',  rango: '31-60',     color: '#F59E0B' },
  { key: 'dias_61_90',  rango: '61-90',     color: '#F97316' },
  { key: 'dias_90_plus',rango: '90+',       color: '#EF4444' },
];

function WidgetAntiguedad({ titulo, data, labelTotal, colorTotal, onRefresh }: {
  titulo: string; data: any; labelTotal: string;
  colorTotal: string; onRefresh: () => void;
}) {
  const { token } = theme.useToken();
  const chartData = ANTIGUEDAD_CONFIG.map(c => ({
    rango:  c.rango,
    monto:  Number(data?.[c.key] ?? 0),
    color:  c.color,
  }));
  const total = Number(data?.total ?? 0);

  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</span>
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Gráfica */}
      <div style={{ padding: '8px 0 0' }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical"
            margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false}
              stroke={token.colorBorderSecondary} />
            <XAxis type="number"
              tick={{ fontSize: 10, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false}
              tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}K`} />
            <YAxis type="category" dataKey="rango" width={58}
              tick={{ fontSize: 11, fill: token.colorTextTertiary }}
              axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 8, fontSize: 12,
              }}
              formatter={(v: number) => [fmt.money(v), 'Monto']}
            />
            <Bar dataKey="monto" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {labelTotal}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: colorTotal }}>
          {fmt.money(total)}
        </span>
      </div>
    </div>
  );
}

// ── Widget Resumen de Gastos (donut) ─────────────────────────────────────────
const COLORES_GASTOS = ['#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EF4444','#F97316','#EC4899','#06B6D4'];

function WidgetResumenGastos({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  const { token } = theme.useToken();
  const gastos: any[] = data?.gastos ?? [];
  const total = Number(data?.total ?? 0);
  const mes   = data?.mes ?? '';

  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Resumen de Gastos</span>
          {mes && <span style={{ fontSize: 11, color: token.colorTextTertiary, marginLeft: 8 }}>{mes}</span>}
        </div>
        <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}
          style={{ color: token.colorTextTertiary }} />
      </div>

      {/* Gráfica */}
      {gastos.length === 0 ? (
        <div style={{ height: 260, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 36 }}>📊</div>
          <div style={{ fontSize: 13, color: token.colorTextTertiary }}>
            Sin gastos registrados este mes
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={gastos} cx="50%" cy="45%" innerRadius={60} outerRadius={95}
              paddingAngle={2} dataKey="monto" nameKey="categoria">
              {gastos.map((_: any, i: number) => (
                <Cell key={i} fill={COLORES_GASTOS[i % COLORES_GASTOS.length]} />
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
            <Legend iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* Footer total */}
      {total > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillAlter,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL GASTOS
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>
            {fmt.money(total)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  if (user?.role === 'vendedor') return <DashboardVendedor />;
  return <DashboardAdmin />;
}
