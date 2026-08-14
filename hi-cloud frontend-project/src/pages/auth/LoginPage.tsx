import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Typography, Alert, Checkbox, ConfigProvider, theme as antTheme, Modal, message } from 'antd';
import { RocketOutlined, MailOutlined, MessageOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { authApi } from '../../api/auth.api';
import api from '../../api/client';
import DemoModal from './DemoModal';
import { PanelAcceso } from './panel';

const WS_NUMBER   = '8093081713';
const WS_URL      = `https://wa.me/1${WS_NUMBER}`;
const EMAIL_SOPORTE = 'soporte@hicloudrd.com';

// ── Modal de contacto con soporte ────────────────────────────────────────────
function ContactoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form]    = Form.useForm();
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  const handleClose = () => { form.resetFields(); setDone(false); onClose(); };

  const onSend = async (vals: { nombre: string; email: string; mensaje: string }) => {
    setSending(true);
    try {
      await api.post('/auth/contacto-soporte', vals);
      setDone(true);
    } catch {
      message.error('No pudimos enviar tu mensaje. Intenta por WhatsApp o escríbenos directamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={420}
      centered
      styles={{ body: { padding: '8px 0 0' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageOutlined style={{ color: '#2563EB', fontSize: 15 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E3A8A' }}>Escribirnos</div>
            <div style={{ fontWeight: 400, fontSize: 12, color: '#64748B' }}>Te respondemos por correo</div>
          </div>
        </div>
      }
    >
      {done ? (
        <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1E3A8A', marginBottom: 6 }}>¡Mensaje enviado!</div>
          <div style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>
            Te responderemos a tu correo en breve.<br />
            También puedes escribirnos por{' '}
            <a href={WS_URL} target="_blank" rel="noreferrer" style={{ color: '#25D366', fontWeight: 600 }}>WhatsApp</a>.
          </div>
          <Button type="primary" onClick={handleClose}
            style={{ background: '#1E3A8A', border: 'none', borderRadius: 8, fontWeight: 600 }}>
            Cerrar
          </Button>
        </div>
      ) : (
        <ConfigProvider theme={{ algorithm: antTheme.defaultAlgorithm }}>
          <Form form={form} layout="vertical" onFinish={onSend} style={{ padding: '4px 0' }}>
            <Form.Item name="nombre" label="Tu nombre"
              rules={[{ required: true, message: 'Ingresa tu nombre' }, { min: 2, message: 'Muy corto' }]}>
              <Input placeholder="Juan Pérez" maxLength={100} />
            </Form.Item>
            <Form.Item name="email" label="Tu correo electrónico"
              rules={[{ required: true, message: 'Ingresa tu correo' }, { type: 'email', message: 'Correo inválido' }]}>
              <Input placeholder="juan@empresa.com" maxLength={200} prefix={<MailOutlined style={{ color: '#94A3B8' }} />} />
            </Form.Item>
            <Form.Item name="mensaje" label="¿En qué podemos ayudarte?"
              rules={[{ required: true, message: 'Escribe tu mensaje' }, { min: 10, message: 'Mensaje muy corto' }]}>
              <Input.TextArea
                rows={4} maxLength={1000} showCount
                placeholder="Describe tu pregunta o problema…"
                style={{ resize: 'none' }}
              />
            </Form.Item>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <Button onClick={handleClose} style={{ borderRadius: 8 }}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={sending}
                style={{ background: '#1E3A8A', border: 'none', borderRadius: 8, fontWeight: 600 }}>
                {sending ? 'Enviando…' : 'Enviar mensaje'}
              </Button>
            </div>
          </Form>
        </ConfigProvider>
      )}
    </Modal>
  );
}

const { Text } = Typography;


export default function LoginPage() {
  const [loading,          setLoading]          = useState(false);
  const [demoOpen,         setDemoOpen]         = useState(false);
  const [contactOpen,      setContactOpen]      = useState(false);
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
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? [], (data as any).almacenActual ?? null, (data as any).sucursalActual ?? null, (data as any).sucursalNombre ?? null);
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
      login((data as any).user, (data as any).empresaActual, (data as any).empresas ?? [], (data as any).almacenActual ?? null, (data as any).sucursalActual ?? null, (data as any).sucursalNombre ?? null);
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
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <style>{`
        /* Mobile / tablet estrecho: ocultar izquierdo, derecho a full-width */
        @media(max-width:900px){
          .login-left{display:none!important}
          .login-right{width:100%!important; height:100vh!important; overflow-y:auto!important; overflow-x:hidden!important}
          .login-logo-mobile{display:block!important}
          .login-right-inner{padding:24px 20px!important}
        }
        /* ── Campos — estilo maqueta ────────────────────────────────── */
        .login-panel .ant-input-affix-wrapper {
          background:#fff!important;
          border:1.5px solid #D8DDE4!important;
          border-radius:9px!important;
          height:46px!important;
          padding:0 12px!important;
          box-shadow:none!important;
        }
        .login-panel .ant-input-affix-wrapper:hover { border-color:#C3CAD3!important; }
        .login-panel .ant-input-affix-wrapper-focused {
          border-color:#1B4FD8!important;
          box-shadow:0 0 0 3px rgba(27,79,216,.12)!important;
        }
        .login-panel .ant-input-affix-wrapper .ant-input,
        .login-panel .ant-input-affix-wrapper input {
          background:transparent!important; color:#161A1F!important;
          border:none!important; box-shadow:none!important; height:100%!important;
        }
        .login-panel .ant-input:not(.ant-input-affix-wrapper .ant-input) {
          background:#fff!important; border:1.5px solid #D8DDE4!important;
          border-radius:9px!important; height:46px!important; color:#161A1F!important;
        }
        .login-panel .ant-input::placeholder,
        .login-panel input::placeholder { color:#9BA5B4!important; }
        .login-panel .ant-input-suffix { color:#8A929D!important; }
        /* Etiqueta: full-width para que Contraseña y el enlace queden en extremos */
        .login-panel .ant-form-item-label { width:100%!important; }
        .login-panel .ant-form-item-label > label {
          width:100%!important; color:#1E3A8A!important;
          font-size:13px!important; font-weight:600!important;
        }
        /* Ocultar asterisco rojo — en un login ambos campos son obvios */
        .login-panel .ant-form-item-label > label.ant-form-item-required::before { display:none!important; }
        .login-panel .ant-checkbox-inner { background:#fff!important; border-color:#D8DDE4!important; }
        .login-panel .ant-checkbox-checked .ant-checkbox-inner { background:#1B4FD8!important; border-color:#1B4FD8!important; }
        .login-panel .ant-checkbox-wrapper span { color:#3B4451!important; font-size:13.5px!important; }
        .login-panel .ant-form-item { margin-bottom:10px!important; }
        .login-right-inner { box-sizing:border-box!important; }
      `}</style>

      {/* ── LADO IZQUIERDO ──────────────────────────────────────────────── */}
      <PanelAcceso />

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
        width:'50%', height:'100%', background:'#FFFFFF', display:'flex',
        alignItems:'center', justifyContent:'center',
        padding:'0', overflow:'hidden',
      }}>
        <motion.div className="login-right-inner"
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:.45, delay:.1 }}
          style={{ width:'100%', maxWidth:420, padding:'16px 32px 14px', boxSizing:'border-box' }}>

          {/* Logo centrado — visible siempre */}
          <div style={{ textAlign:'center', marginBottom:10 }}>
            <img src="/logo-hicloud.png" alt="HiCloud ERP"
              style={{ width:62, height:'auto', display:'inline-block' }} />
          </div>

          <div style={{ marginBottom:14, textAlign:'center' }}>
            <h2 style={{ color:'#161A1F', fontSize:20, fontWeight:700, margin:'0 0 3px', letterSpacing:'-0.018em' }}>
              ¡Bienvenido a HiCloud!
            </h2>
            <p style={{ color:'#1B4FD8', fontSize:13, margin:0 }}>
              Por favor, inicia sesión en tu cuenta.
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
            <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
              <Form.Item name="email" label="Correo electrónico"
                rules={[{ required:true, message:'El correo es requerido' },{ type:'email', message:'Correo inválido' }]}>
                <Input
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
                  placeholder="••••••••"
                  autoComplete={recordarPassword ? 'current-password' : 'new-password'}
                />
              </Form.Item>

              <div style={{ marginBottom:10, marginTop:-4 }}>
                <Checkbox checked={recordarPassword}
                  onChange={e => { setRecordarPassword(e.target.checked); localStorage.setItem('hicloud_recordar_pw', String(e.target.checked)); }}
                  style={{ color:'#374151' }}>
                  Recordar contraseña en este dispositivo
                </Checkbox>
              </div>

              <Button type="primary" htmlType="submit" block
                loading={loading && blockCountdown === 0}
                disabled={blockCountdown > 0}
                style={{ height:46, background: blockCountdown > 0 ? '#9CA3AF' : '#1B4FD8',
                  border:'none', borderRadius:9, fontSize:15.5, fontWeight:600,
                  boxShadow: blockCountdown > 0 ? 'none' : '0 3px 16px rgba(27,79,216,.38)',
                  transition:'all .15s', cursor: blockCountdown > 0 ? 'not-allowed' : 'pointer',
                  letterSpacing:'-0.005em' }}
                onMouseEnter={(e:any) => { if (blockCountdown === 0) e.currentTarget.style.background='#1642B8'; }}
                onMouseLeave={(e:any) => { if (blockCountdown === 0) e.currentTarget.style.background='#1B4FD8'; }}>
                {blockCountdown > 0
                  ? `Bloqueado — espera ${blockCountdown >= 60 ? `${Math.floor(blockCountdown/60)}:${String(blockCountdown%60).padStart(2,'0')} min` : `${blockCountdown}s`}`
                  : loading ? 'Iniciando sesión…' : 'Iniciar sesión'
                }
              </Button>
            </Form>

            {/* Google OAuth */}
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'10px 0 8px' }}>
              <div style={{ flex:1, height:1, background:'#D8DDE4' }} />
              <Text style={{ color:'#9BA5B4', fontSize:11.5, whiteSpace:'nowrap', letterSpacing:'.01em' }}>o continúa con</Text>
              <div style={{ flex:1, height:1, background:'#D8DDE4' }} />
            </div>
            <button type="button"
              onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/auth/google`; }}
              style={{ width:'100%', height:44, borderRadius:9, border:'1.5px solid #D8DDE4',
                background:'#fff', color:'#161A1F', fontSize:14, fontWeight:500,
                display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer',
                transition:'background .14s, border-color .14s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#F5F7FA'; e.currentTarget.style.borderColor='#C3CAD3'; }}
              onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#D8DDE4'; }}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar con Google
            </button>

            {/* Sin cuenta */}
            <div style={{ marginTop:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ flex:1, height:1, background:'#D8DDE4' }} />
                <Text style={{ color:'#9BA5B4', fontSize:11.5, whiteSpace:'nowrap', letterSpacing:'.01em' }}>¿No tienes cuenta?</Text>
                <div style={{ flex:1, height:1, background:'#D8DDE4' }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Button block icon={<RocketOutlined />} onClick={() => setDemoOpen(true)}
                  style={{ height:34, borderRadius:8, border:'1.5px solid rgba(27,79,216,.35)',
                    background:'#EEF3FC', color:'#1B4FD8', fontWeight:500, fontSize:12.5 }}>
                  Solicitar Demo
                </Button>
                <Button block onClick={() => navigate('/registrar')}
                  style={{ height:34, borderRadius:8, border:'1.5px solid #D8DDE4',
                    background:'#fff', color:'#3B4451', fontWeight:500, fontSize:12.5 }}>
                  Crear cuenta
                </Button>
              </div>
            </div>

            {/* ── ¿Necesitas ayuda? ──────────────────────────────────────── */}
            <div style={{
              marginTop: 10,
              paddingTop: 9,
              borderTop: '1px solid #D8DDE4',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
            }}>
              <Text style={{ fontSize: 11.5, color: '#9BA5B4', letterSpacing: '.01em' }}>¿Necesitas ayuda?</Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Correo → abre modal */}
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#1B4FD8', fontSize: 13, fontWeight: 500, padding: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <MailOutlined style={{ fontSize: 13 }} />
                  Correo
                </button>

                <span style={{ color: '#D8DDE4', fontSize: 14, lineHeight: 1 }}>|</span>

                {/* WhatsApp */}
                <a
                  href={WS_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: '#25D366', fontSize: 13, fontWeight: 500,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {/* Icono WhatsApp SVG */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </a>
              </div>

              {/* Pie legal + Términos y Privacidad */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, marginTop:2 }}>
                <Text style={{ fontSize: 10.5, color: '#B0BAC6', textAlign:'center' }}>
                  © 2026 HiCloud ERP · Cumplimiento DGII República Dominicana
                </Text>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Link to="/terminos" style={{ fontSize:10.5, color:'#B0BAC6', textDecoration:'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color='#9BA5B4')}
                    onMouseLeave={e => (e.currentTarget.style.color='#B0BAC6')}>
                    Términos de Uso
                  </Link>
                  <span style={{ fontSize:10, color:'#CDD2D9' }}>·</span>
                  <Link to="/privacidad" style={{ fontSize:10.5, color:'#B0BAC6', textDecoration:'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color='#9BA5B4')}
                    onMouseLeave={e => (e.currentTarget.style.color='#B0BAC6')}>
                    Privacidad
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      </ConfigProvider>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      <ContactoModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
