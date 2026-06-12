import { useState } from 'react';
import { Card, Row, Col, Select, DatePicker, Button, Table, Typography, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { theme } from 'antd';
const fmtMoney = (v: any) => fmtObj.money(v);

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const COLORES = ['#1677ff','#52c41a','#722ed1','#fa8c16','#13c2c2','#eb2f96'];

const REPORTES = [
  { key: 'productividad', label: 'Productividad por Médico' },
  { key: 'diagnosticos', label: 'Top Diagnósticos' },
  { key: 'ars-pendientes', label: 'ARS Pendientes' },
  { key: 'ausentismo', label: 'Ausentismo / No Asistió' },
  { key: 'nuevos-pacientes', label: 'Nuevos Pacientes por Mes' },
];

export default function ClinicaReportesPage() {
  const { token: C } = theme.useToken();
  const [tipo, setTipo] = useState('productividad');
  const [rango, setRango] = useState<[any, any] | null>(null);
  const [buscar, setBuscar] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-reporte', tipo, rango],
    queryFn: () => clinicaApi.reportes(tipo, {
      desde: rango?.[0]?.format('YYYY-MM-DD'),
      hasta: rango?.[1]?.format('YYYY-MM-DD'),
    }),
    enabled: buscar,
  });

  const rows = data ?? [];

  const cols: Record<string, any[]> = {
    productividad: [
      { title: 'Médico', dataIndex: 'medico' },
      { title: 'Especialidad', dataIndex: 'especialidad', render: (v: any) => v ?? '—' },
      { title: 'Consultas', dataIndex: 'consultas', width: 100 },
      { title: 'Recetas', dataIndex: 'recetas', width: 100 },
      { title: 'Órdenes Lab', dataIndex: 'ordenes', width: 110 },
    ],
    diagnosticos: [
      { title: 'Diagnóstico', dataIndex: 'diagnostico', ellipsis: true },
      { title: 'Casos', dataIndex: 'veces', width: 80 },
    ],
    'ars-pendientes': [
      { title: 'ARS', dataIndex: 'arsNombre' },
      { title: 'Solicitudes', dataIndex: 'solicitudes', width: 110 },
      { title: 'Monto Total', dataIndex: 'total', width: 130, render: fmtMoney },
    ],
    ausentismo: [
      { title: 'Médico', dataIndex: 'medico' },
      { title: 'No Asistió', dataIndex: 'noAsistio', width: 110 },
    ],
    'nuevos-pacientes': [
      { title: 'Mes', dataIndex: 'mes', render: (v: any) => v?.toString().slice(0, 7) },
      { title: 'Nuevos Pacientes', dataIndex: 'nuevos', width: 160 },
    ],
  };

  const chartKey: Record<string, string> = {
    productividad: 'consultas',
    diagnosticos: 'veces',
    'ars-pendientes': 'solicitudes',
    ausentismo: 'noAsistio',
    'nuevos-pacientes': 'nuevos',
  };

  const labelKey: Record<string, string> = {
    productividad: 'medico',
    diagnosticos: 'diagnostico',
    'ars-pendientes': 'arsNombre',
    ausentismo: 'medico',
    'nuevos-pacientes': 'mes',
  };

  const chartData = rows.map((r: any) => ({
    name: r[labelKey[tipo] ?? 'name'],
    value: r[chartKey[tipo] ?? 'value'],
  }));

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Reportes Clínica</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={12} align="middle" wrap>
          <Col>
            <Select value={tipo} onChange={setTipo} style={{ width: 260 }}>
              {REPORTES.map(r => <Option key={r.key} value={r.key}>{r.label}</Option>)}
            </Select>
          </Col>
          {!['ars-pendientes'].includes(tipo) && (
            <Col>
              <RangePicker value={rango as any} onChange={(v) => setRango(v as any)} format="DD/MM/YYYY" />
            </Col>
          )}
          <Col>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => setBuscar(true)} loading={isLoading}>
              Generar
            </Button>
          </Col>
        </Row>
      </Card>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : rows.length > 0 ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card size="small" title={REPORTES.find(r => r.key === tipo)?.label}>
              <Table
                columns={cols[tipo] ?? []}
                dataSource={rows}
                rowKey={(r: any, i: any) => i}
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 15 }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card size="small" title="Gráfico">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.colorBorderSecondary} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: C.colorTextSecondary }}
                    angle={-30}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 10, fill: C.colorTextSecondary }} />
                  <Tooltip contentStyle={{ background: C.colorBgElevated, border: `1px solid ${C.colorBorder}`, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORES[i % COLORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      ) : buscar ? (
        <Card><Typography.Text type="secondary">Sin datos para el período seleccionado.</Typography.Text></Card>
      ) : null}
    </div>
  );
}
