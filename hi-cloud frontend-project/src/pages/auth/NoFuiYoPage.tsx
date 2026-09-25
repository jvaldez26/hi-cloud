import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Alert, ConfigProvider, theme as antTheme } from 'antd';
import { ShieldAlert } from 'lucide-react';
import api from '../../api/client';

/**
 * Confirmación del enlace "No fui yo" del correo de alerta de dispositivo
 * nuevo. A propósito NO ejecuta la acción con solo abrir el enlace (GET):
 * algunos clientes de correo pre-cargan los links de un mensaje para
 * escanearlos, lo que dispararía el cierre de sesiones sin que nadie lo
 * pidiera — por eso exige un clic explícito en esta página antes de llamar
 * a POST /auth/no-fui-yo.
 */
export default function NoFuiYoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const confirmar = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/no-fui-yo', { token });
      const { setupToken } = res.data?.data ?? res.data;
      navigate(`/setup-password?token=${setupToken}&motivo=seguridad`, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo procesar la solicitud. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  const card: React.CSSProperties = {
    background: '#FFFFFF', border: '1px solid #E5E7EB',
    borderRadius: 20, padding: '48px 40px',
    maxWidth: 460, width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,.06)',
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <Alert type="error" showIcon style={{ borderRadius: 8, textAlign: 'left' }}
            message="Enlace incompleto" description="Este enlace no trae la información necesaria." />
        </div>
      </div>
    );
  }

  return (
    <ConfigProvider theme={{
      algorithm: antTheme.defaultAlgorithm,
      token: { colorPrimary: '#DC2626', borderRadius: 10, controlHeight: 48 },
    }}>
      <div style={{ minHeight: '100vh', background: '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={card}>
          <div style={{
            width: 72, height: 72, background: '#FEF2F2',
            borderRadius: '50%', border: '2px solid #FECACA',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <ShieldAlert size={32} color="#DC2626" />
          </div>

          <h1 style={{ color: '#0F172A', fontSize: 24, fontWeight: 800,
                       margin: '0 0 8px', textAlign: 'center' }}>
            ¿No fuiste tú?
          </h1>
          <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center',
                      marginBottom: 24, lineHeight: 1.6 }}>
            Si confirmas, cerraremos <strong>todas las sesiones activas</strong> de tu cuenta
            de inmediato y te pediremos configurar una <strong>contraseña nueva</strong> para
            volver a entrar.
          </p>

          {error && (
            <Alert type="error" message={error} showIcon closable
              style={{ marginBottom: 20, borderRadius: 8 }}
              onClose={() => setError(null)} />
          )}

          <Button
            type="primary" danger block size="large"
            loading={loading}
            onClick={confirmar}
            style={{ borderRadius: 10, fontWeight: 700, fontSize: 15, height: 48 }}
          >
            Confirmar — no fui yo
          </Button>

          <Button type="text" block style={{ marginTop: 8, color: '#6B7280' }}
            onClick={() => navigate('/login', { replace: true })}>
            Sí fui yo, no hagas nada
          </Button>
        </div>
      </div>
    </ConfigProvider>
  );
}
