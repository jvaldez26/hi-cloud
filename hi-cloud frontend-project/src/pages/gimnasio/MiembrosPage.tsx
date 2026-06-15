import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, Select, DatePicker, message, Row, Col } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { gimnasioApi } from '../../api/gimnasio.api';
import dayjs from 'dayjs';

const ESTADO_COLOR: Record<string, string> = { activo: 'green', inactivo: 'default', suspendido: 'orange', vencido: 'red' };

export default function MiembrosPage() {
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-miembros', search, estado],
    queryFn: () => gimnasioApi.getMiembros({ search, estado }),
  });
  const miembros = Array.isArray(data) ? data : data?.data ?? [];

  const crearMut = useMutation({
    mutationFn: (body: any) => editando ? gimnasioApi.actualizarMiembro(editando.id, body) : gimnasioApi.crearMiembro(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gimnasio-miembros'] });
      message.success(editando ? 'Miembro actualizado' : 'Miembro creado');
      setModalOpen(false); form.resetFields(); setEditando(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (m: any) => {
    setEditando(m);
    form.setFieldsValue({ ...m, fechaNacimiento: m.fechaNacimiento ? dayjs(m.fechaNacimiento) : null });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Numero', dataIndex: 'numero', width: 100 },
    { title: 'Nombre', dataIndex: 'nombre', render: (v: string, r: any) => `${v} ${r.apellidos ?? ''}`.trim() },
    { title: 'Cedula', dataIndex: 'cedula' },
    { title: 'Telefono', dataIndex: 'telefono' },
    { title: 'Objetivo', dataIndex: 'objetivo' },
    { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    {
      title: 'Acciones', render: (_: any, r: any) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => navigate(`/gimnasio/miembros/${r.id}`)}>Ficha</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)}>Editar</Button>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Miembros</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); form.resetFields(); setModalOpen(true); }}>Nuevo Miembro</Button>
      </div>
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}><Input.Search placeholder="Buscar nombre, cedula, numero..." value={search} onChange={e => setSearch(e.target.value)} /></Col>
        <Col xs={12} md={6}>
          <Select style={{ width: '100%' }} placeholder="Estado" allowClear value={estado || undefined} onChange={v => setEstado(v ?? '')}>
            {['activo', 'inactivo', 'suspendido', 'vencido'].map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
          </Select>
        </Col>
      </Row>
      <Table dataSource={miembros} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal
        open={modalOpen}
        title={editando ? 'Editar Miembro' : 'Nuevo Miembro'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditando(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fechaNacimiento: v.fechaNacimiento?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="apellidos" label="Apellidos"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="cedula" label="Cedula"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="fechaNacimiento" label="Fecha Nacimiento"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="sexo" label="Sexo"><Select><Select.Option value="M">Masculino</Select.Option><Select.Option value="F">Femenino</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="telefono" label="Telefono"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="objetivo" label="Objetivo"><Select><Select.Option value="perder_peso">Perder Peso</Select.Option><Select.Option value="ganar_masa">Ganar Masa</Select.Option><Select.Option value="tonificar">Tonificar</Select.Option><Select.Option value="mantenimiento">Mantenimiento</Select.Option><Select.Option value="rendimiento">Rendimiento</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="nivelFitness" label="Nivel"><Select><Select.Option value="principiante">Principiante</Select.Option><Select.Option value="intermedio">Intermedio</Select.Option><Select.Option value="avanzado">Avanzado</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="telefonoEmergencia" label="Tel. Emergencia"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="contactoEmergencia" label="Contacto Emergencia"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="condicionesMedicas" label="Condiciones Medicas"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
