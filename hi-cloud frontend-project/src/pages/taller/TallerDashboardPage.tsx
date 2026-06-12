import { Card, Row, Col, Statistic, Table, Tag, Typography, Spin, Badge, Avatar } from 'antd';
import {
  CarOutlined, ToolOutlined, ClockCircleOutlined, CheckCircleOutlined,
  DollarOutlined, UserOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import { fmt as fmtObj } from '../../utils/formatters';
const fmt = (v: any) => fmtObj.date(v);
import { theme } from 'antd';

const { Title, Text } = Typography;

const ESTADO_COLOR: Record<string, string> = {
  recibido: 'default', diagnostico: 'processing', aprobado: 'warning',
  en_proceso: 'blue', listo: 'success', entregado: 'green', cancelado: 'error',
};
const PRIORIDAD_COLOR: Record<string, string> = {
  baja: 'default', normal: 'blue', alta: 'orange', urgente: 'red',
};

export default function TallerDashboardPage() {
  const { token } = theme.useToken();
  const { data, isLoading } = useQuery({
    queryKey: ['taller-dashboard'],
    queryFn: tallerApi.dashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>
  );

  const d = data ?? {};

  const kpis = [
    { title: 'Órdenes hoy', value: d.ordenesHoy ?? 0, icon: <CarOutlined />, color: '#1677ff' },
    { title: 'En proceso', value: d.ordenesEnProceso ?? 0, icon: <ToolOutlined />, color: '#faad14' },
    { title: 'Listas para entrega', value: d.ordenesListas ?? 0, icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Citas hoy', value: d.citasHoy?.length ?? 0, icon: <CalendarOutlined />, color: '#722ed1' },
    {
      title: 'Ventas del mes',
      value: `RD$ ${Number(d.ventasMes ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`,
      icon: <DollarOutlined />, color: '#13c2c2',
    },
    { title: 'Vehículos registrados', value: d.totalVehiculos ?? 0, icon: <CarOutlined />, color: '#eb2f96' },
  ];

  const recientesColumns = [
    { title: 'N°', dataIndex: 'numero', width: 100 },
    {
      title: 'Vehículo', key: 'vehiculo',
      render: (r: any) => <Text>{r.placa} — {r.marca} {r.modelo}</Text>,
    },
    {
      title: 'Estado', dataIndex: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    {
      title: 'Prioridad', dataIndex: 'prioridad',
      render: (v: string) => <Tag color={PRIORIDAD_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', ellipsis: true, render: (v: string) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total',
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    {
      title: 'Ingreso', dataIndex: 'fechaIngreso',
      render: (v: any) => fmt(v),
    },
  ];

  const citasColumns = [
    { title: 'Hora', dataIndex: 'hora', width: 80 },
    {
      title: 'Vehículo', key: 'v',
      render: (r: any) => <Text>{r.placa ? `${r.placa} — ${r.marca ?? ''} ${r.modelo ?? ''}` : r.descripcion ?? '—'}</Text>,
    },
    { title: 'Servicio', dataIndex: 'tipoServicio', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 20 }}>
        <ToolOutlined style={{ marginRight: 8 }} />
        Taller Mecánico — Dashboard
      </Title>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <Col xs={12} sm={8} md={4} key={i}>
            <Card>
              <Statistic
                title={k.title}
                value={k.value}
                prefix={<span style={{ color: k.color }}>{k.icon}</span>}
                valueStyle={{ color: k.color, fontSize: 22 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Órdenes recientes */}
        <Col xs={24} lg={16}>
          <Card title="Órdenes recientes" size="small">
            <Table
              dataSource={d.ordenesRecientes ?? []}
              columns={recientesColumns}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>

        {/* Panel derecho */}
        <Col xs={24} lg={8}>
          {/* Citas del día */}
          <Card title={<><CalendarOutlined style={{ marginRight: 6 }} />Citas de hoy</>} size="small" style={{ marginBottom: 16 }}>
            {(d.citasHoy ?? []).length === 0 ? (
              <Text type="secondary">No hay citas para hoy</Text>
            ) : (
              <Table
                dataSource={d.citasHoy}
                columns={citasColumns}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            )}
          </Card>

          {/* Técnicos activos */}
          <Card title={<><UserOutlined style={{ marginRight: 6 }} />Técnicos activos</>} size="small">
            {(d.tecnicosActivos ?? []).map((t: any) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size="small" icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
                  <div>
                    <Text strong style={{ fontSize: 13 }}>{t.nombre}</Text>
                    {t.especialidad && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{t.especialidad}</Text>}
                  </div>
                </div>
                <Badge count={t.ordenesActivas ?? 0} showZero color={t.ordenesActivas > 0 ? '#faad14' : '#d9d9d9'} />
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
