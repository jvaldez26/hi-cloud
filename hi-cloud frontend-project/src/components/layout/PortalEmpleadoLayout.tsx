/**
 * PortalEmpleadoLayout — Layout minimalista para usuarios con rol 'empleado'.
 * NO muestra el sidebar del ERP. Solo header simple + contenido del portal.
 */
import { Layout, Avatar, Dropdown, Typography, Space, Button, theme } from 'antd';
import { LogoutOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';
import { authApi } from '../../api/auth.api';
import { useQuery } from '@tanstack/react-query';

const { Header, Content } = Layout;
const { Text } = Typography;

export default function PortalEmpleadoLayout() {
  const { token } = theme.useToken();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isEmpleadoRole = user?.role === 'empleado';

  // Cargar logo de la empresa
  const { data: empresaConfig } = useQuery({
    queryKey: ['empresa-config-portal'],
    queryFn: () => api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => null),
    retry: false,
  });

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignorar — token ya inválido */ }
    logout();
  };

  const initials = user
    ? `${(user.nombre ?? '')[0] ?? ''}${(user.apellido ?? '')[0] ?? ''}`.toUpperCase()
    : 'E';

  const menuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Cerrar sesión',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      {/* ── Header simple ─────────────────────────────────────────────────── */}
      <Header
        style={{
          background: 'linear-gradient(135deg, #1a2c5b 0%, #0f1d3e 100%)',
          padding:    '0 24px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position:   'sticky',
          top:        0,
          zIndex:     100,
          boxShadow:  '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Volver al ERP (solo para admin/contador que acceden desde el sidebar) */}
        {!isEmpleadoRole && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/dashboard')}
            style={{ color: 'rgba(255,255,255,0.7)', marginRight: 8, fontSize: 13 }}
            size="small"
          >
            ERP
          </Button>
        )}

        {/* Logo + título */}
        <Space size={12} align="center">
          {empresaConfig?.logo ? (
            <img
              src={empresaConfig.logo}
              alt="Logo"
              style={{ height: 32, width: 'auto', objectFit: 'contain', borderRadius: 4 }}
            />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <UserOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
          )}
          <div>
            <Text style={{ color: '#fff', fontWeight: 700, fontSize: 15, display: 'block', lineHeight: 1.2 }}>
              {empresaConfig?.nombre ?? 'HiCloud ERP'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, display: 'block', lineHeight: 1.2 }}>
              Portal del Empleado
            </Text>
          </div>
        </Space>

        {/* Usuario + logout */}
        <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
          <Space style={{ cursor: 'pointer' }} size={10}>
            <Avatar
              size={34}
              style={{ background: 'rgba(99,130,255,0.35)', color: '#fff', fontWeight: 700, fontSize: 13 }}
            >
              {initials}
            </Avatar>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {user?.nombre ?? 'Empleado'}{user?.apellido ? ` ${user.apellido}` : ''}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                {user?.email ?? ''}
              </Text>
            </div>
          </Space>
        </Dropdown>
      </Header>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <Content style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
