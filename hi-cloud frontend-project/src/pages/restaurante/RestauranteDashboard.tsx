import { useState } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Badge, Space,
  Tabs, Button, Modal, Form, Input, Tooltip, Popconfirm, message,
} from 'antd';
import {
  ShopOutlined, FileTextOutlined, CarOutlined,
  CalendarOutlined, DollarOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';

const { Title, Text } = Typography;

const ESTADO_MESA_COLOR: Record<string, string> = {
  disponible: '#52c41a', ocupada: '#1677ff', reservada: '#722ed1',
  limpieza: '#fa8c16', inactiva: '#8c8c8c',
};

const COLORES_PRESET = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

// ── Sección ÁREAS ──────────────────────────────────────────────────────────

function SeccionAreas() {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [colorSel, setColorSel] = useState('#3b82f6');

  const { data: areas = [], isLoading } = useQuery<any[]>({
    queryKey: ['restaurante-areas'],
    queryFn: restauranteApi.listarAreas,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['restaurante-areas'] });

  const crearMut = useMutation({
    mutationFn: (b: any) => restauranteApi.crearArea(b),
    onSuccess: () => { invalidar(); cerrarModal(); message.success('Área creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear área'),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, b }: { id: number; b: any }) => restauranteApi.actualizarArea(id, b),
    onSuccess: () => { invalidar(); cerrarModal(); message.success('Área actualizada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar área'),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => restauranteApi.eliminarArea(id),
    onSuccess: () => { invalidar(); message.success('Área eliminada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar área'),
  });

  const abrirNueva = () => {
    setEditando(null);
    setColorSel('#3b82f6');
    form.resetFields();
    form.setFieldValue('color', '#3b82f6');
    setModalOpen(true);
  };

  const abrirEditar = (area: any) => {
    setEditando(area);
    setColorSel(area.color ?? '#3b82f6');
    form.setFieldsValue({
      nombre: area.nombre,
      descripcion: area.descripcion ?? '',
      orden: area.orden ?? 0,
      color: area.color ?? '#3b82f6',
    });
    setModalOpen(true);
  };

  const cerrarModal = () => { setModalOpen(false); setEditando(null); form.resetFields(); };

  const handleOk = async () => {
    const vals = await form.validateFields();
    const payload = { ...vals, color: colorSel };
    if (editando) {
      editarMut.mutate({ id: editando.id, b: payload });
    } else {
      crearMut.mutate(payload);
    }
  };

  const columnas = [
    {
      title: 'Color',
      dataIndex: 'color',
      width: 70,
      render: (color: string) => (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: color ?? '#3b82f6',
          border: '2px solid #e0e0e0',
        }} />
      ),
    },
    {
      title: 'Nombre',
      dataIndex: 'nombre',
      render: (v: string, r: any) => (
        <span>
          <span style={{ fontWeight: 600 }}>{v}</span>
          {r.descripcion && <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{r.descripcion}</Text>}
        </span>
      ),
    },
    {
      title: 'Mesas',
      dataIndex: 'numMesas',
      width: 90,
      render: (v: number) => <Badge count={v} showZero color="#1677ff" />,
    },
    {
      title: 'Orden',
      dataIndex: 'orden',
      width: 70,
      render: (v: number) => <Text type="secondary">{v}</Text>,
    },
    {
      title: 'Estado',
      dataIndex: 'isActive',
      width: 90,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones',
      width: 100,
      render: (_: any, r: any) => (
        <Space>
          <Tooltip title="Editar">
            <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          </Tooltip>
          <Popconfirm
            title="¿Eliminar esta área?"
            description={r.numMesas > 0 ? `Esta área tiene ${r.numMesas} mesa(s). No se puede eliminar.` : 'Esta acción no se puede deshacer.'}
            onConfirm={() => r.numMesas === 0 && eliminarMut.mutate(r.id)}
            okText="Eliminar"
            okButtonProps={{ danger: true, disabled: r.numMesas > 0 }}
            cancelText="Cancelar"
          >
            <Tooltip title={r.numMesas > 0 ? 'Tiene mesas — no se puede eliminar' : 'Eliminar'}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={r.numMesas > 0} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>Áreas del Restaurante</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Organiza tu espacio en zonas (Salón Principal, Terraza, Barra, VIP...)
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={abrirNueva}>
          Nueva Área
        </Button>
      </div>

      <Table
        dataSource={areas}
        columns={columnas}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'No hay áreas creadas. Crea tu primera área para organizar las mesas.' }}
        pagination={false}
      />

      <Modal
        open={modalOpen}
        title={editando ? 'Editar Área' : 'Nueva Área'}
        onCancel={cerrarModal}
        onOk={handleOk}
        confirmLoading={crearMut.isPending || editarMut.isPending}
        okText={editando ? 'Guardar' : 'Crear'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="nombre" label="Nombre del área" rules={[{ required: true, message: 'El nombre es requerido' }]}>
            <Input placeholder="Ej: Salón Principal, Terraza, Barra VIP..." />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input placeholder="Descripción opcional..." />
          </Form.Item>

          <Form.Item label="Color identificador">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORES_PRESET.map(c => (
                <div
                  key={c}
                  onClick={() => { setColorSel(c); form.setFieldValue('color', c); }}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: c, cursor: 'pointer',
                    border: colorSel === c ? '3px solid #000' : '3px solid transparent',
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </div>
          </Form.Item>

          <Form.Item name="orden" label="Orden de visualización">
            <Input type="number" min={0} placeholder="0" style={{ width: 120 }} />
          </Form.Item>

          <Form.Item name="color" hidden><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function SeccionDashboard() {
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
              suffix={<Text type="secondary" style={{ fontSize: 11 }}>{data?.ventasHoy?.cantidad ?? 0} comandas</Text>}
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

// ── Root ───────────────────────────────────────────────────────────────────

export default function RestauranteDashboard() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>🍽️ Restaurante — Panel</Title>
      <Tabs
        defaultActiveKey="dashboard"
        items={[
          { key: 'dashboard', label: '📊 Dashboard', children: <SeccionDashboard /> },
          { key: 'areas',     label: '🗺️ Áreas',     children: <SeccionAreas /> },
        ]}
      />
    </div>
  );
}
