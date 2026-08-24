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

/**
 * Lo que el cliente necesita tener. Salen del flujo real de activación, no de
 * una lista genérica: cada uno corresponde a algo que hace falta de verdad para
 * emitir un e-CF con este sistema.
 */
const REQUISITOS = [
  {
    titulo: 'RNC activo en la DGII',
    detalle: 'El RNC de la empresa debe estar vigente. Es el emisor de cada comprobante.',
  },
  {
    titulo: 'Datos fiscales completos',
    detalle: 'Razón social y dirección tal como constan en la DGII — van dentro del comprobante.',
  },
  {
    titulo: 'Secuencias de e-NCF autorizadas',
    detalle: 'Se solicitan en la Oficina Virtual de la DGII. Te acompañamos en el trámite.',
  },
  {
    titulo: 'Certificado digital (opcional)',
    detalle: 'Si ya lo tienes, la implementación te sale más barata. Si no, lo gestionamos nosotros.',
  },
];

/**
 * Beneficios. Cada uno describe algo que este sistema HACE, comprobable.
 *
 * NO se promete ningún crédito fiscal ni incentivo por acogimiento voluntario:
 * la Ley 32-23 contempla incentivos, pero dependen del tramo del contribuyente
 * y del calendario, y afirmarle a alguien que le corresponde uno que luego no
 * le dan es peor que no decir nada. Eso lo confirma su contador.
 */
/** 5 MB — el mismo límite que aplica el backend. */
const MAX_PFX_BYTES = 5 * 1024 * 1024;

const BENEFICIOS = [
  {
    titulo: 'Validación con la DGII al emitir',
    detalle: 'Cada comprobante se envía y recibe respuesta de la DGII en el momento. Sabes si fue aceptado antes de que el cliente salga por la puerta.',
  },
  {
    titulo: 'Se acaban las secuencias en papel',
    detalle: 'Nada de mandar a imprimir talonarios ni llevar el control a mano: las secuencias son electrónicas y el sistema avisa cuando se están agotando.',
  },
  {
    titulo: 'Los formatos 606, 607 y 608 salen solos',
    detalle: 'Se generan desde los mismos comprobantes que ya emitiste, listos para subir a la Oficina Virtual.',
  },
];

export default function ActivacionEcfPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  /** La bienvenida solo se ve una vez; "Comenzar" da paso al formulario. */
  const [verBienvenida, setVerBienvenida] = useState(true);

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

  // EL MISMO veredicto que usa el menu. La pantalla no decide por su cuenta:
  // si lo hiciera, el menu podria mostrar la entrada y la pantalla otra cosa.
  const { data: estado, isLoading } = useQuery<any>({
    queryKey: ['activacion-ecf-estado'],
    queryFn:  () => api.get('/activacion-ecf/estado').then(r => r.data?.data ?? r.data),
  });
  const solicitud = estado?.solicitud ?? null;

  // El precio en vivo: sin certificado válido, la tarifa alta.
  const precioActual = validacion?.precio
    ?? tarifas?.sinCertificado
    ?? null;

  /** Valida el PFX contra el backend. El archivo no se guarda en ningún sitio. */
  const validarCertificado = async (archivo: File, clave: string) => {
    if (!archivo || !clave) return;

    // Se comprueba AQUÍ para que el motivo real llegue al usuario. Si el archivo
    // viaja y lo rechaza el fileFilter de multer, el mensaje se diluye por el
    // camino y acaba como un error genérico que no dice qué corregir.
    if (!/\.(pfx|p12)$/i.test(archivo.name)) {
      message.error(`"${archivo.name}" no es un certificado: el archivo debe terminar en .pfx o .p12`);
      return;
    }
    if (archivo.size > MAX_PFX_BYTES) {
      const mb = (archivo.size / 1024 / 1024).toFixed(1);
      message.error(
        `El archivo pesa ${mb} MB y el máximo son 5 MB. Un certificado real ocupa ` +
        `unos pocos KB — comprueba que sea el archivo correcto.`,
      );
      return;
    }

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
      qc.invalidateQueries({ queryKey: ['activacion-ecf-estado'] });
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
      qc.invalidateQueries({ queryKey: ['activacion-ecf-estado'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo adjuntar'),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  // ── Ya factura electronicamente: no hay nada que solicitar ────────────────
  // Se llega aqui escribiendo la URL, porque la entrada del menu ya no aparece.
  if (estado?.modo === 'ya-activo') {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <Result
          status="success"
          title="Tu facturación electrónica ya está activa"
          subTitle="No hace falta solicitar nada. Si necesitas cambiar la configuración, escríbenos."
        />
      </div>
    );
  }

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

  // ── Bienvenida ────────────────────────────────────────────────────────────
  //
  // Solo en modo 'formulario': con una solicitud abierta o con e-CF ya activo se
  // sale antes, por los dos returns de arriba.
  //
  // El PRECIO va aquí, antes de que el cliente empiece nada. Enterarse del costo
  // después de rellenar un formulario es la peor forma de contarlo.
  if (verBienvenida) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <Row gutter={[24, 24]} align="top">
          {/* ── Izquierda ── */}
          <Col xs={24} lg={13}>
            <Title level={2} style={{ marginBottom: 8, lineHeight: 1.25 }}>
              Pásate a la facturación electrónica
            </Title>
            <Paragraph type="secondary" style={{ fontSize: 15 }}>
              Emite comprobantes fiscales electrónicos (e-CF) validados con la DGII
              desde el mismo sistema donde ya facturas. Nosotros hacemos la
              implementación completa.
            </Paragraph>

            {/* El costo, arriba y sin buscarlo */}
            <Card
              size="small"
              style={{ margin: '20px 0', borderColor: '#1677ff44', background: '#1677ff0d' }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                Costo de implementación · pago único, sin ITBIS
              </Text>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col xs={12}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Si ya tienes certificado</div>
                  <Text strong style={{ fontSize: 22 }}>
                    {tarifas ? fmt.money(tarifas.conCertificado) : '—'}
                  </Text>
                </Col>
                <Col xs={12}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Si lo gestionamos nosotros</div>
                  <Text strong style={{ fontSize: 22 }}>
                    {tarifas ? fmt.money(tarifas.sinCertificado) : '—'}
                  </Text>
                </Col>
              </Row>
            </Card>

            <Title level={5} style={{ marginBottom: 12 }}>Requisitos previos para comenzar</Title>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {REQUISITOS.map(r => (
                <div key={r.titulo} style={{ display: 'flex', gap: 10 }}>
                  <FileProtectOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <Text strong>{r.titulo}</Text>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{r.detalle}</div>
                  </div>
                </div>
              ))}
            </Space>

            <Button
              type="primary" size="large" style={{ marginTop: 28 }}
              onClick={() => setVerBienvenida(false)}
            >
              Comenzar
            </Button>
          </Col>

          {/* ── Derecha. En móvil cae debajo (xs={24}). ── */}
          <Col xs={24} lg={11}>
            <Card style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
              <Title level={5} style={{ marginTop: 0 }}>Qué cambia para ti</Title>
              <Space direction="vertical" size={18} style={{ width: '100%', marginTop: 8 }}>
                {BENEFICIOS.map(b => (
                  <div key={b.titulo} style={{ display: 'flex', gap: 10 }}>
                    <CheckCircleOutlined style={{ color: '#10b981', fontSize: 17, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <Text strong>{b.titulo}</Text>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{b.detalle}</div>
                    </div>
                  </div>
                ))}
              </Space>

              {/* Contexto legal sin prometer incentivos concretos. */}
              <Alert
                type="info" showIcon style={{ marginTop: 20 }}
                message={
                  <span style={{ fontSize: 12 }}>
                    La Ley 32-23 establece un calendario obligatorio de facturación
                    electrónica por tramo de contribuyente. Consulta con tu contador
                    qué fecha te aplica y si te corresponde algún incentivo por
                    acogerte antes.
                  </span>
                }
              />
            </Card>
          </Col>
        </Row>
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
