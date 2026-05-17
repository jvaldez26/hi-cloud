import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Table, Typography, Statistic, Button,
  Space, Tag, DatePicker, Select, theme, Tabs, Divider,
} from 'antd';
import { BookOutlined, DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import EcfBadge, { type EstadoEcf } from '../../components/ui/EcfBadge';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const TIPO_NCF_COLOR: Record<string, string> = {
  E31: 'blue', E32: 'green', E33: 'orange', E34: 'purple',
  E44: 'cyan', E45: 'geekblue', E46: 'lime', E47: 'magenta',
};

function exportarCSV(data: any[], nombre: string, cols: string[]) {
  const rows = [
    cols.join(','),
    ...data.map(r => cols.map(c => `"${r[c] ?? ''}"`).join(',')),
  ].join('\n');
  const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `${nombre}-${dayjs().format('YYYY-MM-DD')}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function LibroVentasPage() {
  const { token } = theme.useToken();
  const hoy        = dayjs();
  const inicioMes  = dayjs().startOf('month');
  const [tabActiva, setTabActiva] = useState('ventas');
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([inicioMes, hoy]);
  const [tipoNcf, setTipoNcf]   = useState<string | undefined>();

  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  const { data: ventas, isLoading: loadingV } = useQuery<any>({
    queryKey: ['libro-ventas', desde, hasta, tipoNcf],
    queryFn:  () => api.get(`/libro-ventas/ventas?desde=${desde}&hasta=${hasta}${tipoNcf ? `&tipoNcf=${tipoNcf}` : ''}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  tabActiva === 'ventas',
  });

  const { data: compras, isLoading: loadingC } = useQuery<any>({
    queryKey: ['libro-compras', desde, hasta],
    queryFn:  () => api.get(`/libro-ventas/compras?desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  tabActiva === 'compras',
  });

  const registros = tabActiva === 'ventas' ? (ventas?.registros ?? []) : (compras?.registros ?? []);
  const totales   = tabActiva === 'ventas' ? ventas?.totales : compras?.totales;
  const porNcf    = ventas?.porTipoNcf ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BookOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Libro de Ventas & Compras</Title>
            <Text type="secondary">Registro formal de ingresos y egresos · Compatible DGII</Text>
          </div>
        </div>
        <Space>
          <RangePicker
            value={rango}
            onChange={v => v && setRango(v as [dayjs.Dayjs, dayjs.Dayjs])}
            format="DD/MM/YYYY"
          />
          {tabActiva === 'ventas' && (
            <Select allowClear placeholder="Tipo NCF" value={tipoNcf} onChange={setTipoNcf} style={{ width: 100 }}>
              {['E31','E32','E33','E34','E44','E45'].map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          )}
          <Button icon={<FileExcelOutlined />}
            onClick={() => {
              const filas = registros.map((r: any) => tabActiva === 'ventas' ? ({
                'Fecha':   r.fecha,
                'Folio':   r.folio,
                'Tipo NCF': r.tipoNcf,
                'e-NCF':   r.encf ?? '',
                'Estado e-CF': r.encfEstado ?? '',
                'Cliente': r.clienteNombre,
                'RNC':     r.rncCliente,
                'Subtotal': Number(r.subtotal),
                'ITBIS':   Number(r.iva),
                'Total':   Number(r.total),
                'Estado Factura': r.estado,
              }) : ({
                'Fecha':     r.fecha,
                'Folio':     r.folio,
                'e-NCF':     r.encf ?? '',
                'Estado e-CF': r.encfEstado ?? '',
                'Proveedor': r.proveedorNombre,
                'RNC':       r.rncProveedor,
                'Subtotal':  Number(r.subtotal),
                'ITBIS':     Number(r.iva),
                'Total':     Number(r.total),
                'Estado':    r.estado,
              }));
              exportarExcel(filas, tabActiva === 'ventas' ? 'Libro-Ventas' : 'Libro-Compras');
            }}>Excel</Button>
            <RefreshByKeyButton queryKey={['libro-ventas']} />
            <VideoTutorialButton />
          <Button icon={<DownloadOutlined />}
            onClick={() => {
              if (tabActiva === 'ventas') {
                exportarCSV(registros, 'libro-ventas', ['fecha','folio','tipoNcf','encf','encfEstado','clienteNombre','rncCliente','subtotal','iva','total','estado']);
              } else {
                exportarCSV(registros, 'libro-compras', ['fecha','folio','encf','encfEstado','proveedorNombre','rncProveedor','subtotal','iva','total','estado']);
              }
            }}>
            CSV
          </Button>
        </Space>
      </div>

      {/* KPI Cards por tipo NCF — solo en ventas */}
      {tabActiva === 'ventas' && porNcf.length > 0 && (
        <Row gutter={[10, 10]} style={{ marginBottom: 20 }}>
          {porNcf.map((n: any) => (
            <Col key={n.tipo} xs={12} sm={8} md={4}>
              <Card bordered={false} size="small" style={{ borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
                <Tag color={TIPO_NCF_COLOR[n.tipo] ?? 'default'} style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {n.tipo}
                </Tag>
                <Text strong style={{ fontSize: 13, display: 'block' }}>{fmt(n.total)}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{n.cantidad} docto(s)</Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* KPIs totales */}
      {totales && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={8}>
            <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
              <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Subtotal Gravado</span>}
                value={totales.subtotal ?? 0} formatter={v => fmt(Number(v))}
                valueStyle={{ color: '#fff', fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={8}>
            <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
              <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>ITBIS</span>}
                value={totales.iva ?? 0} formatter={v => fmt(Number(v))}
                valueStyle={{ color: '#fff', fontSize: 18 }} />
            </Card>
          </Col>
          <Col xs={8}>
            <Card bordered={false} style={{ borderRadius: 10, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
              <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Total {tabActiva === 'ventas' ? 'Ingresos' : 'Egresos'}</span>}
                value={totales.total ?? 0} formatter={v => fmt(Number(v))}
                valueStyle={{ color: '#fff', fontSize: 18 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tabActiva}
          onChange={setTabActiva}
          items={[
            {
              key: 'ventas',
              label: `📋 Libro de Ventas${ventas?.totales?.cantidad ? ` (${ventas.totales.cantidad})` : ''}`,
              children: (
                <Table
                  dataSource={registros}
                  rowKey={(_, i) => String(i)}
                  loading={loadingV}
                  size="small"
                  pagination={{ pageSize: 25 }}
                  scroll={{ x: 900 }}
                  columns={[
                    { title: 'Fecha',    dataIndex: 'fecha',         key: 'f',  width: 95 },
                    { title: 'Folio',    dataIndex: 'folio',         key: 'fo', width: 140, render: v => <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Text> },
                    { title: 'Tipo NCF', dataIndex: 'tipoNcf',       key: 'n',  width: 70, render: v => <Tag color={TIPO_NCF_COLOR[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
                    { title: 'e-NCF',    dataIndex: 'encf',          key: 'en', width: 150,
                      render: (v: string, r: any) => v
                        ? <Space size={4}>
                            <Text code style={{ fontSize: 10 }}>{v}</Text>
                            {r.encfEstado && <EcfBadge estado={r.encfEstado as EstadoEcf} small />}
                          </Space>
                        : <Text type="secondary" style={{ fontSize: 11 }}>Sin e-CF</Text>
                    },
                    { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', ellipsis: true },
                    { title: 'RNC',     dataIndex: 'rncCliente',    key: 'r', width: 110, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    { title: 'Subtotal', dataIndex: 'subtotal',     key: 's', align: 'right', render: v => fmt(v) },
                    { title: 'ITBIS',   dataIndex: 'iva',           key: 'i', align: 'right', render: v => fmt(v) },
                    { title: 'Total',   dataIndex: 'total',         key: 't', align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
                  ]}
                  summary={() => totales ? (
                    <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
                      <Table.Summary.Cell index={0} colSpan={5}><Text strong>TOTALES — {totales.cantidad} documentos</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><Text strong>{fmt(totales.subtotal)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right"><Text strong>{fmt(totales.iva)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={7} align="right"><Text strong style={{ color: token.colorSuccess }}>{fmt(totales.total)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null}
                />
              ),
            },
            {
              key: 'compras',
              label: `🛒 Libro de Compras${compras?.totales?.cantidad ? ` (${compras.totales.cantidad})` : ''}`,
              children: (
                <Table
                  dataSource={registros}
                  rowKey={(_, i) => String(i)}
                  loading={loadingC}
                  size="small"
                  pagination={{ pageSize: 25 }}
                  columns={[
                    { title: 'Fecha',     dataIndex: 'fecha',           key: 'f',  width: 95 },
                    { title: 'Folio',     dataIndex: 'folio',           key: 'fo', width: 140, render: v => <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Text> },
                    { title: 'e-NCF E41', dataIndex: 'encf',            key: 'en', width: 150,
                      render: (v: string, r: any) => v
                        ? <Space size={4}>
                            <Text code style={{ fontSize: 10 }}>{v}</Text>
                            {r.encfEstado && <EcfBadge estado={r.encfEstado as EstadoEcf} small />}
                          </Space>
                        : <Text type="secondary" style={{ fontSize: 11 }}>Sin e-CF</Text>
                    },
                    { title: 'Proveedor', dataIndex: 'proveedorNombre', key: 'p', ellipsis: true },
                    { title: 'RNC',       dataIndex: 'rncProveedor',    key: 'r', width: 110, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    { title: 'Subtotal',  dataIndex: 'subtotal',        key: 's', align: 'right', render: v => fmt(v) },
                    { title: 'ITBIS',     dataIndex: 'iva',             key: 'i', align: 'right', render: v => fmt(v) },
                    { title: 'Total',     dataIndex: 'total',           key: 't', align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
                  ]}
                  summary={() => totales ? (
                    <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
                      <Table.Summary.Cell index={0} colSpan={4}><Text strong>TOTALES — {totales.cantidad} documentos</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right"><Text strong>{fmt(totales.subtotal)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><Text strong>{fmt(totales.iva)}</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: token.colorError }}>{fmt(totales.total)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  ) : null}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
