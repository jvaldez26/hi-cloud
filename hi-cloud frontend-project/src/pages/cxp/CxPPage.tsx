import { useState, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Modal, Form, InputNumber, Select, Input,
  Typography, message, Card, Row, Col, Statistic, DatePicker, theme, Tooltip,
  Divider, Drawer,
} from 'antd';
import {
  DollarOutlined, SearchOutlined, FileExcelOutlined,
  FilterOutlined, HistoryOutlined,
} from '@ant-design/icons';
import api from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { cxpApi } from '../../api/cxp.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { CuentaPorPagar, MetodoPago } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS_CXP = ['pendiente', 'pagada_parcial', 'pagada', 'vencida', 'anulada'];

export default function CxPPage() {
  const { token } = theme.useToken();
  const [estado,  setEstado]  = useState<string | undefined>();
  const [search,  setSearch]  = useState('');
  const [rango,   setRango]   = useState<[Dayjs, Dayjs] | null>(null);
  const [page,    setPage]    = useState(1);
  const [pagoId,  setPagoId]  = useState<number | null>(null);
  const [pagoRow, setPagoRow] = useState<CuentaPorPagar | null>(null);
  const [histId,  setHistId]  = useState<number | null>(null);
  const [form]                = Form.useForm();
  const qc = useQueryClient();

  const hayFiltros = !!(search || estado || rango);

  const { data: histPagos = [], isFetching: loadingHist } = useQuery<any[]>({
    queryKey: ['cxp-pagos', histId],
    queryFn:  () => api.get(`/cxp/${histId}/pagos`).then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    enabled: !!histId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['cxp', page, estado, search, rango],
    queryFn:  () => cxpApi.list(page, 15, {
      estado,
      fechaDesde: rango?.[0].format('YYYY-MM-DD'),
      fechaHasta: rango?.[1].format('YYYY-MM-DD'),
    }),
  });

  const { data: resumen } = useQuery({
    queryKey: ['cxp-resumen'],
    queryFn:  cxpApi.resumen,
  });

  const pagoMut = useMutation({
    mutationFn: ({ id, monto, metodoPago, ref, fechaPago }: { id: number; monto: number; metodoPago: MetodoPago; ref?: string; fechaPago?: string }) =>
      cxpApi.registrarPago(id, monto, metodoPago, ref, fechaPago),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cxp'] });
      qc.invalidateQueries({ queryKey: ['cxp-resumen'] });
      setPagoId(null); setPagoRow(null); form.resetFields();
      message.success('Pago registrado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al registrar pago'),
  });

  const handleExcel = useCallback(async () => {
    const all = await cxpApi.list(1, 5000, { estado });
    const filas = (all?.data ?? []).map((c: CuentaPorPagar) => ({
      'Compra':      (c as any).compra?.folio ?? '',
      'Proveedor':   (c as any).proveedor?.nombre ?? '',
      'Total':       Number(c.montoOriginal ?? 0),
      'Pagado':      Number(c.montoPagado ?? 0),
      'Pendiente':   Number(c.montoPendiente ?? 0),
      'Vencimiento': c.fechaVencimiento ? dayjs(c.fechaVencimiento).format('DD/MM/YYYY') : '',
      'Estado':      c.estado,
    }));
    exportarExcel(filas, `CxP-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} cuentas exportadas`);
  }, [estado]);

  // Filtro local de búsqueda (backend no tiene search en CxP)
  const rows = (data?.data ?? []).filter((c: CuentaPorPagar) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c as any).compra?.folio?.toLowerCase().includes(s) ||
      (c as any).proveedor?.nombre?.toLowerCase().includes(s) ||
      (c as any).proveedor?.rnc?.includes(search)
    );
  });

  const columns = [
    {
      title: 'Compra', dataIndex: ['compra', 'folio'], width: 160,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Proveedor', dataIndex: ['proveedor', 'nombre'], ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Total', dataIndex: 'montoOriginal', width: 120, align: 'right' as const,
      render: (v: number) => fmt.money(v),
    },
    {
      title: 'Pagado', dataIndex: 'montoPagado', width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#059669' }}>{fmt.money(v)}</Text>,
    },
    {
      title: 'Pendiente', dataIndex: 'montoPendiente', width: 120, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>{fmt.money(v)}</Text>
      ),
    },
    {
      title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 112,
      render: (v: string) => {
        if (!v) return '—';
        const dias = dayjs(v).diff(dayjs(), 'day');
        const color = dias < 0 ? '#dc2626' : dias <= 7 ? '#d97706' : token.colorText;
        return <Text style={{ fontSize: 12, color }}>{fmt.date(v)}</Text>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => (
        <Tag color={estadoColor[v] ?? 'default'} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
          {v.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '', key: 'actions', width: 90, align: 'right' as const,
      render: (_: unknown, r: CuentaPorPagar) => (
        <Space size={4}>
          {r.estado !== 'pagada' && r.estado !== 'anulada' && (
            <Tooltip title="Registrar pago">
              <Button size="small" type="primary" icon={<DollarOutlined />}
                onClick={() => {
                  setPagoId(r.id);
                  setPagoRow(r);
                  form.setFieldsValue({ monto: Number(r.montoPendiente), fechaPago: dayjs() });
                }}
              />
            </Tooltip>
          )}
          <Tooltip title="Historial de pagos">
            <Button size="small" type="text" icon={<HistoryOutlined />}
              onClick={() => setHistId(r.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Por Pagar',          value: resumen?.totalPorPagar,    color: token.colorPrimary },
          { title: 'Vencido',            value: resumen?.totalVencido,     color: '#dc2626' },
          { title: 'Por Vencer (30 días)',value: resumen?.totalPorVencer30, color: '#d97706' },
          { title: 'Pagado este mes',    value: resumen?.pagadoEsteMes,    color: '#059669' },
        ].map(k => (
          <Col xs={12} lg={6} key={k.title}>
            <Card size="small">
              <Statistic
                title={<Text style={{ fontSize: 12 }}>{k.title}</Text>}
                value={k.value ?? 0}
                formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: k.color, fontSize: 18, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>Cuentas por Pagar</Title>
            {data?.meta && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {data.meta.total.toLocaleString('es-DO')} cuentas{hayFiltros ? ' (filtradas)' : ''}
              </Text>
            )}
          </Col>
          <Col>
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
          </Col>
        </Row>

        <Row gutter={[8, 8]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Buscar proveedor o compra..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6} md={5}>
            <Select placeholder="Estado" value={estado}
              onChange={v => { setEstado(v); setPage(1); }} allowClear style={{ width: '100%' }}>
              {ESTADOS_CXP.map(e => (
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
              format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Vence desde', 'Vence hasta']} />
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
          columns={columns} dataSource={rows} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{
            total: search ? rows.length : data?.meta.total,
            pageSize: 15, current: page,
            onChange: setPage,
            showTotal: t => `${t.toLocaleString('es-DO')} cuentas`,
            showSizeChanger: false, size: 'small',
          }}
        />
      </Card>

      {/* Drawer historial de pagos */}
      <Drawer
        title={<Space><HistoryOutlined />Historial de pagos</Space>}
        open={!!histId}
        onClose={() => setHistId(null)}
        width={480}
        loading={loadingHist}
      >
        {histPagos.length === 0 && !loadingHist ? (
          <Text type="secondary">Sin pagos registrados aún</Text>
        ) : (
          <Table
            size="small"
        scroll={{ x: 'max-content' }}
            dataSource={histPagos}
            rowKey="id"
            pagination={false}
            columns={[
              { title: 'Fecha',  dataIndex: 'fecha', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
              { title: 'Monto',  dataIndex: 'monto', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: '#dc2626' }}>{fmt.money(v)}</Text> },
              { title: 'Método', dataIndex: 'metodoPago', width: 110, render: (v: string) => <Tag>{v}</Tag> },
              { title: 'Ref.',   dataIndex: 'referencia', ellipsis: true, render: (v: string) => v ?? '—' },
            ]}
            summary={() => histPagos.length > 1 ? (
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>Total pagado</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: '#dc2626' }}>{fmt.money(histPagos.reduce((a, p) => a + Number(p.monto), 0))}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} />
              </Table.Summary.Row>
            ) : null}
          />
        )}
      </Drawer>

      {/* Modal pago */}
      <Modal
        title={<Space><DollarOutlined style={{ color: '#dc2626' }} /><span>Registrar Pago</span></Space>}
        open={!!pagoId}
        onCancel={() => { setPagoId(null); setPagoRow(null); form.resetFields(); }}
        footer={null}
        width={480}
        destroyOnClose
      >
        {pagoRow && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14 }}>
              {(pagoRow as any).proveedor?.nombre ?? '—'}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
              {(pagoRow as any).compra?.folio ?? '—'}
            </Text>
            <Row gutter={8} style={{ marginTop: 10 }}>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                <div><Text style={{ fontSize: 13 }}>{fmt.money(pagoRow.montoOriginal)}</Text></div>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Pagado</Text>
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
              <Form.Item name="monto" label="Monto a pagar" rules={[{ required: true, message: 'Ingresa un monto' }]}>
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
              <Form.Item name="fechaPago" label="Fecha de pago" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true, message: 'Selecciona un método' }]}>
            <Select size="large">
              {[
                { v: 'efectivo',      l: 'Efectivo' },
                { v: 'transferencia', l: 'Transferencia bancaria' },
                { v: 'cheque',        l: 'Cheque' },
                { v: 'tarjeta',       l: 'Tarjeta' },
                { v: 'otro',          l: 'Otro' },
              ].map(({ v, l }) => <Option key={v} value={v}>{l}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="referencia" label="Referencia (N° cheque, código de transferencia...)">
            <Input placeholder="Ej: CHQ-0012345 o referencia bancaria" />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col>
              <Button onClick={() => { setPagoId(null); setPagoRow(null); form.resetFields(); }}>
                Cancelar
              </Button>
            </Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={pagoMut.isPending} icon={<DollarOutlined />}
                danger>
                Confirmar pago
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
