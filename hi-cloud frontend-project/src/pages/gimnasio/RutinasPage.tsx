import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, Select, InputNumber, message } from 'antd';
import { PlusOutlined, FilePdfOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function RutinasPage() {
  const [miembroFiltro, setMiembroFiltro] = useState<number | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-rutinas', miembroFiltro],
    queryFn: () => gimnasioApi.getRutinas(miembroFiltro ? { miembroId: miembroFiltro } : undefined),
  });
  const rutinas = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const { data: entrenadoresData } = useQuery({ queryKey: ['gimnasio-entrenadores'], queryFn: gimnasioApi.getEntrenadores });
  const entrenadores = Array.isArray(entrenadoresData) ? entrenadoresData : [];

  const guardarMut = useMutation({
    mutationFn: (body: any) => editando ? gimnasioApi.actualizarRutina(editando.id, body) : gimnasioApi.crearRutina(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-rutinas'] }); message.success('Rutina guardada'); setModalOpen(false); form.resetFields(); setEditando(null); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const verPdf = async (id: number) => {
    try {
      const blob = await gimnasioApi.getRutinaPdf(id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      message.error('Error al obtener el PDF');
    }
  };

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'Miembro', dataIndex: 'miembroNombre' },
    { title: 'Entrenador', dataIndex: 'entrenadorNombre' },
    { title: 'Objetivo', dataIndex: 'objetivo' },
    { title: 'Nivel', dataIndex: 'nivel' },
    { title: 'Semanas', dataIndex: 'duracionSemanas' },
    { title: 'Activa', dataIndex: 'activa', render: (v: boolean) => v ? <Tag color="green">Si</Tag> : <Tag>No</Tag> },
    {
      title: 'Acciones', render: (_: any, r: any) => (
        <Space>
          <Button icon={<FilePdfOutlined />} size="small" onClick={() => verPdf(r.id)}>PDF</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => { setEditando(r); form.setFieldsValue(r); setModalOpen(true); }}>Editar</Button>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Rutinas</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); form.resetFields(); setModalOpen(true); }}>Nueva Rutina</Button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select style={{ width: 250 }} placeholder="Filtrar por miembro" allowClear showSearch optionFilterProp="children"
          value={miembroFiltro} onChange={v => setMiembroFiltro(v)}>
          {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
        </Select>
      </div>
      <Table dataSource={rutinas} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal open={modalOpen} title={editando ? 'Editar Rutina' : 'Nueva Rutina'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditando(null); }}
        onOk={() => form.validateFields().then(v => guardarMut.mutate(v))}
        confirmLoading={guardarMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro">
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="entrenadorId" label="Entrenador">
            <Select placeholder="Seleccionar entrenador" allowClear>
              {entrenadores.map((e: any) => <Select.Option key={e.id} value={e.id}>{e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="objetivo" label="Objetivo"><Select><Select.Option value="perder_peso">Perder Peso</Select.Option><Select.Option value="ganar_masa">Ganar Masa</Select.Option><Select.Option value="tonificar">Tonificar</Select.Option><Select.Option value="mantenimiento">Mantenimiento</Select.Option></Select></Form.Item>
          <Form.Item name="nivel" label="Nivel"><Select><Select.Option value="principiante">Principiante</Select.Option><Select.Option value="intermedio">Intermedio</Select.Option><Select.Option value="avanzado">Avanzado</Select.Option></Select></Form.Item>
          <Form.Item name="duracionSemanas" label="Duracion (semanas)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item name="descripcion" label="Descripcion"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
