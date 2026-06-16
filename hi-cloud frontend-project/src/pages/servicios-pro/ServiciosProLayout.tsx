import { Outlet, NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/servicios-pro',              label: '📊 Panel',        end: true },
  { path: '/servicios-pro/expedientes',  label: '📁 Expedientes' },
  { path: '/servicios-pro/time-tracker',  label: '⏱️ Time Tracker' },
  { path: '/servicios-pro/tareas',       label: '📋 Tareas' },
  { path: '/servicios-pro/reuniones',    label: '📅 Reuniones' },
  { path: '/servicios-pro/contratos',    label: '📄 Contratos' },
  { path: '/servicios-pro/honorarios',   label: '💰 Honorarios' },
  { path: '/servicios-pro/retainers',    label: '🔄 Retainers' },
  { path: '/servicios-pro/profesionales',label: '👥 Profesionales' },
  { path: '/servicios-pro/reportes',     label: '📊 Reportes' },
];

export default function ServiciosProLayout() {
  const location = useLocation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-nav */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid #e5e7eb',
        background: '#fff', flexWrap: 'wrap', flexShrink: 0, overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const active = tab.end
            ? location.pathname === tab.path
            : location.pathname.startsWith(tab.path);
          return (
            <NavLink key={tab.path} to={tab.path} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: active ? 600 : 400,
              background: active ? '#eff6ff' : 'transparent',
              color: active ? '#1d4ed8' : '#374151', textDecoration: 'none',
              whiteSpace: 'nowrap',
              border: active ? '1px solid #bfdbfe' : '1px solid transparent',
            }}>
              {tab.label}
            </NavLink>
          );
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
