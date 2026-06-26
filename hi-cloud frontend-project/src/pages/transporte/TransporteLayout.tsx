import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spin, Button, Result, Space } from 'antd';
import { TruckOutlined, ReloadOutlined } from '@ant-design/icons';
import { useModuloAddon } from '../../hooks/useModuloAddon';

const spinFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
    <Spin size="large" />
  </div>
);

function TransporteNoDisponible({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Result
        icon={<TruckOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        title="Módulo Transporte no disponible"
        subTitle="Este módulo no está activo para tu empresa. Contacta a soporte para activarlo."
        extra={
          <Space>
            {onRetry && (
              <Button icon={<ReloadOutlined />} onClick={onRetry}>Verificar acceso</Button>
            )}
            <Button type="primary" size="large" href="mailto:soporte@hicloudrd.com?subject=Activar módulo Transporte">
              Contactar soporte
            </Button>
          </Space>
        }
      />
    </div>
  );
}

export default function TransporteLayout() {
  const { activo, isLoading, isFetching, refetch } = useModuloAddon('transporte');
  if (isLoading) return spinFallback;
  if (!activo && !isFetching) return <TransporteNoDisponible onRetry={refetch} />;
  return (
    <Suspense fallback={spinFallback}>
      <Outlet />
    </Suspense>
  );
}
