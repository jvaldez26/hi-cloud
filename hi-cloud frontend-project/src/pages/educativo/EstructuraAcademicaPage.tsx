import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tabs, Table, Button, Modal, Form, Input, Select, InputNumber,
  Space, Tag, message, Popconfirm, Typography, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title } = Typography;
const QK = (k: string) => ['educativo', k];

function useList(path: string, params?: Record<string, any>) {
  return useQuery<any[]>({
    queryKey: [...QK(path), params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });
}

// ── Niveles ─────────────────────────────────────────────────────────────────

function NivelesTab() {
  const qc = useQueryClient();
  const { data: niveles = [], isLoading } = useList('niveles');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/niveles/${editing.id}`, vals)
      : api.post('/educativo/niveles', vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK('niveles') }); setOpen(false); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => { setEditing(row ?? null); form.setFieldsValue(row ?? { orden: 0 }); setOpen(true); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>Nuevo nivel</Button>
      </div>
      <Table dataSource={niveles} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Orden', dataIndex: 'orden', align: 'center' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal open={open} title={editing ? 'Editar nivel' : 'Nuevo nivel'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(v => mut.mutate(v))} confirmLoading={mut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="orden" label="Orden"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          {editing && <Form.Item name="isActive" label="Estado">
            <Select options={[{ value: true, label: 'Activo' }, { value: false, label: 'Inactivo' }]} />
          </Form.Item>}
        </Form>
      </Modal>
    </>
  );
}

// ── Grados ───────────────────────────────────────────────────────────────────

function GradosTab() {
  const qc = useQueryClient();
  const { data: grados = [], isLoading } = useList('grados');
  const { data: niveles = [] } = useList('niveles');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/grados/${editing.id}`, vals)
      : api.post('/educativo/grados', vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK('grados') }); setOpen(false); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => { setEditing(row ?? null); form.setFieldsValue(row ?? { orden: 0 }); setOpen(true); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>Nuevo grado</Button>
      </div>
      <Table dataSource={grados} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Nivel', dataIndex: 'nivelNombre', render: (v: any) => v ?? '—' },
          { title: 'Orden', dataIndex: 'orden', align: 'center' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal open={open} title={editing ? 'Editar grado' : 'Nuevo grado'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(v => mut.mutate(v))} confirmLoading={mut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nivelId" label="Nivel">
            <Select allowClear options={niveles.map((n: any) => ({ value: n.id, label: n.nombre }))} />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="orden" label="Orden"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          {editing && <Form.Item name="isActive" label="Estado">
            <Select options={[{ value: true, label: 'Activo' }, { value: false, label: 'Inactivo' }]} />
          </Form.Item>}
        </Form>
      </Modal>
    </>
  );
}

// ── Asignaturas ──────────────────────────────────────────────────────────────

function AsignaturasTab() {
  const qc = useQueryClient();
  const { data: asignaturas = [], isLoading } = useList('asignaturas');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/asignaturas/${editing.id}`, vals)
      : api.post('/educativo/asignaturas', vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK('asignaturas') }); setOpen(false); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => { setEditing(row ?? null); form.setFieldsValue(row ?? { esEvaluable: true }); setOpen(true); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>Nueva asignatura</Button>
      </div>
      <Table dataSource={asignaturas} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Código', dataIndex: 'codigo', render: (v: any) => v ?? '—' },
          { title: 'Área', dataIndex: 'area', render: (v: any) => v ?? '—' },
          { title: 'Evaluable', dataIndex: 'esEvaluable', render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal open={open} title={editing ? 'Editar asignatura' : 'Nueva asignatura'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(v => mut.mutate(v))} confirmLoading={mut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="codigo" label="Código"><Input /></Form.Item>
          <Form.Item name="area" label="Área">
            <Select allowClear options={['Lengua y Literatura', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales',
              'Inglés', 'Francés', 'Educación Física', 'Artes', 'Tecnología', 'Religión', 'Otra']
              .map(a => ({ value: a, label: a }))} />
          </Form.Item>
          <Form.Item name="esEvaluable" label="¿Es evaluable?">
            <Select options={[{ value: true, label: 'Sí' }, { value: false, label: 'No' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── Secciones ────────────────────────────────────────────────────────────────

function SeccionesTab() {
  const qc = useQueryClient();
  const { data: secciones = [], isLoading } = useList('secciones');
  const { data: grados = [] } = useList('grados');
  const { data: anios = [] } = useList('anios-escolares');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/secciones/${editing.id}`, vals)
      : api.post('/educativo/secciones', vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK('secciones') }); setOpen(false); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => { setEditing(row ?? null); form.setFieldsValue(row ?? { capacidadMaxima: 30 }); setOpen(true); };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>Nueva sección</Button>
      </div>
      <Table dataSource={secciones} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Grado', dataIndex: 'gradoNombre' },
          { title: 'Sección', dataIndex: 'nombre' },
          { title: 'Año', dataIndex: 'anioNombre', render: (v: any) => v ?? '—' },
          { title: 'Aula', dataIndex: 'aula', render: (v: any) => v ?? '—' },
          { title: 'Cap.', dataIndex: 'capacidadMaxima', align: 'center' },
          { title: 'Inscritos', dataIndex: 'totalEstudiantes', align: 'center' },
          { title: 'Estado', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal open={open} title={editing ? 'Editar sección' : 'Nueva sección'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(v => mut.mutate(v))} confirmLoading={mut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="gradoId" label="Grado" rules={[{ required: true }]}>
            <Select options={grados.map((g: any) => ({ value: g.id, label: `${g.nivelNombre ? g.nivelNombre + ' › ' : ''}${g.nombre}` }))} />
          </Form.Item>
          <Form.Item name="anioEscolarId" label="Año escolar">
            <Select allowClear options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="nombre" label="Sección (A/B/C…)" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="aula" label="Aula física"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="capacidadMaxima" label="Capacidad máxima">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function EstructuraAcademicaPage() {
  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ marginBottom: 20 }}>Estructura Académica</Title>
      <Tabs items={[
        { key: 'niveles',      label: 'Niveles',      children: <NivelesTab /> },
        { key: 'grados',       label: 'Grados',       children: <GradosTab /> },
        { key: 'asignaturas',  label: 'Asignaturas',  children: <AsignaturasTab /> },
        { key: 'secciones',    label: 'Secciones',    children: <SeccionesTab /> },
      ]} />
    </div>
  );
}
