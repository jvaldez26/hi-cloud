import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tabs, Table, Button, Modal, Form, Input, Select, InputNumber,
  Space, Tag, message, Popconfirm, Typography, Row, Col, DatePicker, Switch,
  Checkbox, Divider, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
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

// ── Años escolares ───────────────────────────────────────────────────────────
// Sin esto no hay nada que hacer en el módulo: matrículas, secciones, planes
// de pago y planilla de notas cuelgan de un año escolar existente.

function AniosEscolaresTab() {
  const qc = useQueryClient();
  const { data: anios = [], isLoading } = useList('anios-escolares');
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/anios-escolares/${editing.id}`, vals)
      : api.post('/educativo/anios-escolares', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK('anios-escolares') });
      // el resto de las pantallas del módulo listan años escolares con su
      // propia queryKey ('educativo','anios-escolares') — sin esto quedan
      // con la lista vieja hasta un refresh manual.
      qc.invalidateQueries({ queryKey: ['educativo', 'anios-escolares'] });
      setOpen(false);
      message.success('Guardado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => {
    setEditing(row ?? null);
    form.setFieldsValue(row
      ? { ...row, fechaInicio: row.fechaInicio ? dayjs(row.fechaInicio) : null, fechaFin: row.fechaFin ? dayjs(row.fechaFin) : null }
      : { estado: 'activo', esActual: anios.length === 0 });
    setOpen(true);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>Nuevo año escolar</Button>
      </div>
      <Table dataSource={anios} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Inicio', dataIndex: 'fechaInicio', render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Fin', dataIndex: 'fechaFin', render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Estado', dataIndex: 'estado', render: (v: any) => <Tag>{v ?? '—'}</Tag> },
          { title: 'Actual', dataIndex: 'esActual', align: 'center', render: (v: boolean) => v ? <Tag color="blue">Actual</Tag> : null },
          { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
        ]}
      />
      <Modal open={open} title={editing ? 'Editar año escolar' : 'Nuevo año escolar'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(vals => {
          if (vals.fechaInicio) vals.fechaInicio = vals.fechaInicio.format('YYYY-MM-DD');
          if (vals.fechaFin) vals.fechaFin = vals.fechaFin.format('YYYY-MM-DD');
          mut.mutate(vals);
        })} confirmLoading={mut.isPending} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
            <Input placeholder="Ej: 2026-2027" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fechaInicio" label="Fecha de inicio" rules={[{ required: !editing }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fechaFin" label="Fecha de fin" rules={[{ required: !editing }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="esActual" label="¿Es el año escolar actual?" valuePropName="checked" getValueFromEvent={(v: boolean) => v}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── Períodos ─────────────────────────────────────────────────────────────────
// Sin un período no se puede crear ninguna evaluación (ed_evaluaciones.
// periodoId es NOT NULL) — PlanillaNotasPage exige elegir uno antes de
// habilitar "Nueva evaluación".

function PeriodosTab() {
  const qc = useQueryClient();
  const { data: anios = [] } = useList('anios-escolares');
  const [anioId, setAnioId] = useState<number | undefined>();
  const { data: periodos = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'periodos', anioId],
    queryFn: () => api.get('/educativo/periodos', { params: { anioEscolarId: anioId } }).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!anioId,
  });
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/periodos/${editing.id}`, vals)
      : api.post('/educativo/periodos', { ...vals, anioEscolarId: anioId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'periodos'] });
      setOpen(false); message.success('Guardado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (row?: any) => {
    setEditing(row ?? null);
    form.setFieldsValue(row
      ? { ...row, fechaInicio: row.fechaInicio ? dayjs(row.fechaInicio) : null, fechaFin: row.fechaFin ? dayjs(row.fechaFin) : null }
      : { numero: (periodos?.length ?? 0) + 1, ponderacion: 25, estado: 'abierto' });
    setOpen(true);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Select
          style={{ width: 220 }}
          placeholder="Año escolar"
          options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={setAnioId}
        />
        <Button type="primary" icon={<PlusOutlined />} disabled={!anioId} onClick={() => openEdit()}>
          Nuevo período
        </Button>
      </div>
      {!anioId ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Selecciona un año escolar</div>
      ) : (
        <Table dataSource={periodos} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Nombre', dataIndex: 'nombre' },
            { title: 'Número', dataIndex: 'numero', align: 'center' },
            { title: 'Inicio', dataIndex: 'fechaInicio', render: (v: any) => v?.substring(0, 10) ?? '—' },
            { title: 'Fin', dataIndex: 'fechaFin', render: (v: any) => v?.substring(0, 10) ?? '—' },
            { title: 'Ponderación', dataIndex: 'ponderacion', align: 'center', render: (v: any) => v != null ? `${v}%` : '—' },
            { title: 'Estado', dataIndex: 'estado', render: (v: any) => <Tag color={v === 'abierto' ? 'green' : 'default'}>{v}</Tag> },
            { title: '', key: 'a', render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> },
          ]}
        />
      )}
      <Modal open={open} title={editing ? 'Editar período' : 'Nuevo período'} onCancel={() => setOpen(false)}
        onOk={() => form.validateFields().then(vals => {
          if (vals.fechaInicio) vals.fechaInicio = vals.fechaInicio.format('YYYY-MM-DD');
          if (vals.fechaFin) vals.fechaFin = vals.fechaFin.format('YYYY-MM-DD');
          mut.mutate(vals);
        })} confirmLoading={mut.isPending} destroyOnClose>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
                <Input placeholder="Ej: Primer trimestre" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="numero" label="Número" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fechaInicio" label="Fecha inicio">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fechaFin" label="Fecha fin">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ponderacion" label="Ponderación (%)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── Pensum ───────────────────────────────────────────────────────────────────
// El boletín saca sus asignaturas del pensum del grado (ed_grado_asignaturas)
// — sin esto configurado, todo grado imprime un boletín vacío.

function PensumTab() {
  const qc = useQueryClient();
  const { data: grados = [] } = useList('grados');
  const { data: todasAsignaturas = [] } = useList('asignaturas');
  const [gradoId, setGradoId] = useState<number | undefined>();
  const [seleccionadas, setSeleccionadas] = useState<number[]>([]);

  const { data: pensum = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'pensum', gradoId],
    queryFn: () => api.get(`/educativo/grados/${gradoId}/pensum`).then(r => r.data?.data ?? r.data ?? []),
    enabled: !!gradoId,
  });

  useEffect(() => {
    setSeleccionadas(pensum.map((p: any) => p.asignaturaId));
  }, [pensum]);

  const mut = useMutation({
    mutationFn: () => api.post(`/educativo/grados/${gradoId}/pensum`, {
      asignaturas: seleccionadas.map((asignaturaId, orden) => ({ asignaturaId, orden })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'pensum', gradoId] });
      message.success('Pensum guardado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const toggle = (id: number) => setSeleccionadas(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Select
          style={{ width: 260 }}
          placeholder="Selecciona un grado"
          options={grados.map((g: any) => ({ value: g.id, label: `${g.nivelNombre ? g.nivelNombre + ' › ' : ''}${g.nombre}` }))}
          onChange={setGradoId}
        />
        <Button type="primary" icon={<SaveOutlined />} disabled={!gradoId} loading={mut.isPending} onClick={() => mut.mutate()}>
          Guardar pensum
        </Button>
      </Space>
      {!gradoId ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Selecciona un grado para ver/editar su pensum</div>
      ) : isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando…</div>
      ) : !todasAsignaturas.length ? (
        <Alert type="warning" showIcon message="No hay asignaturas creadas todavía — créalas en la pestaña Asignaturas." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {todasAsignaturas.map((a: any) => (
            <Checkbox key={a.id} checked={seleccionadas.includes(a.id)} onChange={() => toggle(a.id)}>
              {a.nombre}{a.area ? <span style={{ color: '#999', fontSize: 11 }}> — {a.area}</span> : null}
            </Checkbox>
          ))}
        </div>
      )}
    </>
  );
}

// ── Configuración ────────────────────────────────────────────────────────────
// Nada del cálculo de notas está fijo en código — todo sale de acá: la
// escala (0-100, 1-10, la que sea), la nota mínima para aprobar y si se
// usan letras (y con qué rangos). Colegios privados/bilingües usan escalas
// propias sin que el backend distinga un caso del otro.

function ConfiguracionTab() {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data, isLoading } = useQuery<any>({
    queryKey: ['educativo', 'config'],
    queryFn: () => api.get('/educativo/config').then(r => r.data?.data ?? r.data),
  });
  const usaLetras = Form.useWatch('usaLetras', form);

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/config', vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['educativo', 'config'] }); message.success('Configuración guardada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Cargando…</div>;

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 720 }}
      initialValues={{
        escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70,
        usaLetras: false, cantidadPeriodos: 4, tipoPeriodo: 'trimestre', monedaColegiatura: 'DOP',
      }}
      onFinish={vals => mut.mutate(vals)}
    >
      <Divider orientation="left" plain>Centro educativo</Divider>
      <Row gutter={12}>
        <Col span={16}><Form.Item name="nombreCentro" label="Nombre del centro"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="codigoMinerd" label="Código MINERD"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="regional" label="Regional"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="distritoEducativo" label="Distrito educativo"><Input /></Form.Item></Col>
      </Row>

      <Divider orientation="left" plain>Escala de calificación</Divider>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="escalaMinima" label="Escala mínima" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="escalaMaxima" label="Escala máxima" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="notaMinimaAprobar" label="Nota mínima para aprobar" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="usaLetras" label="¿Usa letras además del número?" valuePropName="checked" getValueFromEvent={(v: boolean) => v}>
        <Switch />
      </Form.Item>
      {usaLetras && (
        <Form.List name="escalaLetras">
          {(fields, { add, remove }) => (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                Rangos de nota → letra. Ej: 90–100 → A. Deben cubrir toda la escala sin solaparse.
              </Text>
              {fields.map(field => (
                <Row gutter={8} key={field.key} style={{ marginBottom: 8 }}>
                  <Col span={7}>
                    <Form.Item {...field} name={[field.name, 'min']} noStyle rules={[{ required: true, message: 'Mín.' }]}>
                      <InputNumber placeholder="Mín." style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={7}>
                    <Form.Item {...field} name={[field.name, 'max']} noStyle rules={[{ required: true, message: 'Máx.' }]}>
                      <InputNumber placeholder="Máx." style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={7}>
                    <Form.Item {...field} name={[field.name, 'letra']} noStyle rules={[{ required: true, message: 'Letra' }]}>
                      <Input placeholder="Letra (ej: A)" />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => add({ min: undefined, max: undefined, letra: '' })} block>
                + Agregar rango
              </Button>
            </div>
          )}
        </Form.List>
      )}

      <Divider orientation="left" plain>Períodos y colegiatura</Divider>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="cantidadPeriodos" label="Cantidad de períodos por año">
            <InputNumber min={1} max={12} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="tipoPeriodo" label="Tipo de período">
            <Select options={[
              { value: 'trimestre', label: 'Trimestre' },
              { value: 'bimestre', label: 'Bimestre' },
              { value: 'semestre', label: 'Semestre' },
            ]} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="monedaColegiatura" label="Moneda de colegiatura">
            <Select options={[{ value: 'DOP', label: 'DOP' }, { value: 'USD', label: 'USD' }]} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
          Guardar configuración
        </Button>
      </Form.Item>
    </Form>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function EstructuraAcademicaPage() {
  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ marginBottom: 20 }}>Estructura Académica</Title>
      <Tabs items={[
        { key: 'anios',        label: 'Años Escolares', children: <AniosEscolaresTab /> },
        { key: 'periodos',     label: 'Períodos',     children: <PeriodosTab /> },
        { key: 'niveles',      label: 'Niveles',      children: <NivelesTab /> },
        { key: 'grados',       label: 'Grados',       children: <GradosTab /> },
        { key: 'asignaturas',  label: 'Asignaturas',  children: <AsignaturasTab /> },
        { key: 'secciones',    label: 'Secciones',    children: <SeccionesTab /> },
        { key: 'pensum',       label: 'Pensum',       children: <PensumTab /> },
        { key: 'configuracion', label: 'Configuración', children: <ConfiguracionTab /> },
      ]} />
    </div>
  );
}
