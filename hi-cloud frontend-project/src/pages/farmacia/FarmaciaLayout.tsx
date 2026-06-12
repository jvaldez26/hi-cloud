import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spin, Button, Result, Space } from 'antd';
import { MedicineBoxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useModuloAddon } from '../../hooks/useModuloAddon';

const spinFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
    <Spin size="large" />
  </div>
);

function FarmaciaNoDisponible({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Result
        icon={<MedicineBoxOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        title="Módulo Farmacia no disponible"
        subTitle="Este módulo no está activo para tu empresa. Contacta a soporte para activarlo."
        extra={
          <Space>
            {onRetry && (
              <Button icon={<ReloadOutlined />} onClick={onRetry}>Verificar acceso</Button>
            )}
            <Button type="primary" size="large" href="mailto:soporte@hicloudrd.com?subject=Activar módulo Farmacia">
              Contactar soporte
            </Button>
          </Space>
        }
      />
    </div>
  );
}

export default function FarmaciaLayout() {
  const { activo, isLoading, isFetching, refetch } = useModuloAddon('farmacia');
  if (isLoading) return spinFallback;
  if (!activo && !isFetching) return <FarmaciaNoDisponible onRetry={refetch} />;
  return (
    <Suspense fallback={spinFallback}>
      <Outlet />
    </Suspense>
  );
}
