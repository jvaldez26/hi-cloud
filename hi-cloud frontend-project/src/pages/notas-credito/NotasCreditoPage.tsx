import { useState } from 'react';
import { TableActions } from '../../components/ui/TableActions';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Divider, theme, Alert, AutoComplete, Spin,
} from 'antd';
import { SearchOutlined, CheckCircleFilled, WarningOutlined } from '@ant-design/icons';
import {
  FileTextOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, EyeOutlined,
  FileExcelOutlined, MailOutlined, AuditOutlined,
  PrinterOutlined, LoadingOutlined,
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


const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador: { color: 'default', label: 'Borrador' },
  emitida:  { color: 'blue',   label: 'Emitida'  },
  anulada:  { color: 'red',    label: 'Anulada'  },
};

// ── Búsqueda de factura/documento original ────────────────────────────────────
const ECF_TIPO_COLOR: Record<string, string> = {
  E31: 'blue', E32: 'cyan', E41: 'orange', E43: 'purple',
  E44: 'geekblue', E45: 'green', E46: 'magenta', E47: 'volcano',
};
const ECF_ESTADO_COLOR: Record<string, string> = {
  aceptado: 'success', enviado: 'processing', pendiente_envio: 'warning',
  pendiente: 'warning', contingencia: 'warning', rechazado: 'error',
};

function BuscadorFacturaNC({ onSelect }: { onSelect: (f: any) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [opciones, setOpciones] = useState<any[]>([]);

  const buscar = async (q: string) => {
    setBusqueda(q);
    if (q.length < 2) { setOpciones([]); return; }
    setBuscando(true);
    try {
      const r = await api.get(`/facturas/buscar-para-nota?tipoNota=E34&q=${encodeURIComponent(q)}`);
      setOpciones(r.data?.data ?? r.data ?? []);
    } finally { setBuscando(false); }
  };

  const opcionesAC = opciones.map((f: any) => ({
    value: String(f.ecfId),
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Tag color={ECF_TIPO_COLOR[f.tipoEcf] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>{f.tipoEcf}</Tag>
        <Typography.Text strong style={{ fontSize: 12 }}>{f.folio}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>{f.clienteNombre}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>— {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(Number(f.total))}</Typography.Text>
        <Tag color={ECF_ESTADO_COLOR[f.estadoEcf] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>{f.estadoEcf}</Tag>
      </div>
    ),
    data: f,
  }));

  return (
    <div>
      <AutoComplete style={{ width: '100%' }} options={opcionesAC} value={busqueda}
        onChange={setBusqueda}
        onSelect={(_, opt: any) => { onSelect(opt.data); setBusqueda(opt.data.folio ?? opt.data.encf); setOpciones([]); }}
        onSearch={buscar}
        notFoundContent={buscando ? <Spin size="small" /> : busqueda.length >= 2 ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>Sin resultados — busca por número de factura, eNCF o cliente</Typography.Text> : null}>
        <Input prefix={<SearchOutlined />} placeholder="Buscar por folio, eNCF, cliente o RNC..." suffix={buscando ? <Spin size="small" /> : null} />
      </AutoComplete>
      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 3 }}>
        E34 puede referenciar: E31, E32, E41, E43, E44, E45, E46, E47.
      </Typography.Text>
    </div>
  );
}

const CODIGOS_MODIFICACION = [
  { value: '1', label: 'Anulación total', desc: 'Anula completamente la factura original ante la DGII. No se puede deshacer.' },
  { value: '2', label: 'Corrección de texto', desc: 'Corrige datos descriptivos (nombre, dirección) sin afectar montos.' },
  { value: '3', label: 'Devolución / Ajuste de montos', desc: 'Devuelve mercancía o acredita un monto parcial o total.' },
  { value: '4', label: 'Reemplazo por contingencia', desc: 'Reemplaza un comprobante emitido en modo contingencia.' },
];

const fmtNC = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

export default function NotasCreditoPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [modalDetalle,  setModalDetalle]  = useState<any>(null);
  const [emailNota,     setEmailNota]     = useState<any>(null);
  const [emailDest,     setEmailDest]     = useState('');
  const [facturaOrigen, setFacturaOrigen] = useState<any>(null);
  const [codigoMod,     setCodigoMod]     = useState('3');
  const [pdfPending,    setPdfPending]    = useState<number | null>(null);
  const [formCrear] = Form.useForm();

  const imprimirPDF = async (nota: any) => {
    setPdfPending(nota.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/notas-credito/${nota.id}/pdf`, {
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

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/nota-credito/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailNota(null); setEmailDest(''); message.success(`Nota de crédito enviada a ${v.email}`); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar'),
  });

  const [ecfModal,      setEcfModal]      = useState<any>(null);
  const [ecfCodigo,     setEcfCodigo]     = useState<string>('3');
  const [ecfResultEncf, setEcfResultEncf] = useState<string | null>(null);

  const emitirEcfMut = useMutation({
    mutationFn: ({ id, codigo }: { id: number; codigo: string }) =>
      ecfApi.emitirEcfNotaCredito(id, { codigoModificacion: codigo as any }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notas-credito'] });
      setEcfModal(null);
      if (res?.encf) setEcfResultEncf(res.encf);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al emitir e-CF E34',
    ),
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn:  () => api.get('/productos?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['nc-resumen'],
    queryFn:  () => api.get('/notas-credito/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: notas, isLoading } = useQuery<any>({
    queryKey: ['notas-credito', search, page],
    queryFn:  () => api.get(`/notas-credito?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}&page=${page}`).then((r: any) => r.data?.data ?? r.data),
  });

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/notas-credito', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito'] });
      qc.invalidateQueries({ queryKey: ['nc-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      setFacturaOrigen(null);
      message.success('Nota de crédito creada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear nota de crédito'),
  });

  const emitir = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito/${id}/emitir`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-credito'] });
      qc.invalidateQueries({ queryKey: ['nc-resumen'] }); message.success('Nota emitida'); },
  });

  const anular = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito/${id}/anular`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-credito'] });
      qc.invalidateQueries({ queryKey: ['nc-resumen'] }); message.success('Nota anulada'); },
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/notas-credito/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas-credito'] });
      qc.invalidateQueries({ queryKey: ['nc-resumen'] }); message.success('Nota eliminada'); },
  });

  // Totales en tiempo real
  const detallesWatch: any[] = Form.useWatch('detalles', formCrear) ?? [];
  const subtotalNC = detallesWatch.reduce((s, d) => s + (Number(d?.precioUnitario ?? 0) * Number(d?.cantidad ?? 0)), 0);
  const itbisNC    = subtotalNC * 0.18;
  const totalNC    = subtotalNC + itbisNC;

  const handleSeleccionarFactura = (f: any) => {
    setFacturaOrigen(f);
    const detallesPrecargados = (f.detalles ?? []).map((d: any) => ({
      productoId:     d.productoId ?? undefined,
      descripcion:    d.descripcion,
      cantidad:       Number(d.cantidad),
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
    if (!facturaOrigen) { message.error('Selecciona la factura original.'); return; }
    if (codigoMod === '3' && totalNC > Number(facturaOrigen.total)) {
      message.error(`El monto a acreditar (${fmtNC(totalNC)}) no puede superar el total original (${fmtNC(Number(facturaOrigen.total))}).`);
      return;
    }
    const { fecha, detalles: _det, ...rest } = values;
    const detallesLimpios = codigoMod === '1' ? [{
      descripcion:    `Anulación total de ${facturaOrigen.folio}`,
      cantidad:       1,
      precioUnitario: Number(facturaOrigen.subtotal) || Number(facturaOrigen.total) || 1,
    }] : (values.detalles ?? []).filter((d: any) => d?.descripcion || d?.productoId).map((d: any) => ({
      descripcion:    String(d.descripcion ?? 'Ítem'),
      cantidad:       Math.max(Number(d.cantidad) || 1, 0.01),
      precioUnitario: Math.max(Number(d.precioUnitario) || 0, 0),
      productoId:     d.productoId ?? undefined,
    }));
    if (detallesLimpios.length === 0) {
      message.error('Debes agregar al menos un ítem con descripción.'); return;
    }
    crear.mutate({
      ...rest,
      fecha:                values.fecha?.format('YYYY-MM-DD'),
      tipoNcf:              'E34',
      facturaOriginalId:    facturaOrigen.id,
      facturaOriginalFolio: facturaOrigen.folio,
      detalles:             detallesLimpios,
    });
  };

  const abrirDesdeFactura = (facturaPresel?: any) => {
    formCrear.resetFields();
    formCrear.setFieldsValue({ fecha: dayjs(), detalles: [{}] });
    setFacturaOrigen(null); setCodigoMod('3');
    if (facturaPresel) handleSeleccionarFactura(facturaPresel);
    setModalCrear(true);
  };


  const COLS_DEF = [
    { key: 'n',   label: 'Número',       defaultVisible: true  },
    { key: 'f',   label: 'Fecha',        defaultVisible: true  },
    { key: 'c',   label: 'Cliente',      defaultVisible: true  },
    { key: 't',   label: 'Total',        defaultVisible: true  },
    { key: 'fof', label: 'Factura orig.',defaultVisible: true  },
    { key: 'e',   label: 'Estado',       defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcNC } = useColumnVisibility('notas-credito', COLS_DEF);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTextOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Notas de Crédito — e-CF E34</Title>
            <Text type="secondary">Comprobantes de devolución y ajustes DGII · Tipo E34</Text>
          </div>
        </div>
        <Space wrap>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (Array.isArray(notas) ? notas : notas?.data ?? []).map((n: any) => ({
              'Número':   n.numero ?? '',
              'Fecha':    n.fecha ? dayjs(n.fecha).format('DD/MM/YYYY') : '',
              'Cliente':  n.cliente?.nombre ?? '',
              'Total':    Number(n.total ?? 0),
              'Estado':   n.estado ?? '',
            }));
            exportarExcel(filas, `Notas-Credito-${dayjs().format('YYYY-MM-DD')}`);
            message.success(`${filas.length} notas exportadas`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['notas-credito']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirDesdeFactura()}>
            Nueva Nota de Crédito
          </Button>
        </Space>
      </div>

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
        <Table
          dataSource={notas?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          scroll={{ x: 'max-content' }}
          columns={fcNC([
            { title: 'Número', dataIndex: 'numero', key: 'n', width: 100,
              render: (v: any) => <Text strong style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v}</Text> },
            { title: 'Fecha',  dataIndex: 'fecha',  key: 'f', width: 90,
              render: (v: any) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{v ? String(v).slice(0, 10) : '—'}</span> },
            {
              title: 'Cliente', key: 'c', ellipsis: true, minWidth: 120,
              render: (_: any, r: any) => <Text strong ellipsis style={{ maxWidth: 160 }}>{r.cliente?.nombre ?? 'Consumidor Final'}</Text>,
            },
            {
              title: 'Total', dataIndex: 'total', key: 't', align: 'right' as const, width: 110,
              render: (v: any) => <Text strong style={{ color: token.colorError, whiteSpace: 'nowrap' }}>{fmt(v)}</Text>,
            },
            {
              title: 'Factura orig.', dataIndex: 'facturaOriginalFolio', key: 'fof', width: 160,
              render: (v: any) => v ? <Tag color="orange" style={{ whiteSpace: 'nowrap' }}>{v}</Tag> : <Text type="secondary">—</Text>,
            },
            {
              title: 'Estado', dataIndex: 'estado', key: 'e', width: 100,
              render: (v: any) => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag>,
            },
            {
              title: '', key: 'acc', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setModalDetalle(r)}
                  viewLabel="Ver detalle"
                  items={[
                    {
                      key: 'pdf',
                      label: pdfPending === r.id ? 'Generando PDF...' : 'Imprimir',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
                      disabled: pdfPending === r.id,
                      onClick: () => imprimirPDF(r),
                    },
                    r.estado === 'emitida' ? {
                      key: 'email',
                      label: 'Enviar por email',
                      onClick: () => { setEmailNota(r); setEmailDest(r.cliente?.email ?? ''); },
                    } : null,
                    r.estado === 'borrador' ? {
                      key: 'emitir',
                      label: 'Emitir',
                      onClick: () => emitir.mutate(r.id),
                    } : null,
                    (r.estado === 'emitida' && !r.ecfNumero &&
                      !['aceptado', 'enviado', 'pendiente_envio', 'aceptado_condicion'].includes(r.ecf?.estadoDGII)) ? {
                      key: 'ecf',
                      label: 'e-CF E34',
                      onClick: () => { setEcfModal(r); setEcfCodigo('3'); },
                    } : null,
                    r.estado === 'emitida' ? {
                      key: 'anular',
                      label: 'Anular',
                      danger: true,
                      onClick: () => anular.mutate(r.id),
                    } : null,
                    r.estado === 'borrador' ? {
                      key: 'eliminar',
                      label: 'Eliminar',
                      danger: true,
                      onClick: () => eliminar.mutate(r.id),
                    } : null,
                  ].filter(Boolean)}
                />
              ),
            },
          ] as any)}
        />
      </Card>

      {/* ── Modal Crear ── */}
      <Modal
        title={<Space><FileTextOutlined />Nueva Nota de Crédito (e-CF E34)</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); setFacturaOrigen(null); setCodigoMod('3'); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear en Borrador"
        width={780}
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical" onFinish={handleCrear} initialValues={{ fecha: dayjs(), detalles: [{}] }}>
          {/* Campos ocultos */}
          <Form.Item name="facturaOriginalFolio" hidden><Input /></Form.Item>
          <Form.Item name="facturaOriginalId"    hidden><Input /></Form.Item>
          <Form.Item name="clienteId"            hidden><Input /></Form.Item>

          {/* ── PASO 1: Buscar factura original ── */}
          <Form.Item label={<Typography.Text strong>Factura Original *</Typography.Text>} required>
            <BuscadorFacturaNC onSelect={handleSeleccionarFactura} />
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
                <Typography.Text strong style={{ color: token.colorSuccess, fontSize: 13 }}>Documento original cargado</Typography.Text>
                {facturaOrigen.tipoEcf && <Tag color={ECF_TIPO_COLOR[facturaOrigen.tipoEcf] ?? 'default'} style={{ margin: 0 }}>{facturaOrigen.tipoEcf}</Tag>}
                {facturaOrigen.estadoEcf && facturaOrigen.estadoEcf !== 'aceptado' && (
                  <Tag color={ECF_ESTADO_COLOR[facturaOrigen.estadoEcf] ?? 'warning'} style={{ margin: 0 }}>{facturaOrigen.estadoEcf}</Tag>
                )}
              </div>
              {facturaOrigen.estadoEcf && facturaOrigen.estadoEcf !== 'aceptado' && (
                <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                  message="⚠️ Este comprobante aún no ha sido aceptado por la DGII. La nota de crédito podría ser rechazada si el e-CF original no está validado." />
              )}
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>Cliente</Typography.Text>
                  <div><Typography.Text strong>{facturaOrigen.clienteNombre}</Typography.Text></div>
                  {facturaOrigen.clienteRNC && <Typography.Text type="secondary" style={{ fontSize: 11 }}>RNC: {facturaOrigen.clienteRNC}</Typography.Text>}
                </Col>
                <Col xs={24} sm={12}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>eNCF Original (referencia DGII)</Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Typography.Text strong style={{ fontFamily: 'monospace', color: token.colorPrimary }}>{facturaOrigen.encf}</Typography.Text>
                    {facturaOrigen.tipoEcf && <Tag color={ECF_TIPO_COLOR[facturaOrigen.tipoEcf] ?? 'default'} style={{ margin: 0 }}>{facturaOrigen.tipoEcf}</Tag>}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>Fecha: {facturaOrigen.fecha}</Typography.Text>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>Subtotal</Typography.Text>
                  <div><Typography.Text>{fmtNC(Number(facturaOrigen.subtotal))}</Typography.Text></div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>ITBIS</Typography.Text>
                  <div><Typography.Text>{fmtNC(Number(facturaOrigen.iva))}</Typography.Text></div>
                </Col>
                <Col span={8} style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>Total original</Typography.Text>
                  <div><Typography.Text strong style={{ color: token.colorPrimary }}>{fmtNC(Number(facturaOrigen.total))}</Typography.Text></div>
                </Col>
              </Row>
            </div>
          ) : (
            <Alert type="warning" showIcon style={{ marginBottom: 16, fontSize: 12 }}
              message="Busca y selecciona la factura original. El cliente se completará automáticamente." />
          )}

          {/* ── PASO 2: Tipo de nota (CodigoModificacion DGII) ── */}
          <Row gutter={12} style={{ marginBottom: 4 }}>
            <Col xs={24} sm={14}>
              <Form.Item
                label={<Typography.Text strong>Código de Modificación DGII *</Typography.Text>}
                style={{ marginBottom: 8 }}
              >
                <Select
                  value={codigoMod}
                  onChange={setCodigoMod}
                  style={{ width: '100%' }}
                  optionLabelProp="label"
                  options={CODIGOS_MODIFICACION.map(c => ({
                    value: c.value,
                    label: `Código ${c.value}: ${c.label}`,
                    desc:  c.desc,
                  }))}
                  optionRender={(opt: any) => (
                    <div>
                      <Typography.Text strong style={{ fontSize: 13 }}>Código {opt.data.value}: {opt.data.label.split(': ')[1]}</Typography.Text>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>{opt.data.desc}</Typography.Text>
                    </div>
                  )}
                />
              </Form.Item>
            </Col>
            <Col span={10} style={{ paddingTop: 30 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {CODIGOS_MODIFICACION.find(c => c.value === codigoMod)?.desc}
              </Typography.Text>
            </Col>
          </Row>

          {/* Advertencia para anulación total */}
          {codigoMod === '1' && facturaOrigen && (
            <Alert type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
              message={`Esta acción anulará completamente la factura ${facturaOrigen.folio} (${facturaOrigen.encf}) ante la DGII. Esta acción es definitiva e irreversible.`}
            />
          )}

          {/* ── PASO 3: Datos adicionales ── */}
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="descripcionMotivo" label="Descripción / Notas"><Input placeholder="Detalle adicional..." /></Form.Item></Col>
          </Row>

          {/* Ítems — ocultos para anulación total (se genera automáticamente) */}
          {codigoMod !== '1' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Ítems a acreditar</Divider>
              <Form.List name="detalles">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name }) => (
                      <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                        <Col xs={24} sm={7}><Form.Item name={[name, 'productoId']} noStyle><Select showSearch optionFilterProp="children" placeholder="Producto" style={{ width: '100%' }} allowClear onChange={pid => { const p = productos.find((x: any) => x.id === pid); if (p) { const ds = formCrear.getFieldValue('detalles'); ds[name] = { ...ds[name], descripcion: p.nombre, precioUnitario: p.precio }; formCrear.setFieldsValue({ detalles: ds }); }}}>{productos.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}</Select></Form.Item></Col>
                        <Col xs={24} sm={7}><Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: '' }]}><Input placeholder="Descripción *" /></Form.Item></Col>
                        <Col xs={12} sm={4}><Form.Item name={[name, 'cantidad']} noStyle rules={[{ required: true }]}><InputNumber min={0.01} placeholder="Cant." style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={12} sm={5}><Form.Item name={[name, 'precioUnitario']} noStyle rules={[{ required: true }]}><InputNumber min={0} placeholder="Precio unit." style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={12} sm={1}>{fields.length > 1 && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />}</Col>
                      </Row>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Agregar línea</Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          <Form.Item name="notas" label="Notas" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item>

          {/* ── Resumen ── */}
          {facturaOrigen && (codigoMod === '1' || totalNC > 0) && (
            <div style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
              <Typography.Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Resumen</Typography.Text>
              <Row justify="space-between" style={{ marginBottom: 3 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>Factura original:</Typography.Text><Typography.Text style={{ fontSize: 12 }}>{fmtNC(Number(facturaOrigen.total))}</Typography.Text></Row>
              {codigoMod === '1' ? (
                <Row justify="space-between" style={{ marginBottom: 3 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>Monto anulado:</Typography.Text><Typography.Text style={{ fontSize: 12, color: '#dc2626' }}>-{fmtNC(Number(facturaOrigen.total))}</Typography.Text></Row>
              ) : (
                <>
                  <Row justify="space-between" style={{ marginBottom: 3 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>Monto a acreditar (subtotal):</Typography.Text><Typography.Text style={{ fontSize: 12, color: '#dc2626' }}>-{fmtNC(subtotalNC)}</Typography.Text></Row>
                  <Row justify="space-between" style={{ marginBottom: 3 }}><Typography.Text type="secondary" style={{ fontSize: 12 }}>ITBIS a revertir (18%):</Typography.Text><Typography.Text style={{ fontSize: 12, color: '#dc2626' }}>-{fmtNC(itbisNC)}</Typography.Text></Row>
                  {codigoMod === '3' && totalNC > Number(facturaOrigen.total) && (
                    <Alert type="error" showIcon style={{ marginTop: 6, fontSize: 11 }} message={`El monto (${fmtNC(totalNC)}) supera el total original (${fmtNC(Number(facturaOrigen.total))})`} />
                  )}
                </>
              )}
              <Divider style={{ margin: '6px 0' }} />
              <Row justify="space-between">
                <Typography.Text strong style={{ fontSize: 12 }}>Saldo pendiente del cliente:</Typography.Text>
                <Typography.Text strong style={{ fontSize: 14, color: '#1a56db' }}>
                  {fmtNC(codigoMod === '1' ? 0 : Number(facturaOrigen.total) - totalNC)}
                </Typography.Text>
              </Row>
            </div>
          )}
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal
        title={<Space><FileTextOutlined />NC {modalDetalle?.numero} <Tag color={ESTADO_CONFIG[modalDetalle?.estado ?? 'borrador']?.color}>{ESTADO_CONFIG[modalDetalle?.estado ?? 'borrador']?.label}</Tag></Space>}
        open={!!modalDetalle}
        onCancel={() => setModalDetalle(null)}
        footer={null}
        width={600}
        destroyOnClose
      >
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12}><Text type="secondary" style={{ fontSize: 11 }}>Cliente</Text><div><Text strong>{modalDetalle.cliente?.nombre}</Text></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Tipo NCF</Text><div><Tag color="blue">{modalDetalle.tipoNcf}</Tag></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Fecha</Text><div><Text>{modalDetalle.fecha}</Text></div></Col>
            </Row>
            {modalDetalle.facturaOriginalFolio && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Factura original: </Text>
                <Tag color="orange">{modalDetalle.facturaOriginalFolio}</Tag>
              </div>
            )}
            {modalDetalle.descripcionMotivo && (
              <div style={{ background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '6px 12px', marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{modalDetalle.descripcionMotivo}</Text>
              </div>
            )}
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={modalDetalle.detalles} rowKey="id" pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cant.',       dataIndex: 'cantidad',    key: 'c', align: 'right' },
                { title: 'Precio',      dataIndex: 'precioUnitario', key: 'p', align: 'right', render: v => fmt(v) },
                { title: 'ITBIS',       dataIndex: 'iva',         key: 'i', align: 'right', render: v => fmt(v) },
                { title: 'Total',       dataIndex: 'total',       key: 't', align: 'right', render: v => <Text strong style={{ color: token.colorError }}>{fmt(v)}</Text> },
              ]}
            />
            <Divider />
            <Row justify="end" gutter={24}>
              <Col><Text type="secondary">Subtotal: {fmt(modalDetalle.subtotal)}</Text></Col>
              <Col><Text type="secondary">ITBIS: {fmt(modalDetalle.iva)}</Text></Col>
              <Col><Text strong style={{ fontSize: 16, color: token.colorError }}>Total NC: -{fmt(modalDetalle.total)}</Text></Col>
            </Row>
          </>
        )}
      </Modal>

      {/* Modal e-CF E34 */}
      <Modal
        title={<Space><AuditOutlined style={{ color: '#7c3aed' }} />Emitir e-CF E34 — Nota de Crédito</Space>}
        open={!!ecfModal}
        onCancel={() => setEcfModal(null)}
        onOk={() => ecfModal && emitirEcfMut.mutate({ id: ecfModal.id, codigo: ecfCodigo })}
        confirmLoading={emitirEcfMut.isPending}
        okText="Emitir e-CF E34"
        okButtonProps={{ style: { background: '#7c3aed', borderColor: '#7c3aed' } }}
        destroyOnClose
        width={460}
      >
        {ecfModal && (
          <div style={{ paddingTop: 8 }}>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
              NC <strong>{ecfModal.numero}</strong> · Cliente: <strong>{ecfModal.cliente?.nombre ?? '—'}</strong>
              · Total: <strong>{fmt(ecfModal.total)}</strong>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Código de Modificación <span style={{ color: 'red' }}>*</span>
              </label>
              <Select
                value={ecfCodigo}
                onChange={v => setEcfCodigo(v as string)}
                style={{ width: '100%' }}
                size="large"
              >
                <Select.Option value="1">1 — Anulación total</Select.Option>
                <Select.Option value="2">2 — Corrección de texto</Select.Option>
                <Select.Option value="3">3 — Corrección de montos</Select.Option>
                <Select.Option value="4">4 — Reemplazo de contingencia</Select.Option>
                <Select.Option value="5">5 — Referencia a Factura de Consumo</Select.Option>
              </Select>
            </div>
            {ecfCodigo === '1' && (
              <div style={{ background: token.colorErrorBg, border: `1px solid ${token.colorErrorBorder}`, borderRadius: 8, padding: '10px 14px' }}>
                <strong style={{ color: '#dc2626' }}>Anulación total:</strong>
                <span style={{ color: '#7f1d1d', fontSize: 13 }}> El monto de la nota debe ser igual al de la factura original. La factura original quedará marcada como anulada en DGII.</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal email */}
      <Modal
        title={<><MailOutlined style={{ color: '#059669', marginRight: 8 }} />Enviar Nota de Crédito</>}
        open={!!emailNota} onCancel={() => { setEmailNota(null); setEmailDest(''); }}
        onOk={() => emailNota && emailMut.mutate({ id: emailNota.id, email: emailDest })}
        confirmLoading={emailMut.isPending} okText="Enviar" destroyOnClose width={400}
      >
        {emailNota && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
              NC <strong>{emailNota.numero}</strong> · Cliente: <strong>{emailNota.cliente?.nombre ?? '—'}</strong>
            </p>
            <Input prefix={<MailOutlined />} placeholder="correo@cliente.com"
              value={emailDest} onChange={e => setEmailDest(e.target.value)} size="large" />
          </div>
        )}
      </Modal>

      <EcfResultModal encf={ecfResultEncf} onClose={() => setEcfResultEncf(null)} />
    </div>
  );
}
