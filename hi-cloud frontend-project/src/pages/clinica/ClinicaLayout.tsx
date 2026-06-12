import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useModuloAddon } from '../../hooks/useModuloAddon';

const spinFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
    <Spin size="large" />
  </div>
);

function ClinicaNoDisponible({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏥</div>
        <h2 style={{ marginBottom: 8 }}>Módulo Clínica no disponible</h2>
        <p style={{ color: '#888', marginBottom: 16 }}>Este módulo no está activo para tu empresa. Contacta a soporte para activarlo.</p>
        {onRetry && (
          <button onClick={onRetry} style={{ marginRight: 8, padding: '6px 16px', cursor: 'pointer' }}>
            Verificar acceso
          </button>
        )}
        <a href="mailto:soporte@hicloudrd.com?subject=Activar módulo Clínica">
          <button style={{ padding: '6px 16px', cursor: 'pointer', background: '#1677ff', color: '#fff', border: 'none', borderRadius: 4 }}>
            Contactar soporte
          </button>
        </a>
      </div>
    </div>
  );
}

export default function ClinicaLayout() {
  const { activo, isLoading, isFetching, refetch } = useModuloAddon('clinica');
  if (isLoading) return spinFallback;
  if (!activo && !isFetching) return <ClinicaNoDisponible onRetry={refetch} />;
  return (
    <Suspense fallback={spinFallback}>
      <Outlet />
    </Suspense>
  );
}
