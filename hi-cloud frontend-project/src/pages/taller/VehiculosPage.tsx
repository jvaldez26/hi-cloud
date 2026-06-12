import { useState } from 'react';
import {
  Card, Table, Button, Input, Modal, Form, Select, InputNumber,
  Space, Tag, Typography, Popconfirm, message, Tabs,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CarOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import { fmt } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

export default function VehiculosPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['taller-vehiculos', page, search],
    queryFn: () => tallerApi.vehiculos({ page, limit: 20, search: search || undefined }),
  });

  const save = useMutation({
    mutationFn: (vals: any) =>
      editingId ? tallerApi.actualizarVehiculo(editingId, vals) : tallerApi.crearVehiculo(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taller-vehiculos'] });
      message.success(editingId ? 'Vehículo actualizado' : 'Vehículo registrado');
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'Error al guardar'),
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    form.setFieldsValue({ ...r });
    setModalOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const columns = [
    { title: 'Placa', dataIndex: 'placa', width: 110, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Marca', dataIndex: 'marca', width: 110 },
    { title: 'Modelo', dataIndex: 'modelo', width: 120 },
    { title: 'Año', dataIndex: 'anio', width: 70 },
    { title: 'Color', dataIndex: 'color', width: 90, render: (v: any) => v ?? '—' },
    { title: 'Propietario', dataIndex: 'propietarioNombre', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'propietarioTelefono', width: 130, render: (v: any) => v ?? '—' },
    { title: 'Km actual', dataIndex: 'kilometrajeActual', width: 110, render: (v: any) => v ? Number(v).toLocaleString() : '—' },
    {
      title: 'Acciones', key: 'acc', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/taller/vehiculos/${r.id}`)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><CarOutlined style={{ marginRight: 8 }} />Vehículos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Vehículo</Button>
      </div>

      <Card>
        <Input
          placeholder="Buscar por placa, marca, modelo, propietario..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ marginBottom: 16, maxWidth: 360 }}
          allowClear
        />
        <Table
          dataSource={data?.data ?? []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 20,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (t) => `${t} vehículos`,
          }}
        />
      </Card>

      <Modal
        title={editingId ? 'Editar Vehículo' : 'Nuevo Vehículo'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.validateFields().then(save.mutate)}
        confirmLoading={save.isPending}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="placa" label="Placa" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="Ej: A234567" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="marca" label="Marca" rules={[{ required: true, message: 'Requerido' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="modelo" label="Modelo" rules={[{ required: true, message: 'Requerido' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="anio" label="Año">
              <InputNumber style={{ width: '100%' }} min={1900} max={2100} />
            </Form.Item>
            <Form.Item name="color" label="Color">
              <Input />
            </Form.Item>
            <Form.Item name="tipo" label="Tipo">
              <Select allowClear placeholder="Tipo de vehículo">
                {['Sedán','SUV','Pickup','Van','Camión','Moto','Otro'].map(t => (
                  <Select.Option key={t} value={t}>{t}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="combustible" label="Combustible">
              <Select allowClear>
                {['Gasolina','Diesel','Híbrido','Eléctrico','GLP'].map(t => (
                  <Select.Option key={t} value={t}>{t}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="transmision" label="Transmisión">
              <Select allowClear>
                <Select.Option value="Manual">Manual</Select.Option>
                <Select.Option value="Automático">Automático</Select.Option>
                <Select.Option value="CVT">CVT</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="cilindraje" label="Cilindraje">
              <Input placeholder="Ej: 2.0L" />
            </Form.Item>
            <Form.Item name="vin" label="VIN / Chasis">
              <Input />
            </Form.Item>
            <Form.Item name="kilometrajeActual" label="Kilometraje actual">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </div>
          <Title level={5} style={{ marginTop: 8 }}>Propietario</Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="propietarioNombre" label="Nombre">
              <Input />
            </Form.Item>
            <Form.Item name="propietarioTelefono" label="Teléfono">
              <Input />
            </Form.Item>
            <Form.Item name="propietarioEmail" label="Email" style={{ gridColumn: 'span 2' }}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
