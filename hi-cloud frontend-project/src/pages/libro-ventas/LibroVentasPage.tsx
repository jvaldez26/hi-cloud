import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Table, Typography, Button,
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

  const VENTAS_COLS_DEF = [
    { key: 'fecha',         label: 'Fecha',          defaultVisible: true  },
    { key: 'folio',         label: 'Folio',          defaultVisible: true  },
    { key: 'tipoNcf',       label: 'Tipo NCF',       defaultVisible: true  },
    { key: 'encf',          label: 'e-NCF',          defaultVisible: true  },
    { key: 'clienteNombre', label: 'Cliente',        defaultVisible: true  },
    { key: 'rncCliente',    label: 'RNC',            defaultVisible: false },
    { key: 'subtotal',      label: 'Subtotal',       defaultVisible: false },
    { key: 'iva',           label: 'ITBIS',          defaultVisible: true  },
    { key: 'total',         label: 'Total',          defaultVisible: true  },
  ];
  const COMPRAS_COLS_DEF = [
    { key: 'fecha',           label: 'Fecha',          defaultVisible: true  },
    { key: 'folio',           label: 'Folio',          defaultVisible: true  },
    { key: 'encf',            label: 'e-NCF E41',      defaultVisible: true  },
    { key: 'proveedorNombre', label: 'Proveedor',      defaultVisible: true  },
    { key: 'rncProveedor',    label: 'RNC',            defaultVisible: false },
    { key: 'subtotal',        label: 'Subtotal',       defaultVisible: false },
    { key: 'iva',             label: 'ITBIS',          defaultVisible: true  },
    { key: 'total',           label: 'Total',          defaultVisible: true  },
  ];
  const { visibleColumns: vcVentas,  updateVisibility: setVcVentas,  filterColumns: fcVentas  } = useColumnVisibility('libro-ventas-ventas',  VENTAS_COLS_DEF);
  const { visibleColumns: vcCompras, updateVisibility: setVcCompras, filterColumns: fcCompras } = useColumnVisibility('libro-ventas-compras', COMPRAS_COLS_DEF);

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
            <ColumnToggle
              columns={tabActiva === 'ventas' ? VENTAS_COLS_DEF : COMPRAS_COLS_DEF}
              visibleColumns={tabActiva === 'ventas' ? vcVentas : vcCompras}
              onChange={tabActiva === 'ventas' ? setVcVentas : setVcCompras}
            />
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
                  columns={fcVentas([
                    { title: 'Fecha',    dataIndex: 'fecha',         key: 'fecha',         width: 95 },
                    { title: 'Folio',    dataIndex: 'folio',         key: 'folio',         width: 140, render: v => <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Text> },
                    { title: 'Tipo NCF', dataIndex: 'tipoNcf',       key: 'tipoNcf',       width: 70, render: v => <Tag color={TIPO_NCF_COLOR[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
                    { title: 'e-NCF',    dataIndex: 'encf',          key: 'encf',          width: 150,
                      render: (v: string, r: any) => v
                        ? <Space size={4}>
                            <Text code style={{ fontSize: 10 }}>{v}</Text>
                            {r.encfEstado && <EcfBadge estado={r.encfEstado as EstadoEcf} small />}
                          </Space>
                        : <Text type="secondary" style={{ fontSize: 11 }}>Sin e-CF</Text>
                    },
                    { title: 'Cliente', dataIndex: 'clienteNombre', key: 'clienteNombre', ellipsis: true },
                    { title: 'RNC',     dataIndex: 'rncCliente',    key: 'rncCliente',    width: 110, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    { title: 'Subtotal', dataIndex: 'subtotal',     key: 'subtotal',      align: 'right', render: v => fmt(v) },
                    { title: 'ITBIS',   dataIndex: 'iva',           key: 'iva',           align: 'right', render: v => fmt(v) },
                    { title: 'Total',   dataIndex: 'total',         key: 'total',         align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
                  ])}
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
                  columns={fcCompras([
                    { title: 'Fecha',     dataIndex: 'fecha',           key: 'fecha',           width: 95 },
                    { title: 'Folio',     dataIndex: 'folio',           key: 'folio',           width: 140, render: v => <Text strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Text> },
                    { title: 'e-NCF E41', dataIndex: 'encf',            key: 'encf',            width: 150,
                      render: (v: string, r: any) => v
                        ? <Space size={4}>
                            <Text code style={{ fontSize: 10 }}>{v}</Text>
                            {r.encfEstado && <EcfBadge estado={r.encfEstado as EstadoEcf} small />}
                          </Space>
                        : <Text type="secondary" style={{ fontSize: 11 }}>Sin e-CF</Text>
                    },
                    { title: 'Proveedor', dataIndex: 'proveedorNombre', key: 'proveedorNombre', ellipsis: true },
                    { title: 'RNC',       dataIndex: 'rncProveedor',    key: 'rncProveedor',    width: 110, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '—'}</Text> },
                    { title: 'Subtotal',  dataIndex: 'subtotal',        key: 'subtotal',        align: 'right', render: v => fmt(v) },
                    { title: 'ITBIS',     dataIndex: 'iva',             key: 'iva',             align: 'right', render: v => fmt(v) },
                    { title: 'Total',     dataIndex: 'total',           key: 'total',           align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
                  ])}
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
