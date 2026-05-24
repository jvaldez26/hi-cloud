import { useState, useRef } from 'react';
import { Form, Input, Button, Typography, Alert, Steps,
         Row, Col, Select, message } from 'antd';
import { UserOutlined, LockOutlined, BuildOutlined, RocketOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/auth.api';
import { useThemeStore } from '../../store/theme.store';

const { Title, Text } = Typography;

const PAISES = ['República Dominicana', 'México', 'Colombia', 'Panamá', 'Otro'];

const PLANES = [
  {
    clave: 'emprendedor', nombre: 'EMPRENDEDOR',
    precio: 29, limite: 'RD$125,000/mes', usuarios: 2,
    color: '#374151', borderColor: '#6B7280',
  },
  {
    clave: 'pyme', nombre: 'PYME',
    precio: 59, limite: 'RD$500,000/mes', usuarios: 3,
    color: '#047857', borderColor: '#10B981',
  },
  {
    clave: 'pro', nombre: 'PRO',
    precio: 89, limite: 'RD$1,250,000/mes', usuarios: 4,
    color: '#0d9488', borderColor: '#14B8A6', popular: true,
  },
  {
    clave: 'plus', nombre: 'PLUS',
    precio: 129, limite: 'RD$6,250,000/mes', usuarios: 10,
    color: '#4F46E5', borderColor: '#818CF8',
  },
];

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const planPreseleccionado = searchParams.get('plan') ?? 'pro';

  const [step,  setStep]  = useState(0);
  const [form1] = Form.useForm();
  const [form2] = Form.useForm();
  const [emailRegistrado,  setEmailRegistrado]  = useState('');
  const [planElegido,      setPlanElegido]       = useState(planPreseleccionado);
  const [valoresPaso1,     setValoresPaso1]      = useState<{ nombre: string; email: string; password: string } | null>(null);
  const navigate = useNavigate();

  const registerMut = useMutation({
    mutationFn: async (values: {
      nombre: string; email: string; password: string;
      empresa: string; rnc: string;
    }) => {
      await authApi.register(
        values.nombre, values.email, values.password,
        values.empresa, values.rnc,
        planElegido,
      );
      return values.email;
    },
    onSuccess: (email) => {
      setEmailRegistrado(email);
      setStep(3);
    },
    onError: (e: any) => {
      const msg: string = e?.response?.data?.errors?.[0]
        ?? e?.response?.data?.message
        ?? e?.friendlyMessage
        ?? e?.message
        ?? 'Error al crear la cuenta';

      const esPaso1 = /nombre|email|correo|contraseña|password|mayúscula|minúscula/i.test(msg);
      const esPaso2 = /rnc|empresa|RNC/i.test(msg);
      if (esPaso1) setStep(0);
      else if (esPaso2) setStep(2);

      message.error(msg, 6);
    },
  });

  const handleStep1 = async () => {
    try {
      await form1.validateFields();
      const v1 = form1.getFieldsValue() as { nombre: string; email: string; password: string };
      setValoresPaso1(v1);
      registerMut.reset();
      setStep(1); // ir a selección de plan
    } catch { /* antd handles */ }
  };

  const handleStep2 = () => {
    registerMut.reset();
    setStep(2); // ir a datos de empresa
  };

  const handleBackToStep0 = () => { registerMut.reset(); setStep(0); };
  const handleBackToStep1 = () => { registerMut.reset(); setStep(1); };

  const handleSubmit = async () => {
    try {
      await form2.validateFields();
      const v1 = valoresPaso1 ?? (form1.getFieldsValue() as { nombre: string; email: string; password: string });
      const v2 = form2.getFieldsValue() as { empresa: string; rnc: string; pais: string };
      if (!v1.nombre || !v1.email || !v1.password) { setStep(0); return; }
      registerMut.mutate({ ...v1, ...v2 });
    } catch { /* antd handles */ }
  };

  const planSeleccionado = PLANES.find(p => p.clave === planElegido) ?? PLANES[2];

  const { isDark, toggle } = useThemeStore();

  return (
    <div className="reg-container" style={{ display: 'flex', minHeight: '100vh', background: '#0d1117', position: 'relative' }}>
      {/* Toggle tema — esquina superior derecha */}
      <button
        onClick={toggle}
        aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
          color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center',
        }}>
        {isDark
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        }
      </button>
      {/* Panel izquierdo */}
      <div className="reg-left" style={{
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

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)',
            color: '#10B981', fontSize: 12, fontWeight: 700,
            padding: '4px 12px', borderRadius: 20, marginBottom: 16,
          }}>
            Prueba gratis 15 días — sin tarjeta de crédito
          </div>
          <Title level={2} style={{ color: '#fff', marginBottom: 12 }}>
            Empieza a facturar<br />
            <span style={{ color: '#60a5fa' }}>en minutos</span>
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 16, lineHeight: 1.7, display: 'block', marginBottom: 24 }}>
            Crea tu cuenta y elige el plan que mejor se adapte a tu negocio.
            Todos incluyen todos los módulos sin excepción.
          </Text>

          {[
            '✅ e-CF DGII habilitado desde el día 1',
            '✅ Todos los módulos incluidos en todos los planes',
            '✅ Datos seguros con backup diario en AWS',
            '✅ Soporte 24/7 incluido sin costo adicional',
          ].map(f => (
            <div key={f} style={{ marginBottom: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,.65)', fontSize: 14 }}>{f}</Text>
            </div>
          ))}

          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 32, background: 'rgba(255,255,255,.07)', borderRadius: 12, padding: 16 }}>
              <Text style={{ color: '#10B981', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 8 }}>
                PLAN SELECCIONADO
              </Text>
              <Text style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>
                {planSeleccionado.nombre} — US${planSeleccionado.precio}/mes
              </Text>
              <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, display: 'block', marginTop: 4 }}>
                {planSeleccionado.limite} · {planSeleccionado.usuarios} usuarios
              </Text>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Panel derecho — Formulario */}
      <div className="reg-right" style={{
        width: 480, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px 40px',
        background: '#111827',
        borderLeft: '1px solid rgba(255,255,255,.06)',
        overflowY: 'auto',
      }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}>
          {/* Marca: solo visible en mobile (panel izquierdo oculto) */}
          <Link to="/" className="reg-mobile-brand" style={{ alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 28 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>H</div>
            <Text strong style={{ color: '#fff', fontSize: 18 }}>HiCloud ERP</Text>
          </Link>

          <Title level={3} style={{ color: '#fff', marginBottom: 4 }}>Crear cuenta</Title>
          <Text style={{ color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 20 }}>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" style={{ color: '#60a5fa' }}>Iniciar sesión</Link>
          </Text>

          {step < 3 && (
            <Steps current={step} size="small" style={{ marginBottom: 24 }}
              items={[
                { title: <Text style={{ color: '#fff', fontSize: 11 }}>Cuenta</Text> },
                { title: <Text style={{ color: '#fff', fontSize: 11 }}>Plan</Text> },
                { title: <Text style={{ color: '#fff', fontSize: 11 }}>Empresa</Text> },
              ]} />
          )}

          {registerMut.isError && (
            <Alert type="error"
              message={(() => {
                const err  = registerMut.error as any;
                const raw: string = err?.response?.data?.errors?.[0] ?? err?.response?.data?.message ?? err?.friendlyMessage ?? err?.message ?? '';
                if (!raw) return 'Error al crear la cuenta. Intenta de nuevo.';
                if (raw.includes('email') || raw.includes('correo')) return 'El correo electrónico no es válido o ya está registrado';
                if (raw.includes('password') || raw.includes('contraseña')) return 'La contraseña no cumple los requisitos';
                if (raw.toLowerCase().includes('rnc') && raw.includes('registrado')) return `El RNC ya está registrado. Usa un RNC diferente.`;
                return raw;
              })()}
              style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
          )}

          <AnimatePresence mode="wait">
            {/* ── PASO 3: Verificación ──────────────────────────────────── */}
            {step === 3 ? (
              <motion.div key="step3"
                initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(245,158,11,.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px', fontSize: 32, border: '2px solid rgba(245,158,11,.3)',
                }}>⏳</div>
                <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>¡Solicitud recibida!</Title>
                <Text style={{ color: 'rgba(255,255,255,.6)', display: 'block', marginBottom: 4 }}>
                  Tu cuenta fue creada para:
                </Text>
                <Text strong style={{ color: '#60a5fa', display: 'block', marginBottom: 16 }}>
                  {emailRegistrado}
                </Text>
                <div style={{
                  background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)',
                  borderRadius: 10, padding: '14px 16px', marginBottom: 16, textAlign: 'left',
                }}>
                  <Text style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>
                    ⏰ Pendiente de aprobación
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>
                    Nuestro equipo revisará tu solicitud y recibirás un email en{' '}
                    <strong style={{ color: 'rgba(255,255,255,.85)' }}>menos de 24 horas</strong>.
                    Al ser aprobada, podrás iniciar sesión y comenzar tu prueba gratuita.
                  </Text>
                </div>
                <div style={{
                  background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 20, textAlign: 'left',
                }}>
                  <Text style={{ color: '#10B981', fontSize: 12 }}>
                    Plan elegido: <strong>{planSeleccionado?.nombre}</strong> — prueba gratuita de 15 días
                  </Text>
                </div>
                <Button type="primary" block size="large"
                  onClick={() => navigate('/pending-approval')}
                  style={{ height: 48, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                  Ver estado de mi solicitud
                </Button>
              </motion.div>

            ) : step === 0 ? (
              /* ── PASO 1: Datos personales ────────────────────────────── */
              <motion.div key="step0" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <Form form={form1} layout="vertical">
                  <Form.Item name="nombre" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Nombre completo</Text>}
                    rules={[
                      { required: true, message: 'El nombre es requerido' },
                      { min: 2,   message: 'Mínimo 2 caracteres' },
                      { max: 200, message: 'Máximo 200 caracteres' },
                    ]}>
                    <Input prefix={<UserOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="Juan Pérez" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Form.Item name="email" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Correo electrónico</Text>}
                    rules={[
                      { required: true, message: 'El correo es requerido' },
                      { type: 'email',  message: 'Correo inválido' },
                    ]}>
                    <Input prefix={<UserOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="juan@empresa.com" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Form.Item name="password" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Contraseña</Text>}
                    rules={[
                      { required: true, message: 'La contraseña es requerida' },
                      { min: 8,  message: 'Mínimo 8 caracteres' },
                      { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, message: 'Debe tener mayúscula, minúscula y número' },
                    ]}>
                    <Input.Password prefix={<LockOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                      placeholder="Mínimo 8 caracteres" size="large"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                  </Form.Item>
                  <Button type="primary" block size="large" onClick={handleStep1}
                    style={{ height: 48, background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                    Continuar →
                  </Button>
                </Form>
              </motion.div>

            ) : step === 1 ? (
              /* ── PASO 2: Selección de plan ───────────────────────────── */
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, display: 'block', marginBottom: 16 }}>
                  Elige el plan para tu prueba gratuita de 15 días. Puedes cambiarlo después.
                </Text>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {PLANES.map(p => (
                    <div key={p.clave}
                      onClick={() => setPlanElegido(p.clave)}
                      style={{
                        cursor: 'pointer',
                        border: `2px solid ${planElegido === p.clave ? p.borderColor : 'rgba(255,255,255,.1)'}`,
                        borderRadius: 10, padding: '12px 16px',
                        background: planElegido === p.clave ? `${p.color}22` : 'rgba(255,255,255,.03)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all .2s', position: 'relative',
                      }}>
                      {p.popular && (
                        <span style={{
                          position: 'absolute', top: -9, right: 12,
                          background: p.color, color: '#fff',
                          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                        }}>MÁS POPULAR</span>
                      )}
                      <div>
                        <Text strong style={{ color: '#fff', fontSize: 14 }}>{p.nombre}</Text>
                        <Text style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, display: 'block' }}>
                          {p.limite} · {p.usuarios} usuarios
                        </Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong style={{ color: planElegido === p.clave ? p.borderColor : 'rgba(255,255,255,.5)', fontSize: 15 }}>
                          US${p.precio}/mes
                        </Text>
                        {planElegido === p.clave && (
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: p.borderColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <CheckOutlined style={{ color: '#fff', fontSize: 11 }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 11, display: 'block', marginBottom: 16 }}>
                  Todos los planes incluyen todos los módulos. La diferencia está en los límites de ingresos y usuarios.
                </Text>
                <Row gutter={8}>
                  <Col xs={10}>
                    <Button block size="large" onClick={handleBackToStep0}
                      style={{ height: 44, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', borderRadius: 10 }}>
                      ← Atrás
                    </Button>
                  </Col>
                  <Col xs={14}>
                    <Button type="primary" block size="large" onClick={handleStep2}
                      style={{ height: 44, background: `linear-gradient(135deg,${planSeleccionado.color},${planSeleccionado.borderColor})`, border: 'none', borderRadius: 10, fontWeight: 600 }}>
                      Continuar con {planSeleccionado.nombre} →
                    </Button>
                  </Col>
                </Row>
              </motion.div>

            ) : (
              /* ── PASO 3: Datos de empresa ─────────────────────────────── */
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Form form={form2} layout="vertical">
                  <Form.Item name="empresa" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Nombre de la empresa</Text>}
                    rules={[
                      { required: true, message: 'El nombre de la empresa es requerido' },
                      { max: 200, message: 'Máximo 200 caracteres' },
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
                          { pattern: /^\d{9}$|^\d{11}$/, message: '9 u 11 dígitos' },
                        ]}>
                        <Input placeholder="101234567" size="large"
                          style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={10}>
                      <Form.Item name="pais" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>País</Text>} initialValue="República Dominicana">
                        <Select size="large" options={PAISES.map(p => ({ value: p, label: p }))} style={{ borderRadius: 8 }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={8}>
                    <Col xs={10}>
                      <Button block size="large" onClick={handleBackToStep1}
                        style={{ height: 48, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', borderRadius: 10 }}>
                        ← Atrás
                      </Button>
                    </Col>
                    <Col xs={14}>
                      <Button type="primary" block size="large" loading={registerMut.isPending} onClick={handleSubmit}
                        icon={<RocketOutlined />}
                        style={{ height: 48, background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                        Crear mi cuenta
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

      {/* ── CSS responsivo ── */}
      <style>{`
        /* Logo mobile: oculto en desktop */
        .reg-mobile-brand { display: none; }

        /* ── Mobile ≤ 768px ── */
        @media (max-width: 768px) {
          /* Colapsar a columna única */
          .reg-container { display: block !important; }

          /* Ocultar panel informativo izquierdo */
          .reg-left { display: none !important; }

          /* Panel del formulario: full-width */
          .reg-right {
            width: 100% !important;
            max-width: 100% !important;
            border-left: none !important;
            padding: 64px 24px 48px !important;
            min-height: 100vh;
            box-sizing: border-box;
          }

          /* Mostrar marca en la cabecera del form */
          .reg-mobile-brand { display: flex !important; }
        }

        /* ── Mobile pequeño ≤ 400px ── */
        @media (max-width: 400px) {
          .reg-right {
            padding: 60px 16px 40px !important;
          }
        }
      `}</style>
    </div>
  );
}
