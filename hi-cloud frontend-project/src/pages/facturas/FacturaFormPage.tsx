import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert,
         Modal, theme, Spin, Checkbox, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined,
         SafetyCertificateOutlined, SearchOutlined, PaperClipOutlined,
         FileOutlined, BarcodeOutlined, PrinterOutlined, MailOutlined,
         EyeOutlined, SaveOutlined, UserAddOutlined, CreditCardOutlined,
         FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
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

const { Text } = Typography;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Design tokens ─────────────────────────────────────────────────────────────
const D = {
  primary:       '#2563EB',
  primaryBg:     '#EFF6FF',
  primaryBorder: '#BFDBFE',
  green:         '#059669',
  greenBg:       '#ECFDF5',
  greenBorder:   '#A7F3D0',
  orange:        '#D97706',
  orangeBg:      '#FFFBEB',
  orangeBorder:  '#FDE68A',
  red:           '#DC2626',
  redBg:         '#FEF2F2',
  border:        '#E5E7EB',
  bg:            '#F8FAFC',
  card:          '#FFFFFF',
  text:          '#111827',
  textSec:       '#6B7280',
  textTer:       '#9CA3AF',
  radius:        12,
  radiusSm:      8,
  shadow:        '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowLg:      '0 4px 12px rgba(0,0,0,0.08)',
  font:          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

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
  key: Date.now().toString() + Math.random(),
  cantidad: 1,
  precioUnitario: 0,
  porcentajeIva: 18,
  descuentoTipo: 'monto',
  descuentoValor: 0,
});

const lbl = {
  fontSize: 11,
  fontWeight: 600,
  color: D.textSec,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  display: 'block' as const,
  marginBottom: 6,
};

export default function FacturaFormPage() {
  const { token } = theme.useToken();
  const { id }    = useParams<{ id?: string }>();
  const editMode  = !!id;

  const [form]   = Form.useForm();
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...lineaVacia(), key: '1' }]);

  const [tipoNcf,     setTipoNcf]     = useState('E32');
  const [tipoPago,    setTipoPago]    = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [diasCredito, setDiasCredito] = useState(30);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const rnc = useRncLookup();
  const [rncInput, setRncInput] = useState('');

  const [descGeneralTipo,  setDescGeneralTipo]  = useState<'monto' | 'porcentaje'>('monto');
  const [descGeneralValor, setDescGeneralValor] = useState(0);
  const [ordenCompraNumero, setOrdenCompraNumero] = useState('');
  const [formasPago, setFormasPago] = useState<FormaPagoPayload[]>([]);

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
    queryFn:  () => productosApi.list(1, 200),
  });

  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);

  const { data: vendedores = [] } = useQuery<any[]>({
    queryKey: ['vendedores-sel'],
    queryFn:  () => api.get('/vendedores').then((r: any) => r.data?.data?.data ?? r.data?.data ?? []),
  });

  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['mis-sucursales', empresaActual],
    queryFn:  () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  // ── Carga factura en edición ────────────────────────────────────────────────
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
    const dgt = (facturaEdit as any).descuentoGeneralTipo;
    const dgv = Number((facturaEdit as any).descuentoGeneralValor ?? 0);
    setDescGeneralTipo(dgt === 'porcentaje' ? 'porcentaje' : 'monto');
    setDescGeneralValor(dgv);
    const rfc = ((facturaEdit as any).cliente?.rfc ?? '').replace(/\D/g, '').slice(0, 11);
    setRncInput(rfc);
    setOrdenCompraNumero((facturaEdit as any).ordenCompraNumero ?? '');
    setFormasPago((facturaEdit as any).formasPago ?? []);
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

  useEffect(() => {
    if (editMode) return;
    if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual, editMode]);

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

  const montoRetItbisForm = (tipoNcf === 'E31' && aplicaRetenciones && retieneItbis) ? r2(ivaTotal     * pctRetItbis / 100) : 0;
  const montoRetIsrForm   = (tipoNcf === 'E31' && aplicaRetenciones && retieneIsr)   ? r2(baseGravable * pctRetIsr   / 100) : 0;
  const netoCobrarForm    = r2(total - montoRetItbisForm - montoRetIsrForm);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const actualizarTipoNcf = useCallback((cli: Cliente | null) => {
    if (!cli) return;
    const tipoMapa: Record<string, string> = {
      persona_juridica: 'E31', persona_fisica: 'E31',
      consumidor_final: 'E32', extranjero: 'E46',
      regimen_especial: 'E44', gubernamental: 'E45',
    };
    const sugerido = tipoMapa[(cli as any)?.tipoCliente ?? 'consumidor_final'] ?? 'E32';
    if (sugerido === 'E31' && !(cli?.rfc && /^\d{9,11}$/.test((cli.rfc ?? '').trim()))) {
      setTipoNcf('E32');
    } else {
      setTipoNcf(sugerido);
    }
  }, []);

  const onClienteChange = (clienteId: number) => {
    const cli = clientes?.data.find((c: Cliente) => c.id === clienteId) ?? null;
    setClienteSeleccionado(cli);
    if ((cli as any)?.diasCredito > 0) setDiasCredito((cli as any).diasCredito);
    actualizarTipoNcf(cli);
    const rfc = ((cli as any)?.rfc ?? '').replace(/\D/g, '').slice(0, 11);
    setRncInput(rfc);
    if (/^\d{9}$|^\d{11}$/.test(rfc)) rnc.consultarDebounced(rfc);
    else rnc.limpiar();
  };

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

  useEffect(() => {
    if (!rnc.datos?.encontrado) return;
    const clean = rncInput.replace(/\D/g, '');
    if (!/^\d{9}$|^\d{11}$/.test(clean)) return;
    if (form.getFieldValue('clienteId')) return;
    if (intentarAutoseleccionPorRNC(clean)) return;
    const nombreDGII = (rnc.datos.nombre ?? '').toLowerCase();
    if (!nombreDGII || !clientes?.data) return;
    const matchNombre = clientes.data.find((c: Cliente) => {
      const cn = (c.nombre ?? '').toLowerCase();
      return cn.length > 4 && (nombreDGII.includes(cn.substring(0, 8)) || cn.includes(nombreDGII.substring(0, 8)));
    });
    if (matchNombre) {
      form.setFieldValue('clienteId', matchNombre.id);
      setClienteSeleccionado(matchNombre);
      if ((matchNombre as any)?.diasCredito > 0) setDiasCredito((matchNombre as any).diasCredito);
      actualizarTipoNcf(matchNombre);
    }
  }, [rnc.datos, clientes?.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRncChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    setRncInput(clean);
    if (/^\d{9}$|^\d{11}$/.test(clean)) {
      intentarAutoseleccionPorRNC(clean);
      rnc.consultarDebounced(clean);
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
  };

  // ── Atajo de teclado ───────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      const isInput = ['INPUT', 'TEXTAREA'].includes(tag);
      if (e.key === 'Escape') { navigate('/facturas'); return; }
      if (e.key === 'F9')    { e.preventDefault(); form.submit(); return; }
      if (e.key === 'Enter' && !isInput) {
        e.preventDefault();
        setLineas(prev => [...prev, lineaVacia()]);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [form, navigate]);

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
      ...(/^\d{9}$|^\d{11}$/.test(rncInput) ? { rncComprador: rncInput } : {}),
      ...(ordenCompraNumero.trim() ? { ordenCompraNumero: ordenCompraNumero.trim() } : {}),
      ...(formasPago.length > 0 ? { formasPago } : {}),
      ...(descGeneralValor > 0 ? {
        descuentoGeneralTipo:  descGeneralTipo,
        descuentoGeneralValor: descGeneralValor,
      } : {}),
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

  // ── Alertas ────────────────────────────────────────────────────────────────
  const tipoInfo = TIPOS_NCF.find(t => t.codigo === tipoNcf);
  const mostrarAlertaRNC          = tipoNcf === 'E31' && clienteSeleccionado && !(/^\d{9}$/.test(clienteSeleccionado?.rfc?.trim() ?? ''));
  const mostrarAlertaExportacion  = tipoNcf === 'E46' && clienteSeleccionado;
  const mostrarAlertaPagoExterior = tipoNcf === 'E47';
  const mostrarAlertaExento       = (tipoNcf === 'E44' || tipoNcf === 'E45') && clienteSeleccionado;
  const mostrarAlertaE41          = tipoNcf === 'E41';
  const hayAlertas = mostrarAlertaRNC || mostrarAlertaExportacion || mostrarAlertaPagoExterior || mostrarAlertaExento || mostrarAlertaE41;

  // ── Columnas tabla (rediseñadas) ───────────────────────────────────────────
  const lineaCols = [
    {
      title: 'Producto',
      key: 'producto',
      width: 260,
      render: (_: unknown, r: LineaForm, idx: number) => {
        const prod = productos?.data.find((p: any) => p.id === r.productoId);
        const stock = (prod as any)?.stock ?? (prod as any)?.existencia ?? (prod as any)?.cantidadDisponible;
        const stockBajo = stock !== null && stock !== undefined && Number(stock) < 5;
        return (
          <div>
            <Select
              style={{ width: '100%' }}
              placeholder="Buscar producto..."
              showSearch
              value={r.productoId}
              filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
              options={productos?.data.map((p: any) => ({
                value: p.id,
                label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre,
              }))}
              onChange={(v) => onProductoChange(v, idx)}
            />
            {r.productoId && (
              <div style={{ marginTop: 4 }}>
                <Input
                  size="small"
                  value={r.descripcion ?? ''}
                  placeholder="Descripción..."
                  style={{ fontSize: 11, height: 26, background: '#F9FAFB', borderColor: '#E5E7EB', borderRadius: 4 }}
                  onChange={e => { const u = [...lineas]; u[idx].descripcion = e.target.value; setLineas(u); }}
                />
                {stock !== undefined && stock !== null && (
                  <span style={{ fontSize: 10, color: stockBajo ? D.red : D.textTer, fontWeight: stockBajo ? 700 : 400, paddingLeft: 2, display: 'block', marginTop: 2 }}>
                    {stockBajo ? `⚠ Stock Bajo: ${stock}` : `Existencia: ${stock}`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Cant.',
      key: 'qty',
      width: 80,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0.0001} precision={4} value={r.cantidad} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].cantidad = v ?? 1; setLineas(u); }} />
      ),
    },
    {
      title: 'Precio',
      key: 'price',
      width: 110,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} precision={2} value={r.precioUnitario} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].precioUnitario = v ?? 0; setLineas(u); }} />
      ),
    },
    {
      title: 'Desc.',
      key: 'descuento',
      width: 150,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <Space.Compact style={{ width: '100%' }}>
          <Select value={r.descuentoTipo} style={{ width: 58 }}
            onChange={v => { const u = [...lineas]; u[idx].descuentoTipo = v; setLineas(u); }}
            options={[{ value: 'monto', label: 'RD$' }, { value: 'porcentaje', label: '%' }]} />
          <InputNumber min={0} precision={2} value={r.descuentoValor} style={{ flex: 1 }}
            max={r.descuentoTipo === 'porcentaje' ? 100 : undefined}
            onChange={v => { const u = [...lineas]; u[idx].descuentoValor = v ?? 0; setLineas(u); }} />
        </Space.Compact>
      ),
    },
    {
      title: 'ITBIS',
      key: 'iva',
      width: 72,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeIva} style={{ width: '100%' }} addonAfter="%"
          onChange={v => { const u = [...lineas]; u[idx].porcentajeIva = v ?? 18; setLineas(u); }} />
      ),
    },
    {
      title: 'Subtotal',
      key: 'sub',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: LineaForm) => {
        const calc = lineasCalc.find(l => l.key === r.key);
        return <Text strong style={{ color: D.primary, fontSize: 13, whiteSpace: 'nowrap' }}>{fmt.money(calc?.subtotalNeto ?? r.precioUnitario * r.cantidad)}</Text>;
      },
    },
    {
      title: '',
      key: 'del',
      width: 36,
      render: (_: unknown, _r: LineaForm, idx: number) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
          onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      ),
    },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (editMode && loadingEdit) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="Cargando factura..." />
      </div>
    );
  }

  // ── Helpers de render ──────────────────────────────────────────────────────
  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <span style={lbl}>{children}</span>
  );

  const cardStyle: React.CSSProperties = {
    background: D.card,
    borderRadius: D.radius,
    border: `1px solid ${D.border}`,
    boxShadow: D.shadow,
    marginBottom: 16,
    overflow: 'hidden',
  };

  const secHeader = (title: string, icon: React.ReactNode) => (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: D.primary, fontSize: 15 }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: 14, color: D.text }}>{title}</span>
    </div>
  );

  // ── Preview URL helper ─────────────────────────────────────────────────────
  const openPreview = () => {
    const base = (api as any).defaults?.baseURL ?? '';
    window.open(`${base}/facturas/${id}/preview`, '_blank');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: D.bg, minHeight: '100vh', fontFamily: D.font }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        background: D.card,
        borderBottom: `1px solid ${D.border}`,
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/facturas')}
          style={{ color: D.textSec, fontSize: 13, height: 32 }}>
          Facturas
        </Button>
        <span style={{ color: D.border, fontSize: 16 }}>›</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: D.text }}>
          {editMode ? `Editar — ${(facturaEdit as any)?.folio ?? ''}` : 'Nueva Factura'}
        </span>
        {editMode && (
          <span style={{ background: '#FFF7ED', color: '#C2410C', fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 99, border: '1px solid #FED7AA' }}>
            BORRADOR
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Keyboard hints */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: D.textTer, alignItems: 'center' }}>
          {[['F9','Guardar'],['Enter','Añadir línea'],['ESC','Salir']].map(([k, l]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: 4,
                padding: '1px 5px', fontSize: 10, fontFamily: 'monospace', color: D.textSec }}>{k}</kbd>
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── Form wrapper ─────────────────────────────────────────────────── */}
      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ fecha: dayjs(), moneda: 'DOP' }}>

        <div style={{ display: 'flex', gap: 20, padding: '24px 24px 0', alignItems: 'flex-start', maxWidth: 1440, margin: '0 auto' }}>

          {/* ══════════════════════════════════════════════════════════════
              LEFT COLUMN
          ══════════════════════════════════════════════════════════════ */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── BLOQUE 1: Información general ──────────────────────────── */}
            <div style={cardStyle}>
              {secHeader('Información del comprobante', <SafetyCertificateOutlined />)}
              <div style={{ padding: '20px 20px 4px' }}>

                {/* Fila 1: Comprobante · Fecha · Vendedor */}
                <Row gutter={[16, 0]} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={8}>
                    <Lbl>Tipo de comprobante *</Lbl>
                    <Select value={tipoNcf} onChange={setTipoNcf} style={{ width: '100%' }}
                      optionLabelProp="label" popupMatchSelectWidth={false} dropdownStyle={{ minWidth: 320 }}>
                      {TIPOS_NCF.filter(t => NCF_VENTAS.includes(t.codigo)).map(t => (
                        <Select.Option key={t.codigo} value={t.codigo}
                          label={<span><Tag color={t.color} style={{ fontSize: 11, marginRight: 4, lineHeight: '18px' }}>{t.codigo}</Tag>{t.titulo}</span>}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
                            <Tag color={t.color} style={{ fontSize: 11, lineHeight: '18px', flexShrink: 0, margin: 0 }}>{t.codigo}</Tag>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{t.titulo}</div>
                              <div style={{ fontSize: 11, color: D.textTer, lineHeight: 1.4 }}>{t.descripcion}</div>
                            </div>
                          </div>
                        </Select.Option>
                      ))}
                    </Select>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Form.Item name="fecha" style={{ marginBottom: 0 }} rules={[{ required: true }]}
                      label={<Lbl>Fecha *</Lbl>}>
                      <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} sm={8}>
                    <Form.Item name="vendedorId" style={{ marginBottom: 0 }} label={<Lbl>Vendedor</Lbl>}>
                      <Select allowClear showSearch placeholder="Sin asignar" optionFilterProp="label"
                        options={vendedores.map((v: any) => ({
                          value: v.id,
                          label: v.codigo ? `${v.codigo} — ${v.nombre}` : v.nombre,
                        }))} />
                    </Form.Item>
                  </Col>
                </Row>

                {/* Fila 2: Cliente full width + nuevo cliente */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={lbl}>
                      Cliente *
                      {clienteSeleccionado && anticiposCliente.length > 0 && (
                        <span style={{ marginLeft: 8, background: D.greenBg, color: D.green, fontSize: 10,
                          fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          border: `1px solid ${D.greenBorder}`, textTransform: 'none', letterSpacing: 0 }}>
                          ✓ {anticiposCliente.length} anticipo(s) disponible(s)
                        </span>
                      )}
                      {clienteSeleccionado && (clienteSeleccionado as any)?.diasCredito > 0 && tipoPago === 'CREDITO' && (
                        <span style={{ marginLeft: 8, background: D.orangeBg, color: D.orange, fontSize: 10,
                          fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                          border: `1px solid ${D.orangeBorder}`, textTransform: 'none', letterSpacing: 0 }}>
                          {diasCredito}d crédito
                        </span>
                      )}
                    </span>
                    <Button type="link" size="small" icon={<UserAddOutlined />}
                      onClick={() => navigate('/clientes/nuevo')}
                      style={{ fontSize: 12, padding: 0, color: D.primary, height: 'auto' }}>
                      + Nuevo cliente
                    </Button>
                  </div>
                  <Form.Item name="clienteId" style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: 'Selecciona un cliente' }]}>
                    <Select showSearch placeholder="Buscar cliente por nombre o RNC..."
                      style={{ width: '100%' }}
                      filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                      options={clientes?.data.map((c: Cliente) => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))}
                      onChange={onClienteChange} />
                  </Form.Item>
                </div>

                {/* Fila 3: RNC · Forma de pago · Días · Moneda · Sucursal */}
                <Row gutter={[16, 0]} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={8}>
                    <Lbl>RNC / Cédula comprador</Lbl>
                    <Input value={rncInput} maxLength={11}
                      placeholder="9 dígitos RNC u 11 dígitos Cédula"
                      style={{ fontFamily: 'monospace', letterSpacing: 2 }}
                      suffix={rnc.loading ? <Spin size="small" /> : <SearchOutlined style={{ color: D.textTer }} />}
                      onChange={e => onRncChange(e.target.value)} />
                    {(rnc.loading || rnc.datos) && (
                      <div style={{ marginTop: 6 }}>
                        <RncBadge datos={rnc.datos} loading={rnc.loading} />
                      </div>
                    )}
                  </Col>

                  <Col xs={24} sm={tipoPago === 'CREDITO' ? 5 : 7}>
                    <Lbl>Forma de pago</Lbl>
                    <div style={{ display: 'flex', gap: 6, height: 32 }}>
                      {(['CONTADO', 'CREDITO'] as const).map(tp => (
                        <button key={tp} type="button" onClick={() => setTipoPago(tp)}
                          style={{
                            flex: 1, height: '100%', borderRadius: D.radiusSm, cursor: 'pointer',
                            fontSize: 13, fontFamily: D.font,
                            border: tipoPago === tp ? `1.5px solid ${D.primary}` : `1px solid ${D.border}`,
                            background: tipoPago === tp ? D.primaryBg : D.card,
                            color: tipoPago === tp ? D.primary : D.textSec,
                            fontWeight: tipoPago === tp ? 700 : 400,
                            transition: 'all 0.15s ease',
                          }}>
                          {tp === 'CONTADO' ? 'Contado' : 'Crédito'}
                        </button>
                      ))}
                    </div>
                  </Col>

                  {tipoPago === 'CREDITO' && (
                    <Col xs={12} sm={3}>
                      <Lbl>Días</Lbl>
                      <InputNumber min={1} max={365} value={diasCredito}
                        onChange={v => setDiasCredito(Number(v ?? 30))}
                        style={{ width: '100%' }} addonAfter="d" />
                    </Col>
                  )}

                  <Col xs={12} sm={tipoPago === 'CREDITO' ? 4 : 4}>
                    <Form.Item name="moneda" style={{ marginBottom: 0 }} initialValue="DOP"
                      label={<Lbl>Moneda</Lbl>}>
                      <Select>
                        <Select.Option value="DOP">🇩🇴 DOP</Select.Option>
                        <Select.Option value="USD">🇺🇸 USD</Select.Option>
                        <Select.Option value="EUR">🇪🇺 EUR</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>

                  {sucursales.length > 1 && (
                    <Col xs={12} sm={tipoPago === 'CREDITO' ? 4 : 5}>
                      <Form.Item name="sucursalId" style={{ marginBottom: 0 }}
                        rules={[{ required: true, message: 'Selecciona sucursal' }]}
                        label={<Lbl>Sucursal *</Lbl>}>
                        <Select placeholder="Sucursal"
                          options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                {/* Fila 4: Tasa de cambio · OC · Notas */}
                <Form.Item noStyle dependencies={['moneda']}>
                  {({ getFieldValue }) => (
                    <Row gutter={[16, 0]} style={{ marginBottom: 16 }}>
                      {getFieldValue('moneda') !== 'DOP' && (
                        <Col xs={12} sm={5}>
                          <Form.Item name="tipoCambio" style={{ marginBottom: 0 }} rules={[{ required: true }]}
                            label={<Lbl>Tasa RD$ *</Lbl>}>
                            <InputNumber min={0.01} precision={4} style={{ width: '100%' }} placeholder="58.50" />
                          </Form.Item>
                        </Col>
                      )}
                      <Col xs={12} sm={getFieldValue('moneda') !== 'DOP' ? 7 : 10}>
                        <Lbl>N° Orden de Compra</Lbl>
                        <Input value={ordenCompraNumero} maxLength={100} placeholder="OC-2025-001"
                          prefix={<PaperClipOutlined style={{ color: D.textTer }} />}
                          onChange={e => setOrdenCompraNumero(e.target.value)} />
                      </Col>
                      <Col xs={24} sm={getFieldValue('moneda') !== 'DOP' ? 12 : 14}>
                        <Form.Item name="notas" style={{ marginBottom: 0 }} label={<Lbl>Notas internas</Lbl>}>
                          <Input.TextArea rows={1} placeholder="Instrucciones de entrega, referencia interna..." style={{ resize: 'none' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </Form.Item>

                {/* Alertas contextuales */}
                {hayAlertas && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {tipoNcf === 'E31' && clienteSeleccionado && !mostrarAlertaRNC && (
                      <div style={{ padding: '8px 12px', background: D.primaryBg, borderRadius: D.radiusSm,
                        border: `1px solid ${D.primaryBorder}`, fontSize: 12, color: D.primary }}>
                        <strong>RNC:</strong> {clienteSeleccionado.rfc || 'No registrado'} · <strong>Razón social:</strong> {clienteSeleccionado.nombre}
                      </div>
                    )}
                    {mostrarAlertaRNC && <Alert type="warning" showIcon style={{ borderRadius: D.radiusSm }}
                      message="Cliente sin RNC válido (9 dígitos). E31 requiere RNC registrado en DGII." />}
                    {mostrarAlertaExento && <Alert type="info" showIcon style={{ borderRadius: D.radiusSm }}
                      message={tipoNcf === 'E44'
                        ? 'E44 Zona Franca: ITBIS = 0. Requiere documentación de régimen especial.'
                        : 'E45 Gubernamental: entidad del gobierno. RNC requerido.'} />}
                    {mostrarAlertaExportacion && <Alert type="info" showIcon style={{ borderRadius: D.radiusSm }}
                      message="E46 Exportación: ITBIS = 0. Si es moneda extranjera, completa la tasa de cambio." />}
                    {mostrarAlertaPagoExterior && <Alert type="info" showIcon style={{ borderRadius: D.radiusSm }}
                      message="E47 Pagos al Exterior: proveedores extranjeros sin establecimiento en RD." />}
                    {mostrarAlertaE41 && <Alert type="warning" showIcon style={{ borderRadius: D.radiusSm }}
                      message="E41 Comprobante de Compras: proveedor informal solo cédula. Anotar cédula en notas." />}
                  </div>
                )}
              </div>
            </div>

            {/* ── BLOQUE 2: Productos ────────────────────────────────────── */}
            <div style={cardStyle}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${D.border}`,
                display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: D.text, flex: 1 }}>Líneas de factura</span>
                <Space size={6}>
                  <Button type="primary" size="small" icon={<PlusOutlined />}
                    onClick={() => setLineas([...lineas, lineaVacia()])}
                    style={{ borderRadius: D.radiusSm, height: 32, fontWeight: 600 }}>
                    Agregar
                  </Button>
                  <Tooltip title="Escanear código de barras (próximamente)">
                    <Button size="small" icon={<BarcodeOutlined />}
                      style={{ borderRadius: D.radiusSm, height: 32 }} disabled>
                      Escanear
                    </Button>
                  </Tooltip>
                  <Tooltip title="Importar desde archivo (próximamente)">
                    <Button size="small" icon={<FileOutlined />}
                      style={{ borderRadius: D.radiusSm, height: 32 }} disabled>
                      Importar
                    </Button>
                  </Tooltip>
                </Space>
              </div>

              <Table columns={lineaCols as any} dataSource={lineas} rowKey="key"
                pagination={false} size="small" tableLayout="fixed"
                style={{ borderRadius: 0 }}
                onRow={() => ({
                  style: { transition: 'background 0.12s' },
                  onMouseEnter: (e) => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; },
                  onMouseLeave: (e) => { (e.currentTarget as HTMLElement).style.background = ''; },
                })} />

              <div style={{ padding: '10px 20px', borderTop: `1px dashed ${D.border}`, cursor: 'pointer' }}
                onClick={() => setLineas([...lineas, lineaVacia()])}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                <span style={{ color: D.primary, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PlusOutlined style={{ fontSize: 11 }} />
                  Agregar línea
                  <span style={{ color: D.textTer, fontSize: 11 }}>· o presiona Enter</span>
                </span>
              </div>
            </div>

            {/* ── Descuento general ─────────────────────────────────────── */}
            <div style={{ ...cardStyle, padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: D.text, whiteSpace: 'nowrap' }}>Descuento general</span>
                <Space.Compact>
                  <Select value={descGeneralTipo} style={{ width: 160 }}
                    onChange={v => { setDescGeneralTipo(v as 'monto' | 'porcentaje'); setDescGeneralValor(0); }}>
                    <Select.Option value="monto">Monto fijo (RD$)</Select.Option>
                    <Select.Option value="porcentaje">Porcentaje (%)</Select.Option>
                  </Select>
                  <InputNumber min={0} precision={2}
                    max={descGeneralTipo === 'porcentaje' ? 100 : undefined}
                    value={descGeneralValor} onChange={v => setDescGeneralValor(v ?? 0)}
                    style={{ width: 140 }}
                    placeholder={descGeneralTipo === 'porcentaje' ? '0.00 %' : '0.00 RD$'} />
                </Space.Compact>
                {descGeneral > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: D.orange }}>
                    − {fmt.money(descGeneral)}
                  </span>
                )}
              </div>
            </div>

            {/* ── Formas de pago múltiples ──────────────────────────────── */}
            <div style={cardStyle}>
              <div style={{ padding: '14px 20px', borderBottom: formasPago.length > 0 ? `1px solid ${D.border}` : 'none',
                display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: D.text }}>Formas de pago</span>
                  <span style={{ fontSize: 11, color: D.textTer, marginLeft: 8 }}>opcional — desglose de cómo se recibe el pago</span>
                </div>
                <Button size="small" icon={<PlusOutlined />}
                  onClick={() => setFormasPago([...formasPago, { tipo: 1, monto: 0 }])}
                  style={{ borderRadius: D.radiusSm }}>
                  Agregar
                </Button>
              </div>

              {formasPago.length > 0 && (
                <div style={{ padding: '14px 20px' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {formasPago.map((fp, idx) => (
                      <Row key={idx} gutter={[8, 0]} align="middle">
                        <Col xs={24} sm={9}>
                          <Select value={fp.tipo} style={{ width: '100%' }}
                            onChange={v => { const u = [...formasPago]; u[idx].tipo = v; setFormasPago(u); }}>
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
                            onChange={v => { const u = [...formasPago]; u[idx].monto = v ?? 0; setFormasPago(u); }} />
                        </Col>
                        <Col xs={10} sm={7}>
                          <Input value={fp.referencia ?? ''} placeholder="Ref. # transacción..."
                            onChange={e => { const u = [...formasPago]; u[idx].referencia = e.target.value; setFormasPago(u); }} />
                        </Col>
                        <Col xs={2} sm={2}>
                          <Button type="text" danger icon={<DeleteOutlined />}
                            onClick={() => setFormasPago(formasPago.filter((_, i) => i !== idx))} />
                        </Col>
                      </Row>
                    ))}
                    {(() => {
                      const sumaFP = r2(formasPago.reduce((s, fp) => s + fp.monto, 0));
                      const diff   = r2(Math.abs(sumaFP - total));
                      if (diff > 0.01 && sumaFP > 0) return (
                        <Alert type="warning" showIcon style={{ borderRadius: D.radiusSm, fontSize: 12 }}
                          message={`La suma (${fmt.money(sumaFP)}) no coincide con el total (${fmt.money(total)}) — diferencia: ${fmt.money(diff)}`} />
                      );
                      if (sumaFP > 0 && diff <= 0.01) return (
                        <div style={{ fontSize: 12, color: D.green, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircleOutlined /> Suma cuadra con el total
                        </div>
                      );
                      return null;
                    })()}
                  </Space>
                </div>
              )}
            </div>

            {/* ── Retenciones E31 ───────────────────────────────────────── */}
            {tipoNcf === 'E31' && (
              <div style={{ ...cardStyle, padding: '16px 20px' }}>
                <Checkbox checked={aplicaRetenciones}
                  onChange={e => {
                    setAplicaRetenciones(e.target.checked);
                    if (!e.target.checked) { setRetieneItbis(false); setRetieneIsr(false); }
                  }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Aplica Retenciones</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: D.textSec }}>(agente de retención DGII)</span>
                </Checkbox>
                {aplicaRetenciones && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: D.orangeBg,
                    borderRadius: D.radiusSm, border: `1px solid ${D.orangeBorder}` }}>
                    <Row gutter={[24, 8]}>
                      <Col xs={24} sm={12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <Checkbox checked={retieneItbis} onChange={e => setRetieneItbis(e.target.checked)}>Retener ITBIS</Checkbox>
                          {retieneItbis && <InputNumber min={0} max={100} precision={2} value={pctRetItbis}
                            onChange={v => setPctRetItbis(v ?? 30)} addonAfter="%" style={{ width: 110 }} />}
                        </div>
                        {retieneItbis && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Monto: <Text strong style={{ color: D.orange }}>-{fmt.money(montoRetItbisForm)}</Text>
                            &nbsp;({pctRetItbis}% de {fmt.money(ivaTotal)})
                          </Text>
                        )}
                      </Col>
                      <Col xs={24} sm={12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <Checkbox checked={retieneIsr} onChange={e => setRetieneIsr(e.target.checked)}>Retener ISR</Checkbox>
                          {retieneIsr && <InputNumber min={0} max={100} precision={2} value={pctRetIsr}
                            onChange={v => setPctRetIsr(v ?? 10)} addonAfter="%" style={{ width: 110 }} />}
                        </div>
                        {retieneIsr && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Monto: <Text strong style={{ color: D.orange }}>-{fmt.money(montoRetIsrForm)}</Text>
                            &nbsp;({pctRetIsr}% de {fmt.money(baseGravable)})
                          </Text>
                        )}
                      </Col>
                    </Row>
                  </div>
                )}
              </div>
            )}

            {/* Spacer bottom */}
            <div style={{ height: 32 }} />
          </div>

          {/* ══════════════════════════════════════════════════════════════
              RIGHT SIDEBAR — sticky totals + actions
          ══════════════════════════════════════════════════════════════ */}
          <div style={{ width: 300, position: 'sticky', top: 72, alignSelf: 'flex-start', flexShrink: 0 }}>

            {/* Totales card */}
            <div style={{ background: D.card, borderRadius: D.radius, border: `1px solid ${D.border}`,
              boxShadow: D.shadowLg, overflow: 'hidden', marginBottom: 12 }}>

              <div style={{ padding: '12px 18px', background: D.bg, borderBottom: `1px solid ${D.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: D.textSec, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Resumen
                </span>
              </div>

              <div style={{ padding: '16px 18px' }}>
                {/* Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: D.textSec }}>Subtotal bruto</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt.money(subtotalBruto)}</span>
                  </div>
                  {totalDescLineas > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: D.textSec }}>(-) Descuentos línea</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: D.orange }}>-{fmt.money(totalDescLineas)}</span>
                    </div>
                  )}
                  {descGeneral > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: D.textSec }}>
                        (-) Desc. general{descGeneralTipo === 'porcentaje' ? ` (${descGeneralValor}%)` : ''}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: D.orange }}>-{fmt.money(descGeneral)}</span>
                    </div>
                  )}
                  {(totalDescLineas > 0 || descGeneral > 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: D.textSec }}>Base gravable</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt.money(baseGravable)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: D.textSec }}>ITBIS</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt.money(ivaTotal)}</span>
                  </div>
                  {montoRetItbisForm > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: D.textSec }}>(-) Ret. ITBIS ({pctRetItbis}%)</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: D.orange }}>-{fmt.money(montoRetItbisForm)}</span>
                    </div>
                  )}
                  {montoRetIsrForm > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: D.textSec }}>(-) Ret. ISR ({pctRetIsr}%)</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: D.orange }}>-{fmt.money(montoRetIsrForm)}</span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ margin: '14px 0', height: 1, background: D.border }} />

                {/* Total grande */}
                <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: D.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    {(montoRetItbisForm > 0 || montoRetIsrForm > 0) ? 'Total factura' : 'Total a pagar'}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: D.primary, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: D.font }}>
                    {fmt.money(total)}
                  </div>
                  {(montoRetItbisForm > 0 || montoRetIsrForm > 0) && (
                    <div style={{ marginTop: 10, fontSize: 14, color: D.green, fontWeight: 700 }}>
                      Neto a cobrar: {fmt.money(netoCobrarForm)}
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {tipoInfo && (
                    <span style={{ background: `${tipoInfo.color}18`, color: tipoInfo.color, fontSize: 11,
                      fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                      border: `1px solid ${tipoInfo.color}40`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <SafetyCertificateOutlined style={{ fontSize: 10 }} />
                      {tipoInfo.codigo}
                    </span>
                  )}
                  <span style={{ background: tipoPago === 'CONTADO' ? D.greenBg : D.orangeBg,
                    color: tipoPago === 'CONTADO' ? D.green : D.orange, fontSize: 11, fontWeight: 600,
                    padding: '3px 8px', borderRadius: 99,
                    border: `1px solid ${tipoPago === 'CONTADO' ? D.greenBorder : D.orangeBorder}` }}>
                    {tipoPago === 'CONTADO' ? '💵 Contado' : `📋 Crédito ${diasCredito}d`}
                  </span>
                </div>
              </div>
            </div>

            {/* Acciones card */}
            <div style={{ background: D.card, borderRadius: D.radius, border: `1px solid ${D.border}`,
              boxShadow: D.shadow, padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Primary: Crear / Guardar */}
                <Button type="primary" htmlType="submit" block size="large"
                  icon={<FileTextOutlined />}
                  loading={editMode ? updateMut.isPending : createMut.isPending}
                  style={{ height: 46, fontSize: 14, fontWeight: 700, borderRadius: D.radiusSm,
                    background: D.primary, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                  {editMode ? 'Guardar cambios' : 'Crear Factura'}
                </Button>

                {/* Secondary grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Tooltip title={editMode ? 'Guardar cambios (F9)' : 'Crear como borrador (F9)'}>
                    <Button block icon={<SaveOutlined />} onClick={() => form.submit()}
                      style={{ borderRadius: D.radiusSm, height: 36, fontSize: 12 }}>
                      Borrador
                    </Button>
                  </Tooltip>
                  <Tooltip title={editMode ? 'Abrir vista previa HTML' : 'Disponible tras crear'}>
                    <Button block icon={<EyeOutlined />} disabled={!editMode}
                      onClick={() => editMode && openPreview()}
                      style={{ borderRadius: D.radiusSm, height: 36, fontSize: 12 }}>
                      Preview
                    </Button>
                  </Tooltip>
                  <Tooltip title="Disponible tras crear la factura">
                    <Button block icon={<PrinterOutlined />} disabled
                      style={{ borderRadius: D.radiusSm, height: 36, fontSize: 12 }}>
                      Imprimir
                    </Button>
                  </Tooltip>
                  <Tooltip title="Disponible tras crear la factura">
                    <Button block icon={<MailOutlined />} disabled
                      style={{ borderRadius: D.radiusSm, height: 36, fontSize: 12 }}>
                      Email
                    </Button>
                  </Tooltip>
                </div>

                <Tooltip title="Disponible tras crear la factura">
                  <Button block icon={<CreditCardOutlined />} disabled
                    style={{ borderRadius: D.radiusSm, height: 38, fontSize: 13,
                      borderColor: D.green, color: D.green }}>
                    Facturar y cobrar (F8)
                  </Button>
                </Tooltip>

                <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 8, marginTop: 2 }}>
                  <Button block onClick={() => navigate('/facturas')}
                    style={{ borderRadius: D.radiusSm, height: 34, fontSize: 12, color: D.textSec }}>
                    Cancelar (ESC)
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </Form>

      {/* ── Modal: aplicar anticipo ─────────────────────────────────────── */}
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
