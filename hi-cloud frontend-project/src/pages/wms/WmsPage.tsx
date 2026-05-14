import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, Space, Popconfirm,
  message, Tabs, Steps, Progress, Badge, Alert, Descriptions,
  Drawer,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, SendOutlined,
  CheckCircleOutlined, PlayCircleOutlined, InboxOutlined,
  NodeIndexOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;
const wmsApi = {
  dashboard:      ()               => api.get('/wms/dashboard').then(d),
  // Ubicaciones
  ubicaciones:    (almacenId?: number) => api.get(`/wms/ubicaciones${almacenId ? `?almacenId=${almacenId}` : ''}`).then(d),
  crearUbicacion: (b: any)         => api.post('/wms/ubicaciones', b).then(d),
  delUbicacion:   (id: number)     => api.delete(`/wms/ubicaciones/${id}`).then(d),
  // Órdenes
  ordenes:        (p = 1, estado?: string, operadorId?: number) => {
    const q = new URLSearchParams({ page: String(p) });
    if (estado)     q.set('estado', estado);
    if (operadorId) q.set('operadorId', String(operadorId));
    return api.get(`/wms/ordenes?${q}`).then(d);
  },
  crearOrden:     (b: any)         => api.post('/wms/ordenes', b).then(d),
  findOrden:      (id: number)     => api.get(`/wms/ordenes/${id}`).then(d),
  asignar:        (id: number, operadorId: number) => api.post(`/wms/ordenes/${id}/asignar`, { operadorId }).then(d),
  iniciar:        (id: number)     => api.patch(`/wms/ordenes/${id}/iniciar`, {}).then(d),
  despachar:      (id: number)     => api.patch(`/wms/ordenes/${id}/despachar`, {}).then(d),
  cancelar:       (id: number)     => api.patch(`/wms/ordenes/${id}/cancelar`, {}).then(d),
  getRuta:        (id: number)     => api.get(`/wms/ordenes/${id}/ruta`).then(d),
  pickearLinea:   (id: number, b: any) => api.patch(`/wms/lineas/${id}/pickear`, b).then(d),
};

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'default', asignada: 'blue', en_proceso: 'orange',
  empacada: 'purple', despachada: 'green', cancelada: 'red',
};
const ESTADO_STEP: Record<string, number> = {
  borrador: 0, asignada: 1, en_proceso: 2, empacada: 3, despachada: 4,
};
const LINEA_COLOR: Record<string, string> = {
  pendiente: 'default', pickeado: 'green', faltante: 'red', parcial: 'orange',
};

// ── Tab Dashboard ──────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = useQuery({ queryKey: ['wms-dash'], queryFn: wmsApi.dashboard });

  return (
    <>
      {(data?.urgentes ?? 0) > 0 && (
        <Alert type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${data?.urgentes} orden(es) URGENTE(S) pendiente(s) de procesar`} />
      )}
      {(data?.pendienteDespacho ?? 0) > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`${data?.pendienteDespacho} orden(es) empacada(s) esperando despacho`} />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Por asignar',   value: data?.resumen?.borrador   ?? 0, color: '#6b7280' },
          { label: 'Asignadas',     value: data?.resumen?.asignadas  ?? 0, color: '#1677ff' },
          { label: 'En proceso',    value: data?.resumen?.enProceso  ?? 0, color: '#fa8c16' },
          { label: 'Para despachar',value: data?.resumen?.empacadas  ?? 0, color: '#7c3aed' },
          { label: 'Despachadas',   value: data?.resumen?.despachadas?? 0, color: '#52c41a' },
        ].map(k => (
          <Col xs={12} md={4} key={k.label}>
            <Card size="small"><Statistic title={k.label} value={k.value} valueStyle={{ color: k.color, fontSize: 22 }} /></Card>
          </Col>
        ))}
      </Row>

      <Title level={5}>Cola por Operador</Title>
      <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
        dataSource={data?.colaOperadores ?? []} rowKey="operadorId"
        columns={[
          { title: 'Operador', dataIndex: 'nombre', ellipsis: true },
          { title: 'Órdenes activas', dataIndex: 'ordenes', width: 130,
            render: (v: number) => <Badge count={v} color={v > 3 ? 'red' : v > 1 ? 'orange' : 'green'} showZero /> },
        ]}
        loading={isLoading}
      />
    </>
  );
}

// ── Tab Ubicaciones ────────────────────────────────────────────────────────────
function UbicacionesTab() {
  const [open, setOpen] = useState(false);
  const [almacenFiltro, setAlmacenFiltro] = useState<number | undefined>();
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: ubics, isLoading } = useQuery({
    queryKey: ['wms-ubicaciones', almacenFiltro],
    queryFn: () => wmsApi.ubicaciones(almacenFiltro),
  });

  const crearMut = useMutation({
    mutationFn: wmsApi.crearUbicacion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-ubicaciones'] }); setOpen(false); form.resetFields(); message.success('Ubicación creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: wmsApi.delUbicacion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-ubicaciones'] }); message.success('Eliminada'); },
  });

  const TIPO_LABEL: Record<string, string> = {
    picking: '🎯 Picking', bulk: '📦 Bulk', recepcion: '📥 Recepción', despacho: '📤 Despacho', cuarentena: '🚫 Cuarentena',
  };

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 120, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Almacén', key: 'alm', render: (_: any, r: any) => r.almacen?.nombre },
    { title: 'Pasillo', dataIndex: 'pasillo', width: 80, render: (v: string) => v ?? '—' },
    { title: 'Estante', dataIndex: 'estante', width: 80, render: (v: string) => v ?? '—' },
    { title: 'Nivel',   dataIndex: 'nivel',   width: 70, render: (v: string) => v ?? '—' },
    { title: 'Posición',dataIndex: 'posicion',width: 80, render: (v: string) => v ?? '—' },
    { title: 'Tipo',    dataIndex: 'tipo',    width: 120, render: (v: string) => TIPO_LABEL[v] ?? v },
    { title: 'Cap. Kg', dataIndex: 'capacidadKg', width: 90, render: (v: number) => v ? `${v} kg` : '—' },
    { title: '', key: 'del', width: 60,
      render: (_: any, r: any) => <Popconfirm title="¿Eliminar?" onConfirm={() => delMut.mutate(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  return (
    <>
      <Row justify="space-between" style={{ marginBottom: 12 }}>
        <Col><InputNumber placeholder="Filtrar por almacén ID" value={almacenFiltro} onChange={v => setAlmacenFiltro(v ?? undefined)} style={{ width: 200 }} /></Col>
        <Col><Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Nueva ubicación</Button></Col>
      </Row>
      <Table columns={cols} dataSource={ubics ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 20 }} />

      <Modal title="Nueva ubicación" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="almacenId" label="Almacén ID" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="A-01-03-02" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo" initialValue="picking">
              <Select options={Object.entries(TIPO_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="pasillo"  label="Pasillo"><Input /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="estante"  label="Estante"><Input /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="nivel"    label="Nivel"><Input /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="posicion" label="Posición"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="capacidadKg" label="Cap. Kg (opcional)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="notas" label="Notas"><Input /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Órdenes de Picking ─────────────────────────────────────────────────────
function OrdenesPickingTab() {
  const [page, setPage]           = useState(1);
  const [estadoF, setEstadoF]     = useState<string | undefined>();
  const [openCreate, setOpenCreate] = useState(false);
  const [detalle, setDetalle]     = useState<any>(null);
  const [asignarModal, setAsignarModal] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['wms-ordenes', page, estadoF],
    queryFn: () => wmsApi.ordenes(page, estadoF),
  });
  const { data: detalleData, isLoading: loadDet } = useQuery({
    queryKey: ['wms-orden', detalle?.id],
    queryFn: () => wmsApi.getRuta(detalle.id),
    enabled: !!detalle,
    refetchInterval: 5000,
  });

  const crearMut  = useMutation({ mutationFn: wmsApi.crearOrden,    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-dash'] }); setOpenCreate(false); form.resetFields(); message.success(`Orden ${r.numero} creada`); } });
  const asigMut   = useMutation({ mutationFn: ({ id, op }: any) => wmsApi.asignar(id, op), onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-orden', asignarModal?.id] }); setAsignarModal(null); message.success('Operador asignado'); } });
  const iniciarMut= useMutation({ mutationFn: wmsApi.iniciar,     onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }); message.success('Picking iniciado'); } });
  const despMut   = useMutation({ mutationFn: wmsApi.despachar,   onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }); qc.invalidateQueries({ queryKey: ['wms-dash'] }); message.success('Orden despachada'); } });
  const pickMut   = useMutation({
    mutationFn: ({ lineaId, cant }: { lineaId: number; cant: number }) => wmsApi.pickearLinea(lineaId, { cantidadPickeada: cant }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }); },
  });

  const cols = [
    { title: 'N°',      dataIndex: 'numero',    width: 130, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Almacén', key: 'alm',              render: (_: any, r: any) => r.almacen?.nombre },
    { title: 'Tipo',    dataIndex: 'tipo',       width: 130, render: (v: string) => v?.replace('_', ' ').toUpperCase() },
    { title: 'Ítems',   key: 'items',            width: 70,  render: (_: any, r: any) => r.lineas?.length ?? 0 },
    { title: 'Operador',key: 'op',               render: (_: any, r: any) => r.operador?.nombre ?? <Text type="secondary">Sin asignar</Text> },
    { title: 'Prioridad',dataIndex: 'prioridad', width: 80,
      render: (v: number) => <Tag color={v===1?'red':v===2?'orange':'default'}>{v===1?'🔴 Urgente':v===2?'🟡 Normal':'🟢 Baja'}</Tag> },
    { title: 'Estado',  dataIndex: 'estado',     width: 120, render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{v?.replace('_',' ').toUpperCase()}</Tag> },
    { title: 'Fecha',   dataIndex: 'createdAt',  width: 110, render: (v: string) => dayjs(v).format('DD/MM HH:mm') },
    { title: '', key: 'acc', width: 200,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetalle(r)}>Ver</Button>
          {r.estado === 'borrador'   && <Button size="small" type="primary" onClick={() => setAsignarModal(r)}>Asignar</Button>}
          {r.estado === 'asignada'   && <Button size="small" icon={<PlayCircleOutlined />} onClick={() => iniciarMut.mutate(r.id)}>Iniciar</Button>}
          {r.estado === 'empacada'   && <Button size="small" icon={<SendOutlined />} onClick={() => despMut.mutate(r.id)}>Despachar</Button>}
        </Space>
      ) },
  ];

  const etapas = ['Creada', 'Asignada', 'En Proceso', 'Empacada', 'Despachada'];

  return (
    <>
      <Row justify="space-between" style={{ marginBottom: 12 }}>
        <Col>
          <Select placeholder="Estado" value={estadoF} onChange={v => { setEstadoF(v); setPage(1); }} allowClear style={{ width: 150 }}>
            {['borrador','asignada','en_proceso','empacada','despachada','cancelada'].map(e =>
              <Select.Option key={e} value={e}><Tag color={ESTADO_COLOR[e]}>{e.replace('_',' ').toUpperCase()}</Tag></Select.Option>
            )}
          </Select>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpenCreate(true); }}>Nueva orden</Button>
        </Col>
      </Row>

      <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 20, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* Modal crear orden */}
      <Modal title="Nueva orden de picking" open={openCreate} onCancel={() => { setOpenCreate(false); form.resetFields(); }} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={(v) => {
          const lineas = (v.lineas ?? []).map((l: any) => ({ productoId: Number(l.productoId), cantidadSolicitada: Number(l.cantidad) }));
          crearMut.mutate({ ...v, lineas });
        }}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="almacenId" label="Almacén ID" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo" initialValue="salida_venta">
              <Select options={[
                { value: 'salida_venta',  label: '🛒 Salida Venta' },
                { value: 'transferencia', label: '🔄 Transferencia' },
                { value: 'devolucion',    label: '↩️ Devolución' },
                { value: 'ajuste',        label: '⚖️ Ajuste' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="prioridad" label="Prioridad" initialValue={2}>
              <Select options={[{ value: 1, label: '🔴 Urgente' }, { value: 2, label: '🟡 Normal' }, { value: 3, label: '🟢 Baja' }]} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="destinatario" label="Destinatario"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="facturaId" label="Factura ID (opcional)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
          </Row>
          <Text strong>Productos a pickear:</Text>
          <Form.List name="lineas" initialValue={[{}]}>
            {(fields, { add, remove }) => (<>
              {fields.map(({ key, name }) => (
                <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8, marginTop: 8 }}>
                  <Col xs={24} sm={8}><Form.Item name={[name, 'productoId']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Producto ID" style={{ width: '100%' }} min={1} /></Form.Item></Col>
                  <Col xs={12} sm={6}><Form.Item name={[name, 'cantidad']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Cantidad" min={0.001} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} sm={1}><Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} /></Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => add({})} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>Agregar producto</Button>
            </>)}
          </Form.List>
          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => { setOpenCreate(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear orden</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal asignar operador */}
      <Modal title={`Asignar operador — ${asignarModal?.numero}`} open={!!asignarModal}
        onCancel={() => setAsignarModal(null)} footer={null} width={380}>
        <Form layout="vertical" onFinish={(v) => asigMut.mutate({ id: asignarModal.id, op: v.operadorId })}>
          <Form.Item name="operadorId" label="ID del Operador" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={asigMut.isPending} icon={<TeamOutlined />}>Asignar</Button>
        </Form>
      </Modal>

      {/* Drawer detalle orden + picking */}
      <Drawer title={`Orden ${detalle?.numero ?? ''} — ${detalle?.estado?.replace('_',' ').toUpperCase() ?? ''}`}
        open={!!detalle} onClose={() => setDetalle(null)} width={680}>
        {detalleData && (
          <>
            <Steps current={ESTADO_STEP[detalleData.estado ?? 'borrador'] ?? 0} size="small" style={{ marginBottom: 16 }}
              items={[
                { title: 'Creada',      icon: <InboxOutlined /> },
                { title: 'Asignada',    icon: <TeamOutlined /> },
                { title: 'Picking',     icon: <NodeIndexOutlined /> },
                { title: 'Empacada',    icon: <CheckCircleOutlined /> },
                { title: 'Despachada',  icon: <SendOutlined /> },
              ]} />

            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Almacén">{detalleData.almacen?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Operador">{detalleData.operador?.nombre ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Destinatario">{detalleData.destinatario ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Prioridad">
                <Tag color={detalleData.prioridad===1?'red':detalleData.prioridad===2?'orange':'default'}>
                  {detalleData.prioridad===1?'Urgente':detalleData.prioridad===2?'Normal':'Baja'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* Progress */}
            {(detalleData.lineas ?? []).length > 0 && (() => {
              const completadas = (detalleData.lineas ?? []).filter((l: any) => l.estado !== 'pendiente').length;
              const pct = Math.round((completadas / detalleData.lineas.length) * 100);
              return <Progress percent={pct} style={{ marginBottom: 12 }} />;
            })()}

            {/* Tabla de líneas con botón pickear */}
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={detalleData.lineas ?? []} rowKey="id"
              columns={[
                { title: '#', dataIndex: 'orden_linea', width: 40 },
                { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => `${r.producto?.codigo} — ${r.producto?.nombre}` },
                { title: 'Ubic.', dataIndex: 'ubicacionCodigo', width: 90, render: (v: string) => v ? <Text code>{v}</Text> : '—' },
                { title: 'Sol.', dataIndex: 'cantidadSolicitada', width: 60, render: (v: number) => fmt.number(v) },
                { title: 'Pick.', dataIndex: 'cantidadPickeada', width: 60, render: (v: number) => fmt.number(v) },
                { title: 'Est.', dataIndex: 'estado', width: 90, render: (v: string) => <Tag color={LINEA_COLOR[v]} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
                { title: '', key: 'pick', width: 90,
                  render: (_: any, r: any) => r.estado === 'pendiente' && detalleData.estado === 'en_proceso' && (
                    <Button size="small" type="primary" onClick={() => pickMut.mutate({ lineaId: r.id, cant: Number(r.cantidadSolicitada) })}>
                      Pickear
                    </Button>
                  ) },
              ]} />

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              {detalleData.estado === 'asignada'   && <Button icon={<PlayCircleOutlined />} onClick={() => iniciarMut.mutate(detalleData.id)}>Iniciar picking</Button>}
              {detalleData.estado === 'empacada'   && <Button type="primary" icon={<SendOutlined />} onClick={() => despMut.mutate(detalleData.id)}>Despachar</Button>}
              {!['despachada','cancelada'].includes(detalleData.estado) && (
                <Popconfirm title="¿Cancelar orden?" onConfirm={() => { wmsApi.cancelar(detalleData.id).then(() => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); setDetalle(null); message.success('Cancelada'); }); }}>
                  <Button danger>Cancelar</Button>
                </Popconfirm>
              )}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}

// ── Page Principal ─────────────────────────────────────────────────────────────
export default function WmsPage() {
  const { data: dash } = useQuery({ queryKey: ['wms-dash'], queryFn: wmsApi.dashboard });
  const alertas = (dash?.urgentes ?? 0) + (dash?.pendienteDespacho ?? 0);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>WMS — Gestión de Almacenes</Title>
      <Card>
        <Tabs defaultActiveKey="dashboard" items={[
          { key: 'dashboard', label: (
              <Space>Dashboard {alertas > 0 && <Badge count={alertas} size="small" />}</Space>
            ), children: <DashboardTab /> },
          { key: 'ordenes',     label: <><NodeIndexOutlined /> Órdenes de Picking</>, children: <OrdenesPickingTab /> },
          { key: 'ubicaciones', label: <><InboxOutlined /> Ubicaciones</>,           children: <UbicacionesTab /> },
        ]} />
      </Card>
    </div>
  );
}
