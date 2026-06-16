import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, Badge, Empty, Spin, Tag } from 'antd';
import { serviciosProApi } from '../../api/servicios-pro.api';

export default function ServiciosProDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sp-dashboard'],
    queryFn: serviciosProApi.getDashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!data) return null;

  const kpis = [
    { label: 'Expedientes activos', value: data.expedientesActivos,   icon: '📁', color: '#1d4ed8' },
    { label: 'Horas este mes',      value: data.horasMes?.toFixed(1),  icon: '⏱️', color: '#0891b2', suffix: 'h' },
    { label: 'Por cobrar',          value: data.facturasPendientesCobrar, icon: '💰', color: '#d97706' },
    { label: 'Tareas vencidas',     value: data.tareasVencidas,        icon: '⚠️', color: '#dc2626' },
    { label: 'Sin facturar',        value: `RD$${Number(data.tiempoSinFacturarMonto).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`, icon: '🕐', color: '#7c3aed', isText: true },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
        💼 Servicios Profesionales
      </h2>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <Col key={k.label} xs={12} sm={8} md={6} lg={4} xl={4}>
            <Card size="small" style={{ borderTop: `3px solid ${k.color}`, borderRadius: 8 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
              {k.isText ? (
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
              ) : (
                <Statistic value={k.value} suffix={k.suffix} valueStyle={{ color: k.color, fontSize: 22, fontWeight: 700 }} />
              )}
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{k.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Top expedientes */}
        <Col xs={24} lg={12}>
          <Card title="📁 Top Expedientes (horas este mes)" size="small">
            {data.topExpedientes?.length === 0 ? (
              <Empty description="Sin datos este mes" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.topExpedientes?.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9fafb', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{e.nombre}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{e.numero}</div>
                    </div>
                    <Tag color="blue">{Number(e.horas).toFixed(1)}h</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* Retainers por facturar */}
        <Col xs={24} lg={12}>
          <Card title="🔄 Retainers por Facturar" size="small">
            {data.retainersPorFacturar?.length === 0 ? (
              <Empty description="Todo al día" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.retainersPorFacturar?.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#fefce8', borderRadius: 6, border: '1px solid #fde68a' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.expedienteNombre}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{r.clienteNombre}</div>
                    </div>
                    <Tag color="gold">RD${Number(r.montoMensual).toLocaleString('es-DO')}</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Horas sin facturar */}
      {data.tiempoSinFacturarHoras > 0 && (
        <Card style={{ marginTop: 16, background: '#fffbeb', borderColor: '#fde68a' }} size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🕐</span>
            <div>
              <div style={{ fontWeight: 600, color: '#92400e' }}>
                {Number(data.tiempoSinFacturarHoras).toFixed(2)}h de tiempo sin facturar
              </div>
              <div style={{ fontSize: 12, color: '#78350f' }}>
                Monto pendiente de facturar: <strong>RD${Number(data.tiempoSinFacturarMonto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
