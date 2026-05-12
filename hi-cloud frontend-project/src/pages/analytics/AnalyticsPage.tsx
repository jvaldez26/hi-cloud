import { useState } from 'react';
import {
  Card, Row, Col, Statistic, Select, DatePicker, Space, Typography,
  Table, Tag, Progress, Tabs, theme,
} from 'antd';
import {
  BarChartOutlined, RiseOutlined, FallOutlined, TeamOutlined,
  ShoppingOutlined, CalendarOutlined, TrophyOutlined, DollarOutlined,
  FunnelPlotOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, FunnelChart, Funnel,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LabelList,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const COLORS = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#db2777','#65a30d'];

const AGING_COLORS: Record<string, string> = {
  'Al día':     '#059669',
  '1-30 días':  '#faad14',
  '31-60 días': '#fa8c16',
  '61-90 días': '#f5222d',
  '+90 días':   '#a8071a',
};

export default function AnalyticsPage() {
  const { token } = theme.useToken();
  const hoy        = dayjs();
  const inicioAno  = dayjs().startOf('year');
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([inicioAno, hoy]);

  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const { data: overview } = useQuery<any>({
    queryKey: ['analytics-overview', desde, hasta],
    queryFn:  () => api.get(`/analytics/overview?desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
  });

  const { data: tendencia = [] } = useQuery<any[]>({
    queryKey: ['analytics-tendencia'],
    queryFn:  () => api.get('/analytics/ventas-tendencia?meses=12').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: topClientes = [] } = useQuery<any[]>({
    queryKey: ['analytics-top-clientes', desde, hasta],
    queryFn:  () => api.get(`/analytics/top-clientes?desde=${desde}&hasta=${hasta}&limit=8`).then((r: any) => r.data?.data ?? r.data),
  });

  const { data: topProductos = [] } = useQuery<any[]>({
    queryKey: ['analytics-top-productos', desde, hasta],
    queryFn:  () => api.get(`/analytics/top-productos?desde=${desde}&hasta=${hasta}&limit=8`).then((r: any) => r.data?.data ?? r.data),
  });

  const { data: aging = [] } = useQuery<any[]>({
    queryKey: ['analytics-aging'],
    queryFn:  () => api.get('/analytics/cxc-aging').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: embudo = [] } = useQuery<any[]>({
    queryKey: ['analytics-embudo'],
    queryFn:  () => api.get('/analytics/embudo-ventas').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: porVendedor = [] } = useQuery<any[]>({
    queryKey: ['analytics-vendedor', desde, hasta],
    queryFn:  () => api.get(`/analytics/ventas-por-vendedor?desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
  });

  // ─── Totales aging ───────────────────────────────────────────────────────────

  const totalAging = aging.reduce((s: number, r: any) => s + r.total, 0);

  // ─── Selector de período ──────────────────────────────────────────────────────

  const PERIODOS = [
    { label: 'Este mes',       range: () => [dayjs().startOf('month'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: 'Este año',       range: () => [dayjs().startOf('year'),  dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: 'Último trimestre', range: () => [dayjs().subtract(3, 'month'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
    { label: 'Último año',     range: () => [dayjs().subtract(1, 'year'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs] },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChartOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Inteligencia de Negocio</Title>
            <Text type="secondary">Análisis en tiempo real · República Dominicana</Text>
          </div>
        </div>
        <Space>
          {PERIODOS.map(p => (
            <Tag
              key={p.label}
              onClick={() => setRango(p.range())}
              style={{ cursor: 'pointer', padding: '3px 8px' }}
              color={rango[0].format('YYYY-MM-DD') === p.range()[0].format('YYYY-MM-DD') ? 'blue' : 'default'}
            >
              {p.label}
            </Tag>
          ))}
          <RangePicker
            value={rango}
            onChange={v => v && setRango(v as [dayjs.Dayjs, dayjs.Dayjs])}
            format="DD/MM/YYYY"
            picker="month"
            style={{ width: 230 }}
          />
        </Space>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Ventas del Período</span>}
              value={overview?.ventas?.total ?? 0}
              formatter={v => fmt(Number(v))}
              prefix={<RiseOutlined />}
              suffix={<Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}> {overview?.ventas?.cantidad ?? 0} fact.</Text>}
              valueStyle={{ color: '#fff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>CxC Pendiente</span>}
              value={overview?.cxc?.total ?? 0}
              formatter={v => fmt(Number(v))}
              prefix={<DollarOutlined />}
              suffix={<Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}> {overview?.cxc?.cantidad ?? 0} cuentas</Text>}
              valueStyle={{ color: '#fff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Tasa Conversión</span>}
              value={overview?.cotizaciones?.tasaConversion ?? 0}
              suffix="%"
              prefix={<FunnelPlotOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
            <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 10 }}>
              {overview?.cotizaciones?.convertidas ?? 0} de {overview?.cotizaciones?.total ?? 0} cotizaciones
            </Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Margen Bruto</span>}
              value={overview?.ventas?.margen ?? 0}
              suffix="%"
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
            <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 10 }}>
              Ventas − Compras
            </Text>
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="tendencia"
        items={[
          // ── TAB 1: Tendencia ─────────────────────────────────────────────
          {
            key: 'tendencia',
            label: <Space><CalendarOutlined />Tendencia</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Ventas Mensuales — Últimos 12 Meses">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={tendencia} margin={{ left: 10 }}>
                        <defs>
                          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1a56db" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#1a56db" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v: number) => [fmt(v), 'Ventas']} />
                        <Area
                          type="monotone" dataKey="total" stroke="#1a56db" strokeWidth={2.5}
                          fill="url(#colorVentas)"
                          dot={{ r: 4, fill: '#1a56db', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>

                {/* Vendedor breakdown */}
                {porVendedor.length > 0 && (
                  <Col xs={24} lg={12}>
                    <Card bordered={false} style={{ borderRadius: 12 }} title="Ventas por Vendedor">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={porVendedor} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={90}
                            tickFormatter={v => v.split(' ')[0]} />
                          <Tooltip formatter={(v: number) => [fmt(v), 'Ventas']} />
                          <Bar dataKey="total" fill="#1a56db" radius={[0,4,4,0]}>
                            {porVendedor.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                )}

                {/* Embudo */}
                <Col xs={24} lg={12}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Embudo de Ventas">
                    {embudo.map((e: any, i: number) => (
                      <div key={e.etapa} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: i === 0 ? 600 : 400 }}>{e.etapa}</Text>
                          <Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>{e.cantidad}</Text>
                            <Tag color={e.pct >= 60 ? 'green' : e.pct >= 30 ? 'orange' : 'red'} style={{ fontSize: 11 }}>
                              {e.pct}%
                            </Tag>
                          </Space>
                        </div>
                        <Progress
                          percent={Math.min(e.pct, 100)}
                          strokeColor={COLORS[i]}
                          size="small"
                          showInfo={false}
                        />
                      </div>
                    ))}
                  </Card>
                </Col>
              </Row>
            ),
          },

          // ── TAB 2: Clientes ──────────────────────────────────────────────
          {
            key: 'clientes',
            label: <Space><TeamOutlined />Clientes</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Top 8 Clientes por Ingresos">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={topClientes} margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                        <XAxis dataKey="nombre" tick={{ fontSize: 10 }} tickFormatter={v => v.split(' ')[0]} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v: number) => [fmt(v), 'Ingresos']} />
                        <Bar dataKey="total" radius={[4,4,0,0]}>
                          {topClientes.map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                          <LabelList dataKey="total" position="top" formatter={(v: number) => fmt(v)} style={{ fontSize: 9 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
                <Col xs={24} lg={10}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Ranking de Clientes">
                    <Table
                      dataSource={topClientes}
                      rowKey="clienteId"
                      size="small"
                      pagination={false}
                      columns={[
                        {
                          title: '#', key: 'rank',
                          render: (_, __, i) => (
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: i < 3 ? ['#fbbf24','#94a3b8','#d97706'][i] : token.colorFillAlter,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: 12,
                              color: i < 3 ? '#fff' : token.colorText,
                            }}>
                              {i + 1}
                            </div>
                          ),
                        },
                        { title: 'Cliente', dataIndex: 'nombre', key: 'n', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                        { title: 'Ingresos', dataIndex: 'total', key: 't', align: 'right', render: v => <Text style={{ color: token.colorPrimary, fontWeight: 600, fontSize: 12 }}>{fmt(v)}</Text> },
                        { title: 'Facts.', dataIndex: 'facturas', key: 'f', align: 'right', render: v => <Tag>{v}</Tag> },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },

          // ── TAB 3: Productos ─────────────────────────────────────────────
          {
            key: 'productos',
            label: <Space><ShoppingOutlined />Productos</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Top Productos por Ingresos">
                    <Table
                      dataSource={topProductos}
                      rowKey="productoId"
                      size="small"
                      pagination={false}
                      columns={[
                        {
                          title: '#', key: 'r',
                          render: (_, __, i) => <Text type="secondary">{i+1}</Text>,
                          width: 30,
                        },
                        { title: 'Producto', dataIndex: 'nombre', key: 'n', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                        {
                          title: 'Ingresos', dataIndex: 'ingresos', key: 'i', align: 'right',
                          render: v => <Text style={{ color: token.colorSuccess, fontWeight: 600 }}>{fmt(v)}</Text>,
                        },
                        {
                          title: 'Unidades', dataIndex: 'cantidadVendida', key: 'q', align: 'right',
                          render: v => <Tag>{Number(v).toLocaleString('es-DO')}</Tag>,
                        },
                      ]}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Distribución de Ingresos">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={topProductos.slice(0, 6)}
                          dataKey="ingresos"
                          nameKey="nombre"
                          cx="50%" cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {topProductos.slice(0, 6).map((_: any, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              </Row>
            ),
          },

          // ── TAB 4: CxC Aging ─────────────────────────────────────────────
          {
            key: 'aging',
            label: <Space><DollarOutlined />CxC Aging</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={10}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Antigüedad de Saldos Pendientes">
                    {aging.map((r: any) => (
                      <div key={r.rango} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Space>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS[r.rango] ?? '#6b7280' }} />
                            <Text style={{ fontSize: 13 }}>{r.rango}</Text>
                          </Space>
                          <Space>
                            <Text type="secondary" style={{ fontSize: 11 }}>{r.cantidad} cuentas</Text>
                            <Text strong style={{ color: AGING_COLORS[r.rango] }}>{fmt(r.total)}</Text>
                          </Space>
                        </div>
                        <Progress
                          percent={totalAging > 0 ? +((r.total / totalAging) * 100).toFixed(1) : 0}
                          strokeColor={AGING_COLORS[r.rango] ?? '#6b7280'}
                          size="small"
                          showInfo={false}
                        />
                      </div>
                    ))}
                    <div style={{
                      marginTop: 16, paddingTop: 12,
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                      display: 'flex', justifyContent: 'space-between',
                    }}>
                      <Text type="secondary">Total pendiente</Text>
                      <Text strong style={{ fontSize: 16, color: token.colorError }}>{fmt(totalAging)}</Text>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} lg={14}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Distribución CxC Aging">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={aging}>
                        <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                        <XAxis dataKey="rango" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v: number) => [fmt(v), 'Monto Pendiente']} />
                        <Bar dataKey="total" radius={[4,4,0,0]}>
                          {aging.map((r: any) => (
                            <Cell key={r.rango} fill={AGING_COLORS[r.rango] ?? '#6b7280'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}
