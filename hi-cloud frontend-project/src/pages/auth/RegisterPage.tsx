import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Steps,
         Tag, Row, Col, Select, message } from 'antd';
import { UserOutlined, LockOutlined, BuildOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/auth.api';

const { Title, Text } = Typography;

const PAISES = ['República Dominicana', 'México', 'Colombia', 'Panamá', 'Otro'];

export default function RegisterPage() {
  const [step,  setStep]  = useState(0);
  const [form1] = Form.useForm();
  const [form2] = Form.useForm();
  const [emailRegistrado, setEmailRegistrado] = useState('');
  // Guardar valores del paso 1 en state React para que no se pierdan
  // cuando AnimatePresence desmonta el Form al cambiar de step
  const [valoresPaso1, setValoresPaso1] = useState<{ nombre: string; email: string; password: string } | null>(null);
  const navigate = useNavigate();

  const registerMut = useMutation({
    mutationFn: async (values: {
      nombre: string; email: string; password: string;
      empresa: string; rnc: string;
    }) => {
      // Registro atómico: crea usuario + empresa + envía verificación en un solo call.
      // El backend crea user(ADMIN) + empresa + usuario_empresa + sucursal + plan de cuentas.
      // NO intentamos login aquí — el usuario debe verificar su email primero.
      await authApi.register(
        values.nombre, values.email, values.password,
        values.empresa, values.rnc,
      );
      return values.email;
    },
    onSuccess: (email) => {
      setEmailRegistrado(email);
      setStep(2); // Pantalla "Verifica tu correo"
    },
    onError: (e: any) => {
      const msg: string = e?.response?.data?.errors?.[0]
        ?? e?.response?.data?.message
        ?? e?.friendlyMessage
        ?? e?.message
        ?? 'Error al crear la cuenta';
      console.error('[Register] error:', e?.response?.data ?? e?.message);

      // Redirigir al paso correcto según el tipo de error
      const esPaso1 = /nombre|email|correo|contraseña|password|mayúscula|minúscula/i.test(msg);
      const esPaso2 = /rnc|empresa|RNC/i.test(msg);
      if (esPaso1) setStep(0);
      else if (esPaso2) setStep(1);

      message.error(msg, 6);
    },
  });

  const handleStep1 = async () => {
    try {
      await form1.validateFields();
      // Guardar valores ANTES de que AnimatePresence desmonte el form
      const v1 = form1.getFieldsValue() as { nombre: string; email: string; password: string };
      setValoresPaso1(v1);
      registerMut.reset();
      setStep(1);
    } catch { /* antd handles */ }
  };

  const handleStep0 = () => {
    registerMut.reset();
    setStep(0);
  };

  const handleSubmit = async () => {
    try {
      await form2.validateFields();
      // Usar valores guardados del paso 1 (no form1.getFieldsValue que puede ser undefined)
      const v1 = valoresPaso1 ?? (form1.getFieldsValue() as { nombre: string; email: string; password: string });
      const v2 = form2.getFieldsValue() as { empresa: string; rnc: string; pais: string };

      if (!v1.nombre || !v1.email || !v1.password) {
        setStep(0);
        return;
      }

      registerMut.mutate({ ...v1, ...v2 });
    } catch { /* antd handles */ }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0d1117' }}>
      {/* Panel izquierdo */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '64px 56px',
        background: 'radial-gradient(ellipse 80% 60% at 30% 50%, rgba(26,86,219,.2), transparent)',
      }}>
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .5 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48, textDecoration: 'none' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#fff',
            }}>H</div>
            <Text strong style={{ color: '#fff', fontSize: 20 }}>HiCloud ERP</Text>
          </Link>

          <Tag color="green" style={{ marginBottom: 16, padding: '4px 12px', fontSize: 12 }}>
            🎁 Prueba gratuita 30 días
          </Tag>
          <Title level={2} style={{ color: '#fff', marginBottom: 12 }}>
            Empieza a facturar<br />
            <span style={{ color: '#60a5fa' }}>en minutos</span>
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 16, lineHeight: 1.7, display: 'block', marginBottom: 32 }}>
            Crea tu cuenta de empresa en HiCloud ERP y accede a todos los módulos.
            Sin tarjeta de crédito requerida.
          </Text>

          {[
            '✅ e-CF DGII habilitado desde el día 1',
            '✅ 18 módulos disponibles inmediatamente',
            '✅ Datos seguros con backup diario',
            '✅ Soporte por email incluido',
          ].map(f => (
            <motion.div key={f}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: .3 + [f].indexOf(f) * .08 }}
              style={{ marginBottom: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,.65)', fontSize: 14 }}>{f}</Text>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Panel derecho — Formulario */}
      <div style={{
        width: 460, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '64px 48px',
        background: '#111827',
        borderLeft: '1px solid rgba(255,255,255,.06)',
      }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}>
          <Title level={3} style={{ color: '#fff', marginBottom: 4 }}>Crear cuenta</Title>
          <Text style={{ color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 24 }}>
            Ya tienes cuenta?{' '}
            <Link to="/login" style={{ color: '#60a5fa' }}>Iniciar sesión</Link>
          </Text>

          {step < 2 && (
            <Steps current={step} size="small" style={{ marginBottom: 28 }}
              items={[
                { title: <Text style={{ color: '#fff', fontSize: 12 }}>Tu cuenta</Text> },
                { title: <Text style={{ color: '#fff', fontSize: 12 }}>Tu empresa</Text> },
              ]} />
          )}

          {registerMut.isError && (
            <Alert type="error"
              message={(() => {
                const err   = registerMut.error as any;
                // Extraer mensaje del backend por múltiples rutas
                const raw: string =
                  err?.response?.data?.errors?.[0] ??
                  err?.response?.data?.message ??
                  err?.friendlyMessage ??
                  err?.message ??
                  '';

                if (!raw) return 'Error al crear la cuenta. Intenta de nuevo.';

                // Mensajes amigables en español
                if (raw.includes('nombre') && (raw.includes('100') || raw.includes('50')))
                  return 'El nombre no puede superar 100 caracteres';
                if (raw.includes('email') || raw.includes('Email') || raw.includes('correo'))
                  return 'El correo electrónico no es válido o ya está registrado';
                if (raw.includes('password') || raw.includes('contraseña') || raw.includes('mayúscula'))
                  return 'La contraseña no cumple los requisitos';
                if (raw.toLowerCase().includes('rnc') && raw.includes('registrado'))
                  return `El RNC ${raw.match(/\d{9,11}/)?.[0] ?? ''} ya está registrado. Usa un RNC diferente.`;
                if (raw.toLowerCase().includes('rnc'))
                  return 'El RNC es inválido (debe tener 9 u 11 dígitos)';
                if (raw.includes('registrado') || raw.includes('duplicado') || raw.includes('ya existe'))
                  return raw;
                if (raw.toLowerCase().includes('acceso') || raw.toLowerCase().includes('permiso'))
                  return 'Error de sesión. Recarga la página e intenta de nuevo.';
                // Mostrar el mensaje real del backend
                return raw;
              })()}
              style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
          )}

          <AnimatePresence mode="wait">
            {step === 2 ? (
              /* ── Paso 3: Verificación de correo ─────────────────────── */
              <motion.div key="step2"
                initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'rgba(16,185,129,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', fontSize: 28,
                }}>✉️</div>
                <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>
                  ¡Revisa tu correo!
                </Title>
                <Text style={{ color: 'rgba(255,255,255,.6)', display: 'block', marginBottom: 4 }}>
                  Enviamos un enlace de verificación a:
                </Text>
                <Text strong style={{ color: '#60a5fa', display: 'block', marginBottom: 20 }}>
                  {emailRegistrado}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, display: 'block', marginBottom: 28 }}>
                  Haz clic en el enlace del correo para activar tu cuenta y acceder a HiCloud ERP.
                  El enlace expira en 24 horas.
                </Text>
                <Button type="primary" block size="large"
                  onClick={() => navigate('/login')}
                  style={{ height: 48, background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none', borderRadius: 10, fontWeight: 600, marginBottom: 12 }}>
                  Ir a iniciar sesión
                </Button>
                <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
                  ¿No recibiste el correo? Revisa la carpeta de spam.
                </Text>
              </motion.div>
            ) : step === 0 ? (
              <motion.div key="step0" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <Form form={form1} layout="vertical">
                  <Form.Item name="nombre" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Nombre completo</Text>}
                    rules={[
                      { required: true, message: 'El nombre es requerido' },
                      { min: 2,   message: 'El nombre debe tener al menos 2 caracteres' },
                      { max: 200, message: 'El nombre no puede superar 200 caracteres' },
                    ]}>
                    <Input prefix={<UserOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="Juan Pérez" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Form.Item name="email" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Correo electrónico</Text>}
                    rules={[
                      { required: true, message: 'El correo electrónico es requerido' },
                      { type: 'email',  message: 'Ingresa un correo electrónico válido' },
                      { max: 150,       message: 'El correo no puede superar 150 caracteres' },
                    ]}>
                    <Input prefix={<UserOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="juan@empresa.com" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Form.Item name="password" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Contraseña</Text>}
                    rules={[
                      { required: true, message: 'La contraseña es requerida' },
                      { min: 8,  message: 'La contraseña debe tener al menos 8 caracteres' },
                      { max: 100, message: 'La contraseña no puede superar 100 caracteres' },
                      { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, message: 'Debe tener al menos una mayúscula, una minúscula y un número' },
                    ]}>
                    <Input.Password prefix={<LockOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="Mínimo 8 caracteres" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Button type="primary" block size="large" onClick={handleStep1}
                    style={{
                      height: 48, background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                      border: 'none', borderRadius: 10, fontWeight: 600,
                    }}>
                    Continuar →
                  </Button>
                </Form>
              </motion.div>
            ) : (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Form form={form2} layout="vertical">
                  <Form.Item name="empresa" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Nombre de la empresa</Text>}
                    rules={[
                      { required: true, message: 'El nombre de la empresa es requerido' },
                      { max: 200, message: 'El nombre de la empresa no puede superar 200 caracteres' },
                    ]}>
                    <Input prefix={<BuildOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="Mi Empresa S.R.L." size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col xs={24} sm={14}>
                      <Form.Item name="rnc" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>RNC</Text>}
                        rules={[
                          { required: true, message: 'El RNC es requerido' },
                          { pattern: /^\d{9}$|^\d{11}$/, message: 'El RNC debe tener 9 dígitos (empresa) u 11 dígitos (persona física)' },
                        ]}>
                        <Input placeholder="101234567" size="large"
                          style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={10}>
                      <Form.Item name="pais" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>País</Text>}
                        initialValue="República Dominicana">
                        <Select size="large" options={PAISES.map(p => ({ value: p, label: p }))}
                          style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={8}>
                    <Col xs={24} sm={10}><Button block size="large" onClick={handleStep0}
                      style={{ height: 48, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', borderRadius: 10 }}>
                      ← Atrás
                    </Button></Col>
                    <Col xs={24} sm={14}>
                      <Button type="primary" block size="large" loading={registerMut.isPending} onClick={handleSubmit}
                        icon={<RocketOutlined />}
                        style={{ height: 48, background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                        🚀 Crear mi cuenta
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>

          <Text style={{ color: 'rgba(255,255,255,.2)', fontSize: 11, textAlign: 'center', display: 'block', marginTop: 20 }}>
            Al registrarte aceptas los Términos de Uso y la Política de Privacidad de HiCloud ERP.
          </Text>
        </motion.div>
      </div>
    </div>
  );
}
