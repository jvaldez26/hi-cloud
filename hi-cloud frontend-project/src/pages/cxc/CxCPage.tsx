import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Tag, Space, Modal, Form, InputNumber, Select, Input,
  Typography, message, Card, Row, Col, Statistic, DatePicker, theme, Tooltip,
  Drawer, Divider, Alert, Tabs,
} from 'antd';
import {
  DollarOutlined, SearchOutlined, FileExcelOutlined, EyeOutlined,
  WhatsAppOutlined, FilterOutlined, HistoryOutlined, ClockCircleOutlined, PrinterOutlined,
  StopOutlined,
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
  const navigate         = useNavigate();
  const puedeCobrar      = useCanDo('cxc:cobrar');   // admin, contador, vendedor
  const [tabActivo, setTabActivo] = useState('cuentas');
  const [estado,  setEstado]  = useState<string | undefined>();
  const [search,  setSearch]  = useState('');
  const [rango,   setRango]   = useState<[Dayjs, Dayjs] | null>(null);
  const [page,    setPage]    = useState(1);
  const [pagoId,   setPagoId]  = useState<number | null>(null);
  const [pagoRow,  setPagoRow] = useState<CuentaPorCobrar | null>(null);
  const [histId,   setHistId]  = useState<number | null>(null);
  const [form]                = Form.useForm();
  const qc = useQueryClient();

  const { data: agingData = [], isLoading: loadingAging } = useQuery<any[]>({
    queryKey: ['cxc-aging'],
    queryFn:  cxcApi.aging,
    enabled:  tabActivo === 'aging',
  });

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
      search:     search || undefined,
    }),
  });

  const { data: resumen } = useQuery({
    queryKey: ['cxc-resumen'],
    queryFn:  cxcApi.resumen,
  });

  const pagoMut = useMutation({
    mutationFn: ({ id, monto, metodoPago, ref, fechaPago, tipoCambio }: { id: number; monto: number; metodoPago: MetodoPago; ref?: string; fechaPago?: string; tipoCambio?: number }) =>
      cxcApi.registrarPago(id, monto, metodoPago, ref, fechaPago, tipoCambio),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      setPagoId(null); setPagoRow(null); form.resetFields();
      message.success('Cobro registrado');
      const nuevoId: number | undefined = data?.data?.ultimoPagoId ?? data?.ultimoPagoId;
      if (nuevoId) {
        Modal.confirm({
          title: 'Cobro registrado',
          content: '¿Deseas imprimir el recibo de pago?',
          okText: 'Imprimir',
          cancelText: 'No',
          onOk: () => imprimirPagoCobrado(nuevoId),
        });
      }
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

  const imprimirPagoCobrado = (pagoId: number) => {
    cxcApi.getPagoPDF(pagoId)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch(() => message.error('No se pudo generar el recibo'));
  };

  // Anular recibo completo (pago vinculado a un ReciboCobro)
  const anularReciboCxCMut = useMutation({
    mutationFn: ({ reciboId, motivo }: { reciboId: number; motivo: string }) =>
      api.delete(`/recibos-cobro/${reciboId}`, { data: { motivo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cxc-pagos', histId] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      message.success('Recibo anulado y saldo revertido correctamente');
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? 'Error al anular recibo', 5),
  });

  // Anular pago directo (sin recibo asociado — pagos del flujo CxC o automáticos)
  const anularPagoCxCMut = useMutation({
    mutationFn: (pagoId: number) => api.delete(`/cxc/pagos/${pagoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cxc-pagos', histId] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      message.success('Pago anulado y saldo revertido correctamente');
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? 'Error al anular pago', 5),
  });

  const confirmarAnulacionPago = (pago: any) => {
    let motivo = '';
    const tieneRecibo = !!pago.reciboId;
    Modal.confirm({
      title: tieneRecibo ? '¿Anular este recibo de cobro?' : '¿Anular este pago?',
      icon: <StopOutlined style={{ color: '#EF4444' }} />,
      content: (
        <div>
          {tieneRecibo && (
            <p style={{ margin: '0 0 4px' }}>
              Recibo: <strong style={{ fontFamily: 'monospace' }}>{pago.reciboNumero}</strong>
            </p>
          )}
          <p style={{ margin: '0 0 8px' }}>
            Monto: <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(Number(pago.monto))}</strong>
          </p>
          <p style={{ color: '#EF4444', fontSize: 12, margin: '0 0 8px' }}>
            Esta acción revertirá el pago y actualizará el saldo pendiente de la cuenta por cobrar.
          </p>
          <Input.TextArea
            placeholder="Motivo de anulación (obligatorio)"
            rows={2}
            onChange={e => { motivo = e.target.value; }}
          />
        </div>
      ),
      okText: 'Anular',
      okButtonProps: { danger: true },
      cancelText: 'Cancelar',
      onOk: () => {
        if (!motivo.trim()) { message.warning('Debes ingresar un motivo'); return Promise.reject(); }
        if (tieneRecibo) {
          return anularReciboCxCMut.mutateAsync({ reciboId: pago.reciboId, motivo });
        }
        return anularPagoCxCMut.mutateAsync(pago.id);
      },
    });
  };

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
    { key: 'moneda',          label: 'Moneda',      defaultVisible: true  },
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
      render: (v: string, r: any) => {
        const cid = r.cliente?.id ?? r.clienteId;
        if (!cid) return <Text style={{ fontSize: 13 }}>{v ?? 'Consumidor Final'}</Text>;
        return (
          <Tooltip title="Ver estado de cuenta">
            <Typography.Link style={{ fontSize: 13 }} onClick={() => navigate(`/clientes/${cid}/estado-cuenta`)}>
              {v ?? 'Consumidor Final'}
              <EyeOutlined style={{ marginLeft: 5, fontSize: 11, opacity: 0.6 }} />
            </Typography.Link>
          </Tooltip>
        );
      },
    },
    {
      title: 'Total', key: 'montoOriginal', dataIndex: 'montoOriginal', width: 120, align: 'right' as const, isAmount: true,
      render: (v: number, r: any) => fmt.moneyM(v, r.moneda),
    },
    {
      title: 'Pendiente', key: 'montoPendiente', dataIndex: 'montoPendiente', width: 120, align: 'right' as const,
      render: (v: number, r: any) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>{fmt.moneyM(v, r.moneda)}</Text>
      ),
    },
    {
      title: 'Moneda', key: 'moneda', dataIndex: 'moneda', width: 68,
      render: (v: any) => {
        const m = v || 'DOP';
        return <Tag color={m === 'DOP' ? 'default' : 'gold'} style={{ fontSize: 11, fontWeight: 600, margin: 0, fontFamily: 'monospace' }}>{m}</Tag>;
      },
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

  // ─── Aging helpers ─────────────────────────────────────────────────────────
  const AGING_COLS = [
    { key: 'corriente', label: '0-30 días',   color: '#059669' },
    { key: 'dias30',    label: '31-60 días',  color: '#d97706' },
    { key: 'dias60',    label: '61-90 días',  color: '#ea580c' },
    { key: 'dias90',    label: '91-120 días', color: '#dc2626' },
    { key: 'masde120',  label: '+120 días',   color: '#7f1d1d' },
  ] as const;

  const agingTotals = agingData.reduce((acc: any, r: any) => {
    AGING_COLS.forEach(c => { acc[c.key] = (acc[c.key] ?? 0) + r[c.key]; });
    acc.total = (acc.total ?? 0) + r.total;
    return acc;
  }, {} as Record<string, number>);

  const agingColumns = [
    {
      title: 'Cliente', key: 'nombre', width: 200, ellipsis: true,
      render: (_: unknown, r: any) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.cliente?.nombre}</div>
          {r.cliente?.rnc && <div style={{ fontSize: 11, color: token.colorTextSecondary }}>RNC: {r.cliente.rnc}</div>}
        </div>
      ),
    },
    ...AGING_COLS.map(col => ({
      title: <span style={{ color: col.color, fontWeight: 700 }}>{col.label}</span>,
      key: col.key,
      dataIndex: col.key,
      width: 105,
      align: 'right' as const,
      render: (v: number) => v > 0
        ? <Text style={{ color: col.color, fontWeight: 700, fontFamily: 'monospace', fontSize: 11 }}>{fmt.money(v)}</Text>
        : <span style={{ color: token.colorTextQuaternary }}>—</span>,
    })),
    {
      title: 'Total', key: 'total', dataIndex: 'total', width: 130, align: 'right' as const,
      render: (v: number) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt.money(v)}</Text>,
    },
    {
      title: '', key: 'rec', width: 72, align: 'right' as const,
      render: (_: unknown, r: any) => (
        <Tooltip title="Recordatorio WhatsApp">
          <Button size="small" icon={<WhatsAppOutlined />} style={{ color: '#25d366', borderColor: '#25d366' }}
            onClick={() => {
              const msg = encodeURIComponent(`Estimado/a ${r.cliente.nombre}, le recordamos que tiene un saldo pendiente de ${fmt.money(r.total)} con nuestra empresa. Por favor comuníquese con nosotros para coordinar el pago. Gracias.`);
              window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
            }} />
        </Tooltip>
      ),
    },
  ];

  const handleAgingExcel = () => {
    const filas = agingData.map((r: any) => ({
      'Cliente':     r.cliente.nombre,
      'RNC':         r.cliente.rnc ?? '',
      '0-30 días':  r.corriente,
      '31-60 días': r.dias30,
      '61-90 días': r.dias60,
      '91-120 días':r.dias90,
      '+120 días':  r.masde120,
      'Total':       r.total,
    }));
    exportarExcel(filas, `Aging-CxC-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} clientes exportados`);
  };

  return (
    <div>
      <Tabs activeKey={tabActivo} onChange={setTabActivo}
        items={[{
          key: 'cuentas',
          label: <Space><DollarOutlined />Cuentas por Cobrar</Space>,
          children: (
      <Card>
        {/* Header + filtros */}
        <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 12 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>Cuentas por Cobrar</Title>
            {data?.meta && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {data.meta.total.toLocaleString('es-DO')} cuentas{hayFiltros ? ' (filtradas)' : ''}
              </Text>
            )}
          </Col>
          <Col xs={24} sm="auto">
            <Space wrap>
              <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
              <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
              <RefreshByKeyButton queryKey={['cxc']} />
              <VideoTutorialButton />
            </Space>
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
          columns={filterColumns(columns as any) as any} dataSource={rows} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{
            total: data?.meta.total, pageSize: 15, current: page,
            onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} cuentas`,
            showSizeChanger: false, size: 'small',
          }}
        />
      </Card>
          ),
        }, {
          key: 'aging',
          label: <Space><ClockCircleOutlined />Antigüedad de Saldos</Space>,
          children: (
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>Antigüedad de Saldos</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Saldos pendientes clasificados por antigüedad de la deuda</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<FileExcelOutlined />} onClick={handleAgingExcel} disabled={agingData.length === 0}>Excel</Button>
              <RefreshByKeyButton queryKey={['cxc-aging']} />
            </Space>
          </Col>
        </Row>
        <Table
          dataSource={agingData}
          columns={agingColumns as any}
          rowKey={(r: any) => r.cliente.nombre}
          loading={loadingAging}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
          summary={() => agingData.length > 0 ? (
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0}><Text strong>TOTALES</Text></Table.Summary.Cell>
              {AGING_COLS.map((col, i) => (
                <Table.Summary.Cell key={col.key} index={i + 1} align="right">
                  <Text strong style={{ color: col.color, fontFamily: 'monospace', fontSize: 11 }}>
                    {(agingTotals[col.key] ?? 0) > 0 ? fmt.money(agingTotals[col.key]) : '—'}
                  </Text>
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={AGING_COLS.length + 1} align="right">
                <Text strong style={{ fontFamily: 'monospace' }}>{fmt.money(agingTotals.total ?? 0)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={AGING_COLS.length + 2} />
            </Table.Summary.Row>
          ) : undefined}
        />
      </Card>
          ),
        }]}
      />

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
              { title: 'Monto',  dataIndex: 'monto', width: 120, align: 'right' as const, render: (v: number, r: any) => <Text strong style={{ color: '#059669' }}>{fmt.moneyM(v, r?.moneda ?? (pagoRow as any)?.moneda)}</Text> },
              { title: 'Método', dataIndex: 'metodoPago', width: 110, render: (v: string) => <Tag>{v}</Tag> },
              { title: 'Ref.',   dataIndex: 'referencia', ellipsis: true, render: (v: string) => v ?? '—' },
              {
                title: '', key: 'acciones', width: 76, align: 'center' as const,
                render: (_: unknown, r: any) => (
                  <Space size={4}>
                    <Tooltip title="Imprimir recibo">
                      <Button size="small" icon={<PrinterOutlined />} onClick={() => imprimirPagoCobrado(r.id)} />
                    </Tooltip>
                    <Tooltip title={r.reciboId ? `Anular ${r.reciboNumero}` : 'Anular pago'}>
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        loading={anularReciboCxCMut.isPending || anularPagoCxCMut.isPending}
                        onClick={() => confirmarAnulacionPago(r)}
                      />
                    </Tooltip>
                  </Space>
                ),
              },
            ]}
            summary={() => histPagos.length > 1 ? (
              <Table.Summary.Row style={{ fontWeight: 700 }}>
                <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: '#059669' }}>{fmt.moneyM(histPagos.reduce((a, p) => a + Number(p.monto), 0), (pagoRow as any)?.moneda)}</Text>
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
                <div><Text style={{ fontSize: 13 }}>{fmt.moneyM(pagoRow.montoOriginal, (pagoRow as any)?.moneda)}</Text></div>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Cobrado</Text>
                <div><Text style={{ fontSize: 13, color: '#059669' }}>{fmt.moneyM(pagoRow.montoPagado, (pagoRow as any)?.moneda)}</Text></div>
              </Col>
              <Col xs={24} sm={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Pendiente</Text>
                <div><Text strong style={{ fontSize: 13, color: '#dc2626' }}>{fmt.moneyM(pagoRow.montoPendiente, (pagoRow as any)?.moneda)}</Text></div>
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
          onFinish={v => pagoId && pagoMut.mutate({ id: pagoId, monto: v.monto, metodoPago: v.metodoPago, ref: v.referencia, fechaPago: v.fechaPago?.format('YYYY-MM-DD'), tipoCambio: v.tipoCambio ? Number(v.tipoCambio) : undefined })}
        >
          {(pagoRow as any)?.moneda && (pagoRow as any).moneda !== 'DOP' && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`Moneda: ${(pagoRow as any).moneda} — el monto se ingresa en ${(pagoRow as any).moneda}`} />
          )}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="monto" label={`Monto a cobrar${(pagoRow as any)?.moneda && (pagoRow as any).moneda !== 'DOP' ? ` (${(pagoRow as any).moneda})` : ''}`} rules={[{ required: true, message: 'Ingresa un monto' }]}>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0.01}
                  max={pagoRow ? Number(pagoRow.montoPendiente) : undefined}
                  precision={2}
                  addonBefore={(pagoRow as any)?.moneda === 'USD' ? 'US$' : (pagoRow as any)?.moneda === 'EUR' ? '€' : 'RD$'}
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
          {(pagoRow as any)?.moneda && (pagoRow as any).moneda !== 'DOP' && (
            <Form.Item noStyle shouldUpdate={(p, c) => p.monto !== c.monto || p.tipoCambio !== c.tipoCambio}>
              {({ getFieldValue }) => {
                const monto = Number(getFieldValue('monto') ?? 0);
                const tasa  = Number(getFieldValue('tipoCambio') ?? (pagoRow as any)?.tipoCambio ?? 1);
                const dop   = fmt.moneyM(monto * tasa, 'DOP');
                return (
                  <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="tipoCambio" label="Tasa de cambio del día (RD$)">
                        <InputNumber
                          style={{ width: '100%' }}
                          min={1} precision={4}
                          addonBefore="RD$" addonAfter={`por ${(pagoRow as any).moneda}1`}
                          defaultValue={Number((pagoRow as any)?.tipoCambio ?? 1)}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Equivalente en RD$">
                        <Text strong style={{ fontSize: 15, color: token.colorPrimary }}>{dop}</Text>
                      </Form.Item>
                    </Col>
                  </Row>
                );
              }}
            </Form.Item>
          )}
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
