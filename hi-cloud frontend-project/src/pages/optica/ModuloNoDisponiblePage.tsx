import { Button, Result, Space } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';

interface Props {
  onRetry?: () => void;
}

export default function ModuloNoDisponiblePage({ onRetry }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Result
        icon={<EyeOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        title="Módulo Óptica no disponible"
        subTitle="Este módulo no está activo para tu empresa. Contacta a soporte para activarlo."
        extra={
          <Space>
            {onRetry && (
              <Button icon={<ReloadOutlined />} onClick={() => onRetry()}>
                Verificar acceso
              </Button>
            )}
            <Button
              type="primary"
              size="large"
              href="mailto:soporte@hicloudrd.com?subject=Activar módulo Óptica"
            >
              Contactar soporte
            </Button>
          </Space>
        }
      />
    </div>
  );
}
