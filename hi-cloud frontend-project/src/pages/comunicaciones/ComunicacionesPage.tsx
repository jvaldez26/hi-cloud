import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Input, Space,
  Typography, Statistic, message, Tooltip, Tabs, Badge, theme,
  Alert, Divider,
} from 'antd';
import {
  WhatsAppOutlined, MessageOutlined, BellOutlined, CopyOutlined,
  SendOutlined, PhoneOutlined, DollarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

function WhatsAppModal({ titulo, texto, link, onClose }: {
  titulo: string; texto: string; link: string; onClose: () => void;
}) {
  const { token } = theme.useToken();

  const copiar = () => {
    navigator.clipboard.writeText(texto);
    message.success('Mensaje copiado al portapapeles');
  };

  const abrir = () => {
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <Modal
      title={<Space><WhatsAppOutlined style={{ color: '#25D366' }} />{titulo}</Space>}
      open
      onCancel={onClose}
      footer={
        <Space>
          <Button icon={<CopyOutlined />} onClick={copiar}>Copiar mensaje</Button>
          <Button
            type="primary"
            icon={<WhatsAppOutlined />}
            onClick={abrir}
            style={{ background: '#25D366', borderColor: '#25D366' }}
          >
            Abrir en WhatsApp
          </Button>
        </Space>
      }
      width={500}
    >
      <div style={{
        background:   token.colorFillAlter,
        border:       `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        padding:      16,
        fontFamily:   '"SF Pro Text", -apple-system, sans-serif',
        fontSize:     13,
        lineHeight:   1.6,
        whiteSpace:   'pre-wrap',
        color:        token.colorText,
      }}>
        {texto}
      </div>
      <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
        Preview del mensaje · El destinatario verá el texto con el formato de WhatsApp.
      </Text>
    </Modal>
  );
}

export default function ComunicacionesPage() {
  const { token } = theme.useToken();
  const [modalData, setModalData] = useState<{ titulo: string; texto: string; link: string } | null>(null);
  const [loading,   setLoading]   = useState<number | null>(null);

  // ─── CxC pendientes ───────────────────────────────────────────────────────────

  const { data: cxcPendientes = [] } = useQuery<any[]>({
    queryKey: ['cxc-pendientes-wsp'],
    queryFn:  () => api.get('/comunicaciones/cxc-pendientes').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: plantillas } = useQuery<any>({
    queryKey: ['wsp-plantillas'],
    queryFn:  () => api.get('/comunicaciones/plantillas').then((r: any) => r.data?.data ?? r.data),
  });

  // ─── Abrir reminder ───────────────────────────────────────────────────────────

  const abrirReminder = async (cxcId: number) => {
    setLoading(cxcId);
    try {
      const r = await api.get(`/comunicaciones/whatsapp/cxc/${cxcId}`);
      const d = (r as any).data?.data ?? (r as any).data;
      setModalData({ titulo: 'Recordatorio de Cobro', texto: d.texto, link: d.link });
    } catch {
      message.error('Error al generar el mensaje');
    } finally {
      setLoading(null);
    }
  };

  // ─── Stats ────────────────────────────────────────────────────────────────────

  const vencidas    = cxcPendientes.filter(c => c.diasVencida > 0);
  const alDia       = cxcPendientes.filter(c => c.diasVencida === 0);
  const totalPend   = cxcPendientes.reduce((s: number, c: any) => s + c.montoPendiente, 0);
  const totalVenc   = vencidas.reduce((s: number, c: any) => s + c.montoPendiente, 0);

  return (
    <div style={{ padding: '24px' }}>
      {modalData && (
        <WhatsAppModal
          titulo={modalData.titulo}
          texto={modalData.texto}
          link={modalData.link}
          onClose={() => setModalData(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WhatsAppOutlined style={{ fontSize: 28, color: '#25D366' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>WhatsApp & Comunicaciones</Title>
            <Text type="secondary">Envía facturas, recordatorios y notificaciones directamente por WhatsApp</Text>
          </div>
        </div>
        <Space>
          <RefreshByKeyButton queryKey={['comunicaciones']} />
          <VideoTutorialButton />
        </Space>
      </div>

      <Tabs
        defaultActiveKey="cxc"
        items={[
          {
            key: 'cxc',
            label: <Space><BellOutlined />Recordatorios CxC</Space>,
            children: (
              <>
                {vencidas.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`${vencidas.length} cuenta(s) vencidas con un total de ${fmt(totalVenc)} — Se recomienda enviar recordatorios.`}
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Card bordered={false} style={{ borderRadius: 12 }}>
                  <Table
                    dataSource={cxcPendientes}
                    rowKey="id"
                    size="middle"
                    pagination={{ pageSize: 20 }}
                    rowClassName={(r: any) => r.diasVencida > 0 ? 'ant-table-row-warning' : ''}
                    columns={[
                      {
                        title: 'Cliente', dataIndex: 'clienteNombre', key: 'c',
                        render: (v, r: any) => (
                          <div>
                            <Text strong>{v}</Text>
                            {r.clienteTelefono && (
                              <div>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  <PhoneOutlined style={{ marginRight: 4 }} />{r.clienteTelefono}
                                </Text>
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        title: 'Monto Pendiente', dataIndex: 'montoPendiente', key: 'm',
                        align: 'right',
                        render: v => <Text strong style={{ color: token.colorPrimary }}>{fmt(v)}</Text>,
                      },
                      {
                        title: 'Vencimiento', dataIndex: 'fechaVencimiento', key: 'fv',
                        render: v => new Date(v).toLocaleDateString('es-DO'),
                      },
                      {
                        title: 'Estado', dataIndex: 'diasVencida', key: 'dv',
                        render: v => v > 0
                          ? <Tag color="red">{v} días vencida</Tag>
                          : <Tag color="green">Al día</Tag>,
                      },
                      {
                        title: 'WhatsApp', key: 'wa',
                        render: (_, r: any) => (
                          <Tooltip title={r.clienteTelefono ? `Enviar a ${r.clienteTelefono}` : 'Sin número de teléfono'}>
                            <Button
                              size="small"
                              icon={<WhatsAppOutlined />}
                              loading={loading === r.id}
                              onClick={() => abrirReminder(r.id)}
                              style={{ color: '#25D366', borderColor: '#25D366' }}
                            >
                              Recordatorio
                            </Button>
                          </Tooltip>
                        ),
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'plantillas',
            label: <Space><MessageOutlined />Plantillas</Space>,
            children: (
              <Row gutter={[16, 16]}>
                {plantillas && Object.entries(plantillas).map(([key, p]: [string, any]) => (
                  <Col xs={24} md={12} key={key}>
                    <Card
                      bordered={false}
                      style={{ borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
                      title={
                        <Space>
                          <WhatsAppOutlined style={{ color: '#25D366' }} />
                          <Text strong>{p.nombre}</Text>
                        </Space>
                      }
                    >
                      <div style={{
                        background:   token.colorFillAlter,
                        borderRadius: 8,
                        padding:      12,
                        fontFamily:   '"SF Pro Text", sans-serif',
                        fontSize:     12,
                        lineHeight:   1.6,
                        whiteSpace:   'pre-wrap',
                        color:        token.colorText,
                        marginBottom: 12,
                      }}>
                        {p.texto}
                      </div>
                      <div>
                        {p.campos.map((campo: string) => (
                          <Tag key={campo} color="blue" style={{ fontSize: 10 }}>
                            {`{${campo}}`}
                          </Tag>
                        ))}
                      </div>
                      <Divider style={{ margin: '10px 0' }} />
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => { navigator.clipboard.writeText(p.texto); message.success('Plantilla copiada'); }}
                      >
                        Copiar plantilla
                      </Button>
                    </Card>
                  </Col>
                ))}
              </Row>
            ),
          },
          {
            key: 'guia',
            label: <Space><SendOutlined />Cómo usar</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Card bordered={false} style={{ borderRadius: 12 }}>
                    <Title level={5}>¿Cómo enviar documentos por WhatsApp en HiCloud ERP?</Title>
                    <div style={{ lineHeight: 2 }}>
                      {[
                        { paso: '1', desc: 'En la lista de Facturas, Cotizaciones o Conduces, busca el botón verde de WhatsApp en cada fila.' },
                        { paso: '2', desc: 'Al hacer clic, el sistema genera un mensaje personalizado con los datos del documento.' },
                        { paso: '3', desc: 'Se abre WhatsApp Web con el mensaje pre-escrito listo para enviar.' },
                        { paso: '4', desc: 'Si el cliente tiene teléfono registrado, el mensaje se dirige directamente a ese número.' },
                        { paso: '5', desc: 'Desde esta página puedes enviar recordatorios de cobro a todos los clientes con CxC pendientes.' },
                      ].map(({ paso, desc }) => (
                        <div key={paso} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: '#25D366', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 13, flexShrink: 0,
                          }}>
                            {paso}
                          </div>
                          <Text style={{ lineHeight: 1.8 }}>{desc}</Text>
                        </div>
                      ))}
                    </div>
                    <Alert
                      type="info"
                      showIcon
                      message="Integración nativa con WhatsApp Business"
                      description="HiCloud ERP utiliza wa.me links — no requiere instalar ninguna API de pago. Los mensajes se abren directamente en WhatsApp Web o en la app móvil."
                      style={{ marginTop: 16 }}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}
