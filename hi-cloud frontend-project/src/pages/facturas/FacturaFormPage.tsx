import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert,
         Modal, theme, Spin, Checkbox, Tooltip, Upload } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined,
         SafetyCertificateOutlined, SearchOutlined, PaperClipOutlined,
         FileOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { facturasApi, type FacturaDetallePayload, type FormaPagoPayload } from '../../api/facturas.api';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { fmt } from '../../utils/formatters';
import { TIPOS_NCF } from '../../components/ui/NCFSelector';
import { useRncLookup } from '../../hooks/useRncLookup';
import RncBadge from '../../components/ui/RncBadge';
import type { Cliente } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const r2 = (n: number) => Math.round(n * 100) / 100;

interface LineaForm {
  key: string;
  productoId?: number;
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  descuentoTipo: 'monto' | 'porcentaje';
  descuentoValor: number;
}

const NCF_VENTAS = ['E31', 'E32', 'E41', 'E44', 'E45', 'E46', 'E47'];

const lineaVacia = (): LineaForm => ({
  key: Date.now().toString(),
  cantidad: 1,
  precioUnitario: 0,
  porcentajeIva: 18,
  descuentoTipo: 'monto',
  descuentoValor: 0,
});

// Estilo compacto compartido para todos los Form.Item del encabezado
const fi = { marginBottom: 8 };

export default function FacturaFormPage() {
  const { token } = theme.useToken();
  const { id }    = useParams<{ id?: string }>();
  const editMode  = !!id;

  const [form]   = Form.useForm();
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...lineaVacia(), key: '1' }]);

  const [tipoNcf,      setTipoNcf]      = useState('E32');
  const [tipoNcfManual, setTipoNcfManual] = useState(false); // true cuando el usuario elige manualmente
  const [tipoPago,    setTipoPago]    = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [diasCredito, setDiasCredito] = useState(30);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // RNC lookup
  const rnc = useRncLookup();
  const [rncInput, setRncInput] = useState('');

  // Descuento general
  const [descGeneralTipo,  setDescGeneralTipo]  = useState<'monto' | 'porcentaje'>('monto');
  const [descGeneralValor, setDescGeneralValor] = useState(0);

  // Orden de Compra
  const [ordenCompraNumero, setOrdenCompraNumero] = useState('');

  // Múltiples formas de pago
  const [formasPago, setFormasPago] = useState<FormaPagoPayload[]>([]);

  // Retenciones (solo E31)
  const [aplicaRetenciones, setAplicaRetenciones] = useState(false);
  const [retieneItbis,      setRetieneItbis]       = useState(false);
  const [pctRetItbis,       setPctRetItbis]        = useState(30);
  const [retieneIsr,        setRetieneIsr]         = useState(false);
  const [pctRetIsr,         setPctRetIsr]          = useState(10);

  const [modalAnticipo, setModalAnticipo] = useState<{ facturaId: number; clienteId: number } | null>(null);
  const [formAnticipo] = Form.useForm();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Datos base ─────────────────────────────────────────────────────────────
  const { data: clientes } = useQuery({
    queryKey: ['clientes-sel'],
    queryFn:  () => clientesApi.list(1, 100),
  });

  const { data: productos } = useQuery({
    queryKey: ['productos-sel'],
    queryFn:  () => productosApi.list(1, 5000, '', true),
  });

  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);
  const almacenActual  = useAuthStore(s => s.almacenActual);

  const [stockPorProducto, setStockPorProducto] = useState<Record<number, any[]>>({});

  const { data: vendedores = [] } = useQuery<any[]>({
    queryKey: ['vendedores-sel'],
    queryFn:  () => api.get('/vendedores').then((r: any) => r.data?.data?.data ?? r.data?.data ?? []),
  });

  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['mis-sucursales', empresaActual],
    queryFn:  () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  // ── Carga de factura existente (modo edición) ──────────────────────────────
  const { data: facturaEdit, isLoading: loadingEdit } = useQuery({
    queryKey: ['factura-edit', id],
    queryFn:  () => facturasApi.getOne(Number(id)),
    enabled:  editMode,
    staleTime: 0,
  });

  useEffect(() => {
    if (!facturaEdit) return;

    form.setFieldsValue({
      clienteId:  (facturaEdit as any).clienteId,
      fecha:      dayjs((facturaEdit as any).fecha),
      notas:      (facturaEdit as any).notas,
      vendedorId: (facturaEdit as any).vendedorId,
      moneda:     (facturaEdit as any).moneda ?? 'DOP',
      tipoCambio: (facturaEdit as any).tipoCambio,
      sucursalId: (facturaEdit as any).sucursalId,
    });

    setTipoNcf((facturaEdit as any).tipoNcf ?? 'E32');
    setTipoPago(((facturaEdit as any).tipoPago ?? 'CONTADO') as 'CONTADO' | 'CREDITO');
    setDiasCredito(Number((facturaEdit as any).diasCredito ?? 30));

    // Descuento general
    const dgt = (facturaEdit as any).descuentoGeneralTipo;
    const dgv = Number((facturaEdit as any).descuentoGeneralValor ?? 0);
    setDescGeneralTipo(dgt === 'porcentaje' ? 'porcentaje' : 'monto');
    setDescGeneralValor(dgv);

    // Poblar RNC desde el cliente de la factura
    const rfc = ((facturaEdit as any).cliente?.rfc ?? '').replace(/\D/g, '').slice(0, 11);
    setRncInput(rfc);

    // OC y formas de pago
    setOrdenCompraNumero((facturaEdit as any).ordenCompraNumero ?? '');
    setFormasPago((facturaEdit as any).formasPago ?? []);

    // Líneas
    const detallesCargados: any[] = (facturaEdit as any).detalles ?? [];
    if (detallesCargados.length > 0) {
      setLineas(detallesCargados.map((d: any, i: number) => {
        const dm = Number(d.descuentoMonto ?? 0);
        const dp = Number(d.descuentoPct   ?? 0);
        return {
          key:            String(i + 1),
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          cantidad:       Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
          porcentajeIva:  Number(d.porcentajeIva ?? 18),
          descuentoTipo:  dm > 0 ? 'monto' : 'porcentaje',
          descuentoValor: dm > 0 ? dm : dp,
        };
      }));
    }
  }, [facturaEdit, form]);

  // Auto-seleccionar sucursal en modo creación
  useEffect(() => {
    if (editMode) return;
    if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual, editMode]);

  // Poblar clienteSeleccionado al cargar edición
  useEffect(() => {
    if (!facturaEdit || !clientes?.data) return;
    const cli = clientes.data.find((c: Cliente) => c.id === (facturaEdit as any).clienteId) ?? null;
    setClienteSeleccionado(cli);
  }, [facturaEdit, clientes?.data]);

  // ── Mutaciones ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: facturasApi.create,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      message.success('Factura creada exitosamente');
      const facturaId = res?.data?.data?.id ?? res?.data?.id ?? res?.id;
      const clienteId = form.getFieldValue('clienteId');
      if (facturaId && clienteId && (anticiposCliente?.length ?? 0) > 0) {
        setModalAnticipo({ facturaId, clienteId });
      } else {
        navigate('/facturas');
      }
    },
    onError: (e: unknown) => {
      const msg = (e as any)?.response?.data?.errors?.[0] ??
                  (e as any)?.response?.data?.message ?? 'Error al crear factura';
      message.error(msg);
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: any) => facturasApi.update(Number(id), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      qc.invalidateQueries({ queryKey: ['factura-edit', id] });
      message.success('Factura actualizada exitosamente');
      navigate('/facturas');
    },
    onError: (e: unknown) => {
      const msg = (e as any)?.response?.data?.errors?.[0] ??
                  (e as any)?.response?.data?.message ?? 'Error al actualizar factura';
      message.error(msg);
    },
  });

  // Anticipos activos del cliente
  const clienteIdWatch = Form.useWatch('clienteId', form);
  const { data: anticiposCliente = [] } = useQuery<any[]>({
    queryKey: ['anticipos-activos-cliente', clienteIdWatch],
    queryFn:  () => api.get(`/anticipos/cliente/${clienteIdWatch}`)
      .then(r => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : []; }),
    enabled: !!clienteIdWatch && !editMode,
    staleTime: 0,
  });

  const { data: cxcFactura = [] } = useQuery<any[]>({
    queryKey: ['cxc-factura-nueva', modalAnticipo?.facturaId],
    queryFn:  () => api.get(`/cxc/cliente/${modalAnticipo!.clienteId}?limit=20`)
      .then(r => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!modalAnticipo,
    staleTime: 0,
  });

  const aplicarAnticipoMut = useMutation({
    mutationFn: ({ anticipoId, cxcId, monto }: { anticipoId: number; cxcId: number; monto: number }) =>
      api.post(`/anticipos/${anticipoId}/aplicar`, { cxcId, monto }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anticipos'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      message.success('Anticipo aplicado correctamente');
      setModalAnticipo(null);
      navigate('/facturas');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al aplicar anticipo', 5),
  });

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const lineasCalc = lineas.map(l => {
    const bruto = r2(l.precioUnitario * l.cantidad);
    let descLinea = 0;
    if (l.descuentoTipo === 'monto' && l.descuentoValor > 0)
      descLinea = r2(Math.min(l.descuentoValor, bruto));
    else if (l.descuentoTipo === 'porcentaje' && l.descuentoValor > 0)
      descLinea = r2(bruto * (l.descuentoValor / 100));
    return { ...l, bruto, descLinea, subtotalNeto: r2(bruto - descLinea) };
  });

  const subtotalBruto   = r2(lineasCalc.reduce((s, l) => s + l.bruto, 0));
  const totalDescLineas = r2(lineasCalc.reduce((s, l) => s + l.descLinea, 0));
  const subtotalNeto    = r2(subtotalBruto - totalDescLineas);

  let descGeneral = 0;
  if (descGeneralTipo === 'monto' && descGeneralValor > 0)
    descGeneral = r2(Math.min(descGeneralValor, subtotalNeto));
  else if (descGeneralTipo === 'porcentaje' && descGeneralValor > 0)
    descGeneral = r2(subtotalNeto * (descGeneralValor / 100));
  const baseGravable = r2(subtotalNeto - descGeneral);

  const ivaTotal = r2(lineasCalc.reduce((s, l) => {
    const prop      = subtotalNeto > 0 ? l.subtotalNeto / subtotalNeto : 0;
    const baseLinea = r2(l.subtotalNeto - r2(prop * descGeneral));
    return s + r2(baseLinea * (l.porcentajeIva / 100));
  }, 0));
  const total = r2(baseGravable + ivaTotal);

  const montoRetItbisForm = (tipoNcf === 'E31' && aplicaRetenciones && retieneItbis) ? r2(ivaTotal      * pctRetItbis / 100) : 0;
  const montoRetIsrForm   = (tipoNcf === 'E31' && aplicaRetenciones && retieneIsr)   ? r2(baseGravable  * pctRetIsr   / 100) : 0;
  const netoCobrarForm    = r2(total - montoRetItbisForm - montoRetIsrForm);

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Actualiza sugerencia de tipo NCF según tipo de cliente, solo si el usuario no eligió manualmente */
  const actualizarTipoNcf = useCallback((cli: Cliente | null) => {
    if (!cli || tipoNcfManual) return;
    const tipoMapa: Record<string, string> = {
      persona_juridica: 'E31',
      persona_fisica:   'E31',
      consumidor_final: 'E32',
      extranjero:       'E46',
      regimen_especial: 'E44',
      gubernamental:    'E45',
    };
    const sugerido = tipoMapa[(cli as any)?.tipoCliente ?? 'consumidor_final'] ?? 'E32';
    if (sugerido === 'E31' && !(cli?.rfc && /^\d{9,11}$/.test((cli.rfc ?? '').trim()))) {
      setTipoNcf('E32');
    } else {
      setTipoNcf(sugerido);
    }
  }, [tipoNcfManual]);

  const onClienteChange = (clienteId: number) => {
    const cli = clientes?.data.find((c: Cliente) => c.id === clienteId) ?? null;
    setClienteSeleccionado(cli);
    if ((cli as any)?.diasCredito > 0) setDiasCredito((cli as any).diasCredito);
    actualizarTipoNcf(cli);
    // Poblar campo RNC con el del cliente seleccionado
    const rfc = ((cli as any)?.rfc ?? '').replace(/\D/g, '').slice(0, 11);
    setRncInput(rfc);
    if (/^\d{9}$|^\d{11}$/.test(rfc)) rnc.consultarDebounced(rfc);
    else rnc.limpiar();
  };

  /** Intenta auto-seleccionar cliente por RFC exacto en la lista cargada */
  const intentarAutoseleccionPorRNC = useCallback((clean: string) => {
    if (!clientes?.data || form.getFieldValue('clienteId')) return false;
    const match = clientes.data.find(
      (c: Cliente) => (c.rfc ?? '').replace(/\D/g, '') === clean
    );
    if (match) {
      form.setFieldValue('clienteId', match.id);
      setClienteSeleccionado(match);
      if ((match as any)?.diasCredito > 0) setDiasCredito((match as any).diasCredito);
      actualizarTipoNcf(match);
      return true;
    }
    return false;
  }, [clientes?.data, form, actualizarTipoNcf]);

  /** Cuando el lookup DGII resuelve (asíncrono), reintenta match por RFC
   *  y además intenta match por nombre DGII en la lista de clientes */
  useEffect(() => {
    if (!rnc.datos?.encontrado) return;
    const clean = rncInput.replace(/\D/g, '');
    if (!/^\d{9}$|^\d{11}$/.test(clean)) return;
    if (form.getFieldValue('clienteId')) return;     // ya seleccionado

    // 1. Intento por RFC exacto
    if (intentarAutoseleccionPorRNC(clean)) return;

    // 2. Fallback: buscar por nombre DGII en la lista de clientes
    const nombreDGII = (rnc.datos.nombre ?? '').toLowerCase();
    if (!nombreDGII || !clientes?.data) return;
    const matchNombre = clientes.data.find((c: Cliente) => {
      const cn = (c.nombre ?? '').toLowerCase();
      // Coincidencia si los primeros 8 chars del nombre DGII están en el nombre del cliente o viceversa
      return cn.length > 4 && (nombreDGII.includes(cn.substring(0, 8)) || cn.includes(nombreDGII.substring(0, 8)));
    });
    if (matchNombre) {
      form.setFieldValue('clienteId', matchNombre.id);
      setClienteSeleccionado(matchNombre);
      if ((matchNombre as any)?.diasCredito > 0) setDiasCredito((matchNombre as any).diasCredito);
      actualizarTipoNcf(matchNombre);
    }
  }, [rnc.datos, clientes?.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onRncChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    setRncInput(clean);
    if (/^\d{9}$|^\d{11}$/.test(clean)) {
      intentarAutoseleccionPorRNC(clean);     // intento inmediato (si clientes ya cargó)
      rnc.consultarDebounced(clean);          // lookup DGII asíncrono (reintento en useEffect)
    } else {
      rnc.limpiar();
    }
  };

  const onProductoChange = (productoId: number, idx: number) => {
    const prod = productos?.data.find(p => p.id === productoId);
    if (!prod) return;
    const updated = [...lineas];
    updated[idx] = {
      ...updated[idx],
      productoId,
      descripcion:    prod.nombre,
      precioUnitario: Number(prod.precio),
      porcentajeIva:  Number(prod.porcentajeIva),
    };
    setLineas(updated);
    if (!stockPorProducto[productoId]) {
      api.get(`/almacenes/producto/${productoId}/stock`)
        .then((r: any) => {
          const stocks: any[] = r.data?.data ?? r.data ?? [];
          setStockPorProducto(prev => ({ ...prev, [productoId]: stocks }));
        })
        .catch(() => {});
    }
  };

  const handleSubmit = (values: {
    clienteId: number; fecha: dayjs.Dayjs; notas?: string;
    vendedorId?: number; moneda?: string; tipoCambio?: number;
  }) => {
    const vendedor = vendedores.find((v: any) => v.id === values.vendedorId);
    const detalles: FacturaDetallePayload[] = lineas.map(l => ({
      productoId:     l.productoId as number,
      descripcion:    l.descripcion,
      cantidad:       l.cantidad,
      precioUnitario: l.precioUnitario,
      porcentajeIva:  l.porcentajeIva,
      descuentoMonto: l.descuentoTipo === 'monto'      ? (l.descuentoValor || 0) : 0,
      descuentoPct:   l.descuentoTipo === 'porcentaje' ? (l.descuentoValor || 0) : 0,
    }));

    const payload = {
      clienteId:       values.clienteId,
      fecha:           values.fecha.format('YYYY-MM-DD'),
      detalles,
      tipoNcf,
      notas:           values.notas,
      vendedorId:      values.vendedorId,
      nombreVendedor:  vendedor?.nombre,
      sucursalId:      (values as any).sucursalId ?? sucursalActual,
      moneda:          values.moneda ?? 'DOP',
      tipoCambio:      values.tipoCambio ?? 1,
      tipoPago,
      diasCredito:     tipoPago === 'CREDITO' ? diasCredito : 0,
      // RNC comprador validado
      ...(/^\d{9}$|^\d{11}$/.test(rncInput) ? { rncComprador: rncInput } : {}),
      // Orden de Compra
      ...(ordenCompraNumero.trim() ? { ordenCompraNumero: ordenCompraNumero.trim() } : {}),
      // Formas de pago múltiples
      ...(formasPago.length > 0 ? { formasPago } : {}),
      // Descuento general
      ...(descGeneralValor > 0 ? {
        descuentoGeneralTipo:  descGeneralTipo,
        descuentoGeneralValor: descGeneralValor,
      } : {}),
      // Retenciones E31
      ...(tipoNcf === 'E31' && aplicaRetenciones ? {
        aplicaRetenciones: true,
        retieneItbis,
        porcentajeRetencionItbis: pctRetItbis,
        retieneIsr,
        porcentajeRetencionIsr:   pctRetIsr,
      } : {}),
    } as any;

    if (editMode) updateMut.mutate(payload);
    else          createMut.mutate(payload);
  };

  // ── Alertas contextuales ───────────────────────────────────────────────────
  const tipoInfo = TIPOS_NCF.find(t => t.codigo === tipoNcf);
  const mostrarAlertaRNC          = tipoNcf === 'E31' && clienteSeleccionado && !(/^\d{9}$/.test(clienteSeleccionado?.rfc?.trim() ?? ''));
  const mostrarAlertaExportacion  = tipoNcf === 'E46' && clienteSeleccionado;
  const mostrarAlertaPagoExterior = tipoNcf === 'E47';
  const mostrarAlertaExento       = (tipoNcf === 'E44' || tipoNcf === 'E45') && clienteSeleccionado;
  const mostrarAlertaE41          = tipoNcf === 'E41';

  // ── Columnas tabla líneas ──────────────────────────────────────────────────
  const lineaCols = [
    {
      title: 'Producto', key: 'producto', width: 200,
      ellipsis: true,
      render: (_: unknown, r: LineaForm, idx: number) => {
        const stocks = r.productoId ? (stockPorProducto[r.productoId] ?? null) : null;
        let stockTag: React.ReactNode = null;
        if (stocks) {
          const entrada = almacenActual ? stocks.find((s: any) => s.almacenId === almacenActual) : null;
          const qty   = entrada ? Number(entrada.stock) : stocks.reduce((a: number, s: any) => a + Number(s.stock), 0);
          const label = entrada
            ? `Stock: ${qty} (${entrada.almacen?.nombre ?? 'almacén'})`
            : `Stock total: ${qty}`;
          const color = qty === 0 ? 'red' : qty <= 5 ? 'orange' : 'green';
          stockTag = <Tag color={color} style={{ marginTop: 2, fontSize: 10 }}>{label}</Tag>;
        }
        return (
          <div>
            <Select style={{ width: '100%' }} placeholder="Seleccionar..." showSearch
              value={r.productoId}
              filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
              options={productos?.data.map(p => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }))}
              onChange={(v) => onProductoChange(v, idx)} />
            {stockTag}
          </div>
        );
      },
    },
    {
      title: 'Descripción', key: 'desc', width: 180,
      ellipsis: { showTitle: false },
      render: (_: unknown, r: LineaForm, idx: number) => (
        <Tooltip title={r.descripcion} placement="topLeft">
          <Input value={r.descripcion}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onChange={e => { const u = [...lineas]; u[idx].descripcion = e.target.value; setLineas(u); }} />
        </Tooltip>
      ),
    },
    {
      title: 'Cantidad', key: 'qty', width: 80,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0.0001} precision={4} value={r.cantidad} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].cantidad = v ?? 1; setLineas(u); }} />
      ),
    },
    {
      title: 'Precio (RD$)', key: 'price', width: 110,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} precision={2} value={r.precioUnitario} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].precioUnitario = v ?? 0; setLineas(u); }} />
      ),
    },
    {
      title: 'ITBIS %', key: 'iva', width: 70,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeIva} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].porcentajeIva = v ?? 18; setLineas(u); }} />
      ),
    },
    {
      title: 'Descuento', key: 'descuento', width: 180,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <Space.Compact style={{ width: '100%' }}>
          <Select value={r.descuentoTipo} style={{ width: 64 }}
            onChange={v => { const u = [...lineas]; u[idx].descuentoTipo = v; setLineas(u); }}>
            <Select.Option value="monto">RD$</Select.Option>
            <Select.Option value="porcentaje">%</Select.Option>
          </Select>
          <InputNumber min={0} precision={2} value={r.descuentoValor} style={{ flex: 1 }}
            max={r.descuentoTipo === 'porcentaje' ? 100 : undefined}
            onChange={v => { const u = [...lineas]; u[idx].descuentoValor = v ?? 0; setLineas(u); }} />
        </Space.Compact>
      ),
    },
    {
      title: 'Subtotal', key: 'sub', width: 110,
      render: (_: unknown, r: LineaForm) => {
        const calc = lineasCalc.find(l => l.key === r.key);
        return <Text strong style={{ whiteSpace: 'nowrap' }}>{fmt.money(calc?.subtotalNeto ?? r.precioUnitario * r.cantidad)}</Text>;
      },
    },
    {
      title: '', key: 'del', width: 44,
      render: (_: unknown, _r: LineaForm, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />}
          onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  if (editMode && loadingEdit) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" tip="Cargando factura..." />
      </div>
    );
  }

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/facturas')}>
          Volver
        </Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>
          {editMode ? `Editar Factura — ${(facturaEdit as any)?.folio ?? ''}` : 'Nueva Factura'}
        </Title>
        {editMode && <Tag color="orange" style={{ marginLeft: 12, fontSize: 12 }}>BORRADOR</Tag>}
      </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ fecha: dayjs(), moneda: 'DOP' }}>

        {/* ════════════════════════════════════════════════════════════════
            ENCABEZADO COMPACTO
        ════════════════════════════════════════════════════════════════ */}
        <Card style={{ marginBottom: 12 }}>

          {/* ── Fila 1: Comprobante · Cliente · Fecha · Vendedor ─────────── */}
          <Row gutter={[12, 0]}>
            {/* Tipo NCF */}
            <Col xs={24} sm={6}>
              <Form.Item
                style={fi}
                label={
                  <span style={{ fontSize: 12 }}>
                    <SafetyCertificateOutlined style={{ color: tipoInfo?.color, marginRight: 4 }} />
                    Comprobante <span style={{ color: 'red' }}>*</span>
                  </span>
                }
              >
                <Select value={tipoNcf} onChange={v => { setTipoNcf(v); setTipoNcfManual(true); }}
                  optionLabelProp="label" popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 300 }}>
                  {TIPOS_NCF.filter(t => NCF_VENTAS.includes(t.codigo)).map(t => (
                    <Select.Option key={t.codigo} value={t.codigo}
                      label={
                        <span>
                          <Tag color={t.color} style={{ fontSize: 11, marginRight: 4, lineHeight: '18px' }}>{t.codigo}</Tag>
                          {t.titulo}
                        </span>
                      }>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={t.color} style={{ fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>{t.codigo}</Tag>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{t.titulo}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.3 }}>{t.descripcion}</div>
                        </div>
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            {/* Cliente */}
            <Col xs={24} sm={10}>
              <Form.Item name="clienteId" label={<span style={{ fontSize: 12 }}>Cliente <span style={{ color: 'red' }}>*</span></span>}
                rules={[{ required: true, message: 'Selecciona un cliente' }]} style={fi}>
                <Select showSearch placeholder="Buscar cliente..."
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map((c: Cliente) => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))}
                  onChange={onClienteChange} />
              </Form.Item>
              {!editMode && anticiposCliente.length > 0 && (
                <div style={{ marginTop: -4, marginBottom: 4, padding: '3px 8px',
                  background: token.colorInfoBg, border: `1px solid ${token.colorInfoBorder}`,
                  borderRadius: 4, fontSize: 11, color: token.colorInfoText }}>
                  {anticiposCliente.length} anticipo(s) activo(s) · RD$ {
                    anticiposCliente.reduce((s: number, a: any) => s + Number(a.montoPendiente ?? 0), 0)
                      .toLocaleString('es-DO', { minimumFractionDigits: 2 })
                  }
                </div>
              )}
            </Col>

            {/* Fecha */}
            <Col xs={12} sm={4}>
              <Form.Item name="fecha" label={<span style={{ fontSize: 12 }}>Fecha <span style={{ color: 'red' }}>*</span></span>}
                rules={[{ required: true }]} style={fi}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>

            {/* Vendedor */}
            <Col xs={12} sm={4}>
              <Form.Item name="vendedorId" label={<span style={{ fontSize: 12 }}>Vendedor</span>} style={fi}>
                <Select allowClear showSearch placeholder="Sin asignar"
                  optionFilterProp="label"
                  options={vendedores.map((v: any) => ({
                    value: v.id,
                    label: v.codigo ? `${v.codigo} — ${v.nombre}` : v.nombre,
                  }))} />
              </Form.Item>
            </Col>
          </Row>

          {/* ── Fila 2: RNC · Forma de pago · Días · Moneda · Sucursal ──── */}
          <Row gutter={[12, 0]}>
            {/* RNC Comprador */}
            <Col xs={24} sm={7}>
              <Form.Item label={<span style={{ fontSize: 12 }}>RNC / Cédula comprador</span>}
                style={{ marginBottom: (rnc.loading || rnc.datos) ? 4 : 8 }}>
                <Input
                  value={rncInput}
                  maxLength={11}
                  placeholder="9 díg. RNC u 11 díg. Cédula"
                  suffix={rnc.loading
                    ? <Spin size="small" />
                    : <SearchOutlined style={{ color: '#ccc' }} />}
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                  onChange={e => onRncChange(e.target.value)}
                />
              </Form.Item>
              {(rnc.loading || rnc.datos) && (
                <div style={{ marginBottom: 8 }}>
                  <RncBadge datos={rnc.datos} loading={rnc.loading} />
                </div>
              )}
            </Col>

            {/* Forma de pago */}
            <Col xs={24} sm={6}>
              <Form.Item label={<span style={{ fontSize: 12 }}>Forma de pago</span>} style={fi}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['CONTADO', 'CREDITO'] as const).map(tp => (
                    <button key={tp} type="button" onClick={() => setTipoPago(tp)}
                      style={{
                        flex: 1, height: 32, borderRadius: 4, cursor: 'pointer', fontSize: 12,
                        border: tipoPago === tp ? `1.5px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                        background: tipoPago === tp ? token.colorPrimaryBg : token.colorBgContainer,
                        color: tipoPago === tp ? token.colorPrimary : token.colorTextSecondary,
                        fontWeight: tipoPago === tp ? 700 : 400,
                      }}>
                      {tp === 'CONTADO' ? 'Contado' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </Form.Item>
            </Col>

            {/* Días crédito */}
            {tipoPago === 'CREDITO' && (
              <Col xs={12} sm={4}>
                <Form.Item label={<span style={{ fontSize: 12 }}>Días crédito</span>} style={fi}>
                  <InputNumber min={1} max={365} value={diasCredito}
                    onChange={v => setDiasCredito(Number(v ?? 30))}
                    style={{ width: '100%' }} addonAfter="d" />
                </Form.Item>
              </Col>
            )}

            {/* Moneda */}
            <Col xs={12} sm={tipoPago === 'CREDITO' ? 3 : 4}>
              <Form.Item name="moneda" label={<span style={{ fontSize: 12 }}>Moneda</span>}
                initialValue="DOP" style={fi}>
                <Select>
                  <Select.Option value="DOP">🇩🇴 DOP</Select.Option>
                  <Select.Option value="USD">🇺🇸 USD</Select.Option>
                  <Select.Option value="EUR">🇪🇺 EUR</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            {/* Sucursal */}
            {sucursales.length > 1 && (
              <Col xs={12} sm={tipoPago === 'CREDITO' ? 4 : 7}>
                <Form.Item name="sucursalId"
                  label={<span style={{ fontSize: 12 }}>Sucursal <span style={{ color: 'red' }}>*</span></span>}
                  rules={[{ required: true, message: 'Selecciona sucursal' }]} style={fi}>
                  <Select placeholder="Sucursal"
                    options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Fila 3: Tasa de cambio (si !DOP) + Notas ─────────────────── */}
          <Form.Item noStyle dependencies={['moneda']}>
            {({ getFieldValue }) => (
              <Row gutter={[12, 0]}>
                {getFieldValue('moneda') !== 'DOP' && (
                  <Col xs={12} sm={5}>
                    <Form.Item name="tipoCambio"
                      label={<span style={{ fontSize: 12 }}>Tasa (RD$) <span style={{ color: 'red' }}>*</span></span>}
                      rules={[{ required: true }]} style={fi}>
                      <InputNumber min={0.01} precision={4} style={{ width: '100%' }}
                        placeholder="Ej: 58.50" />
                    </Form.Item>
                  </Col>
                )}
                <Col xs={12} sm={getFieldValue('moneda') !== 'DOP' ? 6 : 8}>
                  <Form.Item label={<span style={{ fontSize: 12 }}>N° Orden Compra</span>}
                    style={{ marginBottom: 4 }}>
                    <Input value={ordenCompraNumero} maxLength={100}
                      placeholder="OC-2025-001"
                      prefix={<PaperClipOutlined style={{ color: '#ccc' }} />}
                      onChange={e => setOrdenCompraNumero(e.target.value)} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={getFieldValue('moneda') !== 'DOP' ? 13 : 16}>
                  <Form.Item name="notas" label={<span style={{ fontSize: 12 }}>Notas</span>}
                    style={{ marginBottom: 4 }}>
                    <Input.TextArea rows={1} placeholder="Referencia interna, instrucciones de entrega, etc." />
                  </Form.Item>
                </Col>
              </Row>
            )}
          </Form.Item>

          {/* ── Alertas contextuales ──────────────────────────────────────── */}
          {tipoNcf === 'E31' && clienteSeleccionado && !mostrarAlertaRNC && (
            <div style={{ padding: '4px 10px', background: token.colorInfoBg, borderRadius: 6,
              border: `1px solid ${token.colorInfoBorder}`, fontSize: 11, color: token.colorInfoText }}>
              <strong>RNC:</strong> {clienteSeleccionado.rfc || 'No registrado'} · <strong>Razón social:</strong> {clienteSeleccionado.nombre}
            </div>
          )}
          {mostrarAlertaRNC && (
            <Alert type="warning" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
              message="Cliente sin RNC válido (9 dígitos). E31 requiere RNC registrado en DGII." />
          )}
          {mostrarAlertaExento && (
            <Alert type="info" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
              message={tipoNcf === 'E44'
                ? 'E44 Zona Franca: ITBIS = 0. Requiere documentación de régimen especial.'
                : 'E45 Gubernamental: entidad del gobierno dominicano. RNC requerido.'} />
          )}
          {mostrarAlertaExportacion && (
            <Alert type="info" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
              message="E46 Exportación: ITBIS = 0. Si es moneda extranjera, completa la tasa de cambio." />
          )}
          {mostrarAlertaPagoExterior && (
            <Alert type="info" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
              message="E47 Pagos al Exterior: proveedores extranjeros sin establecimiento en RD." />
          )}
          {mostrarAlertaE41 && (
            <Alert type="warning" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
              message="E41 Comprobante de Compras: proveedor informal solo cédula. Anotar cédula en notas." />
          )}
        </Card>

        {/* ── Líneas de detalle ──────────────────────────────────────────── */}
        <Card title="Líneas de factura" style={{ marginBottom: 12 }}
          extra={
            <Button icon={<PlusOutlined />} size="small"
              onClick={() => setLineas([...lineas, lineaVacia()])}>
              Agregar línea
            </Button>
          }>
          <Table columns={lineaCols as any} dataSource={lineas} rowKey="key"
            pagination={false} size="small" tableLayout="fixed" />
        </Card>

        {/* ── Descuento general ──────────────────────────────────────────── */}
        <Card size="small" style={{ marginBottom: 12 }}>
          <Row gutter={[12, 0]} align="middle">
            <Col xs={24} sm={4}>
              <Text strong style={{ fontSize: 13 }}>Descuento general</Text>
            </Col>
            <Col xs={24} sm={12}>
              <Space.Compact>
                <Select value={descGeneralTipo} style={{ width: 140 }}
                  onChange={v => { setDescGeneralTipo(v as 'monto' | 'porcentaje'); setDescGeneralValor(0); }}>
                  <Select.Option value="monto">Monto fijo (RD$)</Select.Option>
                  <Select.Option value="porcentaje">Porcentaje (%)</Select.Option>
                </Select>
                <InputNumber min={0} precision={2}
                  max={descGeneralTipo === 'porcentaje' ? 100 : undefined}
                  value={descGeneralValor}
                  onChange={v => setDescGeneralValor(v ?? 0)}
                  style={{ width: 140 }}
                  placeholder={descGeneralTipo === 'porcentaje' ? '0.00 %' : '0.00 RD$'} />
              </Space.Compact>
            </Col>
            {descGeneral > 0 && (
              <Col>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  = <Text strong style={{ color: '#d97706' }}>-{fmt.money(descGeneral)}</Text>
                </Text>
              </Col>
            )}
          </Row>
        </Card>

        {/* ── Formas de pago múltiples ───────────────────────────────────── */}
        <Card size="small" style={{ marginBottom: 12 }}
          title={
            <span style={{ fontSize: 13 }}>
              Formas de pago
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                (opcional — desglose de cómo se recibirá el pago)
              </Text>
            </span>
          }
          extra={
            <Button size="small" icon={<PlusOutlined />}
              onClick={() => setFormasPago([...formasPago, { tipo: 1, monto: 0 }])}>
              Agregar
            </Button>
          }>
          {formasPago.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Sin formas de pago especificadas — se asume el tipo de comprobante (contado/crédito).
            </Text>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }}>
              {formasPago.map((fp, idx) => (
                <Row key={idx} gutter={[8, 0]} align="middle">
                  <Col xs={24} sm={9}>
                    <Select value={fp.tipo} style={{ width: '100%' }}
                      onChange={v => {
                        const u = [...formasPago]; u[idx].tipo = v; setFormasPago(u);
                      }}>
                      <Select.Option value={1}>💵 Efectivo</Select.Option>
                      <Select.Option value={2}>🏦 Cheque / Transferencia</Select.Option>
                      <Select.Option value={3}>💳 Tarjeta débito/crédito</Select.Option>
                      <Select.Option value={4}>📋 Crédito (a plazo)</Select.Option>
                      <Select.Option value={5}>🔄 Permuta</Select.Option>
                      <Select.Option value={6}>📝 Nota de crédito</Select.Option>
                    </Select>
                  </Col>
                  <Col xs={12} sm={6}>
                    <InputNumber min={0} precision={2} value={fp.monto} style={{ width: '100%' }}
                      placeholder="Monto RD$"
                      onChange={v => {
                        const u = [...formasPago]; u[idx].monto = v ?? 0; setFormasPago(u);
                      }} />
                  </Col>
                  <Col xs={10} sm={7}>
                    <Input value={fp.referencia ?? ''} placeholder="Ref. opcional (# transacción, cheque...)"
                      onChange={e => {
                        const u = [...formasPago]; u[idx].referencia = e.target.value; setFormasPago(u);
                      }} />
                  </Col>
                  <Col xs={2} sm={2}>
                    <Button type="text" danger icon={<DeleteOutlined />}
                      onClick={() => setFormasPago(formasPago.filter((_, i) => i !== idx))} />
                  </Col>
                </Row>
              ))}
              {/* Validación: suma vs total */}
              {(() => {
                const sumaFP = r2(formasPago.reduce((s, fp) => s + fp.monto, 0));
                const diff   = r2(Math.abs(sumaFP - total));
                if (diff > 0.01 && sumaFP > 0) return (
                  <Alert type="warning" showIcon style={{ padding: '4px 10px', fontSize: 12 }}
                    message={`La suma de formas de pago (${fmt.money(sumaFP)}) no coincide con el total (${fmt.money(total)}) — diferencia: ${fmt.money(diff)}`} />
                );
                if (sumaFP > 0 && diff <= 0.01) return (
                  <Text style={{ fontSize: 12, color: '#059669' }}>✓ Suma cuadra con el total</Text>
                );
                return null;
              })()}
            </Space>
          )}
        </Card>

        {/* ── Retenciones E31 ────────────────────────────────────────────── */}
        {tipoNcf === 'E31' && (
          <Card style={{ marginBottom: 12 }}>
            <Checkbox checked={aplicaRetenciones}
              onChange={e => {
                setAplicaRetenciones(e.target.checked);
                if (!e.target.checked) { setRetieneItbis(false); setRetieneIsr(false); }
              }}>
              <Text strong>Aplica Retenciones</Text>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>(agente de retención DGII)</Text>
            </Checkbox>
            {aplicaRetenciones && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: token.colorWarningBg,
                border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8 }}>
                <Row gutter={[24, 8]}>
                  <Col xs={24} sm={12}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <Checkbox checked={retieneItbis} onChange={e => setRetieneItbis(e.target.checked)}>
                        Retener ITBIS
                      </Checkbox>
                      {retieneItbis && (
                        <InputNumber min={0} max={100} precision={2} value={pctRetItbis}
                          onChange={v => setPctRetItbis(v ?? 30)} addonAfter="%" style={{ width: 110 }} />
                      )}
                    </div>
                    {retieneItbis && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Monto: <Text strong style={{ color: '#d97706' }}>-{fmt.money(montoRetItbisForm)}</Text>
                        &nbsp;({pctRetItbis}% de {fmt.money(ivaTotal)})
                      </Text>
                    )}
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <Checkbox checked={retieneIsr} onChange={e => setRetieneIsr(e.target.checked)}>
                        Retener ISR
                      </Checkbox>
                      {retieneIsr && (
                        <InputNumber min={0} max={100} precision={2} value={pctRetIsr}
                          onChange={v => setPctRetIsr(v ?? 10)} addonAfter="%" style={{ width: 110 }} />
                      )}
                    </div>
                    {retieneIsr && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Monto: <Text strong style={{ color: '#d97706' }}>-{fmt.money(montoRetIsrForm)}</Text>
                        &nbsp;({pctRetIsr}% de {fmt.money(baseGravable)})
                      </Text>
                    )}
                  </Col>
                </Row>
              </div>
            )}
          </Card>
        )}

        {/* ── Totales ─────────────────────────────────────────────────────── */}
        <Card>
          <Row justify="end">
            <Col xs={24} sm={14} md={9}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Row justify="space-between">
                  <Text type="secondary">Subtotal bruto</Text>
                  <Text strong>{fmt.money(subtotalBruto)}</Text>
                </Row>
                {totalDescLineas > 0 && (
                  <Row justify="space-between">
                    <Text type="secondary">(-) Descuentos por línea</Text>
                    <Text style={{ color: '#d97706' }}>-{fmt.money(totalDescLineas)}</Text>
                  </Row>
                )}
                {descGeneral > 0 && (
                  <Row justify="space-between">
                    <Text type="secondary">
                      (-) Descuento general{descGeneralTipo === 'porcentaje' ? ` (${descGeneralValor}%)` : ''}
                    </Text>
                    <Text style={{ color: '#d97706' }}>-{fmt.money(descGeneral)}</Text>
                  </Row>
                )}
                {(totalDescLineas > 0 || descGeneral > 0) && (
                  <Row justify="space-between">
                    <Text type="secondary">Base gravable</Text>
                    <Text strong>{fmt.money(baseGravable)}</Text>
                  </Row>
                )}
                <Row justify="space-between">
                  <Text type="secondary">ITBIS</Text>
                  <Text strong>{fmt.money(ivaTotal)}</Text>
                </Row>
                <Divider style={{ margin: '6px 0' }} />
                <Row justify="space-between" style={{ marginBottom: 2 }}>
                  <Text style={{ fontSize: 16 }}>{(montoRetItbisForm > 0 || montoRetIsrForm > 0) ? 'Total factura' : 'Total'}</Text>
                  <Text strong style={{ fontSize: 20, color: '#1677ff' }}>{fmt.money(total)}</Text>
                </Row>
                {montoRetItbisForm > 0 && (
                  <Row justify="space-between">
                    <Text type="secondary" style={{ fontSize: 13 }}>(-) Retención ITBIS ({pctRetItbis}%)</Text>
                    <Text style={{ color: '#d97706' }}>-{fmt.money(montoRetItbisForm)}</Text>
                  </Row>
                )}
                {montoRetIsrForm > 0 && (
                  <Row justify="space-between">
                    <Text type="secondary" style={{ fontSize: 13 }}>(-) Retención ISR ({pctRetIsr}%)</Text>
                    <Text style={{ color: '#d97706' }}>-{fmt.money(montoRetIsrForm)}</Text>
                  </Row>
                )}
                {(montoRetItbisForm > 0 || montoRetIsrForm > 0) && (
                  <>
                    <Divider style={{ margin: '4px 0' }} />
                    <Row justify="space-between" style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>NETO A COBRAR</Text>
                      <Text strong style={{ fontSize: 18, color: '#059669' }}>{fmt.money(netoCobrarForm)}</Text>
                    </Row>
                  </>
                )}

                {tipoInfo && (
                  <div style={{ padding: '6px 10px', borderRadius: 6,
                    background: `${tipoInfo.color}10`, border: `1px solid ${tipoInfo.color}40` }}>
                    <Text style={{ fontSize: 12, color: tipoInfo.color, fontWeight: 600 }}>
                      <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                      {tipoInfo.codigo} · {tipoInfo.titulo}
                    </Text>
                  </div>
                )}

                <Button type="primary" htmlType="submit" block size="large"
                  loading={editMode ? updateMut.isPending : createMut.isPending}
                  style={{ height: 48, fontSize: 15 }}>
                  {editMode ? 'Guardar cambios' : 'Crear Factura'}
                </Button>
                {editMode && (
                  <Button block size="large" onClick={() => navigate('/facturas')}>
                    Cancelar
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>

      {/* ── Modal: aplicar anticipo ────────────────────────────────────── */}
      {!editMode && (
        <Modal title="¿Deseas aplicar un anticipo disponible?"
          open={!!modalAnticipo}
          onCancel={() => { setModalAnticipo(null); navigate('/facturas'); }}
          onOk={() => formAnticipo.submit()}
          confirmLoading={aplicarAnticipoMut.isPending}
          okText="Aplicar anticipo" cancelText="Omitir"
          width={480} destroyOnClose>
          <Alert type="success" showIcon message="Factura creada correctamente" style={{ marginBottom: 12 }} />
          <p style={{ color: token.colorTextSecondary, fontSize: 13, marginBottom: 12 }}>
            Este cliente tiene anticipos disponibles. Puedes aplicarlos ahora.
          </p>
          <Form form={formAnticipo} layout="vertical"
            onFinish={v => {
              if (!modalAnticipo) return;
              aplicarAnticipoMut.mutate({ anticipoId: v.anticipoId, cxcId: v.cxcId, monto: Number(v.monto) });
            }}>
            <Form.Item name="anticipoId" label="Anticipo a aplicar" rules={[{ required: true }]}>
              <Select placeholder="Seleccionar anticipo">
                {anticiposCliente.map((a: any) => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.numero} — Disponible: RD$ {Number(a.montoPendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="cxcId" label="Aplicar a (CxC)" rules={[{ required: true }]}>
              <Select placeholder="Seleccionar CxC" notFoundContent="Cargando...">
                {cxcFactura.map((c: any) => (
                  <Select.Option key={c.id} value={c.id}>
                    {c.factura?.folio ?? `CxC #${c.id}`} — Pendiente: RD$ {Number(c.montoPendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="monto" label="Monto a aplicar (RD$)" rules={[{ required: true }]}>
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
