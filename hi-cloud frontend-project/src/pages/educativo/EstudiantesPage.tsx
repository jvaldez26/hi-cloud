import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Input, Select, Space, Tag, Modal, Form, DatePicker,
  message, Drawer, Descriptions, Avatar, Popconfirm, Row, Col, Tabs,
  Typography, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, UserOutlined, DeleteOutlined,
} from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const QK = (...k: any[]) => ['educativo', 'estudiantes', ...k];

const SEXO_OPTS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'otro', label: 'Otro' },
];

const SANGRE_OPTS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }));

function sexoLabel(v?: string) {
  return v === 'M' ? 'Masculino' : v === 'F' ? 'Femenino' : v === 'otro' ? 'Otro' : '—';
}

// ── Form modal ───────────────────────────────────────────────────────────────

function EstudianteModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/estudiantes/${editing.id}`, vals)
      : api.post('/educativo/estudiantes', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK() });
      if (editing) qc.invalidateQueries({ queryKey: QK(editing.id) });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const onOk = () => form.validateFields().then(vals => {
    if (vals.fechaNacimiento) vals.fechaNacimiento = vals.fechaNacimiento.format('YYYY-MM-DD');
    mut.mutate(vals);
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar estudiante' : 'Nuevo estudiante'}
      onCancel={onClose}
      onOk={onOk}
      confirmLoading={mut.isPending}
      width={640}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible && editing) {
          form.setFieldsValue({
            ...editing,
            fechaNacimiento: editing.fechaNacimiento ? dayjs(editing.fechaNacimiento) : null,
          });
        } else if (!visible) {
          form.resetFields();
        }
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
          <Col span={8}>
            <Form.Item name="sexo" label="Sexo">
              <Select allowClear options={SEXO_OPTS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="fechaNacimiento" label="Fecha nacimiento">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="cedula" label="Cédula / RNE"><Input /></Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="direccion" label="Dirección"><Input.TextArea rows={2} /></Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="grupoSanguineo" label="Grupo sanguíneo">
              <Select allowClear options={SANGRE_OPTS} />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="alergias" label="Alergias"><Input /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="condiciones" label="Condiciones médicas"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="notas" label="Notas internas"><Input.TextArea rows={2} /></Form.Item>
        {editing && (
          <Form.Item name="isActive" label="Estado">
            <Select options={[{ value: true, label: 'Activo' }, { value: false, label: 'Inactivo' }]} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

// ── Tutor link modal ─────────────────────────────────────────────────────────

function AddTutorModal({ open, estudianteId, onClose }: { open: boolean; estudianteId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: tutores = [] } = useQuery<any[]>({
    queryKey: ['educativo', 'tutores-all'],
    queryFn: () => api.get('/educativo/tutores').then(r => r.data?.data ?? r.data ?? []),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: (vals: any) => api.post(`/educativo/estudiantes/${estudianteId}/tutores`, vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(estudianteId) });
      message.success('Tutor vinculado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal open={open} title="Vincular tutor" onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending} destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}>
      <Form form={form} layout="vertical">
        <Form.Item name="tutorId" label="Tutor" rules={[{ required: true }]}>
          <Select
            showSearch
            filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            options={tutores.map((t: any) => ({
              value: t.id,
              label: `${t.apellidos}, ${t.nombres} ${t.cedula ? `— ${t.cedula}` : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="esPrincipal" label="¿Es tutor principal?" initialValue={false}>
          <Select options={[{ value: true, label: 'Sí' }, { value: false, label: 'No' }]} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Perfil 360° drawer ───────────────────────────────────────────────────────

function PerfilDrawer({ id, onEdit }: { id: number | null; onEdit: (est: any) => void }) {
  const qc = useQueryClient();
  const [addTutorOpen, setAddTutorOpen] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: QK(id),
    queryFn: () => api.get(`/educativo/estudiantes/${id}`).then(r => r.data?.data ?? r.data),
    enabled: !!id,
  });

  const removeTutor = useMutation({
    mutationFn: (tutorId: number) => api.delete(`/educativo/estudiantes/${id}/tutores/${tutorId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK(id) }),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  if (!id) return null;

  return (
    <>
      <Drawer
        title={data ? `${data.apellidos}, ${data.nombres}` : 'Perfil estudiante'}
        width={600}
        open={!!id}
        onClose={() => onEdit(null)}
        extra={<Button type="primary" onClick={() => onEdit(data)}>Editar</Button>}
      >
        {isLoading && <div style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>}
        {data && (
          <Tabs
            items={[
              {
                key: 'datos',
                label: 'Datos personales',
                children: (
                  <div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                      <Avatar size={72} icon={<UserOutlined />} src={data.foto} />
                      <div>
                        <Title level={5} style={{ margin: 0 }}>{data.apellidos}, {data.nombres}</Title>
                        <Text type="secondary">{sexoLabel(data.sexo)} · {data.edad ? `${data.edad} años` : '—'}</Text>
                        <div>
                          <Tag color={data.isActive ? 'green' : 'red'}>{data.isActive ? 'Activo' : 'Inactivo'}</Tag>
                          {data.gradoNombre && <Tag>{data.gradoNombre} — {data.seccionNombre}</Tag>}
                        </div>
                      </div>
                    </div>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="Cédula / RNE">{data.cedula ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Fecha nacimiento">{data.fechaNacimiento ? data.fechaNacimiento.substring(0, 10) : '—'}</Descriptions.Item>
                      <Descriptions.Item label="Teléfono">{data.telefono ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Email">{data.email ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Dirección">{data.direccion ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Grupo sanguíneo">{data.grupoSanguineo ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Alergias">{data.alergias ?? '—'}</Descriptions.Item>
                      <Descriptions.Item label="Condiciones">{data.condiciones ?? '—'}</Descriptions.Item>
                      {data.notas && <Descriptions.Item label="Notas">{data.notas}</Descriptions.Item>}
                    </Descriptions>
                  </div>
                ),
              },
              {
                key: 'tutores',
                label: `Tutores (${data.tutores?.length ?? 0})`,
                children: (
                  <div>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => setAddTutorOpen(true)} style={{ marginBottom: 12 }}>
                      Vincular tutor
                    </Button>
                    <Table
                      dataSource={data.tutores ?? []}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: 'Nombre', render: (_: any, r: any) => `${r.apellidos}, ${r.nombres}` },
                        { title: 'Parentesco', dataIndex: 'parentesco', render: (v: any) => v ?? '—' },
                        { title: 'Teléfono', dataIndex: 'telefono', render: (v: any) => v ?? '—' },
                        { title: 'Principal', dataIndex: 'esPrincipal', render: (v: boolean) => v ? <Tag color="blue">Sí</Tag> : null },
                        {
                          title: '',
                          render: (_: any, r: any) => (
                            <Popconfirm title="¿Desvincular tutor?" onConfirm={() => removeTutor.mutate(r.id)}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </div>
                ),
              },
              {
                key: 'matriculas',
                label: `Matrículas (${data.matriculas?.length ?? 0})`,
                children: (
                  <Table
                    dataSource={data.matriculas ?? []}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: 'Año', dataIndex: 'anioNombre', render: (v: any) => v ?? '—' },
                      { title: 'Grado', dataIndex: 'gradoNombre', render: (v: any) => v ?? '—' },
                      { title: 'Sección', dataIndex: 'seccionNombre', render: (v: any) => v ?? '—' },
                      { title: 'Estado', dataIndex: 'estado', render: (v: any) => <Tag>{v}</Tag> },
                      { title: 'Fecha', dataIndex: 'fechaMatricula', render: (v: any) => v?.substring(0, 10) ?? '—' },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Drawer>
      {id && <AddTutorModal open={addTutorOpen} estudianteId={id} onClose={() => setAddTutorOpen(false)} />}
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function EstudiantesPage() {
  const [q, setQ] = useState('');
  const [isActive, setIsActive] = useState<boolean | undefined>(true);
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [modalData, setModalData] = useState<{ open: boolean; editing?: any }>({ open: false });

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: QK('list', q, isActive),
    queryFn: () =>
      api.get('/educativo/estudiantes', {
        params: { q: q || undefined, isActive: isActive !== undefined ? String(isActive) : undefined },
      }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  const openEdit = (est: any) => {
    setPerfilId(null);
    setModalData({ open: true, editing: est });
  };

  const openNew = () => setModalData({ open: true, editing: undefined });

  const closeModal = () => setModalData({ open: false });

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Estudiantes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo estudiante</Button>
      </div>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="Buscar por nombre, apellido o cédula…"
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          allowClear
          onSearch={setQ}
          onChange={e => { if (!e.target.value) setQ(''); }}
        />
        <Select
          style={{ width: 130 }}
          value={isActive}
          onChange={setIsActive}
          options={[
            { value: true, label: 'Activos' },
            { value: false, label: 'Inactivos' },
            { value: undefined, label: 'Todos' },
          ]}
        />
      </Space>

      <Table
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        onRow={r => ({ onClick: () => setPerfilId(r.id), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Estudiante',
            render: (_: any, r: any) => (
              <Space>
                <Avatar size="small" icon={<UserOutlined />} src={r.foto} />
                <span style={{ fontWeight: 500 }}>{r.apellidos}, {r.nombres}</span>
              </Space>
            ),
          },
          { title: 'Cédula', dataIndex: 'cedula', render: (v: any) => v ?? '—' },
          {
            title: 'Grado / Sección',
            render: (_: any, r: any) =>
              r.gradoNombre ? `${r.gradoNombre}${r.seccionNombre ? ` — ${r.seccionNombre}` : ''}` : '—',
          },
          { title: 'Sexo', dataIndex: 'sexo', render: (v: any) => sexoLabel(v) },
          { title: 'Edad', dataIndex: 'edad', align: 'center', render: (v: any) => v !== null ? `${v}a` : '—' },
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
                onClick={e => { e.stopPropagation(); openEdit(r); }}
              />
            ),
          },
        ]}
      />

      <EstudianteModal open={modalData.open} editing={modalData.editing} onClose={closeModal} />
      <PerfilDrawer id={perfilId} onEdit={r => { if (r) openEdit(r); else setPerfilId(null); }} />
    </div>
  );
}
