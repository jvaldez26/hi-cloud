import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Input, Space, Tag, Modal, Form, Row, Col,
         Typography, Popconfirm, message, Card, InputNumber,
         Image, Avatar, Tooltip, Upload, Select, Tabs, Divider,
         Badge, InputNumber as AntInputNumber, Alert, Switch, Segmented } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
         WarningOutlined, PictureOutlined, UploadOutlined, LinkOutlined,
         FileExcelOutlined, BarcodeOutlined, AppstoreOutlined,
         CloseOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { productosApi, type ProductoPayload } from '../../api/productos.api';
import { atributosApi } from '../../api/atributos.api';
import api from '../../api/client';
import { useCanDo } from '../../hooks/useCanDo';
import { useAuthStore } from '../../store/auth.store';
import { exportarInventario } from '../../utils/exportExcel';
import type { Producto } from '../../types';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;
const { Search } = Input;

const TIPO_COLOR: Record<string, string> = {
  dimension: 'blue', color: 'volcano', material: 'green', sabor: 'orange', otro: 'default',
};

/** Redimensiona una imagen a máx 500×500 y la convierte a JPEG base64 */
function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const MAX = 500;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else                { width  = Math.round((width  * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
          pagination={{ pageSize: 20 }}
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

// ── Selector de Unidad de Medida — conectado al catálogo UOM ─────────────────
// Si hay unidades configuradas en /uom, las muestra como opciones.
// Si no, permite escribir libremente (fallback).
function UomSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { data: unidades } = useQuery({
    queryKey: ['uom-unidades'],
    queryFn: () => api.get('/uom').then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  const opts = (unidades ?? []).map((u: any) => ({
    value: u.codigo,
    label: `${u.codigo} — ${u.nombre}${u.simbolo ? ` (${u.simbolo})` : ''}`,
  }));

  if (opts.length > 0) {
    return (
      <Select
        showSearch optionFilterProp="label"
        value={value} onChange={onChange}
        placeholder="Seleccionar o buscar unidad"
        options={opts}
        dropdownRender={menu => (
          <>
            {menu}
            <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                <a href="/uom" target="_blank" rel="noreferrer">+ Configurar unidades</a>
              </Text>
            </div>
          </>
        )}
      />
    );
  }

  // Fallback — input libre si no hay UOM configurado
  return (
    <Input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder="PZA, KG, LT..."
      addonAfter={
        <Tooltip title="Configura el catálogo de unidades para buscar aquí">
          <a href="/uom" target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>UOM</a>
        </Tooltip>
      }
    />
  );
}

// Componente invisible — precarga las unidades al abrir el formulario
function UomMedidaSelector() {
  useQuery({
    queryKey: ['uom-unidades'],
    queryFn: () => api.get('/uom').then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });
  return null;
}

// ── Catálogo de Productos (extraído como sub-componente) ───────────────────────
function ProductosCatalogo() {
  const [search,     setSearch]     = useState('');
  const [categoria,  setCategoria]  = useState<string | undefined>();
  const [page,       setPage]       = useState(1);
  const [open,       setOpen]       = useState(false);
  const [editing,          setEditing]          = useState<Producto | null>(null);
  const [detalleProducto,  setDetalleProducto]  = useState<Producto | null>(null);
  const [preview,    setPreview]    = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [form]                      = Form.useForm<ProductoPayload>();
  const tipoWatch  = Form.useWatch('tipo',          form) ?? 'producto';
  const itbisWatch = Form.useWatch('porcentajeIva', form) ?? 18;
  const esServicio = tipoWatch === 'servicio';
  const [fieldErrors,      setFieldErrors]      = useState<{ codigo?: string; nombre?: string }>({});
  const [precioConItbis,   setPrecioConItbis]   = useState(false);
  const [precioInput,      setPrecioInput]       = useState(0);
  // Nonce para cancelar checks async de duplicados que quedaron pendientes
  // al cerrar/abrir el modal (evita race condition que muestra error de producto anterior)
  const dupCheckNonce = useRef(0);
  const qc = useQueryClient();

  const navigate      = useNavigate();
  const puedeCrear    = useCanDo('productos:crear');
  const puedeEditar   = useCanDo('productos:editar');
  const puedeEliminar = useCanDo('productos:eliminar');

  const { sucursalActual: sucursalJwt, almacenActual: almacenJwt, user, empresaActual } = useAuthStore();
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | undefined>(undefined);

  // Sucursales accesibles — comparte caché con AppLayout
  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['mis-sucursales', user?.id, empresaActual],
    queryFn:  () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled:   open && !!user && !!empresaActual,
  });

  // Almacenes filtrados por sucursal seleccionada — se cargan solo cuando el modal está abierto
  const { data: almacenesRaw = [] } = useQuery<any[]>({
    queryKey: ['almacenes-lista', sucursalSeleccionada],
    queryFn:  () => api.get(
      sucursalSeleccionada ? `/almacenes?sucursalId=${sucursalSeleccionada}` : '/almacenes'
    ).then((r: any) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
    enabled:   open,
  });
  const almacenes: { id: number; nombre: string }[] = almacenesRaw;

  // Auto-seleccionar almacén cuando carga la lista (ej: al cambiar sucursal)
  useEffect(() => {
    if (!open || editing) return;
    const alreadySet = form.getFieldValue('almacenId');
    if (alreadySet) return;
    const aid = almacenJwt ? Number(almacenJwt) : undefined;
    if (almacenes.length === 1) {
      form.setFieldValue('almacenId', almacenes[0].id);
    } else if (aid && almacenes.some((a: any) => a.id === aid)) {
      form.setFieldValue('almacenId', aid);
    }
  }, [almacenes]);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', page, search, categoria],
    queryFn:  () => productosApi.list(page, 15, search, true),
  });

  const categorias = [...new Set((data?.data ?? []).map((p: Producto) => p.categoria).filter(Boolean))] as string[];
  const rows = categoria ? (data?.data ?? []).filter((p: Producto) => p.categoria === categoria) : (data?.data ?? []);

  // Parsear error del backend y asignarlo al campo correspondiente
  const handleApiError = (e: any, fallback: string) => {
    const msg: string = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? e?.message ?? fallback;
    if (msg.includes("código '")) {
      setFieldErrors(prev => ({ ...prev, codigo: msg }));
    } else if (msg.includes("nombre '")) {
      setFieldErrors(prev => ({ ...prev, nombre: msg }));
    } else {
      message.error(msg, 6);
    }
  };

  const createMut = useMutation({
    mutationFn: productosApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); closeModal(); message.success('Producto creado'); },
    onError:   (e: any) => handleApiError(e, 'Error al crear producto'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProductoPayload> }) => productosApi.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); closeModal(); message.success('Actualizado'); },
    onError:   (e: any) => handleApiError(e, 'Error al actualizar producto'),
  });
  const deleteMut = useMutation({
    mutationFn: productosApi.remove,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['productos'] }); message.success('Eliminado'); },
  });

  const openCreate = () => {
    dupCheckNonce.current++;  // invalida cualquier check async pendiente
    setEditing(null); form.resetFields(); form.setFieldValue('codigo', ''); setPreview(''); setFieldErrors({});
    setPrecioInput(0); setPrecioConItbis(false);
    // Pre-seleccionar sucursal del JWT si el usuario tiene asignada una
    const sid = sucursalJwt ? Number(sucursalJwt) : undefined;
    if (sid) {
      (form as any).setFieldValue('sucursalId', sid);
      setSucursalSeleccionada(sid);
    } else {
      setSucursalSeleccionada(undefined);
    }
    setOpen(true);
  };
  const openEdit = (p: Producto) => {
    dupCheckNonce.current++;  // invalida cualquier check async pendiente
    setEditing(p);
    const safeValues = {
      ...p,
      codigo:      p.codigo      ?? '',
      nombre:      p.nombre      ?? '',
      categoria:   p.categoria   ?? '',
      descripcion: p.descripcion ?? '',
      imagenUrl:   p.imagenUrl   ?? '',
    };
    form.setFieldsValue(safeValues);
    setPreview(p.imagenUrl ?? ''); setFieldErrors({});
    setPrecioInput(Number(p.precio) || 0); setPrecioConItbis(false);
    setSucursalSeleccionada(undefined);
    if (almacenes.length === 1 && !(p as any).almacenId) form.setFieldValue('almacenId', almacenes[0].id);
    setOpen(true);
  };
  const closeModal = () => {
    dupCheckNonce.current++;  // invalida cualquier check async pendiente
    setOpen(false); setEditing(null); form.resetFields(); setPreview(''); setFieldErrors({});
    setPrecioInput(0); setPrecioConItbis(false);
    setSucursalSeleccionada(undefined);
  };
  const handleSubmit = (values: ProductoPayload) => {
    if (precioInput <= 0) { message.error('El precio es requerido'); return; }
    // Validar almacén si hay stock inicial (solo al crear)
    if (!editing && values.tipo !== 'servicio' && (values.stock ?? 0) > 0 && !(values as any).almacenId) {
      message.error('Debes seleccionar un almacén para registrar el stock inicial');
      return;
    }
    const itbis  = values.porcentajeIva ?? 18;
    const pBase  = precioConItbis
      ? Math.round((Number(precioInput) / (1 + itbis / 100)) * 100) / 100
      : Number(precioInput);
    const payload: ProductoPayload = { ...values, precio: pBase };
    // no enviar cadena vacía ni valores basura
    if (!payload.codigo || payload.codigo === 'undefined' || payload.codigo === 'null') delete (payload as any).codigo;
    // sucursalId es solo para filtrar almacenes en la UI — no va al backend (producto pertenece a empresa, no sucursal)
    delete (payload as any).sucursalId;
    if (values.tipo === 'servicio') {
      payload.stock = undefined;
      payload.stockMinimo = undefined;
    }
    if (editing) updateMut.mutate({ id: editing.id, body: payload });
    else         createMut.mutate(payload);
  };

  const COLS_DEF = [
    { key: 'codigo',    label: 'Código',    defaultVisible: false },
    { key: 'nombre',    label: 'Nombre',    defaultVisible: true  },
    { key: 'precio',    label: 'Precio',    defaultVisible: true  },
    { key: 'stock',     label: 'Stock',     defaultVisible: true  },
    { key: 'categoria', label: 'Categoría', defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('productos', COLS_DEF);

  const columns = [
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
        </Space>
      )},
    { title: 'Precio',    key: 'precio', dataIndex: 'precio',   width: 115, isAmount: true, render: (v: number) => fmt.money(v) },
    { title: 'Stock', key: 'stock', dataIndex: 'stock', width: 90,
      render: (v: number, r: Producto) => {
        if (r.tipo === 'servicio') return <Text type="secondary">—</Text>;
        const bajo = v <= r.stockMinimo;
        return <Space size={4}>{bajo && <Tooltip title="Stock bajo"><WarningOutlined style={{ color: '#ff4d4f' }} /></Tooltip>}<Text style={{ color: bajo ? '#ff4d4f' : undefined }}>{fmt.number(v)}</Text></Space>;
      } },
    { title: 'Categoría', key: 'categoria', dataIndex: 'categoria', ellipsis: true, mobileHide: true, render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
    // ITBIS% y Mín. omitidos — disponibles al editar el producto
    { title: '', key: 'actions', width: 80, isActions: true,
      render: (_: unknown, r: Producto) => (
        <TableActions
          onView={() => setDetalleProducto(r)}
          viewLabel="Editar producto"
          items={[
            ...(puedeEditar ? [{ key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEdit(r) }] : []),
            ...(puedeEliminar ? [
              { type: 'divider' as const },
              { key: 'eliminar', label: 'Eliminar', danger: true, icon: <DeleteOutlined />, onClick: () => deleteMut.mutate(r.id) },
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
            <Select placeholder="Categoría" value={categoria} onChange={v => setCategoria(v)} allowClear style={{ width: 150 }}>
              {categorias.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
            </Select>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              exportarInventario(rows);
              message.success(`${rows.length} productos exportados`);
            }}>
              Excel
            </Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['productos']} />
            <VideoTutorialButton />
            {puedeCrear && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nuevo producto
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Table columns={filterColumns(columns)} dataSource={rows} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        rowClassName={(r: Producto) => r.tipo !== 'servicio' && r.stock <= r.stockMinimo ? 'ant-table-row-danger' : ''}
        pagination={{ total: data?.meta.total, pageSize: 10, current: page,
                      onChange: setPage, showTotal: t => `${t} productos`, showSizeChanger: false }} />

      <Modal title={editing ? 'Editar producto' : 'Nuevo producto'}
        open={open} onCancel={closeModal} footer={null} width="min(700px, 95vw)">
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ tipo: 'producto', unidadMedida: 'PZA', porcentajeIva: 18, stock: 0, stockMinimo: 0 }}>
          <UomMedidaSelector />

          {/* Tipo: Producto / Servicio */}
          <Form.Item name="tipo" label="Tipo" style={{ marginBottom: 16 }}>
            <Segmented
              options={[
                { label: '📦 Producto', value: 'producto' },
                { label: '⚙️ Servicio', value: 'servicio' },
              ]}
              block
            />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="codigo" label="Código"
                validateStatus={fieldErrors.codigo ? 'error' : undefined}
                help={fieldErrors.codigo}>
                <Input
                  placeholder="Se generará automáticamente"
                  onChange={() => setFieldErrors(prev => ({ ...prev, codigo: undefined }))}
                  onBlur={async e => {
                    const raw = e.target.value;
                    const val = (raw == null || raw === 'undefined' || raw === 'null') ? '' : raw.trim();
                    if (!val || val.length === 0) return;
                    const nonce = dupCheckNonce.current;
                    try {
                      const qs = editing ? `&excludeId=${editing.id}` : '';
                      const r = await api.get(`/productos/check-duplicado?campo=codigo&valor=${encodeURIComponent(val)}${qs}`);
                      if (dupCheckNonce.current !== nonce) return; // modal cambió — descartar
                      if (!(r.data?.data ?? r.data)?.disponible) {
                        setFieldErrors(prev => ({ ...prev, codigo: `Ya existe un producto con el código '${val}'` }));
                      }
                    } catch { /* sin feedback si falla el check */ }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}
                validateStatus={fieldErrors.nombre ? 'error' : undefined}
                help={fieldErrors.nombre}>
                <Input
                  onChange={() => setFieldErrors(prev => ({ ...prev, nombre: undefined }))}
                  onBlur={async e => {
                    const val = e.target.value.trim();
                    if (!val) return;
                    const nonce = dupCheckNonce.current;
                    try {
                      const qs = editing ? `&excludeId=${editing.id}` : '';
                      const r = await api.get(`/productos/check-duplicado?campo=nombre&valor=${encodeURIComponent(val)}${qs}`);
                      if (dupCheckNonce.current !== nonce) return; // modal cambió — descartar
                      if (!(r.data?.data ?? r.data)?.disponible) {
                        setFieldErrors(prev => ({ ...prev, nombre: `Ya existe un producto con el nombre '${val}'` }));
                      }
                    } catch { /* sin feedback si falla el check */ }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              {/* ── Precio con toggle "Con ITBIS" ── */}
              {(() => {
                const pBase  = precioConItbis
                  ? Math.round((Number(precioInput) / (1 + itbisWatch / 100)) * 100) / 100
                  : Number(precioInput);
                const mItbis = Math.round((pBase * (itbisWatch / 100)) * 100) / 100;
                const pFinal = Math.round((pBase + mItbis) * 100) / 100;
                return (
                  <Form.Item
                    label={
                      <span>
                        Precio (RD$){' '}
                        <Tooltip title="Si tu proveedor te da el precio con ITBIS incluido, activa 'Con ITBIS' y el sistema calculará el precio base automáticamente. El sistema siempre guarda y factura el precio SIN ITBIS.">
                          <QuestionCircleOutlined style={{ color: '#9CA3AF', marginLeft: 4 }} />
                        </Tooltip>
                      </span>
                    }
                    required
                  >
                    <Space.Compact style={{ width: '100%' }}>
                      <InputNumber
                        style={{ width: 'calc(100% - 120px)' }}
                        value={precioInput || undefined}
                        onChange={v => setPrecioInput(Number(v) || 0)}
                        formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                        parser={v => (v ?? '').replace(/,/g, '') as any}
                        min={0}
                        precision={2}
                        placeholder="0.00"
                      />
                      <Button
                        type={precioConItbis ? 'primary' : 'default'}
                        onClick={() => setPrecioConItbis(p => !p)}
                        style={{ width: 120 }}
                        title={precioConItbis
                          ? 'Click para indicar que el precio NO incluye ITBIS'
                          : 'Click si el precio YA incluye ITBIS'}
                      >
                        {precioConItbis ? '✓ Con ITBIS' : 'Sin ITBIS'}
                      </Button>
                    </Space.Compact>
                    {precioInput > 0 && itbisWatch > 0 && (
                      <div style={{
                        marginTop: 6, padding: '6px 10px',
                        background: precioConItbis ? '#EFF6FF' : '#F0FDF4',
                        border: `1px solid ${precioConItbis ? '#BFDBFE' : '#BBF7D0'}`,
                        borderRadius: 6, fontSize: 12,
                      }}>
                        {precioConItbis ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#6B7280' }}>Precio sin ITBIS:</span>
                              <span style={{ fontWeight: 600, color: '#1D4ED8' }}>
                                RD${pBase.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#6B7280' }}>ITBIS ({itbisWatch}%):</span>
                              <span style={{ color: '#6B7280' }}>
                                RD${mItbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #BFDBFE', marginTop: 4, paddingTop: 4 }}>
                              <span style={{ color: '#6B7280' }}>Se guardará como precio base:</span>
                              <span style={{ fontWeight: 700, color: '#1D4ED8' }}>
                                RD${pBase.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#6B7280' }}>ITBIS ({itbisWatch}%):</span>
                              <span style={{ color: '#6B7280' }}>
                                +RD${mItbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#6B7280' }}>Precio final al cliente:</span>
                              <span style={{ fontWeight: 600, color: '#16A34A' }}>
                                RD${pFinal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Form.Item>
                );
              })()}
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="porcentajeIva" label="ITBIS %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="unidadMedida" label="Unidad de Medida">
                <UomSelect />
              </Form.Item>
            </Col>
            {!esServicio && (
              <Col xs={24} sm={8}>
                <Form.Item name="stock" label="Stock">
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
              </Col>
            )}
            {!esServicio && (
              <Col xs={24} sm={8}>
                <Form.Item name="stockMinimo" label="Stock mínimo">
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={8}>
              <Form.Item name="categoria" label="Categoría"><Input /></Form.Item>
            </Col>

            {/* Sucursal — solo cuando el usuario tiene acceso a varias */}
            {!esServicio && sucursales.length > 1 && (
              <Col xs={24} sm={8}>
                <Form.Item name="sucursalId" label="Sucursal">
                  <Select
                    placeholder="Seleccionar sucursal"
                    allowClear
                    options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))}
                    onChange={(val) => {
                      form.setFieldValue('almacenId', undefined);
                      setSucursalSeleccionada(val ?? undefined);
                    }}
                  />
                </Form.Item>
              </Col>
            )}

            {/* Almacén — solo para productos físicos */}
            {!esServicio && (
              <Col xs={24} sm={almacenes.length === 0 ? 24 : 16}>
                {almacenes.length === 0 ? (
                  <Form.Item label="Almacén">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {sucursalSeleccionada ? 'Esta sucursal no tiene almacenes. ' : 'No hay almacenes configurados. '}
                      <a
                        onClick={() => navigate(sucursalSeleccionada
                          ? `/almacenes?sucursalId=${sucursalSeleccionada}`
                          : '/almacenes')}
                        style={{ cursor: 'pointer' }}
                      >Crear almacén →</a>
                    </Text>
                  </Form.Item>
                ) : (
                  <Form.Item name="almacenId" label="Almacén"
                    extra={almacenes.length === 1 ? undefined : 'Almacén donde se registrará el stock inicial'}>
                    <Select
                      placeholder={sucursales.length > 1 && !sucursalSeleccionada ? 'Primero selecciona una sucursal' : 'Seleccionar almacén'}
                      disabled={sucursales.length > 1 && !sucursalSeleccionada}
                      allowClear={almacenes.length > 1}
                      options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
                    />
                  </Form.Item>
                )}
              </Col>
            )}

            {/* Imagen — subir archivo o URL */}
            <Col span={24}>
              <Form.Item name="imagenUrl" label="Imagen del producto">
                <Input
                  prefix={<LinkOutlined />}
                  placeholder="https://... (pega una URL) o sube desde tu dispositivo ↓"
                  onChange={e => setPreview(e.target.value)}
                  allowClear
                  onClear={() => setPreview('')}
                />
              </Form.Item>

              <div style={{ marginTop: -10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Botón de subida */}
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    if (!file.type.startsWith('image/')) { message.error('Solo se permiten imágenes'); return false; }
                    if (file.size > 10 * 1024 * 1024) { message.error('La imagen no puede superar 10 MB'); return false; }
                    setUploading(true);
                    try {
                      const base64 = await resizeToBase64(file);
                      form.setFieldValue('imagenUrl', base64);
                      setPreview(base64);
                      message.success('Imagen cargada y optimizada');
                    } catch {
                      message.error('No se pudo procesar la imagen');
                    } finally {
                      setUploading(false);
                    }
                    return false; // no subir al servidor
                  }}
                >
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploading}
                    type="dashed"
                    style={{ minWidth: 160 }}
                  >
                    {uploading ? 'Procesando...' : 'Subir desde dispositivo'}
                  </Button>
                </Upload>

                {/* Preview */}
                {preview && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                      src={preview}
                      alt="preview"
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }}
                      onError={() => setPreview('')}
                    />
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Vista previa</Text>
                      <Button
                        type="link" danger size="small" style={{ padding: 0, height: 'auto' }}
                        onClick={() => { form.setFieldValue('imagenUrl', ''); setPreview(''); }}
                      >
                        Eliminar imagen
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Col>

            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
            </Col>
          </Row>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit"
                loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Actualizar' : 'Crear'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      <DetailDrawer
        open={!!detalleProducto}
        onClose={() => setDetalleProducto(null)}
        title={detalleProducto?.nombre ?? 'Producto'}
        sections={[{
          fields: [
            { label: 'Código',    value: detalleProducto?.codigo },
            { label: 'SKU',       value: (detalleProducto as any)?.sku },
            { label: 'Nombre',    value: detalleProducto?.nombre, span: 2 },
            { label: 'Categoría', value: detalleProducto?.categoria },
            { label: 'Precio',    value: detalleProducto?.precio !== undefined ? `RD$${Number(detalleProducto.precio).toLocaleString('es-DO',{minimumFractionDigits:2})}` : undefined },
            { label: 'Stock',     value: detalleProducto?.stock !== undefined ? `${detalleProducto.stock} unidades` : undefined },
            { label: 'Estado',    value: <Tag color={detalleProducto?.isActive !== false ? 'green' : 'red'}>{detalleProducto?.isActive !== false ? 'Activo' : 'Inactivo'}</Tag> },
          ],
        }]}
      />
    </>
  );
}
