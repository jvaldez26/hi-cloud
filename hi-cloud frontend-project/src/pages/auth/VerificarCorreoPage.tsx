import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Result } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, MailOutlined } from '@ant-design/icons';
import api from '../../api/client';

type Estado = 'cargando' | 'exito' | 'ya_verificado' | 'error' | 'expirado';

export default function VerificarCorreoPage() {
  const [params]        = useSearchParams();
  const navigate        = useNavigate();
  const [estado, setEstado]   = useState<Estado>('cargando');
  const [mensaje, setMensaje] = useState('');
  const [email, setEmail]     = useState('');
  const [reenviando, setReenviando] = useState(false);
  const [reenviado,  setReenviado]  = useState(false);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;  // StrictMode / SW-reload guard
    called.current = true;

    const token = params.get('token');
    if (!token) { setEstado('error'); setMensaje('Enlace inválido'); return; }

    api.post('/auth/verify-email', { token })
      .then(r => {
        const msg: string = r.data?.data?.message ?? r.data?.message ?? '';
        if (msg.includes('ya fue verificado')) {
          setEstado('ya_verificado');
        } else {
          setEstado('exito');
        }
        setMensaje(msg);
      })
      .catch(err => {
        const msg: string = err?.response?.data?.message ?? err?.response?.data?.errors?.[0] ?? 'Token inválido';
        if (msg.includes('expirado')) {
          setEstado('expirado');
        } else {
          setEstado('error');
        }
        setMensaje(msg);
      });
  }, []);

  const reenviar = async () => {
    if (!email.trim()) return;
    setReenviando(true);
    try {
      await api.post('/auth/resend-verification', { email });
      setReenviado(true);
    } catch { /* respuesta neutra del backend */ setReenviado(true); }
    finally { setReenviando(false); }
  };

  if (estado === 'cargando') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <p style={{ marginTop: 16, color: '#6b7280' }}>Verificando tu correo…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ maxWidth: 480, width: '100%', margin: '0 24px', background: '#fff', borderRadius: 16, padding: 40, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>

        {(estado === 'exito') && (
          <Result
            icon={<CheckCircleOutlined style={{ color: '#10b981' }} />}
            title="¡Correo verificado!"
            subTitle="Tu cuenta ha sido activada. Ya puedes iniciar sesión."
            extra={<Button type="primary" size="large" onClick={() => navigate('/login')}>Ir al inicio de sesión</Button>}
          />
        )}

        {(estado === 'ya_verificado') && (
          <Result
            status="info"
            title="Correo ya verificado"
            subTitle="Tu correo ya había sido verificado anteriormente."
            extra={<Button type="primary" onClick={() => navigate('/login')}>Ir al inicio de sesión</Button>}
          />
        )}

        {(estado === 'expirado') && (
          <div style={{ textAlign: 'center' }}>
            <CloseCircleOutlined style={{ fontSize: 56, color: '#f59e0b', marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px' }}>Enlace expirado</h2>
            <p style={{ color: '#6b7280', marginBottom: 24 }}>El enlace de verificación expiró (válido 24 horas). Solicita uno nuevo:</p>
            {!reenviado ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="email"
                  placeholder="Tu correo electrónico"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                />
                <Button type="primary" icon={<MailOutlined />} loading={reenviando} onClick={reenviar} disabled={!email.trim()}>
                  Reenviar correo de verificación
                </Button>
              </div>
            ) : (
              <Result status="success" title="Correo enviado" subTitle="Si el correo existe y no estaba verificado, recibirás un nuevo enlace en breve." />
            )}
            <Button type="link" onClick={() => navigate('/login')} style={{ marginTop: 8 }}>Volver al inicio de sesión</Button>
          </div>
        )}

        {(estado === 'error') && (
          <div style={{ textAlign: 'center' }}>
            <CloseCircleOutlined style={{ fontSize: 56, color: '#ef4444', marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px' }}>Enlace inválido</h2>
            <p style={{ color: '#6b7280', marginBottom: 24 }}>{mensaje || 'El enlace de verificación no es válido.'}</p>
            <Button type="primary" onClick={() => navigate('/login')}>Ir al inicio de sesión</Button>
          </div>
        )}
      </div>
    </div>
  );
}
