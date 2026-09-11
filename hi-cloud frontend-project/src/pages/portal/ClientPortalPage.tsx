import { useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Table, Tag, Button,
         Space, Spin, Progress, Alert, Empty, Form, Input, Select,
         message, Tabs, Modal, Descriptions, theme, Tooltip } from 'antd';
import { DownloadOutlined, FileTextOutlined, CheckCircleOutlined, EyeOutlined,
         CustomerServiceOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { descargarPDFDesdeURL } from '../../utils/printUtils';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;
const portalApi = {
  getCliente:      (token: string) => api.get(`/portal/${token}`).then(d),
  getFacturas:     (token: string) => api.get(`/portal/${token}/facturas`).then(d),
  getEstadoCuenta: (token: string) => api.get(`/portal/${token}/estado-cuenta`).then(d),
  getTickets:      (token: string) => api.get(`/portal/${token}/tickets`).then(d),
  crearTicket:     (token: string, body: any) => api.post(`/portal/${token}/tickets`, body).then(d),
};

const ESTADO_TICKET: Record<string, string> = {
  abierto: 'blue', en_proceso: 'orange', resuelto: 'green', cerrado: 'default',
};
const PRIORIDAD_TICKET: Record<string, string> = {
  baja: 'default', media: 'blue', alta: 'red',
};

const estadoColor: Record<string, string> = {
  emitida: 'blue', pagada: 'green', cancelada: 'red',
};

export default function ClientPortalPage() {
  const { token: themeToken } = theme.useToken();
  const { token } = useParams<{ token: string }>();
  const [downloading, setDownloading] = useState<number | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const qc = useQueryClient();

  const { data: cliente, isLoading: loadCliente, isError, error: errorCliente } = useQuery({
    queryKey: ['portal-cliente', token],
    queryFn:  () => portalApi.getCliente(token!),
    enabled:  !!token,
    retry: 1,
  });

  const { data: facturas,    isLoading: loadFacturas }    = useQuery({ queryKey: ['portal-facturas', token],    queryFn: () => portalApi.getFacturas(token!),     enabled: !!token && !!cliente });
  const { data: estadoCuenta, isLoading: loadCuenta }     = useQuery({ queryKey: ['portal-cuenta', token],      queryFn: () => portalApi.getEstadoCuenta(token!), enabled: !!token && !!cliente });

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['portal-cliente',  token] });
    await qc.invalidateQueries({ queryKey: ['portal-facturas', token] });
    await qc.invalidateQueries({ queryKey: ['portal-cuenta',   token] });
    await qc.invalidateQueries({ queryKey: ['portal-tickets',  token] });
    setRefreshing(false);
    message.success('Datos actualizados', 2);
  };

  /**
   * Ver la factura sin descargarla.
   *
   * Se pide el PDF y se muestra en un iframe sobre un blob local. No hace falta
   * tocar el endpoint: el `Content-Disposition: attachment` que manda el
   * servidor no afecta a un blob creado aquí, y así el cliente no se lleva un
   * archivo al disco solo por querer mirar cuánto le facturaron.
   *
   * Se evita `window.open` a propósito: es lo primero que bloquea el navegador
   * cuando la llamada viene de una promesa, y el portal lo abre gente desde el
   * enlace de un correo. El «abrir en pestaña nueva» queda dentro del modal,
   * donde el clic sí es un gesto directo del usuario.
   */
  const [verPdf, setVerPdf] = useState<{ url: string; folio: string } | null>(null);
  const [viendo, setViendo] = useState<number | null>(null);

  const handleVer = async (facturaId: number, folio: string) => {
    setViendo(facturaId);
    try {
      const res = await fetch(`/api/v1/portal/${token}/facturas/${facturaId}/pdf`);
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
      const blob = await res.blob();
      setVerPdf({ url: URL.createObjectURL(blob), folio });
    } catch (err: any) {
      message.error(`No se pudo abrir la factura: ${err?.message ?? 'Error desconocido'}`, 5);
    } finally {
      setViendo(null);
    }
  };

  const cerrarVistaPdf = () => {
    // Sin revocar, cada factura abierta deja su blob en memoria hasta recargar.
    if (verPdf) URL.revokeObjectURL(verPdf.url);
    setVerPdf(null);
  };

  const handleDescargar = async (facturaId: number, folio: string) => {
    setDownloading(facturaId);
    try {
      // Usar endpoint del portal (autenticado con portalToken, no JWT de admin)
      await descargarPDFDesdeURL(`/api/v1/portal/${token}/facturas/${facturaId}/pdf`, `${folio}.pdf`);
    } catch (err: any) {
      message.error(`No se pudo descargar el PDF: ${err?.message ?? 'Error desconocido'}`, 4);
    } finally {
      setDownloading(null);
    }
  };

  if (loadCliente) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
    </div>
  );

  if (isError || !cliente) {
    // El backend distingue «no existe» de «ha expirado» y explica qué hacer en
    // cada caso. La pantalla lo sustituía por un genérico y esa distinción se
    // perdía justo cuando más falta hace.
    const motivo = (errorCliente as any)?.friendlyMessage
      ?? (errorCliente as any)?.response?.data?.message;
    const expirado = typeof motivo === 'string' && /expirad/i.test(motivo);
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Card style={{ maxWidth: 420, textAlign: 'center', borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{expirado ? '⌛' : '🔒'}</div>
          <Title level={4}>{expirado ? 'Enlace expirado' : 'Enlace inválido'}</Title>
          <Text type="secondary">
            {motivo ?? 'Este enlace no es válido o ha expirado. Contacta a la empresa para obtener uno nuevo.'}
          </Text>
        </Card>
      </div>
    );
  }

  const pctCobrado = estadoCuenta?.totalFacturado > 0
    ? Math.round((estadoCuenta.totalCobrado / estadoCuenta.totalFacturado) * 100)
    : 100;

  // `/facturas` pasó a devolver `{ items, total, mostradas }` para poder avisar
  // cuando la lista viene recortada por el tope de 50. El `?? facturas` mantiene
  // en pie la pantalla si alguna caché vieja aún trae el array pelado.
  const listaFacturas: any[] = facturas?.items ?? (Array.isArray(facturas) ? facturas : []);
  const hayMasFacturas = !!facturas?.total && facturas.total > (facturas.mostradas ?? 0);

  return (
    <div style={{ minHeight: '100vh', background: themeToken.colorFillAlter }}>
      {/* Header de la empresa */}
      <div style={{
        background: 'linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%)',
        padding: '28px 24px',
        color: '#fff',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,255,255,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#fff',
            }}>{(cliente.empresa?.nombre ?? 'H').charAt(0).toUpperCase()}</div>
            <div>
              {/* El nombre de la empresa EMISORA, no el del ERP: el cliente
                  entra a ver sus facturas y tiene que reconocer de quién son. */}
              <Text strong style={{ color: '#fff', fontSize: 18 }}>
                {cliente.empresa?.nombre ?? 'HiCloud ERP'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,.7)', display: 'block', fontSize: 12 }}>
                Portal del Cliente{cliente.empresa?.rnc ? ` · RNC ${cliente.empresa.rnc}` : ''}
              </Text>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Title level={3} style={{ color: '#fff', margin: 0 }}>
                Bienvenido, {cliente.nombre}
              </Title>
              {cliente.rfc && <Text style={{ color: 'rgba(255,255,255,.8)' }}>RNC/Cédula: {cliente.rfc}</Text>}
            </div>
            <Tooltip title="Actualizar datos">
              <Button
                icon={<ReloadOutlined spin={refreshing} />}
                onClick={handleRefresh}
                loading={refreshing}
                style={{
                  background: 'rgba(255,255,255,.15)',
                  border: '1px solid rgba(255,255,255,.3)',
                  color: '#fff',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                Actualizar
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* Estado de cuenta */}
        {estadoCuenta && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Card style={{ marginBottom: 20, borderRadius: 12 }} title="📊 Tu estado de cuenta">
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={6}>
                  <Statistic title="Total facturado" value={estadoCuenta.totalFacturado}
                    formatter={v => fmt.money(Number(v))} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="Total pagado" value={estadoCuenta.totalCobrado}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#10b981' }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="Saldo pendiente" value={estadoCuenta.saldoPendiente}
                    formatter={v => fmt.money(Number(v))}
                    valueStyle={{ color: estadoCuenta.saldoPendiente > 0 ? '#ef4444' : '#10b981' }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic title="Facturas" value={estadoCuenta.cantidadFacturas} />
                </Col>
              </Row>

              <div style={{ marginTop: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Porcentaje pagado</Text>
                <Progress
                  percent={pctCobrado}
                  strokeColor={pctCobrado >= 90 ? '#10b981' : pctCobrado >= 50 ? '#f59e0b' : '#ef4444'}
                  style={{ marginTop: 4 }}
                />
              </div>

              {estadoCuenta.saldoPendiente === 0 && (
                <Alert type="success" icon={<CheckCircleOutlined />} showIcon
                  message="¡Estás al día! No tienes saldos pendientes." style={{ marginTop: 16 }} />
              )}
            </Card>
          </motion.div>
        )}

        {/* Facturas */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <Card style={{ borderRadius: 12 }} title="🧾 Tus facturas">
            {loadFacturas ? <Spin /> : !listaFacturas.length ? (
              <Empty description="No tienes facturas registradas" />
            ) : (
              <>
              {hayMasFacturas && (
                <Alert type="info" showIcon style={{ marginBottom: 12 }}
                  message={`Se muestran las ${facturas.mostradas} facturas más recientes de ${facturas.total}. Los totales de arriba incluyen todas.`} />
              )}
              <Table
                dataSource={listaFacturas}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10, showSizeChanger: false }}
                columns={[
                  { title: 'Folio',  dataIndex: 'folio',  width: 150,
                    render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                  { title: 'Fecha',  dataIndex: 'fecha',  width: 100, render: (v: string) => fmt.date(v) },
                  { title: 'Total',  dataIndex: 'total',  width: 130,
                    render: (v: number) => <strong>{fmt.money(v)}</strong> },
                  // Lo que queda por pagar de cada una. Es el dato que el
                  // cliente viene a buscar y la tabla solo daba el total, que
                  // en una factura a medio pagar no le dice nada.
                  { title: 'Pendiente', dataIndex: 'pendiente', width: 120,
                    render: (v: number) => Number(v) > 0.005
                      ? <Text style={{ color: '#ef4444', fontWeight: 600 }}>{fmt.money(Number(v))}</Text>
                      : <Text type="secondary">—</Text> },
                  { title: 'Estado', dataIndex: 'estado', width: 110,
                    render: (v: string, r: any) => r.vencida
                      // Vencida se pinta aparte: con el mapa de colores de antes
                      // se veía idéntica a una al día, que en un portal de
                      // cobros es justo lo que no puede pasar.
                      ? <Tooltip title={`Venció el ${fmt.date(r.fechaVencimiento)}`}>
                          <Tag color="red">VENCIDA</Tag>
                        </Tooltip>
                      : <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
                  { title: '', key: 'dl', width: 170,
                    render: (_: any, r: any) => {
                      const folio = r.folio ?? r.numero ?? String(r.id);
                      return (
                        <Space size={4} wrap>
                          <Button
                            size="small" type="primary" ghost
                            icon={<EyeOutlined />}
                            loading={viendo === r.id}
                            onClick={() => handleVer(r.id, folio)}
                          >
                            Ver
                          </Button>
                          <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            loading={downloading === r.id}
                            onClick={() => handleDescargar(r.id, folio)}
                          >
                            PDF
                          </Button>
                        </Space>
                      );
                    }},
                ]}
                // El portal se abre casi siempre desde el móvil, con el enlace
                // de un correo: que la tabla scrollee en vez de apretujar las
                // columnas hasta que el folio deje de leerse.
                scroll={{ x: 'max-content' }}
              />
              </>
            )}
          </Card>
        </motion.div>

        {/* ── Sección de Tickets de Soporte ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <TicketsSoporte token={token!} clienteNombre={cliente?.nombre ?? ''} />
        </motion.div>

        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 24, fontSize: 12 }}>
          Portal seguro · Generado por HiCloud ERP · © 2026
        </Text>
      </div>

      {/* Vista de la factura — el PDF dentro del portal */}
      <Modal
        open={!!verPdf}
        onCancel={cerrarVistaPdf}
        title={`Factura ${verPdf?.folio ?? ''}`}
        width="min(900px, 96vw)"
        style={{ top: 16 }}
        footer={[
          // En iOS el iframe con PDF suele quedarse en blanco; la salida es
          // abrirlo aparte, y aquí el clic sí es un gesto directo del usuario.
          <Button key="tab" onClick={() => verPdf && window.open(verPdf.url, '_blank')}>
            Abrir en pestaña nueva
          </Button>,
          <Button key="close" type="primary" onClick={cerrarVistaPdf}>Cerrar</Button>,
        ]}
      >
        {verPdf && (
          <iframe
            src={verPdf.url}
            title={`Factura ${verPdf.folio}`}
            style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }}
          />
        )}
      </Modal>
    </div>
  );
}

// ── Sección de Tickets de Soporte ─────────────────────────────────────────────
function TicketsSoporte({ token, clienteNombre }: { token: string; clienteNombre: string }) {
  const [openForm, setOpenForm] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['portal-tickets', token],
    queryFn: () => portalApi.getTickets(token),
    enabled: !!token,
  });

  const crearMut = useMutation({
    mutationFn: (body: any) => portalApi.crearTicket(token, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-tickets', token] });
      setOpenForm(false);
      form.resetFields();
      message.success('Ticket creado. Un agente te responderá pronto.');
    },
    onError: () => message.error('Error al crear el ticket'),
  });

  const cols = [
    { title: '#', dataIndex: 'id', width: 60 },
    { title: 'Asunto', dataIndex: 'asunto', ellipsis: true },
    { title: 'Categoría', dataIndex: 'categoria', width: 130,
      render: (v: string) => <Tag>{v?.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Prioridad', dataIndex: 'prioridad', width: 90,
      render: (v: string) => <Tag color={PRIORIDAD_TICKET[v]}>{v?.toUpperCase()}</Tag> },
    { title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={ESTADO_TICKET[v]}>{v?.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Respuesta', dataIndex: 'respuesta', ellipsis: true,
      render: (v: string) => v ? <Text style={{ color: '#10b981', fontSize: 12 }}>{v}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>En espera...</Text> },
  ];

  return (
    <Card
      title={<Space><CustomerServiceOutlined style={{ color: '#1677ff' }} /><span>Soporte & Consultas</span></Space>}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpenForm(true); }}>Nuevo ticket</Button>}
      style={{ marginTop: 16, borderRadius: 12 }}
    >
      {(tickets ?? []).length === 0 && !isLoading ? (
        <Empty description="No tienes tickets abiertos. Si necesitas ayuda, crea uno." />
      ) : (
        <Table columns={cols} dataSource={tickets ?? []} rowKey="id" size="small" loading={isLoading} pagination={{ pageSize: 10 }} 
        scroll={{ x: 'max-content' }} />
      )}

      <Modal title="Nuevo ticket de soporte" open={openForm}
        onCancel={() => { setOpenForm(false); form.resetFields(); }} footer={null} width={480}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Form.Item name="asunto" label="Asunto" rules={[{ required: true }]}>
            <Input placeholder="Describe brevemente tu consulta" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="categoria" label="Categoría" initialValue="consulta">
                <Select options={[
                  { value: 'soporte_tecnico', label: '🔧 Soporte Técnico' },
                  { value: 'facturacion',     label: '🧾 Facturación' },
                  { value: 'devolucion',      label: '↩️ Devolución' },
                  { value: 'consulta',        label: '❓ Consulta General' },
                  { value: 'otro',            label: '📋 Otro' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="prioridad" label="Prioridad" initialValue="media">
                <Select options={[
                  { value: 'baja',  label: '🟢 Baja' },
                  { value: 'media', label: '🔵 Media' },
                  { value: 'alta',  label: '🔴 Alta' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Describe tu problema o consulta con el mayor detalle posible..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpenForm(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Enviar ticket</Button></Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
