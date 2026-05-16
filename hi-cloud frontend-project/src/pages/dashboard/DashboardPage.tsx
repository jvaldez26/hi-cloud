import { Row, Col, Card, Table, Typography, Spin, Alert, Tag, Space, Button, theme, Divider, Progress, Badge, DatePicker, Statistic } from 'antd';
import {
  ArrowUpOutlined, DollarOutlined, ClockCircleOutlined,
  WarningOutlined, ShoppingCartOutlined, RiseOutlined,
  FallOutlined, RightOutlined, AuditOutlined, FileTextOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, StockOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
  LineChart, Line,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { reportesApi } from '../../api/reportes.api';
import { cxcApi } from '../../api/cxc.api';
import { cxpApi } from '../../api/cxp.api';
import AnimatedStatCard from '../../components/ui/AnimatedStatCard';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

// Colores semánticos (reemplaza gradientes)
const CARD_ACCENTS = ['#0EA5E9', '#10B981', '#F59E0B', '#7C3AED'];

// ── Colores semánticos para gráficas ─────────────────────────────────────────
const COLOR_VENTAS    = '#1677ff';
const COLOR_COMPRAS   = '#fa8c16';
const COLOR_GASTOS    = '#ef4444';
const COLOR_UTILIDAD  = '#10b981';
const GASTOS_COLORS   = ['#1677ff','#10b981','#f59e0b','#ef4444','#7c3aed','#06b6d4','#f97316','#84cc16'];

const CustomTooltip = ({ active, payload, label }: any) => {
  const { token } = theme.useToken();
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
    }}>
      <div style={{ marginBottom: 4, color: token.colorTextSecondary }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: token.colorText }}>
          <span style={{ color: p.color }}>●</span>{' '}{fmt.money(p.value)}
        </div>
      ))}
    </div>
  );
};

// ── Separador de sección ──────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div>
          <Title level={5} style={{ margin: 0 }}>{title}</Title>
          {subtitle && <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>}
        </div>
      </div>
      {action}
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

  const { data: misFacturas, isLoading: loadFact } = useQuery<any>({
    queryKey: ['mis-facturas-dash', mes, anio],
    queryFn:  () => api.get(`/facturas?limit=8&mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: misCotizaciones, isLoading: loadCot } = useQuery<any>({
    queryKey: ['mis-cot-dash', mes, anio],
    queryFn:  () => api.get(`/cotizaciones?limit=8`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  const factData = Array.isArray(misFacturas?.data) ? misFacturas.data : (Array.isArray(misFacturas) ? misFacturas : []);
  const cotData  = Array.isArray(misCotizaciones?.data) ? misCotizaciones.data : (Array.isArray(misCotizaciones) ? misCotizaciones : []);

  const totalFacturado = factData.reduce((s: number, f: any) => s + Number(f.total ?? 0), 0);
  const totalCotizado  = cotData.reduce((s: number, c: any) => s + Number(c.total ?? 0), 0);
  const cotAceptadas   = cotData.filter((c: any) => c.estado === 'aceptada').length;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Mi Panel</Title>
        <DatePicker.MonthPicker value={periodo} onChange={v => v && setPeriodo(v)} format="MMMM YYYY" allowClear={false} />
      </Row>

      {/* KPIs del vendedor */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #0EA5E9' }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Facturado este mes</span>}
              value={totalFacturado}
              formatter={v => fmt.money(Number(v))}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
              prefix={<DollarOutlined style={{ color: '#0EA5E9', marginRight: 4 }} />}
            />
            <Button size="small" type="link" style={{ padding: 0, marginTop: 6 }}
              onClick={() => navigate('/facturas')}>Ver facturas →</Button>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #10B981' }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Cotizaciones activas</span>}
              value={cotData.filter((c: any) => ['borrador','enviada'].includes(c.estado)).length}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 13, color: token.colorTextTertiary }}> cotizaciones</span>}
            />
            <Button size="small" type="link" style={{ padding: 0, marginTop: 6 }}
              onClick={() => navigate('/cotizaciones')}>Ver cotizaciones →</Button>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #F59E0B' }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Cotizaciones aceptadas</span>}
              value={cotAceptadas}
              valueStyle={{ fontSize: 22, fontWeight: 700, color: '#F59E0B' }}
              suffix={<span style={{ fontSize: 13, color: token.colorTextTertiary }}>/ {cotData.length}</span>}
            />
            <div style={{ color: token.colorTextTertiary, fontSize: 11, marginTop: 6 }}>
              Total cotizado: {fmt.money(totalCotizado)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Mis últimas facturas */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas facturas" extra={<Button size="small" onClick={() => navigate('/facturas')}>Ver todas</Button>}>
            <Table
              dataSource={factData.slice(0, 6)} rowKey="id" size="small"
              loading={loadFact} pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Folio',    dataIndex: 'folio',   width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente',  key: 'cli',           ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',    dataIndex: 'total',   width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',   dataIndex: 'estado',  width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'green' : v === 'emitida' ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas cotizaciones" extra={<Button size="small" onClick={() => navigate('/cotizaciones')}>Ver todas</Button>}>
            <Table
              dataSource={cotData.slice(0, 6)} rowKey="id" size="small"
              loading={loadCot} pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Número',  dataIndex: 'numero',  width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',           ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total',   width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado',  width: 90,
                  render: (v: string) => <Tag color={{ aceptada: 'green', enviada: 'blue', borrador: 'default', rechazada: 'red', vencida: 'orange' }[v] ?? 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  if (user?.role === 'vendedor') return <DashboardVendedor />;

  const [periodo, setPeriodo] = useState(dayjs());
  const mes  = periodo.month() + 1;
  const anio = periodo.year();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // ── Queries existentes ───────────────────────────────────────────────────
  const { data: kpis, isLoading } = useQuery({ queryKey: ['kpis', mes, anio], queryFn: reportesApi.kpis });
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['ventas-dia', mes, anio],
    queryFn:  () => reportesApi.ventasPorDia(mes, anio),
  });
  const { data: alertasData } = useQuery<any>({
    queryKey: ['alertas-dashboard'],
    queryFn:  () => api.get('/alertas-sistema').then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: aprobData } = useQuery<any>({
    queryKey: ['aprobaciones-dashboard'],
    queryFn:  () => api.get('/aprobaciones/resumen').then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  // ── Queries nuevas ───────────────────────────────────────────────────────
  const { data: cxcResumen } = useQuery<any>({
    queryKey: ['cxc-resumen-dash'],
    queryFn:  () => cxcApi.resumen(),
    staleTime: 120_000,
  });
  const { data: cxpResumen } = useQuery<any>({
    queryKey: ['cxp-resumen-dash'],
    queryFn:  () => cxpApi.resumen(),
    staleTime: 120_000,
  });
  const { data: facturasRecientes } = useQuery<any>({
    queryKey: ['facturas-dash', mes, anio],
    queryFn:  () => api.get(`/facturas?limit=6&mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: gastosResumen } = useQuery<any>({
    queryKey: ['gastos-dash', mes, anio],
    queryFn:  () => api.get(`/gastos/resumen?mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const { data: stockBajo } = useQuery<any>({
    queryKey: ['stock-bajo-dash'],
    queryFn:  () => api.get('/inventario/stock-bajo').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const { data: comprasRecientes } = useQuery<any>({
    queryKey: ['compras-dash', mes, anio],
    queryFn:  () => api.get(`/compras?limit=5&mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: auditLogs } = useQuery<any>({
    queryKey: ['audit-dash'],
    queryFn:  () => api.get('/auditoria?limit=8').then((r: any) => r.data?.data ?? r.data),
    staleTime: 30_000,
  });
  const { data: ecfResumen } = useQuery<any>({
    queryKey: ['ecf-resumen-dash'],
    queryFn:  () => api.get('/ecf/resumen').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });
  const { data: gastosAnual } = useQuery<any>({
    queryKey: ['gastos-anual-dash', anio],
    queryFn:  () => api.get(`/gastos/anual?anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // ── Mes anterior para calcular trends reales ─────────────────────────────
  const periodoAnt = periodo.subtract(1, 'month');
  const mesAnt  = periodoAnt.month() + 1;
  const anioAnt = periodoAnt.year();
  const { data: kpisAnt } = useQuery<any>({
    queryKey: ['kpis-ant', mesAnt, anioAnt],
    queryFn:  () => reportesApi.ventasPorPeriodo(
      periodoAnt.startOf('month').format('YYYY-MM-DD'),
      periodoAnt.endOf('month').format('YYYY-MM-DD'),
    ),
    staleTime: 5 * 60_000,
  });

  // ── Top clientes y productos del mes ─────────────────────────────────────
  const desdeM = periodo.startOf('month').format('YYYY-MM-DD');
  const hastaM = periodo.endOf('month').format('YYYY-MM-DD');
  const { data: topClientesMes } = useQuery<any[]>({
    queryKey: ['top-cli-dash', mes, anio],
    queryFn:  () => reportesApi.topClientes(desdeM, hastaM, 5),
    staleTime: 120_000,
  });
  const { data: topProductosMes } = useQuery<any[]>({
    queryKey: ['top-prod-dash', mes, anio],
    queryFn:  () => reportesApi.topProductos(desdeM, hastaM, 5),
    staleTime: 120_000,
  });

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: 40, height: 40, borderRadius: '50%',
                 border: `3px solid ${token.colorPrimary}`, borderTopColor: 'transparent' }}
      />
    </div>
  );

  const ventas  = kpis?.ventas  ?? {};
  const balance = kpis?.balanceMes ?? {};
  const alertas = kpis?.alertas   ?? {};

  // Trends reales vs mes anterior
  const ventasMesAnt  = Number(kpisAnt?.resumen?.total ?? 0);
  const ventasMesAct  = Number(ventas.mes ?? 0);
  const trendVentas   = ventasMesAnt > 0 ? Math.round(((ventasMesAct - ventasMesAnt) / ventasMesAnt) * 100) : null;

  // Margen bruto del mes
  const margenBruto   = ventasMesAct - Number(kpis?.compras?.mes ?? 0);
  const margenPct     = ventasMesAct > 0 ? Math.round((margenBruto / ventasMesAct) * 100) : 0;

  const grafica = (chartData?.detalle ?? []).map((d: any) => ({
    dia: `D${d.dia}`, ventas: d.total,
  }));

  // Gráfica gastos anuales: ventas vs gastos por mes
  const mesesLabel = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const graficaGastosAnual = (gastosAnual ?? []).map((g: any, i: number) => ({
    mes:    mesesLabel[i] ?? g.periodo,
    gastos: Number(g.total ?? 0),
  }));

  // Gastos por categoría (pie)
  const graficaGastosCat = (gastosResumen?.porCategoria ?? []).slice(0, 8).map((c: any, i: number) => ({
    name:  c.label ?? c.categoria,
    value: Number(c.total ?? 0),
    fill:  GASTOS_COLORS[i % GASTOS_COLORS.length],
  }));

  const kpiCards = [
    {
      title: 'Ventas hoy',
      value: ventas.hoy ?? 0,
      accent: CARD_ACCENTS[0], icon: <DollarOutlined />, formatter: fmt.money,
    },
    {
      title: 'Ventas del mes',
      value: ventas.mes ?? 0,
      accent: CARD_ACCENTS[1], icon: <RiseOutlined />, formatter: fmt.money,
      trend: trendVentas !== null ? { value: trendVentas, label: 'vs mes ant.' } : undefined,
    },
    {
      title: 'Compras del mes',
      value: kpis?.compras?.mes ?? 0,
      accent: CARD_ACCENTS[2], icon: <ShoppingCartOutlined />, formatter: fmt.money,
    },
    {
      title: 'Balance del mes',
      value: balance.balance ?? 0,
      accent: CARD_ACCENTS[3], icon: <ArrowUpOutlined />, formatter: fmt.money,
    },
  ];

  // Segunda fila de KPIs — CxC, CxP, Margen, ECF
  const kpiCards2 = [
    {
      label: 'Por cobrar (CxC)',
      value: cxcResumen?.totalPorCobrar ?? 0,
      vencido: cxcResumen?.totalVencido ?? 0,
      color: '#1677ff',
      icon: '💰',
      ruta: '/cxc',
    },
    {
      label: 'Por pagar (CxP)',
      value: cxpResumen?.totalPorPagar ?? 0,
      vencido: cxpResumen?.totalVencido ?? 0,
      color: '#7c3aed',
      icon: '💳',
      ruta: '/cxp',
    },
    {
      label: 'Margen bruto',
      value: margenBruto,
      extra: `${margenPct}% del total facturado`,
      color: margenBruto >= 0 ? '#059669' : '#dc2626',
      icon: '📊',
      ruta: '/reportes',
    },
    {
      label: 'e-CFs este mes',
      value: ecfResumen?.total ?? 0,
      extra: `${ecfResumen?.aceptados ?? 0} aceptados · ${ecfResumen?.rechazados ?? 0} rechazados`,
      color: (ecfResumen?.rechazados ?? 0) > 0 ? '#dc2626' : '#059669',
      icon: '🧾',
      ruta: '/ecf',
    },
  ];

  return (
    <div>
      {/* ── Encabezado ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} style={{ marginBottom: 20 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center" wrap>
              <Title level={4} style={{ margin: 0 }}>Dashboard</Title>
              <DatePicker
                picker="month"
                value={periodo}
                onChange={d => d && setPeriodo(d)}
                format="MMMM YYYY"
                allowClear={false}
                size="small"
                style={{ width: 150 }}
              />
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>Resumen operacional en tiempo real</Text>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs().format('dddd, D [de] MMMM YYYY')}</Text>

          </Col>
        </Row>
      </motion.div>

      {/* ── Alertas de sistema ── */}
      {(alertas.facturasPendientes > 0 || alertas.productosStockBajo > 0) && (
        <motion.div initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {alertas.facturasPendientes > 0 && (
              <Col><Alert type="warning" showIcon closable
                message={<>{alertas.facturasPendientes} factura(s) pendientes · <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/cxc')}>Ver CxC <RightOutlined /></Button></>} /></Col>
            )}
            {alertas.productosStockBajo > 0 && (
              <Col><Alert type="error" showIcon closable
                message={<>{alertas.productosStockBajo} producto(s) con stock bajo · <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/inventario')}>Ver inventario <RightOutlined /></Button></>} /></Col>
            )}
          </Row>
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 1 — KPIs + Ventas + Clientes + Productos
          ════════════════════════════════════════════════════════════════ */}

      {/* ── KPI Cards (Fila 1) ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 12 }}>
        {kpiCards.map((k, i) => (
          <Col xs={24} sm={12} xl={6} key={k.title}>
            <AnimatedStatCard {...k} delay={i * 0.08} />
          </Col>
        ))}
      </Row>

      {/* ── KPI Cards (Fila 2 — CxC, CxP, Margen, ECF) ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {kpiCards2.map((k, i) => (
          <Col xs={24} sm={12} xl={6} key={k.label}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06 }}>
              <Card
                size="small"
                hoverable
                onClick={() => navigate(k.ruta)}
                style={{ borderRadius: 10, cursor: 'pointer', borderLeft: `3px solid ${k.color}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{k.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: k.color, lineHeight: 1.1 }}>
                      {fmt.money(k.value)}
                    </div>
                    {k.vencido != null && k.vencido > 0 && (
                      <div style={{ fontSize: 11, color: '#dc2626' }}>
                        ⚠️ {fmt.money(k.vencido)} vencido
                      </div>
                    )}
                    {k.extra && (
                      <div style={{ fontSize: 11, color: token.colorTextSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {k.extra}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      {/* ── Gráfica ventas + Top clientes ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={15}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, delay: .32 }}>
            <Card title={<><RiseOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />Ventas del mes — por día</>}
              loading={chartLoading} style={{ borderRadius: 12 }} extra={<Tag color="blue">DOP</Tag>}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={grafica} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                  <defs>
                    <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={COLOR_VENTAS} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLOR_VENTAS} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="ventas" name="Ventas" stroke={COLOR_VENTAS} strokeWidth={2.5}
                    fill="url(#gradVentas)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>
        </Col>

        <Col xs={24} lg={9}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, delay: .4 }}>
            <Card title="🏆 Top Clientes del mes" style={{ borderRadius: 12, height: '100%' }}
              extra={<Button type="link" size="small" onClick={() => navigate('/reportes')}>Ver más →</Button>}>
              {(() => {
                const lista = (topClientesMes ?? kpis?.topClientes ?? []).slice(0, 5);
                const max   = Number((lista[0] as any)?.value ?? (lista[0] as any)?.total ?? 1);
                return lista.length ? lista.map((c: any, i: number) => {
                  const val = Number(c.value ?? c.total ?? 0);
                  const pct = Math.round((val / max) * 100);
                  return (
                    <motion.div key={c.label ?? c.nombre ?? i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .45 + i * 0.07 }} style={{ marginBottom: 12 }}>
                      <Row justify="space-between" style={{ marginBottom: 3 }}>
                        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: c.label ?? c.nombre }}>
                          <span style={{ marginRight: 6 }}>{i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}.`}</span>
                          {c.label ?? c.nombre}
                        </Text>
                        <Text style={{ fontSize: 12 }} strong>{fmt.money(val)}</Text>
                      </Row>
                      <div style={{ background: token.colorFillSecondary, borderRadius: 4, height: 4, overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .7, delay: .5 + i * .07 }}
                          style={{ height: '100%', background: COLOR_VENTAS, borderRadius: 4 }} />
                      </div>
                    </motion.div>
                  );
                }) : <Text type="secondary">Sin datos este mes</Text>;
              })()}
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* ── Top productos + Indicadores ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="🛍️ Top Productos vendidos" style={{ borderRadius: 12 }}>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={(kpis?.topProductos ?? []).slice(0, 6)} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt.money(v)} contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}` }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {(kpis?.topProductos ?? []).slice(0, 6).map((_: any, i: number) => (
                    <Cell key={i} fill={`hsl(${210 + i * 20}, 80%, ${55 - i * 4}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="⚡ Indicadores clave" style={{ borderRadius: 12 }}>
            <Row gutter={[12, 12]}>
              {[
                { label: 'Ventas semana',       value: ventas.semana ?? 0,              money: true,  color: token.colorPrimary },
                { label: 'Ventas año',           value: ventas.anio   ?? 0,              money: true,  color: token.colorSuccess },
                { label: 'Facturas pendientes',  value: alertas.facturasPendientes ?? 0, money: false, color: alertas.facturasPendientes > 0 ? token.colorWarning : token.colorSuccess },
                { label: 'e-CFs pendientes',     value: alertas.ecfPendientes ?? 0,      money: false, color: alertas.ecfPendientes > 0 ? token.colorError : token.colorSuccess },
                { label: 'CxC por cobrar',       value: cxcResumen?.totalPendiente ?? 0, money: true,  color: token.colorWarning },
                { label: 'CxP por pagar',        value: cxpResumen?.totalPendiente ?? 0, money: true,  color: token.colorError },
              ].map((k, i) => (
                <Col span={12} key={k.label}>
                  <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .5 + i * .05 }}
                    style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillAlter }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>{k.label}</Text>
                    <Text strong style={{ fontSize: 16, color: k.color }}>
                      {k.money ? fmt.money(k.value) : Number(k.value).toLocaleString('es-DO')}
                    </Text>
                  </motion.div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 2 — Finanzas, Gastos, Facturas recientes
          ════════════════════════════════════════════════════════════════ */}

      <SectionHeader icon="💰" title="Cuentas por Cobrar & Pagar"
        subtitle={`Estado de cobros y pagos pendientes · ${periodo.format('MMMM YYYY')}`}
        action={<Space><Button size="small" onClick={() => navigate('/cxc')}>Ver CxC</Button><Button size="small" onClick={() => navigate('/cxp')}>Ver CxP</Button></Space>}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* CxC */}
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: `${token.colorPrimary}12`, border: `1px solid ${token.colorPrimaryBorder}` }}>
            <Text type="secondary" style={{ fontSize: 12 }}>💳 Cuentas por Cobrar</Text>
            <div style={{ fontSize: 28, fontWeight: 900, color: token.colorPrimary, margin: '8px 0 4px' }}>
              {fmt.money(cxcResumen?.totalPendiente ?? 0)}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { label: 'Vencidas',    value: cxcResumen?.vencidas ?? 0,    color: token.colorError },
                { label: 'Por vencer',  value: cxcResumen?.porVencer ?? 0,   color: token.colorWarning },
                { label: 'Pagadas',     value: cxcResumen?.pagadas ?? 0,     color: token.colorSuccess },
              ].map(s => (
                <div key={s.label}>
                  <Text type="secondary" style={{ fontSize: 10 }}>{s.label}</Text>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmt.money(s.value)}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* CxP */}
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: `${token.colorWarning}12`, border: `1px solid ${token.colorWarningBorder}` }}>
            <Text type="secondary" style={{ fontSize: 12 }}>🏦 Cuentas por Pagar</Text>
            <div style={{ fontSize: 28, fontWeight: 900, color: token.colorWarning, margin: '8px 0 4px' }}>
              {fmt.money(cxpResumen?.totalPendiente ?? 0)}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { label: 'Vencidas',   value: cxpResumen?.vencidas ?? 0,  color: token.colorError },
                { label: 'Por vencer', value: cxpResumen?.porVencer ?? 0, color: token.colorWarning },
                { label: 'Pagadas',    value: cxpResumen?.pagadas ?? 0,   color: token.colorSuccess },
              ].map(s => (
                <div key={s.label}>
                  <Text type="secondary" style={{ fontSize: 10 }}>{s.label}</Text>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{fmt.money(s.value)}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Balance neto */}
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: token.colorFillAlter, height: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>⚖️ Balance Neto estimado</Text>
            <div style={{ fontSize: 28, fontWeight: 900, color: token.colorSuccess, margin: '8px 0 4px' }}>
              {fmt.money((cxcResumen?.totalPendiente ?? 0) - (cxpResumen?.totalPendiente ?? 0))}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>CxC − CxP pendientes</Text>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11 }}>Cobrar</Text>
                <Text style={{ fontSize: 11 }}>{fmt.money(cxcResumen?.totalPendiente ?? 0)}</Text>
              </div>
              <Progress
                percent={Math.min(100, (cxcResumen?.totalPendiente ?? 0) / Math.max(1, (cxcResumen?.totalPendiente ?? 0) + (cxpResumen?.totalPendiente ?? 0)) * 100)}
                showInfo={false} strokeColor={token.colorPrimary} trailColor={token.colorError} size="small"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 11 }}>Pagar</Text>
                <Text style={{ fontSize: 11 }}>{fmt.money(cxpResumen?.totalPendiente ?? 0)}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Facturas recientes ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 0 }}>
        <Col xs={24} lg={14}>
          <Card title={<><FileTextOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />Facturas recientes</>}
            style={{ borderRadius: 12 }} extra={<Button size="small" type="link" onClick={() => navigate('/facturas')}>Ver todas →</Button>}>
            <Table
              size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={(facturasRecientes?.data ?? facturasRecientes ?? []).slice(0, 6)}
              rowKey="id"
              columns={[
                { title: 'Folio',    dataIndex: 'folio',   width: 130, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente',  key: 'cli',           ellipsis: true, render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.cliente?.nombre ?? '—'}</Text> },
                { title: 'Total',    dataIndex: 'total',   width: 110, align: 'right' as const, render: (v: number) => <Text strong style={{ color: token.colorPrimary, fontSize: 12 }}>{fmt.money(v)}</Text> },
                { title: 'Estado',   dataIndex: 'estado',  width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'success' : v === 'emitida' ? 'blue' : v === 'anulada' ? 'error' : 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
              ]} />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="📊 Gastos del mes por categoría" style={{ borderRadius: 12, height: '100%' }}
            extra={<Button size="small" type="link" onClick={() => navigate('/gastos')}>Ver gastos →</Button>}>
            {graficaGastosCat.length > 0 ? (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={graficaGastosCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name.substring(0,8)} ${(percent*100).toFixed(0)}%`} labelLine fontSize={10}>
                    {graficaGastosCat.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt.money(v)} contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}` }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">Sin gastos registrados este mes</Text>
              </div>
            )}
            {gastosResumen && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Text strong style={{ fontSize: 14, color: token.colorError }}>
                  Total: {fmt.money(gastosResumen.totalGastos ?? 0)}
                </Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 3 — Inventario, Compras, e-CF, Actividad
          ════════════════════════════════════════════════════════════════ */}

      <SectionHeader icon="📦" title="Inventario crítico"
        subtitle="Productos con stock bajo o agotado que requieren atención"
        action={<Button size="small" onClick={() => navigate('/inventario')}>Ver inventario →</Button>}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 0 }}>
        <Col xs={24} lg={16}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            {(stockBajo?.items ?? stockBajo ?? []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <CheckCircleOutlined style={{ fontSize: 32, color: token.colorSuccess }} />
                <div style={{ marginTop: 8 }}><Text type="secondary">Todo el inventario está en niveles correctos</Text></div>
              </div>
            ) : (
              <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
                dataSource={(stockBajo?.items ?? stockBajo ?? []).slice(0, 8)} rowKey="id"
                columns={[
                  { title: 'Producto', key: 'nom', ellipsis: true, render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.producto?.nombre ?? r.nombre}</Text> },
                  { title: 'Código',   key: 'cod', width: 90,  render: (_: any, r: any) => <Text code style={{ fontSize: 10 }}>{r.producto?.codigo ?? r.codigo}</Text> },
                  { title: 'Stock',    dataIndex: 'stock',    width: 80, align: 'right' as const,
                    render: (v: number, r: any) => <Text strong style={{ color: Number(v) === 0 ? token.colorError : token.colorWarning }}>{Number(v).toFixed(0)}</Text> },
                  { title: 'Mínimo',  dataIndex: 'stockMinimo', width: 70, align: 'right' as const, render: (v: number) => <Text type="secondary">{v}</Text> },
                  { title: 'Estado',  key: 'est', width: 90,
                    render: (_: any, r: any) => Number(r.stock) === 0
                      ? <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ fontSize: 10 }}>Agotado</Tag>
                      : <Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 10 }}>Stock bajo</Tag> },
                ]} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="🔖 e-CF del mes" style={{ borderRadius: 12 }} extra={<Button size="small" type="link" onClick={() => navigate('/ecf')}>Ver e-CFs →</Button>}>
            {[
              { label: 'Aceptados',   value: ecfResumen?.aceptados  ?? 0, color: token.colorSuccess, icon: '✅' },
              { label: 'Enviados',    value: ecfResumen?.enviados    ?? 0, color: token.colorPrimary, icon: '📤' },
              { label: 'Rechazados',  value: ecfResumen?.rechazados  ?? 0, color: token.colorError,   icon: '❌' },
              { label: 'Pendientes',  value: ecfResumen?.pendientes  ?? 0, color: token.colorWarning, icon: '⏳' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <Space>
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <Text style={{ fontSize: 13 }}>{s.label}</Text>
                </Space>
                <Text strong style={{ fontSize: 16, color: s.color }}>{s.value}</Text>
              </div>
            ))}
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Total emitidos: <strong>{(ecfResumen?.aceptados ?? 0) + (ecfResumen?.enviados ?? 0)}</strong>
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      <SectionHeader icon="🛒" title="Compras recientes"
        subtitle="Últimas órdenes de compra registradas"
        action={<Button size="small" onClick={() => navigate('/compras')}>Ver todas →</Button>}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 0 }}>
        <Col xs={24} lg={14}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={(comprasRecientes?.data ?? comprasRecientes ?? []).slice(0, 5)} rowKey="id"
              columns={[
                { title: 'Folio',      dataIndex: 'folio',    width: 130, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Proveedor',  key: 'prov',           ellipsis: true, render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.proveedor?.nombre ?? '—'}</Text> },
                { title: 'Total',      dataIndex: 'total',    width: 110, align: 'right' as const, render: (v: number) => <Text strong style={{ color: COLOR_COMPRAS, fontSize: 12 }}>{fmt.money(v)}</Text> },
                { title: 'Estado',     dataIndex: 'estado',   width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'success' : v === 'recibida' ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
              ]} />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="📈 Gastos vs meses anteriores" style={{ borderRadius: 12 }}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={graficaGastosAnual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: token.colorTextSecondary }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt.money(v)} contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}` }} />
                <Line type="monotone" dataKey="gastos" stroke={COLOR_GASTOS} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <SectionHeader icon="📋" title="Actividad reciente del sistema"
        subtitle="Últimas acciones registradas en el ERP"
        action={<Button size="small" onClick={() => navigate('/auditoria')}>Ver auditoría →</Button>}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            {(auditLogs?.data ?? auditLogs ?? []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Text type="secondary">Sin actividad registrada aún</Text>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(auditLogs?.data ?? auditLogs ?? []).slice(0, 8).map((log: any, i: number) => (
                  <div key={log.id ?? i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                    borderRadius: 8, background: i % 2 === 0 ? token.colorFillAlter : 'transparent',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: log.exitoso !== false ? `${token.colorPrimary}20` : `${token.colorError}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    }}>
                      {log.exitoso !== false ? '✅' : '❌'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: 500 }}>{log.descripcion ?? `${log.accion} en ${log.modulo}`}</Text>
                      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                        <Tag style={{ fontSize: 10, margin: 0 }}>{log.modulo}</Tag>
                        <Tag color={log.exitoso !== false ? 'success' : 'error'} style={{ fontSize: 10, margin: 0 }}>{log.accion}</Tag>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{log.userName ?? '—'}</Text>
                      <div><Text type="secondary" style={{ fontSize: 10 }}>{log.createdAt ? dayjs(log.createdAt).fromNow() : ''}</Text></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Alertas del sistema + Aprobaciones ── */}
      {((alertasData?.alertas?.length ?? 0) > 0 || (aprobData?.pendientes ?? 0) > 0) && (
        <Row gutter={[16, 16]} style={{ marginTop: 0 }}>
          {(alertasData?.alertas?.length ?? 0) > 0 && (
            <Col xs={24} lg={14}>
              <Card bordered={false} style={{ borderRadius: 12 }}
                title={<Space><span style={{ fontSize: 16 }}>⚠️</span><span>Alertas del Sistema</span><Tag color="orange">{alertasData?.total} activa(s)</Tag></Space>}
                extra={<Button type="link" size="small" onClick={() => navigate('/reportes')}>Ver todas →</Button>}>
                <Row gutter={[8, 8]}>
                  {(alertasData?.alertas ?? []).slice(0, 4).map((a: any) => (
                    <Col xs={24} sm={12} key={a.id}>
                      <div onClick={() => navigate(a.ruta)} style={{
                        display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: a.severidad === 'alta' ? token.colorErrorBg : a.severidad === 'media' ? token.colorWarningBg : token.colorFillAlter,
                        border: `1px solid ${a.severidad === 'alta' ? token.colorErrorBorder : a.severidad === 'media' ? token.colorWarningBorder : token.colorBorderSecondary}`,
                      }}>
                        <span style={{ fontSize: 20 }}>{a.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: 12, display: 'block' }}>{a.titulo}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{a.descripcion}</Text>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
          )}
          {(aprobData?.pendientes ?? 0) > 0 && (
            <Col xs={24} lg={10}>
              <Card bordered={false} style={{ borderRadius: 12, background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}` }}
                title={<Space><span style={{ fontSize: 16 }}>📋</span><span>Aprobaciones Pendientes</span></Space>}>
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: token.colorWarning, lineHeight: 1 }}>{aprobData.pendientes}</div>
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>documento(s) esperan tu aprobación</Text>
                  <Button type="primary" style={{ marginTop: 16, background: token.colorWarning, borderColor: token.colorWarning }} onClick={() => navigate('/aprobaciones')}>
                    Revisar Ahora →
                  </Button>
                </div>
              </Card>
            </Col>
          )}
        </Row>
      )}
    </div>
  );
}
