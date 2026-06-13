import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, Switch, Space, Tabs,
  Alert, Descriptions, message, Spin, Tooltip, Badge,
  Progress,
} from 'antd';
import {
  ThunderboltOutlined, CheckOutlined, ShoppingCartOutlined,
  BarChartOutlined, PlusOutlined, EyeOutlined,
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { planeacionApi } from '../../api/planeacion-demanda.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const TENDENCIA_COLOR: Record<string, string> = {
  creciente: 'green', estable: 'blue', decreciente: 'red', sin_datos: 'default',
};
const TENDENCIA_ICON: Record<string, React.ReactNode> = {
  creciente:   <ArrowUpOutlined style={{ color: '#52c41a' }} />,
  estable:     <MinusOutlined   style={{ color: '#1677ff' }} />,
  decreciente: <ArrowDownOutlined style={{ color: '#dc2626' }} />,
  sin_datos:   <MinusOutlined style={{ color: '#9ca3af' }} />,
};
const URGENCIA_COLOR: Record<string, string> = {
  critica: 'red', alta: 'orange', media: 'blue',
};

// ── Tab Planes ─────────────────────────────────────────────────────────────────
function PlanesTab() {
  const [openGen, setOpenGen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [lineas,  setLineas]  = useState<any[]>([]);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['planes-demanda'], queryFn: () => planeacionApi.listar() });

  const generarMut = useMutation({
    mutationFn: planeacionApi.generar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planes-demanda'] }); qc.invalidateQueries({ queryKey: ['sugerencias-demanda'] }); setOpenGen(false); form.resetFields(); message.success('Plan generado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al generar'),
  });
  const aprobarMut = useMutation({
    mutationFn: planeacionApi.aprobar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planes-demanda'] }); qc.invalidateQueries({ queryKey: ['sugerencias-demanda'] }); message.success('Plan aprobado'); },
  });

  const verDetalle = async (plan: any) => {
    setDetalle(plan);
    const l = await planeacionApi.getLineas(plan.id, soloAlertas);
    setLineas(l);
  };

  const colsPlanes = [
    { title: 'N°', dataIndex: 'numero', width: 130 },
    { title: 'Período', key: 'per', width: 180,
      render: (_: any, r: any) => `${r.periodoDesde} → ${r.periodoHasta}` },
    { title: 'Horizonte', dataIndex: 'horizonteMeses', width: 90, render: (v: number) => `${v} meses` },
    { title: 'Productos', dataIndex: 'totalProductos', width: 90 },
    { title: 'Con alerta', dataIndex: 'productosConAlerta', width: 100,
      render: (v: number) => v > 0 ? <Badge count={v} color="orange" /> : '—' },
    { title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={v === 'aprobado' ? 'green' : v === 'ejecutado' ? 'cyan' : 'default'}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'acc', width: 150,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => verDetalle(r)}>Ver</Button>
          {r.estado === 'borrador' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => aprobarMut.mutate(r.id)}>Aprobar</Button>
          )}
        </Space>
      ) },
  ];

  const colsLineas = [
    { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => r.producto ? (r.producto.codigo ? `${r.producto.codigo} — ${r.producto.nombre}` : r.producto.nombre) : '' },
    { title: 'Tend.', dataIndex: 'tendencia', width: 90,
      render: (v: string) => <Tooltip title={v}>{TENDENCIA_ICON[v] ?? '—'}</Tooltip> },
    { title: 'Prom. 3m', dataIndex: 'ventaPromedio3m', width: 90, render: (v: number) => fmt.number(v) },
    { title: 'Proy. M1', dataIndex: 'proyeccionMes1', width: 90, render: (v: number) => fmt.number(v) },
    { title: 'Proy. M2', dataIndex: 'proyeccionMes2', width: 90, render: (v: number) => fmt.number(v) },
    { title: 'Proy. M3', dataIndex: 'proyeccionMes3', width: 90, render: (v: number) => fmt.number(v) },
    { title: 'Stock',   dataIndex: 'stockActual', width: 80, render: (v: number) => fmt.number(v) },
    { title: 'Sugerido', dataIndex: 'cantidadSugeridaCompra', width: 95,
      render: (v: number) => v > 0 ? <Text strong style={{ color: '#dc2626' }}>{fmt.number(v)}</Text> : '—' },
    { title: '', dataIndex: 'requiereCompra', width: 60,
      render: (v: boolean) => v ? <Tag color="red">⚠</Tag> : null },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Text type="secondary">Planes generados: {data?.meta?.total ?? 0}</Text>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpenGen(true); }}>
            Generar nuevo plan
          </Button>
        </Col>
      </Row>

      <Table columns={colsPlanes} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 10 }} 
        scroll={{ x: 'max-content' }} />

      {/* Modal generar */}
      <Modal title="Generar Plan de Demanda" open={openGen} onCancel={() => { setOpenGen(false); form.resetFields(); }} footer={null} width={480}>
        <Alert type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }}
          message="El sistema analiza los últimos 12 meses de ventas y aplica SMA + regresión lineal para proyectar la demanda futura." />
        <Form form={form} layout="vertical" onFinish={(v) => generarMut.mutate(v)}>
          <Form.Item name="horizonteMeses" label="Horizonte de proyección" initialValue={3}>
            <Select options={[{ value: 1, label: '1 mes' }, { value: 3, label: '3 meses' }, { value: 6, label: '6 meses' }]} />
          </Form.Item>
          <Form.Item name="soloConVentas" label="Solo productos con ventas" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item name="notas" label="Notas del plan">
            <Input.TextArea rows={2} placeholder="Opcional..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpenGen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={generarMut.isPending} icon={<ThunderboltOutlined />}>Generar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer detalle */}
      <Modal title={`Plan ${detalle?.numero} — ${detalle?.periodoDesde} a ${detalle?.periodoHasta}`}
        open={!!detalle} onCancel={() => setDetalle(null)} footer={null} width={1100}>
        {detalle && (
          <>
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col xs={12} md={6}><Statistic title="Productos analizados" value={detalle.totalProductos} /></Col>
              <Col xs={12} md={6}><Statistic title="Requieren compra" value={detalle.productosConAlerta} valueStyle={{ color: '#dc2626' }} /></Col>
              <Col xs={12} md={6}><Statistic title="Horizonte" value={detalle.horizonteMeses} suffix="meses" /></Col>
              <Col xs={12} md={6}>
                <div style={{ paddingTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Solo alertas</Text><br />
                  <Switch checked={soloAlertas} onChange={async (v) => { setSoloAlertas(v); const l = await planeacionApi.getLineas(detalle.id, v); setLineas(l); }} />
                </div>
              </Col>
            </Row>
            <Table columns={colsLineas} dataSource={lineas} rowKey="id" size="small"
              pagination={{ pageSize: 15 }} scroll={{ x: 800 }} />
          </>
        )}
      </Modal>
    </>
  );
}

// ── Tab Sugerencias de Compra ─────────────────────────────────────────────────
function SugerenciasTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['sugerencias-demanda'],
    queryFn: () => planeacionApi.sugerencias(),
  });

  const sugerencias = data?.sugerencias ?? [];

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 110 },
    { title: 'Producto', dataIndex: 'producto', ellipsis: true },
    { title: 'Stock actual', dataIndex: 'stockActual', width: 110, render: (v: number) => fmt.number(v) },
    { title: 'Stock mín.', dataIndex: 'stockMinimo', width: 100, render: (v: number) => fmt.number(v) },
    { title: 'Cobertura', key: 'cob', width: 120,
      render: (_: any, r: any) => {
        const pct = r.proyeccion3m > 0 ? Math.min(100, (r.stockActual / r.proyeccion3m) * 100) : 100;
        return <Progress percent={Math.round(pct)} size="small" status={pct < 30 ? 'exception' : pct < 70 ? 'active' : 'success'} />;
      } },
    { title: 'Proyec. 3m', dataIndex: 'proyeccion3m', width: 110, render: (v: number) => fmt.number(v) },
    { title: 'A comprar', dataIndex: 'cantidadSugerida', width: 110,
      render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{fmt.number(v)}</Text> },
    { title: 'Tendencia', dataIndex: 'tendencia', width: 100,
      render: (v: string) => <Tag color={TENDENCIA_COLOR[v]}>{TENDENCIA_ICON[v]} {v}</Tag> },
    { title: 'Urgencia', dataIndex: 'urgencia', width: 90,
      render: (v: string) => <Tag color={URGENCIA_COLOR[v]}>{v?.toUpperCase()}</Tag> },
  ];

  const criticas = sugerencias.filter((s: any) => s.urgencia === 'critica').length;
  const altas    = sugerencias.filter((s: any) => s.urgencia === 'alta').length;

  return (
    <>
      {criticas > 0 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={`${criticas} producto(s) en nivel CRÍTICO — stock por debajo del mínimo`} />
      )}
      {altas > 0 && !criticas && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`${altas} producto(s) con urgencia ALTA — stock no cubre el próximo mes proyectado`} />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Sugerencias totales', value: sugerencias.length, color: '#1677ff' },
          { label: 'Urgencia crítica',    value: criticas,            color: '#dc2626' },
          { label: 'Urgencia alta',       value: altas,               color: '#fa8c16' },
          { label: 'Urgencia media',      value: sugerencias.length - criticas - altas, color: '#1677ff' },
        ].map(k => (
          <Col xs={12} md={6} key={k.label}>
            <Card size="small"><Statistic title={k.label} value={k.value} valueStyle={{ color: k.color }} /></Card>
          </Col>
        ))}
      </Row>

      {!data?.planId && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="No hay ningún plan aprobado. Genera y aprueba un plan desde la pestaña 'Planes' para ver las sugerencias de compra." />
      )}

      <Table columns={cols} dataSource={sugerencias} rowKey="productoId" loading={isLoading}
        size="small" pagination={{ pageSize: 20 }}
        rowClassName={(r: any) => r.urgencia === 'critica' ? 'ant-table-row-selected' : ''}
      
        scroll={{ x: 'max-content' }} />
    </>
  );
}

// ── Tab Análisis de Producto ──────────────────────────────────────────────────
function AnalisisTab() {
  const [productoId, setProductoId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['analisis-producto', productoId],
    queryFn: () => planeacionApi.analizarProducto(productoId!),
    enabled: productoId !== null,
  });

  // Preparar datos para gráfica
  const chartData = (data?.historico ?? []).map((h: any) => ({
    periodo: `${h.anio}-${String(h.mes).padStart(2,'0')}`,
    vendido: h.cantidad,
    monto:   h.monto,
  }));

  const proyData = data ? [
    { periodo: 'Mes +1', proyectado: data.proyeccion?.mes1 },
    { periodo: 'Mes +2', proyectado: data.proyeccion?.mes2 },
    { periodo: 'Mes +3', proyectado: data.proyeccion?.mes3 },
  ] : [];

  return (
    <Row gutter={16}>
      <Col span={24} style={{ marginBottom: 16 }}>
        <Row gutter={12} align="middle">
          <Col flex={1}>
            <InputNumber placeholder="ID del producto (ej: 1, 2, 3...)" min={1} style={{ width: '100%' }}
              onChange={v => setProductoId(v ? Number(v) : null)} />
          </Col>
        </Row>
      </Col>

      {isLoading && <Col span={24}><Spin /></Col>}

      {data && (
        <>
          <Col xs={24} md={8}>
            <Card title={data.producto?.nombre} size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Código">{data.producto?.codigo}</Descriptions.Item>
                <Descriptions.Item label="Stock actual">{fmt.number(data.producto?.stock)}</Descriptions.Item>
                <Descriptions.Item label="Tendencia">
                  <Tag color={TENDENCIA_COLOR[data.estadisticas?.tendencia]}>
                    {TENDENCIA_ICON[data.estadisticas?.tendencia]} {data.estadisticas?.tendencia}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Prom. 3m">{fmt.number(data.estadisticas?.promedio3m)}</Descriptions.Item>
                <Descriptions.Item label="Prom. 6m">{fmt.number(data.estadisticas?.promedio6m)}</Descriptions.Item>
                <Descriptions.Item label="Prom. 12m">{fmt.number(data.estadisticas?.promedio12m)}</Descriptions.Item>
                <Descriptions.Item label="CV">{data.estadisticas?.cv}%</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Proyección próximos 3 meses:</Text>
                <Row gutter={8} style={{ marginTop: 6 }}>
                  {[data.proyeccion?.mes1, data.proyeccion?.mes2, data.proyeccion?.mes3].map((v, i) => (
                    <Col xs={24} sm={8} key={i}>
                      <Statistic title={`Mes ${i+1}`} value={v ?? 0} precision={1}
                        valueStyle={{ fontSize: 14, color: '#1677ff' }}  />
                    </Col>
                  ))}
                </Row>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={16}>
            <Card title="Ventas históricas (24 meses)" size="small" style={{ marginBottom: 12 }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Bar dataKey="vendido" fill="#1677ff" name="Cantidad vendida" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Proyección próximos 3 meses" size="small">
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={proyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Line type="monotone" dataKey="proyectado" stroke="#52c41a" strokeWidth={2}
                    dot={{ r: 5 }} name="Proyectado" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </>
      )}
    </Row>
  );
}

// ── Page principal ─────────────────────────────────────────────────────────────
export default function PlaneacionDemandaPage() {
  const { data: sugs } = useQuery({ queryKey: ['sugerencias-demanda'], queryFn: () => planeacionApi.sugerencias() });
  const criticas = (sugs?.sugerencias ?? []).filter((s: any) => s.urgencia === 'critica').length;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Planeación de la Demanda</Title>
      <Card>
        <Tabs defaultActiveKey="planes" items={[
          { key: 'planes',      label: <><BarChartOutlined /> Planes de Demanda</>,  children: <PlanesTab /> },
          { key: 'sugerencias', label: (
              <Space>
                <ShoppingCartOutlined /> Sugerencias de Compra
                {criticas > 0 && <Badge count={criticas} size="small" />}
              </Space>
            ),                                                                         children: <SugerenciasTab /> },
          { key: 'analisis',   label: <><ThunderboltOutlined /> Análisis por Producto</>, children: <AnalisisTab /> },
        ]} />
      </Card>
    </div>
  );
}
