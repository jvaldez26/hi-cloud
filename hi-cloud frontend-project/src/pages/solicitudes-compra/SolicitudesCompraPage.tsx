import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import {
  Tabs, Table, Button, Tag, Space, Modal, Form, Input, InputNumber,
  Select, Row, Col, Typography, Card, Statistic, Popconfirm,
  message, Descriptions, Drawer, Alert, Badge, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, CheckOutlined, CloseOutlined,
  FileTextOutlined, ShoppingCartOutlined, BarChartOutlined,
  SendOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { solicitudesCompraApi, type CreateSolicitudPayload, type CreateCotizacionPayload } from '../../api/solicitudes-compra.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const PRIORIDAD_COLOR: Record<string, string> = {
  baja: 'default', media: 'blue', alta: 'orange', urgente: 'red',
};
const ESTADO_SOL_COLOR: Record<string, string> = {
  borrador: 'default', enviada: 'blue', aprobada: 'green',
  rechazada: 'red', en_cotizacion: 'purple', procesada: 'cyan', cancelada: 'gray',
};
const ESTADO_COT_COLOR: Record<string, string> = {
  borrador: 'default', enviada: 'blue', recibida: 'green',
  seleccionada: 'gold', rechazada: 'red',
};

// ── Tab Solicitudes ────────────────────────────────────────────────────────────
function SolicitudesTab() {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [cotModal, setCotModal] = useState<any>(null);
  const [comparativoId, setComparativoId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [form] = Form.useForm<CreateSolicitudPayload>();
  const [formCot] = Form.useForm<CreateCotizacionPayload>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['solicitudes-compra', page, estadoFiltro],
    queryFn: () => solicitudesCompraApi.listar({ page, estado: estadoFiltro }),
  });
  const { data: resumen } = useQuery({
    queryKey: ['solicitudes-compra-resumen'],
    queryFn: solicitudesCompraApi.resumen,
  });
  const { data: comparativo, isLoading: loadingComp } = useQuery({
    queryKey: ['comparativo', comparativoId],
    queryFn: () => solicitudesCompraApi.comparativo(comparativoId!),
    enabled: comparativoId !== null,
  });
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-sel'],
    queryFn: () => proveedoresApi.list(1, 200),
  });

  const crearMut = useMutation({
    mutationFn: solicitudesCompraApi.crear,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-compra'] }); qc.invalidateQueries({ queryKey: ['solicitudes-compra-resumen'] }); setOpen(false); form.resetFields(); message.success('Solicitud creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const estadoMut = useMutation({
    mutationFn: ({ id, estado, comentario }: { id: number; estado: string; comentario?: string }) =>
      solicitudesCompraApi.cambiarEstado(id, estado, comentario),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-compra'] }); qc.invalidateQueries({ queryKey: ['solicitudes-compra-resumen'] }); message.success('Estado actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const cotMut = useMutation({
    mutationFn: solicitudesCompraApi.crearCotizacion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-compra'] }); setCotModal(null); formCot.resetFields(); message.success('Cotización enviada al proveedor'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const provOpts = (proveedores?.data ?? []).map((p: any) => ({ value: p.id, label: p.nombre }));

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 130 },
    { title: 'Solicitante', key: 'sol', render: (_: any, r: any) => `${r.solicitante?.nombre ?? ''} ${r.solicitante?.apellido ?? ''}` },
    { title: 'Depto.', dataIndex: 'departamento', width: 120, render: (v: string) => v ?? '—' },
    { title: 'Prioridad', dataIndex: 'prioridad', width: 100,
      render: (v: string) => <Tag color={PRIORIDAD_COLOR[v]}>{v?.toUpperCase()}</Tag> },
    { title: 'Fecha Nec.', dataIndex: 'fechaNecesidad', width: 110, render: (v: string) => v ? fmt.date(v) : '—' },
    { title: 'Estado', dataIndex: 'estado', width: 130,
      render: (v: string) => <Tag color={ESTADO_SOL_COLOR[v]}>{v?.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Ítems', key: 'items', width: 70, render: (_: any, r: any) => r.lineas?.length ?? 0 },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalle(r)}
          viewLabel="Ver solicitud"
          items={[
            ...(r.estado === 'borrador' ? [
              { key: 'enviar', label: 'Enviar para aprobación', icon: <SendOutlined />,
                onClick: () => estadoMut.mutate({ id: r.id, estado: 'enviada' }) },
            ] : []),
            ...(r.estado === 'aprobada' ? [
              { key: 'cotizar', label: 'Cotizar con proveedor', icon: <ShoppingCartOutlined />,
                onClick: () => setCotModal(r) },
            ] : []),
            ...((r.estado === 'en_cotizacion' || r.estado === 'aprobada') ? [
              { key: 'comparar', label: 'Comparar cotizaciones', icon: <BarChartOutlined />,
                onClick: () => setComparativoId(r.id) },
            ] : []),
          ]}
        />
      ) },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Space>
            <Select placeholder="Filtrar estado" value={estadoFiltro} onChange={setEstadoFiltro} allowClear style={{ width: 180 }}>
              {['borrador','enviada','aprobada','rechazada','en_cotizacion','procesada','cancelada'].map(e =>
                <Select.Option key={e} value={e}>{e.replace('_',' ').toUpperCase()}</Select.Option>
              )}
            </Select>
          </Space>
        </Col>
        <Col>
          <Space size={2}>
            <RefreshByKeyButton queryKey={['solicitudes-compra']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
              Nueva solicitud
            </Button>
          </Space>
        </Col>
      </Row>

      <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        pagination={{ total: data?.meta?.total, pageSize: 15, current: page, onChange: setPage, showSizeChanger: false }} 
        scroll={{ x: 'max-content' }} />

      {/* Modal crear solicitud */}
      <Modal title="Nueva Solicitud de Compra" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={780}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}>
              <Form.Item name="justificacion" label="Justificación" rules={[{ required: true }]}>
                <Input.TextArea rows={3} placeholder="Describe el motivo de la compra..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="prioridad" label="Prioridad" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'baja', label: '🟢 Baja' }, { value: 'media', label: '🔵 Media' },
                  { value: 'alta', label: '🟠 Alta' }, { value: 'urgente', label: '🔴 Urgente' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}><Form.Item name="departamento" label="Departamento"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaNecesidad" label="Fecha necesidad"><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="presupuestoEstimado" label="Presupuesto est. (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>

          <Divider>Ítems solicitados</Divider>
          <Form.List name="lineas" initialValue={[{}]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={9}><Form.Item name={[name, 'descripcion']} rules={[{ required: true }]} style={{ margin: 0 }}><Input placeholder="Descripción del ítem" /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'cantidad']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Cant." min={0.001} style={{ width: '100%' }} precision={2} /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'unidad']} style={{ margin: 0 }}><Input placeholder="UND" /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'presupuestoUnitario']} style={{ margin: 0 }}><InputNumber placeholder="Precio est." min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'especificaciones']} style={{ margin: 0 }}><Input placeholder="Especif." /></Form.Item></Col>
                    <Col xs={12} sm={1}><Button type="text" danger size="small" onClick={() => remove(name)} icon={<CloseOutlined />} /></Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add({})} block icon={<PlusOutlined />}>Agregar ítem</Button>
              </>
            )}
          </Form.List>

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear solicitud</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer detalle solicitud */}
      <Drawer title={`Solicitud ${detalle?.numero}`} open={!!detalle} onClose={() => setDetalle(null)} width={560}>
        {detalle && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Estado" span={2}>
                <Tag color={ESTADO_SOL_COLOR[detalle.estado]}>{detalle.estado?.replace('_',' ').toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Prioridad"><Tag color={PRIORIDAD_COLOR[detalle.prioridad]}>{detalle.prioridad?.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Depto.">{detalle.departamento ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Solicitante">{detalle.solicitante?.nombre} {detalle.solicitante?.apellido}</Descriptions.Item>
              <Descriptions.Item label="Fecha Nec.">{detalle.fechaNecesidad ? fmt.date(detalle.fechaNecesidad) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Presupuesto est." span={2}>{fmt.money(detalle.presupuestoEstimado ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Justificación" span={2}>{detalle.justificacion}</Descriptions.Item>
              {detalle.comentarioAprobacion && <Descriptions.Item label="Comentario aprobador" span={2}>{detalle.comentarioAprobacion}</Descriptions.Item>}
            </Descriptions>

            <Title level={5}>Ítems</Title>
            <Table size="small" pagination={false} dataSource={detalle.lineas ?? []} rowKey="id" columns={[
              { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
              { title: 'Cant.', dataIndex: 'cantidad', width: 70, render: (v: number) => fmt.number(v) },
              { title: 'Unidad', dataIndex: 'unidad', width: 70 },
              { title: 'Pres. unit.', dataIndex: 'presupuestoUnitario', width: 110, render: (v: number) => v > 0 ? fmt.money(v) : '—' },
            ]} 
        scroll={{ x: 'max-content' }} />

            <Divider />
            {detalle.estado === 'enviada' && (
              <Space>
                <Popconfirm title="¿Aprobar solicitud?" onConfirm={() => estadoMut.mutate({ id: detalle.id, estado: 'aprobada' })}>
                  <Button type="primary" icon={<CheckOutlined />}>Aprobar</Button>
                </Popconfirm>
                <Popconfirm title="¿Rechazar solicitud?" onConfirm={() => estadoMut.mutate({ id: detalle.id, estado: 'rechazada', comentario: 'Rechazado' })}>
                  <Button danger icon={<CloseOutlined />}>Rechazar</Button>
                </Popconfirm>
              </Space>
            )}
          </>
        )}
      </Drawer>

      {/* Modal enviar cotización a proveedor */}
      <Modal title={`Solicitar cotización — ${cotModal?.numero}`} open={!!cotModal}
        onCancel={() => { setCotModal(null); formCot.resetFields(); }} footer={null} width={760}>
        <Alert type="info" showIcon message="Completa los ítems y el proveedor al que deseas solicitar precios." style={{ marginBottom: 12, fontSize: 12 }} />
        <Form form={formCot} layout="vertical"
          onFinish={(v) => cotMut.mutate({ ...v, solicitudId: cotModal?.id })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={provOpts} />
            </Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="fechaValidez" label="Válida hasta"><Input type="date" /></Form.Item></Col>
            <Col xs={12} sm={6}><Form.Item name="tiempoEntregaDias" label="Días entrega"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="condicionesPago" label="Condiciones de pago"><Input placeholder="Ej. 30 días, contado..." /></Form.Item></Col>
          </Row>
          <Divider>Ítems a cotizar</Divider>
          <Form.List name="lineas" initialValue={(cotModal?.lineas ?? []).map((l: any) => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, precioUnitario: 0, porcentajeItbis: 18 }))}>
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={8}><Form.Item name={[name, 'descripcion']} rules={[{ required: true }]} style={{ margin: 0 }}><Input placeholder="Descripción" /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'cantidad']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Cant." min={0.001} style={{ width: '100%' }} precision={2} /></Form.Item></Col>
                    <Col xs={12} sm={2}><Form.Item name={[name, 'unidad']} style={{ margin: 0 }}><Input placeholder="UND" /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'precioUnitario']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Precio" min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'porcentajeItbis']} style={{ margin: 0 }}><InputNumber placeholder="ITBIS%" min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={1}><Button type="text" danger size="small" icon={<CloseOutlined />} onClick={() => remove(name)} /></Col>
                  </Row>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ porcentajeItbis: 18 })}>Agregar ítem</Button>
              </>
            )}
          </Form.List>
          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => { setCotModal(null); formCot.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={cotMut.isPending} icon={<SendOutlined />}>Enviar solicitud</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal comparativo */}
      <Modal title="Comparativo de Propuestas" open={comparativoId !== null}
        onCancel={() => setComparativoId(null)} footer={null} width={980}>
        {loadingComp && <Text>Cargando comparativo...</Text>}
        {comparativo && (
          <>
            <Row gutter={12} style={{ marginBottom: 16 }}>
              {(comparativo.cotizaciones ?? []).map((c: any) => (
                <Col xs={24} sm={12} md={8} key={c.id}>
                  <Card size="small"
                    style={{ borderColor: c.seleccionada ? '#faad14' : c.estado === 'recibida' ? '#52c41a' : undefined }}
                    title={
                      <Space>
                        {c.seleccionada && <TrophyOutlined style={{ color: '#faad14' }} />}
                        <Text strong>{c.proveedor}</Text>
                        <Tag color={ESTADO_COT_COLOR[c.estado]}>{c.estado?.toUpperCase()}</Tag>
                      </Space>
                    }
                    extra={!c.seleccionada && c.estado === 'recibida' && (
                      <Popconfirm title="¿Seleccionar este proveedor? Las demás cotizaciones quedarán rechazadas."
                        onConfirm={() => solicitudesCompraApi.seleccionar(c.cotizacionId ?? c.id).then(() => { qc.invalidateQueries({ queryKey: ['comparativo'] }); qc.invalidateQueries({ queryKey: ['solicitudes-compra'] }); message.success('Proveedor seleccionado'); })}>
                        <Button size="small" type="primary" icon={<TrophyOutlined />}>Seleccionar</Button>
                      </Popconfirm>
                    )}>
                    <Row gutter={8}>
                      <Col xs={24} sm={12}><Statistic title="Total" value={c.total} formatter={v => fmt.money(Number(v))} valueStyle={{ fontSize: 13, color: '#1677ff' }} /></Col>
                      <Col xs={24} sm={12}><Statistic title="Entrega" value={c.tiempoEntregaDias} suffix="días" valueStyle={{ fontSize: 13 }} /></Col>
                    </Row>
                    {c.condicionesPago && <Text type="secondary" style={{ fontSize: 11 }}>{c.condicionesPago}</Text>}
                  </Card>
                </Col>
              ))}
            </Row>

            <Title level={5}>Detalle por ítem</Title>
            <Table size="small" pagination={false} scroll={{ x: 700 }}
              dataSource={comparativo.comparativo ?? []} rowKey="descripcion"
              columns={[
                { title: 'Ítem', dataIndex: 'descripcion', ellipsis: true, width: 200 },
                ...(comparativo.cotizaciones ?? []).map((c: any) => ({
                  title: c.proveedor,
                  key: `prov-${c.id}`,
                  width: 130,
                  align: 'right' as const,
                  render: (_: any, row: any) => {
                    const prov = row.proveedores?.find((p: any) => p.proveedorId === c.proveedorId);
                    if (!prov?.disponible) return <Text type="secondary">—</Text>;
                    const esMenor = prov.precioUnitario === comparativo.menorPorLinea?.find((m: any) => m.descripcion === row.descripcion)?.menorPrecio;
                    return <Tooltip title={`Unit: ${fmt.money(prov.precioUnitario)}`}>
                      <Text style={{ color: esMenor ? '#52c41a' : undefined, fontWeight: esMenor ? 700 : undefined }}>
                        {fmt.money(prov.total)}
                        {esMenor && ' ✓'}
                      </Text>
                    </Tooltip>;
                  },
                })),
              ]} />
          </>
        )}
      </Modal>
    </>
  );
}

// ── Tab Cotizaciones ───────────────────────────────────────────────────────────
function CotizacionesTab() {
  const [detalle, setDetalle] = useState<any>(null);
  const [respModal, setRespModal] = useState<any>(null);
  const [formResp] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['cotizaciones-proveedor'],
    queryFn: () => solicitudesCompraApi.listarCotizaciones(),
  });

  const respMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => solicitudesCompraApi.registrarRespuesta(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones-proveedor'] }); setRespModal(null); formResp.resetFields(); message.success('Respuesta registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 130 },
    { title: 'Proveedor', key: 'prov', render: (_: any, r: any) => r.proveedor?.nombre },
    { title: 'Solicitud', key: 'sol', width: 130, render: (_: any, r: any) => r.solicitud?.numero ?? '—' },
    { title: 'Enviada', dataIndex: 'fechaEnvio', width: 105, render: (v: string) => fmt.date(v) },
    { title: 'Respuesta', dataIndex: 'fechaRespuesta', width: 105, render: (v: string) => v ? fmt.date(v) : '—' },
    { title: 'Total', dataIndex: 'total', width: 120, render: (v: number) => v > 0 ? fmt.money(v) : '—' },
    { title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COT_COLOR[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'acc', width: 160,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetalle(r)}>Ver</Button>
          {r.estado === 'enviada' && (
            <Button size="small" type="primary" onClick={() => { setRespModal(r); formResp.setFieldsValue({ lineas: r.lineas?.map((l: any) => ({ ...l, precioUnitario: 0, porcentajeItbis: 18 })) }); }}>
              Registrar respuesta
            </Button>
          )}
        </Space>
      ) },
  ];

  return (
    <>
      <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 15 }} 
        scroll={{ x: 'max-content' }} />

      <Drawer title={`Cotización ${detalle?.numero}`} open={!!detalle} onClose={() => setDetalle(null)} width={560}>
        {detalle && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Proveedor" span={2}><Text strong>{detalle.proveedor?.nombre}</Text></Descriptions.Item>
              <Descriptions.Item label="Estado"><Tag color={ESTADO_COT_COLOR[detalle.estado]}>{detalle.estado?.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Entrega">{detalle.tiempoEntregaDias} días</Descriptions.Item>
              <Descriptions.Item label="Condiciones" span={2}>{detalle.condicionesPago ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{fmt.money(detalle.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="ITBIS">{fmt.money(detalle.itbis)}</Descriptions.Item>
              <Descriptions.Item label="Total" span={2}><Text strong style={{ fontSize: 16 }}>{fmt.money(detalle.total)}</Text></Descriptions.Item>
            </Descriptions>
            <Table size="small" pagination={false} dataSource={detalle.lineas ?? []} rowKey="id" columns={[
              { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
              { title: 'Cant.', dataIndex: 'cantidad', width: 70 },
              { title: 'Precio unit.', dataIndex: 'precioUnitario', width: 110, render: (v: number) => fmt.money(v) },
              { title: 'Total', dataIndex: 'total', width: 110, render: (v: number) => fmt.money(v) },
            ]} 
        scroll={{ x: 'max-content' }} />
          </>
        )}
      </Drawer>

      <Modal title="Registrar respuesta del proveedor" open={!!respModal}
        onCancel={() => { setRespModal(null); formResp.resetFields(); }} footer={null} width={700}>
        <Form form={formResp} layout="vertical" onFinish={(v) => respMut.mutate({ id: respModal.id, body: v })}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fechaRespuesta" label="Fecha respuesta"><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tiempoEntregaDias" label="Días entrega"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="condicionesPago" label="Condiciones"><Input /></Form.Item></Col>
          </Row>
          <Divider>Precios ofrecidos</Divider>
          <Form.List name="lineas" initialValue={respModal?.lineas?.map((l: any) => ({ descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, precioUnitario: 0, porcentajeItbis: 18 })) ?? []}>
            {(fields) => fields.map(({ key, name }) => (
              <Row key={key} gutter={8} style={{ marginBottom: 8 }}>
                <Col xs={24} sm={8}><Form.Item name={[name, 'descripcion']} style={{ margin: 0 }}><Input readOnly /></Form.Item></Col>
                <Col xs={12} sm={3}><Form.Item name={[name, 'cantidad']} style={{ margin: 0 }}><InputNumber min={0.001} style={{ width: '100%' }} precision={2} /></Form.Item></Col>
                <Col xs={12} sm={2}><Form.Item name={[name, 'unidad']} style={{ margin: 0 }}><Input /></Form.Item></Col>
                <Col xs={12} sm={5}><Form.Item name={[name, 'precioUnitario']} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber placeholder="Precio unit." min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={12} sm={4}><Form.Item name={[name, 'porcentajeItbis']} style={{ margin: 0 }}><InputNumber placeholder="ITBIS%" min={0} max={100} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
            ))}
          </Form.List>
          <Row justify="end" gutter={8} style={{ marginTop: 12 }}>
            <Col><Button onClick={() => { setRespModal(null); formResp.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={respMut.isPending}>Guardar respuesta</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Page Principal ─────────────────────────────────────────────────────────────
export default function SolicitudesCompraPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Compras Avanzadas</Title>
      <Card>
        <Tabs defaultActiveKey="solicitudes" items={[
          { key: 'solicitudes',  label: <><FileTextOutlined /> Solicitudes de Compra</>,            children: <SolicitudesTab /> },
          { key: 'cotizaciones', label: <><ShoppingCartOutlined /> Cotizaciones a Proveedores</>,  children: <CotizacionesTab /> },
        ]} />
      </Card>
    </div>
  );
}
