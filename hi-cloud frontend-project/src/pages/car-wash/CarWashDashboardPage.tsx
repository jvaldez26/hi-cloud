import { Typography, Row, Col, Card, Statistic, Table, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { carWashApi } from '../../api/car-wash.api';

const { Title, Text } = Typography;

export default function CarWashDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['cw-dashboard'],
    queryFn: () => carWashApi.getDashboard(),
    refetchInterval: 30_000,
  });

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Car Wash — Dashboard</Title>
      <Text type="secondary">Hoy, hora de República Dominicana.</Text>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}><Card loading={isLoading}><Statistic title="Vehículos hoy" value={data?.vehiculosHoy ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card loading={isLoading}><Statistic title="En cola ahora" value={data?.enCola ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card loading={isLoading}><Statistic title="En lavado ahora" value={data?.enLavado ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card loading={isLoading}><Statistic title="Ingresos del día" value={data?.ingresosDelDia ?? 0} prefix="RD$" precision={2} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Tiempo promedio por etapa (min)" loading={isLoading}>
            <Row gutter={16}>
              <Col span={6}><Statistic title="Espera" value={data?.tiempoPromedioPorEtapa?.espera ?? 0} /></Col>
              <Col span={6}><Statistic title="Lavado" value={data?.tiempoPromedioPorEtapa?.lavado ?? 0} /></Col>
              <Col span={6}><Statistic title="Secado" value={data?.tiempoPromedioPorEtapa?.secado ?? 0} /></Col>
              <Col span={6}><Statistic title="Espera entrega" value={data?.tiempoPromedioPorEtapa?.esperaEntrega ?? 0} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Top servicios de hoy" loading={isLoading}>
            {(data?.topServicios ?? []).length === 0 ? <Empty description="Sin datos hoy" /> : (
              <Table
                size="small" pagination={false} rowKey="nombre" dataSource={data?.topServicios ?? []}
                columns={[
                  { title: 'Servicio', dataIndex: 'nombre' },
                  { title: 'Cantidad', dataIndex: 'cantidad' },
                  { title: 'Ingreso', dataIndex: 'ingreso', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="Vehículos por lavador hoy" loading={isLoading}>
            {(data?.vehiculosPorLavador ?? []).length === 0 ? <Empty description="Sin datos hoy" /> : (
              <Table
                size="small" pagination={false} rowKey="nombre" dataSource={data?.vehiculosPorLavador ?? []}
                columns={[
                  { title: 'Lavador', dataIndex: 'nombre' },
                  { title: 'Vehículos', dataIndex: 'vehiculos' },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
