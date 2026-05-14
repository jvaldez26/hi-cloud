import { useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Table, Tag, Button,
         Space, Spin, Progress, Alert, Empty, Form, Input, Select,
         message, Tabs, Modal, Descriptions, theme } from 'antd';
import { DownloadOutlined, FileTextOutlined, CheckCircleOutlined,
         CustomerServiceOutlined, PlusOutlined } from '@ant-design/icons';
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

  const { data: cliente, isLoading: loadCliente, isError } = useQuery({
    queryKey: ['portal-cliente', token],
    queryFn:  () => portalApi.getCliente(token!),
    enabled:  !!token,
    retry: 1,
  });

  const { data: facturas,    isLoading: loadFacturas }    = useQuery({ queryKey: ['portal-facturas', token],    queryFn: () => portalApi.getFacturas(token!),     enabled: !!token && !!cliente });
  const { data: estadoCuenta, isLoading: loadCuenta }     = useQuery({ queryKey: ['portal-cuenta', token],      queryFn: () => portalApi.getEstadoCuenta(token!), enabled: !!token && !!cliente });

  const handleDescargar = async (facturaId: number, folio: string) => {
    setDownloading(facturaId);
    try {
      await descargarPDFDesdeURL(`/api/v1/facturas/${facturaId}/pdf`, `${folio}.pdf`);
    } finally {
      setDownloading(null);
    }
  };

  if (loadCliente) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
    </div>
  );

  if (isError || !cliente) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 400, textAlign: 'center', borderRadius: 16 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <Title level={4}>Enlace inválido</Title>
        <Text type="secondary">Este enlace no es válido o ha expirado. Contacta a la empresa para obtener uno nuevo.</Text>
      </Card>
    </div>
  );

  const pctCobrado = estadoCuenta?.totalFacturado > 0
    ? Math.round((estadoCuenta.totalCobrado / estadoCuenta.totalFacturado) * 100)
    : 100;

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
            }}>H</div>
            <div>
              <Text strong style={{ color: '#fff', fontSize: 18 }}>HiCloud ERP</Text>
              <Text style={{ color: 'rgba(255,255,255,.7)', display: 'block', fontSize: 12 }}>Portal del Cliente</Text>
            </div>
          </div>
          <Title level={3} style={{ color: '#fff', margin: 0 }}>
            Bienvenido, {cliente.nombre}
          </Title>
          {cliente.rfc && <Text style={{ color: 'rgba(255,255,255,.8)' }}>RFC/RNC: {cliente.rfc}</Text>}
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
            {loadFacturas ? <Spin /> : !facturas?.length ? (
              <Empty description="No tienes facturas registradas" />
            ) : (
              <Table
                dataSource={facturas}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10, showSizeChanger: false }}
                columns={[
                  { title: 'Folio',  dataIndex: 'folio',  width: 150,
                    render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                  { title: 'Fecha',  dataIndex: 'fecha',  width: 100, render: (v: string) => fmt.date(v) },
                  { title: 'Total',  dataIndex: 'total',  width: 130,
                    render: (v: number) => <strong>{fmt.money(v)}</strong> },
                  { title: 'Estado', dataIndex: 'estado', width: 100,
                    render: (v: string) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
                  { title: '', key: 'dl', width: 100,
                    render: (_: any, r: any) => (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloading === r.id}
                        onClick={() => handleDescargar(r.id, r.folio ?? r.numero ?? String(r.id))}
                      >
                        PDF
                      </Button>
                    )},
                ]}
              />
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
        <Table columns={cols} dataSource={tickets ?? []} rowKey="id" size="small" loading={isLoading} pagination={{ pageSize: 5 }} 
        scroll={{ x: 'max-content' }} />
      )}

      <Modal title="Nuevo ticket de soporte" open={openForm}
        onCancel={() => { setOpenForm(false); form.resetFields(); }} footer={null} width={480}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Form.Item name="asunto" label="Asunto" rules={[{ required: true }]}>
            <Input placeholder="Describe brevemente tu consulta" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
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
            <Col span={12}>
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
