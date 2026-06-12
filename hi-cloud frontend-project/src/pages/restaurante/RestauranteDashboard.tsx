import { Card, Row, Col, Statistic, Table, Tag, Typography, Badge, Space } from 'antd';
import {
  ShopOutlined, FileTextOutlined, CarOutlined,
  CalendarOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';

const { Title, Text } = Typography;

const ESTADO_MESA_COLOR: Record<string, string> = {
  disponible: '#52c41a', ocupada: '#1677ff', reservada: '#722ed1',
  limpieza: '#fa8c16', inactiva: '#8c8c8c',
};

export default function RestauranteDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['restaurante-dashboard'],
    queryFn: restauranteApi.dashboard,
    refetchInterval: 30_000,
  });

  const colsComandas = [
    { title: 'Mesa', dataIndex: 'mesaNumero', width: 70 },
    { title: 'Comanda', dataIndex: 'numero', width: 100 },
    { title: 'Mesero', dataIndex: 'meseroNombre', ellipsis: true },
    { title: 'Apertura', dataIndex: 'fechaApertura', width: 140, render: (v: string) => new Date(v).toLocaleTimeString('es-DO') },
    {
      title: 'Tiempo', dataIndex: 'minutos', width: 90,
      render: (v: number) => {
        const color = v > 60 ? 'red' : v > 30 ? 'orange' : 'green';
        return <Tag color={color}>{Math.round(v)}min</Tag>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag>{v.replace(/_/g, ' ')}</Tag>,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>🍽️ Restaurante — Panel</Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Mesas"
              value={`${data?.mesas?.ocupadas ?? 0}/${data?.mesas?.total ?? 0}`}
              prefix={<ShopOutlined />}
              valueStyle={{ color: '#1677ff', fontSize: 20 }}
              loading={isLoading}
              suffix={<Text type="secondary" style={{ fontSize: 11 }}>ocupadas</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Comandas abiertas"
              value={data?.comandasAbiertas?.length ?? 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#fa8c16', fontSize: 20 }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Delivery activo"
              value={data?.deliveryActivo ?? 0}
              prefix={<CarOutlined />}
              valueStyle={{ color: '#722ed1', fontSize: 20 }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic
              title="Reserv. hoy"
              value={data?.reservacionesHoy ?? 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#13c2c2', fontSize: 20 }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8}>
          <Card size="small">
            <Statistic
              title="Ventas hoy"
              value={Number(data?.ventasHoy?.total ?? 0).toFixed(2)}
              prefix={<><DollarOutlined /> RD$</>}
              valueStyle={{ color: '#52c41a', fontSize: 20 }}
              loading={isLoading}
              suffix={<Text type="secondary" style={{ fontSize: 11 }}>{data?.ventasHoy?.cantidad ?? 0} comanadas</Text>}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card title="Comandas activas" size="small">
            <Table
              dataSource={data?.comandasAbiertas ?? []}
              columns={colsComandas}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              loading={isLoading}
              locale={{ emptyText: 'Sin comandas activas' }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Platos más vendidos (hoy)" size="small">
            <Table
              dataSource={data?.platosMasVendidos ?? []}
              columns={[
                { title: 'Plato', dataIndex: 'nombre', ellipsis: true },
                { title: 'Vendidos', dataIndex: 'vendidos', width: 80, render: (v: number) => <Badge count={v} showZero color="#1677ff" /> },
                { title: 'Ingresos', dataIndex: 'ingresos', width: 100, render: (v: number) => `RD$${Number(v).toFixed(2)}` },
              ]}
              rowKey="nombre"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              loading={isLoading}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Estado de mesas" size="small">
            <Space wrap>
              {(['disponible', 'ocupada', 'reservada', 'limpieza', 'inactiva'] as const).map(est => (
                <Tag key={est} color={ESTADO_MESA_COLOR[est]} style={{ padding: '4px 10px' }}>
                  {est.charAt(0).toUpperCase() + est.slice(1)}: {data?.mesas?.[est] ?? 0}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
