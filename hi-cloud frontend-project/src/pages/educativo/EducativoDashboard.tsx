import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Table, Tag, Typography, Spin, Empty } from 'antd';
import { UserOutlined, FileTextOutlined, DollarOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../api/client';
const { Title, Text } = Typography;

const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 });

export default function EducativoDashboard() {

  const { data, isLoading } = useQuery<any>({
    queryKey: ['educativo', 'dashboard'],
    queryFn: () => api.get('/educativo/dashboard').then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Sin datos" style={{ margin: 40 }} />;

  const { kpis, asistenciaHoy, morosos, cumpleanios, incidentesRecientes } = data;
  const pctAsistencia = asistenciaHoy?.totalRegistrados > 0
    ? Math.round(asistenciaHoy.presentes / asistenciaHoy.totalRegistrados * 100)
    : null;

  const cards = [
    { title: 'Estudiantes activos', value: kpis.estudiantesActivos, icon: <UserOutlined />, color: '#1677ff' },
    { title: 'Matrículas año actual', value: kpis.matriculasAnioActual, icon: <FileTextOutlined />, color: '#52c41a' },
    { title: 'Cobrado este mes', value: fmt.format(kpis.cobradoMes), icon: <DollarOutlined />, color: '#52c41a', isMoney: true },
    { title: 'Cartera pendiente', value: fmt.format(kpis.carteraPendiente), icon: <WarningOutlined />, color: '#faad14', isMoney: true },
    { title: 'Asistencia hoy', value: pctAsistencia !== null ? `${pctAsistencia}%` : '—', icon: <CheckCircleOutlined />, color: '#722ed1' },
  ];

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ marginBottom: 20 }}>Panel — Centro Educativo</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {cards.map((c, i) => (
          <Col xs={24} sm={12} md={8} lg={6} xl={5} key={i}>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, color: c.color }}>{c.icon}</div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>{c.title}</Text>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c.color, lineHeight: 1.3 }}>{c.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={`Morosos (top ${morosos?.length ?? 0})`} size="small" styles={{ body: { padding: 0 } }}>
            <Table
              dataSource={morosos ?? []}
              rowKey="nombre"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Estudiante', dataIndex: 'nombre', key: 'nombre', ellipsis: true },
                { title: 'Grado', dataIndex: 'grado', key: 'grado', render: (v: any) => v ?? '—' },
                { title: 'Cuotas', dataIndex: 'cuotasVencidas', key: 'cuotas', align: 'center' },
                { title: 'Saldo', dataIndex: 'saldo', key: 'saldo', render: (v: any) => fmt.format(v), align: 'right' },
                { title: 'Días mora', dataIndex: 'maxDiasMora', key: 'mora', render: (v: any) => <Tag color={v > 60 ? 'red' : v > 30 ? 'orange' : 'gold'}>{v}d</Tag> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Cumpleaños esta semana" size="small" styles={{ body: { padding: 0 } }} style={{ marginBottom: 16 }}>
            <Table
              dataSource={cumpleanios ?? []}
              rowKey="nombre"
              size="small"
              pagination={false}
              columns={[
                { title: 'Estudiante', dataIndex: 'nombre', key: 'nombre', ellipsis: true },
                { title: 'Fecha', dataIndex: 'cumple', key: 'cumple' },
                { title: 'Edad', dataIndex: 'edad', key: 'edad', align: 'center' },
              ]}
            />
          </Card>
          <Card title="Incidentes recientes" size="small" styles={{ body: { padding: 0 } }}>
            <Table
              dataSource={incidentesRecientes ?? []}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: 'Estudiante', dataIndex: 'estudianteNombre', key: 'est', ellipsis: true },
                { title: 'Tipo', dataIndex: 'tipo', key: 'tipo', render: (v: any) => <Tag color={v === 'grave' ? 'red' : v === 'moderado' ? 'orange' : 'blue'}>{v}</Tag> },
                { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', render: (v: any) => v?.substring(0, 10) },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
