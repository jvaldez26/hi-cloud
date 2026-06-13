import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Typography, Alert, Checkbox, ConfigProvider, theme as antTheme } from 'antd';
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
  const [correoNoVerif,  setCorreoNoVerif]  = useState(false);
  const [emailIngresado, setEmailIngresado] = useState('');
  const [reenviando,     setReenviando]     = useState(false);
  const [reenviado,      setReenviado]      = useState(false);
  const [pending2FA,     setPending2FA]     = useState(false);
  const [codigoTOTP,     setCodigoTOTP]     = useState('');
  const [blockCountdown, setBlockCountdown] = useState(0);
  const blockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Limpia el interval al desmontar para evitar memory leaks
  useEffect(() => {
    return () => { if (blockIntervalRef.current) clearInterval(blockIntervalRef.current); };
  }, []);

  const startBlockCountdown = (seconds: number) => {
    if (blockIntervalRef.current) clearInterval(blockIntervalRef.current);
    setBlockCountdown(seconds);
    blockIntervalRef.current = setInterval(() => {
      setBlockCountdown(prev => {
        if (prev <= 1) {
          clearInterval(blockIntervalRef.current!);
          blockIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const reenviarVerificacion = async () => {
    setReenviando(true);
    try { await authApi.resendVerification(emailIngresado); }
    catch { /* respuesta neutra */ }
    finally { setReenviando(false); setReenviado(true); }
  };

  const onFinish = async (values: { email: string; password: string }) => {
    if (blockCountdown > 0) return; // bloqueo activo — no enviar
    setLoading(true); setError(''); setCorreoNoVerif(false); setReenviado(false);
    setEmailIngresado(values.email);
    try {
      const data = await authApi.login(values.email, values.password);
      if (!data) throw new Error('Sin respuesta');
      if ((data as any).requiresTwoFactor) { setPending2FA(true); setLoading(false); return; }
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? [], (data as any).almacenActual ?? null, (data as any).sucursalActual ?? null);
      navigate((data as any).user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (e: unknown) {
      const responseData   = (e as any)?.response?.data;
      const msg            = responseData?.errors?.[0] ?? 'Credenciales inválidas';
      const remainingSecs  = responseData?.remainingSeconds as number | undefined;

      if (msg === 'CORREO_NO_VERIFICADO') {
        setCorreoNoVerif(true);
      } else {
        setError(msg);
        if (remainingSecs && remainingSecs > 0) {
          startBlockCountdown(remainingSecs);
        }
      }
    } finally { setLoading(false); }
  };

  const onFinish2FA = async () => {
    if (codigoTOTP.length !== 6) { setError('Ingresa el código de 6 dígitos'); return; }
    setLoading(true); setError('');
    try {
      const data = await authApi.complete2FALogin(codigoTOTP);
      if (!data) throw new Error('Sin respuesta');
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? [], (data as any).almacenActual ?? null, (data as any).sucursalActual ?? null);
      navigate((data as any).user?.role === 'super_admin' ? '/super-admin' : '/dashboard');
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Código incorrecto';
      setError(msg); setCodigoTOTP('');
    } finally { setLoading(false); }
  };

  // Lado derecho siempre claro (diseño fixed, independiente del tema)
  const rightBg     = '#FFFFFF';
  const rightText   = '#0F172A';
  const rightSub    = '#64748B';
  const rightBorder = '#CBD5E1';
  const rightCard   = '#F8FAFC';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <style>{`
        @keyframes floatA { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes floatB { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        /* Mobile: ocultar izquierdo, mostrar logo */
        @media(max-width:768px){
          .login-left{display:none!important}
          .login-right{width:100%!important; min-height:100vh}
          .login-logo-mobile{display:block!important}
          .login-right-inner{padding:32px 24px!important}
        }
        /* Fix doble borde: solo el wrapper tiene background/border, el input interno es transparente */
        .login-panel .ant-input-affix-wrapper {
          background:#F8FAFC!important;
          border:1.5px solid #CBD5E1!important;
          border-radius:10px!important;
          height:48px!important;
          padding:0 12px!important;
          box-shadow:none!important;
        }
        .login-panel .ant-input-affix-wrapper:hover { border-color:#94A3B8!important; }
        .login-panel .ant-input-affix-wrapper-focused {
          border-color:#2563EB!important;
          box-shadow:0 0 0 2px rgba(37,99,235,.12)!important;
        }
        /* Input interno: TRANSPARENTE para evitar el doble */
        .login-panel .ant-input-affix-wrapper .ant-input,
        .login-panel .ant-input-affix-wrapper input {
          background:transparent!important;
          color:#0F172A!important;
          border:none!important;
          box-shadow:none!important;
          height:100%!important;
        }
        /* Input sin wrapper (edge case) */
        .login-panel .ant-input:not(.ant-input-affix-wrapper .ant-input) {
          background:#F8FAFC!important;
          border:1.5px solid #CBD5E1!important;
          border-radius:10px!important; height:48px!important; color:#0F172A!important;
        }
        .login-panel .ant-input::placeholder,
        .login-panel input::placeholder { color:#94A3B8!important; }
        .login-panel .ant-input-prefix { color:#64748B!important; margin-right:8px!important; }
        .login-panel .ant-input-suffix { color:#64748B!important; }
        .login-panel .ant-form-item-label > label { color:#1E3A8A!important; font-size:13px!important; font-weight:600!important; }
        .login-panel .ant-checkbox-inner { background:#fff!important; border-color:#CBD5E1!important; }
        .login-panel .ant-checkbox-checked .ant-checkbox-inner { background:#2563EB!important; border-color:#2563EB!important; }
        .login-panel .ant-checkbox-wrapper span { color:#374151!important; font-size:13px!important; }
        .login-panel .ant-form-item { margin-bottom:18px!important; }
        .login-right-inner { box-sizing:border-box!important; }
      `}</style>

      {/* ── LADO IZQUIERDO ──────────────────────────────────────────────── */}
      <div className="login-left" style={{
        width: '50%', background: 'linear-gradient(150deg,#1E3A8A 0%,#1e40af 60%,#1d4ed8 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', position: 'relative', overflow: 'hidden',
        borderRight: '1px solid rgba(255,255,255,.08)',
      }}>
        {/* Círculos decorativos — mayor opacidad */}
        <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', background:'rgba(255,255,255,.18)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:-60, width:260, height:260, borderRadius:'50%', background:'rgba(255,255,255,.12)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'40%', left:'60%', width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,.07)', pointerEvents:'none' }} />

        <motion.div initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} transition={{ duration:.7 }}
          style={{ maxWidth:440, width:'100%', position:'relative', zIndex:1 }}>

          {/* Logo en contenedor blanco agrandado */}
          <div style={{ background:'#fff', borderRadius:20, width:120, height:120,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 20px rgba(0,0,0,.2)', marginBottom:28 }}>
            <img src="/logo-hicloud.png" alt="HiCloud ERP"
              style={{ width:100, height:'auto', display:'block', objectFit:'contain' }} />
          </div>

          <h1 style={{ color:'#fff', fontSize:30, fontWeight:800, margin:'0 0 12px', lineHeight:1.2 }}>
            El ERP para PYMEs<br />dominicanas
          </h1>
          <p style={{ color:'rgba(255,255,255,.7)', fontSize:15, margin:'0 0 36px', lineHeight:1.65 }}>
            Facturación electrónica, contabilidad, POS y más.<br />
            Cumplimiento DGII garantizado.
          </p>

          {/* Stats — mayor contraste */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:36 }}>
            {[
              { icon:'🧾', num: 50000, suffix:'+', label:'Facturas emitidas' },
              { icon:'🏢', num: 120,   suffix:'+', label:'Empresas activas' },
              { icon:'⚡', num: 99,    suffix:'.9%', label:'Uptime' },
            ].map(s => (
              <div key={s.label} style={{
                background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.22)',
                borderRadius:14, padding:'16px 10px', textAlign:'center',
              }}>
                <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
                <div style={{ color:'#fff', fontSize:22, fontWeight:900, lineHeight:1 }}>
                  <CountUp to={s.num} suffix={s.suffix} />
                </div>
                <div style={{ color:'rgba(255,255,255,.6)', fontSize:11, marginTop:5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Card e-CF — border izquierdo verde + float */}
          <div style={{ animation:'floatA 3s ease-in-out infinite',
            background:'rgba(255,255,255,.13)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,.2)', borderLeft:'4px solid #10B981',
            borderRadius:14, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'#10B981', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✅</div>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>e-CF E32 enviado · RD$118.00</div>
              <div style={{ color:'rgba(255,255,255,.4)', fontSize:12, marginTop:3 }}>Hace 2 minutos · LUBRIGOMAS PC, SRL</div>
            </div>
          </div>

          {/* Card ventas — border izquierdo azul claro + float desfasado */}
          <div style={{ animation:'floatB 4s ease-in-out infinite 1s',
            background:'rgba(255,255,255,.09)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,.15)', borderLeft:'4px solid #60A5FA',
            borderRadius:14, padding:'13px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:22 }}>📊</div>
            <div>
              <div style={{ color:'rgba(255,255,255,.75)', fontWeight:600, fontSize:13 }}>Ventas hoy</div>
              <div style={{ color:'#60A5FA', fontWeight:800, fontSize:18 }}>RD$45,230.00</div>
            </div>
          </div>

          <Link to="/" style={{ color:'rgba(255,255,255,.35)', fontSize:12, textDecoration:'none', marginTop:24, display:'block', textAlign:'center' }}>
            ← Volver al inicio
          </Link>
        </motion.div>
      </div>

      {/* ── LADO DERECHO — FORMULARIO ────────────────────────────────────── */}
      {/* ConfigProvider con defaultAlgorithm fuerza tema claro en este panel
          independientemente del tema oscuro global de la aplicación */}
      <ConfigProvider theme={{
        algorithm: antTheme.defaultAlgorithm,
        token: {
          colorBgContainer:   '#F8FAFC',
          colorBgElevated:    '#FFFFFF',
          colorText:          '#0F172A',
          colorTextPlaceholder: '#94A3B8',
          colorBorder:        '#CBD5E1',
          colorPrimary:       '#2563EB',
          borderRadius:       10,
          controlHeight:      48,
        },
      }}>
      <div className="login-right" style={{
        width:'50%', background:'#FFFFFF', display:'flex',
        alignItems:'center', justifyContent:'center',
        padding:'24px 16px', overflowY:'auto',
      }}>
        <motion.div className="login-right-inner"
          initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ duration:.5, delay:.1 }}
          style={{ width:'100%', maxWidth:420, padding:'40px 32px', boxSizing:'border-box' }}>

          {/* Logo móvil — visible solo en <768px */}
          <div className="login-logo-mobile" style={{ textAlign:'center', marginBottom:28, display:'none' }}>
            <img src="/logo-hicloud.png" alt="HiCloud ERP"
              style={{ height:48, width:'auto', display:'inline-block', borderRadius:10 }} />
          </div>

          <div style={{ marginBottom:32 }}>
            <h2 style={{ color:'#1E3A8A', fontSize:32, fontWeight:800, margin:'0 0 8px', letterSpacing:'-0.5px' }}>
              Bienvenido de nuevo
            </h2>
            <p style={{ color:'#64748B', fontSize:14, margin:0 }}>
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

          {blockCountdown > 0 && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 10, padding: '14px 16px', marginBottom: 16, textAlign: 'center',
            }}>
              <div style={{ color: '#DC2626', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                🔒 Cuenta temporalmente bloqueada
              </div>
              <div style={{ color: '#EF4444', fontSize: 13 }}>
                Podrás intentar de nuevo en{' '}
                <strong>
                  {blockCountdown >= 60
                    ? `${Math.floor(blockCountdown / 60)}:${String(blockCountdown % 60).padStart(2, '0')} min`
                    : `${blockCountdown} segundos`
                  }
                </strong>
              </div>
            </div>
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
          <div className="login-panel" style={{ display: pending2FA ? 'none' : undefined }}>
            <Form layout="vertical" onFinish={onFinish} size="large">
              <Form.Item name="email" label="Correo electrónico"
                rules={[{ required:true, message:'El correo es requerido' },{ type:'email', message:'Correo inválido' }]}>
                <Input
                  prefix={<UserOutlined style={{ color:'#64748B' }} />}
                  placeholder="usuario@empresa.com"
                  autoComplete="email" type="email"
                />
              </Form.Item>

              <Form.Item name="password"
                label={
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
                    <span style={{ color:'#1E3A8A', fontWeight:600 }}>Contraseña</span>
                    <Link to="/recuperar-contrasena" style={{ color:'#2563EB', fontSize:12, fontWeight:500 }}>
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                }
                rules={[{ required:true, message:'La contraseña es requerida' }]}>
                <Input.Password
                  prefix={<LockOutlined style={{ color:'#64748B' }} />}
                  placeholder="••••••••"
                  autoComplete={recordarPassword ? 'current-password' : 'new-password'}
                />
              </Form.Item>

              <div style={{ marginBottom:22, marginTop:-4 }}>
                <Checkbox checked={recordarPassword}
                  onChange={e => { setRecordarPassword(e.target.checked); localStorage.setItem('hicloud_recordar_pw', String(e.target.checked)); }}
                  style={{ color:'#374151' }}>
                  Recordar contraseña en este dispositivo
                </Checkbox>
              </div>

              <Button type="primary" htmlType="submit" block
                loading={loading && blockCountdown === 0}
                disabled={blockCountdown > 0}
                style={{ height:50, background: blockCountdown > 0 ? '#9CA3AF' : '#2563EB',
                  border:'none', borderRadius:10, fontSize:15, fontWeight:700,
                  boxShadow: blockCountdown > 0 ? 'none' : '0 4px 20px rgba(37,99,235,.4)',
                  transition:'all .15s', cursor: blockCountdown > 0 ? 'not-allowed' : 'pointer' }}
                onMouseEnter={(e:any) => { if (blockCountdown === 0) e.currentTarget.style.background='#1d4ed8'; }}
                onMouseLeave={(e:any) => { if (blockCountdown === 0) e.currentTarget.style.background='#2563EB'; }}>
                {blockCountdown > 0
                  ? `Bloqueado — espera ${blockCountdown >= 60 ? `${Math.floor(blockCountdown/60)}:${String(blockCountdown%60).padStart(2,'0')} min` : `${blockCountdown}s`}`
                  : loading ? 'Iniciando sesión…' : 'Iniciar sesión'
                }
              </Button>
            </Form>

            {/* Google OAuth */}
            <div style={{ display:'flex', alignItems:'center', gap:12, margin:'22px 0 14px' }}>
              <div style={{ flex:1, height:1, background:rightBorder }} />
              <Text style={{ color:rightSub, fontSize:12, whiteSpace:'nowrap' }}>o continúa con</Text>
              <div style={{ flex:1, height:1, background:rightBorder }} />
            </div>
            <button type="button"
              onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/auth/google`; }}
              style={{ width:'100%', padding:'14px 16px', borderRadius:10, border:`1px solid ${rightBorder}`,
                background:rightCard, color:rightText, fontSize:14, fontWeight:600,
                display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer',
                transition:'background .15s' }}
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
            <div style={{ marginTop:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ flex:1, height:1, background:rightBorder }} />
                <Text style={{ color:rightSub, fontSize:12, whiteSpace:'nowrap' }}>¿No tienes cuenta?</Text>
                <div style={{ flex:1, height:1, background:rightBorder }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <Button block icon={<RocketOutlined />} onClick={() => setDemoOpen(true)}
                  style={{ height:46, borderRadius:10, border:`1px solid #2563EB`,
                    background:isDark?'rgba(37,99,235,.15)':'#EFF6FF', color:'#2563EB', fontWeight:600 }}>
                  Solicitar Demo
                </Button>
                <Button block onClick={() => navigate('/registrar')}
                  style={{ height:46, borderRadius:10, border:`1px solid ${rightBorder}`,
                    background:rightCard, color:rightText, fontWeight:600 }}>
                  Crear cuenta
                </Button>
              </div>
            </div>

            <Text style={{ display:'block', textAlign:'center', marginTop:28, fontSize:11, color:rightSub }}>
              © 2026 HiCloud ERP · Cumplimiento DGII República Dominicana
            </Text>
          </div>
        </motion.div>
      </div>
      </ConfigProvider>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
