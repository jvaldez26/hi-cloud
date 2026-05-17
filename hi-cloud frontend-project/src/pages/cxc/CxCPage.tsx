import { useState, useCallback } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Tag, Space, Modal, Form, InputNumber, Select, Input,
  Typography, message, Card, Row, Col, Statistic, DatePicker, theme, Tooltip,
  Drawer, Divider,
} from 'antd';
import {
  DollarOutlined, SearchOutlined, FileExcelOutlined,
  WhatsAppOutlined, FilterOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { cxcApi } from '../../api/cxc.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { CuentaPorCobrar, MetodoPago } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';
import api from '../../api/client';
import { useCanDo } from '../../hooks/useCanDo';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS_CXC = ['pendiente', 'pagada_parcial', 'pagada', 'vencida', 'anulada'];

export default function CxCPage() {
  const { token }        = theme.useToken();
  const puedeCobrar      = useCanDo('cxc:cobrar');   // admin, contador, vendedor
  const [estado,  setEstado]  = useState<string | undefined>();
  const [search,  setSearch]  = useState('');
  const [rango,   setRango]   = useState<[Dayjs, Dayjs] | null>(null);
  const [page,    setPage]    = useState(1);
  const [pagoId,   setPagoId]  = useState<number | null>(null);
  const [pagoRow,  setPagoRow] = useState<CuentaPorCobrar | null>(null);
  const [histId,   setHistId]  = useState<number | null>(null);
  const [form]                = Form.useForm();
  const qc = useQueryClient();

  const hayFiltros = !!(search || estado || rango);

  const { data: histPagos = [], isFetching: loadingHist } = useQuery<any[]>({
    queryKey: ['cxc-pagos', histId],
    queryFn:  () => api.get(`/cxc/${histId}/pagos`).then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    enabled: !!histId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['cxc', page, estado, search, rango],
    queryFn:  () => cxcApi.list(page, 15, {
      estado,
      fechaDesde: rango?.[0].format('YYYY-MM-DD'),
      fechaHasta: rango?.[1].format('YYYY-MM-DD'),
    }),
  });

  const { data: resumen } = useQuery({
    queryKey: ['cxc-resumen'],
    queryFn:  cxcApi.resumen,
  });

  const pagoMut = useMutation({
    mutationFn: ({ id, monto, metodoPago, ref, fechaPago }: { id: number; monto: number; metodoPago: MetodoPago; ref?: string; fechaPago?: string }) =>
      cxcApi.registrarPago(id, monto, metodoPago, ref, fechaPago),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      setPagoId(null); setPagoRow(null); form.resetFields();
      message.success('Cobro registrado');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message
        ?? e?.response?.data?.errors?.[0]
        ?? 'Error al registrar cobro';
      const status = e?.response?.status;
      if (status === 403) {
        message.error('No tienes permiso para registrar cobros. Contacta al administrador.');
      } else {
        message.error(msg, 5);
      }
    },
  });

  const handleExcel = useCallback(async () => {
    const all = await cxcApi.list(1, 5000, { estado });
    const filas = (all?.data ?? []).map((c: CuentaPorCobrar) => ({
      'Factura':       (c as any).factura?.folio ?? '',
      'Cliente':       (c as any).cliente?.nombre ?? '',
      'Total':         Number(c.montoOriginal ?? 0),
      'Cobrado':       Number(c.montoPagado ?? 0),
      'Pendiente':     Number(c.montoPendiente ?? 0),
      'Vencimiento':   c.fechaVencimiento ? dayjs(c.fechaVencimiento).format('DD/MM/YYYY') : '',
      'Estado':        c.estado,
    }));
    exportarExcel(filas, `CxC-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} cuentas exportadas`);
  }, [estado]);

  const abrirWhatsApp = (r: CuentaPorCobrar) => {
    api.get(`/comunicaciones/whatsapp/cxc/${r.id}`).then((res: any) => {
      const link = res.data?.data?.link ?? res.data?.link;
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    }).catch(() => message.error('No se pudo generar el mensaje'));
  };

  const rows = data?.data ?? [];

  const COLS_DEF = [
    { key: 'folio',           label: 'Factura',     defaultVisible: true  },
    { key: 'cliente',         label: 'Cliente',     defaultVisible: true  },
    { key: 'montoOriginal',   label: 'Total',       defaultVisible: false },
    { key: 'montoPendiente',  label: 'Pendiente',   defaultVisible: true  },
    { key: 'fechaVencimiento',label: 'Vencimiento', defaultVisible: true  },
    { key: 'estado',          label: 'Estado',      defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('cxc', COLS_DEF);

  const columns = [
    {
      title: 'Factura', key: 'folio', dataIndex: ['factura', 'folio'], width: 150,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Cliente', key: 'cliente', dataIndex: ['cliente', 'nombre'], ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v ?? 'Consumidor Final'}</Text>,
    },
    {
      title: 'Total', key: 'montoOriginal', dataIndex: 'montoOriginal', width: 120, align: 'right' as const, isAmount: true,
      render: (v: number) => fmt.money(v),
    },
    // Cobrado omitido — disponible en historial de cobros (ojo)
    {
      title: 'Pendiente', key: 'montoPendiente', dataIndex: 'montoPendiente', width: 120, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>{fmt.money(v)}</Text>
      ),
    },
    {
      title: 'Vencimiento', key: 'fechaVencimiento', dataIndex: 'fechaVencimiento', width: 110,
      render: (v: string) => {
        if (!v) return '—';
        const dias = dayjs(v).diff(dayjs(), 'day');
        const color = dias < 0 ? '#dc2626' : dias <= 7 ? '#d97706' : token.colorText;
        return <Text style={{ fontSize: 12, color }}>{fmt.date(v)}</Text>;
      },
    },
    {
      title: 'Estado', key: 'estado', dataIndex: 'estado', width: 120,
      render: (v: string) => (
        <Tag color={estadoColor[v] ?? 'default'} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
          {v.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '', key: 'actions', width: 100, align: 'right' as const,
      render: (_: unknown, r: CuentaPorCobrar) => (
        <TableActions
          onView={() => setHistId(r.id)}
          viewLabel="Historial de cobros"
          items={[
            ...(r.estado !== 'pagada' && r.estado !== 'anulada' && puedeCobrar ? [{
              key: 'cobro', label: 'Registrar cobro', icon: <DollarOutlined />,
              onClick: () => { setPagoId(r.id); setPagoRow(r); form.setFieldsValue({ monto: Number(r.montoPendiente), fechaPago: dayjs() }); },
            }] : []),
            { key: 'historial', label: 'Ver historial', icon: <HistoryOutlined />, onClick: () => setHistId(r.id) },
            { key: 'whatsapp', label: 'Recordatorio WhatsApp', icon: <WhatsAppOutlined />, onClick: () => abrirWhatsApp(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <Card>
        {/* Header + filtros */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>Cuentas por Cobrar</Title>
            {data?.meta && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {data.meta.total.toLocaleString('es-DO')} cuentas{hayFiltros ? ' (filtradas)' : ''}
              </Text>
            )}
          </Col>
          <Col>
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['cxc']} />
            <VideoTutorialButton />
          </Col>
        </Row>

        <Row gutter={[8, 8]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Buscar cliente o factura..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6} md={5}>
            <Select placeholder="Estado" value={estado}
              onChange={v => { setEstado(v); setPage(1); }} allowClear style={{ width: '100%' }}>
              {ESTADOS_CXC.map(e => (
                <Option key={e} value={e}>
                  <Tag color={estadoColor[e] ?? 'default'} style={{ margin: 0, fontSize: 11 }}>
                    {e.replace('_', ' ').toUpperCase()}
                  </Tag>
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} md={8}>
            <RangePicker value={rango} onChange={v => { setRango(v as [Dayjs, Dayjs] | null); setPage(1); }}
              format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Desde', 'Hasta']} />
          </Col>
          {hayFiltros && (
            <Col>
              <Button type="text" size="small" icon={<FilterOutlined />}
                onClick={() => { setSearch(''); setEstado(undefined); setRango(null); setPage(1); }}>
                Limpiar
              </Button>
            </Col>
          )}
        </Row>

        <Table
          columns={filterColumns(columns)} dataSource={rows} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{
            total: data?.meta.total, pageSize: 15, current: page,
            onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} cuentas`,
            showSizeChanger: false, size: 'small',
          }}
        />
      </Card>

      {/* Drawer historial de cobros */}
      <Drawer
        title={<Space><HistoryOutlined />Historial de cobros</Space>}
        open={!!histId}
        onClose={() => setHistId(null)}
        width={480}
        loading={loadingHist}
      >
        {histPagos.length === 0 && !loadingHist ? (
          <Text type="secondary">Sin cobros registrados aún</Text>
        ) : (
          <Table
            size="small"
        scroll={{ x: 'max-content' }}
            dataSource={histPagos}
            rowKey="id"
            pagination={false}
            columns={[
              { title: 'Fecha',  dataIndex: 'fecha', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
              { title: 'Monto',  dataIndex: 'monto', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: '#059669' }}>{fmt.money(v)}</Text> },
              { title: 'Método', dataIndex: 'metodoPago', width: 110, render: (v: string) => <Tag>{v}</Tag> },
              { title: 'Ref.',   dataIndex: 'referencia', ellipsis: true, render: (v: string) => v ?? '—' },
            ]}
            summary={() => histPagos.length > 1 ? (
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: '#059669' }}>{fmt.money(histPagos.reduce((a, p) => a + Number(p.monto), 0))}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} />
              </Table.Summary.Row>
            ) : null}
          />
        )}
      </Drawer>

      {/* Modal cobro */}
      <Modal
        title={
          <Space>
            <DollarOutlined style={{ color: '#059669' }} />
            <span>Registrar Cobro</span>
          </Space>
        }
        open={!!pagoId}
        onCancel={() => { setPagoId(null); setPagoRow(null); form.resetFields(); }}
        footer={null}
        destroyOnClose
        width={480}
      >
        {pagoRow && (
          <div style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14 }}>
              {(pagoRow as any).cliente?.nombre ?? 'Consumidor Final'}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
              {(pagoRow as any).factura?.folio ?? '—'}
            </Text>
            <Row gutter={8} style={{ marginTop: 10 }}>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                <div><Text style={{ fontSize: 13 }}>{fmt.money(pagoRow.montoOriginal)}</Text></div>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Cobrado</Text>
                <div><Text style={{ fontSize: 13, color: '#059669' }}>{fmt.money(pagoRow.montoPagado)}</Text></div>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Pendiente</Text>
                <div><Text strong style={{ fontSize: 13, color: '#dc2626' }}>{fmt.money(pagoRow.montoPendiente)}</Text></div>
              </Col>
            </Row>
            {pagoRow.fechaVencimiento && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Vencimiento: {fmt.date(pagoRow.fechaVencimiento)}
                  {dayjs(pagoRow.fechaVencimiento).isBefore(dayjs()) && (
                    <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>VENCIDA</Tag>
                  )}
                </Text>
              </div>
            )}
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={v => pagoId && pagoMut.mutate({ id: pagoId, monto: v.monto, metodoPago: v.metodoPago, ref: v.referencia, fechaPago: v.fechaPago?.format('YYYY-MM-DD') })}
        >
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="monto" label="Monto a cobrar" rules={[{ required: true, message: 'Ingresa un monto' }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0.01}
                  max={pagoRow ? Number(pagoRow.montoPendiente) : undefined}
                  precision={2}
                  addonBefore="RD$"
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v: any) => v?.replace(/,/g, '')}
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fechaPago" label="Fecha de cobro" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true, message: 'Selecciona un método' }]}>
            <Select size="large">
              {[
                { v: 'efectivo',      l: 'Efectivo' },
                { v: 'transferencia', l: 'Transferencia bancaria' },
                { v: 'tarjeta',       l: 'Tarjeta de crédito/débito' },
                { v: 'cheque',        l: 'Cheque' },
                { v: 'otro',          l: 'Otro' },
              ].map(({ v, l }) => <Option key={v} value={v}>{l}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="referencia" label="Referencia (opcional)">
            <Input placeholder="N° cheque, código de transferencia, confirmación..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col>
              <Button onClick={() => { setPagoId(null); setPagoRow(null); form.resetFields(); }}>
                Cancelar
              </Button>
            </Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={pagoMut.isPending} icon={<DollarOutlined />}>
                Confirmar cobro
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
