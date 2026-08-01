import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { Card, Row, Col, Typography, Statistic, Select, DatePicker, Button,
         Table, Tabs, Spin, Tag, Progress, message, Alert, Badge, Tooltip, theme } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
         ResponsiveContainer, Cell } from 'recharts';
import { DownloadOutlined, FileExcelOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { reportesApi } from '../../api/reportes.api';
import { exportarExcel, exportarITBIS, exportarInventario } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLORES = ['#1677ff','#10b981','#f59e0b','#7c3aed','#ef4444','#0891b2','#db2777','#65a30d'];

export default function ReportesPage() {
  const { token } = theme.useToken();
  const [mes,   setMes]   = useState(dayjs().month() + 1);
  const [anio,  setAnio]  = useState(dayjs().year());
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'), dayjs(),
  ]);

  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  const { data: kpis }         = useQuery({ queryKey: ['kpis', mes, anio],   queryFn: () => reportesApi.kpis(mes, anio) });
  const { data: ventasDia }    = useQuery({ queryKey: ['v-dia', mes, anio],  queryFn: () => reportesApi.ventasPorDia(mes, anio) });
  const { data: itbis }        = useQuery({ queryKey: ['itbis', mes, anio],  queryFn: () => reportesApi.itbis(mes, anio) });
  const { data: stock }        = useQuery({ queryKey: ['stock-rep'],          queryFn: reportesApi.stockActual });
  const { data: valorInv }     = useQuery({ queryKey: ['valor-inv'],          queryFn: reportesApi.valorInventario });
  const { data: topClientes }  = useQuery({ queryKey: ['top-cli', desde, hasta], queryFn: () => reportesApi.topClientes(desde, hasta) });
  const { data: topProductos } = useQuery({ queryKey: ['top-prod', desde, hasta], queryFn: () => reportesApi.topProductos(desde, hasta) });
  const { data: pendientes }   = useQuery({ queryKey: ['fact-pend'],          queryFn: reportesApi.facturasPendientes });
  const { data: r606, isFetching: loading606 } = useQuery({ queryKey: ['606', mes, anio], queryFn: () => reportesApi.reporte606(mes, anio) });
  const { data: r607, isFetching: loading607 } = useQuery({ queryKey: ['607', mes, anio], queryFn: () => reportesApi.reporte607(mes, anio) });
  const { data: ecfEstado }                     = useQuery({ queryKey: ['ecf-estado', mes, anio], queryFn: () => reportesApi.ecfPorEstado(mes, anio) });

  const chartVentas = (ventasDia?.detalle ?? []).map((d: any) => ({
    dia: `D${d.dia}`, ventas: d.total,
  }));

  const MESES_OPT = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1, label: dayjs().month(i).format('MMMM'),
  }));
  const ANIOS_OPT = [2024, 2025, 2026].map(y => ({ value: y, label: y }));

  const maxCliente = (topClientes?.clientes ?? [])[0]?.total ?? 1;
  const maxProducto = (topProductos?.productos ?? [])[0]?.total ?? 1;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>Reportes y Análisis</Title>
        <span style={{ display: 'flex', gap: 2 }}>
          <RefreshByKeyButton queryKey={['reportes']} />
          <VideoTutorialButton />
        </span>
      </div>

      <Tabs defaultActiveKey="ventas" items={[
        /* ── VENTAS ── */
        {
          key: 'ventas', label: '📈 Ventas',
          children: (
            <div>
              <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 16 }}>
                <Col xs={12} sm="auto">
                  <Select value={mes} onChange={setMes} style={{ width: '100%', minWidth: 120 }} options={MESES_OPT} />
                </Col>
                <Col xs={8} sm="auto">
                  <Select value={anio} onChange={setAnio} style={{ width: '100%', minWidth: 90 }} options={ANIOS_OPT} />
                </Col>
                <Col xs={4} sm="auto">
                  <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                    const filas = (ventasDia?.detalle ?? []).map((d: any) => ({
                      'Día': d.dia, 'Facturas': d.cantidad, 'Total': Number(d.total),
                    }));
                    exportarExcel(filas, `Ventas-Diarias-${anio}-${String(mes).padStart(2,'0')}`);
                  }}>
                    Excel
                  </Button>
                </Col>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                  <Card title={`Ventas diarias — ${dayjs().month(mes - 1).format('MMMM')} ${anio}`}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartVentas}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <ChartTooltip formatter={(v: number) => [fmt.money(Number(v)), 'Ventas']} />
                        <Bar dataKey="ventas" name="Ventas" fill="#1677ff" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
                <Col xs={24} lg={8}>
                  <Card title="Resumen del mes">
                    <Statistic title="Ventas del mes"  value={kpis?.ventas?.mes ?? 0}      formatter={v => fmt.money(Number(v))} />
                    <Statistic title="Compras del mes" value={kpis?.compras?.mes ?? 0}     formatter={v => fmt.money(Number(v))} style={{ marginTop: 12 }} />
                    <Statistic title="Balance"
                      value={kpis?.balanceMes?.balance ?? 0}
                      formatter={v => fmt.money(Number(v))}
                      valueStyle={{ color: (kpis?.balanceMes?.balance ?? 0) >= 0 ? '#52c41a' : '#ff4d4f' }}
                      style={{ marginTop: 12 }} />
                    <Statistic title="Facturas pendientes" value={kpis?.alertas?.facturasPendientes ?? 0}
                      valueStyle={{ color: (kpis?.alertas?.facturasPendientes ?? 0) > 0 ? '#d97706' : '#52c41a' }}
                      style={{ marginTop: 12 }} />
                  </Card>
                </Col>
              </Row>
            </div>
          ),
        },

        /* ── TOP CLIENTES / PRODUCTOS ── */
        {
          key: 'ranking', label: '🏆 Ranking',
          children: (
            <div>
              <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 16 }}>
                <Col>
                  <RangePicker value={rango} onChange={v => v && setRango(v as any)}
                    format="DD/MM/YYYY" picker="month" />
                </Col>
                <Col>
                  <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                    const filas = (topClientes?.clientes ?? []).map((c: any, i: number) => ({
                      '#': i + 1, 'Cliente': c.nombre, 'RNC': c.rncReceptor ?? '',
                      'Facturas': c.cantidadFacturas ?? 0, 'Total': Number(c.total ?? 0),
                    }));
                    exportarExcel(filas, `Top-Clientes-${desde}-${hasta}`);
                  }}>
                    Excel clientes
                  </Button>
                </Col>
                <Col>
                  <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                    const filas = (topProductos?.productos ?? []).map((p: any, i: number) => ({
                      '#': i + 1, 'Producto': p.nombre, 'Código': p.codigo ?? '',
                      'Unidades': Number(p.cantidadUnidades ?? 0), 'Ingresos': Number(p.total ?? 0),
                    }));
                    exportarExcel(filas, `Top-Productos-${desde}-${hasta}`);
                  }}>
                    Excel productos
                  </Button>
                </Col>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card title="Top 10 Clientes del período">
                    {(topClientes?.clientes ?? []).length === 0
                      ? <Text type="secondary">Sin datos para el período seleccionado</Text>
                      : (topClientes?.clientes ?? []).slice(0, 10).map((c: any, i: number) => {
                          const pct = Math.round((Number(c.total) / maxCliente) * 100);
                          return (
                            <div key={c.clienteId ?? i} style={{ marginBottom: 10 }}>
                              <Row justify="space-between" style={{ marginBottom: 3 }}>
                                <Text style={{ fontSize: 12 }} ellipsis>
                                  <span style={{ color: ['#f5a623','#c0c0c0','#cd7f32'][i] ?? '#aaa', marginRight: 6 }}>
                                    {i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}.`}
                                  </span>
                                  {c.nombre ?? c.label}
                                </Text>
                                <Text strong style={{ fontSize: 12 }}>{fmt.money(Number(c.total))}</Text>
                              </Row>
                              <Progress percent={pct} size="small" showInfo={false}
                                strokeColor={COLORES[i % COLORES.length]} />
                            </div>
                          );
                        })
                    }
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title="Top 10 Productos del período">
                    {(topProductos?.productos ?? []).length === 0
                      ? <Text type="secondary">Sin datos para el período seleccionado</Text>
                      : (
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={(topProductos?.productos ?? []).slice(0, 8).map((p: any) => ({
                              name: (p.nombre ?? p.label ?? '').slice(0, 18),
                              total: Number(p.total ?? 0),
                            }))} layout="vertical">
                              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                              <ChartTooltip formatter={(v: number) => [fmt.money(v), 'Ingresos']} />
                              <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                                {(topProductos?.productos ?? []).slice(0, 8).map((_: any, i: number) => (
                                  <Cell key={i} fill={COLORES[i % COLORES.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )
                    }
                  </Card>
                </Col>
              </Row>
            </div>
          ),
        },

        /* ── ITBIS / FISCAL ── */
        {
          key: 'itbis', label: '🏛️ ITBIS / Fiscal',
          children: itbis ? (
            <div>
              <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 16 }}>
                <Col xs={12} sm="auto"><Select value={mes} onChange={setMes} style={{ width: '100%', minWidth: 120 }} options={MESES_OPT} /></Col>
                <Col xs={8} sm="auto"><Select value={anio} onChange={setAnio} style={{ width: '100%', minWidth: 90 }} options={ANIOS_OPT} /></Col>
                <Col>
                  <Button icon={<DownloadOutlined />} size="small"
                    onClick={() => exportarITBIS(itbis, mes, anio)}>
                    Excel ITBIS
                  </Button>
                </Col>
              </Row>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Card title="ITBIS Cobrado (Ventas)" size="small">
                    <Statistic value={itbis.ventas?.itbisCobrado ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#1677ff' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Base: {fmt.money(itbis.ventas?.montoGravado ?? 0)}</Text>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card title="ITBIS Crédito (Compras)" size="small">
                    <Statistic value={itbis.compras?.itbisPagado ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#52c41a' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Base: {fmt.money(itbis.compras?.montoGravado ?? 0)}</Text>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card title="Balance ITBIS DGII" size="small">
                    <Statistic value={itbis.resumenITBIS?.balance ?? 0}
                      suffix={<small style={{ fontSize: 12 }}>{itbis.resumenITBIS?.situacion}</small>}
                      formatter={v => fmt.money(Number(v))}
                      valueStyle={{ color: (itbis.resumenITBIS?.balance ?? 0) > 0 ? '#ff4d4f' : '#52c41a' }} />
                  </Card>
                </Col>
              </Row>
            </div>
          ) : <Spin />,
        },

        /* ── INVENTARIO ── */
        {
          key: 'inventario', label: '📦 Inventario',
          children: (
            <div>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {[
                  { label: 'Total productos',  value: stock?.resumen?.totalProductos ?? 0, money: false },
                  { label: 'Productos activos', value: stock?.resumen?.productosActivos ?? 0, money: false },
                  { label: 'Con stock bajo',    value: stock?.resumen?.productosBajoStock ?? 0, money: false, color: '#d97706' },
                  { label: 'Valor inventario',  value: valorInv?.valorTotal ?? 0, money: true },
                ].map(k => (
                  <Col xs={12} lg={6} key={k.label}>
                    <Card size="small">
                      <Statistic title={k.label} value={k.value}
                        formatter={v => k.money ? fmt.money(Number(v)) : v}
                        valueStyle={k.color ? { color: k.color } : undefined} />
                    </Card>
                  </Col>
                ))}
              </Row>

              <Card
                title="Productos con stock bajo o agotado"
                extra={
                  <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                    exportarInventario(stock?.productos ?? []);
                    message.info && message.info('Exportando inventario...');
                  }}>
                    Excel
                  </Button>
                }
              >
                <Table
                  dataSource={(stock?.productos ?? []).filter((p: any) => p.alerta)}
                  columns={[
                    { title: 'Código', dataIndex: 'codigo', width: 100 },
                    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
                    {
                      title: 'Stock', dataIndex: 'stock', width: 90,
                      render: (v: number) => (
                        <Text strong style={{ color: v === 0 ? '#ff4d4f' : '#fa8c16' }}>{v}</Text>
                      ),
                    },
                    { title: 'Mínimo', dataIndex: 'stockMinimo', width: 80 },
                    {
                      title: 'Diferencia', key: 'dif', width: 90,
                      render: (_: any, r: any) => (
                        <Tag color={r.stock === 0 ? 'red' : 'orange'}>
                          {r.stock - r.stockMinimo}
                        </Tag>
                      ),
                    },
                  ]}
                  size="small" rowKey="codigo" pagination={false}
                  locale={{ emptyText: '✅ Todo el inventario está en orden' }}
                />
              </Card>
            </div>
          ),
        },
        /* ── DGII 606 / 607 ── */
        {
          key: 'dgii', label: '🏛️ DGII 606/607',
          children: (
            <div>
              {/* Selector mes/año compartido */}
              <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 16 }}>
                <Col xs={12} sm="auto"><Select value={mes} onChange={setMes} style={{ width: '100%', minWidth: 120 }} options={MESES_OPT} /></Col>
                <Col xs={8} sm="auto"><Select value={anio} onChange={setAnio} style={{ width: '100%', minWidth: 90 }} options={ANIOS_OPT} /></Col>
              </Row>

              <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                message="Uso informativo"
                description="Este reporte es para verificación interna. Para someter la declaración oficial debes cargar el archivo TXT en la Oficina Virtual DGII (dgii.gov.do). Consulta con tu contador antes de declarar."
                style={{ marginBottom: 20 }}
              />

              {/* ── IT-1 (ITBIS) ── */}
              <Card
                title={<span style={{ fontWeight: 700 }}>IT-1 — Declaración ITBIS del mes</span>}
                style={{ marginBottom: 20 }}
                extra={
                  <Button
                    size="small"
                    icon={<FileExcelOutlined />}
                    disabled={!itbis}
                    onClick={() => itbis && exportarITBIS(itbis, mes, anio)}
                  >
                    Excel IT-1
                  </Button>
                }
              >
                {itbis ? (
                  <Row gutter={[16, 16]}>
                    {/* Columna Ventas */}
                    <Col xs={24} md={8}>
                      <Card size="small" title="A — Ventas" type="inner"
                        headStyle={{ background: token.colorInfoBg, fontWeight: 700 }}>
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Monto gravado</Text>
                          <Text strong>{fmt.money(itbis.ventas?.montoGravado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>ITBIS cobrado (18%)</Text>
                          <Text strong style={{ color: token.colorPrimary }}>{fmt.money(itbis.ventas?.itbisCobrado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between">
                          <Text type="secondary" style={{ fontSize: 12 }}>Total facturado</Text>
                          <Text strong>{fmt.money(itbis.ventas?.totalFacturado ?? 0)}</Text>
                        </Row>
                        <div style={{ marginTop: 8, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 6 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{itbis.ventas?.facturas ?? 0} facturas emitidas</Text>
                        </div>
                      </Card>
                    </Col>
                    {/* Columna Compras */}
                    <Col xs={24} md={8}>
                      <Card size="small" title="B — Compras (crédito)" type="inner"
                        headStyle={{ background: token.colorSuccessBg, fontWeight: 700 }}>
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Monto gravado</Text>
                          <Text strong>{fmt.money(itbis.compras?.montoGravado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>ITBIS crédito (18%)</Text>
                          <Text strong style={{ color: token.colorSuccess }}>{fmt.money(itbis.compras?.itbisPagado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between">
                          <Text type="secondary" style={{ fontSize: 12 }}>Total comprado</Text>
                          <Text strong>{fmt.money(itbis.compras?.totalComprado ?? 0)}</Text>
                        </Row>
                        <div style={{ marginTop: 8, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 6 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>{itbis.compras?.ordenes ?? 0} órdenes de compra</Text>
                        </div>
                      </Card>
                    </Col>
                    {/* Columna Balance */}
                    <Col xs={24} md={8}>
                      <Card
                        size="small"
                        title="C — Balance a pagar DGII"
                        type="inner"
                        headStyle={{
                          background: (itbis.resumenITBIS?.balance ?? 0) > 0 ? token.colorErrorBg : token.colorSuccessBg,
                          fontWeight: 700,
                        }}
                      >
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>ITBIS cobrado</Text>
                          <Text>{fmt.money(itbis.resumenITBIS?.cobrado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between" style={{ marginBottom: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>(-) Crédito compras</Text>
                          <Text style={{ color: token.colorSuccess }}>-{fmt.money(itbis.resumenITBIS?.pagado ?? 0)}</Text>
                        </Row>
                        <Row justify="space-between" style={{ marginTop: 8, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
                          <Text strong style={{ fontSize: 14 }}>ITBIS a pagar</Text>
                          <Text strong style={{
                            fontSize: 16,
                            color: (itbis.resumenITBIS?.balance ?? 0) > 0 ? token.colorError : token.colorSuccess,
                          }}>
                            {fmt.money(Math.abs(itbis.resumenITBIS?.balance ?? 0))}
                          </Text>
                        </Row>
                        <div style={{ marginTop: 8 }}>
                          <Tag color={(itbis.resumenITBIS?.balance ?? 0) > 0 ? 'red' : 'green'} style={{ fontWeight: 700 }}>
                            {itbis.resumenITBIS?.situacion ?? '—'}
                          </Tag>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                ) : <Spin />}
              </Card>

              {/* ── e-CF por estado ── */}
              {ecfEstado && (
                <Card
                  title={<span style={{ fontWeight: 700 }}>e-CF del mes — Estado DGII</span>}
                  style={{ marginBottom: 20 }}
                >
                  <Row gutter={[12, 12]}>
                    {[
                      { key: 'aceptado',         label: 'Aceptados',         color: token.colorSuccess,  bg: token.colorSuccessBg },
                      { key: 'pendiente',         label: 'Pendientes',        color: token.colorWarning,  bg: token.colorWarningBg },
                      { key: 'rechazado',         label: 'Rechazados',        color: token.colorError,    bg: token.colorErrorBg   },
                      { key: 'aceptado_condicion',label: 'Cond. Aceptados',  color: '#7c3aed',           bg: token.colorFillAlter  },
                    ].map(({ key, label, color, bg }) => {
                      const val = ecfEstado.resumenPorEstado?.[key] ?? 0;
                      return (
                        <Col xs={12} sm={6} key={key}>
                          <div style={{ background: bg, borderRadius: 8, padding: '12px 16px',
                            border: `1px solid ${token.colorBorderSecondary}` }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color }}>{val}</div>
                            <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>{label}</div>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                  {(ecfEstado.detallePorTipo ?? []).length > 0 && (
                    <Table
                      size="small"
        scroll={{ x: 'max-content' }}
                      dataSource={ecfEstado.detallePorTipo}
                      rowKey={(r: any) => `${r.estado}-${r.tipo}`}
                      pagination={false}
                      style={{ marginTop: 16 }}
                      columns={[
                        { title: 'Tipo e-CF', dataIndex: 'tipo', width: 100 },
                        {
                          title: 'Estado DGII', dataIndex: 'estado', width: 160,
                          render: (v: string) => {
                            const c: Record<string, string> = {
                              aceptado: 'success', rechazado: 'error',
                              pendiente: 'warning', aceptado_condicion: 'processing',
                            };
                            return <Badge status={(c[v] ?? 'default') as any} text={v} />;
                          },
                        },
                        { title: 'Cantidad', dataIndex: 'cantidad', width: 100, align: 'right' as const },
                      ]}
                    />
                  )}
                </Card>
              )}

              {/* ── Formulario 606 ── */}
              <Card
                title={
                  <Row justify="space-between" align="middle">
                    <Col>
                      <span style={{ fontWeight: 700 }}>Formulario 606 — Compras del mes</span>
                      {r606 && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>
                          {r606.totales?.compras ?? 0} compras · {fmt.money(r606.totales?.montoTotal ?? 0)}
                        </Tag>
                      )}
                    </Col>
                    <Col>
                      <Button
                        size="small"
                        icon={<FileExcelOutlined />}
                        loading={loading606}
                        disabled={!r606?.detalle?.length}
                        onClick={() => {
                          const filas = (r606?.detalle ?? []).map((r: any) => ({
                            'Fecha':              r.fecha?.split('T')[0] ?? r.fecha,
                            'RNC Proveedor':      r.rncProveedor ?? '',
                            'Nombre Proveedor':   r.nombreProveedor,
                            'N° CF Proveedor':    r.numCFProveedor ?? '',
                            'Monto Gravado':      Number(r.montoGravado),
                            'ITBIS':              Number(r.itbis),
                            'Total':              Number(r.total),
                          }));
                          exportarExcel(filas, `606-${anio}-${String(mes).padStart(2, '0')}`);
                          message.success('Exportado 606');
                        }}
                      >
                        Excel 606
                      </Button>
                    </Col>
                  </Row>
                }
                style={{ marginBottom: 20 }}
              >
                <Table
                  loading={loading606}
                  size="small"
        scroll={{ x: 'max-content' }}
                  dataSource={r606?.detalle ?? []}
                  rowKey={(r: any) => `${r.folio}-${r.fecha}`}
                  pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
                  locale={{ emptyText: 'Sin compras registradas para este mes' }}
                  summary={() => r606?.totales ? (
                    <Table.Summary.Row style={{ fontWeight: 700, background: token.colorFillAlter }}>
                      <Table.Summary.Cell index={0} colSpan={4}>Totales</Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right">
                        {fmt.money(r606.detalle?.reduce((a: number, r: any) => a + Number(r.montoGravado), 0) ?? 0)}
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Tag color="orange">{fmt.money(r606.totales.itbisPagado)}</Tag>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right">
                        <strong>{fmt.money(r606.totales.montoTotal)}</strong>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null}
                  columns={[
                    {
                      title: 'Fecha', dataIndex: 'fecha', width: 100,
                      render: (v: string) => v?.split('T')[0] ?? v,
                    },
                    {
                      title: 'RNC Proveedor', dataIndex: 'rncProveedor', width: 120,
                      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Proveedor', dataIndex: 'nombreProveedor', ellipsis: true,
                    },
                    {
                      title: 'N° CF', dataIndex: 'numCFProveedor', width: 130,
                      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Monto Gravado', dataIndex: 'montoGravado', width: 130, align: 'right' as const,
                      render: (v: number) => fmt.money(v),
                    },
                    {
                      title: 'ITBIS', dataIndex: 'itbis', width: 110, align: 'right' as const,
                      render: (v: number) => <Text style={{ color: '#d97706' }}>{fmt.money(v)}</Text>,
                    },
                    {
                      title: 'Total', dataIndex: 'total', width: 120, align: 'right' as const,
                      render: (v: number) => <Text strong>{fmt.money(v)}</Text>,
                    },
                  ]}
                />
              </Card>

              {/* ── Formulario 607 ── */}
              <Card
                title={
                  <Row justify="space-between" align="middle">
                    <Col>
                      <span style={{ fontWeight: 700 }}>Formulario 607 — Comprobantes Anulados</span>
                      {r607 && (
                        <Tag color="red" style={{ marginLeft: 8 }}>
                          {r607.totales?.comprobantesAnulados ?? 0} anulados
                        </Tag>
                      )}
                    </Col>
                    <Col>
                      <Button
                        size="small"
                        icon={<FileExcelOutlined />}
                        loading={loading607}
                        disabled={!r607?.detalle?.length}
                        onClick={() => {
                          const filas = (r607?.detalle ?? []).map((r: any) => ({
                            'NCF':              r.ncf,
                            'Fecha Emisión':    r.fecha?.split('T')[0] ?? r.fecha,
                            'Fecha Anulación':  r.fechaAnulacion?.split('T')[0] ?? '',
                            'RNC Receptor':     r.rncReceptor ?? '',
                            'Receptor':         r.nombreReceptor,
                            'Monto Anulado':    Number(r.montoAnulado),
                          }));
                          exportarExcel(filas, `607-${anio}-${String(mes).padStart(2, '0')}`);
                          message.success('Exportado 607');
                        }}
                      >
                        Excel 607
                      </Button>
                    </Col>
                  </Row>
                }
              >
                <Table
                  loading={loading607}
                  size="small"
        scroll={{ x: 'max-content' }}
                  dataSource={r607?.detalle ?? []}
                  rowKey={(r: any) => `${r.folio}-${r.fecha}`}
                  pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
                  locale={{ emptyText: '✅ Sin comprobantes anulados en este mes' }}
                  summary={() => r607?.totales?.comprobantesAnulados > 0 ? (
                    <Table.Summary.Row style={{ fontWeight: 700, background: token.colorErrorBg }}>
                      <Table.Summary.Cell index={0} colSpan={5}>Total anulado</Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right">
                        <Text strong style={{ color: '#dc2626' }}>{fmt.money(r607.totales.montoAnulado ?? 0)}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null}
                  columns={[
                    {
                      title: 'NCF', dataIndex: 'ncf', width: 160,
                      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Fecha Emisión', dataIndex: 'fecha', width: 110,
                      render: (v: string) => v?.split('T')[0] ?? v,
                    },
                    {
                      title: 'Fecha Anulación', dataIndex: 'fechaAnulacion', width: 130,
                      render: (v: string) => v?.split('T')[0] ?? '—',
                    },
                    {
                      title: 'RNC Receptor', dataIndex: 'rncReceptor', width: 120,
                      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '—'}</Text>,
                    },
                    {
                      title: 'Receptor', dataIndex: 'nombreReceptor', ellipsis: true,
                    },
                    {
                      title: 'Monto Anulado', dataIndex: 'montoAnulado', width: 130, align: 'right' as const,
                      render: (v: number) => <Text strong style={{ color: '#dc2626' }}>{fmt.money(v)}</Text>,
                    },
                  ]}
                />
              </Card>
            </div>
          ),
        },
      ]} />
    </div>
  );
}
