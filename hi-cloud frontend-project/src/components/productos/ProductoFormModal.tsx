/**
 * Formulario único de producto — crear y editar, usado desde Inventario, POS,
 * Compras (alta rápida desde una línea de OC) y Xlink (alta rápida desde una
 * homologación). Antes cada uno tenía su propia copia con campos distintos,
 * validaciones distintas y un ITBIS 18% fijo en Compras sin mostrarlo al
 * usuario (ver docs/unificacion-formulario-producto.md).
 *
 * `modoInicial='rapido'` muestra solo: tipo, nombre, unidad, ITBIS, costo
 * (si el rol lo permite), precio, categoría y código de barras — con un
 * enlace "Más campos" que expande al formulario completo. Los productos
 * creados en modo rápido quedan `esCreacionRapida=true` (ya lo hacía
 * Compras; aquí se generaliza a POS y Xlink) y el backend lo limpia solo al
 * primera edición manual completa — Inventario los filtra como "Pendientes
 * de completar".
 *
 * Costo/precio2/precio3 (precios mayoristas) nunca se muestran a VENDEDOR —
 * el backend también los ignora si llegan en el payload de ese rol
 * (ProductosService.ignorarCamposRestringidosSiVendedor), así que ocultarlos
 * aquí es UX, no la puerta de seguridad real.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal, Form, Row, Col, Input, InputNumber, Select, Switch, Segmented,
  Button, Space, Typography, Tooltip, Upload, message, Alert,
} from 'antd';
import { LinkOutlined, UploadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productosApi, type ProductoPayload } from '../../api/productos.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { productoProveedorApi } from '../../api/productoProveedor.api';
import { configuracionApi } from '../../api/configuracion.api';
import { wmsApi } from '../../api/wms.api';
import { useSucursalesQuery, useUomUnidadesQuery } from '../../hooks/useCatalogQueries';
import { useProductoImagen } from '../../hooks/useProductoImagen';
import { useRol } from '../../hooks/useCanDo';
import { useAuthStore } from '../../store/auth.store';
import { UomSelect } from '../ui/UomSelect';
import CategoriaSelect from './CategoriaSelect';
import api from '../../api/client';
import type { Producto } from '../../types';

const { Text } = Typography;

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

type CampoDup = 'codigo' | 'nombre' | 'codigoBarras';

export interface ProductoFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Producto a editar — undefined/null = crear */
  producto?: Producto | null;
  onSuccess?: (producto: Producto) => void;
  /** 'rapido' = subconjunto mínimo + "Más campos"; 'completo' = formulario entero. Default 'completo'. */
  modoInicial?: 'rapido' | 'completo';
  /** Compras: proveedor de la OC en curso, precargado y sin Select (ya se sabe). */
  proveedorIdInicial?: number;
  /** Compras/Xlink: nombre que el usuario ya tecleó antes de decidir crear el producto. Solo al crear. */
  nombreInicial?: string;
  /** Xlink: unidad/ITBIS/precio sugeridos por el documento externo — solo al crear, el usuario los puede cambiar. */
  valoresInicialesExtra?: { unidadMedida?: string; porcentajeIva?: number; precio?: number };
  /** true = este alta siempre queda esCreacionRapida (Compras/Xlink), sin importar si el usuario expandió a "más campos". */
  marcarCreacionRapida?: boolean;
  width?: number | string;
}

export function ProductoFormModal({
  open, onClose, producto, onSuccess,
  modoInicial = 'completo', proveedorIdInicial, nombreInicial, valoresInicialesExtra, marcarCreacionRapida = false,
  width = 'min(700px, 95vw)',
}: ProductoFormModalProps) {
  const editing = !!producto;
  const [form] = Form.useForm<ProductoPayload>();
  const [modo, setModo] = useState<'rapido' | 'completo'>(modoInicial);
  const [modoAvanzado, setModoAvanzado] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ codigo?: string; nombre?: string; codigoBarras?: string }>({});
  const [precioConItbis, setPrecioConItbis] = useState(false);
  const [precioInput, setPrecioInput] = useState(0);
  const [precio2Input, setPrecio2Input] = useState<number | null>(null);
  const [precio3Input, setPrecio3Input] = useState<number | null>(null);
  const [costoInput, setCostoInput] = useState<number | null>(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | undefined>(undefined);
  const [modalCostoManual, setModalCostoManual] = useState(false);
  const [costoManualInput, setCostoManualInput] = useState<number | null>(null);
  const [costoManualMotivoInput, setCostoManualMotivoInput] = useState('');
  const [costoPromedioActual, setCostoPromedioActual] = useState(0);
  const dupCheckNonce = useRef(0);
  const qc = useQueryClient();
  const { esVendedor } = useRol();
  const { sucursalActual: sucursalJwt, almacenActual: almacenJwt, empresaActual } = useAuthStore();

  const tipoWatch     = Form.useWatch('tipo', form) ?? 'producto';
  const itbisWatch    = Form.useWatch('porcentajeIva', form) ?? 18;
  const nombreWatch   = Form.useWatch('nombre', form) ?? '';
  const uomWatch      = Form.useWatch('unidadMedida', form) ?? 'PZA';
  const almacenIdWatch = Form.useWatch('almacenId', form) as number | undefined;
  const esPesableWatch = Form.useWatch('esPesable', form) as boolean | undefined;
  const esServicio = tipoWatch === 'servicio';

  const { data: uomUnidades = [] } = useUomUnidadesQuery();
  const stockPrecision = (() => {
    const u = (uomUnidades as any[]).find((u: any) => u.codigo === uomWatch);
    return (u?.permiteDecimales ?? false) ? 3 : 0;
  })();

  const { data: empresaCfg } = useQuery({
    queryKey: ['configuracion-empresa-form-producto'],
    queryFn: configuracionApi.getEmpresa,
    staleTime: 5 * 60_000,
    enabled: open,
  });
  // "El de la configuración de la empresa, no 18 fijo" — mientras no haya un
  // ajuste expuesto para configurarlo, el fallback sigue siendo 18, pero ya
  // no está hardcodeado en cada formulario: sale de un único lugar.
  const itbisDefault = (empresaCfg as any)?.configuracion?.porcentajeIvaDefault ?? 18;

  const { data: sucursales = [] } = useSucursalesQuery(empresaActual);
  const { data: almacenesRaw = [] } = useQuery<any[]>({
    queryKey: ['almacenes-lista-form-producto', sucursalSeleccionada],
    queryFn: () => api.get(
      sucursalSeleccionada ? `/almacenes?sucursalId=${sucursalSeleccionada}` : '/almacenes',
    ).then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : []; }),
    staleTime: 5 * 60_000,
    enabled: open && modo === 'completo' && !esServicio,
  });
  const almacenes: { id: number; nombre: string }[] = almacenesRaw;

  const { data: ubicaciones = [] } = useQuery<any[]>({
    queryKey: ['wms-ubicaciones-form-producto', almacenIdWatch],
    queryFn: () => wmsApi.getUbicaciones(almacenIdWatch),
    staleTime: 60_000,
    enabled: open && modoAvanzado && !esServicio && !!almacenIdWatch,
  });

  const { data: proveedoresLista } = useQuery({
    queryKey: ['proveedores-form-producto'],
    queryFn: () => proveedoresApi.list(1, 500, ''),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const { data: vinculosProducto } = useQuery({
    queryKey: ['producto-proveedores-form', producto?.id],
    queryFn: () => productoProveedorApi.porProducto(producto!.id),
    enabled: open && !!producto?.id && modo === 'completo',
    staleTime: 30_000,
  });

  const { src: previewSrc } = useProductoImagen(producto?.id, preview || null);

  // Precargar el proveedor PREFERENTE al editar (solo ese — elegirlo aquí lo movería).
  useEffect(() => {
    if (!open || !producto || !vinculosProducto) return;
    const preferido = (vinculosProducto as any[]).find((v: any) => v.esPreferente);
    if (!preferido) return;
    form.setFieldsValue({ proveedorId: preferido.proveedorId, codigoProveedor: preferido.codigoProveedor ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto, vinculosProducto]);

  // Auto-seleccionar almacén único o el del JWT al crear
  useEffect(() => {
    if (!open || producto) return;
    const alreadySet = form.getFieldValue('almacenId');
    if (alreadySet) return;
    const aid = almacenJwt ? Number(almacenJwt) : undefined;
    if (almacenes.length === 1) form.setFieldValue('almacenId', almacenes[0].id);
    else if (aid && almacenes.some((a: any) => a.id === aid)) form.setFieldValue('almacenId', aid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenes, open, producto]);

  // Reset / precarga al abrir
  useEffect(() => {
    if (!open) return;
    dupCheckNonce.current++;
    setFieldErrors({});
    setModo(modoInicial);
    setModoAvanzado(false);
    if (producto) {
      const p = producto as any;
      form.setFieldsValue({
        ...p,
        codigo: p.codigo ?? '',
        nombre: p.nombre ?? '',
        codigoBarras: p.codigoBarras ?? '',
        categoriaId: p.categoriaId ?? undefined,
        descripcion: p.descripcion ?? '',
        imagenUrl: p.imagenUrl ?? '',
        proveedorId: proveedorIdInicial ?? p.proveedorId,
      });
      setPreview(p.imagenUrl ?? '');
      setPrecioInput(Number(p.precio) || 0);
      setPrecioConItbis(false);
      setPrecio2Input(p.precio2 != null ? Number(p.precio2) : null);
      setPrecio3Input(p.precio3 != null ? Number(p.precio3) : null);
      setCostoInput(p.costo != null ? Number(p.costo) : null);
      setCostoPromedioActual(Number(p.costoPromedio ?? 0));
      setSucursalSeleccionada(undefined);
      const spa = p.stockPorAlmacen as { almacenId: number; ubicacionId?: number }[] | undefined;
      const aidEdit = p.almacenId ?? almacenJwt ?? undefined;
      if (aidEdit) {
        form.setFieldValue('almacenId', Number(aidEdit));
        const spaRow = spa?.find(s => Number(s.almacenId) === Number(aidEdit));
        if (spaRow?.ubicacionId) form.setFieldValue('ubicacionId', spaRow.ubicacionId);
      }
      if (p.marca || p.modelo || p.precio2 || p.precio3 || p.imagenUrl || p.descripcion || p.esPesable || spa?.some((s: any) => s.ubicacionId)) {
        setModoAvanzado(true);
      }
    } else {
      form.resetFields();
      form.setFieldsValue({
        tipo: 'producto',
        unidadMedida: valoresInicialesExtra?.unidadMedida || 'PZA',
        porcentajeIva: valoresInicialesExtra?.porcentajeIva ?? itbisDefault,
        stock: 0, stockMinimo: 0,
        proveedorId: proveedorIdInicial, nombre: nombreInicial ?? '',
      });
      setPreview('');
      setPrecioInput(valoresInicialesExtra?.precio ?? 0);
      setPrecioConItbis(false); setPrecio2Input(null); setPrecio3Input(null); setCostoInput(null);
      const sid = sucursalJwt ? Number(sucursalJwt) : undefined;
      if (sid) setSucursalSeleccionada(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto?.id]);

  const checkDup = async (campo: CampoDup, valor: string) => {
    const val = (valor ?? '').trim();
    if (!val) return;
    const nonce = dupCheckNonce.current;
    try {
      const r = await productosApi.checkDuplicado(campo, val, producto?.id);
      if (dupCheckNonce.current !== nonce) return;
      if (!r?.disponible) {
        const msg = campo === 'codigo' ? `Ya existe un producto con el código '${val}'`
          : campo === 'nombre' ? `Ya existe un producto con el nombre '${val}'`
          : `Ya existe un producto con el código de barras '${val}'`;
        setFieldErrors(prev => ({ ...prev, [campo]: msg }));
      }
    } catch { /* sin feedback si falla el check — nunca bloquea el guardado por esto */ }
  };

  const handleApiError = (e: any, fallback: string) => {
    const msg: string = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? e?.message ?? fallback;
    if (msg.includes("código '")) setFieldErrors(prev => ({ ...prev, codigo: msg }));
    else if (msg.includes("nombre '")) setFieldErrors(prev => ({ ...prev, nombre: msg }));
    else if (msg.includes('código de barras')) setFieldErrors(prev => ({ ...prev, codigoBarras: msg }));
    else message.error(msg, 6);
  };

  const createMut = useMutation({
    mutationFn: productosApi.create,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-sel'] });
      qc.invalidateQueries({ queryKey: ['productos-select'] });
      message.success('Producto creado');
      onSuccess?.(p);
      onClose();
    },
    onError: (e: any) => handleApiError(e, 'Error al crear producto'),
  });
  const costoManualMut = useMutation({
    mutationFn: ({ id, costo, motivo }: { id: number; costo: number; motivo: string }) =>
      productosApi.ajustarCostoManual(id, { costo, motivo }),
    onSuccess: (actualizado) => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      setCostoPromedioActual(Number(actualizado.costoPromedio ?? 0));
      setModalCostoManual(false);
      setCostoManualInput(null);
      setCostoManualMotivoInput('');
      message.success('Costo fijado — se mantiene hasta que llegue la primera compra real de este producto');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al fijar el costo'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProductoPayload> }) => productosApi.update(id, body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-sel'] });
      qc.invalidateQueries({ queryKey: ['productos-select'] });
      message.success('Actualizado');
      onSuccess?.(p);
      onClose();
    },
    onError: (e: any) => handleApiError(e, 'Error al actualizar producto'),
  });

  const handleSubmit = (values: ProductoPayload) => {
    if (precioInput <= 0) { message.error('El precio es requerido'); return; }
    if (!editing && values.tipo !== 'servicio' && modo === 'completo' && (values.stock ?? 0) > 0 && !(values as any).almacenId) {
      message.error('Debes seleccionar un almacén para registrar el stock inicial');
      return;
    }
    const itbis = values.porcentajeIva ?? itbisDefault;
    const pBase = precioConItbis
      ? Math.round((Number(precioInput) / (1 + itbis / 100)) * 10000) / 10000
      : Math.round(Number(precioInput) * 100) / 100;
    const payload: ProductoPayload = {
      ...values,
      precio: pBase,
      precio2: !esVendedor && precio2Input != null && precio2Input > 0 ? precio2Input : null,
      precio3: !esVendedor && precio3Input != null && precio3Input > 0 ? precio3Input : null,
      costo: !esVendedor && costoInput != null && costoInput > 0 ? costoInput : undefined,
    };
    if (esVendedor) { delete (payload as any).costo; delete (payload as any).precio2; delete (payload as any).precio3; }
    if (!payload.codigoBarras?.trim()) delete (payload as any).codigoBarras;
    if (!payload.codigo || payload.codigo === 'undefined' || payload.codigo === 'null') {
      if (editing) (payload as any).codigo = null; else delete (payload as any).codigo;
    }
    delete (payload as any).sucursalId;
    if (values.tipo === 'servicio') {
      payload.stock = undefined; payload.stockMinimo = undefined;
      delete (payload as any).ubicacionId; delete (payload as any).marca;
      delete (payload as any).modelo; delete (payload as any).referencia;
    }
    if (marcarCreacionRapida) payload.esCreacionRapida = true;

    if (editing) updateMut.mutate({ id: producto!.id, body: payload });
    else createMut.mutate(payload);
  };

  return (
    <Modal
      title={editing ? 'Editar producto' : 'Nuevo producto'}
      open={open} onCancel={onClose} footer={null} width={width} destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        {/* Tipo + toggle Simplificado/Avanzado (solo en modo completo) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Form.Item name="tipo" label="Tipo" style={{ marginBottom: 0, flex: 1 }}>
            <Segmented options={[{ label: '📦 Producto', value: 'producto' }, { label: '⚙️ Servicio', value: 'servicio' }]} block />
          </Form.Item>
          {modo === 'completo' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 22 }}>
              <Switch size="small" checked={modoAvanzado} onChange={setModoAvanzado} />
              <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                {modoAvanzado ? 'Avanzado' : 'Simplificado'}
              </span>
            </div>
          )}
        </div>

        <Row gutter={16}>
          <Col xs={24} sm={modo === 'rapido' ? 24 : 8}>
            <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}
              validateStatus={fieldErrors.nombre ? 'error' : undefined} help={fieldErrors.nombre}
              extra={nombreWatch.length > 80 ? <span style={{ color: '#faad14', fontSize: 12 }}>Los nombres de más de 80 caracteres se acortan en los comprobantes fiscales.</span> : undefined}>
              <Input onChange={() => setFieldErrors(prev => ({ ...prev, nombre: undefined }))} onBlur={e => checkDup('nombre', e.target.value)} />
            </Form.Item>
          </Col>

          {modo === 'completo' && (
            <Col xs={24} sm={8}>
              <Form.Item name="codigo" label="Código" validateStatus={fieldErrors.codigo ? 'error' : undefined} help={fieldErrors.codigo}>
                <Input placeholder="Se generará automáticamente" onChange={() => setFieldErrors(prev => ({ ...prev, codigo: undefined }))} onBlur={e => checkDup('codigo', e.target.value)} />
              </Form.Item>
            </Col>
          )}

          <Col xs={24} sm={modo === 'rapido' ? 12 : 8}>
            <Form.Item name="codigoBarras" label="Código de barras" validateStatus={fieldErrors.codigoBarras ? 'error' : undefined} help={fieldErrors.codigoBarras}>
              <Input placeholder="Escanear o escribir" onChange={() => setFieldErrors(prev => ({ ...prev, codigoBarras: undefined }))} onBlur={e => checkDup('codigoBarras', e.target.value)} />
            </Form.Item>
          </Col>

          <Col xs={24} sm={modo === 'rapido' ? 12 : 8}>
            {(() => {
              const pBase = precioConItbis ? Math.round((Number(precioInput) / (1 + itbisWatch / 100)) * 10000) / 10000 : Number(precioInput);
              const mItbis = Math.round((pBase * (itbisWatch / 100)) * 100) / 100;
              const pFinal = Math.round((pBase + mItbis) * 100) / 100;
              return (
                <Form.Item
                  label={<span>Precio (RD$) <Tooltip title="Si tu proveedor te da el precio con ITBIS incluido, activa 'Con ITBIS' y el sistema calcula el precio base. Siempre se guarda y factura el precio SIN ITBIS."><QuestionCircleOutlined style={{ color: '#9CA3AF', marginLeft: 4 }} /></Tooltip></span>}
                  required
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber style={{ width: 'calc(100% - 110px)' }} value={precioInput || undefined} onChange={v => setPrecioInput(Number(v) || 0)}
                      formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => (v ?? '').replace(/,/g, '') as any}
                      min={0} precision={2} placeholder="0.00" />
                    <Button type={precioConItbis ? 'primary' : 'default'} onClick={() => setPrecioConItbis(p => !p)} style={{ width: 110 }}>
                      {precioConItbis ? '✓ Con ITBIS' : 'Sin ITBIS'}
                    </Button>
                  </Space.Compact>
                  {precioInput > 0 && itbisWatch > 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                      {precioConItbis
                        ? `Base sin ITBIS: RD$${pBase.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
                        : `Precio final al cliente: RD$${pFinal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}
                    </div>
                  )}
                </Form.Item>
              );
            })()}
          </Col>

          {modo === 'completo' && modoAvanzado && (
            <Col xs={24} sm={8}>
              <Form.Item label={<span>Precio 2 <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(Mayorista — opcional)</span></span>}>
                <InputNumber style={{ width: '100%' }} value={precio2Input ?? undefined} onChange={v => setPrecio2Input(v != null ? Number(v) : null)}
                  formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => (v ?? '').replace(/,/g, '') as any}
                  min={0} precision={2} placeholder="Opcional" prefix="RD$" />
              </Form.Item>
            </Col>
          )}
          {modo === 'completo' && modoAvanzado && (
            <Col xs={24} sm={8}>
              <Form.Item label={<span>Precio 3 <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(Especial — opcional)</span></span>}>
                <InputNumber style={{ width: '100%' }} value={precio3Input ?? undefined} onChange={v => setPrecio3Input(v != null ? Number(v) : null)}
                  formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => (v ?? '').replace(/,/g, '') as any}
                  min={0} precision={2} placeholder="Opcional" prefix="RD$" />
              </Form.Item>
            </Col>
          )}

          {!esVendedor && (
            <Col xs={24} sm={modo === 'rapido' ? 12 : 8}>
              <Form.Item label={<span>Costo <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(Precio de compra — opcional)</span></span>}>
                <InputNumber style={{ width: '100%' }} value={costoInput ?? undefined} onChange={v => setCostoInput(v != null ? Number(v) : null)}
                  formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => (v ?? '').replace(/,/g, '') as any}
                  min={0} precision={2} placeholder="Opcional" prefix="RD$" />
              </Form.Item>
            </Col>
          )}

          {!esVendedor && editing && modo === 'completo' && !esServicio && (
            <Col xs={24} sm={8}>
              <Form.Item label={<span>Costo promedio <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 11 }}>(AVCO — se actualiza al recibir compras)</span></span>}>
                <Space align="center">
                  <Text strong={!costoPromedioActual} style={{ color: costoPromedioActual ? undefined : '#ff4d4f' }}>
                    RD${costoPromedioActual.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </Text>
                  <Button size="small" type={costoPromedioActual ? 'default' : 'primary'} danger={!costoPromedioActual}
                    onClick={() => { setCostoManualInput(null); setCostoManualMotivoInput(''); setModalCostoManual(true); }}>
                    Fijar costo
                  </Button>
                </Space>
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={modo === 'rapido' ? 12 : 8}>
            <Form.Item name="porcentajeIva" label="ITBIS %">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={modo === 'rapido' ? 12 : 8}>
            <Form.Item name="unidadMedida" label="Unidad de Medida">
              <UomSelect />
            </Form.Item>
          </Col>

          {modo === 'completo' && !esServicio && (
            <Col xs={24} sm={8}>
              <Form.Item name="stock" label={editing ? 'Stock actual' : 'Stock inicial'} help={editing ? 'El stock se ajusta mediante movimientos de inventario' : undefined}>
                <InputNumber style={{ width: '100%' }} min={0} precision={stockPrecision} disabled={!!editing} />
              </Form.Item>
            </Col>
          )}
          {modo === 'completo' && !esServicio && (
            <Col xs={24} sm={8}>
              <Form.Item name="stockMinimo" label="Stock mínimo">
                <InputNumber style={{ width: '100%' }} min={0} precision={stockPrecision} />
              </Form.Item>
            </Col>
          )}

          <Col xs={24} sm={modo === 'rapido' ? 24 : 8}>
            <Form.Item name="categoriaId" label="Categoría">
              <CategoriaSelect style={{ width: '100%' }} />
            </Form.Item>
          </Col>

          {modo === 'completo' && (
            <Col xs={24} sm={8}>
              <Form.Item name="referencia" label="Referencia" tooltip="Tu referencia interna. El código del proveedor va en su propio campo, más abajo.">
                <Input placeholder="Referencia interna del negocio" maxLength={100} />
              </Form.Item>
            </Col>
          )}

          {modo === 'completo' && (
            <Col xs={24} sm={8}>
              <Form.Item name="proveedorId" label="Proveedor principal" tooltip="Opcional. Elegirlo aquí lo marca como preferente. Vaciarlo no desvincula nada.">
                <Select showSearch allowClear optionFilterProp="label" placeholder="Sin proveedor" disabled={!!proveedorIdInicial}
                  options={(proveedoresLista?.data ?? []).map((p: any) => ({ value: p.id, label: p.nombre }))} />
              </Form.Item>
            </Col>
          )}
          {modo === 'completo' && (
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.proveedorId !== cur.proveedorId}>
              {({ getFieldValue }) => getFieldValue('proveedorId') ? (
                <Col xs={24} sm={8}>
                  <Form.Item name="codigoProveedor" label="Código del proveedor" tooltip="El código con el que ESE proveedor identifica el artículo.">
                    <Input placeholder="Ej: FC-4471-B" maxLength={100} />
                  </Form.Item>
                </Col>
              ) : null}
            </Form.Item>
          )}

          {modo === 'completo' && modoAvanzado && !esServicio && sucursales.length > 1 && (
            <Col xs={24} sm={8}>
              <Form.Item name="sucursalId" label="Sucursal">
                <Select placeholder="Seleccionar sucursal" allowClear options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))}
                  onChange={(val) => { form.setFieldValue('almacenId', undefined); setSucursalSeleccionada(val ?? undefined); }} />
              </Form.Item>
            </Col>
          )}

          {modo === 'completo' && !esServicio && (
            <Col xs={24} sm={almacenes.length === 0 ? 24 : 16}>
              {almacenes.length === 0 ? (
                <Form.Item label="Almacén"><Text type="secondary" style={{ fontSize: 12 }}>No hay almacenes configurados.</Text></Form.Item>
              ) : (
                <Form.Item name="almacenId" label="Almacén" extra={almacenes.length === 1 ? undefined : 'Almacén donde se registrará el stock inicial'}>
                  <Select
                    placeholder={sucursales.length > 1 && !sucursalSeleccionada ? 'Primero selecciona una sucursal' : 'Seleccionar almacén'}
                    disabled={sucursales.length > 1 && !sucursalSeleccionada}
                    allowClear={almacenes.length > 1}
                    options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
                    onChange={() => form.setFieldValue('ubicacionId', undefined)}
                  />
                </Form.Item>
              )}
            </Col>
          )}

          {modo === 'completo' && modoAvanzado && !esServicio && (
            <>
              <Col xs={24} sm={8}><Form.Item name="marca" label="Marca"><Input placeholder="Ej: Samsung, Nestlé..." maxLength={100} /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="modelo" label="Modelo"><Input placeholder="Ej: Galaxy S24, A31..." maxLength={100} /></Form.Item></Col>
              {!!almacenIdWatch && ubicaciones.length > 0 && (
                <Col xs={24} sm={8}>
                  <Form.Item name="ubicacionId" label="Ubicación WMS" extra="Ubicación por defecto para picking">
                    <Select placeholder="Sin ubicación específica" allowClear options={ubicaciones.map((u: any) => ({ value: u.id, label: `${u.codigo}${u.tipo ? ` (${u.tipo})` : ''}` }))} />
                  </Form.Item>
                </Col>
              )}
            </>
          )}

          {modo === 'completo' && modoAvanzado && !esServicio && (
            <>
              <Col xs={24} sm={8}>
                <Form.Item name="esPesable" label="Balanza etiquetadora" valuePropName="checked">
                  <Switch checkedChildren="Pesable" unCheckedChildren="Normal" />
                </Form.Item>
              </Col>
              {esPesableWatch && (
                <Col xs={24} sm={8}>
                  <Form.Item name="plu" label="Número PLU" extra="Código numérico asignado en la balanza" rules={[{ type: 'number', min: 1, message: 'El PLU debe ser mayor que 0' }]}>
                    <InputNumber style={{ width: '100%' }} min={1} max={99999} precision={0} placeholder="Ej: 42" />
                  </Form.Item>
                </Col>
              )}
            </>
          )}

          {modo === 'completo' && modoAvanzado && (
            <Col span={24}>
              <Form.Item name="imagenUrl" label="Imagen del producto">
                <Input prefix={<LinkOutlined />} placeholder="https://... o sube desde tu dispositivo ↓" onChange={e => setPreview(e.target.value)} allowClear onClear={() => setPreview('')} />
              </Form.Item>
              <div style={{ marginTop: -10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Upload accept="image/*" showUploadList={false} beforeUpload={async (file) => {
                  if (!file.type.startsWith('image/')) { message.error('Solo se permiten imágenes'); return false; }
                  if (file.size > 10 * 1024 * 1024) { message.error('La imagen no puede superar 10 MB'); return false; }
                  setUploading(true);
                  try {
                    const base64 = await resizeToBase64(file);
                    form.setFieldValue('imagenUrl', base64);
                    setPreview(base64);
                    message.success('Imagen cargada y optimizada');
                  } catch { message.error('No se pudo procesar la imagen'); }
                  finally { setUploading(false); }
                  return false;
                }}>
                  <Button icon={<UploadOutlined />} loading={uploading} type="dashed" style={{ minWidth: 160 }}>
                    {uploading ? 'Procesando...' : 'Subir desde dispositivo'}
                  </Button>
                </Upload>
                {(previewSrc || preview) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={previewSrc ?? preview} alt="preview" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} onError={() => setPreview('')} />
                    <Button type="link" danger size="small" style={{ padding: 0 }} onClick={() => { form.setFieldValue('imagenUrl', ''); setPreview(''); }}>Eliminar imagen</Button>
                  </div>
                )}
              </div>
            </Col>
          )}

          {modo === 'completo' && modoAvanzado && (
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          )}
        </Row>

        <Row justify="space-between" align="middle" gutter={8}>
          <Col>
            {modo === 'rapido' && (
              <a onClick={() => setModo('completo')} style={{ cursor: 'pointer', fontSize: 13 }}>Más campos →</a>
            )}
          </Col>
          <Col>
            <Space>
              <Button onClick={onClose}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Actualizar' : 'Crear'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>

      {!esVendedor && editing && (
        <Modal
          title={`Fijar costo — ${producto?.nombre ?? ''}`}
          open={modalCostoManual}
          onCancel={() => setModalCostoManual(false)}
          onOk={() => {
            if (costoManualInput == null || costoManualInput <= 0) { message.warning('Escribe un costo mayor que cero'); return; }
            if (!costoManualMotivoInput.trim()) { message.warning('El motivo es obligatorio'); return; }
            costoManualMut.mutate({ id: producto!.id, costo: costoManualInput, motivo: costoManualMotivoInput.trim() });
          }}
          confirmLoading={costoManualMut.isPending}
          okText="Fijar costo"
          destroyOnClose
        >
          <Alert
            type="warning" showIcon style={{ marginBottom: 16 }}
            message="Es un punto de partida, no un dato permanente"
            description="En cuanto este producto reciba su primera compra real, el costo promedio (AVCO) se reemplaza automáticamente con el costo de esa compra — este valor no queda mezclado."
          />
          <Form layout="vertical">
            <Form.Item label="Costo" required>
              <InputNumber style={{ width: '100%' }} value={costoManualInput ?? undefined} onChange={v => setCostoManualInput(v != null ? Number(v) : null)}
                min={0.0001} precision={4} prefix="RD$" autoFocus placeholder="Costo unitario" />
            </Form.Item>
            <Form.Item label="Motivo" required>
              <Input.TextArea rows={3} value={costoManualMotivoInput} onChange={e => setCostoManualMotivoInput(e.target.value)}
                placeholder="Ej: Producto de import masivo, sin compra registrada en el sistema — costo tomado de la factura del proveedor" maxLength={2000} />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </Modal>
  );
}
