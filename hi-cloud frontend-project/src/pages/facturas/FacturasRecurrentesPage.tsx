import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Space,
         Modal, Form, Input, InputNumber, Select, AutoComplete, message,
         Switch, Descriptions, Divider, Tooltip, theme, Tabs, Empty, Alert,
         Spin, Segmented } from 'antd';
import { PlusOutlined, ThunderboltOutlined, DeleteOutlined, EditOutlined,
         FileExcelOutlined, WarningOutlined, ClockCircleOutlined, SearchOutlined,
         FileTextOutlined, EyeOutlined, MailOutlined, SendOutlined,
         CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const frecuenciaLabel: Record<string, string> = {
  diaria: '📅 Diaria', semanal: '📆 Semanal',
  mensual: '🗓️ Mensual', anual: '📅 Anual',
};

const DIAS_SEMANA = [
  { value: 1, label: 'Lunes' },    { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },{ value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

/** Códigos DGII, los mismos que guarda `facturas.formasPago`. */
const FORMAS_PAGO = [
  { value: 1, label: 'Efectivo' },
  { value: 2, label: 'Transferencia / Cheque' },
  { value: 3, label: 'Tarjeta' },
  { value: 4, label: 'Crédito (con plazo)' },
];
const formaPagoLabel = (v: number) =>
  FORMAS_PAGO.find(f => f.value === v)?.label ?? `Tipo ${v}`;

const recurrenteApi = {
  list: (p = 1, search = '') =>
    api.get(`/facturas-recurrentes?page=${p}&limit=10${search ? `&search=${encodeURIComponent(search)}` : ''}`)
       .then(r => r.data?.data ?? r.data),
  get:       (id: number) => api.get(`/facturas-recurrentes/${id}`).then(r => r.data?.data ?? r.data),
  create:    (body: any) => api.post('/facturas-recurrentes', body).then(r => r.data?.data ?? r.data),
  update:    (id: number, body: any) => api.put(`/facturas-recurrentes/${id}`, body).then(r => r.data?.data ?? r.data),
  toggle:    (id: number) => api.patch(`/facturas-recurrentes/${id}/toggle`).then(r => r.data?.data ?? r.data),
  ejecutar:  (id: number) => api.post(`/facturas-recurrentes/${id}/ejecutar-ahora`).then(r => r.data?.data ?? r.data),
  remove:    (id: number) => api.delete(`/facturas-recurrentes/${id}`).then(r => r.data?.data ?? r.data),
  historial: (id: number, p = 1) =>
    api.get(`/facturas-recurrentes/${id}/historial?page=${p}&limit=10`).then(r => r.data?.data ?? r.data),
  tiposEcf:  () => api.get('/facturas-recurrentes/tipos-ecf').then(r => r.data?.data ?? r.data),
  vistaPrevia: (body: any) => api.post('/facturas-recurrentes/vista-previa', body).then(r => r.data?.data ?? r.data),
  reenviarEmail: (facturaId: number) =>
    api.post(`/facturas/${facturaId}/enviar-email`).then(r => r.data?.data ?? r.data),
};

const REC_COLS_DEF = [
  { key: 'nombre',            label: 'Nombre',     defaultVisible: true  },
  { key: 'cli',               label: 'Cliente',    defaultVisible: true  },
  { key: 'frecuencia',        label: 'Frecuencia', defaultVisible: true  },
  { key: 'emite',             label: 'Emite',      defaultVisible: true  },
  { key: 'pago',              label: 'Pago',       defaultVisible: false },
  { key: 'proximaGeneracion', label: 'Próxima',    defaultVisible: true  },
  { key: 'ultimaEjecucion',   label: 'Últ. gen.',  defaultVisible: false },
  { key: 'totalGeneradas',    label: 'Gen.',       defaultVisible: false },
  { key: 'activa',            label: 'Activa',     defaultVisible: true  },
];

interface Linea {
  descripcion: string; cantidad: number; precioUnitario: number;
  porcentajeIva: number; productoId?: number;
}
const LINEA_VACIA: Linea = {
  descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18, productoId: undefined,
};

export default function FacturasRecurrentesPage() {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('facturas-recurrentes', REC_COLS_DEF);
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const [open,   setOpen]   = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [detalle,setDetalle]= useState<any>(null);
  const [histPage, setHistPage] = useState(1);
  const [form]              = Form.useForm();
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }]);
  const [searchIdx,     setSearchIdx]     = useState<number | null>(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [clienteTerm,   setClienteTerm]   = useState('');
  const [previa,        setPrevia]        = useState<any>(null);
  const [previaCargando, setPreviaCargando] = useState(false);
  const qc = useQueryClient();

  // La frecuencia decide qué campo de día se pide; se observa para redibujar.
  const frecuencia = Form.useWatch('frecuencia', form) ?? 'mensual';
  const modoEmision = Form.useWatch('modoEmision', form) ?? 'borrador';
  const formaPago   = Form.useWatch('formaPago', form) ?? 1;
  const diaMes      = Form.useWatch('diaMes', form);

  // Debounce búsqueda de productos
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/productos?search=${encodeURIComponent(searchTerm)}&limit=10`);
        setSearchResults(res.data?.data?.data ?? res.data?.data ?? []);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Los clientes se buscan en el servidor. Antes se cargaban los primeros 100 y
  // punto: en una empresa con más, el cliente que buscabas no aparecía nunca.
  const { data: clientes, isFetching: clientesCargando } = useQuery({
    queryKey: ['clientes-rec', clienteTerm],
    queryFn:  () => clientesApi.list(1, 20, clienteTerm),
  });

  const { data: tiposEcf } = useQuery({
    queryKey: ['recurrentes-tipos-ecf'],
    queryFn:  recurrenteApi.tiposEcf,
    staleTime: 5 * 60 * 1000,
  });

  const { data: detalleRefresh } = useQuery({
    queryKey: ['recurrente', detalle?.id],
    queryFn:  () => recurrenteApi.get(detalle!.id),
    enabled:  !!detalle?.id,
  });

  const { data: historialData, isLoading: histLoading } = useQuery({
    queryKey: ['recurrente-historial', detalle?.id, histPage],
    queryFn:  () => recurrenteApi.historial(detalle!.id, histPage),
    enabled:  !!detalle?.id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recurrentes', page, search],
    queryFn:  () => recurrenteApi.list(page, search),
  });

  const cerrarModal = () => {
    setOpen(false); setEditando(null); setPrevia(null);
    setSearchResults([]); setSearchIdx(null);
  };

  const guardarMut = useMutation({
    mutationFn: (body: any) => editando
      ? recurrenteApi.update(editando.id, body)
      : recurrenteApi.create(body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['recurrentes'] });
      qc.invalidateQueries({ queryKey: ['recurrente'] });
      message.success(
        editando
          ? 'Plantilla actualizada'
          : `Plantilla creada. La primera factura sale el ${fmt.date(r?.proximaGeneracion)}`,
        6,
      );
      cerrarModal();
    },
    onError: (e: any) => message.error(
      e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Error al guardar', 8,
    ),
  });

  const toggleMut = useMutation({
    mutationFn: recurrenteApi.toggle,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['recurrentes'] });
      message.success(r?.activa ? 'Recurrente reanudada' : 'Recurrente pausada (no se borra)');
    },
  });

  const ejecutMut = useMutation({
    mutationFn: recurrenteApi.ejecutar,
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['recurrentes'] });
      qc.invalidateQueries({ queryKey: ['recurrente-historial'] });
      const folio = u?.folio ?? 'nueva';
      if (u?.ecfEmitido === false) {
        message.warning(
          `Factura ${folio} generada, pero SIN comprobante fiscal: ${u.ecfError}`, 12,
        );
      } else if (u?.ecfEmitido === true) {
        message.success(`Factura ${folio} emitida con ${u.ecfNumero ?? 'e-CF'}`, 8);
      } else if (u?.emailEnviado) {
        message.success(`Factura ${folio} generada y enviada a ${u.emailDestino}`, 8);
      } else {
        message.success(`Factura ${folio} generada en borrador`, 8);
      }
      if (u?.emailError) message.warning(`El correo no salió: ${u.emailError}`, 10);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Error al generar', 10,
    ),
  });

  const removeMut = useMutation({
    mutationFn: recurrenteApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Eliminada'); },
  });

  const reenviarMut = useMutation({
    mutationFn: recurrenteApi.reenviarEmail,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['recurrente-historial'] });
      message.success(`Factura reenviada a ${r?.destino}`, 6);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? 'No se pudo reenviar el correo', 8,
    ),
  });

  // ── Construcción del cuerpo que se manda al backend ──────────────────────
  const cuerpoDesdeForm = (values: any) => {
    const esSemanal = values.frecuencia === 'semanal';
    const esDiaria  = values.frecuencia === 'diaria';
    const conEcf    = values.modoEmision === 'ecf';
    const aCredito  = Number(values.formaPago) === 4;
    return {
      nombre:      values.nombre,
      clienteId:   values.clienteId,
      frecuencia:  values.frecuencia,
      diaMes:      esSemanal || esDiaria ? undefined : Number(values.diaMes),
      diaSemana:   esSemanal ? Number(values.diaSemana) : undefined,
      fechaInicio: values.fechaInicio,
      fechaFin:    values.fechaFin || undefined,
      modoEmision: values.modoEmision ?? 'borrador',
      tipoEcf:     conEcf ? values.tipoEcf : undefined,
      formaPago:   Number(values.formaPago ?? 1),
      diasCredito: aCredito ? Number(values.diasCredito ?? 30) : 0,
      emailCliente:    values.emailCliente ?? true,
      avisoPrevioDias: Number(values.avisoPrevioDias ?? 0),
      notas:       values.notas,
      detalles: lineas.map(l => ({
        descripcion:    l.descripcion,
        productoId:     l.productoId,
        cantidad:       Number(l.cantidad)       || 1,
        precioUnitario: Number(l.precioUnitario) || 0,
        porcentajeIva:  Number(l.porcentajeIva)  || 0,
      })),
    };
  };

  const validarLineas = (): boolean => {
    const idxSinDesc   = lineas.findIndex(l => !l.descripcion.trim());
    const idxSinPrecio = lineas.findIndex(l => l.precioUnitario <= 0);
    if (idxSinDesc  >= 0) { message.warning(`El ítem ${idxSinDesc + 1} no tiene descripción`); return false; }
    if (idxSinPrecio >= 0) { message.warning(`El ítem ${idxSinPrecio + 1} necesita precio mayor a 0`); return false; }
    return true;
  };

  const handleSubmit = (values: any) => {
    if (!validarLineas()) return;
    guardarMut.mutate(cuerpoDesdeForm(values));
  };

  const verVistaPrevia = async () => {
    try {
      const values = await form.validateFields();
      if (!validarLineas()) return;
      setPreviaCargando(true);
      const p = await recurrenteApi.vistaPrevia(cuerpoDesdeForm(values));
      setPrevia(p);
    } catch (e: any) {
      if (e?.errorFields) return; // el formulario ya marcó los campos
      message.error(e?.response?.data?.message ?? 'No se pudo generar la vista previa', 8);
    } finally {
      setPreviaCargando(false);
    }
  };

  const abrirNueva = () => {
    setEditando(null);
    setLineas([{ ...LINEA_VACIA }]);
    setPrevia(null);
    form.resetFields();
    form.setFieldsValue({
      frecuencia: 'mensual', diaMes: 1, modoEmision: 'borrador',
      formaPago: 1, diasCredito: 0, emailCliente: true, avisoPrevioDias: 0,
      fechaInicio: dayjs().format('YYYY-MM-DD'),
    });
    setOpen(true);
  };

  const abrirEdicion = (r: any) => {
    setEditando(r);
    setPrevia(null);
    setLineas((r.detalles ?? []).map((d: any) => ({
      descripcion:    d.descripcion ?? '',
      cantidad:       Number(d.cantidad ?? 1),
      precioUnitario: Number(d.precioUnitario ?? 0),
      porcentajeIva:  Number(d.porcentajeIva ?? 18),
      productoId:     d.productoId,
    })));
    form.setFieldsValue({
      nombre:      r.nombre,
      clienteId:   r.clienteId,
      frecuencia:  r.frecuencia,
      diaMes:      r.diaMes ?? 1,
      diaSemana:   r.diaSemana ?? 1,
      fechaInicio: r.fechaInicio ? dayjs(r.fechaInicio).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      fechaFin:    r.fechaFin ? dayjs(r.fechaFin).format('YYYY-MM-DD') : '',
      modoEmision: r.modoEmision ?? 'borrador',
      tipoEcf:     r.tipoEcf,
      formaPago:   r.formaPago ?? 1,
      diasCredito: r.diasCredito ?? 0,
      emailCliente:    r.emailCliente ?? true,
      avisoPrevioDias: r.avisoPrevioDias ?? 0,
      notas:       r.notas,
    });
    setOpen(true);
  };

  const hoy = dayjs().startOf('day');

  const opcionesCliente = useMemo(() => {
    const lista = (clientes?.data ?? []).map((c: any) => ({ value: c.id, label: c.nombre }));
    // El cliente de la plantilla que se está editando puede no venir en la
    // primera página del buscador; sin esto el Select se ve vacío.
    if (editando?.clienteId && !lista.some((o: any) => o.value === editando.clienteId)) {
      lista.unshift({ value: editando.clienteId, label: editando.cliente?.nombre ?? 'Cliente actual' });
    }
    return lista;
  }, [clientes, editando]);

  const cols = [
    { title: 'Nombre',  dataIndex: 'nombre', ellipsis: true,
      render: (v: string, r: any) => (
        <span>
          <Text strong>{v}</Text>
          {r.ultimoError && (
            <Tooltip title={r.ultimoError}>
              <Text type="danger" style={{ fontSize: 11, display: 'block' }}>
                <WarningOutlined /> El último ciclo falló
              </Text>
            </Tooltip>
          )}
          {!r.ultimoError && r.notas && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.notas}</Text>
          )}
        </span>
      )},
    { title: 'Cliente', key: 'cli', width: 160, ellipsis: true,
      render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
    { title: 'Frecuencia', dataIndex: 'frecuencia', width: 130,
      render: (v: string, r: any) => (
        <span>
          <Tag>{frecuenciaLabel[v] ?? v}</Tag>
          {r.diaMes && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>día {r.diaMes}</Text>
          )}
          {r.diaSemana && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
              {DIAS_SEMANA.find(d => d.value === r.diaSemana)?.label}
            </Text>
          )}
        </span>
      )},
    { title: 'Emite', key: 'emite', width: 100,
      render: (_: any, r: any) => r.modoEmision === 'ecf'
        ? <Tag color="gold">{r.tipoEcf}</Tag>
        : <Tag>Borrador</Tag> },
    { title: 'Pago', key: 'pago', width: 130,
      render: (_: any, r: any) => (
        <span style={{ fontSize: 12 }}>
          {formaPagoLabel(r.formaPago)}
          {r.formaPago === 4 && r.diasCredito
            ? <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.diasCredito} días</Text>
            : null}
        </span>
      )},
    { title: 'Próxima', dataIndex: 'proximaGeneracion', width: 125,
      render: (v: string | null, r: any) => {
        if (!v) return <Text type="secondary" style={{ fontSize: 11 }}>{r.activa ? '—' : 'Pausada'}</Text>;
        const fecha = dayjs(v);
        const vencida = fecha.isBefore(hoy);
        return (
          <Tooltip title={r.explicacionDia ?? (vencida ? 'Fecha vencida — se generará en el próximo barrido' : undefined)}>
            <span style={{ color: vencida ? token.colorError : 'inherit', fontWeight: vencida ? 600 : 400 }}>
              {vencida && <WarningOutlined style={{ marginRight: 4 }} />}
              {fecha.format('DD/MM/YYYY')}
            </span>
          </Tooltip>
        );
      }},
    { title: 'Últ. gen.', dataIndex: 'ultimaEjecucion', width: 105,
      render: (v: string) => v ? (
        <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />{dayjs(v).format('DD/MM/YYYY')}
        </span>
      ) : <Text type="secondary" style={{ fontSize: 11 }}>—</Text> },
    { title: 'Gen.',   dataIndex: 'totalGeneradas', width: 55, align: 'center' as const },
    { title: 'Activa', dataIndex: 'activa', width: 72,
      render: (v: boolean, r: any) => (
        <Tooltip title={v ? 'Pausar sin borrar' : 'Reanudar'}>
          <Switch checked={v} size="small" loading={toggleMut.isPending}
            onChange={() => toggleMut.mutate(r.id)} />
        </Tooltip>
      )},
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalle(r)}
          viewLabel="Ver detalle"
          items={[
            { key: 'editar', label: 'Editar plantilla', icon: <EditOutlined />,
              onClick: () => abrirEdicion(r) },
            { key: 'ejecutar', label: 'Generar factura ahora', icon: <ThunderboltOutlined />,
              onClick: () => Modal.confirm({
                title: 'Generar la factura ahora',
                content: r.modoEmision === 'ecf'
                  ? `Se generará la factura y se emitirá con comprobante fiscal ${r.tipoEcf}. Esto consume un número de la secuencia.`
                  : 'Se generará la factura en borrador, sin comprobante fiscal.',
                okText: 'Generar',
                cancelText: 'Cancelar',
                onOk: () => ejecutMut.mutateAsync(r.id),
              }) },
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
              onClick: () => Modal.confirm({
                title: '¿Eliminar esta factura recurrente?',
                content: 'Si sólo quieres que deje de generar, púsala con el interruptor: se conserva el historial.',
                okText: 'Eliminar',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                onOk: () => removeMut.mutate(r.id),
              }) },
          ]}
        />
      )},
  ];

  return (
    <div>
      {/* El desplegable del buscador de ítems venía heredando el ancho del
          campo (~250px en un modal de 700) y encima recortaba el nombre con
          ellipsis: los productos con nombre largo eran indistinguibles. */}
      <style>{`
        .rec-item-popup .ant-select-item-option-content {
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
        }
      `}</style>

      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Facturas Recurrentes</Title></Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por nombre o cliente..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
              style={{ width: 220 }}
            />
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (data?.data ?? []).map((r: any) => ({
                'Nombre':      r.nombre ?? '',
                'Cliente':     r.cliente?.nombre ?? '',
                'Frecuencia':  r.frecuencia ?? '',
                'Día':         r.diaMes ?? r.diaSemana ?? '',
                'Emite':       r.modoEmision === 'ecf' ? r.tipoEcf : 'Borrador',
                'Forma pago':  formaPagoLabel(r.formaPago),
                'Próxima':     r.proximaGeneracion ?? '',
                'Generadas':   r.totalGeneradas ?? 0,
                'Activa':      r.activa ? 'Sí' : 'No',
              }));
              exportarExcel(filas, 'Facturas-Recurrentes');
            }}>Excel</Button>
            <ColumnToggle columns={REC_COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['recurrentes']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNueva}>
              Nueva recurrente
            </Button>
          </Space>
        </Col>
      </Row>

      <Table columns={filterColumns(cols)} dataSource={data?.data ?? []} rowKey="id"
        loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* Drawer detalle */}
      {(() => {
        const det = detalleRefresh ?? detalle;
        const isVencida = det?.fechaFin && dayjs(det.fechaFin).isBefore(hoy);
        const estadoLabel = det?.activa ? 'Activa' : isVencida ? 'Terminada' : 'Pausada';
        const estadoColor = det?.activa ? 'green' : isVencida ? 'volcano' : 'default';

        const facturaEstadoColor: Record<string, string> = {
          borrador: 'default', emitida: 'blue', pagada: 'green', cancelada: 'red',
        };

        const historialCols = [
          { title: 'Folio', dataIndex: 'folio', width: 110,
            render: (v: string, r: any) => (
              <Button type="link" size="small" icon={<EyeOutlined />} style={{ padding: 0 }}
                onClick={() => { setDetalle(null); navigate(`/facturas/${r.id}`); }}>
                {v}
              </Button>
            )},
          { title: 'Fecha', dataIndex: 'fecha', width: 100,
            render: (v: string) => fmt.date(v) },
          { title: 'Estado', dataIndex: 'estado', width: 90,
            render: (v: string) => <Tag color={facturaEstadoColor[v] ?? 'default'}>{v}</Tag> },
          { title: 'Correo', key: 'correo', width: 90,
            render: (_: any, r: any) => {
              if (r.emailEstado === 'enviado') {
                return (
                  <Tooltip title={`Enviada a ${r.emailDestino} el ${fmt.date(r.emailEnviadoAt)}`}>
                    <Tag color="green" style={{ marginInlineEnd: 0 }}>
                      <CheckCircleOutlined /> Enviado
                    </Tag>
                  </Tooltip>
                );
              }
              if (r.emailEstado === 'fallido') {
                return (
                  <Tooltip title={r.emailError}>
                    <Button size="small" danger type="text" icon={<SendOutlined />}
                      loading={reenviarMut.isPending}
                      onClick={() => reenviarMut.mutate(r.id)}>
                      Reenviar
                    </Button>
                  </Tooltip>
                );
              }
              return (
                <Tooltip title="Enviar la factura al cliente">
                  <Button size="small" type="text" icon={<MailOutlined />}
                    loading={reenviarMut.isPending}
                    onClick={() => reenviarMut.mutate(r.id)} />
                </Tooltip>
              );
            }},
          { title: 'Total', dataIndex: 'total', align: 'right' as const,
            render: (v: number) => <Text strong>{fmt.money(Number(v))}</Text> },
        ];

        return (
          <DetailDrawer
            open={!!detalle}
            onClose={() => { setDetalle(null); setHistPage(1); }}
            title={det?.nombre ?? 'Recurrente'}
            extra={
              <Space>
                <Tag color={estadoColor}>{estadoLabel}</Tag>
                <Tag>{frecuenciaLabel[det?.frecuencia] ?? det?.frecuencia}</Tag>
              </Space>
            }
            sections={[]}
            footer={
              <Space>
                <Button icon={<EditOutlined />}
                  onClick={() => { const r = det; setDetalle(null); abrirEdicion(r); }}>
                  Editar
                </Button>
                <Button icon={<ThunderboltOutlined />} type="primary"
                  loading={ejecutMut.isPending}
                  onClick={() => { if (detalle) ejecutMut.mutate(detalle.id); }}>
                  Generar ahora
                </Button>
                <Button onClick={() => { setDetalle(null); setHistPage(1); }}>Cerrar</Button>
              </Space>
            }
          >
            <Tabs
              size="small"
              items={[
                {
                  key: 'info',
                  label: 'Información',
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      {det?.ultimoError && (
                        <Alert type="error" showIcon style={{ marginBottom: 12 }}
                          message="El último ciclo no se completó"
                          description={
                            <span style={{ fontSize: 12 }}>
                              {det.ultimoError}
                              {det.ultimoErrorAt && (
                                <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                                  {fmt.date(det.ultimoErrorAt)}
                                </Text>
                              )}
                            </span>
                          } />
                      )}
                      {det?.ciclosSaltados > 0 && (
                        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                          message={`${det.ciclosSaltados} ciclo(s) saltados`}
                          description={
                            <span style={{ fontSize: 12 }}>
                              El servidor no corrió esos días. Se generó UNA factura al volver,
                              no las atrasadas: si hacen falta, hay que emitirlas a mano.
                            </span>
                          } />
                      )}

                      <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label="Cliente" span={2}>
                          {det?.cliente?.nombre ?? '—'}
                          {det?.cliente?.email && (
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              {det.cliente.email}
                            </Text>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Frecuencia">
                          {frecuenciaLabel[det?.frecuencia] ?? det?.frecuencia}
                        </Descriptions.Item>
                        <Descriptions.Item label="Día">
                          {det?.diaSemana
                            ? DIAS_SEMANA.find(d => d.value === det.diaSemana)?.label
                            : det?.diaMes
                              ? `Día ${det.diaMes} del mes`
                              : 'Todos los días'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Próxima generación" span={2}>
                          {det?.proximaGeneracion ? (
                            <>
                              <Text strong style={{ color: token.colorPrimary }}>
                                {dayjs(det.proximaGeneracion).format('dddd, D [de] MMMM [de] YYYY')}
                              </Text>
                              {det.explicacionDia && (
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                  {det.explicacionDia}
                                </Text>
                              )}
                            </>
                          ) : (
                            <Text type="secondary">
                              {det?.activa ? '—' : 'Pausada: no generará hasta reanudarla'}
                            </Text>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Emite">
                          {det?.modoEmision === 'ecf'
                            ? <Tag color="gold">{det.tipoEcf}</Tag>
                            : <Tag>Borrador</Tag>}
                        </Descriptions.Item>
                        <Descriptions.Item label="Forma de pago">
                          {formaPagoLabel(det?.formaPago)}
                          {det?.formaPago === 4 && (
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              {det.diasCredito} días de plazo
                            </Text>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Correo al cliente">
                          {det?.emailCliente
                            ? <Tag color="blue" icon={<MailOutlined />}>Sí</Tag>
                            : <Tag icon={<CloseCircleOutlined />}>No</Tag>}
                        </Descriptions.Item>
                        <Descriptions.Item label="Aviso previo">
                          {det?.avisoPrevioDias
                            ? `${det.avisoPrevioDias} días antes`
                            : <Text type="secondary">Sin aviso</Text>}
                        </Descriptions.Item>
                        <Descriptions.Item label="Últ. generación">
                          {det?.ultimaEjecucion ? dayjs(det.ultimaEjecucion).format('DD/MM/YYYY') : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Total generadas">
                          <Text strong style={{ color: token.colorPrimary }}>{det?.totalGeneradas ?? 0}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Fecha de inicio">
                          {det?.fechaInicio ? dayjs(det.fechaInicio).format('DD/MM/YYYY') : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Fecha de fin">
                          {det?.fechaFin ? dayjs(det.fechaFin).format('DD/MM/YYYY') : 'Sin fecha de fin'}
                        </Descriptions.Item>
                        {det?.notas && (
                          <Descriptions.Item label="Notas" span={2}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{det.notas}</Text>
                          </Descriptions.Item>
                        )}
                      </Descriptions>

                      <Divider orientation="left" plain style={{ fontSize: 12, marginTop: 16 }}>
                        Ítems de la plantilla
                      </Divider>
                      {(det?.detalles ?? []).map((d: any, i: number) => {
                        const desc   = d.descripcion ?? d.concepto ?? d.nombre ?? '—';
                        const cant   = Number(d.cantidad ?? 1);
                        const precio = Number(d.precioUnitario ?? d.precio ?? 0);
                        const iva    = Number(d.porcentajeIva ?? 18);
                        return (
                          <Card key={i} size="small" style={{ marginBottom: 8 }}
                            styles={{ body: { padding: '8px 12px' } }}>
                            <Row justify="space-between">
                              <Col><Text strong style={{ fontSize: 12 }}>{desc}</Text></Col>
                              <Col><Text style={{ fontSize: 12 }}>{cant} × {fmt.money(precio)}</Text></Col>
                            </Row>
                            <Row justify="space-between">
                              <Col><Text type="secondary" style={{ fontSize: 11 }}>ITBIS {iva}%</Text></Col>
                              <Col><Text strong style={{ fontSize: 12 }}>{fmt.money(cant * precio)}</Text></Col>
                            </Row>
                          </Card>
                        );
                      })}
                    </div>
                  ),
                },
                {
                  key: 'historial',
                  label: (
                    <span>
                      <FileTextOutlined style={{ marginRight: 4 }} />
                      Historial
                      {(historialData?.meta?.total > 0) && (
                        <Tag color="blue" style={{ marginLeft: 6, lineHeight: '16px', padding: '0 4px' }}>
                          {historialData.meta.total}
                        </Tag>
                      )}
                    </span>
                  ),
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      {!histLoading && (historialData?.data ?? []).length === 0 ? (
                        <Empty description="Aún no se han generado facturas" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      ) : (
                        <Table
                          columns={historialCols}
                          dataSource={historialData?.data ?? []}
                          rowKey="id"
                          size="small"
                          loading={histLoading}
                          pagination={{
                            total: historialData?.meta?.total,
                            pageSize: 10,
                            current: histPage,
                            onChange: setHistPage,
                            showSizeChanger: false,
                            size: 'small',
                            showTotal: (t: number) => `${t} facturas`,
                          }}
                        />
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </DetailDrawer>
        );
      })()}

      {/* Modal crear / editar */}
      <Modal
        title={editando ? `Editar "${editando.nombre}"` : 'Nueva Factura Recurrente'}
        open={open} onCancel={cerrarModal} footer={null} width={760} destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={12}>
            <Col xs={24} sm={14}>
              <Form.Item name="nombre" label="Nombre descriptivo" rules={[{ required: true }]}>
                <Input placeholder="Ej: Servicio mensual de contabilidad" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select
                  showSearch
                  filterOption={false}
                  onSearch={setClienteTerm}
                  notFoundContent={clientesCargando ? <Spin size="small" /> : 'Sin resultados'}
                  placeholder="Escribe para buscar..."
                  options={opcionesCliente}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ fontSize: 13, marginTop: 0 }}>Cuándo se genera</Divider>
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="frecuencia" label="Frecuencia" rules={[{ required: true }]}>
                <Select options={Object.keys(frecuenciaLabel).map(k => ({ value: k, label: frecuenciaLabel[k] }))} />
              </Form.Item>
            </Col>

            {frecuencia === 'semanal' && (
              <Col xs={24} sm={8}>
                <Form.Item name="diaSemana" label="Día de la semana" rules={[{ required: true }]}>
                  <Select options={DIAS_SEMANA} />
                </Form.Item>
              </Col>
            )}

            {(frecuencia === 'mensual' || frecuencia === 'anual') && (
              <Col xs={24} sm={8}>
                <Form.Item
                  name="diaMes"
                  label="Día del mes"
                  rules={[{ required: true }]}
                  extra={
                    <span style={{ fontSize: 11 }}>
                      {Number(diaMes) > 28
                        ? `En los meses que no llegan al ${diaMes} se genera el ÚLTIMO día del mes (febrero: 28 o 29). Nunca se salta un mes.`
                        : 'Del 1 al 31. Si eliges 29, 30 o 31, en los meses más cortos se genera el último día del mes.'}
                    </span>
                  }
                >
                  <InputNumber style={{ width: '100%' }} min={1} max={31} />
                </Form.Item>
              </Col>
            )}

            {frecuencia === 'diaria' && (
              <Col xs={24} sm={8}>
                <Form.Item label="Día">
                  <Input disabled value="Todos los días" />
                </Form.Item>
              </Col>
            )}

            <Col xs={24} sm={8}>
              <Form.Item name="fechaInicio" label="Empieza a contar desde" rules={[{ required: true }]}
                extra={<span style={{ fontSize: 11 }}>No decide el día: eso lo manda el campo de arriba.</span>}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaFin" label="Fecha de fin (opcional)"
                extra={<span style={{ fontSize: 11 }}>Al pasarla, la plantilla se pausa sola.</span>}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="avisoPrevioDias" label="Avisarme antes (días)"
                extra={<span style={{ fontSize: 11 }}>0 = sin aviso. Útil con e-CF.</span>}>
                <InputNumber style={{ width: '100%' }} min={0} max={30} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>Qué emite y cómo se paga</Divider>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="modoEmision" label="Al generarse">
                <Segmented
                  block
                  options={[
                    { value: 'borrador', label: 'Dejar en borrador' },
                    { value: 'ecf',      label: 'Emitir con e-CF' },
                  ]}
                />
              </Form.Item>
            </Col>

            {modoEmision === 'ecf' && (
              <Col xs={24} sm={14}>
                <Form.Item name="tipoEcf" label="Tipo de comprobante" rules={[{ required: true }]}
                  extra={<span style={{ fontSize: 11 }}>Sólo los tipos con secuencia disponible en esta empresa.</span>}>
                  <Select
                    placeholder={(tiposEcf ?? []).length ? 'Elegir tipo' : 'Esta empresa no tiene secuencias activas'}
                    disabled={!(tiposEcf ?? []).length}
                    options={(tiposEcf ?? []).map((t: any) => ({
                      value: t.codigo,
                      label: `${t.codigo} — ${t.nombre} (${t.disponibles} disponibles, vence ${t.vence})`,
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>

          {modoEmision === 'ecf' && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="La factura se emitirá sola, sin que nadie la revise"
              description={
                <span style={{ fontSize: 12 }}>
                  Antes de pedir el número se comprueba la configuración fiscal, la secuencia y
                  el RNC del comprador. Si algo falla, la factura queda en borrador con el motivo
                  y <strong>no se consume secuencia</strong>. Usa la vista previa para verlo ahora.
                </span>
              } />
          )}

          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="formaPago" label="Forma de pago" rules={[{ required: true }]}>
                <Select options={FORMAS_PAGO} />
              </Form.Item>
            </Col>
            {Number(formaPago) === 4 && (
              <Col xs={24} sm={7}>
                <Form.Item name="diasCredito" label="Plazo (días)" rules={[{ required: true }]}
                  extra={<span style={{ fontSize: 11 }}>El vencimiento se cuenta desde la generación.</span>}>
                  <InputNumber style={{ width: '100%' }} min={1} max={365} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={7}>
              <Form.Item name="emailCliente" label="Enviar al cliente" valuePropName="checked"
                extra={<span style={{ fontSize: 11 }}>Con el PDF adjunto.</span>}>
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notas" label="Notas internas (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>Ítems de la factura</Divider>
          {lineas.map((l, i) => (
            <Row key={i} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
              <Col xs={24} sm={9}>
                <AutoComplete
                  style={{ width: '100%' }}
                  popupMatchSelectWidth={460}
                  popupClassName="rec-item-popup"
                  value={l.descripcion}
                  placeholder="Buscar producto o escribir descripción..."
                  options={searchIdx === i
                    ? searchResults.map(p => ({
                        value: p.nombre,
                        label: (
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', gap: 8,
                            fontSize: 12, whiteSpace: 'normal', lineHeight: 1.35,
                          }}>
                            <span style={{ color: '#8c8c8c', flexShrink: 0 }}>{p.codigo}</span>
                            <span style={{ flex: 1, wordBreak: 'break-word' }}>{p.nombre}</span>
                            <span style={{ color: '#10b981', flexShrink: 0 }}>{fmt.money(Number(p.precio ?? 0))}</span>
                          </div>
                        ),
                        producto: p,
                      }))
                    : []
                  }
                  onChange={text => {
                    const u = [...lineas];
                    u[i] = { ...u[i], descripcion: text, productoId: undefined };
                    setLineas(u);
                    setSearchIdx(i);
                    setSearchTerm(text);
                  }}
                  onSelect={(_val, opt: any) => {
                    const p = opt.producto;
                    const u = [...lineas];
                    u[i] = {
                      ...u[i],
                      descripcion:    p.nombre,
                      precioUnitario: Number(p.precio ?? 0),
                      porcentajeIva:  Number(p.porcentajeIva ?? 18),
                      productoId:     p.id,
                    };
                    setLineas(u);
                    setSearchResults([]);
                    setSearchIdx(null);
                  }}
                />
              </Col>
              <Col xs={8} sm={3}>
                <InputNumber placeholder="Cant." min={1} value={l.cantidad} style={{ width:'100%' }}
                  onChange={v => { const u=[...lineas]; u[i].cantidad=Number(v)||1; setLineas(u); }} />
              </Col>
              <Col xs={8} sm={5}>
                <InputNumber placeholder="Precio unitario" min={0} precision={2} value={l.precioUnitario} style={{ width:'100%' }}
                  onChange={v => { const u=[...lineas]; u[i].precioUnitario=Number(v)||0; setLineas(u); }} />
              </Col>
              <Col xs={8} sm={4}>
                <InputNumber placeholder="ITBIS%" min={0} max={100} value={l.porcentajeIva} style={{ width:'100%' }}
                  onChange={v => { const u=[...lineas]; u[i].porcentajeIva=Number(v)||0; setLineas(u); }} />
              </Col>
              <Col xs={24} sm={2}>
                <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                  = {fmt.money((l.precioUnitario||0) * (l.cantidad||1))}
                </Text>
              </Col>
              <Col xs={24} sm={1} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {lineas.length > 1 && (
                  <Button danger size="small" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>×</Button>
                )}
              </Col>
            </Row>
          ))}
          <Button size="small" onClick={() => setLineas([...lineas, { ...LINEA_VACIA }])}>
            + Agregar ítem
          </Button>

          <div style={{ marginTop: 12, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6, fontSize: 12 }}>
            {(() => {
              const subtotal = lineas.reduce((s, l) => s + (l.precioUnitario||0)*(l.cantidad||1), 0);
              const itbis = lineas.reduce((s, l) => s + (l.precioUnitario||0)*(l.cantidad||1)*(l.porcentajeIva||0)/100, 0);
              return (
                <Row gutter={16}>
                  <Col><Text type="secondary">Subtotal: </Text><Text strong>{fmt.money(subtotal)}</Text></Col>
                  <Col><Text type="secondary">ITBIS: </Text><Text strong>{fmt.money(itbis)}</Text></Col>
                  <Col><Text type="secondary">Total: </Text><Text strong style={{ color: token.colorPrimary }}>{fmt.money(subtotal+itbis)}</Text></Col>
                </Row>
              );
            })()}
          </div>

          {/* Vista previa */}
          {previa && (
            <Card size="small" style={{ marginTop: 12, borderColor: token.colorPrimaryBorder }}
              title={<span style={{ fontSize: 13 }}>Así quedará la factura</span>}
              extra={<Button type="text" size="small" onClick={() => setPrevia(null)}>Ocultar</Button>}>
              {previa.emision?.aviso && (
                <Alert type="error" showIcon style={{ marginBottom: 10 }}
                  message="Con esta configuración NO se podrá emitir el comprobante"
                  description={
                    <span style={{ fontSize: 12 }}>
                      {previa.emision.aviso}
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        La factura se generaría igual, en borrador y sin consumir secuencia.
                      </Text>
                    </span>
                  } />
              )}
              {previa.correo?.aviso && (
                <Alert type="warning" showIcon style={{ marginBottom: 10 }}
                  message={previa.correo.aviso} />
              )}
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="Primera generación" span={2}>
                  <Text strong style={{ color: token.colorPrimary }}>
                    {dayjs(previa.proximaGeneracion).format('dddd, D [de] MMMM [de] YYYY')}
                  </Text>
                  {previa.explicacionDia && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      {previa.explicacionDia}
                    </Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Cliente" span={2}>
                  {previa.cliente?.nombre ?? '—'}
                  {previa.cliente?.rnc && (
                    <Text type="secondary" style={{ fontSize: 11 }}> · RNC {previa.cliente.rnc}</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Emite">
                  {previa.emision?.modo === 'ecf'
                    ? <Tag color="gold">{previa.emision.tipoEcf}</Tag>
                    : <Tag>Borrador</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="Pago">
                  {formaPagoLabel(previa.pago?.formaPago)}
                  {previa.pago?.fechaVencimiento && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      Vence el {fmt.date(previa.pago.fechaVencimiento)}
                    </Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Vendedor">
                  {previa.vendedor?.nombre ?? <Text type="secondary">Sin vendedor asociado</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Correo">
                  {previa.correo?.activo
                    ? (previa.correo.destino ?? <Text type="secondary">sin correo</Text>)
                    : <Text type="secondary">Desactivado</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Total" span={2}>
                  <Text strong style={{ fontSize: 15, color: token.colorPrimary }}>
                    {fmt.money(previa.total)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {'  '}(subtotal {fmt.money(previa.subtotal)} · ITBIS {fmt.money(previa.iva)})
                  </Text>
                </Descriptions.Item>
              </Descriptions>
              <Table
                style={{ marginTop: 10 }}
                size="small" pagination={false} rowKey={(_, i) => String(i)}
                dataSource={previa.lineas ?? []}
                columns={[
                  { title: 'Descripción', dataIndex: 'descripcion' },
                  { title: 'Cant.', dataIndex: 'cantidad', width: 60, align: 'right' as const },
                  { title: 'Precio', dataIndex: 'precioUnitario', width: 110, align: 'right' as const,
                    render: (v: number) => fmt.money(Number(v)) },
                  { title: 'ITBIS', dataIndex: 'porcentajeIva', width: 70, align: 'right' as const,
                    render: (v: number) => `${v}%` },
                  { title: 'Total', dataIndex: 'total', width: 110, align: 'right' as const,
                    render: (v: number) => <Text strong>{fmt.money(Number(v))}</Text> },
                ]}
              />
            </Card>
          )}

          <Row justify="space-between" gutter={8} style={{ marginTop: 16 }}>
            <Col>
              <Button icon={<EyeOutlined />} onClick={verVistaPrevia} loading={previaCargando}>
                Vista previa
              </Button>
            </Col>
            <Col>
              <Space>
                <Button onClick={cerrarModal}>Cancelar</Button>
                <Button type="primary" htmlType="submit" loading={guardarMut.isPending}>
                  {editando ? 'Guardar cambios' : 'Crear factura recurrente'}
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
