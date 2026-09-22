// Detalle completo del IT-1 — Commit 5 del rebuild 2026-09-22. Colapsado por
// defecto, debajo de las 3 tarjetas de siempre (que no cambian de forma).
// Muestra las Secciones II (Ingresos), III (Liquidación) y IV/V
// (Penalidades + Monto a Pagar) casilla por casilla, con su número oficial
// visible — para que un contador pueda ubicar cada cifra en el formulario
// real de DGII.

import { Collapse, Card, Alert, Typography } from 'antd';
import { FileSearchOutlined, WarningOutlined } from '@ant-design/icons';
import { CasillaTable, flattenCasillas, conLabels } from './CasillaTable';
import { LABELS_IT1 } from './casillasLabels';

const { Text } = Typography;

export default function IT1DetalleCompleto({ data }: { data: any }) {
  if (!data?.seccionII) return null; // datos del IT-1 anterior al rebuild (no debería pasar en producción, pero evita romper si el backend cambia)

  const avisos: string[] = [
    ...(data.seccionII?.avisos ?? []),
    ...(data.seccionIII?.avisos ?? []),
    ...(data.seccionIV?.avisos ?? []),
  ];

  const filasII  = conLabels(flattenCasillas(data.seccionII),  LABELS_IT1);
  const filasIII = conLabels(flattenCasillas(data.seccionIII), LABELS_IT1);
  const filasIV  = conLabels(flattenCasillas(data.seccionIV),  LABELS_IT1);

  return (
    <Collapse
      style={{ marginTop: 16 }}
      items={[
        {
          key: 'detalle',
          label: <Text strong><FileSearchOutlined /> Ver detalle completo — casilla por casilla</Text>,
          children: (
            <div>
              <Card title="Sección II — Ingresos por Operaciones" size="small" style={{ marginBottom: 12 }}>
                <CasillaTable rows={filasII} avisos={avisos} />
              </Card>
              <Card title="Sección III — Liquidación" size="small" style={{ marginBottom: 12 }}>
                <CasillaTable rows={filasIII} avisos={avisos} />
              </Card>
              <Card title="Secciones IV y V — Penalidades y Monto a Pagar" size="small" style={{ marginBottom: 12 }}>
                <CasillaTable rows={filasIV} avisos={avisos} />
              </Card>
              {avisos.length > 0 && (
                <Alert
                  type="warning" showIcon icon={<WarningOutlined />}
                  message={`${avisos.length} nota${avisos.length !== 1 ? 's' : ''} sobre este período`}
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                      {avisos.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                    </ul>
                  }
                />
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
