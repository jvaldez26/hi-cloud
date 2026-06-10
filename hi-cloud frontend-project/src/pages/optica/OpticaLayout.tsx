import { Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useModuloAddon } from '../../hooks/useModuloAddon';
import ModuloNoDisponiblePage from './ModuloNoDisponiblePage';

export default function OpticaLayout() {
  const { activo, isLoading } = useModuloAddon('optica');

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!activo) return <ModuloNoDisponiblePage />;

  return <Outlet />;
}
