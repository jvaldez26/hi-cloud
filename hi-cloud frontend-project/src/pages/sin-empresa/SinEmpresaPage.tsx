import { Button, Result } from 'antd';
import { useAuthStore } from '../../store/auth.store';
import { MailOutlined, ReloadOutlined } from '@ant-design/icons';

export default function SinEmpresaPage() {
  const { user, logout } = useAuthStore();

  const recargar = () => window.location.reload();

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
          <div style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.7, color: '#6b7280' }}>
            <p>
              Hola <strong>{user?.nombre?.split(' ')[0]}</strong>, tu cuenta
              ({user?.email}) no está vinculada a ninguna empresa en HiCloud ERP.
            </p>
            <p>
              Pide al administrador de tu empresa que te invite desde
              <strong> Configuración → Usuarios</strong> o el módulo
              <strong> Equipo</strong>.
            </p>
            <p style={{ fontSize: 13 }}>
              Una vez que el administrador te invite, verifica tu correo
              y acepta la invitación. Luego recarga esta página.
            </p>
          </div>
        }
        extra={[
          <Button
            key="reload"
            type="primary"
            icon={<ReloadOutlined />}
            onClick={recargar}
          >
            Ya acepté la invitación — Recargar
          </Button>,
          <Button
            key="logout"
            icon={<MailOutlined />}
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
          >
            Cerrar sesión
          </Button>,
        ]}
      />
    </div>
  );
}
