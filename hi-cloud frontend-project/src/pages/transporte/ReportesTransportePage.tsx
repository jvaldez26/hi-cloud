import { useState } from 'react';
import {
  Card, DatePicker, Table, Tabs, Typography, Statistic,
  Row, Col, Space, Tag,
} from 'antd';
import { BarChartOutlined, TruckOutlined, ToolOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { theme } from 'antd';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const ESTADO_COLOR: Record<string, string> = {
  programado: 'blue', en_curso: 'orange', completado: 'green',
  cancelado: 'red', facturado: 'purple',
};
const TIPO_COLOR: Record<string, string> = {
  gasolina: 'orange', diesel: 'blue', gas: 'green',
  preventivo: 'green', correctivo: 'orange', emergencia: 'red',
};

async function fetchReporteViajes(desde: string, hasta: string) {
  const r = await api.get('/transporte/reportes/viajes', { params: { desde, hasta } });
  return r.data?.data;
}
async function fetchReporteCombustible(desde: string, hasta: string) {
  const r = await api.get('/transporte/reportes/combustible', { params: { desde, hasta } });
  return r.data?.data;
}
async function fetchReporteMantenimiento(desde: string, hasta: string) {
  const r = await api.get('/transporte/reportes/mantenimiento', { params: { desde, hasta } });
  return r.data?.data;
}

export default function ReportesTransportePage() {
  const { token } = theme.useToken();
  const [rango, setRango] = useState<[string, string]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);

  const [desde, hasta] = rango;

  const { data: rptViajes } = useQuery({
    queryKey: ['tr-rpt-viajes', desde, hasta],
    queryFn: () => fetchReporteViajes(desde, hasta),
  });

  const { data: rptCombustible } = useQuery({
    queryKey: ['tr-rpt-combustible', desde, hasta],
    queryFn: () => fetchReporteCombustible(desde, hasta),
  });

  const { data: rptMantenimiento } = useQuery({
    queryKey: ['tr-rpt-mantenimiento', desde, hasta],
    queryFn: () => fetchReporteMantenimiento(desde, hasta),
  });

  // ── Columnas viajes ────────────────────────────────────────────────────────
  const viajesColumns = [
    { title: '#',       dataIndex: 'numero',            key: 'numero',    width: 90 },
    { title: 'Fecha',   dataIndex: 'fecha',             key: 'fecha',     width: 100, render: (v: string) => v?.substring(0, 10) },
    { title: 'Origen',  dataIndex: 'origen',            key: 'origen' },
    { title: 'Destino', dataIndex: 'destino',           key: 'destino' },
    { title: 'Cliente', dataIndex: 'clienteNombre',     key: 'cliente',   render: (v?: string) => v ?? '—' },
    { title: 'Chofer',  dataIndex: 'choferNombre',      key: 'chofer',    render: (v?: string) => v ?? '—' },
    { title: 'Vehículo', dataIndex: 'vehiculoPlaca',    key: 'vehiculo',  render: (v?: string) => v ?? '—' },
    {
      title: 'Tarifa', dataIndex: 'tarifa', key: 'tarifa', align: 'right' as const,
      render: (v: string) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ').toUpperCase()}</Tag>,
    },
  ];

  // ── Columnas combustible detalle ───────────────────────────────────────────
  const combDetalleColumns = [
    { title: 'Fecha',    dataIndex: 'fecha',              key: 'fecha',    width: 100, render: (v: string) => v?.substring(0, 10) },
    { title: 'Vehículo', dataIndex: 'vehiculoPlaca',      key: 'vehiculo', render: (v?: string) => v ?? '—' },
    { title: 'Chofer',   dataIndex: 'choferNombre',       key: 'chofer',   render: (v?: string) => v ?? '—' },
    {
      title: 'Tipo', dataIndex: 'tipoCombustible', key: 'tipo',
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Galones', dataIndex: 'galones',   key: 'galones',  align: 'right' as const, render: (v?: string) => v ? Number(v).toFixed(3) : '—' },
    { title: 'P/Galón', dataIndex: 'precioGalon', key: 'precio', align: 'right' as const, render: (v?: string) => v ? `RD$${Number(v).toFixed(2)}` : '—' },
    { title: 'Total',   dataIndex: 'total', key: 'total',  align: 'right' as const, render: (v: string) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
    { title: 'Estación', dataIndex: 'estacion', key: 'estacion', render: (v?: string) => v ?? '—' },
  ];

  // ── Columnas combustible por vehículo ─────────────────────────────────────
  const combVehColumns = [
    { title: 'Placa',    dataIndex: 'placa',   key: 'placa',   width: 100 },
    { title: 'Vehículo', dataIndex: 'vehiculo', key: 'vehiculo' },
    { title: 'Cargas',   dataIndex: 'cargas',   key: 'cargas',  width: 80,  render: (v: any) => Number(v) },
    { title: 'Galones',  dataIndex: 'galonesTotal', key: 'galones', align: 'right' as const, render: (v: any) => Number(v).toFixed(2) },
    { title: 'Costo Total', dataIndex: 'costoTotal', key: 'costo', align: 'right' as const, render: (v: any) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
  ];

  // ── Columnas mantenimiento detalle ─────────────────────────────────────────
  const mantDetalleColumns = [
    { title: 'Fecha',     dataIndex: 'fecha',                key: 'fecha',    width: 100, render: (v: string) => v?.substring(0, 10) },
    { title: 'Vehículo',  dataIndex: 'vehiculoPlaca',        key: 'vehiculo', render: (v?: string) => v ?? '—' },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo',
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Descripción', dataIndex: 'descripcion', key: 'descripcion', ellipsis: true },
    { title: 'Proveedor',   dataIndex: 'proveedor',   key: 'proveedor',   render: (v?: string) => v ?? '—' },
    { title: 'Costo', dataIndex: 'costo', key: 'costo', align: 'right' as const, render: (v: string) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
  ];

  // ── Columnas mantenimiento por vehículo ────────────────────────────────────
  const mantVehColumns = [
    { title: 'Placa',       dataIndex: 'placa',       key: 'placa',   width: 100 },
    { title: 'Vehículo',    dataIndex: 'vehiculo',    key: 'vehiculo' },
    { title: 'Total',       dataIndex: 'mantenimientos', key: 'total', width: 70, render: (v: any) => Number(v) },
    { title: 'Prev.',       dataIndex: 'preventivos', key: 'prev',    width: 65, render: (v: any) => <Tag color="green">{Number(v)}</Tag> },
    { title: 'Correc.',     dataIndex: 'correctivos', key: 'corr',    width: 65, render: (v: any) => <Tag color="orange">{Number(v)}</Tag> },
    { title: 'Emerg.',      dataIndex: 'emergencias', key: 'emerg',   width: 65, render: (v: any) => <Tag color="red">{Number(v)}</Tag> },
    { title: 'Costo Total', dataIndex: 'costoTotal', key: 'costo', align: 'right' as const, render: (v: any) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
  ];

  const tabItems = [
    {
      key: 'viajes',
      label: <><TruckOutlined /> Viajes</>,
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col>
              <Statistic
                title="Total Viajes"
                value={rptViajes?.totalViajes ?? 0}
              />
            </Col>
            <Col>
              <Statistic
                title="Total Facturado"
                value={rptViajes?.totalTarifa ?? 0}
                precision={2}
                prefix="RD$"
                valueStyle={{ color: '#1677ff' }}
              />
            </Col>
          </Row>
          <Table
            dataSource={rptViajes?.data ?? []}
            columns={viajesColumns}
            rowKey={(r: any, i) => `vj-${r.numero ?? i}`}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 50, showTotal: t => `${t} viajes` }}
          />
        </div>
      ),
    },
    {
      key: 'combustible',
      label: <><span role="img" aria-label="fuel">⛽</span> Combustible</>,
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col>
              <Statistic title="Costo Total"   value={rptCombustible?.totales?.costoTotal ?? 0}   precision={2} prefix="RD$" valueStyle={{ color: '#dc2626' }} />
            </Col>
            <Col>
              <Statistic title="Galones Total" value={rptCombustible?.totales?.galonesTotal ?? 0} precision={2} suffix=" gal" />
            </Col>
            <Col>
              <Statistic title="Registros"     value={rptCombustible?.totales?.registros ?? 0} />
            </Col>
          </Row>

          {(rptCombustible?.porVehiculo ?? []).length > 0 && (
            <>
              <Title level={5} style={{ marginBottom: 8 }}>Por Vehículo</Title>
              <Table
                dataSource={rptCombustible?.porVehiculo ?? []}
                columns={combVehColumns}
                rowKey="placa"
                size="small"
                pagination={false}
                style={{ marginBottom: 24 }}
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(rptCombustible?.porVehiculo ?? []).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis dataKey="placa" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                  <YAxis tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                  <Tooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }} />
                  <Legend />
                  <Bar dataKey="costoTotal" name="Costo RD$" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>Detalle de Cargas</Title>
          <Table
            dataSource={rptCombustible?.detalle ?? []}
            columns={combDetalleColumns}
            rowKey={(_: any, i) => `comb-${i}`}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 50 }}
          />
        </div>
      ),
    },
    {
      key: 'mantenimiento',
      label: <><ToolOutlined /> Mantenimiento</>,
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col>
              <Statistic title="Costo Total"     value={rptMantenimiento?.totales?.costoTotal ?? 0}     precision={2} prefix="RD$" valueStyle={{ color: '#f59e0b' }} />
            </Col>
            <Col>
              <Statistic title="Mantenimientos"  value={rptMantenimiento?.totales?.mantenimientos ?? 0} />
            </Col>
          </Row>

          {(rptMantenimiento?.porVehiculo ?? []).length > 0 && (
            <>
              <Title level={5} style={{ marginBottom: 8 }}>Por Vehículo</Title>
              <Table
                dataSource={rptMantenimiento?.porVehiculo ?? []}
                columns={mantVehColumns}
                rowKey="placa"
                size="small"
                pagination={false}
                style={{ marginBottom: 24 }}
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(rptMantenimiento?.porVehiculo ?? []).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis dataKey="placa" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                  <YAxis tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                  <Tooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }} />
                  <Legend />
                  <Bar dataKey="costoTotal" name="Costo RD$" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>Detalle de Mantenimientos</Title>
          <Table
            dataSource={rptMantenimiento?.detalle ?? []}
            columns={mantDetalleColumns}
            rowKey={(_: any, i) => `mant-${i}`}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 50 }}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BarChartOutlined style={{ marginRight: 8 }} />Reportes Transporte
        </Title>
        <Space>
          <RangePicker
            value={[dayjs(desde), dayjs(hasta)]}
            onChange={vals => {
              if (vals) setRango([vals[0]!.format('YYYY-MM-DD'), vals[1]!.format('YYYY-MM-DD')]);
            }}
            format="DD/MM/YYYY"
          />
        </Space>
      </div>
      <Card>
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
}
