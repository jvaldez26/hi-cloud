import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import { Table, Button, Tag, Card, Row, Col, Typography,
         Modal, Form, Input, InputNumber, Select, DatePicker, Space,
         Drawer, Descriptions, Popconfirm, message, Divider, Steps, theme, Spin } from 'antd';
import {
  PlusOutlined, FileTextOutlined, FileExcelOutlined, SearchOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

type EstadoOrden = 'recibido' | 'en_diagnostico' | 'esperando_piezas' | 'en_proceso' | 'listo' | 'entregado' | 'cobrado' | 'cancelado';

const ESTADO_INFO: Record<EstadoOrden, { color: string; label: string; step: number }> = {
  recibido:         { color: 'default', label: '📥 Recibido',          step: 0 },
  en_diagnostico:   { color: 'orange',  label: '🔍 En Diagnóstico',    step: 1 },
  esperando_piezas: { color: 'gold',    label: '⏳ Esperando Piezas',  step: 2 },
  en_proceso:       { color: 'blue',    label: '🔧 En Proceso',        step: 3 },
  listo:            { color: 'cyan',    label: '✅ Listo',             step: 4 },
  entregado:        { color: 'green',   label: '📦 Entregado',         step: 5 },
  cobrado:          { color: 'purple',  label: '💰 Cobrado',           step: 6 },
  cancelado:        { color: 'red',     label: '❌ Cancelado',         step: -1 },
};

const TRANSICIONES: Record<EstadoOrden, EstadoOrden[]> = {
  recibido:         ['en_diagnostico', 'cancelado'],
  en_diagnostico:   ['esperando_piezas', 'en_proceso', 'cancelado'],
  esperando_piezas: ['en_proceso', 'cancelado'],
  en_proceso:       ['listo', 'cancelado'],
  listo:            ['entregado', 'cobrado'],
  entregado:        ['cobrado'],
  cobrado:          [],
  cancelado:        [],
};

const serviciosApi = {
  resumen:   ()         => api.get('/servicios/resumen').then((r: any) => r.data?.data ?? r.data),
  list:      (p = 1, estado?: string, s?: string) =>
    api.get(`/servicios?page=${p}${estado ? `&estado=${estado}` : ''}${s ? `&search=${encodeURIComponent(s)}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  getOne:    (id: number) => api.get(`/servicios/${id}`).then((r: any) => r.data?.data ?? r.data),
  crear:     (body: any)  => api.post('/servicios', body).then((r: any) => r.data?.data ?? r.data),
  estado:    (id: number, body: any) => api.patch(`/servicios/${id}/estado`, body).then((r: any) => r.data?.data ?? r.data),
  diagnostico:(id: number, body: any) => api.patch(`/servicios/${id}/diagnostico`, body).then((r: any) => r.data?.data ?? r.data),
  detalle:   (id: number, body: any) => api.post(`/servicios/${id}/detalles`, body).then((r: any) => r.data?.data ?? r.data),
  eliminarDetalle: (id: number, detalleId: number) =>
    api.delete(`/servicios/${id}/detalles/${detalleId}`).then((r: any) => r.data?.data ?? r.data),
  facturar:  (id: number) => api.post(`/servicios/${id}/facturar`).then((r: any) => r.data?.data ?? r.data),
};

export default function ServiciosPage() {
  const { token } = theme.useToken();
  const [page,        setPage]        = useState(1);
  const [estadoFilt,  setEstadoFilt]  = useState<string | undefined>();
  const [search,      setSearch]      = useState('');
  const [openCreate,  setOpenCreate]  = useState(false);
  const [detail,      setDetail]      = useState<any>(null);   // row de la lista (para abrir drawer)
  const [openDetalle, setOpenDetalle] = useState(false);
  const [formCreate]  = Form.useForm();
  const [formDetalle] = Form.useForm();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: resumen } = useQuery({ queryKey: ['srv-resumen'], queryFn: serviciosApi.resumen });
  const { data, isLoading } = useQuery({
    queryKey: ['servicios', page, estadoFilt, search],
    queryFn:  () => serviciosApi.list(page, estadoFilt, search),
  });
  const { data: clientes }  = useQuery({ queryKey: ['cli-srv'],  queryFn: () => clientesApi.list(1, 100) });
  const { data: productos } = useQuery({ queryKey: ['prod-srv'], queryFn: () => productosApi.list(1, 200) });
  const { data: empleados = [] } = useQuery<any[]>({
    queryKey: ['emp-srv'],
    queryFn:  () => api.get('/nomina/empleados?limit=100').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }).catch(() => []),
  });

  // Carga la orden completa con detalles cuando el drawer está abierto
  const detailQuery = useQuery({
    queryKey: ['servicios-detail', detail?.id],
    queryFn:  () => serviciosApi.getOne(detail!.id),
    enabled:  !!detail?.id,
    staleTime: 0,
  });
  const fullOrder = detailQuery.data ?? null;

  // Estado actual (usar fullOrder si ya cargó, sino el snapshot de la lista)
  const currentEstado = (fullOrder?.estado ?? detail?.estado) as EstadoOrden;
  const pasoActual    = ESTADO_INFO[currentEstado]?.step ?? 0;
  const sigs          = detail ? (TRANSICIONES[currentEstado] ?? []) : [];
  const esCerrada     = ['cobrado', 'cancelado', 'entregado'].includes(currentEstado);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const crearMut = useMutation({
    mutationFn: serviciosApi.crear,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['servicios'] }); setOpenCreate(false); formCreate.resetFields(); message.success('Orden creada'); },
    onError:    (e: any) => message.error(e?.friendlyMessage ?? 'Error al crear orden'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, body }: any) => serviciosApi.estado(id, body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['servicios'] }); message.success('Estado actualizado'); setDetail(null); },
    onError:    (e: any) => message.error(e?.friendlyMessage ?? 'Error al actualizar estado'),
  });

  const detalleMut = useMutation({
    mutationFn: ({ id, body }: any) => serviciosApi.detalle(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      qc.invalidateQueries({ queryKey: ['servicios-detail', detail?.id] });
      setOpenDetalle(false);
      formDetalle.resetFields();
      message.success('Detalle agregado');
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'Error al agregar detalle'),
  });

  const eliminarDetalleMut = useMutation({
    mutationFn: ({ id, detalleId }: any) => serviciosApi.eliminarDetalle(id, detalleId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      qc.invalidateQueries({ queryKey: ['servicios-detail', detail?.id] });
      message.success('Detalle eliminado');
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'Error al eliminar detalle'),
  });

  const facturarMut = useMutation({
    mutationFn: serviciosApi.facturar,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['servicios'] }); setDetail(null); message.success('Convertida a factura'); },
    onError:    (e: any) => message.error(e?.friendlyMessage ?? 'Error al facturar'),
  });

  // ── Tabla ─────────────────────────────────────────────────────────────────────
  const COLS_DEF = [
    { key: 'numero',            label: 'Número',  defaultVisible: true  },
    { key: 'cli',               label: 'Cliente', defaultVisible: true  },
    { key: 'descripcionEquipo', label: 'Equipo',  defaultVisible: true  },
    { key: 'estado',            label: 'Estado',  defaultVisible: true  },
    { key: 'fechaPromesa',      label: 'Promesa', defaultVisible: true  },
    { key: 'total',             label: 'Total',   defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('servicios', COLS_DEF);

  const cols = [
    { title: 'Número',  dataIndex: 'numero',      key: 'numero',            width: 155, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Cliente', key: 'cli', ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Equipo',  dataIndex: 'descripcionEquipo', key: 'descripcionEquipo', ellipsis: true },
    { title: 'Estado',  dataIndex: 'estado',       key: 'estado',            width: 170,
      render: (v: EstadoOrden) => <Tag color={ESTADO_INFO[v]?.color}>{ESTADO_INFO[v]?.label}</Tag> },
    { title: 'Promesa', dataIndex: 'fechaPromesa', key: 'fechaPromesa',      width: 100,
      render: (v: string) => v ? <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'}>{fmt.date(v)}</Text> : '—' },
    { title: 'Total',   dataIndex: 'total',        key: 'total',             width: 110, render: (v: number) => fmt.money(v) },
    { title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetail(r)}
          viewLabel="Gestionar orden"
          items={[]}
        />
      )},
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Órdenes de Servicio</Title>

      {/* Resumen chips */}
      {resumen && (
        <Row gutter={8} style={{ marginBottom: 16 }}>
          {(resumen.porEstado ?? []).map((r: any) => (
            <Col key={r.estado}>
              <Tag color={ESTADO_INFO[r.estado as EstadoOrden]?.color} style={{ cursor: 'pointer', fontSize: 12, padding: '3px 8px' }}
                onClick={() => { setEstadoFilt(estadoFilt === r.estado ? undefined : r.estado); setPage(1); }}>
                {ESTADO_INFO[r.estado as EstadoOrden]?.label ?? r.estado}: <strong>{r.cantidad}</strong>
              </Tag>
            </Col>
          ))}
          {resumen.ordenesVencidas > 0 && (
            <Col>
              <Tag color="red" style={{ fontSize: 12, padding: '3px 8px' }}>
                ⚠️ Vencidas: <strong>{resumen.ordenesVencidas}</strong>
              </Tag>
            </Col>
          )}
        </Row>
      )}

      <Card extra={
        <Space>
          <Input
            placeholder="Buscar por nombre o número..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 220 }}
          />
          <Select placeholder="Filtrar estado" allowClear style={{ width: 180 }}
            value={estadoFilt} onChange={(v) => { setEstadoFilt(v); setPage(1); }}
            options={Object.entries(ESTADO_INFO).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((o: any) => ({
              'Número':  o.numero ?? '',
              'Fecha':   o.fecha ? dayjs(o.fecha).format('DD/MM/YYYY') : '',
              'Cliente': o.cliente?.nombre ?? '',
              'Técnico': o.tecnico ?? o.empleado?.nombre ?? '',
              'Total':   Number(o.total ?? 0),
              'Estado':  o.estado ?? '',
            }));
            exportarExcel(filas, `Servicios-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['servicios']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpenCreate(true); formCreate.resetFields(); }}>
            Nueva orden
          </Button>
        </Space>
      }>
        <Table columns={filterColumns(cols)} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small" scroll={{ x: 'max-content' }}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* ── Modal crear orden ───────────────────────────────────────────────── */}
      <Modal title="Nueva Orden de Servicio" open={openCreate} onCancel={() => setOpenCreate(false)} footer={null} width={640}>
        <Form form={formCreate} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map((c: any) => ({ value: c.id, label: c.nombre }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tecnicoId" label="Técnico asignado">
                <Select placeholder="Sin asignar" allowClear showSearch optionFilterProp="label"
                  options={(empleados ?? []).map((e: any) => ({
                    value: e.id,
                    label: `${e.nombre} ${e.apellido} — ${e.cargo ?? ''}`,
                  }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="descripcionEquipo" label="Equipo / Artículo" rules={[{ required: true }]}>
                <Input placeholder="iPhone 15, Laptop Dell, Nevera Samsung..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaPromesa" label="Fecha promesa">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="descripcionProblema" label="Descripción del problema" rules={[{ required: true }]}>
                <Input.TextArea rows={3} placeholder="Pantalla rota, no enciende, falla de batería..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="presupuesto" label="Presupuesto estimado (RD$)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notas" label="Notas internas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenCreate(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear orden</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Drawer gestión de la orden ──────────────────────────────────────── */}
      <Drawer
        title={`Orden ${detail?.numero ?? ''}`}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={740}
        extra={
          <Space>
            {!(fullOrder?.facturaId ?? detail?.facturaId) &&
             currentEstado !== 'cancelado' &&
             (fullOrder?.detalles?.length ?? 0) > 0 && (
              <Popconfirm title="¿Convertir a factura?" onConfirm={() => facturarMut.mutate(detail.id)}>
                <Button type="primary" icon={<FileTextOutlined />} loading={facturarMut.isPending}>
                  Generar factura
                </Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {detail && (
          <>
            {/* Timeline */}
            {currentEstado !== 'cancelado' && (
              <Steps current={pasoActual} size="small" style={{ marginBottom: 16 }}
                items={['Recibido','Diagnóstico','Piezas','En Proceso','Listo','Entregado','Cobrado']
                  .map(t => ({ title: t }))} />
            )}

            {/* Info */}
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cliente">{fullOrder?.cliente?.nombre ?? detail.cliente?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={ESTADO_INFO[currentEstado]?.color}>
                  {ESTADO_INFO[currentEstado]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Equipo" span={2}>{fullOrder?.descripcionEquipo ?? detail.descripcionEquipo}</Descriptions.Item>
              <Descriptions.Item label="Problema" span={2}>{fullOrder?.descripcionProblema ?? detail.descripcionProblema}</Descriptions.Item>
              {(fullOrder?.diagnostico ?? detail.diagnostico) && (
                <Descriptions.Item label="Diagnóstico" span={2}>{fullOrder?.diagnostico ?? detail.diagnostico}</Descriptions.Item>
              )}
              {(fullOrder?.fechaPromesa ?? detail.fechaPromesa) && (
                <Descriptions.Item label="Fecha Promesa">{fmt.date(fullOrder?.fechaPromesa ?? detail.fechaPromesa)}</Descriptions.Item>
              )}
              {(fullOrder?.presupuesto ?? detail.presupuesto) && (
                <Descriptions.Item label="Presupuesto">{fmt.money(fullOrder?.presupuesto ?? detail.presupuesto)}</Descriptions.Item>
              )}
              {(fullOrder?.facturaId ?? detail.facturaId) && (
                <Descriptions.Item label="Factura">#{fullOrder?.facturaId ?? detail.facturaId}</Descriptions.Item>
              )}
            </Descriptions>

            {/* ── Piezas y Mano de Obra ─────────────────────────────────────── */}
            <div style={{ marginBottom: 12 }}>
              <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                <Text strong>Piezas y Mano de Obra</Text>
                {!esCerrada && (
                  <Button size="small" icon={<PlusOutlined />}
                    onClick={() => { setOpenDetalle(true); formDetalle.resetFields(); }}>
                    Agregar
                  </Button>
                )}
              </Row>

              {detailQuery.isFetching && !fullOrder ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Spin size="small" />
                </div>
              ) : (fullOrder?.detalles?.length ?? 0) > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {['Tipo', 'Descripción', 'Cant.', 'Precio', 'Subtotal', ''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Cant.' || h === 'Precio' || h === 'Subtotal' ? 'right' : 'left',
                          fontSize: 11, textTransform: 'uppercase', color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fullOrder.detalles.map((d: any) => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <Tag style={{ fontSize: 10 }} color={d.tipo === 'mano_obra' ? 'blue' : d.tipo === 'otro' ? 'default' : 'orange'}>
                            {d.tipo === 'mano_obra' ? '👨‍🔧 M.O.' : d.tipo === 'otro' ? '📋 Otro' : '🔩 Pieza'}
                          </Tag>
                        </td>
                        <td style={{ padding: '7px 10px' }}>{d.descripcion}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{Number(d.cantidad).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt.money(d.precioUnitario)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt.money(d.subtotal)}</td>
                        <td style={{ padding: '7px 6px', textAlign: 'center', width: 36 }}>
                          {!esCerrada && (
                            <Popconfirm
                              title="¿Eliminar este detalle?"
                              okText="Sí" cancelText="No"
                              onConfirm={() => eliminarDetalleMut.mutate({ id: detail.id, detalleId: d.id })}
                            >
                              <Button type="text" size="small" danger icon={<DeleteOutlined />}
                                loading={eliminarDetalleMut.isPending} />
                            </Popconfirm>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {Number(fullOrder.totalPiezas) > 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
                          🔩 Piezas / Repuestos:
                        </td>
                        <td colSpan={2} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#374151' }}>
                          {fmt.money(fullOrder.totalPiezas)}
                        </td>
                      </tr>
                    )}
                    {Number(fullOrder.totalManoObra) > 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
                          👨‍🔧 Mano de Obra:
                        </td>
                        <td colSpan={2} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#374151' }}>
                          {fmt.money(fullOrder.totalManoObra)}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderTop: '2px solid #e0e0e0', background: '#f8f9fa' }}>
                      <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>TOTAL:</td>
                      <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#1677ff', fontSize: 15 }}>
                        {fmt.money(fullOrder.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <Text type="secondary">Sin detalles registrados</Text>
              )}
            </div>

            <Divider />

            {/* Acciones de estado */}
            {sigs.length > 0 && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Cambiar estado:</Text>
                <Space wrap>
                  {sigs.map(s => (
                    <Button key={s} size="small"
                      type={s === 'cancelado' ? 'default' : 'primary'}
                      danger={s === 'cancelado'}
                      loading={estadoMut.isPending}
                      onClick={() => estadoMut.mutate({ id: detail.id, body: { estado: s } })}>
                      {ESTADO_INFO[s as EstadoOrden]?.label}
                    </Button>
                  ))}
                </Space>
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ── Modal agregar detalle ───────────────────────────────────────────── */}
      <Modal title="Agregar Pieza / Mano de Obra" open={openDetalle}
        onCancel={() => setOpenDetalle(false)} footer={null}>
        <Form form={formDetalle} layout="vertical"
          onFinish={v => detalleMut.mutate({ id: detail?.id, body: v })}
          initialValues={{ tipo: 'pieza', cantidad: 1 }}>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'pieza',    label: '🔩 Pieza/Repuesto' },
                  { value: 'mano_obra', label: '👨‍🔧 Mano de Obra' },
                  { value: 'otro',     label: '📋 Otro' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item name="productoId" label="Producto (opcional)">
                <Select
                  showSearch allowClear
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={productos?.data.map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))}
                  onChange={(id: number) => {
                    const p = productos?.data.find((x: any) => x.id === id);
                    if (p) { formDetalle.setFieldsValue({ descripcion: p.nombre, precioUnitario: Number(p.precio) }); }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: 'Ingresa la descripción' }]}>
                <Input placeholder="Ej: Pantalla LCD 6.1, Mano de obra diagnóstico..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="precioUnitario" label="Precio (RD$)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenDetalle(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={detalleMut.isPending}>Agregar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
