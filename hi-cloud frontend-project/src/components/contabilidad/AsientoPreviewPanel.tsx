// Panel de vista previa del asiento contable (2026-09-19) — compartido por
// TODOS los formularios transaccionales, colapsado por defecto. Muestra las
// cuentas que se van a afectar (código, nombre, débito, haber) y el total
// cuadrado, antes de guardar.
//
// Se alimenta SIEMPRE de un `resultado` calculado por el backend (endpoint
// de previsualización de cada módulo, que reusa la misma lógica del motor
// de asientos) — este componente nunca calcula nada, solo lo muestra. Si el
// asiento no se puede generar, lo dice aquí mismo en vez de fallar en
// silencio después de guardar.

import { Collapse, Table, Tag, Alert, Skeleton, Typography } from 'antd';
import { FileSearchOutlined, WarningOutlined } from '@ant-design/icons';
import { fmt } from '../../utils/formatters';

const { Text } = Typography;

export interface PreviewAsientoLinea {
  codigo: string;
  nombre: string;
  debe: number;
  haber: number;
}
export interface PreviewAsientoResultado {
  ok: boolean;
  lineas: PreviewAsientoLinea[];
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
  error?: string;
}

interface AsientoPreviewPanelProps {
  resultado?: PreviewAsientoResultado;
  loading?: boolean;
  /** Colapsado por defecto (true) — el usuario lo abre si quiere ver el detalle contable. */
  defaultOpen?: boolean;
}

const columnas = [
  { title: 'Código', dataIndex: 'codigo', width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text> },
  { title: 'Cuenta', dataIndex: 'nombre', ellipsis: true, render: (v: string) => v || <Text type="secondary">(sin resolver)</Text> },
  { title: 'Débito', dataIndex: 'debe', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
  { title: 'Crédito', dataIndex: 'haber', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
];

export default function AsientoPreviewPanel({ resultado, loading, defaultOpen = false }: AsientoPreviewPanelProps) {
  return (
    <Collapse
      style={{ marginBottom: 16 }}
      defaultActiveKey={defaultOpen ? ['asiento'] : []}
      items={[
        {
          key: 'asiento',
          label: (
            <span>
              <FileSearchOutlined style={{ marginRight: 6 }} />
              Vista previa del asiento contable
              {resultado && (
                <Tag color={resultado.ok && resultado.cuadrado ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                  {resultado.ok && resultado.cuadrado ? 'Cuadrado' : 'No se puede generar'}
                </Tag>
              )}
            </span>
          ),
          children: loading ? (
            <Skeleton active paragraph={{ rows: 2 }} />
          ) : !resultado ? (
            <Text type="secondary" style={{ fontSize: 12 }}>Completa el formulario para ver el asiento que se va a generar.</Text>
          ) : (
            <>
              {!resultado.ok && (
                <Alert
                  type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
                  message="Este asiento no se puede generar todavía"
                  description={resultado.error ?? 'Falta información para calcular el asiento.'}
                />
              )}
              <Table
                rowKey={(r: PreviewAsientoLinea, i?: number) => `${r.codigo}-${i}`}
                size="small" pagination={false}
                columns={columnas}
                dataSource={resultado.lineas}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right"><Text strong>{fmt.money(resultado.totalDebe)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right"><Text strong>{fmt.money(resultado.totalHaber)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </>
          ),
        },
      ]}
    />
  );
}
