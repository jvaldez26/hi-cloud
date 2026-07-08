import { Button, Result, Typography } from 'antd';
import { useAuthStore } from '../../store/auth.store';
import { MailOutlined, ReloadOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export default function SinEmpresaPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const recargar = () => window.location.reload();
  const esAdmin  = user?.role === 'admin';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg,#f0f4ff,#e8f0fe)',
    }}>
      <Result
        icon={<span style={{ fontSize: 64 }}>🏢</span>}
        title="Sin acceso a ninguna empresa"
        subTitle={
          <div style={{ maxWidth: 440, textAlign: 'center', lineHeight: 1.7, color: '#6b7280' }}>
            <p>
              Hola <strong>{user?.nombre?.split(' ')[0]}</strong>, tu cuenta
              ({user?.email}) no está vinculada a ninguna empresa.
            </p>
            {esAdmin ? (
              <>
                <p>
                  Parece que tu empresa no quedó configurada correctamente durante
                  el registro. Puedes crearla ahora — solo toma un momento.
                </p>
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '10px 16px', marginTop: 8, fontSize: 13,
                }}>
                  <Text style={{ color: '#92400e' }}>
                    💡 Haz clic en <strong>"Crear mi empresa"</strong> para completar el proceso de registro.
                  </Text>
                </div>
              </>
            ) : (
              <>
                <p>
                  Pide al administrador que te invite desde
                  <strong> Sistema → Usuarios y Roles</strong>.
                </p>
                <p style={{ fontSize: 13 }}>
                  Una vez invitado, acepta la invitación en tu correo y recarga esta página.
                </p>
              </>
            )}
          </div>
        }
        extra={[
          ...(esAdmin ? [
            <Button
              key="crear"
              type="primary"
              size="large"
              icon={<PlusCircleOutlined />}
              onClick={() => navigate('/mis-empresas')}
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none' }}
            >
              Crear mi empresa
            </Button>,
          ] : [
            <Button
              key="reload"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={recargar}
            >
              Ya acepté la invitación — Recargar
            </Button>,
          ]),
          <Button
            key="logout"
            icon={<MailOutlined />}
            onClick={() => { logout(); window.location.href = '/login'; }}
          >
            Cerrar sesión
          </Button>,
        ]}
      />
    </div>
  );
}
