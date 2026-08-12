import { Spin, Tag, Tooltip, Typography, theme } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { RNCDatos } from '../../hooks/useRncLookup';

const { Text } = Typography;

interface Props {
  datos:   RNCDatos | null;
  loading: boolean;
  /**
   * true si este RNC aún no existe en el sistema. Cuando además no está en el
   * padrón, el usuario es el primero en teclear su razón social y los demás
   * clientes del mismo RNC la heredarán — conviene decírselo antes de guardar.
   */
  rncNuevo?: boolean;
}

/**
 * Resultado de la consulta al padrón, en formato compacto.
 *
 * Máximo 2 filas: nombre + badges en la primera; advertencia abreviada
 * en la segunda solo cuando el estado no es ACTIVO.
 */
export default function RncBadge({ datos, loading, rncNuevo }: Props) {
  const { token } = theme.useToken();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Spin size="small" />
        <Text type="secondary" style={{ fontSize: 12 }}>Consultando DGII…</Text>
      </div>
    );
  }

  if (!datos) return null;

  // ── No inscrito en el padrón ────────────────────────────────────────────────
  if (!datos.encontrado) {
    return (
      <div style={{ marginTop: 3 }}>
        <Text style={{ fontSize: 11, color: token.colorWarningText }}>
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          No figura en el padrón de DGII. Puedes registrarlo igual.
        </Text>
        {rncNuevo && (
          <div style={{ fontSize: 10, color: token.colorTextSecondary, marginTop: 2, lineHeight: 1.4 }}>
            Verifica la <strong>razón social</strong> contra un documento oficial antes de guardar.
          </div>
        )}
      </div>
    );
  }

  const estado = datos.estado?.toUpperCase() ?? '';
  const enBaja = estado.includes('BAJA');
  const activo = estado === 'ACTIVO';
  const color  = enBaja ? 'red' : activo ? 'green' : 'orange';
  const Icono  = enBaja ? CloseCircleOutlined : activo ? CheckCircleOutlined : WarningOutlined;

  // Texto secundario para tooltip: nombre comercial + régimen
  const tooltipExtra = [
    datos.nombreComercial && datos.nombreComercial !== datos.nombre ? datos.nombreComercial : '',
    datos.regimenPagos ?? '',
  ].filter(Boolean).join(' · ');

  const tagStyle = { fontSize: 10, padding: '0 5px', lineHeight: '16px', marginInlineEnd: 0 };

  return (
    <div style={{ marginTop: 3 }}>
      {/* Fila 1: nombre + estado + e-CF — todo inline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Tooltip title={tooltipExtra || undefined}>
          <Text style={{ fontSize: 12, fontWeight: 600, lineHeight: '20px', cursor: tooltipExtra ? 'help' : 'default' }}>
            {datos.nombre}
          </Text>
        </Tooltip>

        {estado && (
          <Tag color={color} icon={<Icono />} style={tagStyle}>
            {estado}
          </Tag>
        )}

        {datos.facturadorElectronico && (
          <Tooltip title="Emite comprobantes fiscales electrónicos">
            <Tag color="blue" style={tagStyle}>e-CF</Tag>
          </Tooltip>
        )}
      </div>

      {/* Fila 2: advertencia abreviada, solo si no está activo */}
      {!activo && estado && (
        <Text style={{ fontSize: 10, color: enBaja ? token.colorErrorText : token.colorWarningText, display: 'block', marginTop: 1 }}>
          Sin confirmación no puede emitir E31/E44/E45.
        </Text>
      )}
    </div>
  );
}
