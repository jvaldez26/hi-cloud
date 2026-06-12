import { useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber,
  Switch, Space, Tag, Typography, message,
} from 'antd';
import { PlusOutlined, EditOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';

const { Title } = Typography;

export default function TecnicosPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const { data: tecnicos = [], isLoading } = useQuery({
    queryKey: ['taller-tecnicos'],
    queryFn: tallerApi.tecnicos,
  });

  const save = useMutation({
    mutationFn: (vals: any) =>
      editingId ? tallerApi.actualizarTecnico(editingId, vals) : tallerApi.crearTecnico(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taller-tecnicos'] });
      message.success(editingId ? 'Técnico actualizado' : 'Técnico registrado');
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
    { title: 'Nombre', dataIndex: 'nombre', render: (v: string) => <><UserOutlined style={{ marginRight: 6 }} />{v}</> },
    { title: 'Especialidad', dataIndex: 'especialidad', render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', render: (v: any) => v ?? '—' },
    { title: 'Email', dataIndex: 'email', render: (v: any) => v ?? '—' },
    {
      title: 'Tarifa/hora', dataIndex: 'tarifaHora',
      render: (v: any) => v ? `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—',
    },
    {
      title: 'Estado', dataIndex: 'isActive',
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'acc', width: 90,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><UserOutlined style={{ marginRight: 8 }} />Técnicos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Técnico</Button>
      </div>
      <Card>
        <Table
          dataSource={tecnicos as any[]}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId ? 'Editar Técnico' : 'Nuevo Técnico'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.validateFields().then(save.mutate)}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true, message: 'Requerido' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="especialidad" label="Especialidad">
            <Input placeholder="Ej: Mecánica general, Electricidad, Frenos..." />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="telefono" label="Teléfono">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email">
              <Input />
            </Form.Item>
            <Form.Item name="tarifaHora" label="Tarifa por hora">
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
          </div>
          {editingId && (
            <Form.Item name="isActive" label="Activo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
