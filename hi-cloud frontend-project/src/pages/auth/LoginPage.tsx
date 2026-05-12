import { useState } from 'react';
import { Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';
import DemoModal from './DemoModal';

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading,  setLoading]  = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const { login } = useAuthStore();
  const navigate  = useNavigate();

  // Leer mensaje de empresa suspendida si viene del interceptor
  const mensajeSuspension = sessionStorage.getItem('login_error') ?? '';
  const [error, setError] = useState(mensajeSuspension);
  if (mensajeSuspension) sessionStorage.removeItem('login_error');

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError('');
    try {
      const data = await authApi.login(values.email, values.password);
      login(data.accessToken, data.user, data.empresaActual, data.empresas ?? []);
      // Super Admin tiene su propio panel — no necesita empresa
      if (data.user?.role === 'super_admin') {
        navigate('/super-admin');
      } else {
        navigate('/dashboard');
      }
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { errors?: string[] } } })
          ?.response?.data?.errors?.[0] ?? 'Credenciales inválidas',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(26,86,219,.25), transparent), #0d1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>

      {/* ── Volver a la landing ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ position: 'absolute', top: 24, left: 24 }}
      >
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeftOutlined style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }} />
          <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>Volver al inicio</Text>
        </Link>
      </motion.div>

      {/* ── Card de login ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ width: '100%', maxWidth: 400 }}
      >
        {/* Logo + título */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            style={{
              width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
              background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: '#fff',
              boxShadow: '0 8px 24px rgba(26,86,219,.4)',
            }}
          >H</motion.div>

          <Title level={3} style={{ color: '#fff', margin: 0 }}>
            HiCloud ERP
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.45)', display: 'block', marginTop: 4, fontSize: 13 }}>
            Inicia sesión en tu cuenta
          </Text>
        </div>

        {/* Formulario */}
        <div style={{
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 16,
          padding: 28,
          backdropFilter: 'blur(12px)',
        }}>
          {error && (
            <Alert message={error} type="error" showIcon
              style={{ marginBottom: 16, borderRadius: 8 }} />
          )}

          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item
              name="email"
              label={<Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>Correo electrónico</Text>}
              rules={[{ required: true, message: 'El correo electrónico es requerido' }, { type: 'email', message: 'Ingresa un correo electrónico válido' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                placeholder="usuario@empresa.com"
                autoComplete="email"
                type="email"
                style={{
                  background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.15)',
                  color: '#fff',
                  borderRadius: 10,
                  height: 46,
                }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', minWidth: 310 }}>
                  <Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>Contraseña</Text>
                  <Link to="/recuperar-contrasena"
                    style={{ color: '#60a5fa', fontSize: 12, fontWeight: 400 }}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              }
              rules={[{ required: true, message: 'La contraseña es requerida' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.15)',
                  color: '#fff',
                  borderRadius: 10,
                  height: 46,
                }}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{
                height: 48,
                background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                boxShadow: '0 4px 20px rgba(26,86,219,.45)',
                marginTop: 4,
              }}
            >
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </Button>
          </Form>
        </div>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
          <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>¿No tienes cuenta?</Text>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
        </div>

        {/* CTAs secundarios */}
        <div style={{ display: 'flex', gap: 10 }}>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} style={{ flex: 1 }}>
            <Button
              block
              icon={<RocketOutlined />}
              onClick={() => setDemoOpen(true)}
              style={{
                height: 44,
                background: 'rgba(26,86,219,.15)',
                border: '1px solid rgba(26,86,219,.4)',
                color: '#60a5fa',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Solicitar Demo
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} style={{ flex: 1 }}>
            <Button
              block
              onClick={() => navigate('/registrar')}
              style={{
                height: 44,
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.15)',
                color: 'rgba(255,255,255,.7)',
                borderRadius: 10,
              }}
            >
              Crear cuenta
            </Button>
          </motion.div>
        </div>

        <Text style={{
          display: 'block', textAlign: 'center',
          marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,.2)',
        }}>
          © 2026 HiCloud ERP · Cumplimiento DGII República Dominicana
        </Text>
      </motion.div>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
