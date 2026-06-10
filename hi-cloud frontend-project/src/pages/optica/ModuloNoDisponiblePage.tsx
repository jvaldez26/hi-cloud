import { Button, Result } from 'antd';
import { EyeOutlined } from '@ant-design/icons';

export default function ModuloNoDisponiblePage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Result
        icon={<EyeOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
        title="Módulo Óptica no disponible"
        subTitle="Este módulo no está activo para tu empresa. Contacta a soporte para activarlo."
        extra={
          <Button
            type="primary"
            size="large"
            href="mailto:soporte@hicloudrd.com?subject=Activar módulo Óptica"
          >
            Contactar soporte
          </Button>
        }
      />
    </div>
  );
}
