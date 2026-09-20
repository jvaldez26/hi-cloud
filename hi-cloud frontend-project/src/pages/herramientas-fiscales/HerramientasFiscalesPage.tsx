import { Card, Tabs, Typography, Empty, Alert } from 'antd';
import {
  ClockCircleOutlined, PercentageOutlined, CalculatorOutlined,
  FundOutlined, LineChartOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * Herramientas Fiscales (2026-09-20) — Commit 1: infraestructura de
 * parámetros y el andamiaje de las 5 pestañas. Cada calculadora se
 * implementa en su propio commit (2-6) sobre ParametrosFiscalesService —
 * el frontend nunca calcula, solo muestra lo que devuelve el backend.
 *
 * Toda calculadora, una vez implementada, muestra el aviso de abajo — no
 * es una liquidación oficial, es una estimación de referencia.
 */
function ProximamentePanel({ nombre }: { nombre: string }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <span>
          <strong>{nombre}</strong> se agrega en un commit propio, sobre la
          tabla de parámetros fiscales con vigencia por fecha.
        </span>
      }
      style={{ padding: '48px 0' }}
    />
  );
}

export default function HerramientasFiscalesPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Herramientas Fiscales</Title>
      <Text type="secondary">Calculadoras de referencia sobre parámetros de la DGII con vigencia y base legal.</Text>

      <Alert
        style={{ marginTop: 16, marginBottom: 16 }}
        type="info"
        showIcon
        message="Estimación de referencia. La liquidación oficial es la de la Oficina Virtual DGII."
      />

      <Card>
        <Tabs
          items={[
            {
              key: 'recargos',
              label: <span><ClockCircleOutlined /> Recargos e Intereses</span>,
              children: <ProximamentePanel nombre="La calculadora de recargos e intereses por mora" />,
            },
            {
              key: 'anticipos',
              label: <span><CalculatorOutlined /> Anticipos ISR</span>,
              children: <ProximamentePanel nombre="La calculadora de anticipos ISR" />,
            },
            {
              key: 'impuestos',
              label: <span><FundOutlined /> Impuestos a Pagar</span>,
              children: <ProximamentePanel nombre="La calculadora de impuestos a pagar" />,
            },
            {
              key: 'proporcionalidad',
              label: <span><PercentageOutlined /> Proporcionalidad ITBIS</span>,
              children: <ProximamentePanel nombre="La calculadora de proporcionalidad del ITBIS" />,
            },
            {
              key: 'inflacion',
              label: <span><LineChartOutlined /> Ajuste por Inflación</span>,
              children: <ProximamentePanel nombre="La calculadora de ajuste por inflación" />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
