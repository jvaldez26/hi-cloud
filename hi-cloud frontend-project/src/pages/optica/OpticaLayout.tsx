import { Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useModuloAddon } from '../../hooks/useModuloAddon';
import ModuloNoDisponiblePage from './ModuloNoDisponiblePage';

export default function OpticaLayout() {
  const { activo, isLoading, isFetching, refetch } = useModuloAddon('optica');

  // Solo bloquear en carga inicial (sin datos en caché)
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  // Durante un background refetch mantener el estado anterior visible
  if (!activo && !isFetching) {
    return <ModuloNoDisponiblePage onRetry={refetch} />;
  }

  return <Outlet />;
}
