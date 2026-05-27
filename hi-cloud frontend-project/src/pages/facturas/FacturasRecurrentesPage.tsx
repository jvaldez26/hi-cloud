import { useState, useEffect } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Space,
         Modal, Form, Input, InputNumber, Select, AutoComplete, message,
         Switch, Descriptions, Divider, Tooltip, theme } from 'antd';
import { PlusOutlined, ThunderboltOutlined, DeleteOutlined,
         FileExcelOutlined, WarningOutlined, ClockCircleOutlined, SearchOutlined } from '@ant-design/icons';
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

const recurrenteApi = {
  list:    (p = 1, search = '') => api.get(`/facturas-recurrentes?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => r.data?.data ?? r.data),
  get:     (id: number) => api.get(`/facturas-recurrentes/${id}`).then(r => r.data?.data ?? r.data),
  create:  (body: any) => api.post('/facturas-recurrentes', body).then(r => r.data?.data ?? r.data),
  toggle:  (id: number) => api.patch(`/facturas-recurrentes/${id}/toggle`).then(r => r.data?.data ?? r.data),
  ejecutar:(id: number) => api.post(`/facturas-recurrentes/${id}/ejecutar-ahora`).then(r => r.data?.data ?? r.data),
  remove:  (id: number) => api.delete(`/facturas-recurrentes/${id}`).then(r => r.data?.data ?? r.data),
};

const REC_COLS_DEF = [
  { key: 'nombre',           label: 'Nombre',    defaultVisible: true  },
  { key: 'cli',              label: 'Cliente',   defaultVisible: true  },
  { key: 'frecuencia',       label: 'Frecuencia',defaultVisible: true  },
  { key: 'proximaEjecucion', label: 'Próxima',   defaultVisible: true  },
  { key: 'ultimaEjecucion',  label: 'Últ. gen.', defaultVisible: false },
  { key: 'totalGeneradas',   label: 'Gen.',      defaultVisible: false },
  { key: 'activa',           label: 'Activa',    defaultVisible: true  },
];

export default function FacturasRecurrentesPage() {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('facturas-recurrentes', REC_COLS_DEF);
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const [open,   setOpen]   = useState(false);
  const [detalle,setDetalle]= useState<any>(null);
  const [form]              = Form.useForm();
  const [lineas, setLineas] = useState<Array<{ descripcion: string; cantidad: number; precioUnitario: number; porcentajeIva: number; productoId?: number }>>([
    { descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 },
  ]);
  const [searchIdx,     setSearchIdx]     = useState<number | null>(null);
  const [searchTerm,    setSearchTerm]    = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const qc = useQueryClient();

  // Debounce product search
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

  // Carga fresca del registro abierto en el drawer (evita mostrar datos stale de la lista)
  const { data: detalleRefresh } = useQuery({
    queryKey: ['recurrente', detalle?.id],
    queryFn:  () => recurrenteApi.get(detalle!.id),
    enabled:  !!detalle?.id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recurrentes', page, search],
    queryFn:  () => recurrenteApi.list(page, search),
  });
  const { data: clientes } = useQuery({
    queryKey: ['clientes-rec'],
    queryFn:  () => clientesApi.list(1, 100),
  });

  const createMut = useMutation({
    mutationFn: recurrenteApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurrentes'] });
      setOpen(false); form.resetFields();
      setLineas([{ descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18, productoId: undefined }]);
      message.success('Factura recurrente creada');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });
  const toggleMut = useMutation({
    mutationFn: recurrenteApi.toggle,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Estado actualizado'); },
  });
  const ejecutMut = useMutation({
    mutationFn: recurrenteApi.ejecutar,
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['recurrentes'] });
      message.success(`✅ Factura generada. Total generadas: ${updated?.totalGeneradas ?? '?'}`);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Error al generar',
      8,
    ),
  });
  const removeMut = useMutation({
    mutationFn: recurrenteApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Eliminada'); },
  });

  const handleSubmit = (values: any) => {
    // Validar que todos los ítems tienen descripción y precio > 0
    const idxSinDesc  = lineas.findIndex(l => !l.descripcion.trim());
    const idxSinPrecio = lineas.findIndex(l => l.precioUnitario <= 0);
    if (idxSinDesc  >= 0) { message.warning(`El ítem ${idxSinDesc + 1} no tiene descripción`); return; }
    if (idxSinPrecio >= 0) { message.warning(`El ítem ${idxSinPrecio + 1} necesita precio mayor a 0`); return; }
    createMut.mutate({
      ...values,
      detalles: lineas.map(l => ({
        descripcion:    l.descripcion,
        productoId:     l.productoId,
        cantidad:       Number(l.cantidad)       || 1,
        precioUnitario: Number(l.precioUnitario) || 0,
        porcentajeIva:  Number(l.porcentajeIva)  || 0,
      })),
    });
  };

  const hoy = dayjs().startOf('day');

  const cols = [
    { title: 'Nombre',  dataIndex: 'nombre', ellipsis: true,
      render: (v: string, r: any) => (
        <span>
          <Text strong>{v}</Text>
          {r.notas && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.notas}</Text>}
        </span>
      )},
    { title: 'Cliente', key: 'cli', width: 160, ellipsis: true,
      render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
    { title: 'Frecuencia', dataIndex: 'frecuencia', width: 110,
      render: (v: string) => <Tag>{frecuenciaLabel[v] ?? v}</Tag> },
    { title: 'Próxima', dataIndex: 'proximaEjecucion', width: 120,
      render: (v: string) => {
        const fecha = dayjs(v);
        const vencida = fecha.isBefore(hoy);
        return (
          <Tooltip title={vencida ? 'Fecha vencida — generar ahora' : undefined}>
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
        <Switch checked={v} size="small" loading={toggleMut.isPending}
          onChange={() => toggleMut.mutate(r.id)} />
      )},
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalle(r)}
          viewLabel="Ver detalle"
          items={[
            { key: 'ejecutar', label: 'Generar factura ahora', icon: <ThunderboltOutlined />,
              onClick: () => ejecutMut.mutate(r.id) },
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
              onClick: () => Modal.confirm({
                title: '¿Eliminar esta factura recurrente?',
                okText: 'Confirmar',
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
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Facturas Recurrentes</Title></Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por número o cliente..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
              style={{ width: 220 }}
            />
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (data?.data ?? []).map((r: any) => ({
                'Nombre':    r.nombre ?? '',
                'Cliente':   r.cliente?.nombre ?? '',
                'Frecuencia':r.frecuencia ?? '',
                'Próxima':   r.proximaEjecucion ?? '',
                'Generadas': r.totalGeneradas ?? 0,
                'Activa':    r.activa ? 'Sí' : 'No',
              }));
              exportarExcel(filas, 'Facturas-Recurrentes');
            }}>Excel</Button>
            <ColumnToggle columns={REC_COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['recurrentes']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); setLineas([{ descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18, productoId: undefined }]); setSearchResults([]); setSearchIdx(null); }}>
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
        // Preferir datos frescos del GET/:id; si aún no llegaron, usar la fila de la lista
        const det = detalleRefresh ?? detalle;
        const isVencida = det?.fechaFin && dayjs(det.fechaFin).isBefore(hoy);
        const estadoLabel = det?.activa ? 'Activa' : isVencida ? 'Vencida' : 'Pausada';
        const estadoColor = det?.activa ? 'green' : isVencida ? 'volcano' : 'default';
        return (
          <DetailDrawer
            open={!!detalle}
            onClose={() => setDetalle(null)}
            title={det?.nombre ?? 'Recurrente'}
            sections={[{
              title: 'Información',
              fields: [
                { label: 'Cliente',     value: det?.cliente?.nombre },
                { label: 'Frecuencia',  value: frecuenciaLabel[det?.frecuencia] ?? det?.frecuencia },
                { label: 'Próx. ejecución', value: det?.proximaEjecucion ? dayjs(det.proximaEjecucion).format('DD/MM/YYYY') : undefined },
                { label: 'Últ. ejecución',  value: det?.ultimaEjecucion  ? dayjs(det.ultimaEjecucion).format('DD/MM/YYYY')  : '—' },
                { label: 'Fecha fin',        value: det?.fechaFin ? dayjs(det.fechaFin).format('DD/MM/YYYY') : '—' },
                { label: 'Total generadas',  value: String(det?.totalGeneradas ?? 0) },
                { label: 'Estado', value: <Tag color={estadoColor}>{estadoLabel}</Tag> },
              ],
            }, {
              title: 'Ítems de la plantilla',
              fields: (det?.detalles ?? []).map((d: any, i: number) => ({
                label: `Ítem ${i + 1}`,
                value: (() => {
                  const desc   = d.descripcion ?? d.concepto ?? d.nombre ?? '—';
                  const cant   = Number(d.cantidad ?? d.qty ?? 1);
                  const precio = Number(d.precioUnitario ?? d.precio ?? 0);
                  const iva    = Number(d.porcentajeIva ?? d.itbis ?? 18);
                  return `${desc} × ${cant} = ${fmt.money(precio * cant)} + ${iva}% ITBIS`;
                })(),
                span: 2 as const,
              })),
            }]}
            footer={
              <Space>
                <Button icon={<ThunderboltOutlined />} type="primary"
                  loading={ejecutMut.isPending}
                  onClick={() => { if (detalle) ejecutMut.mutate(detalle.id); }}>
                  Generar ahora
                </Button>
                <Button onClick={() => setDetalle(null)}>Cerrar</Button>
              </Space>
            }
          />
        );
      })()}

      {/* Modal crear */}
      <Modal title="Nueva Factura Recurrente" open={open} onCancel={() => setOpen(false)} footer={null} width={700}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ frecuencia: 'mensual', diaEjecucion: 1, fechaInicio: dayjs().format('YYYY-MM-DD') }}>
          <Row gutter={12}>
            <Col xs={24} sm={16}>
              <Form.Item name="nombre" label="Nombre descriptivo" rules={[{ required: true }]}>
                <Input placeholder="Ej: Servicio mensual de contabilidad" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data?.map((c: any) => ({ value: c.id, label: c.nombre }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="frecuencia" label="Frecuencia">
                <Select options={Object.keys(frecuenciaLabel).map(k => ({ value: k, label: frecuenciaLabel[k] }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="diaEjecucion" label="Día del mes (1-28)">
                <InputNumber style={{ width: '100%' }} min={1} max={28} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaInicio" label="Primera ejecución" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaFin" label="Fecha fin (opcional)">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas internas (opcional)">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>Ítems de la factura</Divider>
          {lineas.map((l, i) => (
            <Row key={i} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
              <Col xs={24} sm={9}>
                <AutoComplete
                  style={{ width: '100%' }}
                  value={l.descripcion}
                  placeholder="Buscar producto o escribir descripción..."
                  options={searchIdx === i
                    ? searchResults.map(p => ({
                        value: p.nombre,
                        label: (
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                            <span style={{ color: '#8c8c8c', flexShrink: 0 }}>{p.codigo}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
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
                  onChange={v => { const u=[...lineas]; u[i].cantidad=Number(v)??1; setLineas(u); }} />
              </Col>
              <Col xs={8} sm={5}>
                <InputNumber placeholder="Precio unitario" min={0} precision={2} value={l.precioUnitario} style={{ width:'100%' }}
                  onChange={v => { const u=[...lineas]; u[i].precioUnitario=Number(v)??0; setLineas(u); }} />
              </Col>
              <Col xs={8} sm={4}>
                <InputNumber placeholder="ITBIS%" min={0} max={100} value={l.porcentajeIva} style={{ width:'100%' }}
                  onChange={v => { const u=[...lineas]; u[i].porcentajeIva=Number(v)??18; setLineas(u); }} />
              </Col>
              <Col xs={24} sm={3}>
                <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                  = {fmt.money((l.precioUnitario||0) * (l.cantidad||1))}
                </Text>
              </Col>
              <Col xs={24} sm={2} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {lineas.length > 1 && (
                  <Button danger size="small" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>×</Button>
                )}
              </Col>
            </Row>
          ))}
          <Button size="small" onClick={() => setLineas([...lineas, { descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18, productoId: undefined }])}>
            + Agregar ítem
          </Button>

          {/* Resumen de totales */}
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

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Crear factura recurrente</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
