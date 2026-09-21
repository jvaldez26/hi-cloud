import { useState } from 'react';
import { Button, Tabs, Space, Typography } from 'antd';
import { BarChartOutlined, PrinterOutlined } from '@ant-design/icons';
import BalanceGeneralDetallado from './BalanceGeneralDetallado';
import EstadoResultadosDetallado from './EstadoResultadosDetallado';

const { Title, Text } = Typography;

export default function ReportesFinancierosPage() {
  const [tabActiva, setTabActiva] = useState('estado-resultados');

  const handlePrint = () => window.print();

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChartOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Reportes Financieros</Title>
            <Text type="secondary">Estado de Resultados · Balance General · Flujo de Efectivo</Text>
          </div>
        </div>
        <Space>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Imprimir</Button>
        </Space>
      </div>

      <Tabs
        activeKey={tabActiva}
        onChange={setTabActiva}
        items={[
          {
            key: 'estado-resultados',
            label: 'Estado de Resultados',
            children: <EstadoResultadosDetallado />,
          },
          {
            key: 'balance-general',
            label: 'Balance General',
            children: <BalanceGeneralDetallado />,
          },
        ]}
      />
    </div>
  );
}
