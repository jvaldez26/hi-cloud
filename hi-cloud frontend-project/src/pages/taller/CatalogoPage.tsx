import { useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber,
  Switch, Tag, Typography, message, Select, Space,
} from 'antd';
import { PlusOutlined, EditOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';

const { Title } = Typography;

export default function CatalogoPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const { data: catalogo = [], isLoading } = useQuery({
    queryKey: ['taller-catalogo'],
    queryFn: tallerApi.catalogo,
  });

  const save = useMutation({
    mutationFn: (vals: any) =>
      editingId ? tallerApi.actualizarServicioCatalogo(editingId, vals) : tallerApi.crearServicioCatalogo(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taller-catalogo'] });
      message.success(editingId ? 'Actualizado' : 'Servicio creado');
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'Error'),
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
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'Categoría', dataIndex: 'categoria', width: 130, render: (v: any) => v ?? '—' },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Precio base', dataIndex: 'precioBase', width: 130,
      render: (v: any) => v ? `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '—',
    },
    {
      title: 'Horas est.', dataIndex: 'horasEstimadas', width: 100,
      render: (v: any) => v ? `${v} h` : '—',
    },
    {
      title: 'Estado', dataIndex: 'isActive', width: 90,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: '', key: 'acc', width: 60,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <UnorderedListOutlined style={{ marginRight: 8 }} />Catálogo de Servicios
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo servicio</Button>
      </div>
      <Card>
        <Table
          dataSource={catalogo as any[]}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} servicios` }}
        />
      </Card>

      <Modal
        title={editingId ? 'Editar Servicio' : 'Nuevo Servicio'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.validateFields().then(save.mutate)}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre del servicio" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="categoria" label="Categoría">
            <Select allowClear>
              {['Motor','Frenos','Suspensión','Eléctrico','Transmisión','A/C','Llantas','Carrocería','Preventivo','Otro'].map(c => (
                <Select.Option key={c} value={c}>{c}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="precioBase" label="Precio base">
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
            <Form.Item name="horasEstimadas" label="Horas estimadas">
              <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
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
