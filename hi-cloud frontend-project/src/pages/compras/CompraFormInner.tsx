import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Row, Col, Select, DatePicker, Table,
         InputNumber, Space, Divider, message, Tag, Alert, Checkbox, theme, Tooltip, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSucursalesQuery } from '../../hooks/useCatalogQueries';
import { useDebounce } from '../../hooks/useDebounce';
import { comprasApi, type CompraDetallePayload } from '../../api/compras.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import dayjs from 'dayjs';

interface Linea {
  key: string;
  productoId?: number;
  descripcion?: string;
  cantidad: number;
  cantidadBonificada: number;
  precioUnitario: number;
  porcentajeItbis: number;
  /** Descuento por línea — se persiste el monto; el % es solo ayuda de captura. */
  descuentoPct: number;
  descuentoMonto: number;
  permiteDecimales?: boolean;
  precioIncluyeItbis?: boolean;
}

const fmtMon = (v: number, moneda = 'DOP') => {
  const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'RD$';
  return `${sym} ${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Suma de los anchos de las columnas de ítems. Es el ancho por debajo del cual
 * la tabla sí tiene que scrollear.
 *
 * Se declara aquí y no suelto en el JSX para que quien toque un `width` de la
 * tabla vea que hay un número que actualizar — y porque el día que entren las
 * columnas de descuento (Bruto, Desc, Neto) este número sube.
 */
const ANCHO_MINIMO_ITEMS = 300 + 96 + 74 + 68 + 86 + 84 + 126 + 88 + 96 + 44;

/**
 * Form.Item de la cabecera: el margen inferior por defecto de antd son 24px,
 * que multiplicados por los campos de la fila eran la mitad del alto que se
 * comía la cabecera. 8px separan lo justo.
 */
const ITEM_COMPACTO = { marginBottom: 8 } as const;

/** Un importe del pie: etiqueta arriba, valor debajo. */
function Dato({ etiqueta, valor, color, grande }: {
  etiqueta: string; valor: string; color?: string; grande?: boolean;
}) {
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{etiqueta}</div>
      <div style={{
        fontSize: grande ? 20 : 14,
        fontWeight: grande ? 700 : 600,
        color, whiteSpace: 'nowrap',
      }}>{valor}</div>
    </div>
  );
}

interface Props {
  onSuccess?: (orden: any) => void;
  onCancel?: () => void;
  /** Presente = modo edición. Solo borradores; el backend lo vuelve a exigir. */
  compraId?: number;
  /**
   * El formulario ocupa todo el alto que le den, con la cabecera y el pie
   * fijos y solo la lista de ítems desplazándose.
   *
   * Lo usa el modal del POS. La pantalla de Compras no lo pasa: allí la página
   * scrollea entera, que es lo natural en un documento a pantalla completa.
   */
  altoCompleto?: boolean;
}

export default function CompraFormInner({ onSuccess, onCancel, compraId, altoCompleto = false }: Props) {
  const esEdicion = compraId != null;
  const [form] = Form.useForm();
  const { token } = theme.useToken();
  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);
  const qc = useQueryClient();

  const [lineas, setLineas] = useState<Linea[]>([{ key: '1', cantidad: 1, cantidadBonificada: 0, precioUnitario: 0, porcentajeItbis: 18, descuentoPct: 0, descuentoMonto: 0 }]);
  const [tipoPago, setTipoPago]         = useState<'contado' | 'credito'>('contado');
  const [diasCredito, setDiasCredito]   = useState(30);
  const [moneda, setMoneda]             = useState<'DOP' | 'USD' | 'EUR'>('DOP');
  const [tipoCambio, setTipoCambio]     = useState<number>(1);
  const [proveedorSelId, setProveedorSelId] = useState<number | null>(null);
  const [retieneItbis, setRetieneItbis] = useState(false);
  const [pctItbis, setPctItbis]         = useState(30);
  const [retieneIsr, setRetieneIsr]     = useState(false);
  const [pctIsr, setPctIsr]             = useState(10);

  const defaultAlmacenId = (() => { try { const v = localStorage.getItem('almacenId'); return v ? Number(v) : undefined; } catch { return undefined; } })();
  const [almacenId, setAlmacenId] = useState<number | undefined>(defaultAlmacenId);

  const [productoSearch, setProductoSearch] = useState('');
  // Guarda label del producto seleccionado por row para mostrarlo aunque no esté en los resultados de búsqueda
  const [selectedProds, setSelectedProds] = useState<Map<number, string>>(new Map());

  // ── Crear producto rápido desde la OC ──────────────────────────────
  const [showCrearProd,      setShowCrearProd]      = useState(false);
  const [crearProdLineasIdx, setCrearProdLineasIdx]  = useState(0);
  const [crearProdForm] = Form.useForm();

  const { data: proveedores } = useQuery({ queryKey: ['proveedores-sel'], queryFn: () => proveedoresApi.list(1, 200) });
  // Debounced: sin esto, cada tecla dispara un fetch nuevo y cambia las
  // `options` del Select a mitad de un clic — el usuario ve el producto,
  // hace clic, y ese clic cae sobre una lista que ya se reordenó/reemplazó
  // debajo del cursor. Mismo patrón que ya usa el buscador de compras del POS
  // (useDebounce(busq, 300) en POSComprasPanel) — aquí faltaba.
  const productoSearchD = useDebounce(productoSearch, 300);
  const { data: productosBusqueda, isFetching: buscandoProd } = useQuery({
    queryKey: ['productos-compra-search', productoSearchD],
    queryFn:  () => api.get(`/productos?page=1&limit=50&search=${encodeURIComponent(productoSearchD)}&incluirSinStock=true`).then(r => r.data?.data ?? r.data),
    enabled:  productoSearchD.length >= 2,
    staleTime: 30_000,
  });
  const { data: almacenes = [] } = useQuery<any[]>({
    queryKey: ['almacenes-sel'],
    queryFn:  () => api.get('/almacenes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: sucursales = [] } = useSucursalesQuery(empresaActual);

  const proveedorSel = (proveedores?.data ?? []).find((p: any) => p.id === proveedorSelId);
  const esInformal   = proveedorSel
    ? (!proveedorSel.rnc || proveedorSel.rnc === '000000000' || (proveedorSel as any).esInformal === true)
    : false;

  useEffect(() => {
    if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual]);

  const createMut = useMutation({
    mutationFn: (body: any) => esEdicion
      ? comprasApi.update(compraId!, body)
      : comprasApi.create(body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      if (esEdicion) qc.invalidateQueries({ queryKey: ['compra', compraId] });
      onSuccess?.(data?.data ?? data);
    },
    onError: (e: any) => message.error(
      (e as any)?.friendlyMessage ?? e?.response?.data?.message ?? e?.response?.data?.errors?.[0]
        ?? `Error al ${esEdicion ? 'guardar' : 'crear'} la compra`,
      8,
    ),
  });

  /**
   * Modo edición: traer el borrador y volcarlo en el formulario.
   *
   * `almacenId` se toma del que tiene guardado la compra, no del localStorage:
   * el borrador pudo hacerse para otro almacén y no puede cambiar de sitio solo
   * porque lo abra alguien situado en otro.
   */
  const { data: compraEdit, isLoading: cargandoCompra } = useQuery({
    queryKey: ['compra', compraId],
    queryFn:  () => comprasApi.getOne(compraId!),
    enabled:  esEdicion,
  });

  useEffect(() => {
    if (!compraEdit) return;
    const c = compraEdit as any;
    form.setFieldsValue({
      proveedorId:            c.proveedorId,
      fecha:                  dayjs(c.fecha),
      numeroFacturaProveedor: c.numeroFacturaProveedor,
      notas:                  c.notas,
      sucursalId:             c.sucursalId,
    });
    setProveedorSelId(c.proveedorId ?? null);
    setTipoPago(c.tipoPago === 'credito' ? 'credito' : 'contado');
    setDiasCredito(Number(c.diasCredito ?? 30));
    setMoneda((c.moneda ?? 'DOP') as 'DOP' | 'USD' | 'EUR');
    setTipoCambio(Number(c.tipoCambio ?? 1));
    setAlmacenId(c.almacenId ?? undefined);
    setRetieneItbis(!!c.retieneItbis);
    setPctItbis(Number(c.porcentajeRetencionItbis ?? 30));
    setRetieneIsr(!!c.retieneIsr);
    setPctIsr(Number(c.porcentajeRetencionIsr ?? 10));

    const dets = (c.detalles ?? []) as any[];
    if (dets.length) {
      setLineas(dets.map((d, i) => ({
        key:                String(i + 1),
        productoId:         d.productoId,
        descripcion:        d.descripcion,
        cantidad:           Number(d.cantidad),
        cantidadBonificada: Number(d.cantidadBonificada ?? 0),
        precioUnitario:     Number(d.precioUnitario),
        porcentajeItbis:    Number(d.porcentajeItbis ?? 18),
        descuentoPct:       Number(d.descuentoPct ?? 0),
        descuentoMonto:     Number(d.descuentoMonto ?? 0),
      })));
      // Sin esto el Select de cada línea sale vacío: los productos del borrador
      // no están en los resultados de la búsqueda, que arranca sin texto.
      setSelectedProds(new Map(dets.map(d => [
        d.productoId,
        d.producto?.codigo ? `${d.producto.codigo} — ${d.producto.nombre}` : (d.descripcion ?? ''),
      ])));
    }
  }, [compraEdit, form]);

  const crearProdMut = useMutation({
    mutationFn: (body: any) => api.post('/productos', body).then((r: any) => r.data?.data ?? r.data),
    onSuccess: (prod: any, variables: any) => {
      // Precio de la línea: costo de compra ingresado, o precio de venta como fallback
      const precioLinea = Number(variables.costo) > 0 ? Number(variables.costo) : Number(prod.precio ?? 0);
      const updated = [...lineas];
      updated[crearProdLineasIdx] = {
        ...updated[crearProdLineasIdx],
        productoId:         prod.id,
        descripcion:        prod.nombre,
        precioUnitario:     precioLinea,
        porcentajeItbis:    18,
        permiteDecimales:   false,
        cantidadBonificada: updated[crearProdLineasIdx].cantidadBonificada ?? 0,
      };
      setLineas(updated);
      const label = prod.codigo ? `${prod.codigo} — ${prod.nombre}` : prod.nombre;
      setSelectedProds(prev => new Map(prev).set(prod.id, label));
      qc.invalidateQueries({ queryKey: ['productos-compra-search'] });
      setShowCrearProd(false);
      crearProdForm.resetFields();
      message.success(`Producto "${prod.nombre}" creado y agregado a la línea`);
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? e?.response?.data?.message ?? 'Error al crear producto'),
  });

  // Preview en el frontend — el backend recalcula esto mismo, línea por
  // línea con su propia tasa, al guardar (calcularDetalles en
  // compras.service.ts). subtotal ya es NETO de descuento (base gravable);
  // subtotalBruto se reconstruye para el pie: Subtotal → Descuento → ITBIS.
  const descuentoTotal = lineas.reduce((s, l) => s + (l.descuentoMonto || 0), 0);
  const subtotal = lineas.reduce((s, l) => s + (l.precioUnitario * l.cantidad - (l.descuentoMonto || 0)), 0);
  const itbis    = lineas.reduce((s, l) => s + (l.precioUnitario * l.cantidad - (l.descuentoMonto || 0)) * (l.porcentajeItbis / 100), 0);
  const total    = subtotal + itbis;
  const subtotalBruto = subtotal + descuentoTotal;

  const montoRetItbis = (esInformal && retieneItbis) ? Number((itbis   * pctItbis / 100).toFixed(2)) : 0;
  const montoRetIsr   = (esInformal && retieneIsr)   ? Number((subtotal * pctIsr   / 100).toFixed(2)) : 0;
  const netoPagar     = Number((total - montoRetItbis - montoRetIsr).toFixed(2));

  const productosBusquedaData = productosBusqueda?.data ?? (Array.isArray(productosBusqueda) ? productosBusqueda : []);

  const onProductoChange = (productoId: number, idx: number) => {
    const prod = productosBusquedaData.find((p: any) => p.id === productoId);
    if (!prod) return;
    const label = prod.codigo ? `${prod.codigo} — ${prod.nombre}` : prod.nombre;
    setSelectedProds(prev => new Map(prev).set(productoId, label));
    const updated = [...lineas];
    updated[idx] = { ...updated[idx], productoId, descripcion: prod.nombre, precioUnitario: Number(prod.precio), porcentajeItbis: 18, permiteDecimales: prod.permiteDecimales ?? false, cantidadBonificada: updated[idx].cantidadBonificada ?? 0 };
    setLineas(updated);
  };

  const fechaVencimientoCalc = (() => {
    const fechaVal = form.getFieldValue('fecha') as dayjs.Dayjs | undefined;
    if (tipoPago !== 'credito' || !fechaVal) return null;
    return fechaVal.add(diasCredito, 'day');
  })();

  const handleMonedaChange = async (m: 'DOP' | 'USD' | 'EUR') => {
    setMoneda(m);
    if (m !== 'DOP') {
      try {
        const eid = localStorage.getItem('empresaId') ?? '';
        const res = await fetch(`/api/v1/divisas/tasa-publica/${m}`, { credentials: 'include', headers: { 'X-Empresa-ID': eid } });
        const data = await res.json();
        const tasa = data?.data?.tasaVenta ?? data?.tasaVenta;
        if (tasa) setTipoCambio(Number(tasa));
      } catch { /* mantiene tipoCambio actual */ }
    } else {
      setTipoCambio(1);
    }
  };

  const handleSubmit = (values: { proveedorId: number; fecha: dayjs.Dayjs; numeroFacturaProveedor?: string; notas?: string }) => {
    // Rechazar líneas sin producto
    if (lineas.some(l => !l.productoId)) {
      message.error('Selecciona un producto en cada línea o elimina las líneas vacías.');
      return;
    }
    // Rechazar líneas completamente vacías (precio 0 + sin unidades)
    if (lineas.some(l => l.precioUnitario === 0 && (l.cantidad ?? 0) <= 0 && (l.cantidadBonificada ?? 0) <= 0)) {
      message.error('Hay líneas con precio 0 y sin cantidad. Ingresa las unidades recibidas o elimina la línea.');
      return;
    }

    const detalles: CompraDetallePayload[] = lineas.map(l => ({
      productoId: l.productoId!, descripcion: l.descripcion,
      cantidad: l.cantidad, cantidadBonificada: l.cantidadBonificada || undefined,
      precioUnitario: l.precioUnitario, porcentajeItbis: l.porcentajeItbis,
      // Lo que decide el cálculo en el backend es SIEMPRE el monto — se manda
      // aunque sea 0 (a diferencia de cantidadBonificada) para que una línea
      // editada a "sin descuento" limpie lo que tenía antes.
      descuentoMonto: l.descuentoMonto || 0,
    }));
    createMut.mutate({
      proveedorId: values.proveedorId,
      fecha: values.fecha.format('YYYY-MM-DD'),
      detalles,
      notas: values.notas,
      numeroFacturaProveedor: values.numeroFacturaProveedor,
      tipoPago,
      diasCredito: tipoPago === 'credito' ? diasCredito : undefined,
      moneda,
      tipoCambio: moneda !== 'DOP' ? tipoCambio : undefined,
      almacenId: almacenId ?? undefined,
      sucursalId: (values as any).sucursalId ?? sucursalActual,
      ...(esInformal && retieneItbis ? { retieneItbis: true, porcentajeRetencionItbis: pctItbis } : {}),
      ...(esInformal && retieneIsr   ? { retieneIsr:   true, porcentajeRetencionIsr:   pctIsr   } : {}),
    } as any);
  };

  const lineaCols = [
    // `width` explícito, como el resto. La tabla va con `tableLayout="fixed"`:
    // las columnas con ancho fijo se reparten primero y esta, que era la única
    // sin declararlo, se quedaba con lo que sobrara. Al añadir la columna
    // «Desc.» (126px) dejó de sobrar nada dentro del modal de 960px del POS y
    // el buscador de producto se colapsó a cero: se escribía y no aparecía
    // nada, ni los productos ni el enlace de creación rápida, porque el Select
    // no tenía dónde dibujarse.
    { title: 'Producto', key: 'prod', width: 300,
      render: (_: unknown, _r: Linea, idx: number) => {
        const busquedaOpts = productosBusquedaData.map((p: any) => ({
          value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre,
        }));
        // Incluir el producto ya seleccionado en esta fila aunque no esté en los resultados
        const opts = (() => {
          const pid = _r.productoId;
          if (!pid || busquedaOpts.some((o: any) => o.value === pid)) return busquedaOpts;
          const saved = selectedProds.get(pid);
          return saved ? [{ value: pid, label: saved }, ...busquedaOpts] : busquedaOpts;
        })();
        // El nombre completo del producto seleccionado, para el tooltip: en la
        // celda se trunca con ellipsis —un código de barras más el nombre no
        // cabe en ninguna columna razonable— y el usuario necesita poder
        // confirmarlo sin abrir el desplegable.
        const etiquetaSel = opts.find((o: any) => o.value === _r.productoId)?.label as string | undefined;
        return (
          <Tooltip title={etiquetaSel} mouseEnterDelay={0.6} placement="topLeft">
          <Select style={{ width: '100%' }} showSearch placeholder="Escribe para buscar..."
            filterOption={false}
            onSearch={(v) => { setProductoSearch(v); }}
            loading={buscandoProd}
            notFoundContent={productoSearch.length < 2 ? 'Escribe al menos 2 letras' : 'Sin resultados'}
            options={opts}
            value={_r.productoId}
            popupMatchSelectWidth={false}
            // `styles.popup.root` y `popupRender`: `dropdownStyle` y
            // `dropdownRender` están deprecados en antd 5.29 y avisan en consola
            // en cada render de la tabla.
            styles={{ popup: { root: { minWidth: 380 } } }}
            onChange={(v) => onProductoChange(v, idx)}
            popupRender={(menu) => (
              <>
                {menu}
                {productoSearch.length >= 2 && (
                  <>
                    <Divider style={{ margin: '4px 0' }} />
                    <Button
                      type="link"
                      icon={<PlusOutlined />}
                      style={{ width: '100%', textAlign: 'left', paddingLeft: 12 }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setCrearProdLineasIdx(idx);
                        crearProdForm.setFieldsValue({ nombre: productoSearch });
                        setShowCrearProd(true);
                      }}
                    >
                      Crear &ldquo;{productoSearch}&rdquo; como nuevo producto
                    </Button>
                  </>
                )}
              </>
            )}
          />
          </Tooltip>
        );
      }},
    { title: 'Descripción', key: 'desc', width: 96,
      render: (_: unknown, r: Linea, idx: number) => (
        // `title` nativo y no <Tooltip>: es un campo que se teclea y un tooltip
        // de antd encima estorba al escribir. El navegador lo muestra al posar
        // el ratón y desaparece en cuanto se enfoca.
        <Input value={r.descripcion} style={{ overflow: 'hidden' }} title={r.descripcion}
          onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
      )},
    { title: 'Cantidad', key: 'qty', width: 74,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber
          controls={false}
          min={0.0001}
          value={r.cantidad}
          style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].cantidad=v??0.001; setLineas(u); }} />
      )},
    { title: 'Bonif.', key: 'bon', width: 68,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber
          controls={false}
          min={0}
          value={r.cantidadBonificada}
          style={{ width:'100%' }}
          placeholder="0"
          onChange={v => { const u=[...lineas]; u[idx].cantidadBonificada=v??0; setLineas(u); }} />
      )},
    { title: 'Inv. / Costo', key: 'inv', width: 86,
      render: (_: unknown, r: Linea) => {
        const tot = r.cantidad + r.cantidadBonificada;
        const costo = tot > 0 ? r.precioUnitario * r.cantidad / tot : r.precioUnitario;
        return (
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            <div style={{ color: token.colorText }}>
              {tot.toLocaleString('es-DO', { maximumFractionDigits: 4 })} u
            </div>
            <div style={{ color: token.colorTextSecondary }}>
              {fmtMon(costo, moneda)}/u
            </div>
          </div>
        );
      }},
    { title: 'Precio', key: 'price', width: 84,
      render: (_: unknown, r: Linea, idx: number) => {
        const pct = r.porcentajeItbis || 0;
        const displayVal = r.precioIncluyeItbis
          ? parseFloat((r.precioUnitario * (1 + pct / 100)).toFixed(2))
          : r.precioUnitario;
        return (
          <InputNumber
            controls={false}
            min={0}
            precision={2}
            value={displayVal}
            style={{ width: '100%' }}
            onChange={v => {
              const u = [...lineas];
              u[idx].precioUnitario = r.precioIncluyeItbis
                ? parseFloat(((v ?? 0) / (1 + pct / 100)).toFixed(6))
                : (v ?? 0);
              setLineas(u);
            }}
          />
        );
      }},
    { title: 'Desc.', key: 'descuento', width: 126,
      render: (_: unknown, r: Linea, idx: number) => {
        // % y monto enlazados: el usuario teclea uno, el otro se calcula solo.
        // Lo que persiste (y decide el cálculo, incluido en el backend) es
        // siempre descuentoMonto — el % es solo ayuda de captura.
        const bruto = r.precioUnitario * r.cantidad;
        const actualizar = (pct: number, monto: number) => {
          const u = [...lineas];
          u[idx] = { ...u[idx], descuentoPct: pct, descuentoMonto: monto };
          setLineas(u);
        };
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <Tooltip title="Descuento en %">
              <InputNumber controls={false} min={0} max={100} precision={2}
                value={r.descuentoPct} style={{ width: 54 }}
                onChange={v => {
                  const pct = v ?? 0;
                  actualizar(pct, Number((bruto * (pct / 100)).toFixed(4)));
                }} />
            </Tooltip>
            <Tooltip title={`Descuento en ${moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'RD$'}`}>
              <InputNumber controls={false} min={0} max={bruto} precision={2}
                value={r.descuentoMonto} style={{ width: 64 }}
                onChange={v => {
                  const monto = Math.min(v ?? 0, bruto);
                  actualizar(bruto > 0 ? Number(((monto / bruto) * 100).toFixed(2)) : 0, monto);
                }} />
            </Tooltip>
          </div>
        );
      }},
    { title: 'ITBIS %', key: 'itbis', width: 88,
      render: (_: unknown, r: Linea, idx: number) => (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <InputNumber controls={false} min={0} max={100} value={r.porcentajeItbis}
            style={{ flex: 1, minWidth: 0 }}
            onChange={v => { const u=[...lineas]; u[idx].porcentajeItbis=v??18; setLineas(u); }} />
          <Tooltip title={r.precioIncluyeItbis ? 'Precio ingresado CON ITBIS — click para cambiar a sin ITBIS' : 'Precio ingresado SIN ITBIS — click para cambiar a con ITBIS'}>
            <Tag
              color={r.precioIncluyeItbis ? 'blue' : 'default'}
              style={{ fontSize: 10, padding: '0 4px', lineHeight: '20px', cursor: 'pointer', userSelect: 'none', flexShrink: 0, margin: 0 }}
              onClick={() => { const u=[...lineas]; u[idx].precioIncluyeItbis=!r.precioIncluyeItbis; setLineas(u); }}
            >
              {r.precioIncluyeItbis ? 'c/' : 's/'}
            </Tag>
          </Tooltip>
        </div>
      )},
    { title: 'Subtotal', key: 'sub', width: 96,
      // NETO de descuento — la base gravable de la línea, no el bruto.
      render: (_: unknown, r: Linea) => fmtMon(r.precioUnitario * r.cantidad - (r.descuentoMonto || 0), moneda) },
    { title: '', key: 'del', width: 44,
      render: (_: unknown, _r: Linea, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      )},
  ];

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ fecha: dayjs() }}
      // En modo alto completo el formulario es una columna flex: cabecera y pie
      // no se encogen y la lista de ítems se queda con el resto. `minHeight: 0`
      // no es opcional — sin él un hijo flex no baja de su alto de contenido y
      // el scroll se lo come el modal entero en vez de la lista.
      style={altoCompleto
        ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }
        : undefined}>
      {/* Cabecera en UNA fila.
          Antes eran dos filas de Cols con span fijo más un Alert de bloque:
          unos 280px para siete campos y una línea de texto, con la tabla de
          ítems —que es donde se trabaja— arrinconada debajo.
          `Col flex="crecer encoger base"` deja que la fila envuelva sola cuando
          no caben, en vez de repartir spans a mano según qué campos estén
          visibles (había un ternario anidado calculando el ancho de Notas). */}
      <Card style={{ marginBottom: 12, flexShrink: 0 }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={[12, 0]} align="bottom">
          <Col flex="2 1 240px">
            <Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]} style={ITEM_COMPACTO}>
              <Select size="small" showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={(proveedores?.data ?? []).map((p: any) => ({
                  value: p.id,
                  label: `${(p as any).rnc || 'Sin RNC'} — ${p.nombre}${(p as any).esInformal ? ' ⚠ Informal' : ''}`,
                }))}
                onChange={(v: number) => { setProveedorSelId(v); setRetieneItbis(false); setRetieneIsr(false); }}
              />
            </Form.Item>
          </Col>
          <Col flex="1 1 108px">
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]} style={ITEM_COMPACTO}>
              <DatePicker size="small" style={{ width:'100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col flex="1 1 120px">
            <Form.Item name="numeroFacturaProveedor" label="NCF Proveedor" style={ITEM_COMPACTO}>
              <Input size="small" placeholder="B01-00000001" />
            </Form.Item>
          </Col>
          <Col flex="1 1 140px">
            <Form.Item style={ITEM_COMPACTO}
              label={
                <Space size={4}>
                  Almacén destino
                  <Tooltip title="Almacén donde se recibirá la mercancía. Se usa para actualizar el stock por almacén.">
                    <InfoCircleOutlined style={{ color: '#6b7280', fontSize: 13 }} />
                  </Tooltip>
                </Space>
              }
            >
              <Select size="small"
                allowClear placeholder="Almacén..."
                value={almacenId} onChange={(v) => setAlmacenId(v ?? undefined)}
                showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={almacenes.map((a: any) => ({
                  value: a.id, label: a.codigo ? `${a.codigo} — ${a.nombre}` : a.nombre,
                }))}
              />
            </Form.Item>
          </Col>
          <Col flex="1 1 120px">
            <Form.Item label="Moneda" style={ITEM_COMPACTO}>
              <Select size="small" value={moneda} onChange={handleMonedaChange} style={{ width: '100%' }}>
                <Select.Option value="DOP">DOP — Pesos</Select.Option>
                <Select.Option value="USD">USD — Dólares</Select.Option>
                <Select.Option value="EUR">EUR — Euros</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          {moneda !== 'DOP' && (
            <Col flex="1 1 130px">
              <Form.Item label={`Tasa RD$/${moneda}`} style={ITEM_COMPACTO}>
                <InputNumber size="small" controls={false} value={tipoCambio} min={1} precision={4} style={{ width: '100%' }}
                  onChange={v => setTipoCambio(v ?? 1)} addonBefore="RD$" />
              </Form.Item>
            </Col>
          )}
          <Col flex="1 1 130px">
            <Form.Item label="Tipo de pago" required style={ITEM_COMPACTO}>
              <Select size="small" value={tipoPago} onChange={v => setTipoPago(v)} style={{ width: '100%' }}>
                <Select.Option value="contado">Contado</Select.Option>
                <Select.Option value="credito">Crédito</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          {tipoPago === 'credito' && (
            <Col flex="1 1 120px">
              <Form.Item label="Días crédito" style={ITEM_COMPACTO}>
                <InputNumber size="small" controls={false} min={1} max={365} value={diasCredito}
                  onChange={v => setDiasCredito(v ?? 30)} style={{ width: '100%' }} addonAfter="días" />
              </Form.Item>
            </Col>
          )}
          {sucursales.length > 1 && (
            <Col flex="1 1 140px">
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: true, message: 'Selecciona una sucursal' }]} style={ITEM_COMPACTO}>
                <Select size="small" placeholder="Seleccionar sucursal" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
          )}
          <Col flex="2 1 180px">
            <Form.Item name="notas" label="Notas" style={ITEM_COMPACTO}>
              <Input.TextArea size="small" autoSize={{ minRows: 1, maxRows: 3 }} />
            </Form.Item>
          </Col>
        </Row>

        {/* El aviso de pago, en una línea de texto pequeño. Era un Alert de
            bloque: una franja entera con fondo para una frase. El mensaje se
            mantiene —es información útil— pero no a ese tamaño. */}
        {tipoPago === 'credito' && fechaVencimientoCalc && (
          <div style={{ fontSize: 12, color: '#1677ff', marginTop: 2 }}>
            Vence el <strong>{fechaVencimientoCalc.format('DD/MM/YYYY')}</strong> ({diasCredito} días)
            {' '}— se creará una Cuenta por Pagar automáticamente al recibir.
          </div>
        )}
        {tipoPago === 'contado' && (
          <div style={{ fontSize: 12, color: '#059669', marginTop: 2 }}>
            Pago de contado — no se generará Cuenta por Pagar.
          </div>
        )}
      </Card>

      {/* La ÚNICA sección que desplaza cuando hay muchos ítems: la cabecera y
          el pie de totales se quedan a la vista mientras se captura. */}
      <Card title="Ítems"
        style={altoCompleto
          ? { marginBottom: 16, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
          : { marginBottom: 16 }}
        styles={altoCompleto ? { body: { flex: 1, minHeight: 0, overflowY: 'auto' } } : undefined}
        extra={<Button icon={<PlusOutlined />} onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, cantidadBonificada: 0, precioUnitario: 0, porcentajeItbis: 18, descuentoPct: 0, descuentoMonto: 0 }])}>Agregar</Button>}>
        {/* Ancho MÍNIMO (1062 = la suma de las columnas), no `max-content`.
            Esta es una tabla de CAPTURA, no de consulta: el usuario teclea
            mirando la factura del proveedor y no puede tener columnas
            escondidas. `max-content` estiraba la tabla a lo que ocupara su
            contenido aunque cupiera, así que salía barra siempre; con un número
            solo aparece cuando el ancho disponible baja de ahí, que es el
            último recurso y no el comportamiento normal.

            La convención de `x: 'max-content'` sigue en pie para las tablas de
            consulta — ahí el criterio es el contrario. */}
        <Table columns={lineaCols as any} dataSource={lineas} rowKey="key" pagination={false} size="small"
          tableLayout="fixed" scroll={{ x: ANCHO_MINIMO_ITEMS }} />
      </Card>

      {esInformal && (
        <Card title={<span>⚠ Retenciones E41 — Proveedor informal</span>}
          style={{ marginBottom: 16, borderColor: '#f59e0b', background: token.colorWarningBg }}
          headStyle={{ borderColor: '#f59e0b', color: '#92400e' }}>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Checkbox checked={retieneItbis} onChange={e => setRetieneItbis(e.target.checked)}>Retener ITBIS</Checkbox>
                {retieneItbis && (
                  <InputNumber min={0} max={100} precision={2} value={pctItbis}
                    onChange={v => setPctItbis(v ?? 30)} addonAfter="%" style={{ width: 110 }} />
                )}
              </div>
              {retieneItbis && (
                <Alert type="warning" showIcon style={{ fontSize: 12 }}
                  message={`Monto a retener ITBIS: ${fmtMon(montoRetItbis, moneda)} (${pctItbis}% de ${fmtMon(itbis, moneda)})`} />
              )}
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Checkbox checked={retieneIsr} onChange={e => setRetieneIsr(e.target.checked)}>Retener ISR</Checkbox>
                {retieneIsr && (
                  <InputNumber min={0} max={100} precision={2} value={pctIsr}
                    onChange={v => setPctIsr(v ?? 10)} addonAfter="%" style={{ width: 110 }} />
                )}
              </div>
              {retieneIsr && (
                <Alert type="warning" showIcon style={{ fontSize: 12 }}
                  message={`Monto a retener ISR: ${fmtMon(montoRetIsr, moneda)} (${pctIsr}% de ${fmtMon(subtotal, moneda)})`} />
              )}
            </Col>
          </Row>
        </Card>
      )}

      <Card style={{ flexShrink: 0 }}>
        {/* Los totales en una franja horizontal, no en una columna pegada a la
            derecha con media tarjeta vacía. Cada importe es una celda que se
            envuelve sola, así que las que vienen —Total descuento, exento,
            gravado— entran sin rediseñar nada. Y gana la altura que hacía falta
            para que el botón de crear no quede fuera de pantalla. */}
        <Row justify="space-between" align="bottom" gutter={[16, 12]} style={{ marginBottom: 12 }}>
          <Col flex="auto">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', alignItems: 'flex-end' }}>
              {/* Subtotal BRUTO (antes de descuento) — se lee Subtotal →
                  Descuento → ITBIS → Total, igual que la factura del proveedor. */}
              <Dato etiqueta="Subtotal" valor={fmtMon(subtotalBruto, moneda)} />
              {descuentoTotal > 0 && (
                <Dato etiqueta="Descuento" valor={`-${fmtMon(descuentoTotal, moneda)}`} color="#d97706" />
              )}
              <Dato etiqueta="ITBIS (18%)" valor={fmtMon(itbis, moneda)} />
              {(montoRetItbis > 0 || montoRetIsr > 0) && (
                <Dato etiqueta="Total bruto" valor={fmtMon(total, moneda)} />
              )}
              {montoRetItbis > 0 && (
                <Dato etiqueta={`(-) Ret. ITBIS ${pctItbis}%`} valor={`-${fmtMon(montoRetItbis, moneda)}`} color="#d97706" />
              )}
              {montoRetIsr > 0 && (
                <Dato etiqueta={`(-) Ret. ISR ${pctIsr}%`} valor={`-${fmtMon(montoRetIsr, moneda)}`} color="#d97706" />
              )}
              {moneda !== 'DOP' && tipoCambio > 1 && (
                <Dato etiqueta="Equivalente RD$"
                  valor={fmtMon((montoRetItbis > 0 || montoRetIsr > 0 ? netoPagar : total) * tipoCambio, 'DOP')}
                  color="#888" />
              )}
            </div>
          </Col>
          <Col flex="none">
            {(montoRetItbis > 0 || montoRetIsr > 0) ? (
              <Dato etiqueta="NETO A PAGAR" valor={fmtMon(netoPagar, moneda)} color="#059669" grande />
            ) : (
              <Dato etiqueta="Total" valor={fmtMon(total, moneda)} color="#1677ff" grande />
            )}
          </Col>
        </Row>
        {/* Los botones ya no van dentro de una columna a media anchura: con los
            totales en franja, aquí sobra sitio y el bloque baja de tres filas a
            una. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {onCancel && (
            <Button size="large" onClick={onCancel} disabled={createMut.isPending}
              style={{ minWidth: 120 }}>
              Cancelar
            </Button>
          )}
          <Button type="primary" htmlType="submit" size="large"
            style={{ minWidth: 220 }}
            loading={createMut.isPending || cargandoCompra}
            disabled={cargandoCompra}>
            {esEdicion ? 'Guardar cambios' : 'Crear Orden de Compra'}
          </Button>
        </div>
      </Card>
      {/* ── Modal: crear producto rápido desde la OC ─────────────────── */}
      <Modal
        title="Crear producto rápido"
        open={showCrearProd}
        onCancel={() => { setShowCrearProd(false); crearProdForm.resetFields(); }}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form
          form={crearProdForm}
          layout="vertical"
          onFinish={(vals) => crearProdMut.mutate({
            nombre:           vals.nombre,
            precio:           Number(vals.precio),
            costo:            vals.costo ? Number(vals.costo) : undefined,
            categoria:        vals.categoria  || undefined,
            unidadMedida:     vals.unidadMedida || undefined,
            codigoBarras:     vals.codigoBarras || undefined,
            // El proveedor de la orden que se está capturando. Es el único sitio
            // del sistema donde el par producto↔proveedor es deducible sin
            // preguntar nada: ya está elegido arriba en este mismo formulario.
            //
            // No espera a la recepción: el enganche de compras vincula al recibir,
            // pero una orden puede quedarse en borrador mucho tiempo — y es justo
            // ahí cuando quieres ver el catálogo del proveedor en reposición.
            //
            // El `costo` NO viaja como precio pactado: es un estimado de compra.
            proveedorId:      form.getFieldValue('proveedorId') || undefined,
            esCreacionRapida: true,
            porcentajeIva:    18,
          })}
        >
          <Form.Item
            name="nombre"
            label="Nombre del producto"
            rules={[{ required: true, message: 'El nombre es obligatorio' }]}
          >
            <Input placeholder="Ej: Aceite Motor 5W30 1L" autoFocus />
          </Form.Item>
          <Form.Item name="codigoBarras" label="Código de barra">
            <Input placeholder="Escanea o escribe el código" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="precio"
                label="Precio de venta"
                rules={[
                  { required: true, message: 'Ingresa un precio de venta' },
                  { type: 'number', min: 0.01, message: 'Debe ser mayor a 0' },
                ]}
                extra="Editable luego en Inventario"
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} addonBefore="RD$" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="costo"
                label="Costo de compra"
                extra="Se usará como precio en esta OC"
              >
                <InputNumber min={0} precision={2} style={{ width: '100%' }} addonBefore="RD$" placeholder="0.00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="categoria" label="Categoría">
                <Input placeholder="Ej: Lubricantes" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unidadMedida" label="Unidad de medida" initialValue="PZA">
                <Select>
                  <Select.Option value="PZA">PZA — Pieza</Select.Option>
                  <Select.Option value="UNIDAD">UNIDAD</Select.Option>
                  <Select.Option value="LITRO">LITRO</Select.Option>
                  <Select.Option value="KG">KG</Select.Option>
                  <Select.Option value="METRO">METRO</Select.Option>
                  <Select.Option value="CAJA">CAJA</Select.Option>
                  <Select.Option value="GALON">GALÓN</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Creación rápida — completa los detalles del producto en Inventario después."
          />
          <Row gutter={8} justify="end">
            <Col>
              <Button onClick={() => { setShowCrearProd(false); crearProdForm.resetFields(); }}>
                Cancelar
              </Button>
            </Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={crearProdMut.isPending} icon={<PlusOutlined />}>
                Crear y agregar a la OC
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Form>
  );
}
