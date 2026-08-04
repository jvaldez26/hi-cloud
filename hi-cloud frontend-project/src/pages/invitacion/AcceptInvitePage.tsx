import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Spin, Result, Tag, Alert, Space, theme } from 'antd';
import { LockOutlined, UserOutlined, CheckCircleOutlined, MailOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
const { Title, Text } = Typography;

const ROL_INFO: Record<string, { label: string; color: string; icon: string }> = {
  admin:    { label: 'Administrador', color: '#1677ff', icon: '👑' },
  contador: { label: 'Contador',      color: '#7c3aed', icon: '📊' },
  vendedor: { label: 'Vendedor',      color: '#10b981', icon: '🛒' },
  viewer:   { label: 'Solo lectura',  color: '#64748b', icon: '👁️' },
};

export default function AcceptInvitePage() {
  const { token: themeToken } = theme.useToken();
  const { token }   = useParams<{ token: string }>();
  const navigate    = useNavigate();
  const [done,  setDone]  = useState(false);
  const [empresaIdAceptada, setEmpresaIdAceptada] = useState<number | null>(null);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Obtener datos de la invitación
  const { data: inv, isLoading, error } = useQuery({
    queryKey: ['invitacion', token],
    queryFn:  () => api.get(`/invitaciones/aceptar/${token}`).then(r => r.data?.data ?? r.data),
    enabled:  !!token,
    retry:    false,
  });

  // Aceptar invitación
  const aceptarMut = useMutation({
    mutationFn: (body: { nombre?: string; password?: string }) =>
      api.post(`/invitaciones/aceptar/${token}`, body).then(r => r.data?.data ?? r.data),
    onSuccess: async (data: any) => {
      const nuevoEmpresaId = data?.empresaId ?? null;
      setEmpresaIdAceptada(nuevoEmpresaId);

      // Si el usuario ya está logueado, actualizar el JWT con la nueva empresa
      // para evitar el loop de recargas en AppLayout al navegar al dashboard.
      if (user && nuevoEmpresaId) {
        try {
          await api.post('/auth/cambiar-empresa', { empresaId: nuevoEmpresaId });
          localStorage.setItem('empresaId', String(nuevoEmpresaId));
        } catch {
          // Si falla, el usuario puede hacer login de nuevo
        }
        // Invalidar la lista de empresas para que el switcher la refresque
        // inmediatamente sin necesitar logout/login
        queryClient.invalidateQueries({ queryKey: ['mis-empresas'] });
      }
      setDone(true);
    },
    onError: (e: any) => {
      // Si el usuario ya existía, igual mostramos éxito
      if (e?.response?.status === 409) setDone(true);
    },
  });

  const handleSubmit = (values: any) => {
    aceptarMut.mutate({
      nombre:   values.nombre,
      password: values.password,
    });
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );

  // ── Error (token inválido / expirado) ────────────────────────────────────
  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
      <Result
        status="warning"
        title="Invitación no disponible"
        subTitle={(error as any)?.response?.data?.message ?? 'Este enlace es inválido o ha expirado.'}
        extra={
          <Button type="primary" onClick={() => navigate('/login')}>
            Ir al inicio de sesión
          </Button>
        }
      />
    </div>
  );

  // ── Éxito ────────────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <Card style={{ maxWidth: 440, borderRadius: 20, textAlign: 'center', padding: '12px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 56, color: '#10b981', marginBottom: 16 }} />
          <Title level={3} style={{ color: '#10b981' }}>¡Bienvenido al equipo!</Title>
          <Text type="secondary">
            Ya tienes acceso a <strong>{inv?.nombreEmpresa}</strong>.<br />
            {user ? 'Accede ahora al sistema.' : 'Inicia sesión con tu email y contraseña.'}
          </Text>
          <div style={{ marginTop: 24 }}>
            {user && empresaIdAceptada ? (
              // Usuario ya logueado: JWT actualizado → ir directo al dashboard
              <Button type="primary" size="large" block
                onClick={() => { window.location.replace('/dashboard'); }}
                style={{ borderRadius: 10, height: 48, background: '#10b981', border: 'none' }}>
                Ir al Dashboard →
              </Button>
            ) : (
              // Usuario nuevo o sesión inactiva: hacer login limpio
              <Button type="primary" size="large" block onClick={() => navigate('/login')}
                style={{ borderRadius: 10, height: 48 }}>
                Ir al inicio de sesión
              </Button>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );

  const rolInfo = ROL_INFO[inv?.rol] ?? ROL_INFO.viewer;

  // ── Formulario ───────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ width: '100%', maxWidth: 460 }}
      >
        <Card style={{ borderRadius: 20, overflow: 'hidden', padding: 0 }}
          styles={{ body: { padding: 0 } }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
            padding: '28px 32px',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(255,255,255,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 14,
            }}>H</div>
            <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, display: 'block' }}>
              Invitación a HiCloud ERP
            </Text>
            <Title level={3} style={{ color: '#fff', margin: '4px 0 0' }}>
              Únete a {inv?.nombreEmpresa}
            </Title>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 32px' }}>
            {/* Info invitación */}
            <div style={{
              background: themeToken.colorFillAlter, borderRadius: 12,
              padding: '14px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 28 }}>{rolInfo.icon}</div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <strong>{inv?.nombreInvitador}</strong> te invitó como:
                </Text>
                <br />
                <Tag color={rolInfo.color} style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                  {rolInfo.label}
                </Tag>
              </div>
            </div>

            {inv?.userExiste ? (
              // Usuario ya existe → solo aceptar
              <>
                <Alert
                  type="success" showIcon style={{ marginBottom: 20 }}
                  message={`Ya tienes una cuenta con ${inv.email}. Haz click en aceptar para unirte.`}
                />
                <Button type="primary" size="large" block loading={aceptarMut.isPending}
                  onClick={() => aceptarMut.mutate({})}
                  style={{ height: 50, borderRadius: 12, fontSize: 16 }}>
                  ✓ Aceptar y unirme a {inv.nombreEmpresa}
                </Button>
              </>
            ) : (
              // Usuario nuevo → crear cuenta
              <Form layout="vertical" onFinish={handleSubmit}>
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MailOutlined style={{ color: '#1677ff' }} />
                  <Text style={{ color: '#1677ff', fontSize: 13 }}>{inv?.email}</Text>
                </div>

                <Form.Item name="nombre" label="Tu nombre completo"
                  rules={[{ required: true, min: 2, message: 'Ingresa tu nombre' }]}>
                  <Input prefix={<UserOutlined />} placeholder="Juan Pérez" size="large" />
                </Form.Item>

                <Form.Item name="password" label="Crea tu contraseña"
                  rules={[{ required: true, min: 6, message: 'Mínimo 6 caracteres' }]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
                </Form.Item>

                <Form.Item name="confirm" label="Confirmar contraseña"
                  dependencies={['password']}
                  rules={[
                    { required: true },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject('Las contraseñas no coinciden');
                      },
                    }),
                  ]}>
                  <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
                </Form.Item>

                <Button type="primary" htmlType="submit" size="large" block
                  loading={aceptarMut.isPending}
                  style={{ height: 50, borderRadius: 12, fontSize: 16,
                    background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none' }}>
                  Crear cuenta y unirme
                </Button>
              </Form>
            )}

            <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 16 }}>
              Al aceptar, confirmas que eres {inv?.email} y aceptas los términos de uso de HiCloud ERP.
            </Text>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
