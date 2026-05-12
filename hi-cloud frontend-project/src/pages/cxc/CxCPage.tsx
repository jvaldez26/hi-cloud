import { useState, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Modal, Form, InputNumber, Select, Input,
  Typography, message, Card, Row, Col, Statistic, DatePicker, theme, Tooltip,
} from 'antd';
import {
  DollarOutlined, SearchOutlined, FileExcelOutlined,
  WhatsAppOutlined, FilterOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { cxcApi } from '../../api/cxc.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { CuentaPorCobrar, MetodoPago } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';
import api from '../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS_CXC = ['pendiente', 'pagada_parcial', 'pagada', 'vencida', 'anulada'];

export default function CxCPage() {
  const { token } = theme.useToken();
  const [estado,  setEstado]  = useState<string | undefined>();
  const [search,  setSearch]  = useState('');
  const [rango,   setRango]   = useState<[Dayjs, Dayjs] | null>(null);
  const [page,    setPage]    = useState(1);
  const [pagoId,  setPagoId]  = useState<number | null>(null);
  const [form]                = Form.useForm();
  const qc = useQueryClient();

  const hayFiltros = !!(search || estado || rango);

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
    mutationFn: ({ id, monto, metodoPago, ref }: { id: number; monto: number; metodoPago: MetodoPago; ref?: string }) =>
      cxcApi.registrarPago(id, monto, metodoPago, ref),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      setPagoId(null); form.resetFields();
      message.success('Cobro registrado');
    },
    onError: () => message.error('Error al registrar cobro'),
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

  const columns = [
    {
      title: 'Factura', dataIndex: ['factura', 'folio'], width: 150,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Cliente', dataIndex: ['cliente', 'nombre'], ellipsis: true,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v ?? 'Consumidor Final'}</Text>,
    },
    {
      title: 'Total', dataIndex: 'montoOriginal', width: 120, align: 'right' as const,
      render: (v: number) => fmt.money(v),
    },
    {
      title: 'Cobrado', dataIndex: 'montoPagado', width: 110, align: 'right' as const,
      render: (v: number) => <Text style={{ color: '#059669' }}>{fmt.money(v)}</Text>,
    },
    {
      title: 'Pendiente', dataIndex: 'montoPendiente', width: 120, align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>{fmt.money(v)}</Text>
      ),
    },
    {
      title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 110,
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
      title: '', key: 'actions', width: 100, align: 'right' as const,
      render: (_: unknown, r: CuentaPorCobrar) => (
        <Space size={4}>
          {r.estado !== 'pagada' && r.estado !== 'anulada' && (
            <Tooltip title="Registrar cobro">
              <Button size="small" type="primary" icon={<DollarOutlined />}
                onClick={() => { setPagoId(r.id); form.setFieldsValue({ monto: Number(r.montoPendiente) }); }}
              />
            </Tooltip>
          )}
          <Tooltip title="Recordatorio WhatsApp">
            <Button size="small" type="text"
              icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              onClick={() => abrirWhatsApp(r)}
            />
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
          { title: 'Por Cobrar',          value: resumen?.totalPorCobrar,   color: token.colorPrimary },
          { title: 'Vencido',             value: resumen?.totalVencido,     color: '#dc2626' },
          { title: 'Por Vencer (30 días)',value: resumen?.totalPorVencer30, color: '#d97706' },
          { title: 'Cobrado este mes',    value: resumen?.cobradoEsteMes,   color: '#059669' },
        ].map(k => (
          <Col xs={12} lg={6} key={k.title}>
            <Card size="small">
              <Statistic title={<Text style={{ fontSize: 12 }}>{k.title}</Text>}
                value={k.value ?? 0}
                formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: k.color, fontSize: 18, fontWeight: 700 }} />
            </Card>
          </Col>
        ))}
      </Row>

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
          columns={columns} dataSource={rows} rowKey="id"
          loading={isLoading} size="small"
          pagination={{
            total: data?.meta.total, pageSize: 15, current: page,
            onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} cuentas`,
            showSizeChanger: false, size: 'small',
          }}
        />
      </Card>

      {/* Modal cobro */}
      <Modal title="Registrar Cobro" open={!!pagoId}
        onCancel={() => { setPagoId(null); form.resetFields(); }} footer={null} destroyOnClose>
        <Form form={form} layout="vertical"
          onFinish={v => pagoId && pagoMut.mutate({ id: pagoId, monto: v.monto, metodoPago: v.metodoPago, ref: v.referencia })}>
          <Form.Item name="monto" label="Monto a cobrar" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} prefix="RD$" size="large" />
          </Form.Item>
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true }]}>
            <Select>
              {['efectivo','transferencia','cheque','tarjeta','otro'].map(v => (
                <Option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="referencia" label="Referencia (opcional)">
            <Input placeholder="N° cheque, código de transferencia..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setPagoId(null); form.resetFields(); }}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={pagoMut.isPending}>
                Registrar cobro
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
