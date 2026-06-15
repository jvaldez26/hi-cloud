import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Tag, Table, Spin } from 'antd';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function GimnasioDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-dashboard'],
    queryFn: gimnasioApi.getDashboard,
    refetchInterval: 30_000,
  });
  const kpis = data?.kpis ?? {};

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24 }}>Panel Gimnasio</h2>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}><Card><Statistic title="Miembros Activos" value={kpis.miembrosActivos ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Entradas Hoy" value={kpis.entradasHoy ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Vencen en 7 dias" value={kpis.membresiasVencen ?? 0} valueStyle={{ color: (kpis.membresiasVencen ?? 0) > 0 ? '#f5a623' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Clases Hoy" value={kpis.clasesHoy ?? 0} /></Card></Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="Ultimas Entradas" size="small">
            <Table dataSource={data?.ultimosAccesos ?? []} rowKey="id" size="small" pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Miembro', dataIndex: 'miembroNombre' },
                { title: 'Hora', dataIndex: 'fechaHora', render: (v: string) => new Date(v).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) },
                { title: 'Estado', dataIndex: 'autorizado', render: (v: boolean) => v ? <Tag color="green">Autorizado</Tag> : <Tag color="red">Rechazado</Tag> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Membresias Proximas a Vencer" size="small">
            <Table dataSource={data?.membresiasAlerta ?? []} rowKey="id" size="small" pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Miembro', dataIndex: 'miembroNombre' },
                { title: 'Plan', dataIndex: 'plan' },
                { title: 'Vence', dataIndex: 'fechaFin', render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
