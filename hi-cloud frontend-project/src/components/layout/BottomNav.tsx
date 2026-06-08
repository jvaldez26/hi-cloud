import { useNavigate, useLocation } from 'react-router-dom';
import { HomeOutlined, FileTextOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';

const ITEMS = [
  { path: '/dashboard',  icon: <HomeOutlined />,     label: 'Inicio'   },
  { path: '/facturas',   icon: <FileTextOutlined />,  label: 'Facturas' },
  { path: '/pos',        icon: <ShopOutlined />,      label: 'POS'      },
  { path: '/perfil',     icon: <UserOutlined />,      label: 'Perfil'   },
];

export default function BottomNav() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="bottom-nav"
      style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        height:          60,
        paddingBottom:   'env(safe-area-inset-bottom, 0px)',
        background:      'var(--hc-bg, #fff)',
        borderTop:       '1px solid var(--hc-border, #e2e8f0)',
        boxShadow:       '0 -2px 12px rgba(0,0,0,0.08)',
        display:         'flex',
        alignItems:      'stretch',
        zIndex:          150,
      }}
    >
      {ITEMS.map(item => {
        const active = pathname === item.path || pathname.startsWith(item.path + '/');
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              flex:            1,
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             2,
              border:          'none',
              background:      'transparent',
              cursor:          'pointer',
              color:           active ? 'var(--hc-brand, #0EA5E9)' : 'var(--hc-text-2, #64748b)',
              fontSize:        10,
              fontWeight:      active ? 600 : 400,
              padding:         '6px 0',
              transition:      'color 0.15s',
            }}
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
