import { useEffect, useState } from 'react';
import { Card, Form, Select, Input, Button, Typography, Tag, Row, Col, Space, Empty, Pagination, message, Image } from 'antd';
import { MessageOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { soporteApi, ASUNTO_SOPORTE_OPTIONS, type EstadoTicketSoporte } from '../../api/soporte.api';
import { dRD } from '../../utils/fechaRD';
import { VERSION_QUERY_KEY, type VersionPing } from '../../hooks/useVersionPing';
import { useAdjuntosSoporte } from './useAdjuntosSoporte';
import { AdjuntosSoportePicker } from './AdjuntosSoportePicker';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

// Mismo número que el formulario público de LoginPage.tsx (ContactoModal) —
// un solo número de WhatsApp de soporte en toda la app.
const WS_NUMBER = '8093081713';
const WS_URL    = `https://wa.me/1${WS_NUMBER}`;

const ESTADO_TAG: Record<EstadoTicketSoporte, { color: string; label: string }> = {
  abierto:    { color: 'blue',    label: 'Abierto' },
  en_proceso: { color: 'gold',    label: 'En proceso' },
  resuelto:   { color: 'green',   label: 'Resuelto' },
  cerrado:    { color: 'default', label: 'Cerrado' },
};

export default function SoportePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [pagina, setPagina] = useState(1);
  const location = useLocation();

  // Entradas como "Solicitar NCF" (widget de cuenta del Dashboard) llegan
  // aquí con el asunto/mensaje ya decididos, vía location.state — el
  // usuario solo confirma y envía, sin tener que redactar desde cero.
  useEffect(() => {
    const prefill = location.state as { asuntoPrefill?: string; mensajePrefill?: string } | null;
    if (prefill?.asuntoPrefill || prefill?.mensajePrefill) {
      form.setFieldsValue({ asunto: prefill.asuntoPrefill, mensaje: prefill.mensajePrefill });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const { data, isLoading } = useQuery({
    queryKey: ['mis-tickets-soporte', pagina],
    queryFn:  () => soporteApi.misTickets(pagina, 10),
  });

  const adjuntos = useAdjuntosSoporte();

  const crearMut = useMutation({
    mutationFn: (values: { asunto: any; mensaje: string }) => {
      // buildId: lo que ya haya en caché del sondeo de /version (POSPage,
      // NewVersionBanner) — sin disparar un fetch nuevo solo para esto.
      const version = qc.getQueryData<VersionPing>(VERSION_QUERY_KEY);
      return soporteApi.crear({
        asunto:  values.asunto,
        mensaje: values.mensaje,
        // Solo lo que el navegador conoce — empresaId/sucursalId/rol los
        // completa el backend a partir de la sesión, nunca de esto.
        url:       window.location.pathname,
        navegador: navigator.userAgent,
        buildId:   version?.buildId ?? undefined,
        adjuntos:  adjuntos.archivos,
      });
    },
    onSuccess: () => {
      message.success('Ticket enviado — te responderemos por correo.');
      form.resetFields();
      adjuntos.limpiar();
      setPagina(1);
      qc.invalidateQueries({ queryKey: ['mis-tickets-soporte'] });
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'No se pudo enviar el ticket. Intenta por WhatsApp.'),
  });

  // Ctrl+V en cualquier parte del formulario (no solo con foco en la zona
  // de arrastrar) — el caso más común es pegar una captura de pantalla
  // recién tomada mientras se está escribiendo el mensaje.
  const pegarDesdeClipboard = (e: React.ClipboardEvent) => {
    const archivos = Array.from(e.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (archivos.length > 0) adjuntos.agregarArchivos(archivos);
  };

  const tickets = data?.data ?? [];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 24 }}>Soporte</Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={14}>
          <Card title={<><MessageOutlined /> Enviar una solicitud</>}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              ¿Tiene un problema o una pregunta? Envíenos una solicitud y le responderemos por correo.
            </Paragraph>

            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Nombre</Text>
                <Text strong>{user?.nombre}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Correo electrónico</Text>
                <Text strong>{user?.email}</Text>
              </Col>
            </Row>

            <Form form={form} layout="vertical" onFinish={v => crearMut.mutate(v)} onPaste={pegarDesdeClipboard}>
              <Form.Item name="asunto" label="Asunto" rules={[{ required: true, message: 'Selecciona un asunto' }]}>
                <Select placeholder="Selecciona un asunto" options={ASUNTO_SOPORTE_OPTIONS} />
              </Form.Item>
              <Form.Item name="mensaje" label="Mensaje"
                rules={[{ required: true, min: 10, message: 'Cuéntanos un poco más (mínimo 10 caracteres)' }]}>
                <TextArea rows={6} placeholder="Describe tu problema o pregunta con el mayor detalle posible" maxLength={2000} showCount />
              </Form.Item>
              <Form.Item label="Imágenes (opcional)">
                <AdjuntosSoportePicker
                  previews={adjuntos.previews}
                  onAgregar={adjuntos.agregarArchivos}
                  onQuitar={adjuntos.quitarArchivo}
                  procesando={adjuntos.procesando}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={crearMut.isPending || adjuntos.procesando} block>
                Enviar solicitud
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card title="WhatsApp">
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              ¿Necesita ayuda ahora? Escríbanos y le respondemos por aquí.
            </Paragraph>
            <a href={WS_URL} target="_blank" rel="noreferrer">
              <Button type="primary" icon={<WhatsAppOutlined />}
                style={{ background: '#25D366', border: 'none' }} block>
                Abrir WhatsApp
              </Button>
            </a>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
              También puede guardar nuestro número: <Text strong>809.308.1713</Text>
            </Text>
          </Card>
        </Col>
      </Row>

      <Card title="Mis tickets" style={{ marginTop: 24 }} loading={isLoading}>
        {tickets.length === 0 ? (
          <Empty description="Todavía no has enviado ninguna solicitud" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {tickets.map(t => (
              <div key={t.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <Space direction="vertical" size={2}>
                    <Text strong>{ASUNTO_SOPORTE_OPTIONS.find(o => o.value === t.asunto)?.label ?? t.asunto}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{dRD(t.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
                  </Space>
                  <Tag color={ESTADO_TAG[t.estado].color}>{ESTADO_TAG[t.estado].label}</Tag>
                </div>
                <Paragraph style={{ margin: '10px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.mensaje}</Paragraph>
                {(t.adjuntos?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <Image.PreviewGroup>
                      {t.adjuntos!.map(a => (
                        <Image key={a.id} src={a.url ?? undefined} width={56} height={56}
                          style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E7EB' }} />
                      ))}
                    </Image.PreviewGroup>
                  </div>
                )}
                {t.respuestaAdmin && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: 10, marginTop: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Respuesta</Text>
                    <Paragraph style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{t.respuestaAdmin}</Paragraph>
                  </div>
                )}
              </div>
            ))}
          </Space>
        )}
        {(data?.meta?.totalPages ?? 0) > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Pagination current={pagina} pageSize={10} total={data?.meta?.total ?? 0} onChange={setPagina} />
          </div>
        )}
      </Card>
    </div>
  );
}
