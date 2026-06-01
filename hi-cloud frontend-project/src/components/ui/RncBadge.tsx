import { Alert, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { RNCDatos } from '../../hooks/useRncLookup';

const { Text } = Typography;

interface Props {
  datos:   RNCDatos | null;
  loading: boolean;
}

export default function RncBadge({ datos, loading }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <Spin size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>Consultando DGII…</Text>
      </div>
    );
  }

  if (!datos) return null;

  if (!datos.encontrado) {
    return (
      <Alert
        type="warning" showIcon style={{ marginTop: 4, padding: '4px 10px', fontSize: 12 }}
        message={datos.mensaje ?? 'No encontrado en DGII'}
      />
    );
  }

  const estado = datos.estado?.toUpperCase() ?? '';
  const esSuspendido  = estado === 'SUSPENDIDO';
  const esDadoBaja    = estado.includes('BAJA');
  const esActivo      = estado === 'ACTIVO';

  return (
    <div style={{ marginTop: 6 }}>
      {/* Nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <Text strong style={{ fontSize: 13, color: '#059669' }}>
          <CheckCircleOutlined style={{ marginRight: 4 }} />
          {datos.nombre}
        </Text>
        {datos.nombreComercial && datos.nombreComercial !== datos.nombre && (
          <Text type="secondary" style={{ fontSize: 12 }}>({datos.nombreComercial})</Text>
        )}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {esActivo && (
          <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>ACTIVO</Tag>
        )}
        {esSuspendido && (
          <Tag color="orange" icon={<WarningOutlined />} style={{ fontSize: 11 }}>SUSPENDIDO</Tag>
        )}
        {esDadoBaja && (
          <Tag color="red" icon={<CloseCircleOutlined />} style={{ fontSize: 11 }}>DADO DE BAJA</Tag>
        )}
        {datos.facturadorElectronico && (
          <Tag color="blue" style={{ fontSize: 11 }}>✅ Facturador Electrónico</Tag>
        )}
        {datos.regimenPagos && (
          <Tag style={{ fontSize: 10 }}>{datos.regimenPagos}</Tag>
        )}
      </div>

      {/* Advertencias */}
      {esSuspendido && (
        <Alert type="warning" showIcon style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
          message="⚠️ Este contribuyente está SUSPENDIDO en la DGII" />
      )}
      {esDadoBaja && (
        <Alert type="error" showIcon style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
          message="❌ Este contribuyente está dado de baja en la DGII" />
      )}
      {!esActivo && !esSuspendido && !esDadoBaja && estado && (
        <Alert type="warning" showIcon style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}
          message={`Estado DGII: ${estado}`} />
      )}
    </div>
  );
}
