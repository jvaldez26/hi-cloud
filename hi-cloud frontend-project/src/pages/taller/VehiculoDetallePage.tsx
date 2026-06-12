import { Card, Descriptions, Table, Tag, Button, Typography, Spin, Space, Timeline } from 'antd';
import { ArrowLeftOutlined, CarOutlined, ToolOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { tallerApi } from '../../api/taller.api';
import { fmt as fmtObj } from '../../utils/formatters';
const fmt = (v: any) => fmtObj.date(v);

const { Title, Text } = Typography;
const ESTADO_COLOR: Record<string, string> = {
  recibido: 'default', diagnostico: 'processing', aprobado: 'warning',
  en_proceso: 'blue', listo: 'success', entregado: 'green', cancelado: 'error',
};

export default function VehiculoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: vehiculo, isLoading } = useQuery({
    queryKey: ['taller-vehiculo', Number(id)],
    queryFn: () => tallerApi.vehiculo(Number(id)),
    enabled: !!id,
  });

  const { data: historial = [] } = useQuery({
    queryKey: ['taller-vehiculo-historial', Number(id)],
    queryFn: () => tallerApi.historialVehiculo(Number(id)),
    enabled: !!id,
  });

  const { data: ordenes = [] } = useQuery({
    queryKey: ['taller-vehiculo-ordenes', Number(id)],
    queryFn: () => tallerApi.ordenesVehiculo(Number(id)),
    enabled: !!id,
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!vehiculo) return null;

  const ordenColumns = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Motivo', dataIndex: 'motivoIngreso', ellipsis: true },
    {
      title: 'Estado', dataIndex: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase().replace('_', ' ')}</Tag>,
    },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total',
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    { title: 'Fecha', dataIndex: 'fechaIngreso', width: 110, render: (v: any) => fmt(v) },
    {
      title: '', key: 'acc', width: 60,
      render: (_: any, r: any) => (
        <Button size="small" icon={<ToolOutlined />} onClick={() => navigate(`/taller/ordenes/${r.id}`)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/taller/vehiculos')}>Volver</Button>
        <Title level={4} style={{ margin: 0 }}>
          <CarOutlined style={{ marginRight: 8 }} />
          {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
        </Title>
      </Space>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card title="Datos del vehículo" size="small">
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Placa">{vehiculo.placa}</Descriptions.Item>
            <Descriptions.Item label="Marca / Modelo">{vehiculo.marca} {vehiculo.modelo}</Descriptions.Item>
            <Descriptions.Item label="Año">{vehiculo.anio ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Color">{vehiculo.color ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tipo">{vehiculo.tipo ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Combustible">{vehiculo.combustible ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Transmisión">{vehiculo.transmision ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Cilindraje">{vehiculo.cilindraje ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="VIN">{vehiculo.vin ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Km actual">{vehiculo.kilometrajeActual ? Number(vehiculo.kilometrajeActual).toLocaleString() + ' km' : '—'}</Descriptions.Item>
            <Descriptions.Item label="Km último servicio">{vehiculo.kilometrajeUltimoServicio ? Number(vehiculo.kilometrajeUltimoServicio).toLocaleString() + ' km' : '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="Propietario" size="small">
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Nombre">{vehiculo.propietarioNombre ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Teléfono">{vehiculo.propietarioTelefono ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{vehiculo.propietarioEmail ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Observaciones">{vehiculo.observaciones ?? '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      {/* Historial de órdenes */}
      <Card title="Historial de Órdenes" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={ordenes as any[]}
          columns={ordenColumns}
          rowKey="id"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showTotal: (t) => `${t} órdenes` }}
        />
      </Card>

      {/* Historial de mantenimiento */}
      <Card title="Historial de Mantenimiento" size="small">
        {(historial as any[]).length === 0 ? (
          <Text type="secondary">Sin historial de mantenimiento</Text>
        ) : (
          <Timeline
            items={(historial as any[]).map((h: any) => ({
              color: 'blue',
              children: (
                <div>
                  <Text strong>{fmt(h.fecha)}</Text>
                  {h.ordenNumero && <Tag style={{ marginLeft: 8 }}>{h.ordenNumero}</Tag>}
                  <Text style={{ display: 'block' }}>{h.descripcion ?? h.tipo}</Text>
                  {h.kilometraje && <Text type="secondary">Km: {Number(h.kilometraje).toLocaleString()}</Text>}
                  {h.costo && <Text type="secondary" style={{ marginLeft: 12 }}>Costo: RD$ {Number(h.costo).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</Text>}
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}
