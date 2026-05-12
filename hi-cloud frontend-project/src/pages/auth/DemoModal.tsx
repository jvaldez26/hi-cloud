import { useState } from 'react';
import { Modal, Form, Input, Select, Checkbox, Button, Steps,
         Result, Typography, Row, Col, Tag } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { demoApi, type DemoPayload } from '../../api/demo.api';
import { CheckCircleOutlined, RocketOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const MODULOS = [
  'Facturación e-CF DGII', 'Contabilidad General', 'Cuentas por Cobrar/Pagar',
  'Inventario y Stock', 'Nómina y RRHH', 'Compras y Proveedores',
  'Tesorería', 'Reportes y Dashboard', 'Punto de Venta (POS)',
  'Cotizaciones', 'Activos Fijos', 'Auditoría',
];

const PAISES = [
  'República Dominicana', 'México', 'Colombia', 'Panamá', 'Costa Rica',
  'Guatemala', 'Honduras', 'El Salvador', 'Ecuador', 'Perú', 'Venezuela', 'Otro',
];

interface Props { open: boolean; onClose: () => void; }

export default function DemoModal({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [form] = Form.useForm<DemoPayload>();

  const demoMut = useMutation({
    mutationFn: demoApi.solicitar,
    onSuccess: () => setStep(2),
  });

  const handleNext = async () => {
    try {
      await form.validateFields(step === 0
        ? ['nombre', 'empresa', 'email', 'telefono']
        : ['tamanoEmpresa'],
      );
      setStep(s => s + 1);
    } catch { /* antd handles error display */ }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      demoMut.mutate(values);
    } catch { /* antd handles */ }
  };

  const reset = () => { setStep(0); form.resetFields(); onClose(); };

  return (
    <Modal
      open={open} onCancel={reset} footer={null} width={560}
      title={
        step < 2 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8,
                          background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: 700 }}>H</Text>
            </div>
            <div>
              <Text strong style={{ display: 'block' }}>Solicitar Demo Gratuita</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Sin costo · Sin tarjeta · Respuesta en 24 h</Text>
            </div>
          </div>
        ) : null
      }
    >
      <AnimatePresence mode="wait">
        {step === 2 ? (
          <motion.div key="success"
            initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}>
            <Result
              icon={<CheckCircleOutlined style={{ color: '#10b981', fontSize: 56 }} />}
              title="¡Solicitud recibida!"
              subTitle="Nuestro equipo se pondrá en contacto contigo en menos de 24 horas para coordinar la demostración."
              extra={[
                <Button type="primary" key="close" onClick={reset} icon={<RocketOutlined />}>
                  Entendido
                </Button>,
              ]}
            />
            <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 Mientras tanto, puedes explorar nuestra documentación en
                {' '}<Text type="secondary" underline>hicloud.do/docs</Text>
              </Text>
            </div>
          </motion.div>
        ) : (
          <motion.div key={`step-${step}`}
            initial={{ opacity: 0, x: step === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: step === 0 ? 20 : -20 }}
            transition={{ duration: 0.2 }}>

            <Steps current={step} size="small" style={{ marginBottom: 20 }}
              items={[
                { title: 'Datos de contacto' },
                { title: 'Tu empresa' },
              ]} />

            <Form form={form} layout="vertical"
              initialValues={{ pais: 'República Dominicana', tamanoEmpresa: '1-5' }}>

              {step === 0 && (
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true }]}>
                      <Input placeholder="Juan Pérez" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="empresa" label="Nombre de la empresa" rules={[{ required: true }]}>
                      <Input placeholder="Mi Empresa S.R.L." />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                      <Input placeholder="juan@empresa.com" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="telefono" label="Teléfono / WhatsApp" rules={[{ required: true }]}>
                      <Input placeholder="809-555-0000" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="pais" label="País">
                      <Select options={PAISES.map(p => ({ value: p, label: p }))} />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {step === 1 && (
                <>
                  <Form.Item name="tamanoEmpresa" label="Tamaño de la empresa" rules={[{ required: true }]}>
                    <Select options={[
                      { value: '1-5',    label: '1-5 empleados (Micro empresa)' },
                      { value: '6-20',   label: '6-20 empleados (Pequeña empresa)' },
                      { value: '21-100', label: '21-100 empleados (Mediana empresa)' },
                      { value: '100+',   label: 'Más de 100 empleados (Grande)' },
                    ]} />
                  </Form.Item>

                  <Form.Item name="modulosInteres" label="¿Qué módulos te interesan más?">
                    <Checkbox.Group style={{ width: '100%' }}>
                      <Row gutter={[8, 8]}>
                        {MODULOS.map(m => (
                          <Col span={12} key={m}>
                            <Checkbox value={m}>
                              <Text style={{ fontSize: 12 }}>{m}</Text>
                            </Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </Checkbox.Group>
                  </Form.Item>

                  <Form.Item name="mensaje" label="Mensaje adicional (opcional)">
                    <Input.TextArea rows={2} placeholder="¿Algún requerimiento especial o pregunta?" />
                  </Form.Item>
                </>
              )}
            </Form>

            <Row justify="space-between" style={{ marginTop: 8 }}>
              <Col>
                {step > 0 && (
                  <Button onClick={() => setStep(s => s - 1)}>Atrás</Button>
                )}
              </Col>
              <Col>
                {step === 0 ? (
                  <Button type="primary" onClick={handleNext}>
                    Siguiente →
                  </Button>
                ) : (
                  <Button type="primary" loading={demoMut.isPending} onClick={handleSubmit}
                    style={{ background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none' }}>
                    🚀 Solicitar Demo Gratuita
                  </Button>
                )}
              </Col>
            </Row>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
