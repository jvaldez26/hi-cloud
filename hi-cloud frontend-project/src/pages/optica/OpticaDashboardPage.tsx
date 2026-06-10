import { Card, Row, Col, Statistic, Table, Tag, Typography, Spin } from 'antd';
import {
  UserOutlined, CalendarOutlined, FileTextOutlined,
  MedicineBoxOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const ESTADO_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', completada: 'green',
  cancelada: 'red', no_asistio: 'default',
};

export default function OpticaDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['optica-dashboard'],
    queryFn: () => opticaApi.dashboard(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  const d = data ?? {};

  const proxCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', dataIndex: 'pacienteNombre', ellipsis: true },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Hora', dataIndex: 'hora', width: 80, render: (v: string) => v?.slice(0, 5) ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => (
        <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Panel Óptica</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Pacientes"
              value={d.totalPacientes ?? 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Citas hoy"
              value={d.citasHoy ?? 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Citas pendientes"
              value={d.citasPendientes ?? 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Órdenes activas"
              value={d.ordenesActivas ?? 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Reclamaciones pend."
              value={d.reclamacionesPendientes ?? 0}
              prefix={<MedicineBoxOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Saldo pend. OT"
              value={d.saldoPendienteOt ?? 0}
              prefix={<DollarOutlined />}
              precision={2}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Próximas citas"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>Próximas 5</Text>}
      >
        <Table
          columns={proxCols}
          dataSource={d.citasProximas ?? []}
          rowKey="id"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
          locale={{ emptyText: 'No hay citas programadas próximamente' }}
        />
      </Card>
    </div>
  );
}
