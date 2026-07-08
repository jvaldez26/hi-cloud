import { useState, useCallback } from 'react';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Tag, Card, Row, Col, Typography, Select, Button,
  Modal, Form, InputNumber, Input, message, Space, DatePicker,
  Statistic, theme, Tooltip, Badge, Tabs, Alert, Popconfirm,
  Descriptions,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, SearchOutlined,
  FileExcelOutlined, FilterOutlined, WarningOutlined,
  PlusOutlined, BarcodeOutlined, InboxOutlined,
  ExclamationCircleOutlined, CheckCircleOutlined,
  EditOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { inventarioApi, type LotePayload, type SerialesPayload } from '../../api/inventario.api';
import { productosApi } from '../../api/productos.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { MovimientoInventario } from '../../types';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const TIPOS = ['entrada', 'salida', 'ajuste', 'devolucion', 'transferencia'];
const TIPO_COLOR: Record<string, string> = {
  entrada: 'green', salida: 'red', ajuste: 'blue',
  devolucion: 'orange', transferencia: 'purple',
};
const TIPO_ICON: Record<string, string> = {
  entrada: '📦', salida: '📤', ajuste: '⚖️', devolucion: '↩️', transferencia: '🔄',
};

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ESTADO_LOTE_COLOR: Record<string, string> = {
  activo: 'green', agotado: 'default', vencido: 'red', cuarentena: 'orange',
};
const ESTADO_SERIAL_COLOR: Record<string, string> = {
  disponible: 'green', vendido: 'blue', devuelto: 'orange',
  defectuoso: 'red', en_garantia: 'purple', dado_baja: 'default',
};

// ── Tab Movimientos ────────────────────────────────────────────────────────────
function MovimientosTab() {
  const { token } = theme.useToken();
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState('');
  const [tipo,      setTipo]      = useState<string | undefined>();
  const [rango,     setRango]     = useState<[Dayjs, Dayjs] | null>(null);
  const [mes,       setMes]       = useState<Dayjs | null>(dayjs());
  const [modoFecha, setModoFecha] = useState<'mes' | 'rango'>('mes');
  const [modal,     setModal]     = useState<'entrada' | 'salida' | 'ajuste' | null>(null);
  const [form]                    = Form.useForm();
  const qc = useQueryClient();

  // RD = UTC-4 sin DST → inicio/fin del mes seleccionado en hora local dominicana
  const desdeMes = mes ? new Date(Date.UTC(mes.year(), mes.month(), 1, 4, 0, 0, 0)).toISOString() : undefined;
  const hastaMes = mes ? new Date(Date.UTC(mes.year(), mes.month() + 1, 1, 3, 59, 59, 999)).toISOString() : undefined;

  const hayFiltros = !!(
    search || tipo ||
    modoFecha === 'rango' ||
    (modoFecha === 'mes' && mes && !mes.isSame(dayjs(), 'month'))
  );
  const filters = {
    search: search || undefined,
    tipo,
    desde: modoFecha === 'mes' ? desdeMes       : rango?.[0].format('YYYY-MM-DD'),
    hasta: modoFecha === 'mes' ? hastaMes        : rango?.[1].format('YYYY-MM-DD'),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['inventario', page, filters],
    queryFn:  () => inventarioApi.movimientos(page, 15, filters),
  });
const { data: productosData } = useQuery({
    queryKey: ['productos-inv'],
    queryFn:  () => productosApi.list(1, 2000, '', true),
  });

  const entradaMut = useMutation({
    mutationFn: ({ productoId, cantidad, motivo }: any) => inventarioApi.entrada(productoId, cantidad, motivo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventario'] }); qc.invalidateQueries({ queryKey: ['stock-bajo'] }); cerrarModal(); message.success('Entrada registrada'); },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'Error'),
  });
  const salidaMut = useMutation({
    mutationFn: ({ productoId, cantidad, motivo }: any) => inventarioApi.salida(productoId, cantidad, motivo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventario'] }); qc.invalidateQueries({ queryKey: ['stock-bajo'] }); cerrarModal(); message.success('Salida registrada'); },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'Stock insuficiente o error'),
  });

  const cerrarModal = () => { setModal(null); form.resetFields(); };
  const handleSubmit = (v: any) => {
    if (modal === 'entrada') entradaMut.mutate({ productoId: v.productoId, cantidad: v.cantidad, motivo: v.motivo });
    else salidaMut.mutate({ productoId: v.productoId, cantidad: v.cantidad, motivo: v.motivo });
  };

  const handleExcel = useCallback(async () => {
    const all = await inventarioApi.movimientos(1, 1000, filters);
    const filas = (all?.data ?? []).map((m: MovimientoInventario) => ({
      'Fecha': m.createdAt ? dayjs(m.createdAt).format('DD/MM/YYYY HH:mm') : '',
      'Tipo': m.tipo,
      'Producto': (m as any).producto?.nombre ?? '',
      'Código': (m as any).producto?.codigo ?? '',
      'Cantidad': Number(m.cantidad),
      'Anterior': Number((m as any).cantidadAnterior ?? 0),
      'Nuevo': Number((m as any).cantidadNueva ?? 0),
      'Motivo': m.motivo ?? '',
      'Referencia': m.referencia ?? '',
    }));
    exportarExcel(filas, `Inventario-Movimientos-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} movimientos exportados`);
  }, [filters]);

  const rows = data?.data ?? [];

  const COLS_DEF = [
    { key: 'createdAt',  label: 'Fecha',              defaultVisible: true  },
    { key: 'tipo',       label: 'Tipo',               defaultVisible: true  },
    { key: 'producto',   label: 'Producto',           defaultVisible: true  },
    { key: 'cantidad',   label: 'Cantidad',           defaultVisible: true  },
    { key: 'stock',      label: 'Stock ant. → nuevo', defaultVisible: true  },
    { key: 'motivo',     label: 'Motivo',             defaultVisible: false },
    { key: 'referencia', label: 'Referencia',         defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('inventario-movimientos', COLS_DEF);

  const columns = [
    { title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 130,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{dayjs(v).format('DD/MM/YY HH:mm')}</Text> },
    { title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 115,
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>{TIPO_ICON[v]} {v.toUpperCase()}</Tag> },
    { title: 'Producto', key: 'producto', ellipsis: true,
      render: (_: unknown, r: MovimientoInventario) => (
        <div>
          <Text style={{ fontSize: 13 }}>{(r as any).producto?.nombre ?? '—'}</Text>
          {(r as any).producto?.codigo && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>[{(r as any).producto.codigo}]</Text>}
        </div>
      ) },
    { title: 'Cantidad', dataIndex: 'cantidad', key: 'cantidad', width: 90, align: 'right' as const,
      render: (v: number, r: MovimientoInventario) => (
        <Text strong style={{ color: r.tipo === 'salida' ? '#dc2626' : r.tipo === 'entrada' ? '#059669' : token.colorText }}>
          {r.tipo === 'salida' ? '-' : '+'}{fmt.number(Math.abs(v))}
        </Text>
      ) },
    { title: 'Stock ant. → nuevo', key: 'stock', width: 150,
      render: (_: unknown, r: MovimientoInventario) => (
        <Text style={{ fontSize: 12 }}>
          {fmt.number((r as any).cantidadAnterior ?? 0)}
          <span style={{ margin: '0 4px', color: token.colorTextQuaternary }}>→</span>
          <Text strong style={{ color: token.colorPrimary }}>{fmt.number((r as any).cantidadNueva ?? 0)}</Text>
        </Text>
      ) },
    { title: 'Motivo', dataIndex: 'motivo', key: 'motivo', ellipsis: true, render: (v: string) => v ?? '—' },
    { title: 'Referencia', dataIndex: 'referencia', key: 'referencia', width: 110, render: (v: string) => v ?? '—' },
  ];

  return (
    <>
<Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {data?.meta?.total?.toLocaleString('es-DO') ?? 0} movimientos
            {modoFecha === 'mes' && mes
              ? ` — ${MESES_ES[mes.month()]} ${mes.year()}`
              : hayFiltros ? ' (filtrados)' : ''}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <RefreshByKeyButton queryKey={['inventario']} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <VideoTutorialButton />
            <Button icon={<UploadOutlined />} type="primary" onClick={() => { setModal('entrada'); form.resetFields(); }}>Entrada</Button>
            <Button icon={<DownloadOutlined />} danger onClick={() => { setModal('salida'); form.resetFields(); }}>Salida</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[8, 8]} style={{ marginBottom: 12 }} align="middle">
        <Col xs={24} sm={10} md={8}>
          <Input placeholder="Buscar producto, código, motivo..." prefix={<SearchOutlined />}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} allowClear />
        </Col>
        <Col xs={12} sm={5} md={4}>
          <Select placeholder="Tipo" value={tipo} onChange={v => { setTipo(v); setPage(1); }} allowClear style={{ width: '100%' }}>
            {TIPOS.map(t => <Option key={t} value={t}><Tag color={TIPO_COLOR[t]} style={{ margin: 0, fontSize: 11 }}>{TIPO_ICON[t]} {t.toUpperCase()}</Tag></Option>)}
          </Select>
        </Col>
        {modoFecha === 'mes' ? (
          <>
            <Col xs={10} sm={6} md={5}>
              <DatePicker
                picker="month"
                value={mes}
                onChange={v => { setMes(v); setPage(1); }}
                format="MMM YYYY"
                style={{ width: '100%' }}
                allowClear={false}
              />
            </Col>
            <Col xs={14} sm={3} md={3}>
              <Button type="link" size="small"
                onClick={() => { setModoFecha('rango'); setMes(null); setRango(null); setPage(1); }}>
                Rango ▸
              </Button>
            </Col>
          </>
        ) : (
          <>
            <Col xs={18} sm={7} md={8}>
              <RangePicker value={rango} onChange={v => { setRango(v as [Dayjs, Dayjs] | null); setPage(1); }}
                format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Desde', 'Hasta']} />
            </Col>
            <Col xs={6} sm={2} md={2}>
              <Button type="link" size="small"
                onClick={() => { setModoFecha('mes'); setMes(dayjs()); setRango(null); setPage(1); }}>
                ◂ Mes
              </Button>
            </Col>
          </>
        )}
        {hayFiltros && (
          <Col>
            <Button type="text" size="small" icon={<FilterOutlined />}
              onClick={() => { setSearch(''); setTipo(undefined); setRango(null); setMes(dayjs()); setModoFecha('mes'); setPage(1); }}>
              Limpiar
            </Button>
          </Col>
        )}
      </Row>

      <Table columns={filterColumns(columns)} dataSource={rows} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 15, current: page, onChange: setPage, showSizeChanger: false, size: 'small' }} />

      <Modal title={modal === 'entrada' ? '📦 Registrar Entrada' : '📤 Registrar Salida'}
        open={!!modal} onCancel={cerrarModal} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Buscar por nombre o código..."
              options={(productosData?.data ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre} (Stock: ${p.stock ?? 0})` }))} />
          </Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.0001} precision={2} placeholder="Ej: 10.5" />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo / Observación">
            <Input.TextArea rows={2} placeholder="Ej: Compra al proveedor, merma..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={cerrarModal}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" danger={modal === 'salida'} loading={entradaMut.isPending || salidaMut.isPending}>
              {modal === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Lotes ─────────────────────────────────────────────────────────────────
function LotesTab() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [form] = Form.useForm<LotePayload>();
  const qc = useQueryClient();

  const { data: lotes, isLoading } = useQuery({
    queryKey: ['lotes', estadoFiltro],
    queryFn: () => inventarioApi.lotes(undefined, estadoFiltro),
  });
  const { data: alertas } = useQuery({
    queryKey: ['lotes-alertas'],
    queryFn: inventarioApi.alertasLotes,
  });
  const { data: productosData } = useQuery({
    queryKey: ['productos-inv'],
    queryFn: () => productosApi.list(1, 2000, '', true),
  });

  const crearMut = useMutation({
    mutationFn: inventarioApi.crearLote,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lotes'] }); qc.invalidateQueries({ queryKey: ['lotes-alertas'] }); setOpen(false); form.resetFields(); message.success('Lote registrado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => inventarioApi.updateLote(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lotes'] }); message.success('Lote actualizado'); },
  });

  const diasParaVencer = (fecha: string) => {
    const diff = dayjs(fecha).diff(dayjs(), 'day');
    return diff;
  };

  const rows = (lotes ?? []).filter((l: any) =>
    !search || l.numeroLote?.toLowerCase().includes(search.toLowerCase()) || l.producto?.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { title: 'Lote', dataIndex: 'numeroLote', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => `${r.producto?.codigo ?? ''} — ${r.producto?.nombre ?? ''}` },
    { title: 'Disponible', dataIndex: 'cantidadDisponible', width: 100, align: 'right' as const,
      render: (v: number, r: any) => <Text strong style={{ color: v <= 0 ? '#dc2626' : undefined }}>{fmt.number(v)} / {fmt.number(r.cantidadInicial)}</Text> },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 130,
      render: (v: string) => {
        if (!v) return <Text type="secondary">Sin fecha</Text>;
        const dias = diasParaVencer(v);
        const color = dias < 0 ? 'red' : dias <= 30 ? 'orange' : 'default';
        return <Tooltip title={dias < 0 ? `Vencido hace ${Math.abs(dias)} días` : `Vence en ${dias} días`}>
          <Tag color={color}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
        </Tooltip>;
      } },
    { title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_LOTE_COLOR[v]}>{v?.toUpperCase()}</Tag> },
    { title: 'Proveedor', dataIndex: 'proveedor', ellipsis: true, render: (v: string) => v ?? '—' },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => {}}
          viewLabel="Ver lote"
          items={r.estado === 'activo' ? [
            { key: 'vencer', label: 'Marcar como vencido', icon: <WarningOutlined />, danger: true,
              onClick: () => Modal.confirm({
                title: '¿Marcar como vencido?',
                okText: 'Confirmar',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                onOk: () => updateMut.mutate({ id: r.id, body: { estado: 'vencido' } }),
              }) },
            { key: 'agotar', label: 'Marcar como agotado',
              onClick: () => Modal.confirm({
                title: '¿Marcar como agotado?',
                okText: 'Confirmar',
                cancelText: 'Cancelar',
                onOk: () => updateMut.mutate({ id: r.id, body: { estado: 'agotado' } }),
              }) },
          ] : []}
        />
      ) },
  ];

  const vencidos = alertas?.vencidos ?? [];
  const proximos = alertas?.proximosAVencer ?? [];

  return (
    <>
      {(vencidos.length > 0 || proximos.length > 0) && (
        <Row gutter={12} style={{ marginBottom: 12 }}>
          {vencidos.length > 0 && (
            <Col xs={24} md={12}>
              <Alert type="error" showIcon icon={<ExclamationCircleOutlined />}
                message={`${vencidos.length} lote(s) VENCIDO(S) con stock disponible`}
                description={vencidos.slice(0, 3).map((l: any) => `${l.numeroLote} — ${l.producto?.nombre}`).join(' | ')} />
            </Col>
          )}
          {proximos.length > 0 && (
            <Col xs={24} md={12}>
              <Alert type="warning" showIcon
                message={`${proximos.length} lote(s) vencen en ≤30 días`}
                description={proximos.slice(0, 3).map((l: any) => `${l.numeroLote} (${dayjs(l.fechaVencimiento).format('DD/MM')})`).join(' | ')} />
            </Col>
          )}
        </Row>
      )}

      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input placeholder="Buscar lote o producto..." prefix={<SearchOutlined />}
              value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: '100%', maxWidth: 250 }} />
            <Select placeholder="Estado" value={estadoFiltro} onChange={setEstadoFiltro} allowClear style={{ width: 130 }}>
              {['activo', 'agotado', 'vencido', 'cuarentena'].map(e => <Option key={e} value={e}>{e.toUpperCase()}</Option>)}
            </Select>
          </Space>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              exportarExcel((lotes ?? []).map((l: any) => ({
                'N° Lote': l.numeroLote, 'Producto': l.producto?.nombre,
                'Cantidad Inicial': Number(l.cantidadInicial), 'Disponible': Number(l.cantidadDisponible),
                'Fabricación': l.fechaFabricacion ? dayjs(l.fechaFabricacion).format('DD/MM/YYYY') : '',
                'Vencimiento': l.fechaVencimiento ? dayjs(l.fechaVencimiento).format('DD/MM/YYYY') : '',
                'Estado': l.estado, 'Proveedor': l.proveedor ?? '',
              })), 'Lotes-Inventario');
            }}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
              Nuevo lote
            </Button>
          </Space>
        </Col>
      </Row>

      <Table columns={cols} dataSource={rows} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 15 }} />

      <Modal title="Registrar lote / batch" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width="min(620px, 95vw)">
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}>
              <Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" placeholder="Seleccionar producto"
                  options={(productosData?.data ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="numeroLote" label="N° de Lote" rules={[{ required: true }]}>
                <Input placeholder="Ej. L2026-001" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.0001} precision={4} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="costoUnitario" label="Costo unit. (RD$)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaFabricacion" label="Fecha fabricación">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaVencimiento" label="Fecha vencimiento">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="proveedor" label="Proveedor">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="referencia" label="Referencia / OC">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Registrar lote</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Seriales ──────────────────────────────────────────────────────────────
function SerialesTab() {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [form] = Form.useForm();
  const [numerosTexto, setNumerosTexto] = useState('');
  const qc = useQueryClient();

  const { data: seriales, isLoading } = useQuery({
    queryKey: ['seriales', estadoFiltro, search],
    queryFn: () => inventarioApi.seriales(undefined, estadoFiltro, search || undefined),
  });
  const { data: resumen } = useQuery({
    queryKey: ['seriales-resumen'],
    queryFn: () => inventarioApi.resumenSeriales(),
  });
  const { data: productosData } = useQuery({
    queryKey: ['productos-inv'],
    queryFn: () => productosApi.list(1, 2000, '', true),
  });

  const registrarMut = useMutation({
    mutationFn: (body: SerialesPayload) => inventarioApi.registrarSeriales(body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['seriales'] }); qc.invalidateQueries({ queryKey: ['seriales-resumen'] });
      setOpen(false); form.resetFields(); setNumerosTexto('');
      message.success(`${data?.length ?? 1} serial(es) registrado(s)`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => inventarioApi.actualizarEstadoSerial(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['seriales'] }); qc.invalidateQueries({ queryKey: ['seriales-resumen'] }); setDetalle(null); message.success('Estado actualizado'); },
  });

  const resumenMap = Object.fromEntries((resumen ?? []).map((r: any) => [r.estado, Number(r.cantidad)]));

  const cols = [
    { title: 'N° Serie', dataIndex: 'numeroSerie', width: 160, render: (v: string) => <Text strong code>{v}</Text> },
    { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => `${r.producto?.codigo ?? ''} — ${r.producto?.nombre ?? ''}` },
    { title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => <Tag color={ESTADO_SERIAL_COLOR[v]}>{v?.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Garantía hasta', dataIndex: 'fechaVencimientoGarantia', width: 130,
      render: (v: string) => {
        if (!v) return '—';
        const dias = dayjs(v).diff(dayjs(), 'day');
        return <Tooltip title={`${dias >= 0 ? `Faltan ${dias} días` : `Vencida hace ${Math.abs(dias)} días`}`}>
          <Tag color={dias < 0 ? 'red' : dias <= 30 ? 'orange' : 'green'}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
        </Tooltip>;
      } },
    { title: 'Fecha venta', dataIndex: 'fechaVenta', width: 110, render: (v: string) => v ? fmt.date(v) : '—' },
    { title: '', key: 'acc', width: 60,
      render: (_: any, r: any) => <Button type="text" size="small" onClick={() => setDetalle(r)}>Ver</Button> },
  ];

  const handleRegistrar = (v: any) => {
    const numeros = numerosTexto
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (numeros.length === 0) { message.warning('Ingresa al menos un número de serie'); return; }
    registrarMut.mutate({ ...v, numeros });
  };

  return (
    <>
      {/* Resumen por estado */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {[
          { estado: 'disponible', color: '#52c41a' },
          { estado: 'vendido',    color: '#1677ff' },
          { estado: 'en_garantia', color: '#7c3aed' },
          { estado: 'devuelto',   color: '#fa8c16' },
          { estado: 'defectuoso', color: '#dc2626' },
        ].map(({ estado, color }) => (
          <Col xs={12} sm={8} md={4} key={estado}>
            <Card size="small" style={{ cursor: 'pointer', borderColor: estadoFiltro === estado ? color : undefined }}
              onClick={() => setEstadoFiltro(estadoFiltro === estado ? undefined : estado)}>
              <Statistic title={estado.replace('_', ' ').toUpperCase()} value={resumenMap[estado] ?? 0}
                valueStyle={{ color, fontSize: 18 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Space>
            <Input placeholder="Buscar N° serie..." prefix={<BarcodeOutlined />}
              value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: 220 }} />
            <Select placeholder="Estado" value={estadoFiltro} onChange={setEstadoFiltro} allowClear style={{ width: 140 }}>
              {['disponible', 'vendido', 'devuelto', 'defectuoso', 'en_garantia', 'dado_baja'].map(e =>
                <Option key={e} value={e}><Tag color={ESTADO_SERIAL_COLOR[e]}>{e.replace('_', ' ').toUpperCase()}</Tag></Option>
              )}
            </Select>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              exportarExcel((seriales ?? []).map((s: any) => ({
                'N° Serie': s.numeroSerie, 'Producto': s.producto?.nombre,
                'Estado': s.estado, 'Fecha Venta': s.fechaVenta ? dayjs(s.fechaVenta).format('DD/MM/YYYY') : '',
                'Garantía': s.fechaVencimientoGarantia ? dayjs(s.fechaVencimientoGarantia).format('DD/MM/YYYY') : '',
                'Notas': s.notas ?? '',
              })), 'Seriales-Inventario');
            }}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setNumerosTexto(''); setOpen(true); }}>
              Registrar seriales
            </Button>
          </Space>
        </Col>
      </Row>

      <Table columns={cols} dataSource={seriales ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 20 }} />

      {/* Modal registrar seriales */}
      <Modal title="Registrar números de serie" open={open} onCancel={() => { setOpen(false); form.resetFields(); setNumerosTexto(''); }} footer={null} width="min(560px, 95vw)">
        <Form form={form} layout="vertical" onFinish={handleRegistrar}>
          <Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label"
              options={(productosData?.data ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))} />
          </Form.Item>
          <Form.Item label="Números de serie" required extra="Uno por línea, o separados por coma (;)">
            <Input.TextArea rows={5} value={numerosTexto} onChange={e => setNumerosTexto(e.target.value)}
              placeholder={'SN-001\nSN-002\nSN-003'} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="costoUnitario" label="Costo unit. (RD$)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fechaVencimientoGarantia" label="Garantía hasta">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
          <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
            message={`Se registrarán ${numerosTexto.split(/[\n,;]+/).filter(s => s.trim()).length} seriales.`} />
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); setNumerosTexto(''); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={registrarMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer detalle serial */}
      <Modal title={`Serial: ${detalle?.numeroSerie}`} open={!!detalle} onCancel={() => setDetalle(null)} footer={null} width="min(480px, 95vw)">
        {detalle && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Producto" span={2}>{detalle.producto?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={ESTADO_SERIAL_COLOR[detalle.estado]}>{detalle.estado?.replace('_', ' ').toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Costo unit.">{fmt.money(detalle.costoUnitario ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Fecha venta">{detalle.fechaVenta ? fmt.date(detalle.fechaVenta) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Garantía">{detalle.fechaVencimientoGarantia ? fmt.date(detalle.fechaVencimientoGarantia) : '—'}</Descriptions.Item>
              {detalle.notas && <Descriptions.Item label="Notas" span={2}>{detalle.notas}</Descriptions.Item>}
            </Descriptions>
            {detalle.estado === 'disponible' && (
              <Space wrap>
                <Popconfirm title="¿Marcar como defectuoso?" onConfirm={() => updateMut.mutate({ id: detalle.id, body: { estado: 'defectuoso' } })}>
                  <Button danger>Defectuoso</Button>
                </Popconfirm>
                <Popconfirm title="¿Dar de baja?" onConfirm={() => updateMut.mutate({ id: detalle.id, body: { estado: 'dado_baja' } })}>
                  <Button>Dar de baja</Button>
                </Popconfirm>
              </Space>
            )}
            {detalle.estado === 'vendido' && (
              <Popconfirm title="¿Registrar devolución?" onConfirm={() => updateMut.mutate({ id: detalle.id, body: { estado: 'devuelto' } })}>
                <Button icon={<CheckCircleOutlined />}>Registrar devolución</Button>
              </Popconfirm>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

// ── Solicitudes de Ajuste ──────────────────────────────────────────────────────
function SolicitudesAjusteTab() {
  const [open, setOpen]           = useState(false);
  const [rechazando, setRechazando] = useState<any>(null);
  const [form]                    = Form.useForm();
  const [formRechazo]             = Form.useForm();
  const qc                        = useQueryClient();

  const { data: productos } = useQuery({
    queryKey: ['productos-lista'],
    queryFn: () => productosApi.list(1, 2000, '', true),
  });

  const { data: solicitudes, isFetching } = useQuery({
    queryKey: ['solicitudes-ajuste'],
    queryFn: () => inventarioApi.getSolicitudesAjuste(),
  });

  const pendientes = (solicitudes ?? []).filter((s: any) => s.estado === 'pendiente').length;

  const crearMut = useMutation({
    mutationFn: inventarioApi.createSolicitudAjuste,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-ajuste'] }); setOpen(false); form.resetFields(); message.success('Solicitud enviada — pendiente de aprobación ADMIN'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear solicitud'),
  });

  const aprobarMut = useMutation({
    mutationFn: inventarioApi.aprobarSolicitudAjuste,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-ajuste'] }); qc.invalidateQueries({ queryKey: ['productos'] }); message.success('Ajuste aprobado y aplicado al inventario'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al aprobar'),
  });

  const rechazarMut = useMutation({
    mutationFn: ({ id, motivoRechazo }: { id: number; motivoRechazo: string }) =>
      inventarioApi.rechazarSolicitudAjuste(id, motivoRechazo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['solicitudes-ajuste'] }); setRechazando(null); formRechazo.resetFields(); message.success('Solicitud rechazada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al rechazar'),
  });

  const estadoColor: Record<string, string> = { pendiente: 'orange', aprobada: 'green', rechazada: 'red' };

  const cols = [
    { title: 'Producto',     render: (_: any, r: any) => r.producto?.nombre ?? '-', width: 200 },
    { title: 'Stock Actual', render: (_: any, r: any) => r.producto?.stock ?? '-', align: 'center' as const },
    { title: 'Cant. Nueva',  dataIndex: 'cantidadNueva', align: 'center' as const, render: (v: number) => <b>{v}</b> },
    { title: 'Motivo',       dataIndex: 'motivo', ellipsis: true },
    { title: 'Solicitado por', render: (_: any, r: any) => r.user ? `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email : '-', width: 160 },
    { title: 'Fecha',        dataIndex: 'createdAt', render: (v: string) => dayjs(v).format('DD/MM/YY HH:mm'), width: 130 },
    { title: 'Estado',       dataIndex: 'estado', render: (v: string) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag>, width: 110 },
    { title: 'Motivo Rechazo', dataIndex: 'motivoRechazo', ellipsis: true },
    {
      title: 'Acciones', width: 160,
      render: (_: any, r: any) => r.estado === 'pendiente' ? (
        <Space>
          <Popconfirm title="¿Aprobar y aplicar este ajuste?" onConfirm={() => aprobarMut.mutate(r.id)}>
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}>Aprobar</Button>
          </Popconfirm>
          <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => setRechazando(r)}>Rechazar</Button>
        </Space>
      ) : null,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {pendientes > 0 && <Alert type="warning" showIcon message={`${pendientes} solicitud(es) pendiente(s) de aprobación`} style={{ flex: 1, marginRight: 12 }} />}
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva Solicitud</Button>
      </div>
      <Table
        columns={cols}
        dataSource={solicitudes ?? []}
        rowKey="id"
        loading={isFetching}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20 }}
        rowClassName={(r: any) => r.estado === 'pendiente' ? 'ant-table-row-selected' : ''}
      />
      {/* Modal nueva solicitud */}
      <Modal title="Solicitar Ajuste de Inventario" open={open} onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate(v))} okText="Enviar Solicitud" confirmLoading={crearMut.isPending}>
        <Alert type="info" showIcon message="Los ajustes requieren aprobación del ADMIN antes de aplicarse." style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label"
              options={(productos?.data ?? []).map((p: any) => ({
                value: p.id, label: `${p.nombre}${p.referencia ? ` (${p.referencia})` : ''} — Stock: ${p.stock}`,
              }))} />
          </Form.Item>
          <Form.Item name="cantidadNueva" label="Nueva cantidad en stock" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={1} />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo del ajuste" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Ej: Conteo físico reveló diferencia, merma por daño..." />
          </Form.Item>
        </Form>
      </Modal>
      {/* Modal rechazo */}
      <Modal title="Rechazar Solicitud" open={!!rechazando} onCancel={() => { setRechazando(null); formRechazo.resetFields(); }}
        onOk={() => formRechazo.validateFields().then(v => rechazarMut.mutate({ id: rechazando.id, motivoRechazo: v.motivoRechazo }))}
        okText="Rechazar" okButtonProps={{ danger: true }} confirmLoading={rechazarMut.isPending}>
        <Form form={formRechazo} layout="vertical">
          <Form.Item name="motivoRechazo" label="Motivo del rechazo" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ── Page principal ─────────────────────────────────────────────────────────────
export default function InventarioPage() {
  const { data: alertas } = useQuery({
    queryKey: ['lotes-alertas'],
    queryFn: inventarioApi.alertasLotes,
  });

  const totalAlertas = (alertas?.vencidos?.length ?? 0) + (alertas?.proximosAVencer?.length ?? 0);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Inventario</Title>
      <Card>
        <Tabs defaultActiveKey="movimientos" items={[
          { key: 'movimientos', label: <><InboxOutlined /> Movimientos</>,   children: <MovimientosTab /> },
          { key: 'lotes',       label: (
              <>
                <InboxOutlined /> Lotes / Vencimientos
                {totalAlertas > 0 && <Badge count={totalAlertas} size="small" style={{ marginLeft: 6 }} />}
              </>
            ),                                                               children: <LotesTab /> },
          { key: 'seriales',    label: <><BarcodeOutlined /> Seriales</>,    children: <SerialesTab /> },
          { key: 'ajustes',     label: <><EditOutlined /> Solicitudes Ajuste</>, children: <SolicitudesAjusteTab /> },
        ]} />
      </Card>
    </div>
  );
}
