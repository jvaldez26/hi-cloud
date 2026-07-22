import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Table, Tag, Badge, Alert, theme, Spin } from 'antd';
import { Leaf, Wheat, Beef, DollarSign, AlertTriangle } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function AgroDashboard() {
  const { token: C } = theme.useToken();
  const { data, isLoading } = useQuery({ queryKey: ['agro-dashboard'], queryFn: () => agroApi.getDashboard() });

  if (isLoading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  if (!data) return null;
  const { kpi, ciclosActivos, proximasCosechas, calendarioSanitario, insumosStockBajo, produccionLeche, rentabilidadCiclos } = data;

  const estadoColor: Record<string, string> = {
    sembrado: 'blue', en_crecimiento: 'green', cosechado: 'gold', planificado: 'default',
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 20, color: C.colorText }}>Panel Agro / Finca</h2>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={4}>
          <Card>
            <Statistic title="Ciclos Activos" value={kpi.ciclosActivos} prefix={<Leaf size={16} color={C.colorPrimary} />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card>
            <Statistic title="Área Sembrada" value={Number(kpi.areaSembrada).toFixed(1)} suffix="tareas" prefix={<Wheat size={16} color="#52c41a" />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card>
            <Statistic title="Animales Activos" value={kpi.animalesTotal} prefix={<Beef size={16} color="#faad14" />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card>
            <Statistic title="Costos Ciclos" value={Number(kpi.costoTotalActivos).toLocaleString('es-DO')} prefix={<DollarSign size={16} />} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={5}>
          <Card>
            <Statistic title="Insumos Stock Bajo" value={kpi.insumosStockBajo ?? 0}
              prefix={<AlertTriangle size={16} color={(kpi.insumosStockBajo ?? 0) > 0 ? '#ff4d4f' : C.colorSuccess} />}
              valueStyle={{ color: (kpi.insumosStockBajo ?? 0) > 0 ? '#ff4d4f' : undefined }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Ciclos activos */}
        <Col xs={24} lg={14}>
          <Card title={<span><Leaf size={14} style={{ marginRight: 6 }} />Ciclos Activos</span>} size="small">
            <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
              dataSource={ciclosActivos} rowKey="id"
              columns={[
                { title: 'N°', dataIndex: 'numero', key: 'numero', width: 90 },
                { title: 'Cultivo', key: 'cultivo', render: (_: any, r: any) => `${r.cultivoNombre}${r.cultivoVariedad ? ` (${r.cultivoVariedad})` : ''}` },
                { title: 'Parcela', dataIndex: 'parcelaNombre', key: 'parcela' },
                { title: 'Días', dataIndex: 'diasTranscurridos', key: 'dias', render: (v: any) => v ?? '-' },
                { title: 'Para cosecha', dataIndex: 'diasParaCosecha', key: 'dcosecha', render: (v: any) => v != null ? `${v}d` : '-' },
                { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
              ]} />
          </Card>
        </Col>

        {/* Próximas cosechas + calendario sanitario */}
        <Col xs={24} lg={10}>
          <Card title="Próximas Cosechas" size="small" style={{ marginBottom: 16 }}>
            {proximasCosechas.length === 0
              ? <Alert message="Sin cosechas próximas programadas" type="info" showIcon />
              : proximasCosechas.map((c: any) => (
                <div key={c.numero} style={{ marginBottom: 6, padding: '6px 0', borderBottom: `1px solid ${C.colorBorderSecondary}` }}>
                  <strong>{c.numero}</strong> — {c.cultivo} — {c.parcela}
                  <br />
                  <span style={{ color: C.colorTextSecondary, fontSize: 12 }}>
                    {c.fechaEstimadaCosecha ? String(c.fechaEstimadaCosecha).split('T')[0] : '-'}
                    {c.dias != null ? ` (en ${c.dias} días)` : ''}
                    {c.rendimientoEstimado ? ` · Est: ${c.rendimientoEstimado} ${c.unidadCosecha ?? ''}` : ''}
                  </span>
                </div>
              ))}
          </Card>

          <Card title="Calendario Sanitario (próximos 30 días)" size="small">
            {calendarioSanitario.length === 0
              ? <Alert message="Sin eventos próximos" type="success" showIcon />
              : calendarioSanitario.map((e: any, i: number) => (
                <div key={i} style={{ marginBottom: 4, fontSize: 12 }}>
                  <Badge status={Number(e.diasRestantes) <= 3 ? 'error' : 'warning'} />
                  <strong>{String(e.proximaFecha).split('T')[0]}</strong> — {e.tipo} — {e.arete} {e.nombre}
                  {e.producto ? ` (${e.producto})` : ''}
                </div>
              ))}
          </Card>
        </Col>

        {/* Rentabilidad y stock bajo */}
        <Col xs={24} lg={12}>
          <Card title="Rentabilidad Últimos Ciclos" size="small">
            <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
              dataSource={rentabilidadCiclos} rowKey={(r: any) => r.numero}
              columns={[
                { title: 'Ciclo', dataIndex: 'numero', key: 'n' },
                { title: 'Cultivo', dataIndex: 'cultivo', key: 'c' },
                { title: 'Costos', dataIndex: 'costoTotal', key: 'ct', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
                { title: 'Ingresos', dataIndex: 'ingresoVentas', key: 'iv', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
                { title: 'Margen', dataIndex: 'margenPct', key: 'm', render: (v: any) => <Tag color={Number(v) >= 0 ? 'green' : 'red'}>{v}%</Tag> },
              ]} />
          </Card>
        </Col>

        {/* Insumos stock bajo */}
        {insumosStockBajo.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title={<span style={{ color: '#ff4d4f' }}><AlertTriangle size={14} style={{ marginRight: 6 }} />Insumos con Stock Bajo</span>} size="small">
              <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
                dataSource={insumosStockBajo} rowKey="nombre"
                columns={[
                  { title: 'Insumo', dataIndex: 'nombre', key: 'n' },
                  { title: 'Tipo', dataIndex: 'tipo', key: 't' },
                  { title: 'Stock', key: 's', render: (_: any, r: any) => `${r.stockActual} ${r.unidad ?? ''}` },
                  { title: 'Mínimo', key: 'm', render: (_: any, r: any) => `${r.stockMinimo} ${r.unidad ?? ''}` },
                ]} />
            </Card>
          </Col>
        )}

        {/* Producción leche */}
        {produccionLeche.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title="Producción de Leche — Últimos 7 Días" size="small">
              <Table size="small" scroll={{ x: 'max-content' }} pagination={false}
                dataSource={produccionLeche} rowKey="dia"
                columns={[
                  { title: 'Día', dataIndex: 'dia', key: 'd', render: (v: any) => String(v).split('T')[0] },
                  { title: 'Total', key: 't', render: (_: any, r: any) => `${Number(r.total).toFixed(1)} ${r.unidadProduccion ?? 'L'}` },
                ]} />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
