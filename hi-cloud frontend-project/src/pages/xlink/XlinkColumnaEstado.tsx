import { Tag, Tooltip } from 'antd';
import type { EstadoXlinkItem } from '../../api/xlink.api';

const ESTADO_RECEPTOR_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', procesado: 'Recibido', procesado_manual: 'Recibido (manual)',
  descartado: 'Descartado', anulado_en_origen: 'Anulado en origen',
};

/**
 * Columna "Xlink" de los listados (facturas/NC/compras) — una sola fuente
 * visual para los 3 listados. `estado` viene de useXlinkEstados() (bulk,
 * una consulta por página), nunca recalculado aquí.
 */
export default function XlinkColumnaEstado({ estado, cargando }: { estado: EstadoXlinkItem | undefined; cargando: boolean }) {
  if (cargando && !estado) return <Tag>…</Tag>;
  if (!estado) return <Tag color="default">No enviado</Tag>;

  if (estado.yaEnviado) {
    const label = ESTADO_RECEPTOR_LABEL[estado.estadoReceptor ?? ''] ?? estado.estadoReceptor ?? 'Enviado';
    const color = estado.estadoReceptor === 'procesado' || estado.estadoReceptor === 'procesado_manual' ? 'green'
      : estado.estadoReceptor === 'descartado' ? 'red' : 'blue';
    return (
      <Tooltip title={estado.numeroGenerado ? `Generó ${estado.numeroGenerado}` : undefined}>
        <Tag color={color}>{label}</Tag>
      </Tooltip>
    );
  }

  if (!estado.elegible) {
    return (
      <Tooltip title={estado.motivo}>
        <Tag color="default">No enviado</Tag>
      </Tooltip>
    );
  }

  return <Tag color="default">No enviado</Tag>;
}
