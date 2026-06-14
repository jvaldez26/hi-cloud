import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert, Modal, theme, Spin, Checkbox } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { facturasApi, type FacturaDetallePayload } from '../../api/facturas.api';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { fmt } from '../../utils/formatters';
import { TIPOS_NCF } from '../../components/ui/NCFSelector';
import type { Cliente } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface LineaForm {
  key: string;
  productoId?: number;
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
}

// Tipos NCF disponibles en el módulo de Facturas.
const NCF_VENTAS = ['E31', 'E32', 'E41', 'E44', 'E45', 'E46', 'E47'];

export default function FacturaFormPage() {
  const { token } = theme.useToken();
  const { id }    = useParams<{ id?: string }>();
  const editMode  = !!id;

  const [form]     = Form.useForm();
  const [lineas,   setLineas]   = useState<LineaForm[]>([
    { key: '1', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 },
  ]);
  const [tipoNcf,     setTipoNcf]     = useState('E32');
  const [tipoPago,    setTipoPago]    = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [diasCredito, setDiasCredito] = useState(30);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
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

  // ── Datos base ──────────────────────────────────────────────────────────────
  const { data: clientes } = useQuery({
    queryKey: ['clientes-sel'],
    queryFn:  () => clientesApi.list(1, 100),
  });

  const { data: productos } = useQuery({
    queryKey: ['productos-sel'],
    queryFn:  () => productosApi.list(1, 200),
  });

  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const { data: vendedores = [] } = useQuery<any[]>({
    queryKey: ['vendedores-sel'],
    queryFn:  () => api.get('/vendedores').then((r: any) => r.data?.data?.data ?? r.data?.data ?? []),
  });
  const { data: sucursales = [] } = useQuery<any[]>({ queryKey: ['mis-sucursales'], queryFn: () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []) });

  // ── Carga de factura existente (modo edición) ──────────────────────────────
  const { data: facturaEdit, isLoading: loadingEdit } = useQuery({
    queryKey: ['factura-edit', id],
    queryFn:  () => facturasApi.getOne(Number(id)),
    enabled:  editMode,
    staleTime: 0,
  });

  // Poblar formulario cuando la factura cargue
  useEffect(() => {
    if (!facturaEdit) return;

    // Cabecera
    form.setFieldsValue({
      clienteId:  (facturaEdit as any).clienteId,
      fecha:      dayjs((facturaEdit as any).fecha),
      notas:      (facturaEdit as any).notas,
      vendedorId: (facturaEdit as any).vendedorId,
      moneda:     (facturaEdit as any).moneda ?? 'DOP',
      tipoCambio: (facturaEdit as any).tipoCambio,
      sucursalId: (facturaEdit as any).sucursalId,
    });

    // Estados controlados
    setTipoNcf((facturaEdit as any).tipoNcf ?? 'E32');
    setTipoPago(((facturaEdit as any).tipoPago ?? 'CONTADO') as 'CONTADO' | 'CREDITO');
    setDiasCredito(Number((facturaEdit as any).diasCredito ?? 30));

    // Líneas
    const detallesCargados: any[] = (facturaEdit as any).detalles ?? [];
    if (detallesCargados.length > 0) {
      setLineas(detallesCargados.map((d: any, i: number) => ({
        key: String(i + 1),
        productoId:     d.productoId,
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        porcentajeIva:  Number(d.porcentajeIva ?? 18),
      })));
    }
  }, [facturaEdit, form]);

  // Auto-seleccionar sucursal en modo creación
  useEffect(() => {
    if (editMode) return;
    if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual, editMode]);

  // Poblar clienteSeleccionado cuando ambos datos estén disponibles
  useEffect(() => {
    if (!facturaEdit || !clientes?.data) return;
    const cli = clientes.data.find((c: Cliente) => c.id === (facturaEdit as any).clienteId) ?? null;
    setClienteSeleccionado(cli);
  }, [facturaEdit, clientes?.data]);

  // ── Mutaciones ──────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: facturasApi.create,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      message.success('Factura creada exitosamente');
      const facturaId  = res?.data?.data?.id ?? res?.data?.id ?? res?.id;
      const clienteId  = form.getFieldValue('clienteId');
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

  // Anticipos activos del cliente (solo en modo creación)
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

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const iva      = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeIva / 100), 0);
  const total    = subtotal + iva;

  // Cálculo retenciones E31
  const montoRetItbisForm  = (tipoNcf === 'E31' && aplicaRetenciones && retieneItbis) ? Number((iva  * pctRetItbis / 100).toFixed(2)) : 0;
  const montoRetIsrForm    = (tipoNcf === 'E31' && aplicaRetenciones && retieneIsr)   ? Number((subtotal * pctRetIsr   / 100).toFixed(2)) : 0;
  const netoCobrarForm     = Number((total - montoRetItbisForm - montoRetIsrForm).toFixed(2));

  // ── Handlers ────────────────────────────────────────────────────────────────
  const onClienteChange = (clienteId: number) => {
    const cli = clientes?.data.find((c: Cliente) => c.id === clienteId) ?? null;
    setClienteSeleccionado(cli);
    if ((cli as any)?.diasCredito > 0) setDiasCredito((cli as any).diasCredito);

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
      // Retenciones E31
      ...(tipoNcf === 'E31' && aplicaRetenciones ? {
        aplicaRetenciones: true,
        retieneItbis,
        porcentajeRetencionItbis: pctRetItbis,
        retieneIsr,
        porcentajeRetencionIsr:   pctRetIsr,
      } : {}),
    } as any;

    if (editMode) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  // ── Alertas contextuales ────────────────────────────────────────────────────
  const tipoInfo = TIPOS_NCF.find(t => t.codigo === tipoNcf);
  const mostrarAlertaRNC          = tipoNcf === 'E31' && clienteSeleccionado && !(/^\d{9}$/.test(clienteSeleccionado?.rfc?.trim() ?? ''));
  const mostrarAlertaExportacion  = tipoNcf === 'E46' && clienteSeleccionado;
  const mostrarAlertaPagoExterior = tipoNcf === 'E47';
  const mostrarAlertaExento       = (tipoNcf === 'E44' || tipoNcf === 'E45') && clienteSeleccionado;
  const mostrarAlertaE41          = tipoNcf === 'E41';

  // ── Columnas de la tabla de líneas ──────────────────────────────────────────
  const lineaCols = [
    {
      title: 'Producto', key: 'producto', width: 220,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <Select style={{ width: '100%' }} placeholder="Seleccionar..." showSearch
          value={r.productoId}
          filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
          options={productos?.data.map(p => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }))}
          onChange={(v) => onProductoChange(v, idx)} />
      ),
    },
    {
      title: 'Descripción', key: 'desc', width: 180,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <Input value={r.descripcion}
          onChange={e => { const u = [...lineas]; u[idx].descripcion = e.target.value; setLineas(u); }} />
      ),
    },
    {
      title: 'Cantidad', key: 'qty', width: 90,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={1} precision={0} value={r.cantidad} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].cantidad = v ?? 1; setLineas(u); }} />
      ),
    },
    {
      title: 'Precio (RD$)', key: 'price', width: 130,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} precision={2} value={r.precioUnitario} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].precioUnitario = v ?? 0; setLineas(u); }} />
      ),
    },
    {
      title: 'ITBIS %', key: 'iva', width: 80,
      render: (_: unknown, r: LineaForm, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeIva} style={{ width: '100%' }}
          onChange={v => { const u = [...lineas]; u[idx].porcentajeIva = v ?? 18; setLineas(u); }} />
      ),
    },
    {
      title: 'Subtotal', key: 'sub', width: 120,
      render: (_: unknown, r: LineaForm) => (
        <Text strong>{fmt.money(r.precioUnitario * r.cantidad)}</Text>
      ),
    },
    {
      title: '', key: 'del', width: 50,
      render: (_: unknown, _r: LineaForm, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />}
          onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────
  if (editMode && loadingEdit) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" tip="Cargando factura..." />
      </div>
    );
  }

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/facturas')}>
          Volver
        </Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>
          {editMode ? `Editar Factura — ${(facturaEdit as any)?.folio ?? ''}` : 'Nueva Factura'}
        </Title>
        {editMode && (
          <Tag color="orange" style={{ marginLeft: 12, fontSize: 12 }}>BORRADOR</Tag>
        )}
      </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ fecha: dayjs(), moneda: 'DOP' }}>

        {/* ── Datos generales + Tipo de comprobante ──────────────────────── */}
        <Card style={{ marginBottom: 16 }}>

          {/* Fila 1: Tipo de comprobante · Cliente · Fecha */}
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                label={
                  <span>
                    <SafetyCertificateOutlined style={{ color: tipoInfo?.color, marginRight: 5 }} />
                    Tipo de comprobante <span style={{ color: 'red' }}>*</span>
                  </span>
                }
              >
                <Select
                  value={tipoNcf}
                  onChange={setTipoNcf}
                  optionLabelProp="label"
                  popupMatchSelectWidth={false}
                  dropdownStyle={{ minWidth: 300 }}
                >
                  {TIPOS_NCF.filter(t => NCF_VENTAS.includes(t.codigo)).map(t => (
                    <Select.Option key={t.codigo} value={t.codigo} label={
                      <span>
                        <Tag color={t.color} style={{ fontSize: 11, marginRight: 6, lineHeight: '18px' }}>
                          {t.codigo}
                        </Tag>
                        {t.titulo}
                      </span>
                    }>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={t.color} style={{ fontSize: 11, lineHeight: '18px', flexShrink: 0 }}>
                          {t.codigo}
                        </Tag>
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

            <Col xs={24} sm={10}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch placeholder="Buscar cliente..."
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map((c: Cliente) => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))}
                  onChange={onClienteChange} />
              </Form.Item>
              {!editMode && anticiposCliente.length > 0 && (
                <Alert
                  type="info" showIcon
                  style={{ marginTop: -8, marginBottom: 8, fontSize: 12 }}
                  message={`Este cliente tiene ${anticiposCliente.length} anticipo${anticiposCliente.length > 1 ? 's' : ''} activo${anticiposCliente.length > 1 ? 's' : ''} — saldo disponible: RD$ ${anticiposCliente.reduce((s: number, a: any) => s + Number(a.montoPendiente ?? 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}
                />
              )}
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={sucursales.length > 1 ? 5 : 8}>
              <Form.Item name="vendedorId" label="Vendedor">
                <Select allowClear showSearch placeholder="Sin vendedor asignado"
                  optionFilterProp="label"
                  options={vendedores.map((v: any) => ({
                    value: v.id,
                    label: v.codigo ? `${v.codigo} — ${v.nombre}` : v.nombre,
                  }))} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} style={{ display: sucursales.length > 1 ? undefined : 'none' }}>
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: sucursales.length > 1, message: 'Selecciona una sucursal' }]}>
                <Select placeholder="Seleccionar sucursal" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
          </Row>

          {/* ── Forma de pago ──────────────────────────────────────────── */}
          <Row gutter={16} style={{ marginBottom: 4 }}>
            <Col xs={24} sm={8}>
              <Form.Item label="Forma de pago">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['CONTADO', 'CREDITO'] as const).map(tp => (
                    <button key={tp} type="button" onClick={() => setTipoPago(tp)}
                      style={{
                        flex: 1, height: 32, borderRadius: 6, cursor: 'pointer',
                        border: tipoPago === tp ? `1.5px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                        background: tipoPago === tp ? token.colorPrimaryBg : token.colorBgContainer,
                        color: tipoPago === tp ? token.colorPrimary : token.colorTextSecondary,
                        fontWeight: tipoPago === tp ? 700 : 400, fontSize: 13,
                      }}>
                      {tp === 'CONTADO' ? '💵 Contado' : '📋 Crédito'}
                    </button>
                  ))}
                </div>
              </Form.Item>
            </Col>
            {tipoPago === 'CREDITO' && (
              <Col xs={24} sm={8}>
                <Form.Item label="Días de crédito">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InputNumber min={1} max={365} value={diasCredito}
                      onChange={v => setDiasCredito(Number(v ?? 30))}
                      style={{ width: 90 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>días</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      · Vence: {dayjs().add(diasCredito, 'day').format('DD/MM/YYYY')}
                    </Text>
                  </div>
                </Form.Item>
              </Col>
            )}
          </Row>

          <Row gutter={16}>
            <Col xs={12} sm={8}>
              <Form.Item name="moneda" label="Moneda" initialValue="DOP">
                <Select>
                  <Select.Option value="DOP">🇩🇴 DOP — Peso Dominicano</Select.Option>
                  <Select.Option value="USD">🇺🇸 USD — Dólar</Select.Option>
                  <Select.Option value="EUR">🇪🇺 EUR — Euro</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Form.Item noStyle dependencies={['moneda']}>
              {({ getFieldValue }) => getFieldValue('moneda') !== 'DOP' && (
                <Col xs={12} sm={8}>
                  <Form.Item name="tipoCambio" label="Tasa de Cambio (RD$)" rules={[{ required: true }]}>
                    <InputNumber min={0.01} precision={4} style={{ width: '100%' }} placeholder="Ej: 58.50" />
                  </Form.Item>
                </Col>
              )}
            </Form.Item>
            <Col xs={24} sm={16}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={1} placeholder="Referencia, orden de compra, etc." />
              </Form.Item>
            </Col>
          </Row>

          {/* ── Alertas contextuales ────────────────────────────────────── */}
          {mostrarAlertaRNC && (
            <Alert style={{ marginTop: 4 }} type="warning" showIcon
              message="El cliente seleccionado no tiene RNC registrado. E31 (Crédito Fiscal) requiere RNC válido de 9 dígitos (empresa) u 11 dígitos (cédula)." />
          )}
          {tipoNcf === 'E31' && clienteSeleccionado && !mostrarAlertaRNC && (
            <div style={{ marginTop: 4, padding: '6px 12px', background: token.colorInfoBg, borderRadius: 8, border: `1px solid ${token.colorInfoBorder}` }}>
              <Text style={{ fontSize: 12, color: token.colorInfoText }}>
                <strong>RNC del cliente:</strong> {clienteSeleccionado.rfc || 'No registrado'}
                {' · '}
                <strong>Nombre:</strong> {clienteSeleccionado.nombre}
              </Text>
            </div>
          )}
          {mostrarAlertaExento && (
            <Alert style={{ marginTop: 4 }} type="info" showIcon
              message={tipoNcf === 'E44'
                ? 'E44 Régimen Especial (Zona Franca): el ITBIS será 0. Asegúrese de tener la documentación de régimen especial.'
                : 'E45 Gubernamental: factura a entidad del gobierno dominicano. RNC de la entidad requerido.'} />
          )}
          {mostrarAlertaExportacion && (
            <Alert style={{ marginTop: 4 }} type="info" showIcon
              message="E46 Exportación: el ITBIS será 0 (exento). Si la venta es en moneda extranjera, seleccione la moneda y tipo de cambio abajo." />
          )}
          {mostrarAlertaPagoExterior && (
            <Alert style={{ marginTop: 4 }} type="info" showIcon
              message="E47 Pagos al Exterior: para pagos a proveedores extranjeros sin establecimiento permanente en RD. ITBIS exento." />
          )}
          {mostrarAlertaE41 && (
            <Alert style={{ marginTop: 4 }} type="warning" showIcon
              message="E41 Comprobante de Compras: para proveedores informales (solo cédula, sin RNC). El ITBIS aplica y se retiene el 30%. Ingresa la cédula del proveedor en el campo de notas." />
          )}
        </Card>

        {/* ── Líneas de detalle ──────────────────────────────────────────── */}
        <Card title="Líneas de factura" style={{ marginBottom: 16 }}
          extra={
            <Button icon={<PlusOutlined />}
              onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }])}>
              Agregar línea
            </Button>
          }>
          <Table columns={lineaCols as any} dataSource={lineas} rowKey="key"
            pagination={false} size="small" scroll={{ x: 'max-content' }} />
        </Card>

        {/* ── Retenciones E31 ─────────────────────────────────────────── */}
        {tipoNcf === 'E31' && (
          <Card style={{ marginBottom: 16 }}>
            <Checkbox
              checked={aplicaRetenciones}
              onChange={e => { setAplicaRetenciones(e.target.checked); if (!e.target.checked) { setRetieneItbis(false); setRetieneIsr(false); } }}>
              <Text strong>Aplica Retenciones</Text>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>(agente de retención DGII)</Text>
            </Checkbox>
            {aplicaRetenciones && (
              <div style={{ marginTop: 12, padding: '12px 16px', background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8 }}>
                <Row gutter={[24, 8]}>
                  <Col xs={24} sm={12}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
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
                        &nbsp;({pctRetItbis}% de {fmt.money(iva)})
                      </Text>
                    )}
                  </Col>
                  <Col xs={24} sm={12}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
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
                        &nbsp;({pctRetIsr}% de {fmt.money(subtotal)})
                      </Text>
                    )}
                  </Col>
                </Row>
              </div>
            )}
          </Card>
        )}

        {/* ── Totales ────────────────────────────────────────────────────── */}
        <Card>
          <Row justify="end">
            <Col xs={24} sm={14} md={9}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Row justify="space-between">
                  <Text type="secondary">Subtotal</Text>
                  <Text strong>{fmt.money(subtotal)}</Text>
                </Row>
                <Row justify="space-between">
                  <Text type="secondary">ITBIS</Text>
                  <Text strong>{fmt.money(iva)}</Text>
                </Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row justify="space-between" style={{ marginBottom: 4 }}>
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
                    <Divider style={{ margin: '6px 0' }} />
                    <Row justify="space-between" style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>NETO A COBRAR</Text>
                      <Text strong style={{ fontSize: 18, color: '#059669' }}>{fmt.money(netoCobrarForm)}</Text>
                    </Row>
                  </>
                )}

                {/* Comprobante seleccionado */}
                {tipoInfo && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: `${tipoInfo.color}10`,
                    border: `1px solid ${tipoInfo.color}40`,
                    marginBottom: 8,
                  }}>
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

      {/* ── Modal: aplicar anticipo (solo modo creación) ───────────────── */}
      {!editMode && (
        <Modal
          title="¿Deseas aplicar un anticipo disponible?"
          open={!!modalAnticipo}
          onCancel={() => { setModalAnticipo(null); navigate('/facturas'); }}
          onOk={() => formAnticipo.submit()}
          confirmLoading={aplicarAnticipoMut.isPending}
          okText="Aplicar anticipo"
          cancelText="Omitir"
          width={480}
          destroyOnClose
        >
          <Alert type="success" showIcon message="Factura creada correctamente" style={{ marginBottom: 16 }} />
          <p style={{ color: token.colorTextSecondary, fontSize: 13, marginBottom: 16 }}>
            Este cliente tiene anticipos disponibles. Puedes aplicarlos ahora para reducir el saldo pendiente de esta factura.
          </p>
          <Form
            form={formAnticipo}
            layout="vertical"
            onFinish={v => {
              if (!modalAnticipo) return;
              aplicarAnticipoMut.mutate({
                anticipoId: v.anticipoId,
                cxcId:      v.cxcId,
                monto:      Number(v.monto),
              });
            }}
          >
            <Form.Item name="anticipoId" label="Anticipo a aplicar" rules={[{ required: true }]}>
              <Select placeholder="Seleccionar anticipo">
                {anticiposCliente.map((a: any) => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.numero} — Disponible: RD$ {Number(a.montoPendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="cxcId" label="Aplicar a (CxC de la factura)" rules={[{ required: true }]}>
              <Select placeholder="Seleccionar CxC" notFoundContent="Cargando...">
                {cxcFactura.map((c: any) => (
                  <Select.Option key={c.id} value={c.id}>
                    {c.factura?.folio ?? c.factura?.numero ?? `CxC #${c.id}`} — Pendiente: RD$ {Number(c.montoPendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
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
