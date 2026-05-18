import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Statistic, Button, Table, Tag, Modal, Form,
  Input, InputNumber, Select, DatePicker, Space, Tabs, Switch,
  message, Typography, Badge, Progress, Tooltip,
} from 'antd';
import {
  BookOutlined, PlusOutlined, TeamOutlined, FileExcelOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const CATEGORIAS = ['Ventas', 'Operaciones', 'Tecnología', 'Cumplimiento', 'Seguridad', 'Liderazgo', 'Atención al Cliente'];

const estadoColor: Record<string, string> = {
  programada: 'blue', en_progreso: 'orange', completada: 'green', cancelada: 'red',
};

const modalidadColor: Record<string, string> = {
  presencial: 'cyan', virtual: 'purple', mixto: 'geekblue',
};

export default function CapacitacionPage() {
  const qc = useQueryClient();
  const [tabActiva, setTabActiva] = useState('cursos');
  const [modalCurso, setModalCurso] = useState(false);
  const [modalSesion, setModalSesion] = useState(false);
  const [sesionSeleccionada, setSesionSeleccionada] = useState<any>(null);
  const [formCurso] = Form.useForm();
  const [formSesion] = Form.useForm();

  const COLS_DEF = [
    { key: 'nombre',        label: 'Curso' },
    { key: 'categoria',     label: 'Categoría' },
    { key: 'instructor',    label: 'Instructor' },
    { key: 'duracionHoras', label: 'Duración' },
    { key: 'modalidad',     label: 'Modalidad' },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('capacitacion', COLS_DEF);

  const { data: resumen } = useQuery<any>({
    queryKey: ['capacitacion-resumen'],
    queryFn: () => api.get('/capacitacion/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: cursos = [] } = useQuery<any[]>({
    queryKey: ['cursos-capacitacion'],
    queryFn: () => api.get('/capacitacion/cursos').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: sesiones = [] } = useQuery<any[]>({
    queryKey: ['sesiones-capacitacion'],
    queryFn: () => api.get('/capacitacion/sesiones').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: registros = [] } = useQuery<any[]>({
    queryKey: ['registros-capacitacion', sesionSeleccionada?.id],
    queryFn: () => api.get(`/capacitacion/sesiones/${sesionSeleccionada.id}/registros`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled: !!sesionSeleccionada?.id,
  });

  const crearCurso = useMutation({
    mutationFn: (data: any) => api.post('/capacitacion/cursos', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cursos-capacitacion'] });
      qc.invalidateQueries({ queryKey: ['capacitacion-resumen'] });
      setModalCurso(false);
      formCurso.resetFields();
      message.success('Curso creado');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const crearSesion = useMutation({
    mutationFn: (data: any) => api.post('/capacitacion/sesiones', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sesiones-capacitacion'] });
      qc.invalidateQueries({ queryKey: ['capacitacion-resumen'] });
      setModalSesion(false);
      formSesion.resetFields();
      message.success('Sesión programada');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const cambiarEstadoSesion = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      api.patch(`/capacitacion/sesiones/${id}`, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sesiones-capacitacion'] }),
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const emitirCertificado = useMutation({
    mutationFn: (id: number) => api.patch(`/capacitacion/registros/${id}/certificado`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registros-capacitacion'] });
      qc.invalidateQueries({ queryKey: ['capacitacion-resumen'] });
      message.success('Certificado emitido');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BookOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Capacitación y Formación</Title>
            <Text type="secondary">Gestión de cursos, sesiones y certificados del equipo</Text>
          </div>
        </div>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tabActiva}
          onChange={setTabActiva}
          tabBarExtraContent={
            <Space>
              <RefreshByKeyButton queryKey={['capacitacion']} />
              {tabActiva === 'cursos' && (
                <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
              )}
              <VideoTutorialButton />
              <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                const src = tabActiva === 'cursos' ? cursos : sesiones ?? [];
                const filas = (src ?? []).map((r: any) => ({
                  'Nombre':    r.nombre ?? r.curso?.nombre ?? '',
                  'Categoría': r.categoria ?? '',
                  'Fecha':     r.fecha ?? r.createdAt ?? '',
                  'Estado':    r.estado ?? (r.activo ? 'Activo' : 'Inactivo'),
                  'Instructor':r.instructor ?? '',
                }));
                exportarExcel(filas, `Capacitacion-${tabActiva}`);
              }}>Excel</Button>
              {tabActiva === 'cursos' && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCurso(true)}>
                  Nuevo Curso
                </Button>
              )}
              {tabActiva === 'sesiones' && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSesion(true)}>
                  Programar Sesión
                </Button>
              )}
            </Space>
          }
          items={[
            {
              key: 'cursos',
              label: 'Cursos',
              children: (
                <Table
                  dataSource={cursos}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 10 }}
                  columns={filterColumns([
                    {
                      title: 'Curso', dataIndex: 'nombre', key: 'nombre',
                      render: (v, r: any) => (
                        <div>
                          <Text strong>{v}</Text>
                          {r.descripcion && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.descripcion.slice(0, 60)}...</Text></div>}
                        </div>
                      ),
                    },
                    { title: 'Categoría', dataIndex: 'categoria', key: 'categoria', render: v => v ? <Tag color="blue">{v}</Tag> : '—' },
                    { title: 'Instructor', dataIndex: 'instructor', key: 'instructor', render: v => v || '—' },
                    {
                      title: 'Duración', dataIndex: 'duracionHoras', key: 'duracionHoras',
                      render: v => <Space><ClockCircleOutlined />{v}h</Space>,
                    },
                    { title: 'Modalidad', dataIndex: 'modalidad', key: 'modalidad', render: v => <Tag color={modalidadColor[v]}>{v}</Tag> },
                  ])}
                />
              ),
            },
            {
              key: 'sesiones',
              label: 'Sesiones',
              children: (
                <Table
                  dataSource={sesiones}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 12 }}
                  onRow={row => ({ style: { cursor: 'pointer' }, onClick: () => { setSesionSeleccionada(row); setTabActiva('registros'); } })}
                  columns={[
                    {
                      title: 'Curso', key: 'curso',
                      render: (_, r: any) => <Text strong>{r.curso?.nombre ?? `Curso #${r.cursoId}`}</Text>,
                    },
                    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', sorter: (a, b) => a.fecha.localeCompare(b.fecha) },
                    { title: 'Hora', dataIndex: 'hora', key: 'hora', render: v => v || '—' },
                    { title: 'Lugar', dataIndex: 'lugar', key: 'lugar', render: v => v || <Text type="secondary">Virtual</Text> },
                    { title: 'Modalidad', dataIndex: 'modalidad', key: 'modalidad', render: v => <Tag color={modalidadColor[v]}>{v}</Tag> },
                    {
                      title: 'Estado', dataIndex: 'estado', key: 'estado',
                      render: (v, r: any) => (
                        <Select
                          size="small"
                          value={v}
                          onClick={e => e.stopPropagation()}
                          onChange={val => cambiarEstadoSesion.mutate({ id: r.id, estado: val })}
                          style={{ width: 130 }}
                        >
                          <Option value="programada"><Tag color="blue">Programada</Tag></Option>
                          <Option value="en_progreso"><Tag color="orange">En Progreso</Tag></Option>
                          <Option value="completada"><Tag color="green">Completada</Tag></Option>
                          <Option value="cancelada"><Tag color="red">Cancelada</Tag></Option>
                        </Select>
                      ),
                    },
                    { title: '', key: 'ver', render: () => <Button size="small" type="link">Ver asistencia</Button> },
                  ]}
                />
              ),
            },
            {
              key: 'registros',
              label: sesionSeleccionada ? `Asistencia — ${sesionSeleccionada.curso?.nombre ?? 'Sesión'}` : 'Asistencia',
              disabled: !sesionSeleccionada,
              children: (
                <div>
                  {sesionSeleccionada && (
                    <div style={{ marginBottom: 16 }}>
                      <Space>
                        <Tag color="blue">{sesionSeleccionada.fecha}</Tag>
                        <Tag color={modalidadColor[sesionSeleccionada.modalidad]}>{sesionSeleccionada.modalidad}</Tag>
                        <Button size="small" onClick={() => setSesionSeleccionada(null)}>← Volver</Button>
                      </Space>
                    </div>
                  )}
                  <Table
                    dataSource={registros}
                    rowKey="id"
                    size="middle"
                    pagination={{ pageSize: 20 }}
                    columns={[
                      { title: 'Empleado ID', dataIndex: 'empleadoId', key: 'empleadoId' },
                      {
                        title: 'Asistió', dataIndex: 'asistio', key: 'asistio',
                        render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Sí' : 'No'}</Tag>,
                      },
                      {
                        title: 'Calificación', dataIndex: 'calificacion', key: 'calificacion',
                        render: v => v != null ? (
                          <Progress
                            percent={v}
                            size="small"
                            strokeColor={v >= 70 ? '#52c41a' : '#ff4d4f'}
                            style={{ width: 100 }}
                            format={() => `${v}%`}
                          />
                        ) : '—',
                      },
                      {
                        title: 'Aprobado', dataIndex: 'aprobado', key: 'aprobado',
                        render: v => <Tag color={v ? 'green' : 'orange'}>{v ? 'Aprobado' : 'Pendiente'}</Tag>,
                      },
                      {
                        title: 'Certificado', dataIndex: 'certificadoEmitido', key: 'certificadoEmitido',
                        render: (v, r: any) => v
                          ? <Tag color="green" icon={<SafetyCertificateOutlined />}>Emitido</Tag>
                          : r.aprobado
                            ? <Button size="small" type="primary" ghost onClick={() => emitirCertificado.mutate(r.id)}>Emitir</Button>
                            : '—',
                      },
                      { title: 'Comentarios', dataIndex: 'comentarios', key: 'comentarios', render: v => v || '—' },
                    ]}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Curso */}
      <Modal
        title="Nuevo Curso"
        open={modalCurso}
        onCancel={() => setModalCurso(false)}
        onOk={() => formCurso.submit()}
        confirmLoading={crearCurso.isPending}
        okText="Guardar"
        width={540}
      >
        <Form form={formCurso} layout="vertical" onFinish={v => crearCurso.mutate(v)}>
          <Form.Item name="nombre" label="Nombre del Curso" rules={[{ required: true }]}>
            <Input placeholder="Ej. Inducción de Nuevos Empleados" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="categoria" label="Categoría">
                <Select placeholder="Categoría" allowClear>
                  {CATEGORIAS.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="modalidad" label="Modalidad" initialValue="presencial">
                <Select>
                  <Option value="presencial">Presencial</Option>
                  <Option value="virtual">Virtual</Option>
                  <Option value="mixto">Mixto</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={14}>
              <Form.Item name="instructor" label="Instructor">
                <Input placeholder="Nombre del instructor" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="duracionHoras" label="Duración (horas)" initialValue={1}>
                <InputNumber min={1} style={{ width: '100%' }} addonAfter="h" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="Objetivos y contenido del curso..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Sesión */}
      <Modal
        title="Programar Sesión"
        open={modalSesion}
        onCancel={() => setModalSesion(false)}
        onOk={() => formSesion.submit()}
        confirmLoading={crearSesion.isPending}
        okText="Programar"
        width={540}
      >
        <Form form={formSesion} layout="vertical"
          onFinish={v => crearSesion.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD') })}
        >
          <Form.Item name="cursoId" label="Curso" rules={[{ required: true }]}>
            <Select placeholder="Selecciona el curso" showSearch optionFilterProp="children">
              {cursos.map((c: any) => (
                <Option key={c.id} value={c.id}>{c.nombre}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={14}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="hora" label="Hora">
                <Input placeholder="08:00 AM" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="lugar" label="Lugar / URL">
            <Input placeholder="Sala de conferencias / https://meet.google.com/..." />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="modalidad" label="Modalidad" initialValue="presencial">
                <Select>
                  <Option value="presencial">Presencial</Option>
                  <Option value="virtual">Virtual</Option>
                  <Option value="mixto">Mixto</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="capacidadMaxima" label="Capacidad Máxima">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Sin límite" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} placeholder="Materiales, requisitos previos..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
