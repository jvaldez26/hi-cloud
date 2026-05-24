import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { authApi } from '../../api/auth.api';
import DemoModal from './DemoModal';

const { Title, Text } = Typography;

function ThemeToggle() {
  const { isDark, toggle } = useThemeStore();
  return (
    <motion.button
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{
        position: 'absolute', top: 24, right: 24,
        background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
        borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
        color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center',
        transition: 'all .15s', zIndex: 10,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.15)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}>
      {isDark
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </motion.button>
  );
}

export default function LoginPage() {
  const [loading,          setLoading]          = useState(false);
  const [demoOpen,         setDemoOpen]         = useState(false);
  const [recordarPassword, setRecordarPassword] = useState<boolean>(
    () => localStorage.getItem('hicloud_recordar_pw') === 'true',
  );
  const [correoNoVerif, setCorreoNoVerif] = useState(false);
  const [emailIngresado,setEmailIngresado]= useState('');
  const [reenviando,    setReenviando]    = useState(false);
  const [reenviado,     setReenviado]     = useState(false);
  const [pending2FA,    setPending2FA]    = useState(false);
  const [codigoTOTP,    setCodigoTOTP]    = useState('');
  const { login } = useAuthStore();
  const navigate  = useNavigate();

  // Leer mensaje de empresa suspendida si viene del interceptor
  const mensajeSuspension = sessionStorage.getItem('login_error') ?? '';
  const [error, setError] = useState(mensajeSuspension);
  if (mensajeSuspension) sessionStorage.removeItem('login_error');

  const reenviarVerificacion = async () => {
    setReenviando(true);
    try {
      await authApi.resendVerification(emailIngresado);
    } catch { /* respuesta neutra */ }
    finally { setReenviando(false); setReenviado(true); }
  };

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError('');
    setCorreoNoVerif(false);
    setReenviado(false);
    setEmailIngresado(values.email);
    try {
      const data = await authApi.login(values.email, values.password);
      if (!data) throw new Error('Sin respuesta');

      // Segundo factor requerido → mostrar paso de TOTP
      if ((data as any).requiresTwoFactor) {
        setPending2FA(true);
        setLoading(false);
        return;
      }

      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? []);
      if ((data as any).user?.role === 'super_admin') {
        navigate('/super-admin');
      } else {
        navigate('/dashboard');
      }
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Credenciales inválidas';
      if (msg === 'CORREO_NO_VERIFICADO') {
        setCorreoNoVerif(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onFinish2FA = async () => {
    if (codigoTOTP.length !== 6) { setError('Ingresa el código de 6 dígitos'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await authApi.complete2FALogin(codigoTOTP);
      if (!data) throw new Error('Sin respuesta');
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? []);
      if ((data as any).user?.role === 'super_admin') {
        navigate('/super-admin');
      } else {
        navigate('/dashboard');
      }
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Código incorrecto';
      setError(msg);
      setCodigoTOTP('');
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
      position: 'relative',
    }}>

      <ThemeToggle />

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
          <motion.img
            src="/logo-hicloud.png"
            alt="HiCloud ERP"
            whileHover={{ scale: 1.04 }}
            style={{ height: 72, width: 'auto', margin: '0 auto 12px', display: 'block',
              filter: 'drop-shadow(0 4px 16px rgba(0,170,255,0.4))' }}
          />
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

          {correoNoVerif && (
            <Alert type="warning" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
              message="Correo no verificado"
              description={
                reenviado ? (
                  <span>✅ Correo enviado. Revisa tu bandeja de entrada.</span>
                ) : (
                  <span>
                    Debes verificar tu correo antes de iniciar sesión.{' '}
                    <button onClick={reenviarVerificacion} disabled={reenviando}
                      style={{ background: 'none', border: 'none', color: '#d97706', fontWeight: 600, cursor: reenviando ? 'wait' : 'pointer', padding: 0, textDecoration: 'underline' }}>
                      {reenviando ? 'Enviando…' : 'Reenviar correo'}
                    </button>
                  </span>
                )
              }
            />
          )}

          {/* ── Paso 2: código TOTP ────────────────────────────────────────── */}
          {pending2FA && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Text style={{ color: 'rgba(255,255,255,.9)', fontWeight: 600, fontSize: 15, display: 'block' }}>
                  Autenticación en dos factores
                </Text>
                <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
                  Ingresa el código de tu aplicación autenticadora
                </Text>
              </div>
              <Input
                maxLength={6}
                placeholder="123456"
                value={codigoTOTP}
                onChange={e => { setCodigoTOTP(e.target.value.replace(/\D/g, '')); setError(''); }}
                onPressEnter={onFinish2FA}
                autoFocus
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, height: 56, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 10, marginBottom: 12 }}
              />
              <Button type="primary" block loading={loading} onClick={onFinish2FA}
                disabled={codigoTOTP.length !== 6}
                style={{ height: 48, background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, boxShadow: '0 4px 20px rgba(26,86,219,.45)' }}>
                {loading ? 'Verificando…' : 'Verificar código'}
              </Button>
              <button onClick={() => { setPending2FA(false); setCodigoTOTP(''); setError(''); }}
                style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', marginTop: 12, fontSize: 12 }}>
                ← Volver al login
              </button>
            </div>
          )}

          <Form layout="vertical" onFinish={onFinish} size="large"
            style={{ display: pending2FA ? 'none' : undefined }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
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
                autoComplete={recordarPassword ? 'current-password' : 'new-password'}
                style={{
                  background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.15)',
                  color: '#fff',
                  borderRadius: 10,
                  height: 46,
                }}
              />
            </Form.Item>

            <div style={{ marginBottom: 16, marginTop: -4 }}>
              <Checkbox
                checked={recordarPassword}
                onChange={e => {
                  setRecordarPassword(e.target.checked);
                  localStorage.setItem('hicloud_recordar_pw', String(e.target.checked));
                }}
                style={{ color: 'rgba(255,255,255,.65)', fontSize: 13 }}
              >
                Recordar contraseña en este dispositivo
              </Checkbox>
            </div>

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

        {/* Google OAuth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
          <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>o continúa con</Text>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
        </div>
        <button
          type="button"
          onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/auth/google`; }}
          style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)',
            background: 'rgba(255,255,255,.07)', color: '#fff', fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.13)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.07)')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </button>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
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
