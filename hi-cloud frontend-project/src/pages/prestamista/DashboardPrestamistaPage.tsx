import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Table, Tag, Spin, theme, Alert, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { prestamistalApi } from '../../api/prestamista.api';

const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

const estadoColor: Record<string, string> = {
  al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default',
};

export default function DashboardPrestamistaPage() {
  const { token: C } = theme.useToken();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['prestamista-dashboard'],
    queryFn: prestamistalApi.getDashboard,
    refetchInterval: 60_000,
  });

  const { data: alertas } = useQuery({
    queryKey: ['prestamista-alertas-seguro'],
    queryFn: prestamistalApi.alertasSeguro,
    refetchInterval: 3_600_000,
  });
  const vencidas: any[]  = (alertas as any)?.vencidas  ?? [];
  const porVencer: any[] = (alertas as any)?.porVencer ?? [];

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  const kpis = data?.kpis ?? {};
  const dkpi = data?.deudoresKpi ?? {};
  const dist = data?.distribucionMora ?? {};

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24, color: C.colorText }}>Panel Prestamista / Financiera</h2>

      {/* Alertas pólizas de seguro */}
      {vencidas.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${vencidas.length} vehículo(s) con póliza de seguro VENCIDA`}
          description={vencidas.map((v: any) => `${v.placa ?? v.chasis} (${v.prestamo_numero ?? 'sin préstamo activo'})`).join(' · ')}
          action={<Button size="small" onClick={() => navigate('/prestamista/vehiculos?polizaVencida=true')}>Ver</Button>}
        />
      )}
      {porVencer.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${porVencer.length} vehículo(s) con póliza por vencer en los próximos 30 días`}
          description={porVencer.map((v: any) => `${v.placa ?? v.chasis} (${v.dias_restantes}d)`).join(' · ')}
          action={<Button size="small" onClick={() => navigate('/prestamista/vehiculos')}>Ver</Button>}
        />
      )}

      {/* KPIs principales */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Cartera Activa" value={fmt(kpis.carteraActiva)} valueStyle={{ fontSize: 18, color: C.colorPrimary }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Saldo Capital Total" value={fmt(kpis.saldoCapitalTotal)} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Mora Total" value={fmt(kpis.moraTotal)}
              valueStyle={{ fontSize: 18, color: Number(kpis.moraTotal ?? 0) > 0 ? C.colorError : undefined }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Recaudado Total" value={fmt(kpis.recaudadoTotal)} valueStyle={{ fontSize: 18, color: C.colorSuccess }} />
          </Card>
        </Col>
      </Row>

      {/* KPIs secundarios */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Préstamos Activos" value={Number(kpis.totalPrestamos ?? 0)} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Al Día" value={Number(kpis.prestamosAlDia ?? 0)} valueStyle={{ color: C.colorSuccess }} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Morosos" value={Number(kpis.prestamosMorosos ?? 0)} valueStyle={{ color: C.colorWarning }} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Vencidos" value={Number(kpis.prestamosVencidos ?? 0)} valueStyle={{ color: C.colorError }} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Deudores Activos" value={Number(dkpi.deudoresActivos ?? 0)} />
          </Card>
        </Col>
        <Col xs={8} md={4}>
          <Card size="small">
            <Statistic title="Lista Negra" value={Number(dkpi.enListaNegra ?? 0)} valueStyle={{ color: C.colorError }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Distribución mora */}
        <Col xs={24} md={8}>
          <Card title="Distribución por Mora" size="small">
            {[
              { label: 'Sin mora', val: dist.sinMora, color: 'green' },
              { label: '1–30 días', val: dist.mora1a30, color: 'blue' },
              { label: '31–60 días', val: dist.mora31a60, color: 'orange' },
              { label: '61–90 días', val: dist.mora61a90, color: 'volcano' },
              { label: '+90 días', val: dist.moraMas90, color: 'red' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: `1px solid ${C.colorBorderSecondary}` }}>
                <span style={{ color: C.colorTextSecondary }}>{label}</span>
                <Tag color={color}>{Number(val ?? 0)}</Tag>
              </div>
            ))}
          </Card>
        </Col>

        {/* Recaudación mensual */}
        <Col xs={24} md={8}>
          <Card title="Recaudación Últimos 6 Meses" size="small">
            <Table
              dataSource={(data?.recaudacionMes ?? []).slice(-6).map((r: any, i: number) => ({ ...r, key: i }))}
              pagination={false} size="small" scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Mes', dataIndex: 'mes', render: (v: string) => new Date(v).toLocaleDateString('es-DO', { month: 'short', year: '2-digit' }) },
                { title: 'Total', dataIndex: 'total', render: (v: any) => fmt(v) },
              ]}
            />
          </Card>
        </Col>

        {/* Top deudores morosos */}
        <Col xs={24} md={8}>
          <Card title="Top Deudores Morosos" size="small">
            <Table
              dataSource={(data?.topDeudores ?? []).map((r: any, i: number) => ({ ...r, key: i }))}
              pagination={false} size="small" scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Deudor', dataIndex: 'nombre', render: (v: string, r: any) => `${v} ${r.apellidos ?? ''}`.trim() },
                { title: 'Saldo', dataIndex: 'saldoTotal', render: (v: any) => fmt(v) },
                { title: 'Días', dataIndex: 'diasMoraActual', render: (v: any) => <Tag color="red">{v}</Tag> },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
