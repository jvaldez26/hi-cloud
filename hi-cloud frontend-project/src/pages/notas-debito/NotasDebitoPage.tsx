import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Divider, theme, Alert, AutoComplete, Spin, Checkbox,
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, EyeOutlined,
  FileExcelOutlined, MailOutlined, AuditOutlined,
  SearchOutlined, CheckCircleFilled, PrinterOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { ecfApi } from '../../api/ecf.api';
import EcfResultModal from '../../components/ui/EcfResultModal';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const MOTIVOS = [
  { value: 'cargo_adicional',   label: 'Cargo adicional al cliente' },
  { value: 'ajuste_precio',     label: 'Ajuste de precio hacia arriba' },
  { value: 'intereses',         label: 'Intereses por mora' },
  { value: 'flete_adicional',   label: 'Flete o transporte adicional' },
  { value: 'diferencia_cambio', label: 'Diferencia por tipo de cambio' },
  { value: 'otro',              label: 'Otro motivo' },
];

const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador: { color: 'default', label: 'Borrador' },
  emitida:  { color: 'orange',  label: 'Emitida'  },
  anulada:  { color: 'red',     label: 'Anulada'  },
};

// ── Búsqueda de factura original con autocompletado ────────────────────────────
// E33 (Nota Débito) solo puede referenciar E31 — el backend filtra automáticamente.
const ECF_ESTADO_COLOR_ND: Record<string, string> = {
  aceptado: 'success', enviado: 'processing', pendiente_envio: 'warning',
  pendiente: 'warning', contingencia: 'warning', rechazado: 'error',
};

function BuscadorFactura({ onSelect }: { onSelect: (f: any) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [opciones, setOpciones] = useState<any[]>([]);

  const buscar = async (q: string) => {
    setBusqueda(q);
    if (q.length < 2) { setOpciones([]); return; }
    setBuscando(true);
    try {
      const r = await api.get(`/facturas/buscar-para-nota?tipoNota=E33&q=${encodeURIComponent(q)}`);
      setOpciones(r.data?.data ?? r.data ?? []);
    } finally { setBuscando(false); }
  };

  const opcionesAC = opciones.map((f: any) => ({
    value: String(f.ecfId),
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>E31</Tag>
        <Text strong style={{ fontSize: 12 }}>{f.folio}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>{f.clienteNombre}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>— {fmt(Number(f.total))}</Text>
        <Tag color={ECF_ESTADO_COLOR_ND[f.estadoEcf] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>{f.estadoEcf}</Tag>
      </div>
    ),
    data: f,
  }));

  return (
    <div>
      <AutoComplete
        style={{ width: '100%' }} options={opcionesAC} value={busqueda}
        onChange={setBusqueda}
        onSelect={(_, opt: any) => { onSelect(opt.data); setBusqueda(opt.data.folio ?? opt.data.encf); setOpciones([]); }}
        onSearch={buscar}
        notFoundContent={buscando
          ? <Spin size="small" />
          : busqueda.length >= 2 ? <Text type="secondary" style={{ fontSize: 12 }}>Sin resultados — busca por número de factura, eNCF o cliente</Text> : null}
      >
        <Input prefix={<SearchOutlined />}
          placeholder="Buscar por folio (FAC-...), eNCF, cliente o RNC..."
          suffix={buscando ? <Spin size="small" /> : null} />
      </AutoComplete>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 3 }}>
        E33 (Nota Débito) solo puede referenciar e-CFs tipo E31 Aceptados por DGII.
      </Text>
    </div>
  );
}

export default function NotasDebitoPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [modalDetalle,  setModalDetalle]  = useState<any>(null);
  const [emailNota,     setEmailNota]     = useState<any>(null);
  const [emailDest,     setEmailDest]     = useState('');
  const [ecfEncf,       setEcfEncf]       = useState<string | null>(null);
  const [facturaOrigen, setFacturaOrigen] = useState<any>(null);
  const [sinItbis,      setSinItbis]      = useState(false);
  const [pdfPending,    setPdfPending]    = useState<number | null>(null);
  const [formCrear] = Form.useForm();

  const imprimirPDF = async (nota: any) => {
    setPdfPending(nota.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/notas-debito/${nota.id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { message.warning('El navegador bloqueó la ventana emergente'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  // Totales en tiempo real desde Form.useWatch
  const detalles: any[] = Form.useWatch('detalles', formCrear) ?? [];
  const subtotalCargo = detalles.reduce((s, d) => s + (Number(d?.precioUnitario ?? 0) * Number(d?.cantidad ?? 0)), 0);
  const itbisCargo    = sinItbis ? 0 : subtotalCargo * 0.18;
  const totalCargo    = subtotalCargo + itbisCargo;

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/nota-debito/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailNota(null); setEmailDest(''); message.success(`Enviada a ${v.email}`); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar'),
  });

  const emitirEcfMut = useMutation({
    mutationFn: (id: number) => ecfApi.emitirEcfNotaDebito(id),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['notas-debito'] }); if (res?.encf) setEcfEncf(res.encf); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al emitir e-CF E33'),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn: () => api.get('/productos?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['nd-resumen'],
    queryFn: () => api.get('/notas-debito/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: notas, isLoading } = useQuery<any>({
    queryKey: ['notas-debito', search, page],
    queryFn: () => api.get(`/notas-debito?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}&page=${page}`).then((r: any) => r.data?.data ?? r.data),
  });

  const onErr = (e: any, msg: string) => message.error((e as any)?.friendlyMessage ?? msg);

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/notas-debito', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-debito'] }); qc.invalidateQueries({ queryKey: ['nd-resumen'] });
      setModalCrear(false); formCrear.resetFields(); setFacturaOrigen(null);
      message.success('Nota de Débito creada');
    },
    onError: (e: any) => onErr(e, 'Error al crear nota de débito'),
  });

  const emitir  = useMutation({ mutationFn: (id: number) => api.patch(`/notas-debito/${id}/emitir`),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-debito'] }); qc.invalidateQueries({ queryKey: ['nd-resumen'] }); message.success('Nota emitida'); },  onError: (e: any) => onErr(e, 'Error al emitir') });
  const anular  = useMutation({ mutationFn: (id: number) => api.patch(`/notas-debito/${id}/anular`),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-debito'] }); qc.invalidateQueries({ queryKey: ['nd-resumen'] }); message.success('Nota anulada'); },  onError: (e: any) => onErr(e, 'Error al anular') });
  const eliminar = useMutation({ mutationFn: (id: number) => api.delete(`/notas-debito/${id}`),       onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-debito'] }); qc.invalidateQueries({ queryKey: ['nd-resumen'] }); message.success('Nota eliminada'); }, onError: (e: any) => onErr(e, 'Error al eliminar') });

  const handleSeleccionarFactura = (f: any) => {
    setFacturaOrigen(f);
    const detallesPrecargados = (f.detalles ?? []).map((d: any) => ({
      productoId:    d.productoId ?? undefined,
      descripcion:   d.descripcion,
      cantidad:      Number(d.cantidad),
      precioUnitario: Number(d.precioUnitario),
    }));
    formCrear.setFieldsValue({
      clienteId:            f.clienteId,
      facturaOriginalFolio: f.folio,
      facturaOriginalId:    f.id,
      detalles:             detallesPrecargados.length > 0 ? detallesPrecargados : [{}],
    });
  };

  const handleCrear = (values: any) => {
    if (!facturaOrigen) { message.error('Selecciona la factura original antes de continuar.'); return; }
    const { fecha, detalles: _det, ...rest } = values;
    const detallesLimpios = (values.detalles ?? [])
      .filter((d: any) => d?.descripcion || d?.productoId)
      .map((d: any) => ({
        descripcion:    String(d.descripcion ?? 'Ítem'),
        cantidad:       Math.max(Number(d.cantidad) || 1, 0.01),
        precioUnitario: Math.max(Number(d.precioUnitario) || 0, 0),
        productoId:     d.productoId ?? undefined,
        porcentajeIva:  sinItbis ? 0 : undefined,
      }));
    if (detallesLimpios.length === 0) {
      message.error('Debes agregar al menos un cargo con descripción.'); return;
    }
    crear.mutate({
      ...rest,
      fecha:                values.fecha?.format('YYYY-MM-DD'),
      facturaOriginalId:    facturaOrigen.id,
      facturaOriginalFolio: facturaOrigen.folio,
      moneda:               facturaOrigen.moneda ?? 'DOP',
      tipoCambio:           facturaOrigen.tipoCambio ? Number(facturaOrigen.tipoCambio) : 1,
      detalles:             detallesLimpios,
    });
  };

  const abrirDesdeFactura = (facturaPresel?: any) => {
    formCrear.resetFields();
    formCrear.setFieldsValue({ fecha: dayjs(), detalles: [{}] });
    setFacturaOrigen(null);
    if (facturaPresel) handleSeleccionarFactura(facturaPresel);
    setModalCrear(true);
  };

  const COLS_DEF = [
    { key: 'n',   label: 'Número',        defaultVisible: true  },
    { key: 'f',   label: 'Fecha',         defaultVisible: true  },
    { key: 'c',   label: 'Cliente',       defaultVisible: true  },
    { key: 'fof', label: 'Fact. Original',defaultVisible: true  },
    { key: 't',   label: 'Total',         defaultVisible: true  },
    { key: 'e',   label: 'Estado',        defaultVisible: true  },
    { key: 'ecf', label: 'e-CF',          defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcND } = useColumnVisibility('notas-debito', COLS_DEF);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTextOutlined style={{ fontSize: 28, color: '#d97706' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Notas de Débito — e-CF E33</Title>
            <Text type="secondary">Cargos adicionales al cliente · Ajustes de precio · Intereses · DGII E33</Text>
          </div>
        </div>
        <Space wrap>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (notas?.data ?? []).map((n: any) => ({ 'Número': n.numero ?? '', 'Fecha': n.fecha ? dayjs(n.fecha).format('DD/MM/YYYY') : '', 'Cliente': n.cliente?.nombre ?? '', 'Motivo': n.motivo?.replace(/_/g,' ') ?? '', 'Total': Number(n.total ?? 0), 'Estado': n.estado ?? '' }));
            exportarExcel(filas, `Notas-Debito-${dayjs().format('YYYY-MM-DD')}`);
            message.success(`${filas.length} notas exportadas`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['notas-debito']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirDesdeFactura()}>Nueva Nota de Débito</Button>
        </Space>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 20, borderRadius: 8 }}
        message={<span><strong>¿Cuándo usar una Nota de Débito E33?</strong> Cuando necesitas cobrar un monto adicional sobre una factura ya emitida y con e-CF Aceptado.</span>}
      />

      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="Buscar por número o cliente..."
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          allowClear
          style={{ width: 280 }}
        />
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table dataSource={notas?.data ?? []} rowKey="id" loading={isLoading} size="middle"
          pagination={{ pageSize: 15 }}
          columns={fcND([
            { title: 'Número', dataIndex: 'numero', key: 'n', width: 150, render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12, color: '#d97706' }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f', width: 100, render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
            { title: 'Cliente', key: 'c', ellipsis: true, render: (_: any, r: any) => <Text strong style={{ fontSize: 13 }}>{r.cliente?.nombre ?? '—'}</Text> },
            { title: 'Fact. Original', dataIndex: 'facturaOriginalFolio', key: 'fof', width: 130, render: (v: string) => v ? <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text> },
            { title: 'Total', dataIndex: 'total', key: 't', width: 120, align: 'right' as const, render: (v: number) => <Text strong style={{ color: '#d97706' }}>+{fmt(v)}</Text> },
            { title: 'Estado', dataIndex: 'estado', key: 'e', width: 100, render: (v: string) => <Tag color={ESTADO_CONFIG[v]?.color} style={{ margin: 0, fontSize: 11 }}>{ESTADO_CONFIG[v]?.label}</Tag> },
            { title: 'e-CF', key: 'ecf', width: 120, render: (_: any, r: any) => r.ecfNumero
                ? <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#059669' }}>{r.ecfNumero}</Text>
                : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
            { title: '', key: 'acc', width: 220,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setModalDetalle(r)}
                  viewLabel="Ver detalle"
                  items={[
                    { key: 'pdf', label: pdfPending === r.id ? 'Generando...' : 'Imprimir',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
                      disabled: pdfPending === r.id, onClick: () => imprimirPDF(r) },
                    { key: 'email', label: 'Enviar email', icon: <MailOutlined />,
                      disabled: r.estado !== 'emitida',
                      onClick: () => { setEmailNota(r); setEmailDest(r.cliente?.email ?? ''); } },
                    ...(r.estado === 'borrador' ? [
                      { key: 'emitir', label: 'Emitir nota', icon: <CheckCircleOutlined />, onClick: () => emitir.mutate(r.id) },
                    ] : []),
                    ...(r.estado === 'emitida' && !r.ecfNumero ? [
                      { key: 'ecf', label: 'Emitir e-CF E33', icon: <AuditOutlined />, onClick: () => emitirEcfMut.mutate(r.id) },
                    ] : []),
                    { type: 'divider' as const },
                    ...(r.estado === 'emitida' ? [
                      { key: 'anular', label: 'Anular nota', icon: <CloseCircleOutlined />, danger: true,
                        onClick: () => { if (window.confirm('¿Anular esta nota de débito?')) anular.mutate(r.id); } },
                    ] : []),
                    ...(r.estado === 'borrador' ? [
                      { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
                        onClick: () => { if (window.confirm('¿Eliminar?')) eliminar.mutate(r.id); } },
                    ] : []),
                  ]}
                />
              ) },
          ] as any)} />
      </Card>

      {/* ── Modal Crear ── */}
      <Modal
        title={<Space><FileTextOutlined style={{ color: '#d97706' }} />Nueva Nota de Débito (e-CF E33)</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); setFacturaOrigen(null); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear en Borrador"
        okButtonProps={{ style: { background: '#d97706', borderColor: '#d97706' } }}
        width={780} destroyOnClose>
        <Form form={formCrear} layout="vertical" onFinish={handleCrear} initialValues={{ fecha: dayjs(), detalles: [{}] }}>
          {/* Campos ocultos */}
          <Form.Item name="facturaOriginalFolio" hidden><Input /></Form.Item>
          <Form.Item name="facturaOriginalId"    hidden><Input /></Form.Item>
          <Form.Item name="clienteId"            hidden><Input /></Form.Item>

          {/* ── PASO 1: Buscar factura original ── */}
          <Form.Item label={<Text strong>Factura Original *</Text>} required>
            <BuscadorFactura onSelect={handleSeleccionarFactura} />
          </Form.Item>

          {/* Panel de datos cargados — adapta a modo claro/oscuro */}
          {facturaOrigen ? (
            <div style={{
              background: token.colorSuccessBg,
              border: `1px solid ${token.colorSuccessBorder}`,
              borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircleFilled style={{ color: token.colorSuccess }} />
                <Text strong style={{ color: token.colorSuccess, fontSize: 13 }}>Documento original cargado</Text>
                {facturaOrigen.moneda && facturaOrigen.moneda !== 'DOP' && (
                  <Tag color="gold" style={{ margin: 0 }}>{facturaOrigen.moneda}</Tag>
                )}
                {facturaOrigen.estadoEcf && facturaOrigen.estadoEcf !== 'aceptado' && (
                  <Tag color={ECF_ESTADO_COLOR_ND[facturaOrigen.estadoEcf] ?? 'warning'} style={{ margin: 0 }}>{facturaOrigen.estadoEcf}</Tag>
                )}
              </div>
              {facturaOrigen.moneda && facturaOrigen.moneda !== 'DOP' && (
                <Alert type="info" showIcon style={{ marginBottom: 8 }}
                  message={`⚠️ Esta factura fue emitida en ${facturaOrigen.moneda} (Tasa: RD$${Number(facturaOrigen.tipoCambio ?? 1).toFixed(2)} por ${facturaOrigen.moneda}1.00). La nota de débito se generará en ${facturaOrigen.moneda}.`} />
              )}
              {facturaOrigen.estadoEcf && facturaOrigen.estadoEcf !== 'aceptado' && (
                <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                  message="⚠️ Este comprobante aún no ha sido aceptado por la DGII. La nota de débito podría ser rechazada si el e-CF original no está validado." />
              )}
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Cliente</Text>
                  <div><Text strong>{facturaOrigen.clienteNombre}</Text></div>
                  {facturaOrigen.clienteRNC && <Text type="secondary" style={{ fontSize: 11 }}>RNC: {facturaOrigen.clienteRNC}</Text>}
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>eNCF Original (referencia para DGII)</Text>
                  <div><Text strong style={{ fontFamily: 'monospace', color: token.colorPrimary }}>{facturaOrigen.encf}</Text></div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Fecha: {facturaOrigen.fecha}</Text>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Subtotal</Text>
                  <div><Text>{fmt(Number(facturaOrigen.subtotal))}</Text></div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>ITBIS</Text>
                  <div><Text>{fmt(Number(facturaOrigen.iva))}</Text></div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Total original</Text>
                  <div><Text strong style={{ color: token.colorPrimary }}>{fmt(Number(facturaOrigen.total))}</Text></div>
                </Col>
              </Row>
            </div>
          ) : (
            <Alert type="warning" showIcon style={{ marginBottom: 16, fontSize: 12 }}
              message="Busca y selecciona la factura original. El cliente se completará automáticamente." />
          )}

          {/* ── PASO 2: Datos del cargo ── */}
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fecha" label="Fecha del cargo" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="motivo" label="Motivo *" rules={[{ required: true }]}><Select placeholder="Seleccionar motivo">{MOTIVOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}</Select></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="descripcionMotivo" label="Descripción"><Input placeholder="Detalle del cargo..." /></Form.Item></Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Cargos adicionales a facturar</Divider>

          <Checkbox
            checked={sinItbis}
            onChange={e => setSinItbis(e.target.checked)}
            style={{ marginBottom: 10 }}
          >
            No aplica ITBIS
          </Checkbox>

          <Form.List name="detalles">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={7}><Form.Item name={[name, 'productoId']} noStyle><Select showSearch optionFilterProp="children" placeholder="Producto/servicio" allowClear style={{ width: '100%' }} onChange={pid => { const p = (productos as any[]).find((x: any) => x.id === pid); if (p) { const ds = formCrear.getFieldValue('detalles'); ds[name] = { ...ds[name], descripcion: p.nombre, precioUnitario: p.precio }; formCrear.setFieldsValue({ detalles: ds }); }}}>{(productos as any[]).map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}</Select></Form.Item></Col>
                    <Col xs={24} sm={7}><Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: '' }]}><Input placeholder="Descripción del cargo *" /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'cantidad']} noStyle rules={[{ required: true }]}><InputNumber min={0.01} placeholder="Cant." style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={5}><Form.Item name={[name, 'precioUnitario']} noStyle rules={[{ required: true }]}><InputNumber min={0} placeholder="Precio unit." style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={1}>{fields.length > 1 && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />}</Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Agregar cargo</Button>
              </>
            )}
          </Form.List>

          <Form.Item name="notas" label="Notas" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item>

          {/* ── PASO 3: Resumen en tiempo real ── */}
          {facturaOrigen && totalCargo > 0 && (
            <div style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Resumen del cargo adicional</Text>
              <Row justify="space-between" style={{ marginBottom: 3 }}><Text type="secondary" style={{ fontSize: 12 }}>Factura original:</Text><Text style={{ fontSize: 12 }}>{fmt(Number(facturaOrigen.total))}</Text></Row>
              <Row justify="space-between" style={{ marginBottom: 3 }}><Text type="secondary" style={{ fontSize: 12 }}>Cargo adicional (subtotal):</Text><Text style={{ fontSize: 12, color: '#d97706' }}>+{fmt(subtotalCargo)}</Text></Row>
              <Row justify="space-between" style={{ marginBottom: 3 }}><Text type="secondary" style={{ fontSize: 12 }}>ITBIS del cargo (18%):</Text><Text style={{ fontSize: 12, color: '#d97706' }}>+{fmt(itbisCargo)}</Text></Row>
              <Divider style={{ margin: '6px 0' }} />
              <Row justify="space-between">
                <Text strong style={{ fontSize: 12 }}>Nuevo total efectivo del cliente:</Text>
                <Text strong style={{ fontSize: 14, color: '#1a56db' }}>{fmt(Number(facturaOrigen.total) + totalCargo)}</Text>
              </Row>
            </div>
          )}
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal title={<Space><FileTextOutlined style={{ color: '#d97706' }} />ND {modalDetalle?.numero} <Tag color={ESTADO_CONFIG[modalDetalle?.estado ?? 'borrador']?.color}>{ESTADO_CONFIG[modalDetalle?.estado ?? 'borrador']?.label}</Tag></Space>}
        open={!!modalDetalle} onCancel={() => setModalDetalle(null)} footer={null} width={620} destroyOnClose>
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12}><Text type="secondary" style={{ fontSize: 11 }}>Cliente</Text><div><Text strong>{modalDetalle.cliente?.nombre}</Text></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>NCF</Text><div><Tag color="orange">{modalDetalle.tipoNcf}</Tag></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Fecha</Text><div><Text>{modalDetalle.fecha}</Text></div></Col>
            </Row>
            {modalDetalle.facturaOriginalFolio && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Factura original: </Text>
                <Tag color="blue">{modalDetalle.facturaOriginalFolio}</Tag>
                {modalDetalle.ncfOriginal && <Tag color="green" style={{ marginLeft: 4, fontFamily: 'monospace' }}>{modalDetalle.ncfOriginal}</Tag>}
              </div>
            )}
            <div style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '6px 12px', marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Motivo: </Text>
              <Text>{MOTIVOS.find(m => m.value === modalDetalle.motivo)?.label ?? modalDetalle.motivo}</Text>
              {modalDetalle.descripcionMotivo && <div><Text type="secondary" style={{ fontSize: 11 }}>{modalDetalle.descripcionMotivo}</Text></div>}
            </div>
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={modalDetalle.detalles} rowKey="id" pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cant.', dataIndex: 'cantidad', key: 'c', align: 'right' as const },
                { title: 'Precio', dataIndex: 'precioUnitario', key: 'p', align: 'right' as const, render: (v: number) => fmt(v) },
                { title: 'ITBIS', dataIndex: 'iva', key: 'i', align: 'right' as const, render: (v: number) => fmt(v) },
                { title: 'Total', dataIndex: 'total', key: 't', align: 'right' as const, render: (v: number) => <Text strong style={{ color: '#d97706' }}>+{fmt(v)}</Text> },
              ]} />
            <Divider />
            <Row justify="end" gutter={24}>
              <Col><Text type="secondary">Subtotal: {fmt(modalDetalle.subtotal)}</Text></Col>
              <Col><Text type="secondary">ITBIS: {fmt(modalDetalle.iva)}</Text></Col>
              <Col><Text strong style={{ fontSize: 18, color: '#d97706' }}>+{fmt(modalDetalle.total)}</Text></Col>
            </Row>
          </>
        )}
      </Modal>

      <Modal title={<><MailOutlined style={{ color: '#d97706', marginRight: 8 }} />Enviar Nota de Débito</>}
        open={!!emailNota} onCancel={() => { setEmailNota(null); setEmailDest(''); }}
        onOk={() => emailNota && emailMut.mutate({ id: emailNota.id, email: emailDest })}
        confirmLoading={emailMut.isPending} okText="Enviar" destroyOnClose width={400}>
        {emailNota && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>ND <strong>{emailNota.numero}</strong> · Cliente: <strong>{emailNota.cliente?.nombre ?? '—'}</strong></p>
            <Input prefix={<MailOutlined />} placeholder="correo@cliente.com" value={emailDest} onChange={e => setEmailDest(e.target.value)} size="large" />
          </div>
        )}
      </Modal>

      <EcfResultModal encf={ecfEncf} onClose={() => setEcfEncf(null)} />
    </div>
  );
}
