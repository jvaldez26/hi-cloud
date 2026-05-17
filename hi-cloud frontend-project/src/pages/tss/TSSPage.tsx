import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Typography, Select, Table, Tag, Statistic,
  Button, Space, Tabs, Alert, Divider, Progress,
} from 'antd';
import { DownloadOutlined, TeamOutlined, SafetyCertificateOutlined, FileExcelOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { message, theme } from 'antd';

const { Title, Text } = Typography;

const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

const tssApi = {
  mensual: (m: number, a: number) => api.get(`/tss/mensual?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  anual:   (a: number)             => api.get(`/tss/anual?anio=${a}`).then(r => r.data?.data ?? r.data),
};

function exportCSV(data: any) {
  if (!data?.filas?.length) return;
  const cols = [
    'cedula','nombre','cargo','salarioBruto','baseCotizable',
    'sfsEmpleado','sfsEmpleador','afpEmpleado','afpEmpleador','srlEmpleador',
    'totalEmpleado','totalEmpleador','totalGeneral',
  ];
  const header = 'Cédula,Nombre,Cargo,Salario Bruto,Base Cotizable,SFS Empleado,SFS Empleador,AFP Empleado,AFP Empleador,SRL Empleador,Total Empleado,Total Empleador,Total General';
  const rows = data.filas.map((f: any) => cols.map(c => `"${f[c] ?? ''}"`).join(','));
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `TSS-${data.periodo.anio}-${String(data.periodo.mes).padStart(2,'0')}.csv`;
  a.click(); URL.revokeObjectURL(url);
  message.success('Archivo TSS exportado');
}

export default function TSSPage() {
  const { token }       = theme.useToken();
  const [mes,  setMes]  = useState(dayjs().month() + 1);
  const [anio, setAnio] = useState(dayjs().year());

  const { data,       isLoading }  = useQuery({ queryKey: ['tss-mensual', mes, anio], queryFn: () => tssApi.mensual(mes, anio) });
  const { data: anualData }        = useQuery({ queryKey: ['tss-anual', anio],         queryFn: () => tssApi.anual(anio) });

  const cols = [
    { title: 'Cédula',        dataIndex: 'cedula',         width: 120, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Empleado',      dataIndex: 'nombre',         ellipsis: true },
    { title: 'Cargo',         dataIndex: 'cargo',          width: 130, ellipsis: true },
    { title: 'Sal. Bruto',    dataIndex: 'salarioBruto',   width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Base Cotiz.',   dataIndex: 'baseCotizable',  width: 115, render: (v: number) => fmt.money(v) },
    {
      title: 'SFS',
      children: [
        { title: 'Empleado', dataIndex: 'sfsEmpleado',  width: 100, render: (v: number) => <Text style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
        { title: 'Empleador',dataIndex: 'sfsEmpleador', width: 100, render: (v: number) => <Text style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> },
      ],
    },
    {
      title: 'AFP',
      children: [
        { title: 'Empleado', dataIndex: 'afpEmpleado',  width: 100, render: (v: number) => <Text style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
        { title: 'Empleador',dataIndex: 'afpEmpleador', width: 100, render: (v: number) => <Text style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> },
      ],
    },
    { title: 'SRL Emp.',      dataIndex: 'srlEmpleador',   width: 95, render: (v: number) => fmt.money(v) },
    { title: 'Total Emp.',    dataIndex: 'totalEmpleado',  width: 110, render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
    { title: 'Total Empr.',   dataIndex: 'totalEmpleador', width: 110, render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> },
    { title: 'Total',         dataIndex: 'totalGeneral',   width: 120, render: (v: number) => <Text strong>{fmt.money(v)}</Text> },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 8, color: '#7c3aed' }} />
            TSS — Tesorería de la Seguridad Social
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Ley 87-01 · SFS · AFP · SRL</Text>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <RefreshByKeyButton queryKey={['tss']} />
            <VideoTutorialButton />
          </Space>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'mensual',
          label: <><TeamOutlined /> Reporte mensual</>,
          children: (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message={`TSS ${MESES.find(m => m.value === mes)?.label} ${anio} — Tasas vigentes Ley 87-01`}
                description={
                  <Space split={<Divider type="vertical" />} wrap>
                    <Text>SFS empleado: <strong>3.04%</strong></Text>
                    <Text>SFS empleador: <strong>7.09%</strong></Text>
                    <Text>AFP empleado: <strong>2.87%</strong></Text>
                    <Text>AFP empleador: <strong>7.10%</strong></Text>
                    <Text>SRL empleador: <strong>1.10%</strong></Text>
                    <Text>Tope: <strong>{fmt.money(118_432)}</strong></Text>
                  </Space>
                }
              />

              {data && (
                <>
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={12} md={4}>
                      <Card size="small"><Statistic title="Empleados" value={data.totales.empleados} prefix={<TeamOutlined />} /></Card>
                    </Col>
                    <Col xs={12} md={4}>
                      <Card size="small"><Statistic title="Masa salarial" value={data.totales.salarioBruto} formatter={v => fmt.money(Number(v))} valueStyle={{ fontSize: 14 }} /></Card>
                    </Col>
                    <Col xs={12} md={5}>
                      <Card size="small">
                        <Statistic title="Aporte empleados" value={data.totales.totalEmpleado}
                          formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444', fontSize: 14 }} />
                      </Card>
                    </Col>
                    <Col xs={12} md={5}>
                      <Card size="small">
                        <Statistic title="Aporte empresa" value={data.totales.totalEmpleador}
                          formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#1677ff', fontSize: 14 }} />
                      </Card>
                    </Col>
                    <Col xs={24} md={6}>
                      <Card size="small" style={{ borderColor: '#7c3aed' }}>
                        <Statistic title="TOTAL a remitir a TSS" value={data.totales.totalGeneral}
                          formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#7c3aed', fontSize: 18 }} />
                      </Card>
                    </Col>
                  </Row>

                  <Card
                    title="Detalle por empleado"
                    extra={
                      <Space>
                        <Button icon={<FileExcelOutlined />} onClick={() => {
                          const filas = (data.filas ?? []).map((f: any) => ({
                            'Cédula':          f.cedula ?? '',
                            'Nombre':          f.nombre ?? '',
                            'Cargo':           f.cargo  ?? '',
                            'Salario Bruto':   Number(f.salarioBruto ?? 0),
                            'Base Cotizable':  Number(f.baseCotizable ?? 0),
                            'SFS Empleado':    Number(f.sfsEmpleado ?? 0),
                            'SFS Empleador':   Number(f.sfsEmpleador ?? 0),
                            'AFP Empleado':    Number(f.afpEmpleado ?? 0),
                            'AFP Empleador':   Number(f.afpEmpleador ?? 0),
                            'SRL Empleador':   Number(f.srlEmpleador ?? 0),
                            'Total Empleado':  Number(f.totalEmpleado ?? 0),
                            'Total Empleador': Number(f.totalEmpleador ?? 0),
                            'Total General':   Number(f.totalGeneral ?? 0),
                          }));
                          exportarExcel(filas, `TSS-${data.periodo?.anio}-${String(data.periodo?.mes).padStart(2,'0')}`);
                          message.success(`${filas.length} registros exportados`);
                        }}>
                          Excel
                        </Button>
                        <Button icon={<DownloadOutlined />} onClick={() => exportCSV(data)}>
                          CSV (CNSS)
                        </Button>
                      </Space>
                    }
                  >
                    <Table
                      columns={cols as any}
                      dataSource={data.filas}
                      rowKey="cedula"
                      loading={isLoading}
                      size="small"
                      scroll={{ x: 1400 }}
                      pagination={false}
                      summary={() => data.filas.length > 0 ? (
                        <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={3}><Text strong>TOTALES</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={3}><Text strong>{fmt.money(data.totales.salarioBruto)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={4} />
                          <Table.Summary.Cell index={5}><Text strong style={{ color: '#ef4444' }}>{fmt.money(data.totales.sfsEmpleado)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={6}><Text strong style={{ color: '#1677ff' }}>{fmt.money(data.totales.sfsEmpleador)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={7}><Text strong style={{ color: '#ef4444' }}>{fmt.money(data.totales.afpEmpleado)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={8}><Text strong style={{ color: '#1677ff' }}>{fmt.money(data.totales.afpEmpleador)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={9}><Text strong>{fmt.money(data.totales.srlEmpleador)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={10}><Text strong style={{ color: '#ef4444' }}>{fmt.money(data.totales.totalEmpleado)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={11}><Text strong style={{ color: '#1677ff' }}>{fmt.money(data.totales.totalEmpleador)}</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={12}><Text strong style={{ fontSize: 14 }}>{fmt.money(data.totales.totalGeneral)}</Text></Table.Summary.Cell>
                        </Table.Summary.Row>
                      ) : null}
                    />
                  </Card>
                </>
              )}
            </>
          ),
        },
        {
          key: 'anual',
          label: `📅 Tendencia ${anio}`,
          children: anualData ? (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={8}>
                  <Card size="small">
                    <Statistic title="Total empleados" value={anualData.totalAnual.totalEmpleado}
                      formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444' }} />
                  </Card>
                </Col>
                <Col xs={12} md={8}>
                  <Card size="small">
                    <Statistic title="Total empresa" value={anualData.totalAnual.totalEmpleador}
                      formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#1677ff' }} />
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card size="small" style={{ borderColor: '#7c3aed' }}>
                    <Statistic title={`Total TSS ${anio}`} value={anualData.totalAnual.totalGeneral}
                      formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#7c3aed' }} />
                  </Card>
                </Col>
              </Row>
              <Card title={`Aportes TSS mensuales ${anio}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={anualData.meses.map((m: any) => ({
                    mes:       MESES.find(x => x.value === m.mes)?.label.slice(0,3),
                    Empleados: m.totalEmpleado,
                    Empresa:   m.totalEmpleador,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt.money(v)} />
                    <Legend />
                    <Bar dataKey="Empleados" fill="#ef4444" radius={[4,4,0,0]} />
                    <Bar dataKey="Empresa"   fill="#1677ff" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          ) : null,
        },
      ]} />
    </div>
  );
}
