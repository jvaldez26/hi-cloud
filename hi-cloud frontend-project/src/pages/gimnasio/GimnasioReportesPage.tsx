import { Table, Button, Tabs, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function GimnasioReportesPage() {
  const { data: proximasData, isLoading: loadingProximas } = useQuery({
    queryKey: ['gimnasio-proximas-vencer'],
    queryFn: gimnasioApi.getProximasVencer,
  });
  const proximas = Array.isArray(proximasData) ? proximasData : [];

  const colProximas = [
    { title: 'Miembro', dataIndex: 'miembroNombre' },
    { title: 'Plan', dataIndex: 'planNombre' },
    { title: 'Vence', dataIndex: 'fechaFin', render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '' },
    { title: 'Dias Restantes', dataIndex: 'diasRestantes', render: (v: number) => <Tag color={v <= 3 ? 'red' : 'orange'}>{v} dias</Tag> },
    { title: 'Telefono', dataIndex: 'miembroTelefono' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Reportes</h2>
      <Tabs
        items={[
          {
            key: 'proximas', label: 'Proximas a Vencer',
            children: (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Button icon={<DownloadOutlined />} disabled>Exportar Excel</Button>
                </div>
                <Table dataSource={proximas} columns={colProximas} rowKey="id" loading={loadingProximas} scroll={{ x: 'max-content' }} />
              </>
            )
          },
        ]}
      />
    </div>
  );
}
