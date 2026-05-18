import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Table, Tag, Select, Typography, Statistic,
  Space, theme, Progress, Button, Tooltip,
} from 'antd';
import {
  DatabaseOutlined, DollarOutlined, BarChartOutlined, DownloadOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const COLORES = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#db2777','#65a30d'];

export default function ValoracionStockPage() {
  const { token } = theme.useToken();
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | undefined>();

  const { data: categorias = [] } = useQuery<string[]>({
    queryKey: ['vs-categorias'],
    queryFn: () => api.get('/valoracion-stock/categorias').then((r: any) => r.data?.data ?? r.data),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ['valoracion-stock', categoriaFiltro],
    queryFn: () => api.get(`/valoracion-stock${categoriaFiltro ? `?categoria=${categoriaFiltro}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  const lineas    = data?.lineas ?? [];
  const totales   = data?.totales ?? {};
  const porCat    = totales.valorPorCategoria ?? {};
  const chartData = Object.entries(porCat)
    .map(([nombre, valor]) => ({ nombre: nombre.slice(0, 14), valor: Number(valor) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const maxValor = Math.max(...lineas.map((l: any) => l.valorTotal), 1);

  const COLS_DEF = [
    { key: 'codigo',        label: 'Código',       defaultVisible: true  },
    { key: 'nombre',        label: 'Producto',     defaultVisible: true  },
    { key: 'stock',         label: 'Stock',        defaultVisible: true  },
    { key: 'costoPromedio', label: 'Costo Prom.',  defaultVisible: false },
    { key: 'valorTotal',    label: 'Valor Total',  defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('valoracion-stock', COLS_DEF);

  const exportarCSV = () => {
    const rows = [
      ['Código', 'Nombre', 'Categoría', 'Stock', 'Unidad', 'Costo Promedio', 'Valor Total'].join(','),
      ...lineas.map((l: any) =>
        [l.codigo, `"${l.nombre}"`, l.categoria ?? '', l.stock, l.unidadMedida, l.costoPromedio, l.valorTotal].join(',')
      ),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `valoracion-inventario-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DatabaseOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Valoración de Inventario</Title>
            <Text type="secondary">Método AVCO (Costo Promedio Ponderado) · Actualización automática</Text>
          </div>
        </div>
        <Space>
          <Select
            allowClear
            placeholder="Todas las categorías"
            style={{ width: 200 }}
            value={categoriaFiltro}
            onChange={setCategoriaFiltro}
          >
            {categorias.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Tooltip title="Exportar a CSV">
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = lineas.map((l: any) => ({
                'Código':          l.codigo ?? '',
                'Nombre':          l.nombre ?? '',
                'Categoría':       l.categoria ?? '',
                'Stock':           Number(l.stock ?? 0),
                'Unidad':          l.unidadMedida ?? '',
                'Costo Promedio':  Number(l.costoPromedio ?? 0),
                'Valor Total':     Number(l.valorTotal ?? 0),
              }));
              exportarExcel(filas, 'Valoracion-Stock');
            }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['valoracion']} />
            <VideoTutorialButton />
            <Button icon={<DownloadOutlined />} onClick={exportarCSV}>CSV</Button>
          </Tooltip>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {/* Gráfico por categoría */}
        {chartData.length > 0 && (
          <Col xs={24} lg={10}>
            <Card bordered={false} style={{ borderRadius: 12 }} title="Valor por Categoría">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                  <RechartsTip formatter={(v: number) => [fmt(v), 'Valor']} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}

        {/* Tabla detallada */}
        <Col xs={24} lg={chartData.length > 0 ? 14 : 24}>
          <Card bordered={false} style={{ borderRadius: 12 }} title="Detalle por Producto">
            <Table
              dataSource={lineas}
              rowKey="productoId"
              loading={isLoading}
              size="small"
        scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 15 }}
              columns={filterColumns([
                {
                  title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 90,
                  render: v => <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Tag>,
                },
                {
                  title: 'Producto', dataIndex: 'nombre', key: 'nombre',
                  render: (v, r: any) => (
                    <div>
                      <Text strong style={{ fontSize: 13 }}>{v}</Text>
                      {r.categoria && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.categoria}</Text></div>}
                    </div>
                  ),
                },
                {
                  title: 'Stock', dataIndex: 'stock', key: 'stock', align: 'right', width: 80,
                  render: (v, r: any) => (
                    <Text style={{ color: v <= 0 ? token.colorError : token.colorSuccess }}>
                      {Number(v).toLocaleString('es-DO')} {r.unidadMedida}
                    </Text>
                  ),
                },
                {
                  title: 'Costo Prom.', dataIndex: 'costoPromedio', key: 'costoPromedio', align: 'right', width: 110,
                  render: v => <Text>{fmt(v)}</Text>,
                },
                {
                  title: 'Valor Total', dataIndex: 'valorTotal', key: 'valorTotal', align: 'right', width: 130,
                  render: (v, r: any) => (
                    <div>
                      <Text strong style={{ color: token.colorPrimary }}>{fmt(v)}</Text>
                      <div style={{ marginTop: 2 }}>
                        <Progress
                          percent={Math.round((v / maxValor) * 100)}
                          showInfo={false}
                          size="small"
                          strokeColor={token.colorPrimary}
                        />
                      </div>
                    </div>
                  ),
                },
              ])}
              summary={() => (
                <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Text strong>TOTAL INVENTARIO</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ color: token.colorPrimary, fontSize: 14 }}>
                      {fmt(totales.valorTotal ?? 0)}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 12, marginTop: 16, background: token.colorFillAlter }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>¿Cómo funciona el AVCO?</strong> El Costo Promedio Ponderado se actualiza automáticamente cada vez
          que se recibe mercancía en una orden de compra. Fórmula:
          <code style={{ marginLeft: 8, padding: '2px 8px', background: token.colorBgContainer, borderRadius: 4 }}>
            Nuevo CP = (Stock actual × CP actual + Cantidad nueva × Costo nuevo) ÷ (Stock actual + Cantidad nueva)
          </code>
        </Text>
      </Card>
    </div>
  );
}
