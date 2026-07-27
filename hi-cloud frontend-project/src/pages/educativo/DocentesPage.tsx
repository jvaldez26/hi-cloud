import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Input, Space, Tag, Modal, Form, Select,
  message, Typography, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title } = Typography;
const QK = (...k: any[]) => ['educativo', 'docentes', ...k];

function DocenteModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/docentes/${editing.id}`, vals)
      : api.post('/educativo/docentes', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK() });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar docente' : 'Nuevo docente'}
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={560}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible && editing) form.setFieldsValue(editing);
        else if (!visible) form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="nombres" label="Nombres" rules={[{ required: true }]}><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="apellidos" label="Apellidos" rules={[{ required: true }]}><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="cedula" label="Cédula"><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="especialidad" label="Especialidad"><Input /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="titulo" label="Título académico"><Input /></Form.Item>
        {editing && (
          <Form.Item name="isActive" label="Estado">
            <Select options={[{ value: true, label: 'Activo' }, { value: false, label: 'Inactivo' }]} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default function DocentesPage() {
  const [q, setQ] = useState('');
  const [modalData, setModalData] = useState<{ open: boolean; editing?: any }>({ open: false });

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: QK('list', q),
    queryFn: () =>
      api.get('/educativo/docentes', { params: { q: q || undefined } })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Docentes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalData({ open: true })}>
          Nuevo docente
        </Button>
      </div>

      <Space style={{ marginBottom: 12 }}>
        <Input.Search
          placeholder="Buscar por nombre, cédula o especialidad…"
          prefix={<SearchOutlined />}
          style={{ width: 320 }}
          allowClear
          onSearch={setQ}
          onChange={e => { if (!e.target.value) setQ(''); }}
        />
      </Space>

      <Table
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', render: (_: any, r: any) => `${r.apellidos}, ${r.nombres}` },
          { title: 'Cédula', dataIndex: 'cedula', render: (v: any) => v ?? '—' },
          { title: 'Especialidad', dataIndex: 'especialidad', render: (v: any) => v ?? '—' },
          { title: 'Título', dataIndex: 'titulo', render: (v: any) => v ?? '—' },
          { title: 'Teléfono', dataIndex: 'telefono', render: (v: any) => v ?? '—' },
          { title: 'Secciones', dataIndex: 'totalSecciones', align: 'center' },
          {
            title: 'Estado',
            dataIndex: 'isActive',
            render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
          },
          {
            title: '',
            key: 'a',
            render: (_: any, r: any) => (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => setModalData({ open: true, editing: r })}
              />
            ),
          },
        ]}
      />

      <DocenteModal
        open={modalData.open}
        editing={modalData.editing}
        onClose={() => setModalData({ open: false })}
      />
    </div>
  );
}
