import { useState } from 'react';
import {
  Card, Row, Col, Table, Typography, Statistic, InputNumber,
  Space, theme, Tag, Alert, Divider, Progress, Tabs, Button, message,
} from 'antd';
import {
  CalculatorOutlined, TeamOutlined, SafetyCertificateOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../api/client';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const TABLA_2024 = [
  { tramo: '1',  desde: 'RD$ 0',           hasta: 'RD$ 416,220',   tasa: '0% — Exento',           color: 'green'  },
  { tramo: '2',  desde: 'RD$ 416,220.01',  hasta: 'RD$ 624,329',   tasa: '15% sobre excedente',   color: 'blue'   },
  { tramo: '3',  desde: 'RD$ 624,329.01',  hasta: 'RD$ 867,123',   tasa: '20% + RD$ 31,216.20',   color: 'orange' },
  { tramo: '4',  desde: 'RD$ 867,123.01',  hasta: 'Sin límite',    tasa: '25% + RD$ 79,776.60',   color: 'red'    },
];

export default function IsrPage() {
  const { token } = theme.useToken();
  const [salarioSim, setSalarioSim] = useState<number>(50_000);

  const { data: plantilla, isLoading } = useQuery<any>({
    queryKey: ['isr-plantilla'],
    queryFn: () => api.get('/isr/plantilla').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: simulacion } = useQuery<any>({
    queryKey: ['isr-simular', salarioSim],
    queryFn: () => api.get(`/isr/simular?salario=${salarioSim}`).then((r: any) => r.data?.data ?? r.data),
    enabled: salarioSim > 0,
    staleTime: 1000,
  });

  const empleados = plantilla?.empleados ?? [];
  const resumen   = plantilla?.resumen ?? {};

  const chartData = empleados
    .filter((e: any) => e.isrMensual > 0)
    .sort((a: any, b: any) => b.isrMensual - a.isrMensual)
    .slice(0, 10)
    .map((e: any) => ({ nombre: e.nombre.split(' ')[0], isr: e.isrMensual }));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <SafetyCertificateOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>ISR Nómina — Ley 11-92 RD</Title>
          <Text type="secondary">Impuesto Sobre la Renta · Tabla vigente 2024 · Ley 253-12</Text>
        </div>
      </div>

      <Tabs
        defaultActiveKey="plantilla"
        items={[
          {
            key: 'plantilla',
            label: <Space><TeamOutlined />Plantilla de Empleados</Space>,
            children: (
              <>
                {/* KPIs */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  {[
                    { label: 'Total Empleados',   value: resumen.totalEmpleados ?? 0,   suffix: '',    bg: '#1a56db,#3b82f6' },
                    { label: 'Exentos de ISR',    value: resumen.exentos ?? 0,           suffix: '',    bg: '#059669,#10b981' },
                    { label: 'Sujetos a ISR',     value: resumen.gravados ?? 0,          suffix: '',    bg: '#7c3aed,#a78bfa' },
                    { label: 'ISR Total Mensual', value: resumen.totalIsrMensual ?? 0,   fmt: true,     bg: '#d97706,#f59e0b' },
                  ].map(s => (
                    <Col xs={12} sm={6} key={s.label}>
                      <Card bordered={false} style={{ borderRadius: 12, background: `linear-gradient(135deg,${s.bg})` }}>
                        <Statistic
                          title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>{s.label}</span>}
                          value={(s as any).fmt ? fmt(s.value) : s.value}
                          formatter={(s as any).fmt ? undefined : undefined}
                          valueStyle={{ color: '#fff', fontSize: (s as any).fmt ? 18 : 28 }}
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>

                <Row gutter={[16, 16]}>
                  {/* Tabla empleados */}
                  <Col xs={24} lg={chartData.length > 0 ? 16 : 24}>
                    <Card bordered={false} style={{ borderRadius: 12 }} title="Detalle ISR por Empleado"
                      extra={
                        <Button size="small" icon={<FileExcelOutlined />} onClick={() => {
                          const filas = empleados.map((e: any) => ({
                            'Cédula':          e.cedula ?? '',
                            'Nombre':          e.nombre ?? '',
                            'Salario Bruto':   Number(e.salarioBruto ?? 0),
                            'Salario Anual':   Number(e.salarioAnual ?? 0),
                            'Base Gravable':   Number(e.baseGravable ?? 0),
                            'ISR Anual':       Number(e.isrAnual ?? 0),
                            'ISR Mensual':     Number(e.isrMensual ?? 0),
                            'Tasa Efectiva':   `${Number(e.tasaEfectiva ?? 0).toFixed(1)}%`,
                            'Exento':          e.exento ? 'Sí' : 'No',
                          }));
                          exportarExcel(filas, `ISR-Nomina-${new Date().getFullYear()}`);
                        }}>Excel</Button>
                      }>
                      <Table
                        dataSource={empleados}
                        rowKey="empleadoId"
                        loading={isLoading}
                        size="small"
                        pagination={{ pageSize: 12 }}
                        columns={[
                          { title: 'Empleado', dataIndex: 'nombre', key: 'n', render: v => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                          { title: 'Salario Bruto', dataIndex: 'salarioBruto', key: 'sb', align: 'right', render: v => fmt(v) },
                          {
                            title: 'AFP + SFS', key: 'ded', align: 'right',
                            render: (_, r: any) => (
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                -{fmt(r.deduccionAfp + r.deduccionSfs)}
                              </Text>
                            ),
                          },
                          {
                            title: 'ISR Mensual', dataIndex: 'isrMensual', key: 'isr', align: 'right',
                            render: v => v > 0
                              ? <Text strong style={{ color: token.colorWarning }}>{fmt(v)}</Text>
                              : <Tag color="green" style={{ fontSize: 10 }}>Exento</Tag>,
                          },
                          {
                            title: 'Tasa Efect.', dataIndex: 'tasaEfectiva', key: 'te', align: 'right',
                            render: v => v > 0
                              ? <Text style={{ fontSize: 11 }}>{v}%</Text>
                              : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
                          },
                        ]}
                        summary={() => (
                          <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
                            <Table.Summary.Cell index={0}>TOTAL</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">{fmt(resumen.totalIsrMensual ?? 0)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={2} />
                            <Table.Summary.Cell index={3} align="right">
                              <Text strong style={{ color: token.colorWarning }}>{fmt(resumen.totalIsrMensual ?? 0)}</Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} />
                          </Table.Summary.Row>
                        )}
                      />
                    </Card>
                  </Col>

                  {/* Gráfico */}
                  {chartData.length > 0 && (
                    <Col xs={24} lg={8}>
                      <Card bordered={false} style={{ borderRadius: 12 }} title="Top ISR Mensual">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={chartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(1)}K`} />
                            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={70} />
                            <Tooltip formatter={(v: number) => [fmt(v), 'ISR Mensual']} />
                            <Bar dataKey="isr" fill={token.colorWarning} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    </Col>
                  )}
                </Row>
              </>
            ),
          },
          {
            key: 'simulador',
            label: <Space><CalculatorOutlined />Simulador ISR</Space>,
            children: (
              <Row gutter={[24, 24]}>
                <Col xs={24} lg={10}>
                  <Card bordered={false} style={{ borderRadius: 12 }}>
                    <Title level={5}>Calculadora ISR Individual</Title>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                      Ingresa el salario bruto mensual para ver el cálculo ISR automático.
                    </Text>
                    <InputNumber
                      prefix="RD$"
                      style={{ width: '100%', marginBottom: 24 }}
                      value={salarioSim}
                      onChange={v => setSalarioSim(Number(v))}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      size="large"
                      min={0}
                    />

                    {simulacion && (
                      <div>
                        {[
                          { label: 'Salario Bruto Mensual',  value: fmt(simulacion.salarioMensual),    color: token.colorText },
                          { label: 'AFP (2.87%)',             value: `-${fmt(simulacion.deduccionAfp)}`, color: token.colorError },
                          { label: 'SFS (3.04%)',             value: `-${fmt(simulacion.deduccionSfs)}`, color: token.colorError },
                          { label: 'Salario Neto Anual',      value: fmt(simulacion.salarioNetaAnual),  color: token.colorText },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text>
                            <Text style={{ fontSize: 13, color: r.color }}>{r.value}</Text>
                          </div>
                        ))}

                        <div style={{ background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8, padding: 16, marginTop: 16, textAlign: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>ISR Mensual a Retener</Text>
                          <div style={{ fontSize: 28, fontWeight: 800, color: token.colorWarning }}>
                            {fmt(simulacion.isrMensual)}
                          </div>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Tasa efectiva: {simulacion.tasaEfectiva}%
                          </Text>
                        </div>

                        <div style={{ marginTop: 12, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                            <strong>Tramo:</strong> {simulacion.tramo}
                          </Text>
                        </div>
                      </div>
                    )}
                  </Card>
                </Col>

                <Col xs={24} lg={14}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Tabla ISR Vigente 2024 — Ley 11-92 RD">
                    <Alert
                      type="info" showIcon
                      message="Tabla de tasas progresivas anuales (Ley 253-12)"
                      style={{ marginBottom: 16, fontSize: 12 }}
                    />
                    <Table
                      dataSource={TABLA_2024}
                      rowKey="tramo"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: 'Tramo', dataIndex: 'tramo', key: 't', width: 60, render: v => <Tag color="blue">#{v}</Tag> },
                        { title: 'Desde',    dataIndex: 'desde',    key: 'd' },
                        { title: 'Hasta',    dataIndex: 'hasta',    key: 'h' },
                        { title: 'Tasa',     dataIndex: 'tasa',     key: 'ta', render: (v, r: any) => <Tag color={r.color}>{v}</Tag> },
                      ]}
                    />
                    <Divider />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      AFP empleado: 2.87% · SFS empleado: 3.04% · Total deducción TSS: 5.91% del salario bruto.
                      Las deducciones TSS se aplican antes de calcular el ISR según Art. 337 del Código Tributario.
                    </Text>
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}
