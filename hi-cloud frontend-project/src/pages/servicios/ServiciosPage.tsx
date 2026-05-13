import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic,
         Modal, Form, Input, InputNumber, Select, DatePicker, Space,
         Drawer, Descriptions, Popconfirm, message, Divider, Steps } from 'antd';
import {
  PlusOutlined, ToolOutlined, FileTextOutlined, FileExcelOutlined,
  CheckOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
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
  resumen:   ()         => api.get('/servicios/resumen').then(r => r.data?.data ?? r.data),
  list:      (p = 1, estado?: string) =>
    api.get(`/servicios?page=${p}${estado ? `&estado=${estado}` : ''}`).then(r => r.data?.data ?? r.data),
  getOne:    (id: number) => api.get(`/servicios/${id}`).then(r => r.data?.data ?? r.data),
  crear:     (body: any)  => api.post('/servicios', body).then(r => r.data?.data ?? r.data),
  estado:    (id: number, body: any) => api.patch(`/servicios/${id}/estado`, body).then(r => r.data?.data ?? r.data),
  diagnostico:(id: number, body: any) => api.patch(`/servicios/${id}/diagnostico`, body).then(r => r.data?.data ?? r.data),
  detalle:   (id: number, body: any) => api.post(`/servicios/${id}/detalles`, body).then(r => r.data?.data ?? r.data),
  facturar:  (id: number) => api.post(`/servicios/${id}/facturar`).then(r => r.data?.data ?? r.data),
};

export default function ServiciosPage() {
  const [page,       setPage]       = useState(1);
  const [estadoFilt, setEstadoFilt] = useState<string | undefined>();
  const [openCreate, setOpenCreate] = useState(false);
  const [detail,     setDetail]     = useState<any>(null);
  const [openDetalle,setOpenDetalle]= useState(false);
  const [formCreate] = Form.useForm();
  const [formDetalle]= Form.useForm();
  const qc = useQueryClient();

  const { data: resumen } = useQuery({ queryKey: ['srv-resumen'], queryFn: serviciosApi.resumen });
  const { data, isLoading } = useQuery({
    queryKey: ['servicios', page, estadoFilt],
    queryFn:  () => serviciosApi.list(page, estadoFilt),
  });
  const { data: clientes }  = useQuery({ queryKey: ['cli-srv'],   queryFn: () => clientesApi.list(1, 100) });
  const { data: productos } = useQuery({ queryKey: ['prod-srv'],  queryFn: () => productosApi.list(1, 200) });
  const { data: empleados = [] } = useQuery<any[]>({ queryKey: ['emp-srv'], queryFn: () => api.get('/nomina/empleados?limit=100').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }).catch(() => []) });

  const crearMut   = useMutation({ mutationFn: serviciosApi.crear,    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servicios'] }); setOpenCreate(false); formCreate.resetFields(); message.success('Orden creada'); }, onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al crear orden') });
  const estadoMut  = useMutation({ mutationFn: ({ id, body }: any) => serviciosApi.estado(id, body),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['servicios'] }); message.success('Estado actualizado'); setDetail(null); }, onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al actualizar estado') });
  const detalleMut = useMutation({ mutationFn: ({ id, body }: any) => serviciosApi.detalle(id, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['servicios'] }); setOpenDetalle(false); formDetalle.resetFields(); message.success('Detalle agregado'); }, onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al agregar detalle') });
  const facturarMut= useMutation({ mutationFn: serviciosApi.facturar, onSuccess: () => { qc.invalidateQueries({ queryKey: ['servicios'] }); setDetail(null); message.success('Convertida a factura'); }, onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al facturar') });

  const cols = [
    { title: 'Número',   dataIndex: 'numero',       width: 155, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Cliente',  key: 'cli', ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Equipo',   dataIndex: 'descripcionEquipo', ellipsis: true },
    { title: 'Estado',   dataIndex: 'estado', width: 160,
      render: (v: EstadoOrden) => <Tag color={ESTADO_INFO[v]?.color}>{ESTADO_INFO[v]?.label}</Tag> },
    { title: 'Promesa',  dataIndex: 'fechaPromesa', width: 100,
      render: (v: string) => v ? <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'}>{fmt.date(v)}</Text> : '—' },
    { title: 'Total',    dataIndex: 'total', width: 110, render: (v: number) => fmt.money(v) },
    { title: '', key: 'actions', width: 80,
      render: (_: any, r: any) => <Button size="small" icon={<ToolOutlined />} onClick={() => setDetail(r)}>Gestionar</Button> },
  ];

  const pasoActual = detail ? ESTADO_INFO[detail.estado as EstadoOrden]?.step ?? 0 : 0;
  const sigs = detail ? TRANSICIONES[detail.estado as EstadoOrden] : [];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Órdenes de Servicio</Title>

      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(resumen?.porEstado ?? []).map((s: any, i: number) => (
          <Col key={s.estado}>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .05 }}>
              <Card size="small" style={{ minWidth: 110 }}>
                <Statistic title={ESTADO_INFO[s.estado as EstadoOrden]?.label ?? s.estado}
                  value={s.cantidad}
                  valueStyle={{ color: s.estado === 'cancelado' ? '#9ca3af' : undefined, fontSize: 20 }} />
              </Card>
            </motion.div>
          </Col>
        ))}
        {(resumen?.ordenesVencidas ?? 0) > 0 && (
          <Col>
            <Card size="small" style={{ borderColor: '#fca5a5', minWidth: 110 }}>
              <Statistic title={<><WarningOutlined style={{ color: '#ef4444' }} /> Vencidas</>}
                value={resumen.ordenesVencidas} valueStyle={{ color: '#ef4444' }} />
            </Card>
          </Col>
        )}
      </Row>

      <Card extra={
        <Space>
          <Select placeholder="Filtrar estado" allowClear style={{ width: 180 }}
            value={estadoFilt} onChange={(v) => { setEstadoFilt(v); setPage(1); }}
            options={Object.entries(ESTADO_INFO).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((o: any) => ({
              'Número':    o.numero ?? '',
              'Fecha':     o.fecha ? dayjs(o.fecha).format('DD/MM/YYYY') : '',
              'Cliente':   o.cliente?.nombre ?? '',
              'Técnico':   o.tecnico ?? o.empleado?.nombre ?? '',
              'Total':     Number(o.total ?? 0),
              'Estado':    o.estado ?? '',
            }));
            exportarExcel(filas, `Servicios-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpenCreate(true); formCreate.resetFields(); }}>
            Nueva orden
          </Button>
        </Space>
      }>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Modal crear orden */}
      <Modal title="Nueva Orden de Servicio" open={openCreate} onCancel={() => setOpenCreate(false)} footer={null} width={640}>
        <Form form={formCreate} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map((c: any) => ({ value: c.id, label: `${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tecnicoId" label="Técnico asignado">
                <Select
                  placeholder="Sin asignar"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={(empleados ?? []).map((e: any) => ({
                    value: e.id,
                    label: `${e.nombre} ${e.apellido} — ${e.cargo ?? ''}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="descripcionEquipo" label="Equipo / Artículo" rules={[{ required: true }]}>
                <Input placeholder="iPhone 15, Laptop Dell, Nevera Samsung..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fechaPromesa" label="Fecha promesa">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="descripcionProblema" label="Descripción del problema" rules={[{ required: true }]}>
                <Input.TextArea rows={3} placeholder="Pantalla rota, no enciende, falla de batería..." />
              </Form.Item>
            </Col>
            <Col span={12}>
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

      {/* Drawer gestión de la orden */}
      <Drawer title={`Orden ${detail?.numero}`} open={!!detail}
        onClose={() => setDetail(null)} width={720}
        extra={
          <Space>
            {!detail?.facturaId && detail?.estado !== 'cancelado' && detail?.detalles?.length > 0 && (
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
            {/* Timeline de estados */}
            {detail.estado !== 'cancelado' && (
              <Steps current={pasoActual} size="small" style={{ marginBottom: 16 }}
                items={['Recibido','Diagnóstico','Piezas','En Proceso','Listo','Entregado','Cobrado']
                  .map(t => ({ title: t }))} />
            )}

            {/* Info */}
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cliente">{detail.cliente?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={ESTADO_INFO[detail.estado as EstadoOrden]?.color}>
                  {ESTADO_INFO[detail.estado as EstadoOrden]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Equipo" span={2}>{detail.descripcionEquipo}</Descriptions.Item>
              <Descriptions.Item label="Problema" span={2}>{detail.descripcionProblema}</Descriptions.Item>
              {detail.diagnostico && <Descriptions.Item label="Diagnóstico" span={2}>{detail.diagnostico}</Descriptions.Item>}
              {detail.fechaPromesa && <Descriptions.Item label="Fecha Promesa">{fmt.date(detail.fechaPromesa)}</Descriptions.Item>}
              {detail.presupuesto  && <Descriptions.Item label="Presupuesto">{fmt.money(detail.presupuesto)}</Descriptions.Item>}
              {detail.facturaId    && <Descriptions.Item label="Factura">{detail.facturaId}</Descriptions.Item>}
            </Descriptions>

            {/* Detalles (piezas/trabajo) */}
            <div style={{ marginBottom: 12 }}>
              <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                <Text strong>Piezas y Mano de Obra</Text>
                {!['cobrado','cancelado','entregado'].includes(detail.estado) && (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => { setOpenDetalle(true); formDetalle.resetFields(); }}>
                    Agregar
                  </Button>
                )}
              </Row>
              {detail.detalles?.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {['Tipo','Descripción','Cant.','Precio','Subtotal'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#6b7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.detalles.map((d: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '7px 10px' }}><Tag style={{ fontSize: 10 }}>{d.tipo}</Tag></td>
                        <td style={{ padding: '7px 10px' }}>{d.descripcion}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.cantidad}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt.money(d.precioUnitario)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt.money(d.subtotal)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8f9fa', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right' }}>TOTAL:</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1677ff', fontSize: 15 }}>
                        {fmt.money(detail.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : <Text type="secondary">Sin detalles registrados</Text>}
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

      {/* Modal agregar detalle */}
      <Modal title="Agregar Pieza / Mano de Obra" open={openDetalle}
        onCancel={() => setOpenDetalle(false)} footer={null}>
        <Form form={formDetalle} layout="vertical"
          onFinish={v => detalleMut.mutate({ id: detail?.id, body: v })}
          initialValues={{ tipo: 'pieza', cantidad: 1 }}>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="tipo" label="Tipo">
                <Select options={[{ value: 'pieza', label: '🔩 Pieza/Repuesto' }, { value: 'mano_obra', label: '👨‍🔧 Mano de Obra' }, { value: 'otro', label: '📋 Otro' }]} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="productoId" label="Producto (opcional)">
                <Select showSearch allowClear
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={productos?.data.map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))}
                  onChange={(id: number) => {
                    const p = productos?.data.find((x: any) => x.id === id);
                    if (p) { formDetalle.setFieldsValue({ descripcion: p.nombre, precioUnitario: Number(p.precio) }); }
                  }} />
              </Form.Item>
            </Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0.01} precision={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="precioUnitario" label="Precio (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
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
