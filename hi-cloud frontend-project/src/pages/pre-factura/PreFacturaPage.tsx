import { useState, useEffect } from 'react';
import { EmailConCopiaModal } from '../../components/ui/EmailConCopiaModal';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Popconfirm,
  message, Divider, Tooltip, theme,
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, SendOutlined, CheckCircleOutlined,
  CloseCircleOutlined, RetweetOutlined, DeleteOutlined, EyeOutlined,
  MailOutlined, PrinterOutlined, LoadingOutlined, EditOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSucursalesQuery, useVendedoresQuery } from '../../hooks/useCatalogQueries';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador:   { color: 'default', label: 'Borrador'   },
  enviada:    { color: 'blue',    label: 'Enviada'    },
  aprobada:   { color: 'green',   label: 'Aprobada'   },
  rechazada:  { color: 'red',     label: 'Rechazada'  },
  convertida: { color: 'purple',  label: 'Convertida' },
  vencida:    { color: 'orange',  label: 'Vencida'    },
};

// Mapea estado → tokens semánticos de Ant Design (funcionan en claro y oscuro)
const ESTADO_TOKEN: Record<string, { bg: string; border: string }> = {
  borrador:   { bg: 'colorFillAlter',   border: 'colorBorderSecondary' },
  enviada:    { bg: 'colorInfoBg',      border: 'colorInfoBorder'      },
  aprobada:   { bg: 'colorSuccessBg',   border: 'colorSuccessBorder'   },
  rechazada:  { bg: 'colorErrorBg',     border: 'colorErrorBorder'     },
  convertida: { bg: 'colorFillSecondary', border: 'colorBorder'        },
};

export default function PreFacturaPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);

  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [editandoPF,    setEditandoPF]    = useState<any>(null); // pre-factura siendo editada
  const [modalDetalle,  setModalDetalle]  = useState<any>(null);
  const [modalRechazar, setModalRechazar] = useState<any>(null);
  const [emailPF,       setEmailPF]       = useState<any>(null);
  const [pdfPending,    setPdfPending]    = useState<number | null>(null);
  const [formCrear]    = Form.useForm();
  const [formRechazar] = Form.useForm();

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const { data: sucursales = [] } = useSucursalesQuery(empresaActual);

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: vendedores = [] } = useVendedoresQuery();

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn:  () => api.get('/productos?limit=5000&incluirSinStock=true').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    refetchOnWindowFocus: true,
  });

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['pre-facturas-resumen'],
    queryFn:  () => api.get('/pre-facturas/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: preFacturas, isLoading } = useQuery<any>({
    queryKey: ['pre-facturas', page, search],
    queryFn:  () => api.get(`/pre-facturas?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  // ─── Mutations ────────────────────────────────────────────────────────────────

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['pre-facturas'] });
    qc.invalidateQueries({ queryKey: ['pre-facturas-resumen'] });
  };

  const onErr = (e: any, fallback: string) => message.error((e as any)?.friendlyMessage ?? fallback);

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/pre-facturas', dto),
    onSuccess:  () => { invalidar(); setModalCrear(false); formCrear.resetFields(); message.success('Pre-factura creada'); },
    onError:    (e: any) => onErr(e, 'Error al crear pre-factura'),
  });

  const actualizar = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) => api.patch(`/pre-facturas/${id}`, dto),
    onSuccess:  () => {
      invalidar();
      setModalCrear(false); setEditandoPF(null); formCrear.resetFields();
      message.success('Pre-factura actualizada');
    },
    onError:    (e: any) => onErr(e, 'Error al actualizar pre-factura'),
  });

  const enviar = useMutation({
    mutationFn: (id: number) => api.patch(`/pre-facturas/${id}/enviar`, {}),
    onSuccess:  () => { invalidar(); message.success('Pre-factura enviada'); },
    onError:    (e: any) => onErr(e, 'Error al enviar pre-factura'),
  });

  const emailMut = useMutation({
    mutationFn: ({ id, email, cc, cco }: { id: number; email: string; cc?: string; cco?: string }) =>
      api.post(`/notificaciones/pre-factura/${id}/enviar`, { email, cc, cco }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailPF(null); message.success(`Pre-factura enviada a ${v.email}`); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar email'),
  });

  const aprobar = useMutation({
    mutationFn: (id: number) => api.patch(`/pre-facturas/${id}/aprobar`, {}),
    onSuccess:  () => { invalidar(); message.success('Pre-factura aprobada'); },
    onError:    (e: any) => onErr(e, 'Error al aprobar pre-factura'),
  });

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.patch(`/pre-facturas/${id}/rechazar`, { motivo }),
    onSuccess:  () => { invalidar(); setModalRechazar(null); formRechazar.resetFields(); message.success('Pre-factura rechazada'); },
    onError:    (e: any) => onErr(e, 'Error al rechazar pre-factura'),
  });

  const convertir = useMutation({
    mutationFn: (id: number) => api.patch(`/pre-facturas/${id}/convertir`, {}),
    onSuccess:  () => { invalidar(); message.success('¡Factura generada exitosamente!'); },
    onError:    (e: any) => onErr(e, 'No se pudo convertir en factura'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/pre-facturas/${id}`),
    onSuccess:  () => { invalidar(); message.success('Pre-factura eliminada'); },
    onError:    (e: any) => onErr(e, 'Error al eliminar pre-factura'),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleCrear = (values: any) => {
    const vendedor = vendedores.find((v: any) => v.id === values.vendedorId);
    const payload = {
      ...values,
      fecha:            values.fecha?.format('YYYY-MM-DD'),
      fechaVencimiento: values.fechaVencimiento?.format('YYYY-MM-DD'),
      nombreVendedor:   vendedor?.nombre,
      detalles: (values.detalles ?? []).map((d: any) => ({
        ...d,
        cantidad:       Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
      })),
    };
    if (editandoPF) {
      actualizar.mutate({ id: editandoPF.id, dto: payload });
    } else {
      crear.mutate(payload);
    }
  };

  const abrirEditar = async (pf: any) => {
    formCrear.resetFields();
    setEditandoPF(null);   // limpiar primero para que el useEffect detecte el cambio
    setModalCrear(true);
    try {
      const r = await api.get(`/pre-facturas/${pf.id}`);
      const full = r.data?.data ?? r.data;
      setEditandoPF(full);  // el useEffect llenará el form al detectar este cambio
    } catch (e: any) {
      message.error(`Error al cargar la pre-factura: ${e?.message ?? 'Intente de nuevo'}`);
    }
  };

  // Llenar el formulario cuando editandoPF cambia (después del fetch completo)
  // useEffect garantiza que corre DESPUÉS del render, con el form ya montado
  useEffect(() => {
    if (!modalCrear || editandoPF) return;
    if (sucursales.length === 1) formCrear.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) formCrear.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual, modalCrear, editandoPF]);

  useEffect(() => {
    if (!editandoPF || !modalCrear) return;
    formCrear.setFieldsValue({
      clienteId:        editandoPF.clienteId ?? editandoPF.cliente?.id,
      tipoNcf:          editandoPF.tipoNcf ?? 'E32',
      fecha:            editandoPF.fecha ? dayjs(editandoPF.fecha) : null,
      fechaVencimiento: editandoPF.fechaVencimiento ? dayjs(editandoPF.fechaVencimiento) : null,
      notas:            editandoPF.notas ?? '',
      vendedorId:       editandoPF.vendedorId ?? undefined,
      sucursalId:       editandoPF.sucursalId ?? undefined,
      detalles:         (editandoPF.detalles ?? []).length > 0
        ? editandoPF.detalles.map((d: any) => ({
            productoId:     d.productoId ?? undefined,
            descripcion:    d.descripcion,
            cantidad:       Number(d.cantidad),
            precioUnitario: Number(d.precioUnitario),
            porcentajeIva:  Number(d.porcentajeIva ?? 18),
          }))
        : [{}],
    });
  }, [editandoPF, modalCrear]); // eslint-disable-line react-hooks/exhaustive-deps

  const imprimirPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/pre-facturas/${item.id}/pdf`, {
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

  // ─── Column visibility ────────────────────────────────────────────────────────

  const COLS_DEF = [
    { key: 'folio',           label: 'Folio',   defaultVisible: true  },
    { key: 'fecha',           label: 'Fecha',   defaultVisible: true  },
    { key: 'cliente',         label: 'Cliente', defaultVisible: true  },
    { key: 'total',           label: 'Total',   defaultVisible: true  },
    { key: 'estado',          label: 'Estado',  defaultVisible: true  },
    { key: 'fv',              label: 'Vence',   defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('pre-facturas', COLS_DEF);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>

      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: '200px', flex: 1 }}>
          <FileTextOutlined style={{ fontSize: 28, color: token.colorPrimary, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Title level={3} style={{ margin: 0 }}>Pre-Facturas</Title>
            <Text type="secondary" style={{ display: 'block', whiteSpace: 'normal' }}>Facturas proforma · Aprobación → Conversión a factura oficial</Text>
          </div>
        </div>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
          <Input
            placeholder="Buscar por número o cliente..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 'clamp(140px, 30vw, 220px)' }}
          />
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['pre-facturas']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nueva Pre-Factura
          </Button>
        </span>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={preFacturas?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 10, total: preFacturas?.meta?.total, current: page, onChange: setPage, showSizeChanger: false }}
          columns={filterColumns([
            {
              title: 'Folio', dataIndex: 'folio', key: 'folio',
              render: v => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>,
            },
            { title: 'Fecha', dataIndex: 'fecha', key: 'fecha' },
            {
              title: 'Cliente', key: 'cliente',
              render: (_, r: any) => (
                <div>
                  <Text strong style={{ fontSize: 13 }}>{r.cliente?.nombre}</Text>
                  {r.cliente?.rncReceptor && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        RNC: {r.cliente.rncReceptor}
                      </Text>
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: 'Total', dataIndex: 'total', key: 'total', align: 'right',
              render: v => (
                <Text strong style={{ color: token.colorPrimary }}>{fmt(v)}</Text>
              ),
            },
            {
              title: 'Estado', dataIndex: 'estado', key: 'estado',
              render: v => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag>,
            },
            {
              title: 'Vence', dataIndex: 'fechaVencimiento', key: 'fv',
              render: v => v ?? <Text type="secondary">—</Text>,
            },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={async () => {
                    // Cargar pre-factura completa (con detalles) igual que el modal de edición
                    try {
                      const resp = await api.get(`/pre-facturas/${r.id}`);
                      setModalDetalle(resp.data?.data ?? resp.data);
                    } catch {
                      setModalDetalle(r); // fallback al objeto de tabla si falla
                    }
                  }}
                  viewLabel="Ver detalle"
                  items={[
                    {
                      key: 'pdf',
                      label: pdfPending === r.id ? 'Generando PDF...' : 'Imprimir',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
                      disabled: pdfPending === r.id,
                      onClick: () => imprimirPDF(r),
                    },
                    r.estado === 'borrador' ? {
                      key: 'editar',
                      label: 'Editar',
                      onClick: () => abrirEditar(r),
                    } : null,
                    r.estado === 'borrador' ? {
                      key: 'enviar',
                      label: 'Enviar al cliente',
                      onClick: () => enviar.mutate(r.id),
                    } : null,
                    {
                      key: 'email',
                      label: 'Enviar por email',
                      onClick: () => { setEmailPF(r); },
                    },
                    ['enviada', 'borrador'].includes(r.estado) ? {
                      key: 'aprobar',
                      label: 'Aprobar',
                      onClick: () => aprobar.mutate(r.id),
                    } : null,
                    ['enviada', 'borrador', 'aprobada'].includes(r.estado) ? {
                      key: 'rechazar',
                      label: 'Rechazar',
                      danger: true,
                      onClick: () => setModalRechazar(r),
                    } : null,
                    r.estado === 'aprobada' ? {
                      key: 'convertir',
                      label: 'Convertir a Factura',
                      onClick: () => convertir.mutate(r.id),
                    } : null,
                    r.estado !== 'convertida' ? {
                      key: 'eliminar',
                      label: 'Eliminar',
                      danger: true,
                      onClick: () => eliminar.mutate(r.id),
                    } : null,
                  ].filter(Boolean)}
                />
              ),
            },
          ])}
        />
      </Card>

      {/* ── Modal Crear ──────────────────────────────────────────────────── */}
      <Modal
        title={editandoPF ? `Editar Pre-Factura ${editandoPF.folio ?? editandoPF.numero ?? ''}` : 'Nueva Pre-Factura'}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); setEditandoPF(null); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText={editandoPF ? 'Guardar cambios' : 'Crear'}
        width={700}
      >
        <Form
          form={formCrear}
          layout="vertical"
          onFinish={handleCrear}
          initialValues={{ fecha: dayjs(), tipoNcf: 'E32', detalles: [{}] }}
        >
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente">
                  {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fechaVencimiento" label="Vence">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={12} sm={6}>
              <Form.Item name="tipoNcf" label="Tipo NCF">
                <Select>
                  <Option value="E31">E31 - Crédito Fiscal</Option>
                  <Option value="E32">E32 - Consumidor Final</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={sucursales.length > 1 ? 7 : 10}>
              <Form.Item name="vendedorId" label="Vendedor">
                <Select
                  allowClear
                  showSearch
                  placeholder="Sin vendedor asignado"
                  optionFilterProp="label"
                  options={vendedores.map((v: any) => ({
                    value: v.id,
                    label: v.codigo ? `${v.codigo} — ${v.nombre}` : v.nombre,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={7} style={{ display: sucursales.length > 1 ? undefined : 'none' }}>
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: sucursales.length > 1, message: 'Selecciona una sucursal' }]}>
                <Select placeholder="Seleccionar sucursal" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={sucursales.length > 1 ? 7 : 8}>
              <Form.Item name="notas" label="Notas / Condiciones">
                <Input placeholder="Condiciones de pago, validez de la oferta..." />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Detalles del servicio / producto</Divider>

          <Form.List name="detalles">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={8}>
                      <Form.Item name={[name, 'productoId']} noStyle>
                        <Select
                          showSearch
                          optionFilterProp="children"
                          placeholder="Producto (opcional)"
                          style={{ width: '100%' }}
                          allowClear
                          onChange={pid => {
                            const prod = productos.find((p: any) => p.id === pid);
                            if (prod) {
                              const ds = formCrear.getFieldValue('detalles');
                              ds[name] = {
                                ...ds[name],
                                descripcion:    prod.nombre,
                                precioUnitario: prod.precio,
                              };
                              formCrear.setFieldsValue({ detalles: ds });
                            }
                          }}
                        >
                          {productos.map((p: any) => (
                            <Option key={p.id} value={p.id}>{p.nombre}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={7}>
                      <Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: '' }]}>
                        <Input placeholder="Descripción *" />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={4}>
                      <Form.Item name={[name, 'cantidad']} noStyle rules={[{ required: true }]}>
                        <InputNumber min={0.01} placeholder="Cant." style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={4}>
                      <Form.Item name={[name, 'precioUnitario']} noStyle rules={[{ required: true }]}>
                        <InputNumber min={0} placeholder="Precio" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={1}>
                      {fields.length > 1 && (
                        <Button
                          type="link" danger size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                        />
                      )}
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  Agregar línea
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* ── Modal Detalle ─────────────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            Pre-Factura {modalDetalle?.folio}
            {modalDetalle && (
              <Tag color={ESTADO_CONFIG[modalDetalle.estado]?.color}>
                {ESTADO_CONFIG[modalDetalle.estado]?.label}
              </Tag>
            )}
          </Space>
        }
        open={!!modalDetalle}
        onCancel={() => setModalDetalle(null)}
        footer={null}
        width={620}
        destroyOnClose
      >
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Cliente</Text>
                <div><Text strong>{modalDetalle.cliente?.nombre}</Text></div>
                {modalDetalle.cliente?.rncReceptor && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    RNC: {modalDetalle.cliente.rncReceptor}
                  </Text>
                )}
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>NCF</Text>
                <div><Tag>{modalDetalle.tipoNcf}</Tag></div>
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Vence</Text>
                <div>
                  <Text>{modalDetalle.fechaVencimiento ?? <Text type="secondary">—</Text>}</Text>
                </div>
              </Col>
            </Row>

            {modalDetalle.notas && (
              <div
                style={{
                  background:   token.colorFillAlter,
                  border:       `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 6,
                  padding:      '8px 12px',
                  marginBottom: 12,
                  fontSize:     12,
                  color:        token.colorTextSecondary,
                }}
              >
                <Text type="secondary" style={{ fontSize: 11 }}>Notas: </Text>{modalDetalle.notas}
              </div>
            )}

            <Table
              size="small"
              dataSource={modalDetalle.detalles}
              rowKey="id"
              pagination={false}
              style={{ marginBottom: 12 }}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cant.',       dataIndex: 'cantidad',     key: 'c', align: 'right' },
                { title: 'Precio',      dataIndex: 'precioUnitario', key: 'p', align: 'right', render: v => fmt(v) },
                { title: 'ITBIS',       dataIndex: 'iva',          key: 'i', align: 'right', render: v => fmt(v) },
                {
                  title: 'Total', dataIndex: 'total', key: 't', align: 'right',
                  render: v => <Text strong>{fmt(v)}</Text>,
                },
              ]}
            />

            <Divider style={{ margin: '8px 0' }} />

            <Row justify="end" gutter={24}>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>Subtotal</Text>
                <div><Text>{fmt(modalDetalle.subtotal)}</Text></div>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>ITBIS</Text>
                <div><Text>{fmt(modalDetalle.iva)}</Text></div>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>Total</Text>
                <div>
                  <Text strong style={{ fontSize: 18, color: token.colorPrimary }}>
                    {fmt(modalDetalle.total)}
                  </Text>
                </div>
              </Col>
            </Row>

            {modalDetalle.facturaId && (
              <div style={{ marginTop: 12 }}>
                <Tag color="purple" icon={<CheckCircleOutlined />}>
                  Convertida → Factura #{modalDetalle.facturaId}
                </Tag>
              </div>
            )}

            {modalDetalle.motivoRechazo && (
              <div
                style={{
                  marginTop:    12,
                  background:   token.colorErrorBg,
                  border:       `1px solid ${token.colorErrorBorder}`,
                  borderRadius: 6,
                  padding:      '8px 12px',
                  fontSize:     12,
                  color:        token.colorError,
                }}
              >
                <Text style={{ color: token.colorError, fontSize: 11 }}>Motivo rechazo: </Text>
                {modalDetalle.motivoRechazo}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Modal Rechazar ────────────────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <CloseCircleOutlined style={{ color: token.colorError }} />
            Rechazar Pre-Factura
          </Space>
        }
        open={!!modalRechazar}
        onCancel={() => { setModalRechazar(null); formRechazar.resetFields(); }}
        onOk={() => formRechazar.submit()}
        okText="Confirmar Rechazo"
        okButtonProps={{ danger: true, loading: rechazar.isPending }}
        destroyOnClose
      >
        {modalRechazar && (
          <div
            style={{
              background:   token.colorFillAlter,
              border:       `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 6,
              padding:      '8px 12px',
              marginBottom: 16,
              fontSize:     13,
            }}
          >
            Pre-Factura <Text strong>{modalRechazar.folio}</Text> ·{' '}
            <Text type="secondary">{modalRechazar.cliente?.nombre}</Text> ·{' '}
            <Text strong style={{ color: token.colorError }}>{fmt(modalRechazar.total)}</Text>
          </div>
        )}
        <Form
          form={formRechazar}
          layout="vertical"
          onFinish={v =>
            rechazar.mutate({ id: modalRechazar?.id, motivo: v.motivo })
          }
        >
          <Form.Item
            name="motivo"
            label="Motivo del rechazo"
            rules={[
              { required: true, message: 'Indica el motivo' },
              { min: 3, message: 'El motivo debe tener al menos 3 caracteres' },
            ]}
          >
            <Input.TextArea rows={3} placeholder="Ej. Precio fuera de presupuesto, ajustar descuento..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal email pre-factura */}
      <EmailConCopiaModal
        open={!!emailPF}
        title={<><MailOutlined style={{ color: '#7c3aed', marginRight: 8 }} />Enviar Pre-Factura por Email</>}
        documentoInfo={emailPF ? <>Pre-factura <strong>{emailPF.folio}</strong> · Cliente: <strong>{emailPF.cliente?.nombre ?? '—'}</strong></> : undefined}
        onCancel={() => setEmailPF(null)}
        onEnviar={p => emailPF && emailMut.mutate({ id: emailPF.id, ...p })}
        loading={emailMut.isPending}
      />

    </div>
  );
}
