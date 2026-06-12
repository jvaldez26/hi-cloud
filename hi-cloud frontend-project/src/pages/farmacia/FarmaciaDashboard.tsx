import { Card, Row, Col, Statistic, Typography, Table, Tag, Space } from 'antd';
import {
  MedicineBoxOutlined, WarningOutlined, AlertOutlined,
  ShoppingCartOutlined, FileTextOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;

function kpiColor(type: 'success' | 'warning' | 'error' | 'info') {
  return { success: '#52c41a', warning: '#faad14', error: '#ff4d4f', info: '#1677ff' }[type];
}

export default function FarmaciaDashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['farmacia-dashboard'], queryFn: farmaciaApi.dashboard });

  const colsDispensaciones = [
    { title: 'N°', dataIndex: 'numero', width: 100 },
    { title: 'Fecha', dataIndex: 'fecha', width: 140, render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Cliente', dataIndex: 'clienteNombre', render: (v: string) => v ?? 'Anónimo' },
    { title: 'Total', dataIndex: 'total', width: 110, render: (v: number) => `RD$ ${Number(v).toFixed(2)}` },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={v === 'completada' ? 'green' : 'orange'}>{v}</Tag>,
    },
  ];

  const colsLotes = [
    { title: 'Medicamento', dataIndex: 'nombreGenerico' },
    { title: 'Lote', dataIndex: 'numeroLote', width: 120 },
    { title: 'Vence', dataIndex: 'fechaVencimiento', width: 110, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
    {
      title: 'Días', dataIndex: 'diasRestantes', width: 70,
      render: (v: number) => {
        const color = v <= 0 ? 'error' : v <= 15 ? 'warning' : 'success';
        return <Tag color={color}>{v <= 0 ? 'VENCIDO' : `${v}d`}</Tag>;
      },
    },
    { title: 'Cant.', dataIndex: 'cantidadActual', width: 80 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <MedicineBoxOutlined style={{ marginRight: 8 }} />
        Farmacia — Panel de Control
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="Dispensaciones Hoy"
              value={stats?.dispensacionesHoy ?? 0}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ color: kpiColor('info') }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="Ventas Hoy"
              value={Number(stats?.ventasHoy ?? 0).toFixed(2)}
              prefix="RD$"
              valueStyle={{ color: kpiColor('success') }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="Ventas del Mes"
              value={Number(stats?.ventasMes ?? 0).toFixed(2)}
              prefix="RD$"
              valueStyle={{ color: kpiColor('success') }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="Stock Bajo"
              value={stats?.stockBajo ?? 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: kpiColor('warning') }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="Vencen en 30d"
              value={stats?.vencen30d ?? 0}
              prefix={<AlertOutlined />}
              valueStyle={{ color: kpiColor('error') }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={8} lg={4}>
          <Card>
            <Statistic
              title="ARS Pendientes"
              value={stats?.arsPendientes ?? 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: kpiColor('warning') }}
              loading={isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Últimas Dispensaciones" size="small">
            <Table
              dataSource={stats?.ultimasDispensaciones ?? []}
              columns={colsDispensaciones}
              rowKey="id"
              size="small"
              pagination={false}
              loading={isLoading}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<Space><AlertOutlined style={{ color: '#ff4d4f' }} />Lotes por Vencer (60d)</Space>} size="small">
            <Table
              dataSource={stats?.lotesProximosVencer ?? []}
              columns={colsLotes}
              rowKey="id"
              size="small"
              pagination={false}
              loading={isLoading}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
