import { useState, useMemo } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, Space, Popconfirm,
  message, Tabs, Steps, Progress, Badge, Alert, Descriptions,
  Drawer, theme, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, SendOutlined,
  CheckCircleOutlined, PlayCircleOutlined, InboxOutlined,
  NodeIndexOutlined, TeamOutlined, WarningOutlined, SearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Helpers de extracción de respuesta ────────────────────────────────────────
const d    = (r: any) => r.data?.data ?? r.data;
const dArr = (r: any) => { const x = d(r); return Array.isArray(x) ? x : (x?.data ?? []); };

// ── WMS API ───────────────────────────────────────────────────────────────────
const wmsApi = {
  dashboard:      ()                        => api.get('/wms/dashboard').then(d),
  ubicaciones:    (almacenId?: number)      => api.get(`/wms/ubicaciones${almacenId ? `?almacenId=${almacenId}` : ''}`).then(d),
  crearUbicacion: (b: any)                  => api.post('/wms/ubicaciones', b).then(d),
  editUbicacion:  (id: number, b: any)      => api.patch(`/wms/ubicaciones/${id}`, b).then(d),
  delUbicacion:   (id: number)              => api.delete(`/wms/ubicaciones/${id}`).then(d),
  ordenes:        (p = 1, estado?: string)  => {
    const q = new URLSearchParams({ page: String(p) });
    if (estado) q.set('estado', estado);
    return api.get(`/wms/ordenes?${q}`).then(d);
  },
  crearOrden:     (b: any)                  => api.post('/wms/ordenes', b).then(d),
  findOrden:      (id: number)              => api.get(`/wms/ordenes/${id}`).then(d),
  asignar:        (id: number, op: number)  => api.post(`/wms/ordenes/${id}/asignar`, { operadorId: op }).then(d),
  iniciar:        (id: number)              => api.patch(`/wms/ordenes/${id}/iniciar`, {}).then(d),
  despachar:      (id: number)              => api.patch(`/wms/ordenes/${id}/despachar`, {}).then(d),
  cancelar:       (id: number)              => api.patch(`/wms/ordenes/${id}/cancelar`, {}).then(d),
  getRuta:        (id: number)              => api.get(`/wms/ordenes/${id}/ruta`).then(d),
  pickearLinea:   (id: number, b: any)      => api.patch(`/wms/lineas/${id}/pickear`, b).then(d),
};

// ── Constantes ────────────────────────────────────────────────────────────────
const TIPO_LABEL: Record<string, string> = {
  picking: '🎯 Picking', bulk: '📦 Bulk', recepcion: '📥 Recepción',
  despacho: '📤 Despacho', cuarentena: '🚫 Cuarentena',
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

  const colsStockBajo = [
    { title: 'Producto', key: 'prod', render: (_: any, r: any) => r.codigo ? `${r.codigo} — ${r.nombre}` : r.nombre, ellipsis: true },
    { title: 'Almacén', dataIndex: 'almacen', width: 130 },
    { title: 'Stock', dataIndex: 'stock', width: 80,
      render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{Number(v).toFixed(2)}</Text> },
    { title: 'Mínimo', dataIndex: 'stockMinimo', width: 80,
      render: (v: number) => Number(v).toFixed(2) },
  ];

  const colsUltimas = [
    { title: 'N°', dataIndex: 'numero', width: 120, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Almacén', key: 'alm', render: (_: any, r: any) => r.almacen?.nombre },
    { title: 'Despachada', dataIndex: 'fechaDespachado', width: 130,
      render: (v: string) => v ? dayjs(v).format('DD/MM HH:mm') : '—' },
    { title: 'Destinatario', dataIndex: 'destinatario', ellipsis: true },
  ];

  return (
    <>
      {(data?.urgentes ?? 0) > 0 && (
        <Alert type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${data.urgentes} orden(es) URGENTE(S) pendiente(s) de procesar`} />
      )}
      {(data?.pendienteDespacho ?? 0) > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`${data.pendienteDespacho} orden(es) empacada(s) esperando despacho`} />
      )}

      {/* KPIs órdenes */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Por asignar',    value: data?.resumen?.borrador    ?? 0, color: '#6b7280' },
          { label: 'Asignadas',      value: data?.resumen?.asignadas   ?? 0, color: '#1677ff' },
          { label: 'En proceso',     value: data?.resumen?.enProceso   ?? 0, color: '#fa8c16' },
          { label: 'Para despachar', value: data?.resumen?.empacadas   ?? 0, color: '#7c3aed' },
          { label: 'Despachadas',    value: data?.resumen?.despachadas ?? 0, color: '#52c41a' },
        ].map(k => (
          <Col xs={12} md={4} key={k.label}>
            <Card size="small">
              <Statistic title={k.label} value={k.value} valueStyle={{ color: k.color, fontSize: 22 }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* KPIs ubicaciones */}
      {data?.ubicaciones && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={8} md={4}>
            <Card size="small">
              <Statistic title="Ubicaciones totales" value={data.ubicaciones.total} valueStyle={{ fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={8} md={4}>
            <Card size="small">
              <Statistic title="Activas" value={data.ubicaciones.activas} valueStyle={{ color: '#52c41a', fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={8} md={4}>
            <Card size="small">
              <Statistic title="En uso" value={data.ubicaciones.enUso} valueStyle={{ color: '#fa8c16', fontSize: 18 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        {/* Cola por operador */}
        <Col xs={24} md={12}>
          <Title level={5} style={{ marginBottom: 8 }}>Cola por Operador</Title>
          <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
            dataSource={data?.colaOperadores ?? []} rowKey="operadorId" loading={isLoading}
            columns={[
              { title: 'Operador', dataIndex: 'nombre', ellipsis: true },
              { title: 'Órdenes activas', dataIndex: 'ordenes', width: 130,
                render: (v: number) => <Badge count={v} color={v > 3 ? 'red' : v > 1 ? 'orange' : 'green'} showZero /> },
            ]}
          />
        </Col>

        {/* Stock bajo */}
        {(data?.stockBajo ?? []).length > 0 && (
          <Col xs={24} md={12}>
            <Title level={5} style={{ marginBottom: 8, color: '#ef4444' }}>
              <WarningOutlined /> Stock bajo ({data.stockBajo.length})
            </Title>
            <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
              dataSource={data.stockBajo} rowKey={(r: any) => `${r.codigo}-${r.almacen}`}
              columns={colsStockBajo}
            />
          </Col>
        )}

        {/* Últimas despachadas */}
        {(data?.ultimasDespachadas ?? []).length > 0 && (
          <Col xs={24}>
            <Title level={5} style={{ marginBottom: 8 }}>Últimas órdenes despachadas</Title>
            <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
              dataSource={data.ultimasDespachadas} rowKey="id"
              columns={colsUltimas}
            />
          </Col>
        )}
      </Row>
    </>
  );
}

// ── Tab Ubicaciones ────────────────────────────────────────────────────────────
function UbicacionesTab({ almacenes }: { almacenes: any[] }) {
  const { token } = theme.useToken();
  const [editTarget, setEditTarget] = useState<any>(null);   // null = crear, obj = editar
  const [open, setOpen]             = useState(false);
  const [almacenFiltro, setAlmacenFiltro] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: ubics, isLoading } = useQuery({
    queryKey: ['wms-ubicaciones', almacenFiltro],
    queryFn:  () => wmsApi.ubicaciones(almacenFiltro),
  });

  const ubicsFiltradas = useMemo(() =>
    (ubics ?? []).filter((i: any) =>
      String(i.codigo  ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.pasillo ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.tipo    ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.almacen?.nombre ?? '').toLowerCase().includes(search.toLowerCase())
    ), [ubics, search]);

  // ── Mutaciones ────────────────────────────────────────────────────────────
  const guardarMut = useMutation({
    mutationFn: (b: any) => editTarget
      ? wmsApi.editUbicacion(editTarget.id, b)
      : wmsApi.crearUbicacion(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wms-ubicaciones'] });
      setOpen(false);
      form.resetFields();
      setEditTarget(null);
      message.success(editTarget ? 'Ubicación actualizada' : 'Ubicación creada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const delMut = useMutation({
    mutationFn: wmsApi.delUbicacion,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['wms-ubicaciones'] }); message.success('Eliminada'); },
    onError:    () => message.error('Error al eliminar'),
  });

  // ── Auto-generador de código ──────────────────────────────────────────────
  const handleValuesChange = (_: any, all: any) => {
    const alm = almacenes.find((a: any) => a.id === all.almacenId);
    if (!alm) return;
    const prefix = alm.codigo || `ALM${String(alm.id).padStart(2, '0')}`;
    const parts  = [prefix, all.pasillo, all.estante, all.nivel].filter(Boolean);
    if (parts.length > 1) form.setFieldValue('codigo', parts.join('-'));
  };

  const abrirEditar = (r: any) => {
    setEditTarget(r);
    form.setFieldsValue({
      almacenId:   r.almacenId,
      codigo:      r.codigo,
      tipo:        r.tipo,
      pasillo:     r.pasillo,
      estante:     r.estante,
      nivel:       r.nivel,
      posicion:    r.posicion,
      capacidadKg: r.capacidadKg,
      notas:       r.notas,
    });
    setOpen(true);
  };

  const cols = [
    { title: 'Código',    dataIndex: 'codigo',      width: 130, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Almacén',   key: 'alm',               render: (_: any, r: any) => r.almacen?.nombre },
    { title: 'Pasillo',   dataIndex: 'pasillo',      width: 80,  render: (v: string) => v ?? '—' },
    { title: 'Estante',   dataIndex: 'estante',      width: 80,  render: (v: string) => v ?? '—' },
    { title: 'Nivel',     dataIndex: 'nivel',        width: 70,  render: (v: string) => v ?? '—' },
    { title: 'Posición',  dataIndex: 'posicion',     width: 80,  render: (v: string) => v ?? '—' },
    { title: 'Tipo',      dataIndex: 'tipo',         width: 120, render: (v: string) => TIPO_LABEL[v] ?? v },
    { title: 'Cap. Kg',   dataIndex: 'capacidadKg',  width: 90,  render: (v: number) => v ? `${v} kg` : '—' },
    {
      title: () => <Tooltip title="Unidades en órdenes activas no despachadas">Pend. pick.</Tooltip>,
      dataIndex: 'unidadesPendientes', width: 100, align: 'right' as const,
      render: (v: number) => {
        const n = Number(v ?? 0);
        return n > 0
          ? <Tag color="orange">{n.toFixed(0)}</Tag>
          : <Text type="secondary">—</Text>;
      },
    },
    {
      title: '', key: 'act', width: 80,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
          <Popconfirm title="¿Eliminar ubicación?" onConfirm={() => delMut.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md="auto">
          <Space wrap>
            <Select
              placeholder="Filtrar por almacén"
              value={almacenFiltro}
              onChange={v => setAlmacenFiltro(v)}
              allowClear
              style={{ width: 200 }}
              options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
            />
            <Input
              placeholder="Buscar código, tipo o almacén..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          </Space>
        </Col>
        <Col xs={24} sm="auto">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditTarget(null); form.resetFields(); setOpen(true); }}>
            Nueva ubicación
          </Button>
        </Col>
      </Row>

      <Table columns={cols} dataSource={ubicsFiltradas} rowKey="id" loading={isLoading}
        size="small" scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />

      <Modal
        title={editTarget ? 'Editar ubicación' : 'Nueva ubicación'}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); setEditTarget(null); }}
        footer={null}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={v => guardarMut.mutate(v)}
          onValuesChange={handleValuesChange}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="almacenId" label="Almacén" rules={[{ required: true }]}>
                <Select
                  showSearch
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
                  disabled={!!editTarget}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="tipo" label="Tipo" initialValue="picking">
                <Select options={Object.entries(TIPO_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="pasillo" label="Pasillo"><Input placeholder="A" /></Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="estante" label="Estante"><Input placeholder="01" /></Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="nivel" label="Nivel"><Input placeholder="03" /></Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="posicion" label="Posición"><Input placeholder="02" /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="codigo" label="Código (auto-generado)" rules={[{ required: true }]}>
                <Input placeholder="A-01-03-02" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="capacidadKg" label="Cap. Kg (opcional)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas"><Input /></Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); setEditTarget(null); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={guardarMut.isPending}>
              {editTarget ? 'Guardar cambios' : 'Crear'}
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Órdenes de Picking ─────────────────────────────────────────────────────
function OrdenesPickingTab({ almacenes, productos, clientes }: {
  almacenes: any[]; productos: any[]; clientes: any[];
}) {
  const { token } = theme.useToken();
  const [page, setPage]                 = useState(1);
  const [estadoF, setEstadoF]           = useState<string | undefined>();
  const [search, setSearch]             = useState('');
  const [openCreate, setOpenCreate]     = useState(false);
  const [detalle, setDetalle]           = useState<any>(null);
  const [asignarModal, setAsignarModal] = useState<any>(null);
  const [form]  = Form.useForm();
  const [fAsig] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['wms-ordenes', page, estadoF],
    queryFn:  () => wmsApi.ordenes(page, estadoF),
  });

  const ordenesFiltradas = useMemo(() =>
    (data?.data ?? []).filter((i: any) =>
      String(i.numero          ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.destinatario    ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.almacen?.nombre ?? '').toLowerCase().includes(search.toLowerCase())
    ), [data, search]);

  const { data: detalleData } = useQuery({
    queryKey: ['wms-orden', detalle?.id],
    queryFn:  () => wmsApi.getRuta(detalle.id),
    enabled:  !!detalle,
    refetchInterval: 5000,
  });

  const crearMut  = useMutation({
    mutationFn: wmsApi.crearOrden,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['wms-ordenes'] });
      qc.invalidateQueries({ queryKey: ['wms-dash'] });
      setOpenCreate(false);
      form.resetFields();
      message.success(`Orden ${r.numero} creada`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear orden'),
  });
  const asigMut   = useMutation({
    mutationFn: ({ id, op }: any) => wmsApi.asignar(id, op),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); setAsignarModal(null); fAsig.resetFields(); message.success('Operador asignado'); },
    onError:    () => message.error('Error al asignar operador'),
  });
  const iniciarMut = useMutation({
    mutationFn: wmsApi.iniciar,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }); message.success('Picking iniciado'); },
    onError:    () => message.error('Error'),
  });
  const despMut = useMutation({
    mutationFn: wmsApi.despachar,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['wms-ordenes'] }); qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }); qc.invalidateQueries({ queryKey: ['wms-dash'] }); message.success('Orden despachada'); },
    onError:    (e: any) => message.error(e?.response?.data?.message ?? 'Error al despachar'),
  });
  const pickMut = useMutation({
    mutationFn: ({ lineaId, cant }: { lineaId: number; cant: number }) => wmsApi.pickearLinea(lineaId, { cantidadPickeada: cant }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['wms-orden', detalle?.id] }),
    onError:    () => message.error('Error al pickear'),
  });

  const cols = [
    { title: 'N°',       dataIndex: 'numero',    width: 130, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Almacén',  key: 'alm',             render: (_: any, r: any) => r.almacen?.nombre },
    { title: 'Tipo',     dataIndex: 'tipo',       width: 130, render: (v: string) => v?.replace('_', ' ').toUpperCase() },
    { title: 'Ítems',    key: 'items',            width: 60,  render: (_: any, r: any) => r.lineas?.length ?? 0 },
    { title: 'Destino',  dataIndex: 'destinatario', ellipsis: true, render: (v: string) => v ?? <Text type="secondary">—</Text> },
    { title: 'Operador', key: 'op',              render: (_: any, r: any) => r.operador?.nombre ?? <Text type="secondary">Sin asignar</Text> },
    { title: 'Prioridad', dataIndex: 'prioridad', width: 90,
      render: (v: number) => <Tag color={v===1?'red':v===2?'orange':'default'}>{v===1?'🔴 Urgente':v===2?'🟡 Normal':'🟢 Baja'}</Tag> },
    { title: 'Estado',   dataIndex: 'estado',     width: 120, render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{v?.replace('_',' ').toUpperCase()}</Tag> },
    { title: 'Fecha',    dataIndex: 'createdAt',  width: 110, render: (v: string) => dayjs(v).format('DD/MM HH:mm') },
    { title: '', key: 'acc', width: 210,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetalle(r)}>Ver</Button>
          {r.estado === 'borrador'  && <Button size="small" type="primary" onClick={() => { setAsignarModal(r); fAsig.resetFields(); }}>Asignar</Button>}
          {r.estado === 'asignada'  && <Button size="small" icon={<PlayCircleOutlined />} onClick={() => iniciarMut.mutate(r.id)}>Iniciar</Button>}
          {r.estado === 'empacada'  && <Button size="small" icon={<SendOutlined />} onClick={() => despMut.mutate(r.id)}>Despachar</Button>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Space wrap>
            <Select placeholder="Estado" value={estadoF} onChange={v => { setEstadoF(v); setPage(1); }}
              allowClear style={{ width: 150 }}>
              {['borrador','asignada','en_proceso','empacada','despachada','cancelada'].map(e =>
                <Option key={e} value={e}><Tag color={ESTADO_COLOR[e]}>{e.replace('_',' ').toUpperCase()}</Tag></Option>
              )}
            </Select>
            <Input
              placeholder="Buscar número, destino o almacén..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: 240 }}
            />
          </Space>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpenCreate(true); }}>
            Nueva orden
          </Button>
        </Col>
      </Row>

      <Table columns={cols} dataSource={ordenesFiltradas} rowKey="id" loading={isLoading}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* ── Modal crear orden ─────────────────────────────────────────────── */}
      <Modal title="Nueva orden de picking" open={openCreate}
        onCancel={() => { setOpenCreate(false); form.resetFields(); }}
        footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={(v) => {
          const lineas = (v.lineas ?? []).map((l: any) => ({
            productoId:         Number(l.productoId),
            cantidadSolicitada: Number(l.cantidad),
          }));
          crearMut.mutate({ ...v, lineas });
        }}>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="almacenId" label="Almacén" rules={[{ required: true }]}>
                <Select
                  showSearch
                  placeholder="Seleccionar almacén"
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="tipo" label="Tipo" initialValue="salida_venta">
                <Select options={[
                  { value: 'salida_venta',  label: '🛒 Salida Venta' },
                  { value: 'transferencia', label: '🔄 Transferencia' },
                  { value: 'devolucion',    label: '↩️ Devolución' },
                  { value: 'ajuste',        label: '⚖️ Ajuste' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="prioridad" label="Prioridad" initialValue={2}>
                <Select options={[
                  { value: 1, label: '🔴 Urgente' },
                  { value: 2, label: '🟡 Normal' },
                  { value: 3, label: '🟢 Baja' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="destinatario" label="Destinatario (cliente)">
                <Select
                  showSearch
                  allowClear
                  placeholder="Buscar cliente o escribir nombre..."
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes.map((c: any) => ({ value: c.nombre, label: c.nombre }))}
                  notFoundContent={<Text type="secondary">No hay clientes — escribe el nombre</Text>}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="facturaId" label="Factura ID (opcional)">
                <InputNumber style={{ width: '100%' }} min={1} placeholder="ID de factura" />
              </Form.Item>
            </Col>
          </Row>

          <Text strong>Productos a pickear:</Text>
          <Form.List name="lineas" initialValue={[{}]}>
            {(fields, { add, remove }) => (<>
              {fields.map(({ key, name }) => (
                <Row key={key} gutter={8} align="middle" style={{ marginTop: 8 }}>
                  <Col xs={24} sm={14}>
                    <Form.Item name={[name, 'productoId']} rules={[{ required: true, message: 'Requerido' }]} style={{ margin: 0 }}>
                      <Select
                        showSearch
                        placeholder="Buscar producto por nombre o código..."
                        filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                        options={productos.map((p: any) => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }))}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={7}>
                    <Form.Item name={[name, 'cantidad']} rules={[{ required: true, message: 'Cantidad requerida' }]} style={{ margin: 0 }}>
                      <InputNumber placeholder="Cantidad" min={0.001} precision={2} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={3}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => add({})} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                Agregar producto
              </Button>
            </>)}
          </Form.List>

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => { setOpenCreate(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear orden</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal asignar operador ────────────────────────────────────────── */}
      <Modal title={`Asignar operador — ${asignarModal?.numero}`}
        open={!!asignarModal} onCancel={() => setAsignarModal(null)} footer={null} width={380}>
        <Form form={fAsig} layout="vertical" onFinish={(v) => asigMut.mutate({ id: asignarModal.id, op: v.operadorId })}>
          <Form.Item name="operadorId" label="ID del Operador" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={asigMut.isPending} icon={<TeamOutlined />}>
            Asignar
          </Button>
        </Form>
      </Modal>

      {/* ── Drawer detalle + picking ──────────────────────────────────────── */}
      <Drawer
        title={`Orden ${detalle?.numero ?? ''} — ${detalle?.estado?.replace('_',' ').toUpperCase() ?? ''}`}
        open={!!detalle} onClose={() => setDetalle(null)} width={700}
      >
        {detalleData && (
          <>
            <Steps current={ESTADO_STEP[detalleData.estado ?? 'borrador'] ?? 0} size="small" style={{ marginBottom: 16 }}
              items={[
                { title: 'Creada',     icon: <InboxOutlined /> },
                { title: 'Asignada',   icon: <TeamOutlined /> },
                { title: 'Picking',    icon: <NodeIndexOutlined /> },
                { title: 'Empacada',   icon: <CheckCircleOutlined /> },
                { title: 'Despachada', icon: <SendOutlined /> },
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
              {detalleData.facturaId && (
                <Descriptions.Item label="Factura ID">{detalleData.facturaId}</Descriptions.Item>
              )}
            </Descriptions>

            {/* Progress */}
            {(detalleData.lineas ?? []).length > 0 && (() => {
              const completadas = (detalleData.lineas ?? []).filter((l: any) => l.estado !== 'pendiente').length;
              const pct = Math.round((completadas / detalleData.lineas.length) * 100);
              return <Progress percent={pct} style={{ marginBottom: 12 }} />;
            })()}

            {/* Tabla líneas */}
            <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
              dataSource={detalleData.lineas ?? []} rowKey="id"
              columns={[
                { title: '#',    dataIndex: 'orden_linea',        width: 40 },
                { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => `${r.producto?.codigo ?? ''} — ${r.producto?.nombre ?? ''}` },
                { title: 'Ubic.', dataIndex: 'ubicacionCodigo',   width: 100, render: (v: string) => v ? <Text code>{v}</Text> : '—' },
                { title: 'Sol.',  dataIndex: 'cantidadSolicitada', width: 65,  render: (v: number) => fmt.number(v) },
                { title: 'Pick.', dataIndex: 'cantidadPickeada',   width: 65,  render: (v: number) => fmt.number(v) },
                { title: 'Est.', dataIndex: 'estado',              width: 90,
                  render: (v: string) => <Tag color={LINEA_COLOR[v]} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
                { title: '', key: 'pick', width: 90,
                  render: (_: any, r: any) => r.estado === 'pendiente' && detalleData.estado === 'en_proceso' && (
                    <Button size="small" type="primary"
                      loading={pickMut.isPending}
                      onClick={() => pickMut.mutate({ lineaId: r.id, cant: Number(r.cantidadSolicitada) })}>
                      Pickear
                    </Button>
                  ) },
              ]} />

            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detalleData.estado === 'asignada'  && <Button icon={<PlayCircleOutlined />} onClick={() => iniciarMut.mutate(detalleData.id)}>Iniciar picking</Button>}
              {detalleData.estado === 'empacada'  && <Button type="primary" icon={<SendOutlined />} loading={despMut.isPending} onClick={() => despMut.mutate(detalleData.id)}>Despachar</Button>}
              {!['despachada','cancelada'].includes(detalleData.estado) && (
                <Popconfirm title="¿Cancelar orden?" onConfirm={() => {
                  wmsApi.cancelar(detalleData.id).then(() => {
                    qc.invalidateQueries({ queryKey: ['wms-ordenes'] });
                    qc.invalidateQueries({ queryKey: ['wms-dash'] });
                    setDetalle(null);
                    message.success('Cancelada');
                  }).catch(() => message.error('Error al cancelar'));
                }}>
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
  // Queries compartidas entre tabs
  const { data: almacenes = [] } = useQuery({
    queryKey: ['wms-almacenes'],
    queryFn:  () => api.get('/almacenes').then(d),
    staleTime: 60_000,
  });
  const { data: productos = [] } = useQuery({
    queryKey: ['wms-productos'],
    queryFn:  () => api.get('/productos?limit=5000&incluirSinStock=true').then(dArr),
    staleTime: 60_000,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ['wms-clientes'],
    queryFn:  () => api.get('/clientes?limit=200').then(dArr),
    staleTime: 60_000,
  });

  const { data: dash } = useQuery({ queryKey: ['wms-dash'], queryFn: wmsApi.dashboard });
  const alertas = (dash?.urgentes ?? 0) + (dash?.pendienteDespacho ?? 0);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>WMS — Gestión de Almacenes</Title>
      <Card>
        <Tabs defaultActiveKey="dashboard" items={[
          {
            key: 'dashboard',
            label: <Space>Dashboard {alertas > 0 && <Badge count={alertas} size="small" />}</Space>,
            children: <DashboardTab />,
          },
          {
            key: 'ordenes',
            label: <><NodeIndexOutlined /> Órdenes de Picking</>,
            children: <OrdenesPickingTab almacenes={almacenes} productos={productos} clientes={clientes} />,
          },
          {
            key: 'ubicaciones',
            label: <><InboxOutlined /> Ubicaciones</>,
            children: <UbicacionesTab almacenes={almacenes} />,
          },
        ]} />
      </Card>
    </div>
  );
}

