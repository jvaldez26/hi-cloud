import { useState } from 'react';
import { Card, DatePicker, Button, Table, Tabs, Typography, Statistic, Row, Col, Space } from 'antd';
import { BarChartOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import { theme } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function ReportesPage() {
  const { token } = theme.useToken();
  const [rango, setRango] = useState<[string, string]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);

  const params = { desde: rango[0], hasta: rango[1] };

  const { data: ingresos, refetch: riRefetch } = useQuery({
    queryKey: ['taller-rpt-ingresos', rango],
    queryFn: () => tallerApi.reporteIngresos(params),
  });

  const { data: productividad = [], refetch: rpRefetch } = useQuery({
    queryKey: ['taller-rpt-productividad', rango],
    queryFn: () => tallerApi.reporteProductividad(params),
  });

  const { data: servicios = [], refetch: rsRefetch } = useQuery({
    queryKey: ['taller-rpt-servicios', rango],
    queryFn: () => tallerApi.reporteServiciosMasSolicitados(params),
  });

  const { data: vehiculosFrecuentes = [], refetch: rvRefetch } = useQuery({
    queryKey: ['taller-rpt-vehiculos', rango],
    queryFn: () => tallerApi.reporteVehiculosFrecuentes(params),
  });

  const prodColumns = [
    { title: 'Técnico', dataIndex: 'tecnico' },
    { title: 'Órdenes', dataIndex: 'ordenes', width: 90 },
    { title: 'Horas trabajadas', dataIndex: 'horas', width: 130, render: (v: any) => `${Number(v ?? 0).toFixed(1)} h` },
    {
      title: 'Ingresos', dataIndex: 'ingresos', width: 140,
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    {
      title: 'Prom. por orden', dataIndex: 'promedioOrden', width: 140,
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
  ];

  const svcColumns = [
    { title: 'Servicio', dataIndex: 'servicio', ellipsis: true },
    { title: 'Veces', dataIndex: 'veces', width: 80 },
    {
      title: 'Ingresos total', dataIndex: 'ingresosTotal', width: 140,
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
  ];

  const vehColumns = [
    { title: 'Placa', dataIndex: 'placa', width: 100 },
    { title: 'Vehículo', key: 'v', render: (r: any) => `${r.marca ?? ''} ${r.modelo ?? ''} ${r.anio ?? ''}` },
    { title: 'Visitas', dataIndex: 'visitas', width: 80 },
    {
      title: 'Gasto total', dataIndex: 'gastoTotal', width: 130,
      render: (v: any) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
  ];

  const t = ingresos?.totales ?? {};

  const items = [
    {
      key: 'ingresos',
      label: 'Ingresos',
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col><Statistic title="Mano de obra" value={`RD$ ${Number(t.manoObra ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`} /></Col>
            <Col><Statistic title="Repuestos" value={`RD$ ${Number(t.repuestos ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`} /></Col>
            <Col><Statistic title="Total facturado" value={`RD$ ${Number(t.total ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`} valueStyle={{ color: '#1677ff' }} /></Col>
            <Col><Statistic title="Órdenes" value={t.ordenes ?? 0} /></Col>
          </Row>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={(ingresos?.porMes ?? []).map((m: any) => ({ ...m, mes: m.mes?.slice(5) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <YAxis tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <Tooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }} />
              <Legend />
              <Bar dataKey="manoObra" name="Mano de obra" fill="#1677ff" stackId="a" />
              <Bar dataKey="repuestos" name="Repuestos" fill="#52c41a" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ),
    },
    {
      key: 'productividad',
      label: 'Productividad',
      children: (
        <Table
          dataSource={productividad as any[]}
          columns={prodColumns}
          rowKey="tecnico"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      ),
    },
    {
      key: 'servicios',
      label: 'Servicios populares',
      children: (
        <Table
          dataSource={servicios as any[]}
          columns={svcColumns}
          rowKey="servicio"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'vehiculos',
      label: 'Vehículos frecuentes',
      children: (
        <Table
          dataSource={vehiculosFrecuentes as any[]}
          columns={vehColumns}
          rowKey="placa"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BarChartOutlined style={{ marginRight: 8 }} />Reportes Taller
        </Title>
        <Space>
          <RangePicker
            value={[dayjs(rango[0]), dayjs(rango[1])]}
            onChange={vals => {
              if (vals) setRango([vals[0]!.format('YYYY-MM-DD'), vals[1]!.format('YYYY-MM-DD')]);
            }}
            format="DD/MM/YYYY"
          />
        </Space>
      </div>
      <Card>
        <Tabs items={items} />
      </Card>
    </div>
  );
}

