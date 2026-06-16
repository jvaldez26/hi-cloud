import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, TimePicker, InputNumber, Tag, message, Dropdown } from 'antd';
import { PlusOutlined, EllipsisOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';

const TIPO_COLOR: Record<string, string> = { interna: 'default', cliente: 'blue', tribunal: 'red', virtual: 'cyan', otro: 'default' };

export default function ReunionesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({ queryKey: ['sp-reuniones'], queryFn: () => serviciosProApi.getReuniones({}) });
  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });
  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });

  const crearMut = useMutation({
    mutationFn: (body: any) => editId ? serviciosProApi.actualizarReunion(editId, body) : serviciosProApi.crearReunion(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-reuniones'] });
      message.success(editId ? 'Reunión actualizada' : 'Reunión creada');
      setModalOpen(false); form.resetFields(); setEditId(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (r: any) => {
    setEditId(r.id);
    form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : null, hora: r.hora ? dayjs(`2000-01-01T${r.hora}`) : null });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Título', dataIndex: 'titulo', render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Expediente', render: (_: any, r: any) => r.expedienteNombre ?? '—' },
    { title: 'Tipo', dataIndex: 'tipo', render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Fecha', dataIndex: 'fecha', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    { title: 'Hora', dataIndex: 'hora', render: (v: string) => v ? v.slice(0, 5) : '' },
    { title: 'Duración', dataIndex: 'duracionMin', render: (v: number) => v ? `${v} min` : '' },
    { title: 'Lugar/URL', dataIndex: 'lugar', render: (v: string) => v?.startsWith('http') ? <a href={v} target="_blank" rel="noreferrer">Link</a> : (v ?? '') },
    { title: 'Profesional', render: (_: any, r: any) => r.profesionalNombre ? `${r.profesionalNombre} ${r.profesionalApellidos ?? ''}`.trim() : '—' },
    {
      title: '', key: 'acc', width: 50,
      render: (_: any, r: any) => (
        <Dropdown menu={{ items: [{ key: 'editar', label: 'Editar', onClick: () => openEditar(r) }] }} trigger={['click']}>
          <Button size="small" icon={<EllipsisOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📅 Reuniones</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>Nueva Reunión</Button>
      </div>

      <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal open={modalOpen} title={editId ? 'Editar Reunión' : 'Nueva Reunión'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({
          ...v,
          fecha: v.fecha?.format('YYYY-MM-DD'),
          hora: v.hora?.format('HH:mm:ss'),
        }))}
        confirmLoading={crearMut.isPending} width={620}>
        <Form form={form} layout="vertical">
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="profesionalId" label="Profesional">
            <Select allowClear showSearch optionFilterProp="children">
              {(profesionales as any[]).map((p: any) => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tipo" label="Tipo" initialValue="cliente">
            <Select>
              <Select.Option value="interna">Interna</Select.Option>
              <Select.Option value="cliente">Con cliente</Select.Option>
              <Select.Option value="tribunal">Tribunal</Select.Option>
              <Select.Option value="virtual">Virtual</Select.Option>
              <Select.Option value="otro">Otro</Select.Option>
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="hora" label="Hora"><TimePicker style={{ width: '100%' }} format="HH:mm" /></Form.Item>
            <Form.Item name="duracionMin" label="Duración (min)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </div>
          <Form.Item name="lugar" label="Lugar o URL"><Input placeholder="Sala de reuniones / https://zoom.us/..." /></Form.Item>
          <Form.Item name="asistentes" label="Asistentes"><Input placeholder="Juan Pérez, María López..." /></Form.Item>
          <Form.Item name="agenda" label="Agenda"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="minutas" label="Minutas / Actas"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="acuerdos" label="Acuerdos / Compromisos"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="cobrable" label="Cobrable" initialValue={false}>
            <Select><Select.Option value={false}>No</Select.Option><Select.Option value={true}>Sí</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
