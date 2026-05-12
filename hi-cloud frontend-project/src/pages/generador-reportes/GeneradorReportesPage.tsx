import { useState } from 'react';
import {
  Card, Row, Col, Select, DatePicker, Button, Table, Typography,
  Space, Tag, theme, Tabs, Statistic, Alert,
} from 'antd';
import {
  BarChartOutlined, DownloadOutlined, FileTextOutlined,
  TeamOutlined, ShoppingOutlined, AlertOutlined,
  DollarOutlined, CalculatorOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const COLORES = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#db2777','#65a30d'];

const NIVEL_COLOR: Record<string, string> = {
  sin_stock: 'red', critico: 'orange', bajo: 'gold', ok: 'green',
};

function exportarCSV(data: any[], nombre: string) {
  if (!data.length) return;
  const cols = Object.keys(data[0]);
  const rows = [cols.join(','), ...data.map(r => cols.map(c => `"${r[c] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${nombre}-${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const REPORTES = [
  { id: 'ventas',      label: 'Ventas por Período',        icon: <BarChartOutlined />,  color: '#1a56db' },
  { id: 'clientes',    label: 'Top Clientes',              icon: <TeamOutlined />,       color: '#059669' },
  { id: 'productos',   label: 'Top Productos',             icon: <ShoppingOutlined />,   color: '#7c3aed' },
  { id: 'inventario',  label: 'Inventario Crítico',        icon: <AlertOutlined />,      color: '#dc2626' },
  { id: 'gastos',      label: 'Gastos por Categoría',      icon: <DollarOutlined />,     color: '#d97706' },
  { id: 'nomina',      label: 'Balance de Nómina',         icon: <CalculatorOutlined />, color: '#0891b2' },
  { id: 'cxc',         label: 'CxC — Antigüedad',          icon: <FileTextOutlined />,   color: '#6366f1' },
  { id: 'proveedores', label: 'Compras por Proveedor',     icon: <ShoppingOutlined />,   color: '#db2777' },
  { id: 'comparativo', label: 'Comparativo Mensual',       icon: <BarChartOutlined />,   color: '#65a30d' },
];

export default function GeneradorReportesPage() {
  const { token } = theme.useToken();
  const hoy        = dayjs();
  const [reporteId, setReporteId]   = useState('ventas');
  const [rango, setRango]           = useState<[dayjs.Dayjs, dayjs.Dayjs]>([hoy.startOf('year'), hoy]);
  const [agrupar, setAgrupar]       = useState<'dia'|'semana'|'mes'>('mes');

  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  const endpoints: Record<string, string> = {
    ventas:      `/reportes-gen/ventas-periodo?desde=${desde}&hasta=${hasta}&agrupar=${agrupar}`,
    clientes:    `/reportes-gen/top-clientes?desde=${desde}&hasta=${hasta}&limite=20`,
    productos:   `/reportes-gen/top-productos?desde=${desde}&hasta=${hasta}&limite=20`,
    inventario:  `/reportes-gen/inventario-critico`,
    gastos:      `/reportes-gen/gastos-categoria?desde=${desde}&hasta=${hasta}`,
    nomina:      `/reportes-gen/balance-nomina`,
    cxc:         `/reportes-gen/cxc-aging`,
    proveedores: `/reportes-gen/compras-proveedor?desde=${desde}&hasta=${hasta}`,
    comparativo: `/reportes-gen/comparativo-mensual?anio=${hoy.year()}`,
  };

  const { data: reportData = [], isLoading } = useQuery<any[]>({
    queryKey: ['reporte', reporteId, desde, hasta, agrupar],
    queryFn: () => api.get(endpoints[reporteId]).then((r: any) => r.data?.data ?? r.data),
  });

  const reporte = REPORTES.find(r => r.id === reporteId)!;

  // Renderizado de tabla según el reporte
  const getColumns = (): any[] => {
    switch (reporteId) {
      case 'ventas':      return [
        { title: 'Período',   dataIndex: 'periodo',   key: 'p' },
        { title: 'Facturas',  dataIndex: 'cantidad',  key: 'c', align: 'right' },
        { title: 'Subtotal',  dataIndex: 'subtotal',  key: 's', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'ITBIS',     dataIndex: 'iva',       key: 'i', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'Total',     dataIndex: 'total',     key: 't', align: 'right', render: (v: any) => <Text strong style={{ color: token.colorPrimary }}>{fmt(Number(v))}</Text> },
      ];
      case 'clientes':    return [
        { title: 'Cliente',        dataIndex: 'nombre',       key: 'n' },
        { title: 'RNC',            dataIndex: 'rnc',          key: 'r', render: (v: any) => v || '—' },
        { title: 'Facturas',       dataIndex: 'facturas',     key: 'f', align: 'right' },
        { title: 'Total Comprado', dataIndex: 'total',        key: 't', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'Última Factura', dataIndex: 'ultimaFactura', key: 'uf' },
      ];
      case 'productos':   return [
        { title: 'Código',    dataIndex: 'codigo',        key: 'c', render: (v: any) => <Tag style={{ fontFamily: 'mono' }}>{v}</Tag> },
        { title: 'Producto',  dataIndex: 'nombre',        key: 'n' },
        { title: 'Categoría', dataIndex: 'categoria',     key: 'cat', render: (v: any) => v || '—' },
        { title: 'Unidades',  dataIndex: 'cantidadVendida', key: 'q', align: 'right', render: (v: any) => Number(v).toLocaleString('es-DO') },
        { title: 'Ingresos',  dataIndex: 'ingresos',      key: 'i', align: 'right', render: (v: any) => fmt(Number(v)) },
      ];
      case 'inventario':  return [
        { title: 'Código', dataIndex: 'codigo', key: 'c', render: (v: any) => <Tag style={{ fontFamily: 'mono' }}>{v}</Tag> },
        { title: 'Producto', dataIndex: 'nombre', key: 'n' },
        { title: 'Categoría', dataIndex: 'categoria', key: 'cat' },
        { title: 'Stock Actual', dataIndex: 'stock', key: 's', align: 'right', render: (v: any) => Number(v).toFixed(2) },
        { title: 'Stock Mínimo', dataIndex: 'stockMinimo', key: 'sm', align: 'right' },
        { title: 'Estado', dataIndex: 'nivel', key: 'nv', render: (v: any) => <Tag color={NIVEL_COLOR[v]}>{v.replace('_',' ').toUpperCase()}</Tag> },
      ];
      case 'gastos':      return [
        { title: 'Categoría', dataIndex: 'categoria', key: 'c' },
        { title: 'Cantidad',  dataIndex: 'cantidad',  key: 'q', align: 'right' },
        { title: 'ITBIS',     dataIndex: 'itbis',     key: 'i', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'Total',     dataIndex: 'total',     key: 't', align: 'right', render: (v: any) => fmt(Number(v)) },
      ];
      case 'nomina':      return [
        { title: 'Cargo', dataIndex: 'cargo', key: 'c' },
        { title: 'Departamento', dataIndex: 'departamento', key: 'd', render: (v: any) => v || '—' },
        { title: 'Empleados', dataIndex: 'empleados', key: 'e', align: 'right' },
        { title: 'Total Salarios', dataIndex: 'totalSalarios', key: 'ts', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'AFP Total', dataIndex: 'totalAfp', key: 'afp', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'SFS Total', dataIndex: 'totalSfs', key: 'sfs', align: 'right', render: (v: any) => fmt(Number(v)) },
      ];
      case 'cxc':         return [
        { title: 'Cliente', dataIndex: 'cliente', key: 'c' },
        { title: 'Factura', dataIndex: 'factura', key: 'f' },
        { title: 'Pendiente', dataIndex: 'montoPendiente', key: 'mp', align: 'right', render: (v: any) => fmt(Number(v)) },
        { title: 'Vencimiento', dataIndex: 'fechaVencimiento', key: 'fv' },
        { title: 'Días Vencida', dataIndex: 'diasVencida', key: 'dv', align: 'right', render: (v: any) => {
          const d = Number(v); return d > 0 ? <Tag color={d > 90 ? 'red' : d > 60 ? 'orange' : 'gold'}>{d} días</Tag> : <Tag color="green">Al día</Tag>;
        }},
        { title: 'Rango', dataIndex: 'rango', key: 'r', render: (v: any) => <Tag>{v.replace(/_/g,' ')}</Tag> },
      ];
      default: return [
        { title: 'Proveedor', dataIndex: 'proveedor', key: 'p' },
        { title: 'RNC', dataIndex: 'rnc', key: 'r', render: (v: any) => v || '—' },
        { title: 'Órdenes', dataIndex: 'ordenes', key: 'o', align: 'right' },
        { title: 'Total', dataIndex: 'total', key: 't', align: 'right', render: (v: any) => fmt(Number(v)) },
      ];
    }
  };

  // Gráfico adaptado al reporte
  const renderGrafico = () => {
    if (!reportData.length) return null;
    if (reporteId === 'ventas') {
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={reportData.map(r => ({ ...r, total: Number(r.total) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
            <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <Tooltip formatter={(v: number) => [fmt(v), 'Total']} />
            <Bar dataKey="total" fill={token.colorPrimary} radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (['clientes','productos','gastos','proveedores'].includes(reporteId)) {
      const key = reporteId === 'gastos' ? 'total' : reporteId === 'nomina' ? 'totalSalarios' : 'total';
      const labelKey = reporteId === 'clientes' ? 'nombre' : reporteId === 'productos' ? 'nombre' : reporteId === 'gastos' ? 'categoria' : 'proveedor';
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={reportData.slice(0,8).map(r => ({ ...r, [key]: Number(r[key]) }))} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <YAxis type="category" dataKey={labelKey} tick={{ fontSize: 10 }} width={100} tickFormatter={v => v.slice(0,14)} />
            <Tooltip formatter={(v: number) => [fmt(v), 'Total']} />
            <Bar dataKey={key} radius={[0,4,4,0]}>
              {reportData.slice(0,8).map((_: any, i: number) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  const totalReporte = reportData.reduce((s: number, r: any) => s + (Number(r.total ?? 0)), 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChartOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Generador de Reportes</Title>
            <Text type="secondary">8 reportes preconfigurados · Filtros dinámicos · Exportación CSV</Text>
          </div>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => exportarCSV(reportData, reporteId)}>
            CSV
          </Button>
          <Button
            icon={<FileExcelOutlined />}
            style={{ color: '#217346', borderColor: '#217346' }}
            onClick={() => exportarExcel(reportData as any, `${reporteId}-${dayjs().format('YYYY-MM-DD')}`)}
          >
            Excel
          </Button>
        </Space>
      </div>

      {/* Selector de reporte */}
      <Row gutter={[8, 8]} style={{ marginBottom: 20 }}>
        {REPORTES.map(r => (
          <Col key={r.id}>
            <Tag
              onClick={() => setReporteId(r.id)}
              style={{
                cursor:    'pointer',
                padding:   '6px 12px',
                fontSize:  13,
                fontWeight: reporteId === r.id ? 600 : 400,
                background: reporteId === r.id ? r.color : token.colorFillAlter,
                color:     reporteId === r.id ? '#fff' : token.colorText,
                border:    `1px solid ${reporteId === r.id ? r.color : token.colorBorderSecondary}`,
                borderRadius: 8,
              }}
            >
              {r.icon} {r.label}
            </Tag>
          </Col>
        ))}
      </Row>

      {/* Filtros */}
      {!['inventario','nomina','cxc'].includes(reporteId) && (
        <Card bordered={false} style={{ borderRadius: 10, marginBottom: 16, background: token.colorFillAlter }}>
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>Período:</Text>
            <RangePicker
              value={rango}
              onChange={v => v && setRango(v as [dayjs.Dayjs, dayjs.Dayjs])}
              format="DD/MM/YYYY"
              picker="month"
            />
            {reporteId === 'ventas' && (
              <Select value={agrupar} onChange={setAgrupar} style={{ width: 120 }}>
                <Option value="dia">Por día</Option>
                <Option value="semana">Por semana</Option>
                <Option value="mes">Por mes</Option>
              </Select>
            )}
          </Space>
        </Card>
      )}

      {/* Gráfico + KPI */}
      {reportData.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {renderGrafico() && (
            <Col xs={24} lg={16}>
              <Card bordered={false} style={{ borderRadius: 12 }} title={`Gráfico — ${reporte.label}`}>
                {renderGrafico()}
              </Card>
            </Col>
          )}
          <Col xs={24} lg={renderGrafico() ? 8 : 24}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic title="Registros" value={reportData.length} valueStyle={{ fontSize: 28 }} />
              {totalReporte > 0 && (
                <Statistic
                  title="Total"
                  value={fmt(totalReporte)}
                  valueStyle={{ fontSize: 20, color: token.colorPrimary }}
                  style={{ marginTop: 16 }}
                />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* Tabla */}
      <Card bordered={false} style={{ borderRadius: 12 }} title={reporte.label}>
        <Table
          dataSource={reportData}
          columns={getColumns()}
          loading={isLoading}
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: true }}
        />
      </Card>
    </div>
  );
}
