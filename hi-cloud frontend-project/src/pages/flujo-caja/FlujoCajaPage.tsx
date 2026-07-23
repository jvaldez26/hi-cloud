import { useState } from 'react';
import {
  Card, Row, Col, Typography, Select, Statistic, Tabs, Table,
  Tag, Space, InputNumber, Button,
} from 'antd';
import {
  RiseOutlined, FallOutlined, FundOutlined, DollarOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const fcApi = {
  proyeccion: (meses: number, saldo: number) =>
    api.get(`/flujo-caja/proyeccion?meses=${meses}&saldoInicial=${saldo}`).then(r => r.data?.data ?? r.data),
  real: (mes: number, anio: number) =>
    api.get(`/flujo-caja/real?mes=${mes}&anio=${anio}`).then(r => r.data?.data ?? r.data),
};

const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

export default function FlujoCajaPage() {
  const [mesesProyeccion, setMeses]  = useState(6);
  const [saldoInicial,    setSaldo]  = useState(0);
  const [mes,  setMes]  = useState(dayjs().month() + 1);
  const [anio, setAnio] = useState(dayjs().year());

  const { data: proyeccion, isLoading } = useQuery({
    queryKey: ['fc-proyeccion', mesesProyeccion, saldoInicial],
    queryFn:  () => fcApi.proyeccion(mesesProyeccion, saldoInicial),
  });

  const { data: real } = useQuery({
    queryKey: ['fc-real', mes, anio],
    queryFn:  () => fcApi.real(mes, anio),
  });

  const colsProyeccion = [
    { title: 'Período', dataIndex: 'label', width: 110 },
    { title: 'Cobros CxC',        dataIndex: 'cobrosEsperados',   width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Contratos',         dataIndex: 'ingresosContratos', width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Total Ingresos',    dataIndex: 'totalIngresos',     width: 130,
      render: (v: number) => <Text strong style={{ color: '#10b981' }}>{fmt.money(v)}</Text> },
    { title: 'Pagos CxP',         dataIndex: 'pagosEsperados',    width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Gastos Recurrentes',dataIndex: 'gastosRecurrentes', width: 140, render: (v: number) => fmt.money(v) },
    { title: 'Total Egresos',     dataIndex: 'totalEgresos',      width: 120,
      render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
    { title: 'Flujo Neto',        dataIndex: 'flujoBruto',        width: 120,
      render: (v: number) => (
        <Tag color={v >= 0 ? 'success' : 'error'} style={{ fontWeight: 700 }}>
          {v >= 0 ? '+' : ''}{fmt.money(v)}
        </Tag>
      )},
    { title: 'Saldo Acumulado', dataIndex: 'saldoAcumulado', width: 140,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#1677ff' : '#ef4444', fontSize: 14 }}>
          {fmt.money(v)}
        </Text>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FundOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Flujo de Caja
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Proyección basada en CxC, CxP, contratos recurrentes y gastos históricos
          </Text>
        </Col>
        <Col>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const rows = proyeccion ?? [];
            if (!rows.length) { message.warning('Sin datos para exportar'); return; }
            const filas = rows.map((r: any) => ({
              'Período':            r.label ?? '',
              'Cobros CxC':         Number(r.cobrosEsperados ?? 0),
              'Contratos':          Number(r.ingresosContratos ?? 0),
              'Total Ingresos':     Number(r.totalIngresos ?? 0),
              'Pagos CxP':          Number(r.pagosEsperados ?? 0),
              'Gastos Recurrentes': Number(r.gastosRecurrentes ?? 0),
              'Total Egresos':      Number(r.totalEgresos ?? 0),
              'Flujo Neto':         Number(r.flujoBruto ?? 0),
              'Saldo Acumulado':    Number(r.saldoAcumulado ?? 0),
            }));
            exportarExcel(filas, `Flujo-Caja-Proyeccion-${dayjs().format('YYYY-MM')}`);
            message.success(`${filas.length} meses exportados`);
          }}>
            Excel proyección
          </Button>
        </Col>
      </Row>

      <Tabs items={[
        // ── Proyección ───────────────────────────────────────────────────────
        {
          key: 'proyeccion',
          label: <><RiseOutlined /> Proyección</>,
          children: (
            <>
              {/* Controles */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Meses a proyectar</Text>
                    <Select value={mesesProyeccion} onChange={setMeses} style={{ width: 130 }}
                      options={[3, 6, 9, 12].map(v => ({ value: v, label: `${v} meses` }))} />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Saldo inicial (RD$)</Text>
                    <InputNumber
                      value={saldoInicial}
                      onChange={v => setSaldo(v ?? 0)}
                      style={{ width: 160 }}
                      formatter={v => `RD$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => Number(String(v).replace(/RD\$\s?|(,*)/g, ''))}
                    />
                  </div>
                </Space>
              </Card>

              {/* Gráfico */}
              {proyeccion && (
                <Card title="Flujo de caja proyectado — Ingresos vs Egresos vs Saldo acumulado"
                  style={{ marginBottom: 16 }}>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={proyeccion.periodos}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmt.money(v)} />
                      <Legend />
                      <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" />
                      <Bar yAxisId="left" dataKey="totalIngresos" name="Ingresos" fill="#10b981" radius={[4,4,0,0]} opacity={0.8} />
                      <Bar yAxisId="left" dataKey="totalEgresos"  name="Egresos"  fill="#ef4444" radius={[4,4,0,0]} opacity={0.8} />
                      <Line yAxisId="right" type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado"
                        stroke="#1677ff" strokeWidth={2.5} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Tabla detallada */}
              {proyeccion && (
                <Card title="Detalle por período">
                  <Table
                    columns={colsProyeccion}
                    dataSource={proyeccion.periodos}
                    rowKey="label"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    rowClassName={(r: any) => r.flujoBruto < 0 ? 'ant-table-row-danger' : ''}
                  />
                </Card>
              )}
            </>
          ),
        },

        // ── Real del mes ─────────────────────────────────────────────────────
        {
          key: 'real',
          label: <><DollarOutlined /> Mes actual</>,
          children: (
            <>
              <Card size="small" style={{ marginBottom: 16 }}>
                <Space>
                  <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
                  <Select value={anio} onChange={setAnio} style={{ width: 90 }}
                    options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
                </Space>
              </Card>

              {real && (
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={8}>
                    <Card style={{ borderColor: '#10b981' }}>
                      <Statistic title="Ingresos reales del mes"
                        value={real.ingresos} formatter={v => fmt.money(Number(v))}
                        prefix={<RiseOutlined />} valueStyle={{ color: '#10b981', fontSize: 24 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Cobros CxC realizados</Text>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card style={{ borderColor: '#ef4444' }}>
                      <Statistic title="Egresos reales del mes"
                        value={real.egresos} formatter={v => fmt.money(Number(v))}
                        prefix={<FallOutlined />} valueStyle={{ color: '#ef4444', fontSize: 24 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Pagos CxP + Gastos operativos</Text>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card style={{
                      borderColor: real.flujoNeto >= 0 ? '#1677ff' : '#ef4444',
                      borderWidth: 2,
                    }}>
                      <Statistic title="Flujo neto real"
                        value={real.flujoNeto} formatter={v => fmt.money(Number(v))}
                        prefix={<DollarOutlined />}
                        valueStyle={{
                          color: real.flujoNeto >= 0 ? '#1677ff' : '#ef4444',
                          fontSize: 26,
                        }} />
                      <Tag color={real.flujoNeto >= 0 ? 'success' : 'error'} style={{ marginTop: 8 }}>
                        {real.flujoNeto >= 0 ? 'Superávit' : 'Déficit'}
                      </Tag>
                    </Card>
                  </Col>
                </Row>
              )}
            </>
          ),
        },
      ]} />
    </div>
  );
}
