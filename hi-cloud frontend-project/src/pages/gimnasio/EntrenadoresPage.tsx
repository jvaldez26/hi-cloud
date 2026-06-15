import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function EntrenadoresPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['gimnasio-entrenadores'], queryFn: gimnasioApi.getEntrenadores });
  const entrenadores = Array.isArray(data) ? data : [];

  const guardarMut = useMutation({
    mutationFn: (body: any) => editando ? gimnasioApi.actualizarEntrenador(editando.id, body) : gimnasioApi.crearEntrenador(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-entrenadores'] }); message.success('Entrenador guardado'); setModalOpen(false); form.resetFields(); setEditando(null); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'Especialidad', dataIndex: 'especialidad' },
    { title: 'Certificaciones', dataIndex: 'certificaciones' },
    { title: 'Tarifa Sesion', dataIndex: 'tarifaSesion', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { title: 'Tarifa Mes', dataIndex: 'tarifaMes', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    {
      title: 'Acciones', render: (_: any, r: any) => (
        <Button icon={<EditOutlined />} size="small" onClick={() => { setEditando(r); form.setFieldsValue(r); setModalOpen(true); }}>Editar</Button>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Entrenadores</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); form.resetFields(); setModalOpen(true); }}>Nuevo Entrenador</Button>
      </div>
      <Table dataSource={entrenadores} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal open={modalOpen} title={editando ? 'Editar Entrenador' : 'Nuevo Entrenador'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditando(null); }}
        onOk={() => form.validateFields().then(v => guardarMut.mutate(v))}
        confirmLoading={guardarMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="especialidad" label="Especialidad"><Input /></Form.Item>
          <Form.Item name="certificaciones" label="Certificaciones"><Input /></Form.Item>
          <Form.Item name="tarifaSesion" label="Tarifa por Sesion (RD$)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="tarifaMes" label="Tarifa Mensual (RD$)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="telefono" label="Telefono"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
