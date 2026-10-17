import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { DetailDrawer, DetailSections } from '../../components/ui/DetailDrawer';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Input, Space, Tag, Modal, Form, Row, Col,
         Typography, Popconfirm, message, Card, InputNumber,
         Image, Avatar, Tooltip, Select, Tabs, Divider,
         Badge, InputNumber as AntInputNumber, Alert, Switch, Dropdown, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
         WarningOutlined, PictureOutlined,
         FileExcelOutlined, BarcodeOutlined, AppstoreOutlined,
         CloseOutlined, DownOutlined, CalculatorOutlined } from '@ant-design/icons';
import AjustePreciosModal from './AjustePreciosModal';
import { ProductoFormModal } from '../../components/productos/ProductoFormModal';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSucursalesQuery, useUomUnidadesQuery } from '../../hooks/useCatalogQueries';
import dayjs from 'dayjs';
import { productosApi } from '../../api/productos.api';
import { categoriasProductoApi } from '../../api/categoriasProducto.api';
import { atributosApi } from '../../api/atributos.api';
import api from '../../api/client';
import { useCanDo } from '../../hooks/useCanDo';
import { SkeletonTabla } from '../../components/ui/SkeletonTabla';
import { useSkeletonDelay } from '../../hooks/useSkeletonDelay';
import { useAuthStore } from '../../store/auth.store';
import { exportarCatalogo } from '../../utils/exportExcel';
import type { Producto } from '../../types';
import { fmt } from '../../utils/formatters';
import { hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;
const { Search } = Input;

const TIPO_COLOR: Record<string, string> = {
  dimension: 'blue', color: 'volcano', material: 'green', sabor: 'orange', otro: 'default',
};

// Genera un color de avatar determinista por nombre
function avatarColor(nombre: string) {
  const colors = ['#1677ff','#10b981','#f59e0b','#7c3aed','#ef4444','#0891b2','#059669','#d97706'];
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h + nombre.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ── Tab Atributos ──────────────────────────────────────────────────────────────
function AtributosTab() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: atributos, isLoading } = useQuery({ queryKey: ['atributos'], queryFn: atributosApi.listar });

  const crearMut = useMutation({
    mutationFn: atributosApi.crear,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['atributos'] }); setOpen(false); form.resetFields(); message.success('Atributo creado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const addValorMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => atributosApi.agregarValor(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['atributos'] }); message.success('Valor agregado'); },
  });
  const delValorMut = useMutation({
    mutationFn: atributosApi.deleteValor,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['atributos'] }); },
  });
  const delAtribMut = useMutation({
    mutationFn: atributosApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['atributos'] }); message.success('Eliminado'); },
  });

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
        message='Defina aquí los atributos globales (Talla, Color, Material…) y sus valores. Luego asigne variantes a cada producto.' />

      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
          Nuevo atributo
        </Button>
      </Row>

      <Row gutter={[12, 12]}>
        {(atributos ?? []).map((a: any) => (
          <Col xs={24} sm={12} md={8} key={a.id}>
            <Card size="small"
              title={<Space><Tag color={TIPO_COLOR[a.tipo]}>{a.tipo?.toUpperCase()}</Tag><Text strong>{a.nombre}</Text>{a.unidad && <Text type="secondary" style={{ fontSize: 11 }}>({a.unidad})</Text>}</Space>}
              extra={
                <Popconfirm title="¿Eliminar atributo?" onConfirm={() => delAtribMut.mutate(a.id)}>
                  <Button type="text" size="small" danger icon={<CloseOutlined />} />
                </Popconfirm>
              }
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {(a.valores ?? []).map((v: any) => (
                  <Tag key={v.id} closable onClose={() => delValorMut.mutate(v.id)}
                    style={{ backgroundColor: v.colorHex ? `${v.colorHex}22` : undefined, borderColor: v.colorHex ?? undefined }}>
                    {v.colorHex && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: v.colorHex, marginRight: 4 }} />}
                    {v.valor}
                  </Tag>
                ))}
              </div>
              <Input.Search
                placeholder="Agregar valor..." size="small" enterButton="+"
                onSearch={val => { if (val.trim()) addValorMut.mutate({ id: a.id, body: { valor: val.trim() } }); }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Modal title="Nuevo atributo" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width="min(480px, 95vw)">
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={14}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Talla, Color, Material..." /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="tipo" label="Tipo" initialValue="otro">
              <Select options={[
                { value: 'dimension', label: '📐 Dimensión/Talla' },
                { value: 'color',    label: '🎨 Color' },
                { value: 'material', label: '🧵 Material' },
                { value: 'sabor',    label: '🍓 Sabor' },
                { value: 'otro',     label: '📋 Otro' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="unidad" label="Unidad (opcional)"><Input placeholder="kg, cm, ml..." /></Form.Item></Col>
          </Row>
          <Form.Item label="Valores iniciales (opcionales — uno por línea)">
            <Input.TextArea rows={4} placeholder={'XS\nS\nM\nL\nXL\nXXL'} id="valores-init" />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}
              onClick={() => {
                const textarea = document.getElementById('valores-init') as HTMLTextAreaElement;
                const vals = (textarea?.value ?? '').split('\n').map(s => s.trim()).filter(Boolean);
                if (vals.length) form.setFieldValue('valores', vals.map(v => ({ valor: v })));
              }}>
              Crear
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Variantes (por producto) ───────────────────────────────────────────────
function VariantesTab() {
  const [productoId, setProductoId] = useState<number | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [selAtribs, setSelAtribs] = useState<Record<number, number>>({});   // atributoId → valorId
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: productos } = useQuery({ queryKey: ['productos-var'], queryFn: () => productosApi.list(1, 500, '', true) });
  const { data: atributos } = useQuery({ queryKey: ['atributos'], queryFn: atributosApi.listar });
  const { data: variantes, isLoading } = useQuery({
    queryKey: ['variantes', productoId],
    queryFn: () => atributosApi.variantesProducto(productoId!),
    enabled: !!productoId,
  });

  const crearMut = useMutation({
    mutationFn: atributosApi.crearVariante,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variantes', productoId] }); setOpenCreate(false); form.resetFields(); setSelAtribs({}); message.success('Variante creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => atributosApi.updateVariante(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variantes', productoId] }); message.success('Actualizado'); },
  });
  const delMut = useMutation({
    mutationFn: atributosApi.deleteVariante,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variantes', productoId] }); message.success('Eliminada'); },
  });

  const prodOpts = (productos?.data ?? []).map((p: any) => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }));
  const productoSeleccionado = (productos?.data ?? []).find((p: any) => p.id === productoId);

  const cols = [
    { title: 'SKU', dataIndex: 'sku', width: 130, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Variante', dataIndex: 'nombre', ellipsis: true },
    { title: 'Atributos', key: 'attrs', render: (_: any, r: any) =>
      (r.atributos ?? []).map((a: any) => (
        <Tag key={a.atributoId} style={{ backgroundColor: a.colorHex ? `${a.colorHex}22` : undefined }}>
          {a.colorHex && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: a.colorHex, marginRight: 4 }} />}
          {a.atributoNombre}: <strong>{a.valor}</strong>
        </Tag>
      ))
    },
    { title: 'Stock', dataIndex: 'stock', width: 90,
      render: (v: number, r: any) => <Text style={{ color: Number(v) <= Number(r.stockMinimo) ? '#dc2626' : undefined }}><strong>{fmt.number(v)}</strong></Text> },
    { title: 'Precio', key: 'precio', width: 120,
      render: (_: any, r: any) => r.precioOverride ? <Text style={{ color: '#7c3aed' }}>{fmt.money(r.precioOverride)}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>Del producto</Text> },
    { title: 'Estado', dataIndex: 'activa', width: 80,
      render: (v: boolean, r: any) => (
        <Switch size="small" checked={v} onChange={checked => updateMut.mutate({ id: r.id, body: { activa: checked } })} />
      ) },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar variante?" onConfirm={() => delMut.mutate(r.id)}>
          <Button type="text" size="small" danger icon={<CloseOutlined />} />
        </Popconfirm>
      ) },
  ];

  const handleCrear = (v: any) => {
    const atrs = Object.entries(selAtribs).map(([atributoId, valorId]) => ({
      atributoId: Number(atributoId), valorId: Number(valorId),
    }));
    if (atrs.length === 0) { message.warning('Selecciona al menos un atributo'); return; }
    crearMut.mutate({ ...v, productoId: productoId!, atributos: atrs });
  };

  return (
    <>
      <Row gutter={12} align="middle" style={{ marginBottom: 16 }}>
        <Col flex={1}>
          <Select
            showSearch optionFilterProp="label" placeholder="Seleccionar producto para ver sus variantes"
            style={{ width: '100%' }} options={prodOpts} onChange={(v) => setProductoId(Number(v))} />
        </Col>
        {productoId && (
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setSelAtribs({}); setOpenCreate(true); }}>
              Nueva variante
            </Button>
          </Col>
        )}
      </Row>

      {productoId && (
        <Table columns={cols} dataSource={variantes ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
          title={() => <Text type="secondary" style={{ fontSize: 12 }}>{productoSeleccionado?.nombre} — {(variantes ?? []).length} variante(s)</Text>}
        />
      )}

      {!productoId && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
          <AppstoreOutlined style={{ fontSize: 40, marginBottom: 12 }} />
          <br />Selecciona un producto para ver y gestionar sus variantes.
        </div>
      )}

      {/* Modal crear variante */}
      <Modal title={`Nueva variante — ${productoSeleccionado?.nombre ?? ''}`}
        open={openCreate} onCancel={() => { setOpenCreate(false); form.resetFields(); setSelAtribs({}); }} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleCrear}>
          <Form.Item name="sku" label="SKU (opcional — se genera automáticamente)">
            <Input prefix={<BarcodeOutlined />} placeholder="P1-XL-AZ-1" />
          </Form.Item>

          <Divider>Seleccionar atributos</Divider>
          {(atributos ?? []).map((a: any) => (
            <Form.Item key={a.id} label={<><Tag color={TIPO_COLOR[a.tipo]}>{a.tipo}</Tag> {a.nombre}</>}>
              <Select
                placeholder={`Seleccionar ${a.nombre}`} allowClear
                onChange={(valorId) => {
                  if (valorId) setSelAtribs(prev => ({ ...prev, [a.id]: Number(valorId) }));
                  else setSelAtribs(prev => { const n = { ...prev }; delete n[a.id]; return n; });
                }}
                options={(a.valores ?? []).map((v: any) => ({
                  value: v.id,
                  label: <Space size={4}>
                    {v.colorHex && <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: v.colorHex }} />}
                    {v.valor}
                  </Space>,
                }))}
              />
            </Form.Item>
          ))}

          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="stock" label="Stock inicial" initialValue={0}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="precioOverride" label="Precio especial (opcional)"><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="Del producto" /></Form.Item></Col>
          </Row>

          <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
            message={`Combinación seleccionada: ${Object.entries(selAtribs).map(([aid, vid]) => {
              const a = (atributos ?? []).find((x: any) => x.id === Number(aid));
              const v = a?.valores?.find((x: any) => x.id === Number(vid));
              return `${a?.nombre ?? aid}: ${v?.valor ?? vid}`;
            }).join(' / ') || '(ninguna)'}`}
          />

          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpenCreate(false); form.resetFields(); setSelAtribs({}); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear variante</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Historial de proveedores (pestaña del modal de producto) ──────────────────
function HistorialProveedoresPanel({ productoId, active }: { productoId: number; active: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['producto-historial', productoId],
    queryFn:  () => productosApi.historialCompras(productoId),
    enabled:  active && productoId > 0,
    staleTime: 30_000,
  });

  if (!active) return null;

  if (isLoading) return <SkeletonTabla rows={4} cols={5} />;

  if (!data || data.lineas.length === 0) return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🛒</div>
      <div style={{ fontWeight: 500 }}>Sin compras registradas para este producto</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Las compras aparecerán aquí una vez emitidas</div>
    </div>
  );

  const { resumen, lineas } = data as {
    resumen: { ultimaCompra: any; proveedorMasFrecuente: any; variacionCostoTotal: number | null; totalLineas: number };
    lineas: any[];
  };

  const tendColor = (v: number | null) => v == null ? '#6B7280' : v > 0 ? '#ef4444' : v < 0 ? '#22c55e' : '#6B7280';
  const tendIcon  = (v: number | null) => v == null ? '—' : v > 0 ? '↑' : v < 0 ? '↓' : '→';

  const cols = [
    { title: 'Proveedor', dataIndex: 'proveedor', key: 'prov', ellipsis: true, width: 140 },
    {
      title: 'Tipo', dataIndex: 'tipoDocumento', key: 'tipo', width: 55,
      render: (v: string) => <Tag color={v === 'FC' ? 'blue' : 'default'} style={{ fontSize: 10, padding: '0 4px' }}>{v}</Tag>,
    },
    { title: 'Documento', dataIndex: 'numeroDocumento', key: 'doc', ellipsis: true, width: 135 },
    {
      title: 'F. Emisión', dataIndex: 'fechaEmision', key: 'emis', width: 95,
      render: (v: string) => dayjs(v).format('DD-MM-YYYY'),
    },
    {
      title: 'F. Registro', dataIndex: 'fechaRegistro', key: 'reg', width: 95,
      render: (v: string) => dayjs(v).format('DD-MM-YYYY'),
    },
    {
      title: 'Cant.', dataIndex: 'cantidadTotal', key: 'cant', width: 70, align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString('es-DO'),
    },
    { title: 'Und.', dataIndex: 'unidadMedida', key: 'und', width: 55 },
    {
      title: 'Costo Unit.', dataIndex: 'costoUnitarioReal', key: 'costo', width: 115, align: 'right' as const,
      render: (v: number | null, r: any) => v == null ? <Text type="secondary">—</Text> : (
        <div>
          <div style={{ fontWeight: 500 }}>${Number(v).toFixed(2)}</div>
          {r.moneda !== 'DOP' && r.equivalenteMonedaLocal != null && (
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>
              RD${Number(r.equivalenteMonedaLocal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      ),
    },
    { title: 'Mon.', dataIndex: 'moneda', key: 'mon', width: 50 },
    {
      title: 'Tend.', dataIndex: 'variacionPct', key: 'tend', width: 80, align: 'right' as const,
      render: (v: number | null) => (
        <span style={{ color: tendColor(v), fontSize: 12, fontWeight: 500 }}>
          {tendIcon(v)}{v != null && v !== 0 ? ` ${v > 0 ? '+' : ''}${v}%` : ''}
        </span>
      ),
    },
  ];

  return (
    <>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Última compra</div>
            <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13 }}>{resumen.ultimaCompra.proveedor}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {dayjs(resumen.ultimaCompra.fecha).format('DD/MM/YYYY')} · {resumen.ultimaCompra.moneda} ${Number(resumen.ultimaCompra.costo ?? 0).toFixed(2)}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Proveedor más frecuente</div>
            <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13 }}>{resumen.proveedorMasFrecuente.nombre}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{resumen.proveedorMasFrecuente.compras} compra{resumen.proveedorMasFrecuente.compras !== 1 ? 's' : ''}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" bordered={false} style={{ background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Variación de costo</div>
            <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13, color: tendColor(resumen.variacionCostoTotal) }}>
              {resumen.variacionCostoTotal != null
                ? `${tendIcon(resumen.variacionCostoTotal)} ${resumen.variacionCostoTotal > 0 ? '+' : ''}${resumen.variacionCostoTotal}% vs primera compra`
                : '— sin referencia'}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{resumen.totalLineas} línea{resumen.totalLineas !== 1 ? 's' : ''} en total</div>
          </Card>
        </Col>
      </Row>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Histórico de proveedores</div>
      <Table
        size="small"
        dataSource={lineas}
        rowKey={(_: any, i: any) => String(i)}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={cols}
      />
    </>
  );
}

export default function ProductosPage() {
  const { data: stockBajoVar } = useQuery({ queryKey: ['variantes-stock-bajo'], queryFn: atributosApi.stockBajo });
  const alertaVariantes = (stockBajoVar ?? []).length;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Productos & Variantes</Title>
      <Card>
        <Tabs defaultActiveKey="productos" items={[
          { key: 'productos', label: 'Catálogo de Productos', children: <ProductosCatalogo /> },
          { key: 'atributos', label: 'Atributos', children: <AtributosTab /> },
          { key: 'variantes', label: (
              <Space>Variantes {alertaVariantes > 0 && <Badge count={alertaVariantes} size="small" color="orange" />}</Space>
            ), children: <VariantesTab /> },
        ]} />
      </Card>
    </div>
  );
}

// ── Catálogo de Productos (extraído como sub-componente) ───────────────────────
function ProductosCatalogo() {
  const [search,         setSearch]         = useState('');
  const [categoriaId,    setCategoriaId]    = useState<number | undefined>();
  const [page,           setPage]           = useState(1);
  const PAGE_SIZE = 15;
  const [sucursalFiltro, setSucursalFiltro] = useState<number | undefined>();
  const [estadoStock,    setEstadoStock]    = useState('todos');
  const [open,       setOpen]       = useState(false);
  const [editing,          setEditing]          = useState<Producto | null>(null);
  const [detalleProducto,  setDetalleProducto]  = useState<Producto | null>(null);
  const [drawerTab,   setDrawerTab]   = useState<'detalles' | 'historial'>('detalles');
  const qc = useQueryClient();

  const navigate      = useNavigate();
  const puedeCrear    = useCanDo('productos:crear');
  const puedeEditar   = useCanDo('productos:editar');
  const puedeEliminar = useCanDo('productos:eliminar');

  const { user, empresaActual } = useAuthStore();

  // Sucursales accesibles — usadas en los filtros del catálogo
  const { data: sucursales = [] } = useSucursalesQuery(empresaActual);

  // Todos los almacenes sin filtro — para columnas dinámicas y filtro por sucursal del catálogo
  const { data: almacenesTodos = [] } = useQuery<any[]>({
    queryKey: ['almacenes-todos'],
    queryFn:  () => api.get('/almacenes').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : [];
    }),
    staleTime: 5 * 60_000,
    enabled: !!user && !!empresaActual,
  });

  // '/productos?filtro=stock-bajo' (enlace del aviso de la campanita) — mismo
  // criterio exacto que la alerta (stockMinimo>0, stock<=stockMinimo, ventas
  // en los últimos 90 días), aplicado por el backend, no recalculado aquí.
  //
  // "Pendientes de completar" — productos creados en modo rápido desde
  // Compras/POS/Xlink (esCreacionRapida=true). Se limpia solo al primera
  // edición manual completa (ver ProductosService.update()).
  const [soloPendientes, setSoloPendientes] = useState(false);
  const filtroAlerta = soloPendientes ? 'pendiente-completar' : estadoStock === 'bajo-ventas' ? 'stock-bajo' : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['productos', page, search, categoriaId, filtroAlerta],
    queryFn:  () => productosApi.list(page, PAGE_SIZE, search, true, filtroAlerta),
  });
  const showSkeleton = useSkeletonDelay(isLoading, 200);

  // Categorías y marcas: cargan todo el catálogo (no solo la página actual) para Selects completos
  const { data: catalogoCats } = useQuery({
    queryKey: ['categorias-producto'],
    queryFn: () => categoriasProductoApi.listar(),
    staleTime: 5 * 60_000,
  });
  const { data: catalogoMarcas } = useQuery({
    queryKey: ['productos-marcas'],
    queryFn: productosApi.marcas,
    staleTime: 5 * 60_000,
  });
  const categorias = catalogoCats ?? [];
  const marcas     = catalogoMarcas ?? [];
  const nombreCategoriaPorId = useMemo(() => new Map(categorias.map(c => [c.id, c.nombre])), [categorias]);
  const { data: uomUnidades = [] } = useUomUnidadesQuery();
  // Ajustar precios al público toca precios de venta: solo ADMIN (el backend lo exige igual)
  const esAdminPrecios = String((user as any)?.role ?? '').toLowerCase() === 'admin';
  const [ajusteOpen, setAjusteOpen] = useState(false);

  // Mapa almacenId → sucursalId para el filtro local de sucursal
  const almacenSucursalMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const alm of (Array.isArray(almacenesTodos) ? almacenesTodos : [])) {
      if (alm.sucursalId) m.set(Number(alm.id), Number(alm.sucursalId));
    }
    for (const s of (Array.isArray(sucursales) ? sucursales : [])) {
      if (s.almacenPrincipalId) m.set(Number(s.almacenPrincipalId), Number(s.id));
    }
    return m;
  }, [almacenesTodos, sucursales]);

  const rows = useMemo(() => {
    let r: any[] = categoriaId
      ? (data?.data ?? []).filter((p: Producto) => p.categoriaId === categoriaId)
      : (data?.data ?? []);
    if (sucursalFiltro) {
      r = r.filter((p: any) => {
        const spa: any[] = p.stockPorAlmacen ?? [];
        return spa.some((s: any) => almacenSucursalMap.get(Number(s.almacenId)) === sucursalFiltro);
      });
    }
    if (estadoStock !== 'todos') {
      r = r.filter((p: any) => {
        if (p.tipo === 'servicio') return true;
        const total = (p.stockPorAlmacen ?? []).reduce((acc: number, s: any) => acc + Number(s.cantidad), 0);
        if (estadoStock === 'sin')  return total === 0;
        if (estadoStock === 'bajo') return total > 0 && total <= Number(p.stockMinimo);
        if (estadoStock === 'ok')   return total > Number(p.stockMinimo);
        return true;
      });
    }
    return r;
  }, [data, categoriaId, sucursalFiltro, estadoStock, almacenSucursalMap]);

  // ── Exportar a Excel ────────────────────────────────────────────────────────
  const [exportando, setExportando] = useState(false);

  const fechaHoy = () => hoyRD();

  const handleExportarTodo = async () => {
    setExportando(true);
    try {
      const result = await productosApi.list(1, 5000, '', true);
      const todos: any[] = result?.data ?? [];
      if (!todos.length) { message.warning('No hay productos para exportar'); return; }
      exportarCatalogo(todos.map(p => ({ ...p, categoriaNombre: p.categoriaId != null ? nombreCategoriaPorId.get(p.categoriaId) : undefined })), `todo_${fechaHoy()}`);
      message.success(`${todos.length} productos exportados`);
    } catch {
      message.error('Error al exportar el catálogo completo');
    } finally {
      setExportando(false);
    }
  };

  const handleExportarFiltrados = async () => {
    setExportando(true);
    try {
      const result = await productosApi.list(1, 5000, search, true, filtroAlerta);
      let filtrados: any[] = result?.data ?? [];
      // Aplicar filtros client-side adicionales que no pasan por el backend
      if (categoriaId) filtrados = filtrados.filter((p: any) => p.categoriaId === categoriaId);
      if (sucursalFiltro) {
        filtrados = filtrados.filter((p: any) => {
          const spa: any[] = p.stockPorAlmacen ?? [];
          return spa.some((s: any) => almacenSucursalMap.get(Number(s.almacenId)) === sucursalFiltro);
        });
      }
      if (estadoStock !== 'todos') {
        filtrados = filtrados.filter((p: any) => {
          if (p.tipo === 'servicio') return true;
          const total = (p.stockPorAlmacen ?? []).reduce((acc: number, s: any) => acc + Number(s.cantidad), 0);
          if (estadoStock === 'sin')  return total === 0;
          if (estadoStock === 'bajo') return total > 0 && total <= Number(p.stockMinimo);
          if (estadoStock === 'ok')   return total > Number(p.stockMinimo);
          return true;
        });
      }
      if (!filtrados.length) { message.warning('Ningún producto coincide con los filtros actuales'); return; }
      const sufijo = [search && `q-${search.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}`, fechaHoy()].filter(Boolean).join('_');
      exportarCatalogo(filtrados.map(p => ({ ...p, categoriaNombre: p.categoriaId != null ? nombreCategoriaPorId.get(p.categoriaId) : undefined })), `filtrado_${sufijo}`);
      message.success(`${filtrados.length} productos exportados`);
    } catch {
      message.error('Error al exportar los productos filtrados');
    } finally {
      setExportando(false);
    }
  };

  const invalidarProductos = () => {
    qc.invalidateQueries({ queryKey: ['productos'] });
    qc.invalidateQueries({ queryKey: ['productos-sel'] });
    qc.invalidateQueries({ queryKey: ['productos-select'] });
  };

  const deleteMut = useMutation({
    mutationFn: productosApi.remove,
    onSuccess:  () => { invalidarProductos(); message.success('Eliminado'); },
    onError:    (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar producto'),
  });

  // El guardado (crear/editar/validar duplicados/AVCO) vive dentro de
  // ProductoFormModal — el mismo componente que usan POS, Compras y Xlink.
  // Esta página solo decide CUÁNDO abrirlo.
  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (p: Producto) => { setEditing(p); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); };

  // IN01 (buscador global, "Nuevo Producto") — abre el formulario de creación
  // directamente vía ?nuevo=1. Se siembra UNA vez al montar, mismo patrón que
  // FacturasPage con ?desde=&hasta=; se limpia el parámetro para que un F5
  // no vuelva a abrir el modal.
  const [searchParamsProd, setSearchParamsProd] = useSearchParams();
  useEffect(() => {
    if (searchParamsProd.get('nuevo') === '1' && puedeCrear) {
      openCreate();
      setSearchParamsProd(prev => { prev.delete('nuevo'); return prev; }, { replace: true });
    }
    // Enlace del aviso "Productos con stock bajo" de la campanita —
    // ?filtro=stock-bajo. Se deja en la URL (a diferencia de ?nuevo=1) para
    // que recargar la página o compartir el enlace mantenga el filtro.
    if (searchParamsProd.get('filtro') === 'stock-bajo') {
      setEstadoStock('bajo-ventas');
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quitarFiltroAlerta = () => {
    setEstadoStock('todos');
    setSearchParamsProd(prev => { prev.delete('filtro'); return prev; }, { replace: true });
  };

  // Acción masiva "Quitar stock mínimo" — para empresas que lo trajeron de
  // una importación CSV y no lo quieren usar como umbral del aviso.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const quitarStockMinimoMut = useMutation({
    mutationFn: (ids: number[]) => productosApi.quitarStockMinimo(ids),
    onSuccess: (res) => {
      message.success(`Stock mínimo quitado de ${res?.afectados ?? selectedIds.length} producto(s)`);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
    onError: () => message.error('No se pudo quitar el stock mínimo'),
  });

  const COLS_DEF = [
    { key: 'codigo',     label: 'Código',     defaultVisible: false },
    { key: 'nombre',     label: 'Nombre',     defaultVisible: true  },
    { key: 'referencia', label: 'Referencia', defaultVisible: true  },
    { key: 'marca',      label: 'Marca',      defaultVisible: true  },
    { key: 'modelo',     label: 'Modelo',     defaultVisible: true  },
    { key: 'precio',     label: 'Precio',     defaultVisible: true  },
    { key: 'unidad',     label: 'Unidad',     defaultVisible: true  },
    { key: 'existencia', label: 'Existencia', defaultVisible: true  },
    { key: 'ubicacion',  label: 'Ubicación',  defaultVisible: true  },
    { key: 'categoria',  label: 'Categoría',  defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('productos', COLS_DEF);

  // Columnas dinámicas de stock — una por almacén activo de la empresa
  const stockCols: any[] = almacenesTodos.length > 0
    ? almacenesTodos.map((alm: any) => ({
        title: alm.nombre,
        key: `alm-${alm.id}`,
        width: 90,
        render: (_: unknown, r: Producto) => {
          if (r.tipo === 'servicio') return <Text type="secondary">—</Text>;
          const spa = (r as any).stockPorAlmacen as { almacenId: number; cantidad: number }[] | undefined;
          const v = Number(spa?.find((s: any) => Number(s.almacenId) === alm.id)?.cantidad ?? 0);
          const bajo = v > 0 && v <= Number(r.stockMinimo);
          return (
            <Text style={{ color: v === 0 ? '#9CA3AF' : bajo ? '#f59e0b' : '#059669', fontWeight: bajo || v === 0 ? 500 : undefined }}>
              {fmt.number(v)}
            </Text>
          );
        },
      }))
    : [{
        title: 'Stock', key: 'stock', dataIndex: 'stock', width: 90,
        render: (v: number, r: Producto) => {
          if (r.tipo === 'servicio') return <Text type="secondary">—</Text>;
          const bajo = v <= r.stockMinimo;
          return <Space size={4}>{bajo && <Tooltip title="Stock bajo"><WarningOutlined style={{ color: '#ff4d4f' }} /></Tooltip>}<Text style={{ color: bajo ? '#ff4d4f' : undefined }}>{fmt.number(v)}</Text></Space>;
        },
      }];

  const columns: any[] = [
    { title: 'Código',    key: 'codigo', dataIndex: 'codigo',   width: 100, mobileHide: true },
    { title: 'Nombre',    key: 'nombre', dataIndex: 'nombre',   ellipsis: true, mobileTitle: true,
      render: (v: string, r: Producto) => (
        <Space>
          <Tooltip title={r.tipo === 'servicio' ? 'Servicio' : 'Producto'}>
            <Avatar size={28}
              style={{ background: r.tipo === 'servicio' ? '#10B981' : avatarColor(r.nombre), fontSize: 12, borderRadius: 4, flexShrink: 0 }}
              shape="square">
              {r.tipo === 'servicio' ? 'S' : v.charAt(0).toUpperCase()}
            </Avatar>
          </Tooltip>
          <Text style={{ fontSize: 13 }}>{v}</Text>
          {(r as any).esCreacionRapida && (
            <Tooltip title="Creado al vuelo desde una orden de compra — completar datos">
              <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Pendiente</Tag>
            </Tooltip>
          )}
          {(r as any).esPesable && !(r as any).plu && (
            <Tooltip title="Producto pesable sin PLU asignado — edita el producto y asigna el número PLU en la sección Balanza etiquetadora">
              <Tag color="warning" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>⚖ Sin PLU</Tag>
            </Tooltip>
          )}
          {r.tipo !== 'servicio' && !Number((r as any).costoPromedio) && (
            <Tooltip title="Sin historial de compras — no tiene costo promedio (AVCO). Sus ventas no generan línea de costo en el asiento. Edita el producto para fijarlo a mano.">
              <Tag color="red" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>Costo $0</Tag>
            </Tooltip>
          )}
        </Space>
      )},
    { title: 'Referencia', key: 'referencia', dataIndex: 'referencia', width: 120,
      render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Marca',  key: 'marca',  dataIndex: 'marca',  width: 110,
      render: (v: string) => v ? <Text>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Modelo', key: 'modelo', dataIndex: 'modelo', width: 110,
      render: (v: string) => v ? <Text>{v}</Text> : <Text type="secondary">—</Text> },
    { title: 'Precio',    key: 'precio', dataIndex: 'precio',   width: 115, isAmount: true, render: (v: number) => fmt.money(v) },
    { title: 'Unidad',   key: 'unidad', dataIndex: 'unidadMedida', width: 80, align: 'center' as const,
      render: (codigo: string) => {
        const c = codigo ?? 'PZA';
        const uom = (uomUnidades as any[]).find((u: any) => u.codigo === c);
        return uom?.simbolo ?? c.toLowerCase();
      }
    },
    ...(stockCols as any),
    { title: 'Existencia', key: 'existencia', width: 105, align: 'right' as const,
      render: (_: unknown, r: Producto) => {
        if (r.tipo === 'servicio') return <Text type="secondary">—</Text>;
        const spa = (r as any).stockPorAlmacen as { cantidad: number }[] | undefined;
        const total = spa ? spa.reduce((acc, s) => acc + Number(s.cantidad), 0) : Number(r.stock);
        const bajo = total > 0 && total <= Number(r.stockMinimo);
        return <Text style={{ color: total === 0 ? '#9CA3AF' : bajo ? '#f59e0b' : '#059669', fontWeight: bajo || total === 0 ? 500 : undefined }}>{fmt.number(total)}</Text>;
      }},
    { title: 'Ubicación', key: 'ubicacion', width: 110,
      render: (_: unknown, r: Producto) => {
        if (r.tipo === 'servicio') return <Text type="secondary">—</Text>;
        const spa = (r as any).stockPorAlmacen as { ubicacionCodigo?: string }[] | undefined;
        const codes = [...new Set((spa ?? []).map((s: any) => s.ubicacionCodigo).filter(Boolean))];
        return codes.length > 0 ? <Text style={{ fontSize: 12 }}>{codes.join(', ')}</Text> : <Text type="secondary">—</Text>;
      }},
    { title: 'Categoría', key: 'categoria', dataIndex: 'categoriaId', ellipsis: true, mobileHide: true,
      render: (id: number | null) => id != null && nombreCategoriaPorId.get(id) ? <Tag>{nombreCategoriaPorId.get(id)}</Tag> : '—' },
    // ITBIS% y Mín. omitidos — disponibles al editar el producto
    { title: '', key: 'actions', width: 80, isActions: true,
      render: (_: unknown, r: Producto) => (
        <TableActions
          onView={() => setDetalleProducto(r)}
          viewLabel="Detalles e históricos"
          items={[
            ...(puedeEditar ? [{ key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEdit(r) }] : []),
            ...(puedeEliminar ? [
              { type: 'divider' as const },
              { key: 'eliminar', label: 'Eliminar', danger: true, icon: <DeleteOutlined />,
                onClick: () => Modal.confirm({
                  title: `¿Eliminar "${r.nombre}"?`,
                  content: 'El producto se ocultará del catálogo. El historial de ventas y compras se conserva.',
                  okText: 'Eliminar', okType: 'danger', cancelText: 'Cancelar',
                  onOk: () => deleteMut.mutate(r.id),
                }),
              },
            ] : []),
          ]}
        />
      ) },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          {data?.meta && <Text type="secondary" style={{ fontSize: 12 }}>{data.meta.total.toLocaleString('es-DO')} productos</Text>}
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Código, nombre o categoría..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: '100%', minWidth: 0, maxWidth: 220 }}
            />
            <Select placeholder="Categoría" value={categoriaId} onChange={v => { setCategoriaId(v); setPage(1); }} allowClear style={{ width: 170 }}>
              {categorias.map(c => <Select.Option key={c.id} value={c.id}>{c.ruta}</Select.Option>)}
            </Select>
            {sucursales.length > 1 && (
              <Select placeholder="Sucursal" value={sucursalFiltro} onChange={v => setSucursalFiltro(v)} allowClear style={{ width: 140 }}>
                {sucursales.map((s: any) => <Select.Option key={s.id} value={s.id}>{s.nombre}</Select.Option>)}
              </Select>
            )}
            <Select value={estadoStock} onChange={v => { setEstadoStock(v); setPage(1); }} style={{ width: 170 }}>
              <Select.Option value="todos">Todos</Select.Option>
              <Select.Option value="ok">Stock OK</Select.Option>
              <Select.Option value="bajo">Stock Bajo</Select.Option>
              <Select.Option value="sin">Sin Stock</Select.Option>
              <Select.Option value="bajo-ventas">Stock bajo + ventas 90d</Select.Option>
            </Select>
            {selectedIds.length > 0 && (
              <Popconfirm
                title={`¿Quitar el stock mínimo de ${selectedIds.length} producto(s)?`}
                onConfirm={() => quitarStockMinimoMut.mutate(selectedIds)}
              >
                <Button danger loading={quitarStockMinimoMut.isPending}>
                  Quitar stock mínimo ({selectedIds.length})
                </Button>
              </Popconfirm>
            )}
            <Dropdown
              trigger={['click']}
              disabled={exportando}
              menu={{
                items: [
                  { key: 'todo',      icon: <FileExcelOutlined />, label: 'Exportar todo el catálogo',   onClick: handleExportarTodo },
                  { key: 'filtrado',  icon: <FileExcelOutlined />, label: 'Exportar filtro actual',      onClick: handleExportarFiltrados },
                ],
              }}
            >
              <Button icon={<FileExcelOutlined />} loading={exportando}>
                Excel <DownOutlined />
              </Button>
            </Dropdown>
            {esAdminPrecios && (
              <Tooltip title="Corrige precios al público que quedaron con céntimos (400.02 en vez de 400.00)">
                <Button icon={<CalculatorOutlined />} onClick={() => setAjusteOpen(true)}>
                  Ajustar precios
                </Button>
              </Tooltip>
            )}
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['productos']} />
            <VideoTutorialButton />
            <Tooltip title="Productos creados al vuelo desde Compras, POS o Xlink — les falta costo, almacén u otros datos">
              <Button
                type={soloPendientes ? 'primary' : 'default'}
                onClick={() => { setSoloPendientes(v => !v); setPage(1); }}
              >
                Pendientes de completar
              </Button>
            </Tooltip>
            {puedeCrear && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nuevo producto
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {filtroAlerta === 'stock-bajo' && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="Mostrando solo productos con stock bajo y ventas en los últimos 90 días"
          action={<Button size="small" onClick={quitarFiltroAlerta}>Quitar filtro</Button>}
        />
      )}
      {soloPendientes && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="Mostrando solo productos pendientes de completar (creados en modo rápido)"
          action={<Button size="small" onClick={() => setSoloPendientes(false)}>Quitar filtro</Button>}
        />
      )}

      {showSkeleton && <SkeletonTabla rows={7} cols={8} />}
      <Table columns={filterColumns(columns) as any} dataSource={rows} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        style={{ display: showSkeleton ? 'none' : undefined }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        }}
        rowClassName={(r: Producto) => {
          if (r.tipo === 'servicio') return '';
          const spa = (r as any).stockPorAlmacen as { cantidad: number }[] | undefined;
          const total = spa ? spa.reduce((acc, s) => acc + Number(s.cantidad), 0) : r.stock;
          return total <= r.stockMinimo ? 'ant-table-row-danger' : '';
        }}
        pagination={{ total: data?.meta.total, pageSize: PAGE_SIZE, current: page,
                      onChange: setPage, showTotal: t => `${t} productos`, showSizeChanger: false }} />

      <ProductoFormModal
        open={open}
        onClose={closeModal}
        producto={editing}
        onSuccess={() => {}}
      />

      <DetailDrawer
        open={!!detalleProducto}
        onClose={() => { setDetalleProducto(null); setDrawerTab('detalles'); }}
        title={detalleProducto?.nombre ?? 'Producto'}
        sections={[]}
        width={drawerTab === 'historial' ? 700 : 480}
      >
        <Tabs
          activeKey={drawerTab}
          onChange={k => setDrawerTab(k as 'detalles' | 'historial')}
          style={{ marginTop: -8 }}
          items={[
            {
              key: 'detalles',
              label: 'Detalles',
              children: (
                // El mismo componente que pinta los bloques del panel de
                // detalle. Antes esto era una copia del marcado de DetailDrawer,
                // y una copia es lo que permite que las pantallas se separen.
                <DetailSections sections={[{
                  fields: [
                    { label: 'Código',    value: detalleProducto?.codigo },
                    { label: 'SKU',       value: (detalleProducto as any)?.sku },
                    { label: 'Nombre',    value: detalleProducto?.nombre, span: 2 },
                    { label: 'Categoría', value: detalleProducto?.categoriaId != null ? nombreCategoriaPorId.get(detalleProducto.categoriaId) : undefined },
                    { label: 'Precio',    value: detalleProducto?.precio !== undefined
                        ? `RD$${Number(detalleProducto.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
                        : undefined },
                    { label: 'Stock',     value: detalleProducto?.stock !== undefined
                        ? `${detalleProducto.stock} unidades` : undefined },
                    { label: 'Estado',    value: <Tag color={detalleProducto?.isActive !== false ? 'green' : 'red'}>
                        {detalleProducto?.isActive !== false ? 'Activo' : 'Inactivo'}</Tag> },
                  ],
                }]} />
              ),
            },
            {
              key: 'historial',
              label: 'Histórico de proveedores',
              children: (
                <HistorialProveedoresPanel
                  productoId={detalleProducto?.id ?? 0}
                  active={drawerTab === 'historial'}
                />
              ),
            },
          ]}
        />
      </DetailDrawer>

      {esAdminPrecios && (
        <AjustePreciosModal
          open={ajusteOpen}
          onClose={() => setAjusteOpen(false)}
          onApplied={() => qc.invalidateQueries({ queryKey: ['productos'] })}
          categorias={categorias}
          marcas={marcas}
        />
      )}
    </>
  );
}

