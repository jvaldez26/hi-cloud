import { useState, useEffect } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Divider, Steps, Alert,
  message, Spin, theme, Segmented,
} from 'antd';
import {
  CarOutlined, PlusOutlined, SendOutlined, CheckCircleOutlined,
  RollbackOutlined, DeleteOutlined, EyeOutlined, FileExcelOutlined,
  PrinterOutlined, LoadingOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import ProductoSelect from '../../components/ProductoSelect';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import PrintButton from '../../components/ui/PrintButton';

const { Title, Text } = Typography;
const { Option } = Select;

type Modo = 'factura' | 'libre';

interface PendienteItem {
  facturaDetalleId:   number;
  productoId?:        number;
  descripcion:        string;
  unidadMedida:       string;
  cantidadFacturada:  number;
  cantidadDespachada: number;
  cantidadPendiente:  number;
}

const ESTADO_CONFIG: Record<string, { color: string; label: string; step: number }> = {
  generado:    { color: 'blue',    label: 'Generado',    step: 0 },
  en_transito: { color: 'orange',  label: 'En Tránsito', step: 1 },
  entregado:   { color: 'green',   label: 'Entregado',   step: 2 },
  devuelto:    { color: 'red',     label: 'Devuelto',    step: 3 },
};

export default function ConducePage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);

  const [search,          setSearch]          = useState('');
  const [page,            setPage]            = useState(1);
  const [modalCrear,      setModalCrear]      = useState(false);
  const [modalDetalle,    setModalDetalle]    = useState<any>(null);
  const [modalEntrega,    setModalEntrega]    = useState<{ id: number; tipo: 'entregado' | 'devuelto' } | null>(null);
  const [pdfPending,      setPdfPending]      = useState<number | null>(null);

  // Modo del formulario de creación
  const [modo,            setModo]            = useState<Modo>('factura');

  // Estado para modo "factura"
  const [clienteIdSel,    setClienteIdSel]    = useState<number | null>(null);
  const [facturasCliente, setFacturasCliente] = useState<any[]>([]);
  const [pendientes,      setPendientes]      = useState<PendienteItem[]>([]);
  const [cantidades,      setCantidades]      = useState<Record<number, number>>({});
  const [loadingPend,     setLoadingPend]     = useState(false);
  const [todosDespachados, setTodosDespachados] = useState(false);

  const [formCrear]   = Form.useForm();
  const [formEntrega] = Form.useForm();

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['mis-sucursales', empresaActual],
    queryFn:  () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const cargarFacturasCliente = async (cid: number) => {
    try {
      const r = await api.get(`/facturas?clienteId=${cid}&limit=50`);
      const d = (r as any).data?.data ?? (r as any).data;
      const lista = Array.isArray(d) ? d : (d?.data ?? []);
      setFacturasCliente(lista.filter((f: any) => ['emitida', 'pagada'].includes(f.estado)));
    } catch { setFacturasCliente([]); }
  };

  const cargarPendientes = async (facturaId: number) => {
    setLoadingPend(true);
    setPendientes([]);
    setCantidades({});
    setTodosDespachados(false);
    try {
      const r    = await api.get(`/conduces/factura/${facturaId}/pendientes`);
      const data = (r as any).data?.data ?? (r as any).data;
      const items: PendienteItem[] = data?.detalles ?? [];
      const todosDesp: boolean    = data?.todosDespachados ?? false;
      const cli = data?.cliente;

      setPendientes(items);
      setTodosDespachados(todosDesp);

      // Inicializar cantidades con el total pendiente de cada ítem
      const initCant: Record<number, number> = {};
      items.forEach(it => { initCant[it.facturaDetalleId] = it.cantidadPendiente; });
      setCantidades(initCant);

      // Auto-llenar cliente e info de entrega desde la factura si están vacíos
      if (cli) {
        if (!formCrear.getFieldValue('clienteId')) {
          formCrear.setFieldsValue({ clienteId: cli.id });
          setClienteIdSel(cli.id);
        }
        if (cli.direccion && !formCrear.getFieldValue('direccionEntrega')) {
          formCrear.setFieldsValue({
            direccionEntrega: cli.direccion,
            ciudad:           cli.ciudad,
            telefonoContacto: cli.telefono,
          });
        }
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al cargar pendientes');
    } finally {
      setLoadingPend(false);
    }
  };

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['conduces-resumen'],
    queryFn:  () => api.get('/conduces/resumen').then((r: any) => r.data.data ?? r.data ?? []),
  });

  const { data: conduces, isLoading } = useQuery<any>({
    queryKey: ['conduces', page, search],
    queryFn:  () => api.get(`/conduces?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  useEffect(() => {
    if (!modalCrear) return;
    if (sucursales.length === 1) formCrear.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) formCrear.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual, modalCrear]);

  const resetModal = () => {
    setModalCrear(false);
    formCrear.resetFields();
    setClienteIdSel(null);
    setFacturasCliente([]);
    setPendientes([]);
    setCantidades({});
    setLoadingPend(false);
    setTodosDespachados(false);
    setModo('factura');
  };

  const onErr = (e: any, fallback: string) => message.error((e as any)?.friendlyMessage ?? fallback);

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/conduces', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] });
      resetModal();
      message.success('Conduce generado');
    },
    onError: (e: any) => onErr(e, 'Error al generar conduce'),
  });

  const enTransito = useMutation({
    mutationFn: (id: number) => api.patch(`/conduces/${id}/en-transito`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduces'] }); qc.invalidateQueries({ queryKey: ['conduces-resumen'] }); message.success('Conduce en tránsito'); },
    onError: (e: any) => onErr(e, 'Error al actualizar estado'),
  });

  const confirmarEntrega = useMutation({
    mutationFn: ({ id, obs, tipo }: { id: number; obs?: string; tipo: string }) =>
      api.patch(`/conduces/${id}/${tipo === 'entregado' ? 'entregado' : 'devuelto'}`, { observaciones: obs }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] });
      setModalEntrega(null);
      formEntrega.resetFields();
      message.success(v.tipo === 'entregado' ? '¡Entrega confirmada!' : 'Devolución registrada');
    },
    onError: (e: any) => onErr(e, 'Error al confirmar entrega'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/conduces/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduces'] }); qc.invalidateQueries({ queryKey: ['conduces-resumen'] }); message.success('Conduce eliminado'); },
    onError: (e: any) => onErr(e, 'Error al eliminar conduce'),
  });

  const imprimirPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/conduces/${item.id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${(err as any)?.message ?? res.status}`); return;
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

  const handleFinish = (v: any) => {
    const base = {
      clienteId:              v.clienteId,
      fecha:                  v.fecha?.format('YYYY-MM-DD'),
      fechaEntregaProgramada: v.fechaEntregaProgramada?.format('YYYY-MM-DD'),
      direccionEntrega:       v.direccionEntrega,
      ciudad:                 v.ciudad,
      contactoEntrega:        v.contactoEntrega,
      telefonoContacto:       v.telefonoContacto,
      conductor:              v.conductor,
      vehiculo:               v.vehiculo,
      notas:                  v.notas,
      sucursalId:             v.sucursalId,
    };

    if (modo === 'factura') {
      const detallesValidos = pendientes
        .filter(d => (cantidades[d.facturaDetalleId] ?? 0) > 0)
        .map(d => ({
          productoId:   d.productoId,
          descripcion:  d.descripcion,
          unidadMedida: d.unidadMedida,
          cantidad:     cantidades[d.facturaDetalleId],
        }));
      if (!detallesValidos.length) {
        message.warning('Selecciona al menos un producto a despachar (cantidad > 0)');
        return;
      }
      crear.mutate({ ...base, facturaId: v.facturaId, detalles: detallesValidos });
    } else {
      const detalles = (v.detalles ?? []).map((d: any) => ({ ...d, cantidad: Number(d.cantidad) }));
      crear.mutate({ ...base, detalles });
    }
  };

  const COLS_DEF = [
    { key: 'n',     label: 'No.',     defaultVisible: true  },
    { key: 'f',     label: 'Fecha',   defaultVisible: true  },
    { key: 'c',     label: 'Cliente', defaultVisible: true  },
    { key: 'd',     label: 'Destino', defaultVisible: false },
    { key: 'items', label: 'Items',   defaultVisible: true  },
    { key: 'e',     label: 'Estado',  defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('conduces', COLS_DEF);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CarOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Conduces</Title>
            <Text type="secondary">Notas de entrega · Seguimiento de despachos y envíos</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por número o cliente..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (conduces?.data ?? []).map((c: any) => ({
              'Número':   c.numero ?? '',
              'Fecha':    c.fecha ? dayjs(c.fecha).format('DD/MM/YYYY') : '',
              'Cliente':  c.cliente?.nombre ?? '',
              'Factura':  c.facturaFolio ?? c.factura?.folio ?? '',
              'Estado':   c.estado ?? '',
              'Destino':  c.direccionEntrega ?? c.destino ?? '',
            }));
            exportarExcel(filas, `Conduces-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['conduces']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Conduce
          </Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={conduces?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15, current: page, total: conduces?.meta?.total, onChange: setPage, showSizeChanger: false }}
          expandable={{
            expandedRowRender: (r: any) => (
              <Steps
                size="small"
                current={ESTADO_CONFIG[r.estado]?.step ?? 0}
                items={[
                  { title: 'Generado',    description: r.fecha },
                  { title: 'En Tránsito', description: r.fechaEntregaProgramada ?? '' },
                  { title: 'Entregado',   description: r.fechaEntregaReal ? new Date(r.fechaEntregaReal).toLocaleDateString('es-DO') : '' },
                ]}
                style={{ padding: '12px 0' }}
              />
            ),
          }}
          columns={filterColumns([
            { title: 'No.', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'mono' }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
            { title: 'Cliente', key: 'c', render: (_, r: any) => <Text strong>{r.cliente?.nombre}</Text> },
            { title: 'Destino', key: 'd', render: (_, r: any) => <Text type="secondary" style={{ fontSize: 12 }}>{r.ciudad ? `${r.ciudad} · ` : ''}{r.direccionEntrega?.slice(0, 30)}...</Text> },
            { title: 'Ítems', key: 'items', render: (_, r: any) => <Tag>{r.detalles?.length ?? 0} ítem(s)</Tag> },
            { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag> },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setModalDetalle(r)}
                  viewLabel="Ver detalle"
                  items={[
                    { key: 'pdf', label: pdfPending === r.id ? 'Generando...' : 'Imprimir',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
                      disabled: pdfPending === r.id, onClick: () => imprimirPDF(r) },
                    ...(r.estado === 'generado' ? [
                      { key: 'transito', label: 'Marcar En Tránsito', icon: <SendOutlined />, onClick: () => enTransito.mutate(r.id) },
                    ] : []),
                    ...(r.estado === 'en_transito' ? [
                      { key: 'entregar', label: 'Confirmar Entrega', icon: <CheckCircleOutlined />, onClick: () => setModalEntrega({ id: r.id, tipo: 'entregado' }) },
                      { key: 'devolver', label: 'Registrar Devolución', icon: <RollbackOutlined />, onClick: () => setModalEntrega({ id: r.id, tipo: 'devuelto' }) },
                    ] : []),
                    { type: 'divider' as const },
                    { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
                      disabled: r.estado === 'entregado',
                      onClick: () => Modal.confirm({
                        title: '¿Eliminar conduce?',
                        okText: 'Confirmar',
                        cancelText: 'Cancelar',
                        okButtonProps: { danger: true },
                        onOk: () => eliminar.mutate(r.id),
                      }) },
                  ]}
                />
              ),
            },
          ])}
        />
      </Card>

      {/* ── Modal Crear ──────────────────────────────────────────────────────── */}
      <Modal
        title="Nuevo Conduce"
        open={modalCrear}
        onCancel={resetModal}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Generar Conduce"
        width={760}
        destroyOnClose
      >
        <Form
          form={formCrear}
          layout="vertical"
          initialValues={{ fecha: dayjs(), detalles: [{}] }}
          onFinish={handleFinish}
        >
          {/* ── Selector de modo ── */}
          <div style={{ marginBottom: 20 }}>
            <Segmented
              value={modo}
              onChange={v => {
                setModo(v as Modo);
                formCrear.resetFields();
                setPendientes([]);
                setCantidades({});
                setClienteIdSel(null);
                setFacturasCliente([]);
                setTodosDespachados(false);
                formCrear.setFieldsValue({ fecha: dayjs(), detalles: [{}] });
              }}
              options={[
                { label: '📦 Desde Factura', value: 'factura' },
                { label: '✏️ Conduce Libre',  value: 'libre'   },
              ]}
              block
            />
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              {modo === 'factura'
                ? 'Vincula este conduce a una factura existente y despacha sus productos (parcial o total).'
                : 'Crea un conduce sin factura de referencia, agregando productos manualmente.'}
            </Text>
          </div>

          {/* ── MODO FACTURA ── */}
          {modo === 'factura' && (
            <>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="clienteId" label="Cliente" rules={[{ required: true, message: 'Selecciona el cliente' }]}>
                    <Select
                      showSearch optionFilterProp="children"
                      placeholder="Seleccionar cliente"
                      onChange={(cid: number) => {
                        setClienteIdSel(cid);
                        formCrear.setFieldsValue({ facturaId: undefined });
                        setFacturasCliente([]);
                        setPendientes([]);
                        setCantidades({});
                        cargarFacturasCliente(cid);
                        const cli = clientes.find((c: any) => c.id === cid);
                        if (cli?.direccion) formCrear.setFieldsValue({ direccionEntrega: cli.direccion, ciudad: cli.ciudad, telefonoContacto: cli.telefono });
                      }}
                    >
                      {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="facturaId" label="Factura de Origen" rules={[{ required: true, message: 'Selecciona la factura' }]}>
                    <Select
                      allowClear showSearch optionFilterProp="children"
                      placeholder={clienteIdSel ? (facturasCliente.length ? 'Seleccionar factura' : 'Sin facturas emitidas') : 'Selecciona cliente primero'}
                      disabled={!clienteIdSel}
                      onChange={(fid: number | undefined) => {
                        setPendientes([]);
                        setCantidades({});
                        if (fid) cargarPendientes(fid);
                      }}
                    >
                      {facturasCliente.map((f: any) => (
                        <Option key={f.id} value={f.id}>
                          {f.folio} — {f.total ? `RD$${Number(f.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* Tabla de pendientes */}
              <Divider orientation="left" style={{ marginTop: 4 }}>
                <Space>
                  <span>Productos a Despachar</span>
                  {loadingPend && <Spin size="small" />}
                </Space>
              </Divider>

              {loadingPend ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}><Spin /></div>
              ) : todosDespachados ? (
                <Alert type="success" message="Esta factura ya tiene todos sus productos completamente despachados." showIcon style={{ marginBottom: 16 }} />
              ) : pendientes.length > 0 ? (
                <Table
                  dataSource={pendientes}
                  rowKey="facturaDetalleId"
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 8 }}
                  columns={[
                    { title: 'Descripción', dataIndex: 'descripcion', key: 'd', ellipsis: true },
                    { title: 'Facturado',   dataIndex: 'cantidadFacturada',  key: 'f', align: 'right' as const, width: 80, render: v => <Text>{v}</Text> },
                    { title: 'Despachado',  dataIndex: 'cantidadDespachada', key: 'disp', align: 'right' as const, width: 90,
                      render: v => <Tag color={v > 0 ? 'orange' : 'default'}>{v}</Tag> },
                    { title: 'Pendiente',   dataIndex: 'cantidadPendiente',  key: 'p', align: 'right' as const, width: 80,
                      render: v => <Tag color={v > 0 ? 'blue' : 'success'}>{v > 0 ? v : '✓'}</Tag> },
                    { title: 'A despachar', key: 'a', align: 'right' as const, width: 100,
                      render: (_: any, r: PendienteItem) => (
                        <InputNumber
                          min={0}
                          max={r.cantidadPendiente}
                          precision={2}
                          value={cantidades[r.facturaDetalleId] ?? r.cantidadPendiente}
                          onChange={v => setCantidades(prev => ({ ...prev, [r.facturaDetalleId]: v ?? 0 }))}
                          style={{ width: 80 }}
                          disabled={r.cantidadPendiente === 0}
                        />
                      ),
                    },
                  ]}
                />
              ) : formCrear.getFieldValue('facturaId') ? null : (
                <Alert type="info" message="Selecciona una factura para cargar sus productos pendientes de despacho." showIcon style={{ marginBottom: 16 }} />
              )}
            </>
          )}

          {/* ── MODO LIBRE ── */}
          {modo === 'libre' && (
            <>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true, message: 'Selecciona el cliente' }]}>
                <Select
                  showSearch optionFilterProp="children"
                  placeholder="Seleccionar cliente"
                  onChange={(cid: number) => {
                    const cli = clientes.find((c: any) => c.id === cid);
                    if (cli?.direccion) formCrear.setFieldsValue({ direccionEntrega: cli.direccion, ciudad: cli.ciudad, telefonoContacto: cli.telefono });
                  }}
                >
                  {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
                </Select>
              </Form.Item>

              <Divider orientation="left" style={{ marginTop: 4 }}>Mercancía a Despachar</Divider>
              <Form.List name="detalles">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name }) => (
                      <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                        <Col xs={24} sm={8}>
                          <Form.Item name={[name, 'productoId']} noStyle>
                            <ProductoSelect
                              style={{ width: '100%' }}
                              placeholder="Buscar producto..."
                              onProductoSelect={(p: any) => {
                                const ds = formCrear.getFieldValue('detalles') as any[];
                                ds[name] = {
                                  ...ds[name],
                                  descripcion:  p.nombre,
                                  unidadMedida: p.unidadMedida ?? 'PZA',
                                };
                                formCrear.setFieldsValue({ detalles: ds });
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={7}>
                          <Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: '' }]}>
                            <Input placeholder="Descripción *" />
                          </Form.Item>
                        </Col>
                        <Col xs={8} sm={3}>
                          <Form.Item name={[name, 'cantidad']} noStyle rules={[
                            { required: true, message: 'Requerido' },
                            { type: 'number', min: 0.01, message: '>0' },
                          ]}>
                            <InputNumber min={0.01} precision={2} placeholder="Cant." style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={8} sm={3}>
                          <Form.Item name={[name, 'unidadMedida']} noStyle>
                            <Input placeholder="PZA" />
                          </Form.Item>
                        </Col>
                        <Col xs={8} sm={3}>
                          {fields.length > 1 && (
                            <Button type="link" danger size="small" onClick={() => remove(name)} icon={<DeleteOutlined />} />
                          )}
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                      Agregar ítem
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          {/* ── CAMPOS COMUNES ── */}
          <Divider orientation="left" style={{ marginTop: 16 }}>Datos de Entrega</Divider>
          <Row gutter={12}>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fechaEntregaProgramada" label="Entrega Prog.">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="direccionEntrega" label="Dirección de Entrega" rules={[{ required: true, message: 'Ingresa la dirección' }]}>
                <Input placeholder="Av. Principal #100, Santo Domingo" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="ciudad" label="Ciudad">
                <Input placeholder="Santo Domingo" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="contactoEntrega" label="Contacto">
                <Input placeholder="Juan García" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="telefonoContacto" label="Tel. Contacto">
                <Input placeholder="809-000-0000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="conductor" label="Conductor">
                <Input placeholder="Nombre del conductor" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={sucursales.length > 1 ? 6 : 12}>
              <Form.Item name="vehiculo" label="Vehículo / Placa">
                <Input placeholder="Ej. E-123456" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6} style={{ display: sucursales.length > 1 ? undefined : 'none' }}>
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: sucursales.length > 1, message: 'Selecciona una sucursal' }]}>
                <Select placeholder="Seleccionar" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} placeholder="Instrucciones de entrega, cuidados especiales..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Detalle ── */}
      <Modal title={`Conduce ${modalDetalle?.numero}`} open={!!modalDetalle} onCancel={() => setModalDetalle(null)} footer={null} width={600}>
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12}><Text type="secondary">Cliente:</Text><div><Text strong>{modalDetalle.cliente?.nombre}</Text></div></Col>
              <Col xs={24} sm={12}><Text type="secondary">Destino:</Text><div><Text style={{ fontSize: 12 }}>{modalDetalle.direccionEntrega}</Text></div></Col>
            </Row>
            {(modalDetalle.conductor || modalDetalle.vehiculo) && (
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {modalDetalle.conductor && <Col xs={24} sm={12}><Text type="secondary">Conductor:</Text><div><Text>{modalDetalle.conductor}</Text></div></Col>}
                {modalDetalle.vehiculo && <Col xs={24} sm={12}><Text type="secondary">Vehículo:</Text><div><Text>{modalDetalle.vehiculo}</Text></div></Col>}
              </Row>
            )}
            <Table
              size="small"
              dataSource={modalDetalle.detalles}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cantidad',    dataIndex: 'cantidad',    key: 'c', align: 'right' as const },
                { title: 'Unidad',      dataIndex: 'unidadMedida',key: 'u' },
              ]}
            />
            {modalDetalle.observacionesEntrega && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Observaciones: {modalDetalle.observacionesEntrega}</Text>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Modal Entrega/Devolución ── */}
      <Modal
        title={modalEntrega?.tipo === 'entregado' ? 'Confirmar Entrega' : 'Registrar Devolución'}
        open={!!modalEntrega}
        onCancel={() => { setModalEntrega(null); formEntrega.resetFields(); }}
        onOk={() => formEntrega.submit()}
        okText={modalEntrega?.tipo === 'entregado' ? 'Confirmar Entrega' : 'Registrar Devolución'}
        okButtonProps={{ style: { background: modalEntrega?.tipo === 'entregado' ? '#059669' : '#ef4444', borderColor: 'transparent' } }}
      >
        <Form form={formEntrega} layout="vertical"
          onFinish={v => confirmarEntrega.mutate({ id: modalEntrega!.id, obs: v.observaciones, tipo: modalEntrega!.tipo })}>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={3} placeholder={modalEntrega?.tipo === 'entregado' ? 'Recibido conforme por...' : 'Motivo de la devolución...'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
