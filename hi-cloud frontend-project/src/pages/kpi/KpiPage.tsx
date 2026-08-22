import { Card, Row, Col, Typography, Statistic, Table, Tag, Progress, Divider, Spin } from 'antd';
import {
  RiseOutlined, FallOutlined, DollarOutlined, TeamOutlined,
  WarningOutlined, TrophyOutlined, FunnelPlotOutlined,
  BarChartOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { horaConSegundos } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const kpiApi = {
  get: () => api.get('/kpi').then(r => r.data?.data ?? r.data),
};

function KpiCard({ title, value, prev, color, icon, prefix }: any) {
  const num     = typeof value === 'number' ? value : 0;
  const prevNum = typeof prev === 'number' ? prev : null;
  const delta   = prevNum ? ((num - prevNum) / prevNum) * 100 : null;

  return (
    <motion.div whileHover={{ y: -2 }}>
      <Card size="small" style={{ borderLeft: `3px solid ${color}`, borderRadius: 10 }}>
        <Statistic
          title={title}
          value={typeof value === 'string' ? value : num}
          formatter={prefix ? (v => `${prefix}${fmt.money(Number(v))}`) : undefined}
          prefix={icon}
          valueStyle={{ color, fontSize: 18 }}
        />
        {delta !== null && (
          <div style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: delta >= 0 ? '#10b981' : '#ef4444' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs período anterior
            </Text>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default function KpiPage() {
  const { data: kpi, isLoading } = useQuery({
    queryKey: ['kpi-dashboard'],
    queryFn:  kpiApi.get,
    refetchInterval: 120_000, // refresca cada 2 minutos
  });

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Spin size="large" />
    </div>
  );

  if (!kpi) return null;

  const margenColor = kpi.utilidad.margen >= 20 ? '#10b981' : kpi.utilidad.margen >= 10 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <BarChartOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Dashboard KPI Ejecutivo
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Actualizado: {horaConSegundos(kpi.generadoEn)} · Recarga cada 2 min
          </Text>
        </Col>
      </Row>

      {/* ── Ventas y Finanzas ───────────────────────────────────────────── */}
      <Text strong style={{ display: 'block', marginBottom: 10, color: '#64748b', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Ventas & Finanzas del Mes
      </Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <KpiCard title="Ventas del mes" value={kpi.ventas.mes}
            color="#1677ff" icon={<RiseOutlined />} prefix="" />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard title="Ventas del año" value={kpi.ventas.anio}
            color="#3b82f6" icon={<RiseOutlined />} prefix="" />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard title="Utilidad bruta" value={kpi.utilidad.bruta}
            color={kpi.utilidad.bruta >= 0 ? '#10b981' : '#ef4444'}
            icon={<DollarOutlined />} prefix="" />
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ borderLeft: `3px solid ${margenColor}`, borderRadius: 10 }}>
            <Statistic title="Margen bruto" value={kpi.utilidad.margen} suffix="%"
              valueStyle={{ color: margenColor, fontSize: 18 }} />
            <Progress percent={Math.min(100, Math.max(0, kpi.utilidad.margen))}
              size="small" showInfo={false}
              strokeColor={margenColor} style={{ marginTop: 6 }} />
          </Card>
        </Col>
      </Row>

      {/* ── CxC / CxP ────────────────────────────────────────────────────── */}
      <Text strong style={{ display: 'block', marginBottom: 10, color: '#64748b', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Posición Financiera
      </Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <KpiCard title="CxC pendiente" value={kpi.cxc.pendiente}
            color="#3b82f6" prefix="" icon={<DollarOutlined />} />
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{
            borderLeft: `3px solid ${kpi.cxc.vencida > 0 ? '#ef4444' : '#10b981'}`,
            borderRadius: 10,
          }}>
            <Statistic title="CxC vencida" value={fmt.money(kpi.cxc.vencida)}
              valueStyle={{ color: kpi.cxc.vencida > 0 ? '#ef4444' : '#10b981', fontSize: 18 }}
              prefix={kpi.cxc.vencida > 0 ? <WarningOutlined /> : undefined} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <KpiCard title="CxP pendiente" value={kpi.cxp.pendiente}
            color="#8b5cf6" prefix="" icon={<FallOutlined />} />
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{
            borderLeft: `3px solid ${kpi.cxp.vencida > 0 ? '#ef4444' : '#10b981'}`,
            borderRadius: 10,
          }}>
            <Statistic title="CxP vencida" value={fmt.money(kpi.cxp.vencida)}
              valueStyle={{ color: kpi.cxp.vencida > 0 ? '#ef4444' : '#10b981', fontSize: 18 }}
              prefix={kpi.cxp.vencida > 0 ? <WarningOutlined /> : undefined} />
          </Card>
        </Col>
      </Row>

      {/* ── Operacional ──────────────────────────────────────────────────── */}
      <Text strong style={{ display: 'block', marginBottom: 10, color: '#64748b', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Operacional & Capital Humano
      </Text>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <KpiCard title="Empleados activos" value={kpi.rrhh.empleadosActivos}
            color="#10b981" icon={<TeamOutlined />} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard title="Leads en pipeline" value={kpi.crm.leadsPendientes}
            color="#f59e0b" icon={<FunnelPlotOutlined />} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard title="Leads convertidos (mes)" value={kpi.crm.leadsConvertidosMes}
            color="#7c3aed" icon={<TrophyOutlined />} />
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{
            borderLeft: `3px solid ${kpi.inventario.productosStockBajo > 0 ? '#f59e0b' : '#10b981'}`,
            borderRadius: 10,
          }}>
            <Statistic title="Productos stock bajo" value={kpi.inventario.productosStockBajo}
              valueStyle={{ color: kpi.inventario.productosStockBajo > 0 ? '#f59e0b' : '#10b981', fontSize: 18 }}
              prefix={kpi.inventario.productosStockBajo > 0 ? <WarningOutlined /> : undefined} />
          </Card>
        </Col>
      </Row>

      {/* ── Gráficos ──────────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Tendencia de ventas — últimos 6 meses">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kpi.ventas.tendencia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt.money(v)} />
                <Bar dataKey="ventas" name="Ventas" fill="#1677ff" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Top 5 clientes del mes">
            {kpi.topClientes.length === 0 ? (
              <Text type="secondary">Sin ventas este mes.</Text>
            ) : (
              <div>
                {kpi.topClientes.map((c: any, i: number) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 13 }}>
                        <Tag color="blue" style={{ marginRight: 6 }}>#{i + 1}</Tag>
                        {c.nombre}
                      </Text>
                      <Text strong style={{ color: '#1677ff', fontSize: 13 }}>{fmt.money(c.total)}</Text>
                    </div>
                    <Progress
                      percent={+(c.total / kpi.topClientes[0].total * 100).toFixed(0)}
                      size="small" showInfo={false}
                      strokeColor={['#1677ff','#3b82f6','#06b6d4','#10b981','#7c3aed'][i]}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
