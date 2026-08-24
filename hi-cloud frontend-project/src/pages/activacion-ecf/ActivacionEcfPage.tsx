import { useState } from 'react';
import {
  Card, Row, Col, Typography, Button, Upload, Input, Form, Alert, Tag,
  Space, message, Descriptions, Result, Spin,
} from 'antd';
import {
  SafetyCertificateOutlined, UploadOutlined, FileProtectOutlined,
  CheckCircleOutlined, ClockCircleOutlined, LockOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { fecha } from '../../utils/fechaRD';

const { Title, Text, Paragraph } = Typography;

/**
 * Solicitud de implementación de facturación electrónica.
 *
 * Los PRECIOS NO SE HARDCODEAN AQUÍ: se piden a /activacion-ecf/tarifas. Cuando
 * cambie la tarifa se cambia en el backend y esta pantalla la refleja sola.
 */

const ESTADO_INFO: Record<string, { label: string; color: string; texto: string }> = {
  pendiente_pago: { label: 'Pendiente de pago', color: 'orange',
    texto: 'Recibimos tu solicitud. En cuanto confirmemos el pago empezamos la implementación.' },
  pago_recibido:  { label: 'Pago recibido', color: 'blue',
    texto: 'Confirmamos tu pago. Tu implementación entra en cola.' },
  en_proceso:     { label: 'En proceso', color: 'processing',
    texto: 'Estamos configurando tu facturación electrónica. Te avisamos al terminar.' },
  activada:       { label: 'Activada', color: 'green',
    texto: 'Tu facturación electrónica está activa.' },
  rechazada:      { label: 'Rechazada', color: 'red',
    texto: 'La solicitud fue rechazada.' },
};

export default function ActivacionEcfPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const [certificado, setCertificado]   = useState<File | null>(null);
  const [comprobante, setComprobante]   = useState<File | null>(null);
  const [clavePfx, setClavePfx]         = useState('');
  const [validacion, setValidacion]     = useState<any>(null);
  const [validando, setValidando]       = useState(false);

  const { data: tarifas } = useQuery<any>({
    queryKey: ['activacion-tarifas'],
    queryFn:  () => api.get('/activacion-ecf/tarifas').then(r => r.data?.data ?? r.data),
    staleTime: 600_000,
  });

  const { data: solicitud, isLoading } = useQuery<any>({
    queryKey: ['activacion-mi-solicitud'],
    queryFn:  () => api.get('/activacion-ecf/mi-solicitud').then(r => r.data?.data ?? r.data),
  });

  // El precio en vivo: sin certificado válido, la tarifa alta.
  const precioActual = validacion?.precio
    ?? tarifas?.sinCertificado
    ?? null;

  /** Valida el PFX contra el backend. El archivo no se guarda en ningún sitio. */
  const validarCertificado = async (archivo: File, clave: string) => {
    if (!archivo || !clave) return;
    setValidando(true);
    try {
      const fd = new FormData();
      fd.append('certificado', archivo);
      fd.append('clavePfx', clave);
      const r = await api.post('/activacion-ecf/validar-certificado', fd);
      setValidacion(r.data?.data ?? r.data);
    } catch (e: any) {
      setValidacion(null);
      message.error(e?.response?.data?.message ?? 'No se pudo validar el certificado');
    } finally {
      setValidando(false);
    }
  };

  const enviarMut = useMutation({
    mutationFn: async (valores: any) => {
      const fd = new FormData();
      Object.entries(valores).forEach(([k, v]) => { if (v) fd.append(k, String(v)); });
      if (certificado) { fd.append('certificado', certificado); fd.append('clavePfx', clavePfx); }
      if (comprobante) fd.append('comprobante', comprobante);
      return api.post('/activacion-ecf', fd).then(r => r.data?.data ?? r.data);
    },
    onSuccess: () => {
      message.success('Solicitud enviada');
      qc.invalidateQueries({ queryKey: ['activacion-mi-solicitud'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo enviar la solicitud'),
  });

  const subirComprobanteMut = useMutation({
    mutationFn: async (archivo: File) => {
      const fd = new FormData();
      fd.append('comprobante', archivo);
      return api.post(`/activacion-ecf/${solicitud.id}/comprobante`, fd);
    },
    onSuccess: () => {
      message.success('Comprobante adjuntado');
      qc.invalidateQueries({ queryKey: ['activacion-mi-solicitud'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo adjuntar'),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  // ── Ya hay solicitud: se muestra su estado ─────────────────────────────────
  if (solicitud) {
    const info = ESTADO_INFO[solicitud.estado] ?? ESTADO_INFO.pendiente_pago;
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Result
          icon={solicitud.estado === 'activada'
            ? <CheckCircleOutlined style={{ color: '#10b981' }} />
            : <ClockCircleOutlined style={{ color: '#f59e0b' }} />}
          title={<>Solicitud #{solicitud.id} · <Tag color={info.color}>{info.label}</Tag></>}
          subTitle={info.texto}
        />

        <Card size="small">
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Monto acordado">
              <Text strong style={{ fontSize: 16 }}>{fmt.money(Number(solicitud.montoAcordado))}</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                pago único, sin ITBIS
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Certificado digital">
              {solicitud.tieneCertificado
                ? <Tag color="green">Verificado{solicitud.certificadoVenceEn ? ` · vence ${fecha(solicitud.certificadoVenceEn)}` : ''}</Tag>
                : solicitud.certificadoVencido
                  ? <Tag color="red">Vencido — se gestiona uno nuevo</Tag>
                  : <Tag>No aportado — lo gestionamos nosotros</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Comprobante de pago">
              {solicitud.comprobantePagoKey
                ? <Tag color="green">Recibido</Tag>
                : (
                  <Space direction="vertical" size={4}>
                    <Tag color="orange">Pendiente</Tag>
                    <Upload
                      beforeUpload={(f) => { subirComprobanteMut.mutate(f); return false; }}
                      showUploadList={false}
                      accept="image/*,application/pdf"
                    >
                      <Button size="small" icon={<UploadOutlined />} loading={subirComprobanteMut.isPending}>
                        Adjuntar comprobante
                      </Button>
                    </Upload>
                  </Space>
                )}
            </Descriptions.Item>
            {solicitud.motivoRechazo && (
              <Descriptions.Item label="Motivo del rechazo">
                <Text type="danger">{solicitud.motivoRechazo}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      </div>
    );
  }

  // ── Formulario ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Title level={4}>
        <SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />
        Activar facturación electrónica
      </Title>
      <Paragraph type="secondary">
        Implementación de e-CF con la DGII: configuración, secuencias y puesta en marcha.
        Es un <strong>pago único</strong> y no lleva ITBIS.
      </Paragraph>

      {/* Precio en vivo. El cliente lo ve ANTES de enviar. */}
      <Card size="small" style={{ marginBottom: 16, background: '#1677ff0d', borderColor: '#1677ff44' }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>Costo de implementación</Text>
            <div>
              <Text strong style={{ fontSize: 26 }}>
                {precioActual != null ? fmt.money(precioActual) : '—'}
              </Text>
            </div>
          </Col>
          <Col>
            {validacion?.metadatos?.valido
              ? <Tag color="green">Tarifa con certificado propio</Tag>
              : <Tag color="blue">Incluye gestión del certificado</Tag>}
          </Col>
        </Row>
        {tarifas && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Con certificado digital propio: {fmt.money(tarifas.conCertificado)} ·
            Sin certificado: {fmt.money(tarifas.sinCertificado)}
          </Text>
        )}
      </Card>

      {/* EL AVISO. Va antes de pedir el archivo, no después. */}
      <Alert
        type="info"
        showIcon
        icon={<LockOutlined />}
        style={{ marginBottom: 16 }}
        message="Tu certificado no se guarda"
        description={
          <div style={{ fontSize: 13 }}>
            Si ya tienes un certificado digital, lo pedimos <strong>solo para verificar que es
            válido y ajustarte la tarifa</strong>. Se abre en memoria para comprobarlo y se
            descarta en el acto: no se almacena en nuestros servidores, ni el archivo ni su
            contraseña.
            <div style={{ marginTop: 6 }}>
              Cuando llegue el momento de configurar tu facturación, te lo pediremos de nuevo
              por el canal que acordemos.
            </div>
          </div>
        }
      />

      <Card>
        <Form form={form} layout="vertical" onFinish={(v) => enviarMut.mutate(v)}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="contactoNombre" label="Persona de contacto">
                <Input placeholder="Nombre y apellido" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="contactoTelefono" label="Teléfono">
                <Input placeholder="809-000-0000" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="contactoEmail" label="Correo"
                rules={[{ type: 'email', message: 'Correo no válido' }]}>
                <Input placeholder="correo@empresa.com" />
              </Form.Item>
            </Col>
          </Row>

          <Card size="small" title={<><FileProtectOutlined /> ¿Tienes certificado digital?</>}
            style={{ marginBottom: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              Si ya lo tienes, súbelo y verificamos su validez — la tarifa baja.
              Si no lo tienes, deja esto vacío: nosotros lo gestionamos.
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Upload
                beforeUpload={(f) => { setCertificado(f); setValidacion(null); return false; }}
                onRemove={() => { setCertificado(null); setValidacion(null); }}
                maxCount={1}
                accept=".pfx,.p12"
              >
                <Button icon={<UploadOutlined />}>Seleccionar .pfx o .p12</Button>
              </Upload>

              {certificado && (
                <Row gutter={8}>
                  <Col flex="auto">
                    <Input.Password
                      placeholder="Contraseña del certificado"
                      value={clavePfx}
                      onChange={e => { setClavePfx(e.target.value); setValidacion(null); }}
                      onPressEnter={() => validarCertificado(certificado, clavePfx)}
                    />
                  </Col>
                  <Col>
                    <Button type="primary" loading={validando}
                      disabled={!clavePfx}
                      onClick={() => validarCertificado(certificado, clavePfx)}>
                      Verificar
                    </Button>
                  </Col>
                </Row>
              )}

              {validacion?.metadatos?.valido && (
                <Alert type="success" showIcon
                  message={`Certificado válido${validacion.metadatos.venceEn ? ` — vence el ${fecha(validacion.metadatos.venceEn)}` : ''}`}
                  description={validacion.metadatos.titular
                    ? <Text type="secondary" style={{ fontSize: 12 }}>A nombre de: {validacion.metadatos.titular}</Text>
                    : undefined}
                />
              )}
              {validacion?.mensaje && (
                <Alert type="warning" showIcon message="Certificado vencido" description={validacion.mensaje} />
              )}
            </Space>
          </Card>

          <Card size="small" title="Comprobante de pago (opcional)" style={{ marginBottom: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              Puedes enviar la solicitud ahora y adjuntar el comprobante cuando pagues.
              La solicitud queda pendiente de pago hasta entonces.
            </Paragraph>
            <Upload
              beforeUpload={(f) => { setComprobante(f); return false; }}
              onRemove={() => setComprobante(null)}
              maxCount={1}
              accept="image/*,application/pdf"
            >
              <Button icon={<UploadOutlined />}>Adjuntar comprobante</Button>
            </Upload>
          </Card>

          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={3} placeholder="Cualquier detalle que debamos saber" />
          </Form.Item>

          <Button type="primary" size="large" htmlType="submit" loading={enviarMut.isPending} block>
            Enviar solicitud{precioActual != null ? ` · ${fmt.money(precioActual)}` : ''}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
