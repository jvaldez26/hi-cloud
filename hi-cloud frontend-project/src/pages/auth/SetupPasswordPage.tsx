import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Input, Form, Alert } from 'antd';
import { Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

interface SetupForm {
  password:        string;
  confirmPassword: string;
}

const rules = [
  { label: 'Mínimo 8 caracteres',              test: (p: string) => p.length >= 8 },
  { label: 'Al menos una mayúscula (A-Z)',      test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Al menos un número (0-9)',          test: (p: string) => /\d/.test(p) },
];

export default function SetupPasswordPage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { login }  = useAuthStore();

  const token = params.get('token') ?? '';

  const [form]        = Form.useForm<SetupForm>();
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Si no hay token en la URL, redirigir al login
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
      // Auto-login: guardar estado y redirigir al dashboard
      login(data.user, data.empresaActual, data.empresas ?? []);
      setSuccess(true);

      setTimeout(() => {
        if (data.user?.role === 'super_admin') {
          navigate('/super-admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      }, 1500);
    } catch (err: any) {
      const msg: string =
        err?.response?.data?.message ??
        'Error al configurar la contraseña. Inténtalo de nuevo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 20,
          padding: '48px 40px', maxWidth: 460, width: '100%',
          textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,.5)',
        }}>
          <div style={{
            width: 80, height: 80,
            background: 'linear-gradient(135deg, #10b98122, #059669)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            border: '2px solid #10b98144',
          }}>
            <CheckCircle size={40} color="#10b981" />
          </div>
          <h1 style={{ color: '#f8fafc', fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>
            ¡Contraseña configurada!
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>
            Redirigiendo al dashboard…
          </p>
        </div>
      </div>
    );
  }

  const tokenExpiredOrInvalid =
    error?.includes('inválido') || error?.includes('utilizado') || error?.includes('expirado');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#1e293b', border: '1px solid #334155', borderRadius: 20,
        padding: '48px 40px', maxWidth: 460, width: '100%',
        boxShadow: '0 25px 50px rgba(0,0,0,.5)',
      }}>
        {/* Icono */}
        <div style={{
          width: 72, height: 72,
          background: 'linear-gradient(135deg, #3b82f622, #1d4ed8)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          border: '2px solid #3b82f644',
        }}>
          <Lock size={32} color="#3b82f6" />
        </div>

        <h1 style={{ color: '#f8fafc', fontSize: 24, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>
          Configura tu contraseña
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 1.6 }}>
          ¡Tu cuenta fue aprobada! Crea una contraseña para acceder con email o con Google en el futuro.
        </p>

        {/* Error */}
        {error && (
          <Alert
            type="error"
            message={error}
            style={{ marginBottom: 20, borderRadius: 8 }}
            description={tokenExpiredOrInvalid
              ? 'Inicia sesión con Google y obtendrás un nuevo enlace de forma automática.'
              : undefined}
            action={tokenExpiredOrInvalid
              ? (
                <Button
                  size="small"
                  type="link"
                  style={{ color: '#3b82f6' }}
                  onClick={() => window.location.href = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/google`}
                >
                  Continuar con Google →
                </Button>
              ) : undefined}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          onValuesChange={(_, all) => setPassword(all.password ?? '')}
          requiredMark={false}
        >
          {/* Nueva contraseña */}
          <Form.Item
            name="password"
            label={<span style={{ color: '#cbd5e1', fontSize: 13 }}>Nueva contraseña</span>}
            rules={[
              { required: true, message: 'Ingresa tu contraseña' },
              { min: 8, message: 'Mínimo 8 caracteres' },
              {
                pattern: /(?=.*[A-Z])(?=.*\d)/,
                message: 'Debe tener al menos una mayúscula y un número',
              },
            ]}
          >
            <Input
              type={showPw ? 'text' : 'password'}
              placeholder="••••••••"
              size="large"
              suffix={
                <span
                  style={{ cursor: 'pointer', color: '#64748b' }}
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              }
              style={{ background: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: 8 }}
            />
          </Form.Item>

          {/* Confirmar contraseña */}
          <Form.Item
            name="confirmPassword"
            label={<span style={{ color: '#cbd5e1', fontSize: 13 }}>Confirmar contraseña</span>}
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
                <span
                  style={{ cursor: 'pointer', color: '#64748b' }}
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
              }
              style={{ background: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: 8 }}
            />
          </Form.Item>

          {/* Indicadores de fortaleza */}
          {password && (
            <div style={{
              background: '#0f172a', borderRadius: 8, padding: '12px 16px', marginBottom: 20,
            }}>
              {rules.map((r, i) => {
                const ok = r.test(password);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 0', fontSize: 13,
                    color: ok ? '#10b981' : '#64748b',
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
              background: 'linear-gradient(135deg, #1a56db, #0ea5e9)',
              border: 'none', borderRadius: 10,
              fontWeight: 700, fontSize: 15, height: 48,
            }}
          >
            Guardar y entrar
          </Button>
        </Form>
      </div>
    </div>
  );
}
