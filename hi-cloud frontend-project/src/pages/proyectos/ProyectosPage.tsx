import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import {
  Table, Button, Tag, Card, Row, Col, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, DatePicker, Space,
  Popconfirm, message, Drawer, Tabs, Progress, Badge, Tooltip,
  Timeline,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ClockCircleOutlined,
  ProjectOutlined, CheckSquareOutlined, WarningOutlined, FileExcelOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

// ── Constantes ────────────────────────────────────────────────────────────────

const ESTADO_PROY = [
  { value: 'planificacion', label: 'Planificación', color: 'default' },
  { value: 'activo',        label: 'Activo',         color: 'green'   },
  { value: 'en_pausa',      label: 'En pausa',       color: 'orange'  },
  { value: 'completado',    label: 'Completado',     color: 'blue'    },
  { value: 'cancelado',     label: 'Cancelado',      color: 'red'     },
];

const TIPO_FACT = [
  { value: 'precio_fijo', label: '💰 Precio fijo' },
  { value: 'por_hora',    label: '⏱️ Por hora' },
  { value: 'sin_cobro',   label: '🤝 Sin cobro' },
];

const ESTADO_TAREA = [
  { value: 'pendiente',   label: 'Pendiente',    color: '#6b7280', bg: '#f3f4f6' },
  { value: 'en_progreso', label: 'En progreso',  color: '#3b82f6', bg: '#eff6ff' },
  { value: 'revision',    label: 'Revisión',     color: '#f59e0b', bg: '#fffbeb' },
  { value: 'completada',  label: 'Completada',   color: '#10b981', bg: '#f0fdf4' },
  { value: 'cancelada',   label: 'Cancelada',    color: '#ef4444', bg: '#fef2f2' },
];

const PRIORIDAD = [
  { value: 'baja',    label: '🟢 Baja',    color: 'green'   },
  { value: 'media',   label: '🟡 Media',   color: 'gold'    },
  { value: 'alta',    label: '🟠 Alta',    color: 'orange'  },
  { value: 'urgente', label: '🔴 Urgente', color: 'red'     },
];

const d = (r: any) => r.data?.data ?? r.data;
const proyApi = {
  dashboard:       ()                   => api.get('/proyectos/dashboard').then(d),
  list:            (p = 1, e?: string)  => api.get(`/proyectos?page=${p}${e ? `&estado=${e}` : ''}`).then(d),
  crear:           (b: any)             => api.post('/proyectos', b).then(d),
  actualizar:      (id: number, b: any) => api.patch(`/proyectos/${id}`, b).then(d),
  eliminar:        (id: number)         => api.delete(`/proyectos/${id}`).then(d),
  tareas:          (id: number)         => api.get(`/proyectos/${id}/tareas`).then(d),
  crearTarea:      (b: any)             => api.post('/proyectos/tareas', b).then(d),
  actualizarTarea: (id: number, b: any) => api.patch(`/proyectos/tareas/${id}`, b).then(d),
  eliminarTarea:   (id: number)         => api.delete(`/proyectos/tareas/${id}`).then(d),
  tiempos:         (id: number, p = 1)  => api.get(`/proyectos/${id}/tiempos?page=${p}`).then(d),
  registrarTiempo: (b: any)             => api.post('/proyectos/tiempos', b).then(d),
  eliminarTiempo:  (id: number)         => api.delete(`/proyectos/tiempos/${id}`).then(d),
  // Avanzado
  gantt:           (id: number)         => api.get(`/proyectos/${id}/gantt`).then(d),
  presupuesto:     (id: number)         => api.get(`/proyectos/${id}/presupuesto`).then(d),
  addPresupuesto:  (id: number, b: any) => api.post(`/proyectos/${id}/presupuesto`, b).then(d),
  updPresupuesto:  (id: number, b: any) => api.patch(`/proyectos/presupuesto/${id}`, b).then(d),
  delPresupuesto:  (id: number)         => api.delete(`/proyectos/presupuesto/${id}`).then(d),
  hitos:           (id: number)         => api.get(`/proyectos/${id}/hitos`).then(d),
  createHito:      (id: number, b: any) => api.post(`/proyectos/${id}/hitos`, b).then(d),
  updateHito:      (id: number, b: any) => api.patch(`/proyectos/hitos/${id}`, b).then(d),
  deleteHito:      (id: number)         => api.delete(`/proyectos/hitos/${id}`).then(d),
};

// ── Kanban de tareas ──────────────────────────────────────────────────────────

function TareasKanban({ proyectoId, onUpdate }: { proyectoId: number; onUpdate: () => void }) {
  const [nuevaTareaModal, setNuevaTareaModal] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: tareas } = useQuery({
    queryKey: ['proy-tareas', proyectoId],
    queryFn:  () => proyApi.tareas(proyectoId),
  });

  const crearMut = useMutation({
    mutationFn: proyApi.crearTarea,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proy-tareas', proyectoId] });
      setNuevaTareaModal(false); form.resetFields(); onUpdate();
      message.success('Tarea creada');
    },
  });

  const moverMut = useMutation({
    mutationFn: ({ id, estado }: any) => proyApi.actualizarTarea(id, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proy-tareas', proyectoId] });
      onUpdate();
    },
  });

  const eliminarMut = useMutation({
    mutationFn: proyApi.eliminarTarea,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proy-tareas', proyectoId] });
      onUpdate();
    },
  });

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button type="primary" size="small" icon={<PlusOutlined />}
          onClick={() => { setNuevaTareaModal(true); form.resetFields(); }}>
          Nueva tarea
        </Button>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 'max-content' }}>
          {ESTADO_TAREA.map(col => {
            const colTareas = (tareas ?? []).filter((t: any) => t.estado === col.value);
            return (
              <div key={col.value} style={{ minWidth: 200, maxWidth: 220 }}>
                <div style={{
                  padding: '6px 12px', borderRadius: '8px 8px 0 0',
                  background: col.color, color: '#fff',
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <Text strong style={{ color: '#fff', fontSize: 12 }}>{col.label}</Text>
                  <Badge count={colTareas.length} style={{ background: 'rgba(255,255,255,.3)' }} />
                </div>
                <div style={{
                  background: col.bg, minHeight: 180, padding: 8,
                  border: `1px solid ${col.color}30`, borderTop: 0,
                  borderRadius: '0 0 8px 8px',
                }}>
                  {colTareas.map((t: any) => (
                    <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Card size="small" style={{ marginBottom: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Text style={{ fontSize: 12, flex: 1 }}>{t.titulo}</Text>
                          <Popconfirm title="¿Eliminar tarea?" onConfirm={() => eliminarMut.mutate(t.id)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 10 }} />} />
                          </Popconfirm>
                        </div>
                        {t.fechaVencimiento && (
                          <div>
                            <Text type={new Date(t.fechaVencimiento) < new Date() && t.estado !== 'completada' ? 'danger' : 'secondary'}
                              style={{ fontSize: 10 }}>
                              📅 {fmt.date(t.fechaVencimiento)}
                            </Text>
                          </div>
                        )}
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ESTADO_TAREA.filter(s => s.value !== col.value).map(s => (
                            <Button key={s.value} size="small"
                              style={{ fontSize: 9, padding: '0 4px', height: 18, borderColor: s.color, color: s.color }}
                              onClick={() => moverMut.mutate({ id: t.id, estado: s.value })}>
                              →{s.label}
                            </Button>
                          ))}
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal title="Nueva Tarea" open={nuevaTareaModal} onCancel={() => setNuevaTareaModal(false)} footer={null}>
        <Form form={form} layout="vertical"
          initialValues={{ prioridad: 'media', proyectoId }}
          onFinish={v => crearMut.mutate({ ...v, fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD') })}>
          <Form.Item name="proyectoId" hidden><Input /></Form.Item>
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="prioridad" label="Prioridad">
                <Select options={PRIORIDAD} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fechaVencimiento" label="Vencimiento">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="horasEstimadas" label="Horas estimadas">
                <InputNumber style={{ width: '100%' }} min={0} step={0.5} precision={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setNuevaTareaModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Registro de tiempo ────────────────────────────────────────────────────────

function RegistroTiempoPanel({ proyectoId }: { proyectoId: number }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['proy-tiempos', proyectoId],
    queryFn:  () => proyApi.tiempos(proyectoId),
  });

  const registrarMut = useMutation({
    mutationFn: proyApi.registrarTiempo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proy-tiempos', proyectoId] });
      qc.invalidateQueries({ queryKey: ['proy-list'] });
      qc.invalidateQueries({ queryKey: ['proy-dash'] });
      form.resetFields();
      message.success('Tiempo registrado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: proyApi.eliminarTiempo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proy-tiempos', proyectoId] }),
  });

  const totalHoras = (data?.data ?? []).reduce((s: number, r: any) => s + Number(r.horas), 0);

  return (
    <>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }}
        initialValues={{ fecha: dayjs() }}
        onFinish={v => registrarMut.mutate({
          proyectoId,
          fecha:       v.fecha.format('YYYY-MM-DD'),
          horas:       v.horas,
          descripcion: v.descripcion,
        })}>
        <Form.Item name="fecha" rules={[{ required: true }]}>
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="horas" rules={[{ required: true }]}>
          <InputNumber placeholder="Horas" min={0.25} max={24} step={0.5} precision={2} style={{ width: 90 }} />
        </Form.Item>
        <Form.Item name="descripcion">
          <Input placeholder="Descripción (opcional)" style={{ width: 200 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={registrarMut.isPending} icon={<ClockCircleOutlined />}>
            Registrar
          </Button>
        </Form.Item>
      </Form>

      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">Total registrado: </Text>
        <Text strong>{totalHoras.toFixed(1)} horas</Text>
      </div>

      <Table
        dataSource={data?.data ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 20, showSizeChanger: false }}
        columns={[
          { title: 'Fecha',       dataIndex: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
          { title: 'Usuario',     key: 'usr', render: (_: any, r: any) => r.usuario?.nombre ?? '—' },
          { title: 'Horas',       dataIndex: 'horas',       width: 70, render: (v: number) => <Text strong>{Number(v).toFixed(1)}</Text> },
          { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true, render: (v: string) => v ?? '—' },
          { title: '', key: 'del', width: 50,
            render: (_: any, r: any) => (
              <Popconfirm title="¿Eliminar?" onConfirm={() => eliminarMut.mutate(r.id)}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            )},
        ]}
      />
    </>
  );
}

// ── Gantt Chart ───────────────────────────────────────────────────────────────
function GanttTab({ proyectoId }: { proyectoId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['gantt', proyectoId], queryFn: () => proyApi.gantt(proyectoId) });

  if (isLoading) return <div style={{ padding: 24 }}>Cargando Gantt...</div>;
  if (!data) return null;

  const items: any[] = data.items ?? [];
  const duracion = Math.max(data.duracionTotalDias ?? 30, 1);
  const hitos: any[] = data.hitos ?? [];

  const COLORES: Record<string, string> = {
    pendiente: '#94a3b8', en_progreso: '#3b82f6',
    revision: '#f59e0b', completada: '#10b981', cancelada: '#ef4444',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: Math.max(700, duracion * 18 + 200) }}>
        {/* Header con días */}
        <div style={{ display: 'flex', marginLeft: 200, borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>
          {Array.from({ length: Math.ceil(duracion / 7) }, (_, i) => (
            <div key={i} style={{ width: 7 * 18, fontSize: 10, color: '#6b7280', borderLeft: '1px solid #f3f4f6', paddingLeft: 2, flexShrink: 0 }}>
              Sem {i + 1}
            </div>
          ))}
        </div>

        {/* Filas de tareas */}
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', height: 28, marginBottom: 4 }}>
            <div style={{ width: 200, flexShrink: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8, color: item.completada ? '#10b981' : '#111' }}>
              {item.esHito ? '🏁 ' : ''}{item.titulo}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 20 }}>
              <div style={{
                position: 'absolute',
                left: `${(item.offsetDias / duracion) * 100}%`,
                width: `${Math.max(1, (item.duraDias / duracion) * 100)}%`,
                height: '100%',
                background: COLORES[item.estado] ?? '#94a3b8',
                borderRadius: 4,
                opacity: item.completada ? 0.6 : 1,
                display: 'flex', alignItems: 'center', paddingLeft: 4,
                fontSize: 10, color: '#fff', overflow: 'hidden',
              }}>
                {item.duraDias > 5 && item.titulo}
              </div>
            </div>
          </div>
        ))}

        {/* Hitos */}
        {hitos.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', height: 24 }}>
            <div style={{ width: 200, flexShrink: 0, fontSize: 11, color: h.completado ? '#10b981' : '#7c3aed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏁 {h.nombre}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 16 }}>
              <div style={{ position: 'absolute', left: `${(h.offsetDias / duracion) * 100}%`, fontSize: 16, marginTop: -4, color: h.completado ? '#10b981' : '#7c3aed' }}>◆</div>
            </div>
          </div>
        ))}

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {Object.entries(COLORES).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 16, height: 10, background: c, borderRadius: 2 }} />
              {k.replace('_', ' ')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Presupuesto ────────────────────────────────────────────────────────────────
function PresupuestoTab({ proyectoId, presupuestoBase }: { proyectoId: number; presupuestoBase: number }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['presupuesto', proyectoId], queryFn: () => proyApi.presupuesto(proyectoId) });

  const addMut = useMutation({
    mutationFn: (b: any) => proyApi.addPresupuesto(proyectoId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuesto', proyectoId] }); setOpen(false); form.resetFields(); message.success('Línea agregada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: proyApi.delPresupuesto,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuesto', proyectoId] }); message.success('Eliminada'); },
  });

  const CATEGORIA_LABEL: Record<string, string> = {
    mano_obra: '👷 Mano de Obra', materiales: '📦 Materiales',
    subcontratista: '🤝 Subcontratista', gastos_viaje: '✈️ Viajes',
    licencias: '📄 Licencias', otro: '📋 Otro',
  };

  const cols = [
    { title: 'Categoría', dataIndex: 'categoria', width: 150, render: (v: string) => CATEGORIA_LABEL[v] ?? v },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Presupuestado', dataIndex: 'monto', width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Real', dataIndex: 'montoReal', width: 130, render: (v: number, r: any) => (
      <Text style={{ color: Number(v) > Number(r.monto) ? '#dc2626' : '#52c41a' }}>{fmt.money(v)}</Text>
    ) },
    { title: 'Variación', key: 'var', width: 120,
      render: (_: any, r: any) => { const v = Number(r.monto) - Number(r.montoReal); return <Text style={{ color: v >= 0 ? '#52c41a' : '#dc2626' }}>{v >= 0 ? '+' : ''}{fmt.money(v)}</Text>; } },
    { title: '', key: 'del', width: 60,
      render: (_: any, r: any) => <Popconfirm title="¿Eliminar?" onConfirm={() => delMut.mutate(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Presupuesto base', value: presupuestoBase, color: '#1677ff' },
          { label: 'Total presupuestado (líneas)', value: data?.totalPresupuestado ?? 0, color: '#7c3aed' },
          { label: 'Total real ejecutado', value: data?.totalReal ?? 0, color: data?.totalReal > data?.totalPresupuestado ? '#dc2626' : '#52c41a' },
          { label: '% Ejecución', value: data?.porcentajeEjecucion ?? 0, suffix: '%', color: '#fa8c16' },
        ].map(k => (
          <Col xs={12} md={6} key={k.label}>
            <Card size="small"><Statistic title={k.label} value={k.value} suffix={k.suffix}
              formatter={v => k.suffix ? String(v) : fmt.money(Number(v))} valueStyle={{ color: k.color, fontSize: 14 }} /></Card>
          </Col>
        ))}
      </Row>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Agregar línea</Button>
      </Row>
      <Table columns={cols} dataSource={data?.lineas ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />

      <Modal title="Nueva línea de presupuesto" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={480}>
        <Form form={form} layout="vertical" onFinish={(v) => addMut.mutate(v)}>
          <Form.Item name="categoria" label="Categoría" rules={[{ required: true }]}>
            <Select options={Object.entries(CATEGORIA_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="monto" label="Monto presupuestado (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="montoReal" label="Monto real ejecutado (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={addMut.isPending}>Agregar</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Hitos ─────────────────────────────────────────────────────────────────────
function HitosTab({ proyectoId, fechaInicio }: { proyectoId: number; fechaInicio?: string }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: hitos, isLoading } = useQuery({ queryKey: ['hitos', proyectoId], queryFn: () => proyApi.hitos(proyectoId) });

  const crearMut = useMutation({
    mutationFn: (b: any) => proyApi.createHito(proyectoId, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hitos', proyectoId] }); qc.invalidateQueries({ queryKey: ['gantt', proyectoId] }); setOpen(false); form.resetFields(); message.success('Hito creado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const completarMut = useMutation({
    mutationFn: ({ id, completado }: { id: number; completado: boolean }) => proyApi.updateHito(id, { completado }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hitos', proyectoId] }); qc.invalidateQueries({ queryKey: ['gantt', proyectoId] }); },
  });
  const delMut = useMutation({
    mutationFn: proyApi.deleteHito,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hitos', proyectoId] }); qc.invalidateQueries({ queryKey: ['gantt', proyectoId] }); },
  });

  const hoy = dayjs();

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Nuevo hito</Button>
      </Row>

      <Timeline
        items={(hitos ?? []).map((h: any) => {
          const fecha = dayjs(h.fecha);
          const vencido = !h.completado && fecha.isBefore(hoy);
          return {
            color: h.completado ? 'green' : vencido ? 'red' : 'blue',
            children: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Text strong style={{ color: h.completado ? '#10b981' : vencido ? '#dc2626' : '#111' }}>
                    {h.completado ? '✅ ' : vencido ? '⚠️ ' : '🏁 '}{h.nombre}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{fecha.format('DD/MM/YYYY')}</Text>
                  {h.descripcion && <><br /><Text style={{ fontSize: 12 }}>{h.descripcion}</Text></>}
                  {h.completado && h.fechaCompletado && (
                    <><br /><Text type="secondary" style={{ fontSize: 11 }}>Completado: {dayjs(h.fechaCompletado).format('DD/MM/YYYY')}</Text></>
                  )}
                </div>
                <Space size={4}>
                  {!h.completado && (
                    <Button size="small" type="primary" onClick={() => completarMut.mutate({ id: h.id, completado: true })}>Completar</Button>
                  )}
                  <Popconfirm title="¿Eliminar hito?" onConfirm={() => delMut.mutate(h.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            ),
          };
        })}
      />

      {(!hitos || hitos.length === 0) && !isLoading && (
        <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
          Sin hitos definidos. Agrega fechas clave del proyecto.
        </div>
      )}

      <Modal title="Nuevo hito" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={420}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Form.Item name="nombre" label="Nombre del hito" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Page principal ────────────────────────────────────────────────────────────

export default function ProyectosPage() {
  const [page,      setPage]      = useState(1);
  const [estadoF,   setEstadoF]   = useState<string | undefined>('activo');
  const [crearOpen, setCrearOpen] = useState(false);
  const [detalle,   setDetalle]   = useState<any>(null);
  const [editando,  setEditando]  = useState(false);
  const [formProy]                = Form.useForm();
  const [formEdit]                = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }    = useQuery({ queryKey: ['proy-dash'],              queryFn: proyApi.dashboard });
  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['proy-list', page, estadoF],
    queryFn:  () => proyApi.list(page, estadoF),
  });

  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Proyectos & Servicios" planMinimo={config.planMinimo} planActual={plan} />;

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['proy-list'] });
    qc.invalidateQueries({ queryKey: ['proy-dash'] });
  };

  const crearMut = useMutation({
    mutationFn: proyApi.crear,
    onSuccess: () => { inv(); setCrearOpen(false); formProy.resetFields(); message.success('Proyecto creado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const actualizarMut = useMutation({
    mutationFn: ({ id, data }: any) => proyApi.actualizar(id, data),
    onSuccess: (updated) => {
      inv();
      setDetalle(updated);
      setEditando(false);
      message.success('Guardado');
    },
  });

  const eliminarMut = useMutation({
    mutationFn: proyApi.eliminar,
    onSuccess: () => { inv(); setDetalle(null); message.success('Eliminado'); },
  });

  const cols = [
    { title: 'Nombre',      dataIndex: 'nombre',    ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setDetalle(r)}>{v}</Button>
      )},
    { title: 'Estado',      dataIndex: 'estado',    width: 120,
      render: (v: string) => {
        const e = ESTADO_PROY.find(s => s.value === v);
        return <Tag color={e?.color}>{e?.label ?? v}</Tag>;
      }},
    { title: 'Avance',      dataIndex: 'avance',    width: 140,
      render: (v: number) => <Progress percent={v} size="small" steps={10} /> },
    { title: 'Presupuesto', dataIndex: 'presupuesto', width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Horas reg.',  dataIndex: 'horasRegistradas', width: 90,
      render: (v: number) => `${Number(v ?? 0).toFixed(1)} h` },
    { title: 'Vence',       dataIndex: 'fechaFin',  width: 100,
      render: (v: string) => v ? (
        <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'}>{fmt.date(v)}</Text>
      ) : '—' },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar proyecto?" onConfirm={() => eliminarMut.mutate(r.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Gestión de Proyectos</Title></Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (proyectos?.data ?? []).map((p: any) => ({
                'Código':      p.codigo ?? '',
                'Nombre':      p.nombre ?? '',
                'Cliente':     p.cliente?.nombre ?? '',
                'Responsable': p.responsable?.nombre ?? p.gerente ?? '',
                'Estado':      p.estado ?? '',
                'Avance':      `${Number(p.avance ?? p.porcentaje ?? 0)}%`,
                'Presupuesto': Number(p.presupuesto ?? 0),
                'Inicio':      p.fechaInicio ?? '',
                'Fin':         p.fechaFin ?? '',
              }));
              exportarExcel(filas, 'Proyectos');
            }}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCrearOpen(true); formProy.resetFields(); }}>
              Nuevo proyecto
            </Button>
          </Space>
        </Col>
      </Row>

      <Card extra={
        <Select placeholder="Estado" allowClear value={estadoF} onChange={v => { setEstadoF(v); setPage(1); }}
          style={{ width: 140 }}
          options={ESTADO_PROY.map(e => ({ value: e.value, label: <Tag color={e.color}>{e.label}</Tag> }))} />
      }>
        <Table columns={cols} dataSource={proyectos?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: proyectos?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Drawer detalle */}
      <Drawer
        title={detalle?.nombre}
        open={!!detalle}
        onClose={() => { setDetalle(null); setEditando(false); }}
        width={700}
        extra={
          <Space>
            <Button size="small" onClick={() => {
              setEditando(!editando);
              if (!editando && detalle) {
                formEdit.setFieldsValue({
                  ...detalle,
                  fechaInicio: detalle.fechaInicio ? dayjs(detalle.fechaInicio) : undefined,
                  fechaFin:    detalle.fechaFin    ? dayjs(detalle.fechaFin)    : undefined,
                });
              }
            }}>
              {editando ? 'Cancelar' : 'Editar'}
            </Button>
            <Popconfirm title="¿Eliminar proyecto?" onConfirm={() => eliminarMut.mutate(detalle?.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        }
      >
        {detalle && !editando && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12}>
                <Progress type="circle" percent={detalle.avance} width={80} />
              </Col>
              <Col xs={24} sm={12}>
                <div><Text type="secondary">Presupuesto:</Text> <Text strong>{fmt.money(detalle.presupuesto)}</Text></div>
                <div><Text type="secondary">Costo real:</Text> <Text strong style={{ color: detalle.costReal > detalle.presupuesto ? '#ef4444' : '#10b981' }}>{fmt.money(detalle.costReal ?? 0)}</Text></div>
                <div><Text type="secondary">Horas estimadas:</Text> <Text strong>{detalle.horasEstimadas}h</Text></div>
                <div><Text type="secondary">Horas registradas:</Text> <Text strong>{Number(detalle.horasRegistradas ?? 0).toFixed(1)}h</Text></div>
              </Col>
            </Row>

            <Tabs items={[
              { key: 'tareas', label: <><CheckSquareOutlined /> Tareas</>,
                children: <TareasKanban proyectoId={detalle.id} onUpdate={inv} /> },
              { key: 'tiempo', label: <><ClockCircleOutlined /> Tiempo</>,
                children: <RegistroTiempoPanel proyectoId={detalle.id} /> },
              { key: 'gantt',  label: <>📅 Gantt</>,
                children: <GanttTab proyectoId={detalle.id} /> },
              { key: 'presupuesto', label: <>💰 Presupuesto</>,
                children: <PresupuestoTab proyectoId={detalle.id} presupuestoBase={Number(detalle.presupuesto ?? 0)} /> },
              { key: 'hitos', label: <>🏁 Hitos</>,
                children: <HitosTab proyectoId={detalle.id} fechaInicio={detalle.fechaInicio} /> },
            ]} />
          </>
        )}

        {detalle && editando && (
          <Form form={formEdit} layout="vertical"
            onFinish={v => actualizarMut.mutate({
              id: detalle.id,
              data: {
                ...v,
                fechaInicio: v.fechaInicio?.format('YYYY-MM-DD'),
                fechaFin:    v.fechaFin?.format('YYYY-MM-DD'),
              },
            })}>
            <Row gutter={12}>
              <Col span={24}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="estado" label="Estado">
                <Select options={ESTADO_PROY.map(e => ({ value: e.value, label: e.label }))} />
              </Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="tipoFacturacion" label="Facturación">
                <Select options={TIPO_FACT} />
              </Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="fechaInicio" label="Inicio"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="fechaFin"    label="Fin"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="presupuesto" label="Presupuesto (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="horasEstimadas" label="Horas estimadas"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="tarifaHora" label="Tarifa/hora (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="porcentajeAvance" label="Avance (%)"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
              <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
            </Row>
            <Row justify="end" gutter={8}>
              <Col><Button onClick={() => setEditando(false)}>Cancelar</Button></Col>
              <Col><Button type="primary" htmlType="submit" loading={actualizarMut.isPending}>Guardar</Button></Col>
            </Row>
          </Form>
        )}
      </Drawer>

      {/* Modal nuevo proyecto */}
      <Modal title="Nuevo Proyecto" open={crearOpen} onCancel={() => setCrearOpen(false)} footer={null} width={620}>
        <Form form={formProy} layout="vertical"
          initialValues={{ tipoFacturacion: 'precio_fijo', estado: 'planificacion', presupuesto: 0, horasEstimadas: 0 }}
          onFinish={v => crearMut.mutate({
            ...v,
            fechaInicio: v.fechaInicio.format('YYYY-MM-DD'),
            fechaFin:    v.fechaFin?.format('YYYY-MM-DD'),
          })}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="nombre" label="Nombre del proyecto" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="estado" label="Estado">
              <Select options={ESTADO_PROY.map(e => ({ value: e.value, label: e.label }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipoFacturacion" label="Tipo de facturación">
              <Select options={TIPO_FACT} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaInicio" label="Inicio" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaFin"    label="Fin estimado"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="presupuesto" label="Presupuesto (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="horasEstimadas" label="Horas estimadas"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tarifaHora" label="Tarifa/hora"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear proyecto</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
