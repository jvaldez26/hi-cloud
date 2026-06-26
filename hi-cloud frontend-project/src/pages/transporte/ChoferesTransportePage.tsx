import { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Popconfirm, message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList } from '../../api/client';

const { Title } = Typography;
const { Option } = Select;

type Chofer = {
  id: number; nombre: string; cedula?: string; telefono?: string; email?: string;
  licencia?: string; tipoLicencia?: string; vencimientoLicencia?: string;
  estado: string; notas?: string; totalViajes: string;
};

async function fetchChoferes(): Promise<Chofer[]> { return api.get('/transporte/choferes').then(extractList); }

const ESTADO_COLOR: Record<string, string> = { activo: 'green', inactivo: 'default', suspendido: 'red' };

export default function ChoferesTransportePage() {
  const qc = useQueryClient();
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Chofer | null>(null);
  const [form]                = Form.useForm();

  const { data: choferes = [], isLoading } = useQuery({ queryKey: ['tr-choferes'], queryFn: fetchChoferes });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? api.put(`/transporte/choferes/${editing.id}`, vals)
      : api.post('/transporte/choferes', vals),
    onSuccess: () => { message.success('Guardado'); qc.invalidateQueries({ queryKey: ['tr-choferes'] }); closeModal(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error al guardar'),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/transporte/choferes/${id}`),
    onSuccess: () => { message.success('Eliminado'); qc.invalidateQueries({ queryKey: ['tr-choferes'] }); },
  });

  function openNew() { setEditing(null); form.resetFields(); setOpen(true); }
  function openEdit(c: Chofer) {
    setEditing(c);
    form.setFieldsValue({
      ...c,
      vencimientoLicencia: c.vencimientoLicencia ? dayjs(c.vencimientoLicencia) : undefined,
    });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }

  function handleSubmit(vals: any) {
    save.mutate({
      ...vals,
      vencimientoLicencia: vals.vencimientoLicencia ? vals.vencimientoLicencia.format('YYYY-MM-DD') : undefined,
    });
  }

  const columns = [
    { title: 'Nombre',  dataIndex: 'nombre',   key: 'nombre'  },
    { title: 'Cédula',  dataIndex: 'cedula',   key: 'cedula',  render: (v?: string) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', key: 'telefono', render: (v?: string) => v ?? '—' },
    { title: 'Licencia', key: 'lic', render: (_: any, r: Chofer) => {
      if (!r.licencia) return '—';
      const days = r.vencimientoLicencia
        ? Math.ceil((new Date(r.vencimientoLicencia).getTime() - Date.now()) / 86_400_000)
        : null;
      const color = days !== null && days < 0 ? 'red' : days !== null && days <= 30 ? 'orange' : 'default';
      return (
        <Space>
          <span>{r.licencia}</span>
          {r.tipoLicencia && <Tag>{r.tipoLicencia}</Tag>}
          {days !== null && <Tag color={color}>{days < 0 ? `Vencida` : `${days}d`}</Tag>}
        </Space>
      );
    }},
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v.toUpperCase()}</Tag> },
    { title: 'Viajes', dataIndex: 'totalViajes', key: 'viajes', render: (v: string) => Number(v) },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: Chofer) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="¿Eliminar chofer?" onConfirm={() => del.mutate(r.id)} okText="Sí">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={3} style={{ margin: 0 }}><UserOutlined /> Choferes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Chofer</Button>
      </Space>

      <Table dataSource={choferes} columns={columns} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 20 }} />

      <Modal
        open={open}
        title={editing ? 'Editar Chofer' : 'Nuevo Chofer'}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="nombre" label="Nombre Completo" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="cedula"   label="Cédula"    style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="telefono" label="Teléfono"  style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="email"    label="Email"     style={{ flex: 2 }}><Input type="email" /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="licencia"     label="N° Licencia"  style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="tipoLicencia" label="Tipo"         style={{ flex: 1 }}>
              <Select allowClear>
                {['A','B','C','D','E','F'].map(t => <Option key={t} value={t}>{t}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="vencimientoLicencia" label="Vencimiento" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="estado" label="Estado" initialValue="activo" style={{ flex: 1 }}>
              <Select>
                <Option value="activo">Activo</Option>
                <Option value="inactivo">Inactivo</Option>
                <Option value="suspendido">Suspendido</Option>
              </Select>
            </Form.Item>
          </Space.Compact>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
