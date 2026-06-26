import { Row, Col, Card, Statistic, Table, Tag, Typography, Alert, Space } from 'antd';
import { TruckOutlined, UserOutlined, CarOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const { Title } = Typography;

async function fetchDashboard() {
  const { data } = await api.get('/transporte/dashboard');
  return data;
}

const ESTADO_COLORS: Record<string, string> = {
  programado:  'blue',
  en_curso:    'orange',
  completado:  'green',
  cancelado:   'red',
  facturado:   'purple',
};

export default function TransporteDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['transporte-dashboard'],
    queryFn:  fetchDashboard,
    refetchInterval: 60_000,
  });

  const alertasColumns = [
    { title: 'Tipo', dataIndex: 'tipo', key: 'tipo', render: (t: string) => <Tag color="orange">{String(t).toUpperCase()}</Tag> },
    { title: 'Vehículo / Chofer', dataIndex: 'placa', key: 'placa' },
    {
      title: 'Vence', dataIndex: 'vencimiento', key: 'vencimiento',
      render: (v: string) => {
        const days = Math.ceil((new Date(String(v)).getTime() - Date.now()) / 86_400_000);
        const color = days < 0 ? 'red' : days <= 7 ? 'orange' : 'default';
        return <Tag color={color}>{days < 0 ? `Vencido hace ${-days}d` : `${days}d restantes`}</Tag>;
      },
    },
  ];

  const porEstadoColumns = [
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (e: string) => <Tag color={ESTADO_COLORS[e] ?? 'default'}>{e.toUpperCase()}</Tag> },
    { title: 'Cantidad', dataIndex: 'total', key: 'total', render: (v: string) => Number(v) },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}><TruckOutlined /> Panel Transporte</Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic title="Flota Total"      value={data?.flota?.total ?? 0}      prefix={<TruckOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic title="Operativos"       value={data?.flota?.operativos ?? 0} valueStyle={{ color: '#16a34a' }} prefix={<CarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic title="Choferes Activos" value={data?.choferes?.activos ?? 0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic title="Viajes Hoy"       value={data?.viajes?.hoy ?? 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic title="Viajes este Mes"   value={data?.viajes?.mes ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={isLoading}>
            <Statistic
              title="Ingresos del Mes"
              value={data?.viajes?.ingresosMes ?? 0}
              precision={2}
              prefix="RD$"
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} md={10}>
          <Card title={<Space><WarningOutlined style={{ color: '#f59e0b' }} />Alertas de Vencimiento</Space>} loading={isLoading}>
            {data?.alertas?.length === 0 && <Alert type="success" message="Sin alertas de vencimiento próximo" showIcon />}
            <Table
              size="small"
              dataSource={data?.alertas ?? []}
              columns={alertasColumns}
              rowKey={(_r: any, i) => `alerta-${i}`}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title="Viajes por Estado (mes actual)" loading={isLoading}>
            <Table
              size="small"
              dataSource={data?.viajes?.porEstado ?? []}
              columns={porEstadoColumns}
              rowKey="estado"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
