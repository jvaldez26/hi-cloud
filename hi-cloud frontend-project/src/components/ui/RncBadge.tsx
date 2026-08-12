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
 * Resultado de la consulta al padrón, en una línea.
 *
 * Antes el estado aparecía dos veces (un Tag y debajo un Alert diciendo lo
 * mismo) y el bloque ocupaba cuatro filas dentro de un formulario ya denso.
 * Ahora el estado se dice UNA vez, con el color llevando el peso del aviso.
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
  // No es un error: las entidades públicas y los distritos educativos (serie
  // 401xxxxxx) no figuran como contribuyentes y facturan con normalidad. No
  // impide nada, ni aquí ni al emitir el e-CF.
  if (!datos.encontrado) {
    return (
      <div style={{ marginTop: 4 }}>
        <Text style={{ fontSize: 12, color: token.colorWarningText }}>
          <InfoCircleOutlined style={{ marginRight: 5 }} />
          No figura en el padrón de DGII. Puedes registrarlo igual.
        </Text>
        {rncNuevo && (
          <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 3, lineHeight: 1.45 }}>
            Verifica la <strong>razón social</strong> contra un documento oficial (RNC,
            certificación DGII o una factura suya) antes de guardar: los demás clientes
            que registres con este RNC la heredarán de este.
          </div>
        )}
      </div>
    );
  }

  const estado   = datos.estado?.toUpperCase() ?? '';
  const enBaja   = estado.includes('BAJA');
  const activo   = estado === 'ACTIVO';
  const color    = enBaja ? 'red' : activo ? 'green' : 'orange';
  const Icono    = enBaja ? CloseCircleOutlined : activo ? CheckCircleOutlined : WarningOutlined;

  return (
    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Text strong style={{ fontSize: 13 }}>{datos.nombre}</Text>

      {/* El estado, UNA sola vez. El color hace de advertencia. */}
      {estado && (
        <Tag color={color} icon={<Icono />} style={{ fontSize: 11, marginInlineEnd: 0 }}>
          {estado}
        </Tag>
      )}

      {datos.facturadorElectronico && (
        <Tooltip title="Emite comprobantes fiscales electrónicos">
          <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>e-CF</Tag>
        </Tooltip>
      )}

      {datos.nombreComercial && datos.nombreComercial !== datos.nombre && (
        <Text type="secondary" style={{ fontSize: 11 }}>({datos.nombreComercial})</Text>
      )}

      {datos.regimenPagos && (
        <Text type="secondary" style={{ fontSize: 11 }}>{datos.regimenPagos}</Text>
      )}

      {!activo && estado && (
        <Text style={{ fontSize: 11, color: enBaja ? token.colorErrorText : token.colorWarningText, width: '100%' }}>
          No puede recibir crédito fiscal sin confirmación (E31/E44/E45).
        </Text>
      )}
    </div>
  );
}
