import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Input, Form, Alert, ConfigProvider, theme as antTheme } from 'antd';
import { Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

interface SetupForm {
  password:        string;
  confirmPassword: string;
}

const pwRules = [
  { label: 'Mínimo 8 caracteres',         test: (p: string) => p.length >= 8 },
  { label: 'Al menos una mayúscula (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Al menos un número (0-9)',     test: (p: string) => /\d/.test(p) },
];

export default function SetupPasswordPage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const { login } = useAuthStore();

  const token = params.get('token') ?? '';

  const [form]        = Form.useForm<SetupForm>();
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token, navigate]);

  const onFinish = async (values: SetupForm) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/setup-password', {
        token,
        password:        values.password,
        confirmPassword: values.confirmPassword,
      });
      const data = res.data;
      login(data.user, data.empresaActual, data.empresas ?? []);
      setSuccess(true);
      const role: string = data.user?.role ?? '';
      const destino =
        role === 'super_admin' ? '/super-admin'     :
        role === 'empleado'    ? '/portal-empleado' :
        '/dashboard';
      setTimeout(() => navigate(destino, { replace: true }), 1500);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ?? 'Error al configurar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  };

  const tokenInvalid = error?.includes('inválido') || error?.includes('utilizado') || error?.includes('expirado');

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E5E7EB',
    borderRadius: 20, padding: '48px 40px',
    maxWidth: 460, width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,.06)',
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, background: '#ECFDF5',
            borderRadius: '50%', border: '2px solid #A7F3D0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <CheckCircle size={40} color="#10B981" />
          </div>
          <h1 style={{ color: '#0F172A', fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
            ¡Contraseña configurada!
          </h1>
          <p style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>Redirigiendo…</p>
        </div>
      </div>
    );
  }

  return (
    <ConfigProvider theme={{
      algorithm: antTheme.defaultAlgorithm,
      token: {
        colorBgContainer: '#F8FAFC', colorText: '#0F172A',
        colorBorder: '#CBD5E1', colorPrimary: '#2563EB',
        borderRadius: 10, controlHeight: 48,
      },
    }}>
      <div style={{ minHeight: '100vh', background: '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={card}>
          {/* Ícono */}
          <div style={{
            width: 72, height: 72, background: '#EFF6FF',
            borderRadius: '50%', border: '2px solid #BFDBFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Lock size={32} color="#2563EB" />
          </div>

          <h1 style={{ color: '#0F172A', fontSize: 24, fontWeight: 800,
                       margin: '0 0 8px', textAlign: 'center' }}>
            Configura tu contraseña
          </h1>
          <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center',
                      marginBottom: 32, lineHeight: 1.6 }}>
            ¡Tu cuenta fue aprobada! Crea una contraseña para acceder con email o con Google en el futuro.
          </p>

          {error && (
            <Alert
              type="error"
              message={error}
              style={{ marginBottom: 20, borderRadius: 8 }}
              description={tokenInvalid
                ? 'Inicia sesión con Google y obtendrás un nuevo enlace de forma automática.'
                : undefined}
              action={tokenInvalid
                ? (
                  <Button size="small" type="link" style={{ color: '#2563EB' }}
                    onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/google`; }}>
                    Continuar con Google →
                  </Button>
                ) : undefined}
              showIcon
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={(_, all) => setPassword(all.password ?? '')}
            requiredMark={false}
          >
            <Form.Item
              name="password"
              label={<span style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 600 }}>Nueva contraseña</span>}
              rules={[
                { required: true, message: 'Ingresa tu contraseña' },
                { min: 8, message: 'Mínimo 8 caracteres' },
                { pattern: /(?=.*[A-Z])(?=.*\d)/, message: 'Debe tener al menos una mayúscula y un número' },
              ]}
            >
              <Input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                size="large"
                suffix={
                  <span style={{ cursor: 'pointer', color: '#94A3B8' }}
                        onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </span>
                }
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 600 }}>Confirmar contraseña</span>}
              dependencies={['password']}
              rules={[
                { required: true, message: 'Confirma tu contraseña' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Las contraseñas no coinciden'));
                  },
                }),
              ]}
            >
              <Input
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                size="large"
                suffix={
                  <span style={{ cursor: 'pointer', color: '#94A3B8' }}
                        onClick={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </span>
                }
              />
            </Form.Item>

            {/* Indicadores de fortaleza */}
            {password && (
              <div style={{
                background: '#F8FAFC', borderRadius: 8, padding: '12px 16px',
                marginBottom: 20, border: '1px solid #E5E7EB',
              }}>
                {pwRules.map((r, i) => {
                  const ok = r.test(password);
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '3px 0', fontSize: 13,
                      color: ok ? '#059669' : '#9CA3AF',
                    }}>
                      <span style={{ fontSize: 10 }}>{ok ? '✅' : '○'}</span>
                      {r.label}
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{
                background: '#2563EB', border: 'none',
                borderRadius: 10, fontWeight: 700, fontSize: 15, height: 48,
              }}
            >
              Guardar y entrar
            </Button>
          </Form>
        </div>
      </div>
    </ConfigProvider>
  );
}
