import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Typography, Alert, Checkbox } from 'antd';
import { UserOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { authApi } from '../../api/auth.api';
import DemoModal from './DemoModal';

const { Text } = Typography;

// ── CountUp para stats ────────────────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let cur = 0; const step = to / 50;
    const t = setInterval(() => { cur += step; if (cur >= to) { setN(to); clearInterval(t); } else setN(Math.floor(cur)); }, 20);
    return () => clearInterval(t);
  }, [inView, to]);
  return <span ref={ref}>{n.toLocaleString('es-DO')}{suffix}</span>;
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
  const { isDark } = useThemeStore();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const mensajeSuspension = sessionStorage.getItem('login_error') ?? '';
  const GOOGLE_ERRORS: Record<string, { msg: string; link?: { to: string; label: string } }> = {
    google_no_account: { msg: 'No encontramos una cuenta con ese email de Google. ¿Eres nuevo?', link: { to: '/registrar', label: 'Crear cuenta gratis →' } },
    google_no_company: { msg: 'Tu cuenta de Google no tiene una empresa activa. Inicia sesión con email y contraseña para configurar tu empresa.' },
    google_failed:     { msg: 'Error al iniciar sesión con Google. Inténtalo de nuevo o usa tu email y contraseña.' },
  };
  const googleErrorCode = searchParams.get('error') ?? '';
  const googleErrorInfo = GOOGLE_ERRORS[googleErrorCode];
  const initialError = mensajeSuspension || (googleErrorInfo?.msg ?? '');
  const [error, setError] = useState(initialError);
  if (mensajeSuspension) sessionStorage.removeItem('login_error');

  const reenviarVerificacion = async () => {
    setReenviando(true);
    try { await authApi.resendVerification(emailIngresado); }
    catch { /* respuesta neutra */ }
    finally { setReenviando(false); setReenviado(true); }
  };

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true); setError(''); setCorreoNoVerif(false); setReenviado(false);
    setEmailIngresado(values.email);
    try {
      const data = await authApi.login(values.email, values.password);
      if (!data) throw new Error('Sin respuesta');
      if ((data as any).requiresTwoFactor) { setPending2FA(true); setLoading(false); return; }
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? []);
      navigate((data as any).user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Credenciales inválidas';
      if (msg === 'CORREO_NO_VERIFICADO') setCorreoNoVerif(true); else setError(msg);
    } finally { setLoading(false); }
  };

  const onFinish2FA = async () => {
    if (codigoTOTP.length !== 6) { setError('Ingresa el código de 6 dígitos'); return; }
    setLoading(true); setError('');
    try {
      const data = await authApi.complete2FALogin(codigoTOTP);
      if (!data) throw new Error('Sin respuesta');
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? []);
      navigate((data as any).user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Código incorrecto';
      setError(msg); setCodigoTOTP('');
    } finally { setLoading(false); }
  };

  // Colores del lado derecho según tema
  const rightBg     = isDark ? '#0f172a' : '#FFFFFF';
  const rightText   = isDark ? '#f1f5f9' : '#111827';
  const rightSub    = isDark ? '#94a3b8' : '#6B7280';
  const rightBorder = isDark ? '#1e293b' : '#E5E7EB';
  const rightCard   = isDark ? '#1e293b' : '#F8FAFC';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @media(max-width:768px){ .login-left{display:none!important} .login-right{width:100%!important} }
        @media(max-width:480px){ .login-right-inner{padding:24px 20px!important} }
        .login-input .ant-input, .login-input .ant-input-affix-wrapper {
          background:${rightCard}!important; border-color:${rightBorder}!important;
          color:${rightText}!important; border-radius:10px!important; height:46px!important;
        }
        .login-input .ant-input::placeholder { color:${rightSub}!important; }
        .login-input .ant-form-item-label label { color:${rightSub}!important; font-size:13px!important; }
        .login-input .ant-checkbox-wrapper { color:${rightSub}!important; font-size:13px!important; }
      `}</style>

      {/* ── LADO IZQUIERDO ──────────────────────────────────────────────── */}
      <div className="login-left" style={{
        width: '50%', background: 'linear-gradient(150deg,#1E3A8A 0%,#1e40af 60%,#1d4ed8 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Círculos decorativos de fondo */}
        <div style={{ position:'absolute', top:-80, right:-80, width:300, height:300, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:-60, width:250, height:250, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }} />

        <motion.div initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} transition={{ duration:.7 }}
          style={{ maxWidth:440, width:'100%', position:'relative', zIndex:1 }}>

          {/* Logo */}
          <img src="/logo-hicloud.png" alt="HiCloud ERP"
            style={{ height:56, width:'auto', filter:'brightness(0) invert(1)', marginBottom:24, display:'block' }} />

          <h1 style={{ color:'#fff', fontSize:28, fontWeight:800, margin:'0 0 10px', lineHeight:1.2 }}>
            El ERP para PYMEs<br />dominicanas
          </h1>
          <p style={{ color:'rgba(255,255,255,.65)', fontSize:15, margin:'0 0 40px', lineHeight:1.6 }}>
            Facturación electrónica, contabilidad, POS y más.<br />
            Cumplimiento DGII garantizado.
          </p>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:40 }}>
            {[
              { icon:'🧾', num: 50000, suffix:'+', label:'Facturas emitidas' },
              { icon:'🏢', num: 120,   suffix:'+', label:'Empresas activas' },
              { icon:'⚡', num: 99,    suffix:'.9%', label:'Uptime' },
            ].map(s => (
              <div key={s.label} style={{ background:'rgba(255,255,255,.1)', borderRadius:12, padding:'14px 12px', textAlign:'center' }}>
                <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
                <div style={{ color:'#fff', fontSize:18, fontWeight:800 }}>
                  <CountUp to={s.num} suffix={s.suffix} />
                </div>
                <div style={{ color:'rgba(255,255,255,.55)', fontSize:11, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Card flotante principal */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background:'rgba(255,255,255,.12)', backdropFilter:'blur(12px)',
              border:'1px solid rgba(255,255,255,.2)', borderRadius:14,
              padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#10B981', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✅</div>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>e-CF E32 enviado · RD$118.00</div>
              <div style={{ color:'rgba(255,255,255,.55)', fontSize:12, marginTop:2 }}>Hace 2 minutos · LUBRIGOMAS PC, SRL</div>
            </div>
          </motion.div>

          {/* Card secundaria */}
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            style={{ background:'rgba(255,255,255,.08)', backdropFilter:'blur(12px)',
              border:'1px solid rgba(255,255,255,.15)', borderRadius:14,
              padding:'12px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:20 }}>📊</div>
            <div>
              <div style={{ color:'rgba(255,255,255,.8)', fontWeight:600, fontSize:13 }}>Ventas hoy</div>
              <div style={{ color:'#60A5FA', fontWeight:800, fontSize:17 }}>RD$45,230.00</div>
            </div>
          </motion.div>

          {/* Link a landing */}
          <Link to="/" style={{ color:'rgba(255,255,255,.4)', fontSize:12, textDecoration:'none', marginTop:28, display:'block', textAlign:'center' }}>
            ← Volver al inicio
          </Link>
        </motion.div>
      </div>

      {/* ── LADO DERECHO — FORMULARIO ────────────────────────────────────── */}
      <div className="login-right" style={{
        width:'50%', background:rightBg, display:'flex',
        alignItems:'center', justifyContent:'center',
        padding:'24px 16px', overflowY:'auto',
      }}>
        <motion.div className="login-right-inner"
          initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ duration:.5, delay:.1 }}
          style={{ width:'100%', maxWidth:420, padding:'40px 32px' }}>

          {/* Logo móvil */}
          <div className="login-logo-mobile" style={{ textAlign:'center', marginBottom:28, display:'none' }}>
            <img src="/logo-hicloud.png" alt="HiCloud ERP" style={{ height:44, width:'auto' }} />
          </div>

          <div style={{ marginBottom:32 }}>
            <h2 style={{ color:rightText, fontSize:26, fontWeight:800, margin:'0 0 6px' }}>
              Bienvenido de nuevo
            </h2>
            <p style={{ color:rightSub, fontSize:14, margin:0 }}>
              Inicia sesión en tu cuenta
            </p>
          </div>

          {/* Errores */}
          {error && (
            <Alert type="error" showIcon style={{ marginBottom:16, borderRadius:10 }}
              message={
                <span>{error}{googleErrorInfo?.link && (
                  <>{' '}<Link to={googleErrorInfo.link.to} style={{ fontWeight:700 }}>{googleErrorInfo.link.label}</Link></>
                )}</span>
              } />
          )}
          {correoNoVerif && (
            <Alert type="warning" showIcon style={{ marginBottom:16, borderRadius:10 }}
              message="Correo no verificado"
              description={reenviado ? '✅ Correo enviado. Revisa tu bandeja de entrada.' : (
                <span>Debes verificar tu correo antes de iniciar sesión.{' '}
                  <button onClick={reenviarVerificacion} disabled={reenviando}
                    style={{ background:'none', border:'none', color:'#d97706', fontWeight:600, cursor:reenviando?'wait':'pointer', padding:0, textDecoration:'underline' }}>
                    {reenviando ? 'Enviando…' : 'Reenviar correo'}
                  </button>
                </span>
              )} />
          )}

          {/* 2FA */}
          {pending2FA && (
            <div>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <Text strong style={{ color:rightText, fontSize:15, display:'block' }}>Autenticación en dos factores</Text>
                <Text style={{ color:rightSub, fontSize:13 }}>Ingresa el código de tu aplicación autenticadora</Text>
              </div>
              <Input maxLength={6} placeholder="123456" value={codigoTOTP} autoFocus
                onChange={e => { setCodigoTOTP(e.target.value.replace(/\D/g,'')); setError(''); }}
                onPressEnter={onFinish2FA}
                style={{ textAlign:'center', fontSize:24, letterSpacing:8, height:56,
                  background:rightCard, border:`1px solid ${rightBorder}`, color:rightText,
                  borderRadius:10, marginBottom:12 }} />
              <Button type="primary" block loading={loading} onClick={onFinish2FA}
                disabled={codigoTOTP.length !== 6}
                style={{ height:48, borderRadius:10, fontSize:15, fontWeight:600,
                  background:'#1E3A8A', border:'none' }}>
                {loading ? 'Verificando…' : 'Verificar código'}
              </Button>
              <button onClick={() => { setPending2FA(false); setCodigoTOTP(''); setError(''); }}
                style={{ width:'100%', background:'none', border:'none', color:rightSub,
                  cursor:'pointer', marginTop:12, fontSize:13 }}>
                ← Volver al login
              </button>
            </div>
          )}

          {/* Formulario principal */}
          <div className="login-input" style={{ display: pending2FA ? 'none' : undefined }}>
            <Form layout="vertical" onFinish={onFinish} size="large">
              <Form.Item name="email" label="Correo electrónico"
                rules={[{ required:true, message:'El correo es requerido' },{ type:'email', message:'Correo inválido' }]}>
                <Input prefix={<UserOutlined style={{ color:rightSub }} />}
                  placeholder="usuario@empresa.com" autoComplete="email" type="email" />
              </Form.Item>

              <Form.Item
                name="password"
                label={
                  <div style={{ display:'flex', justifyContent:'space-between', width:'100%' }}>
                    <span>Contraseña</span>
                    <Link to="/recuperar-contrasena" style={{ color:'#2563EB', fontSize:12, fontWeight:400 }}>
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                }
                rules={[{ required:true, message:'La contraseña es requerida' }]}>
                <Input.Password prefix={<span style={{ color:rightSub }}>🔒</span>}
                  placeholder="••••••••"
                  autoComplete={recordarPassword ? 'current-password' : 'new-password'} />
              </Form.Item>

              <div style={{ marginBottom:20, marginTop:-8 }}>
                <Checkbox checked={recordarPassword}
                  onChange={e => { setRecordarPassword(e.target.checked); localStorage.setItem('hicloud_recordar_pw', String(e.target.checked)); }}>
                  Recordar contraseña en este dispositivo
                </Checkbox>
              </div>

              <Button type="primary" htmlType="submit" block loading={loading}
                style={{ height:48, background:'#1E3A8A', border:'none', borderRadius:10,
                  fontSize:15, fontWeight:700, boxShadow:'0 4px 16px rgba(30,58,138,.35)' }}>
                {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </Button>
            </Form>

            {/* Google OAuth */}
            <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 12px' }}>
              <div style={{ flex:1, height:1, background:rightBorder }} />
              <Text style={{ color:rightSub, fontSize:12 }}>o continúa con</Text>
              <div style={{ flex:1, height:1, background:rightBorder }} />
            </div>
            <button type="button"
              onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/auth/google`; }}
              style={{ width:'100%', height:44, borderRadius:10, border:`1px solid ${rightBorder}`,
                background:rightCard, color:rightText, fontSize:14, fontWeight:600,
                display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#334155' : '#F1F5F9')}
              onMouseLeave={e => (e.currentTarget.style.background = rightCard)}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar con Google
            </button>

            {/* Sin cuenta */}
            <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0 12px' }}>
              <div style={{ flex:1, height:1, background:rightBorder }} />
              <Text style={{ color:rightSub, fontSize:12 }}>¿No tienes cuenta?</Text>
              <div style={{ flex:1, height:1, background:rightBorder }} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Button block icon={<RocketOutlined />} onClick={() => setDemoOpen(true)}
                style={{ height:44, borderRadius:10, border:`1px solid #2563EB`,
                  background:isDark?'rgba(37,99,235,.15)':'#EFF6FF', color:'#2563EB', fontWeight:600 }}>
                Solicitar Demo
              </Button>
              <Button block onClick={() => navigate('/registrar')}
                style={{ height:44, borderRadius:10, border:`1px solid ${rightBorder}`,
                  background:rightCard, color:rightText, fontWeight:600 }}>
                Crear cuenta
              </Button>
            </div>

            <Text style={{ display:'block', textAlign:'center', marginTop:24, fontSize:11, color:rightSub }}>
              © 2026 HiCloud ERP · Cumplimiento DGII República Dominicana
            </Text>
          </div>
        </motion.div>
      </div>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
