import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spin, Button, Result, Space } from 'antd';
import { ToolOutlined, ReloadOutlined } from '@ant-design/icons';
import { useModuloAddon } from '../../hooks/useModuloAddon';

const spinFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
    <Spin size="large" />
  </div>
);

function TallerNoDisponible({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Result
        icon={<ToolOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        title="Módulo Taller Mecánico no disponible"
        subTitle="Este módulo no está activo para tu empresa. Contacta a soporte para activarlo."
        extra={
          <Space>
            {onRetry && (
              <Button icon={<ReloadOutlined />} onClick={onRetry}>Verificar acceso</Button>
            )}
            <Button type="primary" size="large" href="mailto:soporte@hicloudrd.com?subject=Activar módulo Taller">
              Contactar soporte
            </Button>
          </Space>
        }
      />
    </div>
  );
}

export default function TallerLayout() {
  const { activo, isLoading, isFetching, refetch } = useModuloAddon('taller');
  if (isLoading) return spinFallback;
  if (!activo && !isFetching) return <TallerNoDisponible onRetry={refetch} />;
  return (
    <Suspense fallback={spinFallback}>
      <Outlet />
    </Suspense>
  );
}
