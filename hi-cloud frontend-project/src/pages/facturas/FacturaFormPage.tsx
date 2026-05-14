import { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { facturasApi, type FacturaDetallePayload } from '../../api/facturas.api';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import NCFSelector, { TIPOS_NCF } from '../../components/ui/NCFSelector';
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
// E33 → usa el módulo Notas de Débito (tiene flujo propio con referencia a factura origen)
// E34 → usa el módulo Devoluciones (generado automáticamente)
// E41 → Comprobante de Compras para proveedor informal (cédula, sin RNC)
// E47 → Pagos al Exterior (proveedor extranjero sin establecimiento en RD)
const NCF_VENTAS = ['E31', 'E32', 'E41', 'E44', 'E45', 'E46', 'E47'];

export default function FacturaFormPage() {
  const [form]     = Form.useForm();
  const [lineas,   setLineas]   = useState<LineaForm[]>([
    { key: '1', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 },
  ]);
  const [tipoNcf,     setTipoNcf]     = useState('E32');
  const [tipoPago,    setTipoPago]    = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [diasCredito, setDiasCredito] = useState(30);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: clientes } = useQuery({
    queryKey: ['clientes-sel'],
    queryFn:  () => clientesApi.list(1, 100),
  });

  const { data: productos } = useQuery({
    queryKey: ['productos-sel'],
    queryFn:  () => productosApi.list(1, 200),
  });

  const { data: vendedores = [] } = useQuery<any[]>({
    queryKey: ['vendedores-sel'],
    queryFn:  () => api.get('/vendedores').then((r: any) => r.data?.data?.data ?? r.data?.data ?? []),
  });

  const createMut = useMutation({
    mutationFn: facturasApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      message.success('Factura creada exitosamente');
      navigate('/facturas');
    },
    onError: (e: unknown) => {
      const msg = (e as any)?.response?.data?.errors?.[0] ?? 'Error';
      message.error(msg);
    },
  });

  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const iva      = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeIva / 100), 0);
  const total    = subtotal + iva;

  // Auto-selección NCF al cambiar cliente (según TipoClienteECF)
  const onClienteChange = (clienteId: number) => {
    const cli = clientes?.data.find((c: Cliente) => c.id === clienteId) ?? null;
    setClienteSeleccionado(cli);
    // Auto-poblar días de crédito desde el cliente (si tiene) o default empresa
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

    // Si tipoCliente sugiere E31 pero no tiene RNC, usar E32
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

  const handleSubmit = (values: { clienteId: number; fecha: dayjs.Dayjs; notas?: string; vendedorId?: number; moneda?: string; tipoCambio?: number }) => {
    const vendedor = vendedores.find((v: any) => v.id === values.vendedorId);
    const detalles: FacturaDetallePayload[] = lineas.map(l => ({
      productoId:    l.productoId!,
      descripcion:   l.descripcion,
      cantidad:      l.cantidad,
      precioUnitario: l.precioUnitario,
      porcentajeIva: l.porcentajeIva,
    }));
    createMut.mutate({
      clienteId:       values.clienteId,
      fecha:           values.fecha.format('YYYY-MM-DD'),
      detalles,
      tipoNcf,
      notas:           values.notas,
      vendedorId:      values.vendedorId,
      nombreVendedor:  vendedor?.nombre,
      moneda:          values.moneda ?? 'DOP',
      tipoCambio:      values.tipoCambio ?? 1,
      tipoPago,
      diasCredito:     tipoPago === 'CREDITO' ? diasCredito : 0,
    } as any);
  };

  const tipoInfo = TIPOS_NCF.find(t => t.codigo === tipoNcf);
  const mostrarAlertaRNC         = tipoNcf === 'E31' && clienteSeleccionado && !(/^\d{9}$/.test(clienteSeleccionado?.rfc?.trim() ?? ''));
  const mostrarAlertaExportacion = tipoNcf === 'E46' && clienteSeleccionado;
  const mostrarAlertaPagoExterior = tipoNcf === 'E47';
  const mostrarAlertaExento      = (tipoNcf === 'E44' || tipoNcf === 'E45') && clienteSeleccionado;
  const mostrarAlertaE41         = tipoNcf === 'E41';

  const lineaCols = [
    {
      title: 'Producto', key: 'producto', width: 220,
      render: (_: unknown, _r: LineaForm, idx: number) => (
        <Select style={{ width: '100%' }} placeholder="Seleccionar..." showSearch
          filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
          options={productos?.data.map(p => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))}
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

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/facturas')}>
          Volver
        </Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>Nueva Factura</Title>
      </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ fecha: dayjs() }}>

        {/* ── Tipo de comprobante fiscal ──────────────────────────────── */}
        <Card
          size="small"
          style={{ marginBottom: 16, borderColor: tipoInfo?.color, borderWidth: 1.5 }}
          styles={{ body: { padding: '10px 16px' } }}
          title={
            <Space size={6}>
              <SafetyCertificateOutlined style={{ color: tipoInfo?.color, fontSize: 13 }} />
              <Text strong style={{ fontSize: 13 }}>Tipo de Comprobante Fiscal (e-CF DGII)</Text>
              {tipoInfo && (
                <Tag color={tipoInfo.color} style={{ marginLeft: 2, fontSize: 11 }}>
                  {tipoInfo.codigo} · {tipoInfo.titulo}
                </Tag>
              )}
            </Space>
          }
        >
          <NCFSelector
            value={tipoNcf}
            onChange={setTipoNcf}
            filtro={NCF_VENTAS}
            compact
          />

          {mostrarAlertaRNC && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message="El cliente seleccionado no tiene RNC registrado. E31 (Crédito Fiscal) requiere RNC válido de 9 dígitos."
            />
          )}

          {tipoNcf === 'E31' && clienteSeleccionado && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#eff6ff', borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: '#1a56db' }}>
                <strong>RNC del cliente:</strong> {clienteSeleccionado.rfc || 'No registrado'}
                {' · '}
                <strong>Nombre:</strong> {clienteSeleccionado.nombre}
              </Text>
            </div>
          )}

          {mostrarAlertaExento && (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message={
                tipoNcf === 'E44'
                  ? 'E44 Régimen Especial (Zona Franca): el ITBIS será 0. Asegúrese de tener la documentación de régimen especial.'
                  : 'E45 Gubernamental: factura a entidad del gobierno dominicano. RNC de la entidad requerido.'
              }
            />
          )}

          {mostrarAlertaExportacion && (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="E46 Exportación: el ITBIS será 0 (exento). Si la venta es en moneda extranjera, seleccione la moneda y tipo de cambio abajo."
            />
          )}

          {mostrarAlertaPagoExterior && (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="E47 Pagos al Exterior: para pagos a proveedores extranjeros sin establecimiento permanente en RD. ITBIS exento. Se requiere nombre y país del proveedor extranjero."
            />
          )}

          {mostrarAlertaE41 && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message="E41 Comprobante de Compras: para proveedores informales (solo cédula, sin RNC). El ITBIS aplica y se retiene el 30% como agente de retención. Ingresa la cédula del proveedor en el campo de observaciones."
            />
          )}
        </Card>

        {/* ── Datos generales ─────────────────────────────────────────── */}
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={10}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch placeholder="Buscar cliente..."
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map((c: Cliente) => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))}
                  onChange={onClienteChange} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="vendedorId" label="Vendedor">
                <Select
                  allowClear
                  showSearch
                  placeholder="Sin vendedor asignado"
                  optionFilterProp="label"
                  options={vendedores.map((v: any) => ({
                    value: v.id,
                    label: `${v.codigo} — ${v.nombre}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          {/* ── Forma de pago ─────────────────────────────────────────── */}
          <Row gutter={16} style={{ marginBottom: 4 }}>
            <Col xs={24} sm={8}>
              <Form.Item label="Forma de pago">
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['CONTADO', 'CREDITO'] as const).map(tp => (
                    <button key={tp} type="button" onClick={() => setTipoPago(tp)}
                      style={{
                        flex: 1, height: 32, borderRadius: 6, cursor: 'pointer',
                        border: tipoPago === tp ? '1.5px solid #1677ff' : '1px solid #d9d9d9',
                        background: tipoPago === tp ? '#e6f4ff' : '#fff',
                        color: tipoPago === tp ? '#1677ff' : '#555',
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
        </Card>

        {/* ── Líneas de detalle ────────────────────────────────────────── */}
        <Card title="Líneas de factura" style={{ marginBottom: 16 }}
          extra={
            <Button icon={<PlusOutlined />}
              onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }])}>
              Agregar línea
            </Button>
          }>
          <Table columns={lineaCols as any} dataSource={lineas} rowKey="key"
            pagination={false} size="small"
        scroll={{ x: 'max-content' }} />
        </Card>

        {/* ── Totales ──────────────────────────────────────────────────── */}
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
                  <Text style={{ fontSize: 16 }}>Total</Text>
                  <Text strong style={{ fontSize: 20, color: '#1677ff' }}>{fmt.money(total)}</Text>
                </Row>

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
                  loading={createMut.isPending}
                  style={{ height: 48, fontSize: 15 }}>
                  Crear Factura
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
