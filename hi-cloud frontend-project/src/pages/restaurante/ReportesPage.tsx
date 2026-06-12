import { useState } from 'react';
import {
  Card, Row, Col, DatePicker, Button, Table, Statistic, Tag,
  Typography, Select, Space, Tabs, Divider,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportesPage() {
  const hoy = dayjs();
  const [rango, setRango] = useState<[any, any]>([hoy.startOf('month'), hoy]);
  const [tipo, setTipo] = useState('ventas');

  const params = {
    desde: rango[0]?.format('YYYY-MM-DD'),
    hasta: rango[1]?.format('YYYY-MM-DD'),
    tipo,
  };

  const { data: reporte, isLoading, refetch } = useQuery({
    queryKey: ['restaurante-reporte', params],
    queryFn: () => restauranteApi.reporteVentas(params),
    enabled: !!rango[0] && !!rango[1],
  });

  const kpis = reporte?.kpis ?? {};
  const filas = reporte?.filas ?? [];
  const cols = reporte?.columnas ?? [];

  const tabItems = [
    {
      key: 'ventas',
      label: '💰 Ventas',
      children: (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total ventas" value={`RD$${Number(kpis.totalVentas ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Comandas cobradas" value={kpis.totalComandas ?? 0} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Ticket promedio" value={`RD$${Number(kpis.ticketPromedio ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="ITBIS recaudado" value={`RD$${Number(kpis.itbisTotal ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
          </Row>
          <Table
            dataSource={filas}
            columns={cols.length > 0 ? cols : [
              { title: 'Período', dataIndex: 'periodo', width: 120 },
              { title: 'Ventas', dataIndex: 'ventas', render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
              { title: 'Comandas', dataIndex: 'comandas' },
              { title: 'Ticket Prom.', dataIndex: 'ticketPromedio', render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
              { title: 'Efectivo', dataIndex: 'efectivo', render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
              { title: 'Tarjeta', dataIndex: 'tarjeta', render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
            ]}
            rowKey="periodo"
            size="small"
            loading={isLoading}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 15 }}
            locale={{ emptyText: 'Sin datos para el período seleccionado' }}
          />
        </div>
      ),
    },
    {
      key: 'menu',
      label: '🍽️ Por Plato',
      children: (
        <Table
          dataSource={filas}
          columns={cols.length > 0 ? cols : [
            { title: 'Plato', dataIndex: 'nombre', ellipsis: true },
            { title: 'Categoría', dataIndex: 'categoriaNombre', width: 130 },
            { title: 'Vendidos', dataIndex: 'vendidos', width: 90 },
            { title: 'Ingresos', dataIndex: 'ingresos', width: 120, render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
            { title: 'Costo', dataIndex: 'costoTotal', width: 100, render: (v: number) => v ? `RD$${Number(v).toFixed(2)}` : '—' },
            { title: 'Margen', dataIndex: 'margen', width: 80, render: (v: number) => v != null ? <Tag color={v > 50 ? 'green' : v > 30 ? 'orange' : 'red'}>{v.toFixed(1)}%</Tag> : '—' },
          ]}
          rowKey="nombre"
          size="small"
          loading={isLoading}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: 'Sin datos para el período seleccionado' }}
        />
      ),
    },
    {
      key: 'delivery',
      label: '🛵 Delivery',
      children: (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Pedidos delivery" value={kpis.pedidosDelivery ?? 0} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Ventas delivery" value={`RD$${Number(kpis.ventasDelivery ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Entregados" value={kpis.entregados ?? 0} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Cancelados" value={kpis.cancelados ?? 0} loading={isLoading} /></Card></Col>
          </Row>
          <Table
            dataSource={filas}
            columns={cols.length > 0 ? cols : [
              { title: 'Pedido', dataIndex: 'numero', width: 100 },
              { title: 'Cliente', dataIndex: 'clienteNombre', ellipsis: true },
              { title: 'Fecha', dataIndex: 'fecha', width: 140, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '—' },
              { title: 'Total', dataIndex: 'total', width: 110, render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
              { title: 'Estado', dataIndex: 'estado', width: 110, render: (v: string) => <Tag>{v?.replace(/_/g, ' ')}</Tag> },
              { title: 'Repartidor', dataIndex: 'repartidorNombre', ellipsis: true },
            ]}
            rowKey="id"
            size="small"
            loading={isLoading}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 15 }}
            locale={{ emptyText: 'Sin datos para el período seleccionado' }}
          />
        </div>
      ),
    },
    {
      key: 'propinas',
      label: '💡 Propinas',
      children: (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Total propinas" value={`RD$${Number(kpis.totalPropinas ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
            <Col xs={12} sm={6}><Card size="small"><Statistic title="Propina promedio" value={`RD$${Number(kpis.propinaPromedio ?? 0).toFixed(2)}`} loading={isLoading} /></Card></Col>
          </Row>
          <Table
            dataSource={filas}
            columns={cols.length > 0 ? cols : [
              { title: 'Mesero', dataIndex: 'meseroNombre', ellipsis: true },
              { title: 'Comandas', dataIndex: 'comandas', width: 90 },
              { title: 'Total propinas', dataIndex: 'totalPropinas', width: 130, render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
              { title: 'Promedio', dataIndex: 'promedio', width: 110, render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}` },
            ]}
            rowKey="meseroNombre"
            size="small"
            loading={isLoading}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 15 }}
            locale={{ emptyText: 'Sin datos para el período seleccionado' }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>📊 Reportes del Restaurante</Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>Actualizar</Button>
      </div>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <RangePicker
            value={rango}
            onChange={v => setRango(v as any)}
            format="DD/MM/YYYY"
            allowClear={false}
          />
          <Select value={tipo} onChange={setTipo} style={{ width: 160 }}>
            <Option value="ventas">Ventas por día</Option>
            <Option value="menu">Por plato</Option>
            <Option value="delivery">Delivery</Option>
            <Option value="propinas">Propinas</Option>
          </Select>
        </Space>
      </Card>

      <Tabs
        activeKey={tipo}
        onChange={t => setTipo(t)}
        items={tabItems}
        size="small"
      />
    </div>
  );
}
