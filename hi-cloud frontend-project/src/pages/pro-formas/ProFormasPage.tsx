import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  InputNumber, Space, Typography, Popconfirm, message, Divider, theme,
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, DeleteOutlined, EyeOutlined,
  PrinterOutlined, EditOutlined, SearchOutlined, MinusCircleOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSucursalesQuery } from '../../hooks/useCatalogQueries';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const ESTADO_COLOR: Record<string, string> = { ACTIVA: 'green', VENCIDA: 'default' };

interface Linea {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  productoId?: number;
}

const lineaVacia = (): Linea => ({ descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 });

export default function ProFormasPage() {
  const qc            = useQueryClient();
  const { token }     = theme.useToken();
  const empresaActual = useAuthStore(s => s.empresaActual);

  const [search,       setSearch]       = useState('');
  const [page,         setPage]         = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [modalForm,    setModalForm]    = useState(false);
  const [editando,     setEditando]     = useState<any>(null);
  const [modalDetalle, setModalDetalle] = useState<any>(null);
  const [pdfLoading,   setPdfLoading]   = useState<number | null>(null);
  const [lineas,       setLineas]       = useState<Linea[]>([lineaVacia()]);
  const [form] = Form.useForm();

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn: () => api.get('/clientes?limit=300').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn: () => api.get('/productos?limit=5000&incluirSinStock=true').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    refetchOnWindowFocus: true,
  });

  const { data: sucursales = [] } = useSucursalesQuery(empresaActual);

  const { data: pfData, isLoading } = useQuery<any>({
    queryKey: ['pro-formas', page, search, estadoFiltro],
    queryFn: () => {
      let url = `/pro-formas?page=${page}&limit=50`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      return api.get(url).then((r: any) => r.data?.data ?? r.data);
    },
  });

  const proFormas: any[] = Array.isArray(pfData) ? pfData : (pfData?.data ?? []);
  const totalItems: number = pfData?.meta?.total ?? proFormas.length;

  // Filtro de estado es local (el backend no filtra por estado)
  const rows = estadoFiltro
    ? proFormas.filter((p: any) => p.estado === estadoFiltro)
    : proFormas;

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const invalidar = () => qc.invalidateQueries({ queryKey: ['pro-formas'] });

  const crearMut = useMutation({
    mutationFn: (dto: any) => api.post('/pro-formas', dto),
    onSuccess: () => { invalidar(); cerrarModal(); message.success('Pro Forma creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear', 5),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) => api.patch(`/pro-formas/${id}`, dto),
    onSuccess: () => { invalidar(); cerrarModal(); message.success('Pro Forma actualizada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar', 5),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => api.delete(`/pro-formas/${id}`),
    onSuccess: () => { invalidar(); message.success('Pro Forma eliminada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar', 5),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const cerrarModal = () => {
    setModalForm(false);
    setEditando(null);
    setLineas([lineaVacia()]);
    form.resetFields();
  };

  const abrirNueva = () => {
    setEditando(null);
    setLineas([lineaVacia()]);
    form.resetFields();
    form.setFieldsValue({ validezDias: 30 });
    setModalForm(true);
  };

  const abrirEditar = (pf: any) => {
    setEditando(pf);
    const lineasEdit: Linea[] = (pf.items ?? []).map((i: any) => ({
      descripcion:    i.descripcion,
      cantidad:       Number(i.cantidad),
      precioUnitario: Number(i.precio),
      porcentajeIva:  Number(i.porcentajeItbis ?? 18),
      productoId:     i.productoId,
    }));
    setLineas(lineasEdit.length > 0 ? lineasEdit : [lineaVacia()]);
    form.setFieldsValue({
      clienteId:   pf.clienteId,
      sucursalId:  pf.sucursalId,
      notas:       pf.notas,
      validezDias: pf.validezDias ?? 30,
    });
    setModalForm(true);
  };

  const onProductoChange = (idx: number, productoId: number) => {
    const prod = (productos as any[]).find((p: any) => p.id === productoId);
    if (!prod) return;
    const nuevas = [...lineas];
    nuevas[idx] = {
      ...nuevas[idx],
      productoId,
      descripcion:    prod.nombre ?? prod.descripcion ?? '',
      precioUnitario: Number(prod.precio ?? prod.precioVenta ?? 0),
      porcentajeIva:  Number(prod.porcentajeIva ?? 18),
    };
    setLineas(nuevas);
  };

  const onLinea = (idx: number, field: keyof Linea, val: any) => {
    const nuevas = [...lineas];
    (nuevas[idx] as any)[field] = val;
    setLineas(nuevas);
  };

  const subtotalLinea = (l: Linea) => +(Number(l.cantidad) * Number(l.precioUnitario)).toFixed(2);
  const itbisLinea    = (l: Linea) => +(subtotalLinea(l) * Number(l.porcentajeIva) / 100).toFixed(2);
  const totalLinea    = (l: Linea) => +(subtotalLinea(l) + itbisLinea(l)).toFixed(2);

  const totalSubtotal = lineas.reduce((s, l) => s + subtotalLinea(l), 0);
  const totalItbis    = lineas.reduce((s, l) => s + itbisLinea(l), 0);
  const totalGeneral  = totalSubtotal + totalItbis;

  const onSubmit = async () => {
    try {
      await form.validateFields();
    } catch { return; }
    if (lineas.length === 0 || lineas.every(l => !l.descripcion)) {
      message.error('Agrega al menos una línea'); return;
    }
    const vals = form.getFieldsValue();
    const dto = {
      clienteId:  vals.clienteId,
      sucursalId: vals.sucursalId,
      notas:      vals.notas,
      validezDias: Number(vals.validezDias ?? 30),
      detalles: lineas.filter(l => l.descripcion).map(l => ({
        descripcion:    l.descripcion,
        cantidad:       Number(l.cantidad),
        precioUnitario: Number(l.precioUnitario),
        porcentajeIva:  Number(l.porcentajeIva ?? 18),
        productoId:     l.productoId,
      })),
    };
    if (editando) {
      editarMut.mutate({ id: editando.id, dto });
    } else {
      crearMut.mutate(dto);
    }
  };

  const verPDF = async (id: number) => {
    setPdfLoading(id);
    try {
      const res = await api.get(`/pro-formas/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      message.error('Error al generar PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  // ─── Visibilidad de columnas ─────────────────────────────────────────────────

  const COLS_DEF = [
    { key: 'numero',           label: 'Número',       defaultVisible: true  },
    { key: 'clienteNombre',    label: 'Cliente',      defaultVisible: true  },
    { key: 'total',            label: 'Total',        defaultVisible: true  },
    { key: 'fechaVencimiento', label: 'Válida hasta', defaultVisible: true  },
    { key: 'estado',           label: 'Estado',       defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('pro-formas', COLS_DEF);

  // ─── Columnas de tabla ───────────────────────────────────────────────────────

  const columns = filterColumns([
    {
      title: 'Número', key: 'numero', dataIndex: 'numero', width: 110,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: token.colorPrimary }}>{v}</span>,
    },
    {
      title: 'Cliente', key: 'clienteNombre', dataIndex: 'clienteNombre',
      render: (v: string) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Total', key: 'total', dataIndex: 'total', align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 700 }}>{fmt(v)}</span>,
    },
    {
      title: 'Válida hasta', key: 'fechaVencimiento', dataIndex: 'fechaVencimiento',
      render: (v: string) => v ? String(v).substring(0, 10) : '—',
    },
    {
      title: 'Estado', key: 'estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'Acciones', key: 'acciones', width: 200,
      render: (_: any, rec: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => api.get(`/pro-formas/${rec.id}`).then(r => setModalDetalle(r.data?.data ?? r.data))}>
            Ver
          </Button>
          <Button size="small" icon={<PrinterOutlined />}
            loading={pdfLoading === rec.id}
            onClick={() => verPDF(rec.id)}>
            PDF
          </Button>
          {rec.estado === 'ACTIVA' && (
            <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(rec)}>
              Editar
            </Button>
          )}
          <Popconfirm title="¿Eliminar esta Pro Forma?" onConfirm={() => eliminarMut.mutate(rec.id)} okText="Eliminar" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={eliminarMut.isPending} />
          </Popconfirm>
        </Space>
      ),
    },
  ]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8 }} />Pro Formas
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Documentos informativos · No afectan stock ni son fiscales
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = rows.map((p: any) => ({
                'Número':       p.numero ?? '',
                'Cliente':      p.clienteNombre ?? 'Consumidor Final',
                'Total':        Number(p.total ?? 0),
                'Válida hasta': p.fechaVencimiento ? String(p.fechaVencimiento).substring(0, 10) : '',
                'Estado':       p.estado ?? '',
              }));
              exportarExcel(filas, `ProFormas-${hoyRD()}`);
              message.success(`${filas.length} pro formas exportadas`);
            }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['pro-formas']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirNueva}>
              + Nueva Pro Forma
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Input
              prefix={<SearchOutlined />}
              placeholder="Buscar por número..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
              style={{ maxWidth: 320 }}
            />
          </Col>
          <Col>
            <Select
              placeholder="Estado"
              value={estadoFiltro}
              onChange={v => setEstadoFiltro(v)}
              allowClear
              style={{ width: 140 }}
            >
              <Select.Option value="ACTIVA">Activa</Select.Option>
              <Select.Option value="VENCIDA">Vencida</Select.Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* Tabla */}
      <Card>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 10,
            total: totalItems,
            onChange: p => setPage(p),
            showTotal: (t) => `${t} pro formas`,
          }}
        />
      </Card>

      {/* Modal Formulario */}
      <Modal
        title={editando ? `Editar Pro Forma ${editando.numero}` : 'Nueva Pro Forma'}
        open={modalForm}
        onCancel={cerrarModal}
        footer={null}
        width={860}
        destroyOnClose
        style={{ top: 20 }}
        styles={{ body: { maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', padding: '16px 24px' } }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="clienteId" label="Cliente">
                <Select showSearch optionFilterProp="children" placeholder="Consumidor Final" allowClear>
                  {(clientes as any[]).map((c: any) => (
                    <Select.Option key={c.id} value={c.id}>{c.nombre}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sucursalId" label="Sucursal">
                <Select showSearch optionFilterProp="children" placeholder="Todas" allowClear>
                  {(sucursales as any[]).map((s: any) => (
                    <Select.Option key={s.id} value={s.id}>{s.nombre}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="validezDias" label="Validez (días)" rules={[{ required: true }]}>
                <InputNumber min={1} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13, marginBottom: 8 }}>Líneas</Divider>

          {/* Cabecera de líneas */}
          <Row gutter={6} style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>
            <Col span={7}><Text type="secondary" style={{ fontSize: 11 }}>Descripción / Producto</Text></Col>
            <Col span={4}><Text type="secondary" style={{ fontSize: 11 }}>Cant.</Text></Col>
            <Col span={4}><Text type="secondary" style={{ fontSize: 11 }}>Precio Unit.</Text></Col>
            <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>ITBIS %</Text></Col>
            <Col span={4}><Text type="secondary" style={{ fontSize: 11 }}>Total</Text></Col>
            <Col span={2} />
          </Row>

          {lineas.map((linea, idx) => (
            <Row gutter={6} key={idx} align="middle" style={{ marginBottom: 6 }}>
              <Col span={7}>
                <Select
                  showSearch
                  optionFilterProp="children"
                  placeholder="Producto (opcional)"
                  value={linea.productoId}
                  onChange={val => onProductoChange(idx, val)}
                  allowClear
                  onClear={() => onLinea(idx, 'productoId', undefined)}
                  style={{ width: '100%' }}
                  dropdownRender={menu => (
                    <>
                      {menu}
                      <Divider style={{ margin: '4px 0' }} />
                      <div style={{ padding: '4px 8px' }}>
                        <Input
                          size="small"
                          placeholder="O escribe descripción libre"
                          value={linea.descripcion}
                          onChange={e => onLinea(idx, 'descripcion', e.target.value)}
                        />
                      </div>
                    </>
                  )}
                >
                  {(productos as any[]).map((p: any) => (
                    <Select.Option key={p.id} value={p.id}>{p.nombre ?? p.descripcion}</Select.Option>
                  ))}
                </Select>
                {!linea.productoId && (
                  <Input
                    size="small"
                    placeholder="Descripción libre"
                    value={linea.descripcion}
                    onChange={e => onLinea(idx, 'descripcion', e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                )}
              </Col>
              <Col span={4}>
                <InputNumber
                  min={0.01} step={1} size="small" style={{ width: '100%' }}
                  value={linea.cantidad}
                  onChange={val => onLinea(idx, 'cantidad', val ?? 1)}
                />
              </Col>
              <Col span={4}>
                <InputNumber
                  min={0} step={100} size="small" style={{ width: '100%' }}
                  value={linea.precioUnitario}
                  onChange={val => onLinea(idx, 'precioUnitario', val ?? 0)}
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                />
              </Col>
              <Col span={3}>
                <InputNumber
                  min={0} max={100} size="small" style={{ width: '100%' }}
                  value={linea.porcentajeIva}
                  onChange={val => onLinea(idx, 'porcentajeIva', val ?? 18)}
                  formatter={v => `${v}%`}
                  parser={v => Number(String(v).replace('%', ''))}
                />
              </Col>
              <Col span={4}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(totalLinea(linea))}</span>
              </Col>
              <Col span={2} style={{ textAlign: 'center' }}>
                <MinusCircleOutlined
                  style={{ color: token.colorError, cursor: 'pointer', fontSize: 16 }}
                  onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}
                />
              </Col>
            </Row>
          ))}

          <Button
            type="dashed" block icon={<PlusOutlined />}
            style={{ marginBottom: 12 }}
            onClick={() => setLineas([...lineas, lineaVacia()])}>
            Agregar línea
          </Button>

          {/* Totales */}
          <Row justify="end" style={{ marginBottom: 12 }}>
            <Col>
              <Space direction="vertical" size={2} style={{ textAlign: 'right' }}>
                <Text type="secondary">Subtotal: <strong>{fmt(totalSubtotal)}</strong></Text>
                <Text type="secondary">ITBIS: <strong>{fmt(totalItbis)}</strong></Text>
                <Text style={{ fontSize: 16, fontWeight: 700 }}>Total: {fmt(totalGeneral)}</Text>
              </Space>
            </Col>
          </Row>

          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} placeholder="Notas adicionales para el cliente..." />
          </Form.Item>

          <Row justify="end">
            <Space>
              <Button onClick={cerrarModal}>Cancelar</Button>
              <Button
                type="primary" icon={<FileTextOutlined />}
                loading={crearMut.isPending || editarMut.isPending}
                onClick={onSubmit}>
                {editando ? 'Guardar cambios' : 'Crear Pro Forma'}
              </Button>
            </Space>
          </Row>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal
        title={`Detalle: ${modalDetalle?.numero ?? ''}`}
        open={!!modalDetalle}
        onCancel={() => setModalDetalle(null)}
        footer={
          <Space>
            <Button onClick={() => setModalDetalle(null)}>Cerrar</Button>
            {modalDetalle && (
              <Button type="primary" icon={<PrinterOutlined />}
                loading={pdfLoading === modalDetalle.id}
                onClick={() => { verPDF(modalDetalle.id); }}>
                Ver PDF
              </Button>
            )}
          </Space>
        }
        width={700}
        destroyOnClose
      >
        {modalDetalle && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={12}>
                <Text type="secondary">Cliente: </Text>
                <Text strong>{modalDetalle.clienteNombre ?? 'Consumidor Final'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Estado: </Text>
                <Tag color={ESTADO_COLOR[modalDetalle.estado] ?? 'default'}>{modalDetalle.estado}</Tag>
              </Col>
              <Col span={12}>
                <Text type="secondary">Válida hasta: </Text>
                <Text>{String(modalDetalle.fechaVencimiento ?? '').substring(0, 10) || '—'}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">Sucursal: </Text>
                <Text>{modalDetalle.sucursalNombre ?? '—'}</Text>
              </Col>
            </Row>
            <Table
              size="small"
              dataSource={modalDetalle.items ?? []}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion' },
                { title: 'Cant.', dataIndex: 'cantidad', width: 60, align: 'right' as const },
                { title: 'Precio', dataIndex: 'precio', width: 110, align: 'right' as const, render: (v: number) => fmt(v) },
                { title: 'ITBIS', dataIndex: 'itbis', width: 110, align: 'right' as const, render: (v: number) => fmt(v) },
                { title: 'Total', width: 120, align: 'right' as const, render: (_: any, r: any) => fmt(Number(r.subtotal) + Number(r.itbis)) },
              ]}
            />
            <Row justify="end" style={{ marginTop: 12 }}>
              <Space direction="vertical" size={2} style={{ textAlign: 'right' }}>
                <Text type="secondary">Subtotal: {fmt(Number(modalDetalle.subtotal))}</Text>
                <Text type="secondary">ITBIS: {fmt(Number(modalDetalle.itbis))}</Text>
                <Text strong style={{ fontSize: 15 }}>Total: {fmt(Number(modalDetalle.total))}</Text>
              </Space>
            </Row>
            {modalDetalle.notas && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Notas: {modalDetalle.notas}</Text>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

