import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Typography, Select, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, InputNumber, Tabs,
  Popconfirm, message, Steps, Progress, Drawer, Alert,
  Descriptions, Badge, Switch, Spin, theme } from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined,
  CheckCircleOutlined, StopOutlined, ToolOutlined, AppstoreOutlined,
  ExclamationCircleOutlined, FileExcelOutlined, ClockCircleOutlined,
  SettingOutlined, NodeIndexOutlined, CloseOutlined, EyeOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;
const mApi = {
  dashboard:          ()               => api.get('/manufactura/dashboard').then(d),
  listLM:             ()               => api.get('/manufactura/lm').then(d),
  getLM:              (id: number)     => api.get(`/manufactura/lm/${id}`).then(d),
  crearLM:            (b: any)         => api.post('/manufactura/lm', b).then(d),
  actualizarLM:       (id: number, b: any) => api.patch(`/manufactura/lm/${id}`, b).then(d),
  eliminarLM:         (id: number)     => api.delete(`/manufactura/lm/${id}`).then(d),
  agregarComp:        (id: number, b: any) => api.post(`/manufactura/lm/${id}/componentes`, b).then(d),
  eliminarComp:       (id: number)     => api.delete(`/manufactura/componentes/${id}`).then(d),
  listOrdenes:        (p = 1, e?: string) =>
    api.get(`/manufactura/ordenes?page=${p}${e ? `&estado=${e}` : ''}`).then(d),
  getOrden:           (id: number)     => api.get(`/manufactura/ordenes/${id}`).then(d),
  crearOrden:         (b: any)         => api.post('/manufactura/ordenes', b).then(d),
  cambiarEstado:      (id: number, estado: string, cant?: number) =>
    api.patch(`/manufactura/ordenes/${id}/estado`, { estado, cantidadProducida: cant }).then(d),
  eliminarOrden:      (id: number)     => api.delete(`/manufactura/ordenes/${id}`).then(d),
  // Avanzado
  getCentros:         ()               => api.get('/manufactura/centros').then(d),
  crearCentro:        (b: any)         => api.post('/manufactura/centros', b).then(d),
  updateCentro:       (id: number, b: any) => api.patch(`/manufactura/centros/${id}`, b).then(d),
  getRutas:           ()               => api.get('/manufactura/rutas').then(d),
  crearRuta:          (b: any)         => api.post('/manufactura/rutas', b).then(d),
  agregarEtapa:       (id: number, b: any) => api.post(`/manufactura/rutas/${id}/etapas`, b).then(d),
  deleteEtapa:        (id: number)     => api.delete(`/manufactura/etapas/${id}`).then(d),
  getWIPResumen:      ()               => api.get('/manufactura/wip/resumen').then(d),
  getWIPOrden:        (id: number)     => api.get(`/manufactura/ordenes/${id}/wip`).then(d),
  asignarRuta:        (ordenId: number, rutaId: number) =>
    api.post(`/manufactura/ordenes/${ordenId}/asignar-ruta/${rutaId}`, {}).then(d),
  avanzarEtapa:       (regId: number, b: any) =>
    api.patch(`/manufactura/registros-etapa/${regId}/avanzar`, b).then(d),
};

// ── Centros de Trabajo ─────────────────────────────────────────────────────────
function CentrosTrabajoTab() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: centros, isLoading } = useQuery({ queryKey: ['mfg-centros'], queryFn: mApi.getCentros });

  const crearMut = useMutation({
    mutationFn: editing ? (b: any) => mApi.updateCentro(editing.id, b) : mApi.crearCentro,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mfg-centros'] }); setOpen(false); setEditing(null); form.resetFields(); message.success(editing ? 'Actualizado' : 'Centro creado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Tipo', dataIndex: 'tipo', width: 120,
      render: (v: string) => <Tag color={v === 'maquina' ? 'blue' : v === 'subcontratado' ? 'purple' : 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Cap./día', dataIndex: 'capacidadHorasDia', width: 90, render: (v: number) => `${v}h` },
    { title: 'Costo/hora', dataIndex: 'costoHora', width: 110, render: (v: number) => fmt.money(v) },
    { title: 'Responsable', dataIndex: 'responsable', width: 140, render: (v: string) => v ?? '—' },
    { title: 'Ubicación', dataIndex: 'ubicacion', ellipsis: true, render: (v: string) => v ?? '—' },
    { title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setOpen(true); }} /> },
  ];

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>Nuevo centro</Button>
      </Row>
      <Table columns={cols} dataSource={centros ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 15 }} />
      <Modal title={editing ? 'Editar centro de trabajo' : 'Nuevo centro de trabajo'} open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={[{ value: 'manual', label: 'Manual' }, { value: 'maquina', label: 'Máquina' }, { value: 'subcontratado', label: 'Subcontratado' }]} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="capacidadHorasDia" label="Horas/día" initialValue={8}><InputNumber style={{ width: '100%' }} min={0} precision={1} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="costoHora" label="Costo/hora (RD$)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="responsable" label="Responsable"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="ubicacion" label="Ubicación"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); setEditing(null); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>{editing ? 'Actualizar' : 'Crear'}</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Rutas de Producción ────────────────────────────────────────────────────────
function RutasTab({ lms }: { lms: any[] }) {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [formRuta] = Form.useForm();
  const [formEtapa] = Form.useForm();
  const qc = useQueryClient();

  const { data: rutas, isLoading } = useQuery({ queryKey: ['mfg-rutas'], queryFn: mApi.getRutas });
  const { data: centros } = useQuery({ queryKey: ['mfg-centros'], queryFn: mApi.getCentros });

  const crearMut = useMutation({
    mutationFn: mApi.crearRuta,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mfg-rutas'] }); setOpen(false); formRuta.resetFields(); message.success('Ruta creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const agregarEtapaMut = useMutation({
    mutationFn: ({ rutaId, body }: { rutaId: number; body: any }) => mApi.agregarEtapa(rutaId, body),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['mfg-rutas'] });
      if (detalle) { const updated = await mApi.getRutas(); const r = (updated ?? []).find((x: any) => x.id === detalle.id); setDetalle(r); }
      formEtapa.resetFields();
      message.success('Etapa agregada');
    },
  });
  const deleteEtapaMut = useMutation({
    mutationFn: mApi.deleteEtapa,
    onSuccess: async () => { qc.invalidateQueries({ queryKey: ['mfg-rutas'] }); if (detalle) { const updated = await mApi.getRutas(); const r = (updated ?? []).find((x: any) => x.id === detalle.id); setDetalle(r); } },
  });

  const centroOpts = (centros ?? []).map((c: any) => ({ value: c.id, label: c.nombre }));
  const lmOpts = lms.map((l: any) => ({ value: l.id, label: `${l.codigo} — ${l.nombre}` }));

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 100, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'BOM vinculada', dataIndex: 'listaId', width: 150, render: (v: number) => v ? lms.find(l => l.id === v)?.nombre ?? `#${v}` : '—' },
    { title: 'Etapas', key: 'etapas', width: 70, render: (_: any, r: any) => r.etapas?.length ?? 0 },
    { title: '', key: 'ver', width: 80, render: (_: any, r: any) => <Button size="small" onClick={() => setDetalle(r)}>Ver</Button> },
  ];

  const etapaCols = [
    { title: 'Ord.', dataIndex: 'orden', width: 50 },
    { title: 'Etapa', dataIndex: 'nombre', ellipsis: true },
    { title: 'Centro', key: 'ct', render: (_: any, r: any) => r.centroTrabajo?.nombre ?? '—' },
    { title: 'Setup (min)', dataIndex: 'tiempoSetupMin', width: 100 },
    { title: 'Oper. (min/u)', dataIndex: 'tiempoOperacionMinPorUnidad', width: 110 },
    { title: 'Control', dataIndex: 'esControl', width: 70, render: (v: boolean) => v ? <Tag color="purple">QC</Tag> : null },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => <Popconfirm title="¿Eliminar etapa?" onConfirm={() => deleteEtapaMut.mutate(r.id)}><Button size="small" danger icon={<CloseOutlined />} /></Popconfirm> },
  ];

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { formRuta.resetFields(); setOpen(true); }}>Nueva ruta</Button>
      </Row>
      <Table columns={cols} dataSource={rutas ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />

      <Modal title="Nueva Ruta de Producción" open={open} onCancel={() => { setOpen(false); formRuta.resetFields(); }} footer={null} width={480}>
        <Form form={formRuta} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="listaId" label="BOM asociada (opcional)"><Select options={lmOpts} allowClear placeholder="Sin BOM" /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); formRuta.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear ruta</Button></Col></Row>
        </Form>
      </Modal>

      <Drawer title={`Ruta: ${detalle?.nombre}`} open={!!detalle} onClose={() => setDetalle(null)} width={700}>
        {detalle && (
          <>
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={[...(detalle.etapas ?? [])].sort((a: any, b: any) => a.orden - b.orden)}
              rowKey="id" columns={etapaCols} pagination={false} style={{ marginBottom: 16 }} />
            <Typography.Title level={5}>Agregar etapa</Typography.Title>
            <Form form={formEtapa} layout="vertical" onFinish={(v) => agregarEtapaMut.mutate({ rutaId: detalle.id, body: v })}>
              <Row gutter={12}>
                <Col xs={12} sm={4}><Form.Item name="orden" label="Orden" rules={[{ required: true }]} initialValue={(detalle.etapas?.length ?? 0) + 1}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
                <Col xs={24} sm={8}><Form.Item name="centroTrabajoId" label="Centro de trabajo"><Select options={centroOpts} allowClear /></Form.Item></Col>
                <Col xs={12} sm={6}><Form.Item name="tiempoSetupMin" label="Setup (min)" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
                <Col xs={12} sm={6}><Form.Item name="tiempoOperacionMinPorUnidad" label="Oper./unidad" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
                <Col xs={12} sm={6}><Form.Item name="esControl" label="¿Control QC?" valuePropName="checked" initialValue={false}><Switch /></Form.Item></Col>
                <Col xs={12} sm={6} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                  <Button type="primary" htmlType="submit" loading={agregarEtapaMut.isPending} icon={<PlusOutlined  />} block>Agregar</Button>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Drawer>
    </>
  );
}

// ── WIP Tab ────────────────────────────────────────────────────────────────────
function WIPTab() {
  const [wipOrden, setWipOrden] = useState<any>(null);
  const [asignarRutaModal, setAsignarRutaModal] = useState<any>(null);
  const qc = useQueryClient();

  const { data: wipResumen, isLoading } = useQuery({ queryKey: ['mfg-wip-resumen'], queryFn: mApi.getWIPResumen });
  const { data: wipDetalle, isLoading: loadWip } = useQuery({
    queryKey: ['mfg-wip-orden', wipOrden?.id],
    queryFn: () => mApi.getWIPOrden(wipOrden.id),
    enabled: !!wipOrden,
    refetchInterval: 10_000,
  });
  const { data: rutas } = useQuery({ queryKey: ['mfg-rutas'], queryFn: mApi.getRutas });

  const asignarMut = useMutation({
    mutationFn: ({ ordenId, rutaId }: { ordenId: number; rutaId: number }) => mApi.asignarRuta(ordenId, rutaId),
    onSuccess: (data) => { setAsignarRutaModal(null); setWipOrden(data?.orden ?? wipOrden); qc.invalidateQueries({ queryKey: ['mfg-wip-resumen'] }); message.success('Ruta asignada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const avanzarMut = useMutation({
    mutationFn: ({ regId, body }: { regId: number; body: any }) => mApi.avanzarEtapa(regId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mfg-wip-orden', wipOrden?.id] }); message.success('Estado actualizado'); },
  });

  const ESTADO_ETAPA_COLOR: Record<string, string> = {
    pendiente: 'default', en_proceso: 'orange', completada: 'green', omitida: 'gray', rechazada: 'red',
  };

  const cols = [
    { title: 'Orden', key: 'num', render: (_: any, r: any) => <Text code strong>{r.orden?.numero}</Text> },
    { title: 'Producto', key: 'prod', render: (_: any, r: any) => r.orden?.lista?.nombre ?? '—' },
    { title: 'Progreso', dataIndex: 'progreso', width: 160,
      render: (v: number, r: any) => r.totalEtapas > 0
        ? <Progress percent={v} size="small" format={p => `${p}%`} />
        : <Tag>Sin ruta</Tag> },
    { title: 'Avance', key: 'det', width: 80,
      render: (_: any, r: any) => r.totalEtapas > 0 ? `${r.completadas}/${r.totalEtapas}` : '—' },
    { title: '', key: 'acc', width: 160,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setWipOrden(r.orden)}>WIP</Button>
          <Button size="small" onClick={() => setAsignarRutaModal(r.orden)}>Asignar ruta</Button>
        </Space>
      ) },
  ];

  return (
    <>
      {(wipResumen?.ordenesEnProceso ?? []).length === 0 && !isLoading && (
        <Alert type="info" showIcon message="No hay órdenes en proceso actualmente." style={{ marginBottom: 12 }} />
      )}
      <Table columns={cols} dataSource={wipResumen?.ordenesEnProceso ?? []} rowKey={r => r.orden?.id} loading={isLoading} size="small" pagination={{ pageSize: 10 }} 
        scroll={{ x: 'max-content' }} />

      {/* Modal WIP detalle */}
      <Modal title={`WIP — Orden ${wipOrden?.numero}`} open={!!wipOrden} onCancel={() => setWipOrden(null)} footer={null} width={780}>
        {loadWip && <Spin />}
        {wipDetalle && (
          <>
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={8}><Statistic title="Progreso" value={wipDetalle.progreso} suffix="%" /></Col>
              <Col xs={24} sm={8}><Statistic title="Etapas" value={`${wipDetalle.completadas}/${wipDetalle.totalEtapas}`} /></Col>
              <Col xs={24} sm={8}><Statistic title="Etapa actual" value={wipDetalle.etapaActual} /></Col>
            </Row>
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={wipDetalle.registros ?? []} rowKey="id"
              columns={[
                { title: 'Ord.', dataIndex: 'ordenEtapa', width: 50 },
                { title: 'Etapa', key: 'nombre', render: (_: any, r: any) => r.etapa?.nombre },
                { title: 'Centro', key: 'ct', render: (_: any, r: any) => r.etapa?.centroTrabajo?.nombre ?? '—' },
                { title: 'Estado', dataIndex: 'estado', width: 110,
                  render: (v: string) => <Tag color={ESTADO_ETAPA_COLOR[v]}>{v?.replace('_',' ').toUpperCase()}</Tag> },
                { title: 'Inicio', dataIndex: 'fechaInicio', width: 130,
                  render: (v: string) => v ? new Date(v).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—' },
                { title: '', key: 'acc', width: 160,
                  render: (_: any, r: any) => (
                    <Space size={4}>
                      {r.estado === 'pendiente' && <Button size="small" type="primary" onClick={() => avanzarMut.mutate({ regId: r.id, body: { estado: 'en_proceso' } })}>Iniciar</Button>}
                      {r.estado === 'en_proceso' && <Button size="small" style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }} onClick={() => avanzarMut.mutate({ regId: r.id, body: { estado: 'completada' } })}>Completar</Button>}
                      {r.estado === 'en_proceso' && <Button size="small" danger onClick={() => avanzarMut.mutate({ regId: r.id, body: { estado: 'rechazada' } })}>Rechazar</Button>}
                    </Space>
                  ) },
              ]} />
          </>
        )}
      </Modal>

      {/* Modal asignar ruta */}
      <Modal title={`Asignar ruta a orden ${asignarRutaModal?.numero}`} open={!!asignarRutaModal}
        onCancel={() => setAsignarRutaModal(null)} footer={null} width={420}>
        <Select placeholder="Seleccionar ruta" style={{ width: '100%', marginBottom: 12 }}
          options={(rutas ?? []).map((r: any) => ({ value: r.id, label: `${r.codigo} — ${r.nombre} (${r.etapas?.length ?? 0} etapas)` }))}
          onChange={(rutaId) => asignarMut.mutate({ ordenId: asignarRutaModal.id, rutaId })} />
        <Alert type="info" showIcon message="Al asignar una ruta se crearán los registros WIP de cada etapa en estado PENDIENTE." style={{ fontSize: 12 }} />
      </Modal>
    </>
  );
}

const ESTADO_OP = [
  { value: 'borrador',    label: 'Borrador',    color: 'default', step: 0 },
  { value: 'planificada', label: 'Planificada', color: 'blue',    step: 1 },
  { value: 'en_proceso',  label: 'En proceso',  color: 'orange',  step: 2 },
  { value: 'completada',  label: 'Completada',  color: 'green',   step: 3 },
  { value: 'cancelada',   label: 'Cancelada',   color: 'red',     step: -1 },
];

export default function ManufacturaPage() {
  const { token } = theme.useToken();
  const [tabKey,      setTabKey]      = useState('lm');
  const [lmModal,     setLMModal]     = useState(false);
  const [compModal,   setCompModal]   = useState<number | null>(null);
  const [ordenModal,  setOrdenModal]  = useState(false);
  const [detalleOP,   setDetalleOP]   = useState<any>(null);
  const [completarModal, setCompletarModal] = useState<any>(null);
  const [pageOP,      setPageOP]      = useState(1);
  const [estadoF,     setEstadoF]     = useState<string | undefined>();
  const [formLM]                      = Form.useForm();
  const [formComp]                    = Form.useForm();
  const [formOP]                      = Form.useForm();
  const [formCompletar]               = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }   = useQuery({ queryKey: ['mfg-dash'],           queryFn: mApi.dashboard });
  const { data: lms }    = useQuery({ queryKey: ['mfg-lm'],             queryFn: mApi.listLM });
  const { data: ordenes, isLoading: loadOP } = useQuery({
    queryKey: ['mfg-ordenes', pageOP, estadoF],
    queryFn:  () => mApi.listOrdenes(pageOP, estadoF),
  });
  const { data: productos } = useQuery({ queryKey: ['productos-mfg'], queryFn: () => productosApi.list(1, 200) });
  const { data: lmDetalle, refetch: refetchLM } = useQuery({
    queryKey: ['mfg-lm-det', compModal],
    queryFn:  () => mApi.getLM(compModal!),
    enabled:  !!compModal,
  });
  const { data: opDetalle } = useQuery({
    queryKey: ['mfg-op', detalleOP?.id],
    queryFn:  () => mApi.getOrden(detalleOP!.id),
    enabled:  !!detalleOP,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['mfg-lm'] });
    qc.invalidateQueries({ queryKey: ['mfg-ordenes'] });
    qc.invalidateQueries({ queryKey: ['mfg-dash'] });
  };

  const crearLMMut = useMutation({
    mutationFn: mApi.crearLM,
    onSuccess: () => { inv(); setLMModal(false); formLM.resetFields(); message.success('Lista de materiales creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const elimLMMut = useMutation({
    mutationFn: mApi.eliminarLM,
    onSuccess: () => { inv(); message.success('Eliminada'); },
  });

  const agregarCompMut = useMutation({
    mutationFn: ({ listaId, data }: any) => mApi.agregarComp(listaId, data),
    onSuccess: () => { refetchLM(); formComp.resetFields(); message.success('Componente agregado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const elimCompMut = useMutation({
    mutationFn: mApi.eliminarComp,
    onSuccess: () => { refetchLM(); message.success('Eliminado'); },
  });

  const crearOPMut = useMutation({
    mutationFn: mApi.crearOrden,
    onSuccess: () => { inv(); setOrdenModal(false); formOP.resetFields(); message.success('Orden creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const estadoOPMut = useMutation({
    mutationFn: ({ id, estado, cant }: any) => mApi.cambiarEstado(id, estado, cant),
    onSuccess: () => {
      inv();
      qc.invalidateQueries({ queryKey: ['mfg-op'] });
      setCompletarModal(null);
      setDetalleOP(null);
      message.success('Estado actualizado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const prodOpts = productos?.data.map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` })) ?? [];

  const colsLM = [
    { title: 'Código',       dataIndex: 'codigo',         width: 100, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Nombre',       dataIndex: 'nombre',         ellipsis: true },
    { title: 'Rendimiento',  dataIndex: 'rendimiento',    width: 100, render: (v: number, r: any) => `${v} ${r.unidadRendimiento}` },
    { title: 'Estado',       dataIndex: 'activa',         width: 90, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
    { title: '', key: 'actions', width: 100,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<AppstoreOutlined />}
            onClick={() => setCompModal(r.id)}>Ver BOM</Button>
          <Popconfirm title="¿Eliminar?" onConfirm={() => elimLMMut.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  const COLS_DEF_OP = [
    { key: 'numero',             label: 'Número',   defaultVisible: true  },
    { key: 'prod',               label: 'Producto', defaultVisible: true  },
    { key: 'cantidadPlanificada',label: 'Cantidad', defaultVisible: true  },
    { key: 'fechaInicio',        label: 'Inicio',   defaultVisible: true  },
    { key: 'estado',             label: 'Estado',   defaultVisible: true  },
  ];
  const { visibleColumns: visibleColumnsOP, updateVisibility: updateVisibilityOP, filterColumns: filterColumnsOP } = useColumnVisibility('manufactura', COLS_DEF_OP);

  const colsOP = [
    { title: 'Número',    dataIndex: 'numero',             key: 'numero',              width: 130, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Producto',  key: 'prod',                     ellipsis: true, render: (_: any, r: any) => r.lista?.nombre ?? '—' },
    { title: 'Cantidad',  dataIndex: 'cantidadPlanificada',key: 'cantidadPlanificada', width: 100 },
    { title: 'Inicio',    dataIndex: 'fechaInicio',        key: 'fechaInicio',          width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Estado',    dataIndex: 'estado',             key: 'estado',               width: 120,
      render: (v: string) => {
        const e = ESTADO_OP.find(x => x.value === v);
        return <Tag color={e?.color}>{e?.label ?? v}</Tag>;
      }},
    { title: '', key: 'actions', width: 160,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" onClick={() => setDetalleOP(r)}>Detalle</Button>
          {r.estado === 'borrador' && (
            <Button size="small" type="primary"
              onClick={() => estadoOPMut.mutate({ id: r.id, estado: 'planificada' })}>
              Planificar
            </Button>
          )}
          {r.estado === 'planificada' && (
            <Button size="small" style={{ background: '#f59e0b', border: 'none', color: '#fff' }}
              onClick={() => estadoOPMut.mutate({ id: r.id, estado: 'en_proceso' })}>
              <PlayCircleOutlined /> Iniciar
            </Button>
          )}
          {r.estado === 'en_proceso' && (
            <Button size="small" type="primary" style={{ background: '#10b981', border: 'none' }}
              onClick={() => { setCompletarModal(r); formCompletar.setFieldsValue({ cantidadProducida: r.cantidadPlanificada }); }}>
              <CheckCircleOutlined /> Completar
            </Button>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
            Manufactura & Producción
          </Title>
        </Col>
        <Col>
          {tabKey === 'ordenes' && (
            <ColumnToggle columns={COLS_DEF_OP} visibleColumns={visibleColumnsOP} onChange={updateVisibilityOP} />
          )}
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const rows = tabKey === 'lm' ? (lms?.data ?? lms ?? []) : (ordenes?.data ?? ordenes ?? []);
            const filas = rows.map((r: any) => ({
              'Código':     r.codigo ?? r.numero ?? '',
              'Nombre':     r.nombre ?? r.producto?.nombre ?? '',
              'Cantidad':   Number(r.cantidad ?? r.cantidadPlanificada ?? 0),
              'Estado':     r.estado ?? '',
              'Fecha':      r.fechaInicio ?? r.createdAt ?? '',
            }));
            exportarExcel(filas, `Manufactura-${tabKey === 'lm' ? 'BOM' : 'Ordenes'}`);
          }}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => tabKey === 'lm' ? setLMModal(true) : setOrdenModal(true)}>
            {tabKey === 'lm' ? 'Nueva lista BOM' : 'Nueva orden'}
          </Button>
        </Col>
      </Row>

      <Tabs activeKey={tabKey} onChange={setTabKey} items={[
        // ── Listas de Materiales (BOM) ─────────────────────────────────────
        {
          key: 'lm',
          label: <><AppstoreOutlined /> Listas de Materiales</>,
          children: (
            <Card>
              <Table columns={colsLM} dataSource={lms ?? []} rowKey="id"
                size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
            </Card>
          ),
        },

        // ── Órdenes de producción ──────────────────────────────────────────
        {
          key: 'ordenes',
          label: <><ToolOutlined /> Órdenes de Producción</>,
          children: (
            <Card extra={
              <Select placeholder="Estado" allowClear style={{ width: 140 }}
                value={estadoF} onChange={v => { setEstadoF(v); setPageOP(1); }}
                options={ESTADO_OP.map(e => ({ value: e.value, label: <Tag color={e.color}>{e.label}</Tag> }))} />
            }>
              <Table columns={filterColumnsOP(colsOP)} dataSource={ordenes?.data ?? []} rowKey="id"
                loading={loadOP} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: ordenes?.meta?.total, pageSize: 10, current: pageOP,
                              onChange: setPageOP, showSizeChanger: false }} />
            </Card>
          ),
        },

        // ── Centros de Trabajo ─────────────────────────────────────────────
        {
          key: 'centros',
          label: <><SettingOutlined /> Centros de Trabajo</>,
          children: <CentrosTrabajoTab />,
        },

        // ── Rutas de Producción ────────────────────────────────────────────
        {
          key: 'rutas',
          label: <><NodeIndexOutlined /> Rutas de Producción</>,
          children: <RutasTab lms={lms ?? []} />,
        },

        // ── WIP ────────────────────────────────────────────────────────────
        {
          key: 'wip',
          label: <><ClockCircleOutlined /> WIP — En Proceso</>,
          children: <WIPTab />,
        },
      ]} />

      {/* Drawer BOM */}
      <Drawer title={`BOM — ${lmDetalle?.nombre ?? ''}`}
        open={!!compModal} onClose={() => setCompModal(null)} width={600}>
        {lmDetalle && (
          <>
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Código">{lmDetalle.codigo}</Descriptions.Item>
              <Descriptions.Item label="Rendimiento">{lmDetalle.rendimiento} {lmDetalle.unidadRendimiento}</Descriptions.Item>
              <Descriptions.Item label="Producto final" span={2}>{lmDetalle.productoFinal?.nombre ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Costo estimado" span={2}>
                <Text strong style={{ color: '#1677ff' }}>{fmt.money(lmDetalle.costoEstimado ?? 0)}</Text>
                {' por '}{lmDetalle.rendimiento} {lmDetalle.unidadRendimiento}
              </Descriptions.Item>
            </Descriptions>

            <Table
              size="small"
        scroll={{ x: 'max-content' }}
              dataSource={lmDetalle.componentes ?? []}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Producto', key: 'prod', ellipsis: true,
                  render: (_: any, r: any) => `${r.producto?.codigo} — ${r.producto?.nombre}` },
                { title: 'Cantidad', dataIndex: 'cantidad', width: 90 },
                { title: 'Unidad',   dataIndex: 'unidad',   width: 80 },
                { title: 'Stock',    key: 'stock', width: 90,
                  render: (_: any, r: any) => (
                    <Text style={{ color: r.producto?.stock > 0 ? '#10b981' : '#ef4444' }}>
                      {r.producto?.stock ?? 0}
                    </Text>
                  )},
                { title: '', key: 'del', width: 50,
                  render: (_: any, r: any) => (
                    <Popconfirm title="¿Eliminar?" onConfirm={() => elimCompMut.mutate(r.id)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )},
              ]}
            />

            <Form form={formComp} layout="inline" style={{ marginTop: 16 }}
              onFinish={v => agregarCompMut.mutate({ listaId: compModal, data: v })}>
              <Form.Item name="productoId" rules={[{ required: true }]}>
                <Select showSearch style={{ width: 200 }} placeholder="Materia prima"
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={prodOpts} />
              </Form.Item>
              <Form.Item name="cantidad" rules={[{ required: true }]}>
                <InputNumber placeholder="Cantidad" min={0.001} step={0.5} style={{ width: 90 }} />
              </Form.Item>
              <Form.Item name="unidad">
                <Input placeholder="Unidad" style={{ width: 70 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={agregarCompMut.isPending} icon={<PlusOutlined />}>
                  Agregar
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>

      {/* Drawer detalle orden */}
      <Drawer title={`Orden ${detalleOP?.numero}`}
        open={!!detalleOP} onClose={() => setDetalleOP(null)} width={580}>
        {opDetalle && (
          <>
            {/* Progreso */}
            <Steps size="small" current={ESTADO_OP.find(e => e.value === opDetalle.estado)?.step ?? 0}
              style={{ marginBottom: 20 }}
              items={[
                { title: 'Borrador'    },
                { title: 'Planificada' },
                { title: 'En proceso'  },
                { title: 'Completada'  },
              ]}
            />

            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Fórmula">{opDetalle.lista?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Cantidad">{opDetalle.cantidadPlanificada} unid.</Descriptions.Item>
              <Descriptions.Item label="Inicio">{fmt.date(opDetalle.fechaInicio)}</Descriptions.Item>
              <Descriptions.Item label="Fin planif.">{opDetalle.fechaFinPlanificada ? fmt.date(opDetalle.fechaFinPlanificada) : '—'}</Descriptions.Item>
            </Descriptions>

            <Title level={5}>Consumo de materiales</Title>
            {opDetalle.consumos?.map((c: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', marginBottom: 6, borderRadius: 8,
                background: c.suficiente ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${c.suficiente ? '#86efac' : '#fca5a5'}`,
              }}>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{c.codigo} — {c.nombre}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Requerido: {Number(c.requerido).toFixed(2)} {c.unidad}
                    {' · '}Disponible: {c.disponible}
                  </Text>
                </div>
                {c.suficiente
                  ? <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
                  : <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />}
              </div>
            ))}
          </>
        )}
      </Drawer>

      {/* Modal crear LM */}
      <Modal title="Nueva Lista de Materiales (BOM)" open={lmModal}
        onCancel={() => setLMModal(false)} footer={null} width={520}>
        <Form form={formLM} layout="vertical"
          initialValues={{ rendimiento: 1, unidadRendimiento: 'PZA' }}
          onFinish={v => crearLMMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="BOM-001" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="productoFinalId" label="Producto que se fabrica" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())} options={prodOpts} />
            </Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="rendimiento" label="Rendimiento"><InputNumber style={{ width: '100%' }} min={0.001} step={0.5} /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="unidadRendimiento" label="Unidad producida"><Input placeholder="PZA, KG, LT..." /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setLMModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearLMMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal nueva orden */}
      <Modal title="Nueva Orden de Producción" open={ordenModal}
        onCancel={() => setOrdenModal(false)} footer={null} width={500}>
        <Form form={formOP} layout="vertical"
          initialValues={{ cantidadPlanificada: 1 }}
          onFinish={v => crearOPMut.mutate({ ...v })}>
          <Form.Item name="listaId" label="Fórmula (BOM)" rules={[{ required: true }]}>
            <Select options={(lms ?? []).map((l: any) => ({ value: l.id, label: `${l.codigo} — ${l.nombre}` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={10}><Form.Item name="cantidadPlanificada" label="Cantidad a producir" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.001} step={1} />
            </Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="fechaInicio" label="Fecha inicio" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="fechaFinPlanificada" label="Fecha fin planificada">
              <Input type="date" />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOrdenModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearOPMut.isPending}>Crear orden</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal completar producción */}
      <Modal title={`Completar orden ${completarModal?.numero}`}
        open={!!completarModal} onCancel={() => setCompletarModal(null)} footer={null} width={420}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Al completar, se descontarán las materias primas del inventario y se sumará el producto terminado." />
        <Form form={formCompletar} layout="vertical"
          onFinish={v => estadoOPMut.mutate({ id: completarModal.id, estado: 'completada', cant: v.cantidadProducida })}>
          <Form.Item name="cantidadProducida" label="Cantidad realmente producida" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.001} step={1} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCompletarModal(null)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={estadoOPMut.isPending}
                style={{ background: '#10b981', border: 'none' }}
                icon={<CheckCircleOutlined />}>
                Completar producción
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
