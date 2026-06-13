import { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert, Checkbox, theme, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { comprasApi, type CompraDetallePayload } from '../../api/compras.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Linea { key: string; productoId?: number; descripcion?: string; cantidad: number; precioUnitario: number; porcentajeItbis: number; }

const fmtMon = (v: number, moneda = 'DOP') => {
  const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'RD$';
  return `${sym} ${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function CompraFormPage() {
  const [form] = Form.useForm();
  const { token } = theme.useToken();
  const [lineas, setLineas] = useState<Linea[]>([{ key: '1', cantidad: 1, precioUnitario: 0, porcentajeItbis: 18 }]);
  const [tipoPago, setTipoPago]         = useState<'contado' | 'credito'>('contado');
  const [diasCredito, setDiasCredito]   = useState(30);
  const [moneda, setMoneda]             = useState<'DOP' | 'USD' | 'EUR'>('DOP');
  const [tipoCambio, setTipoCambio]     = useState<number>(1);
  const [proveedorSelId, setProveedorSelId] = useState<number | null>(null);
  const [retieneItbis, setRetieneItbis] = useState(false);
  const [pctItbis, setPctItbis]         = useState(30);
  const [retieneIsr, setRetieneIsr]     = useState(false);
  const [pctIsr, setPctIsr]             = useState(10);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const defaultAlmacenId = (() => { try { const v = localStorage.getItem('almacenId'); return v ? Number(v) : undefined; } catch { return undefined; } })();
  const [almacenId, setAlmacenId] = useState<number | undefined>(defaultAlmacenId);

  const { data: proveedores } = useQuery({ queryKey: ['proveedores-sel'], queryFn: () => proveedoresApi.list(1, 200) });
  const { data: productos }   = useQuery({ queryKey: ['productos-sel'],   queryFn: () => productosApi.list(1, 200) });
  const { data: almacenes = [] } = useQuery<any[]>({
    queryKey: ['almacenes-sel'],
    queryFn:  () => api.get('/almacenes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  // Detectar si el proveedor seleccionado es informal
  const proveedorSel = (proveedores?.data ?? []).find((p: any) => p.id === proveedorSelId);
  const esInformal   = proveedorSel
    ? (!proveedorSel.rnc || proveedorSel.rnc === '000000000' || (proveedorSel as any).esInformal === true)
    : false;

  const createMut = useMutation({
    mutationFn: comprasApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Compra creada'); navigate('/compras'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear compra'),
  });

  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const itbis    = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeItbis / 100), 0);
  const total    = subtotal + itbis;

  // Cálculo retenciones (solo si informal)
  const montoRetItbis  = (esInformal && retieneItbis) ? Number((itbis  * pctItbis / 100).toFixed(2)) : 0;
  const montoRetIsr    = (esInformal && retieneIsr)   ? Number((subtotal * pctIsr   / 100).toFixed(2)) : 0;
  const netoPagar      = Number((total - montoRetItbis - montoRetIsr).toFixed(2));

  const onProductoChange = (productoId: number, idx: number) => {
    const prod = productos?.data.find(p => p.id === productoId);
    if (!prod) return;
    const updated = [...lineas];
    updated[idx] = { ...updated[idx], productoId, descripcion: prod.nombre, precioUnitario: Number(prod.precio), porcentajeItbis: 18 };
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
    const detalles: CompraDetallePayload[] = lineas.map(l => ({
      productoId: l.productoId!, descripcion: l.descripcion,
      cantidad: l.cantidad, precioUnitario: l.precioUnitario, porcentajeItbis: l.porcentajeItbis,
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
      ...(esInformal && retieneItbis ? { retieneItbis: true, porcentajeRetencionItbis: pctItbis } : {}),
      ...(esInformal && retieneIsr   ? { retieneIsr:   true, porcentajeRetencionIsr:   pctIsr   } : {}),
    } as any);
  };

  const lineaCols = [
    { title: 'Producto', key: 'prod', width: 200,
      render: (_: unknown, _r: Linea, idx: number) => (
        <Select style={{ width: '100%' }} showSearch placeholder="Buscar..."
          filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
          options={productos?.data.map(p => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))}
          onChange={(v) => onProductoChange(v, idx)} />
      )},
    { title: 'Descripción', key: 'desc', width: 170,
      render: (_: unknown, r: Linea, idx: number) => (
        <Input value={r.descripcion} onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
      )},
    { title: 'Cantidad', key: 'qty', width: 90,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber min={1} precision={0} value={r.cantidad} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].cantidad=v??1; setLineas(u); }} />
      )},
    { title: 'Precio', key: 'price', width: 120,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber min={0} precision={2} value={r.precioUnitario} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].precioUnitario=v??0; setLineas(u); }} />
      )},
    { title: 'ITBIS %', key: 'itbis', width: 80,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeItbis} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].porcentajeItbis=v??18; setLineas(u); }} />
      )},
    { title: 'Subtotal', key: 'sub', width: 110, render: (_: unknown, r: Linea) => fmtMon(r.precioUnitario * r.cantidad, moneda) },
    { title: '', key: 'del', width: 50, render: (_: unknown, _r: Linea, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      )},
  ];

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compras')}>Volver</Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>Nueva Orden de Compra</Title>
      </Row>
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ fecha: dayjs() }}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={10}>
              <Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={(proveedores?.data ?? []).map((p: any) => ({
                    value: p.id,
                    label: `${(p as any).rnc || 'Sin RNC'} — ${p.nombre}${(p as any).esInformal ? ' ⚠ Informal' : ''}`,
                  }))}
                  onChange={(v: number) => { setProveedorSelId(v); setRetieneItbis(false); setRetieneIsr(false); }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="numeroFacturaProveedor" label="NCF Proveedor">
                <Input placeholder="B01-00000001" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={7}>
              <Form.Item
                label={
                  <Space size={4}>
                    Almacén destino
                    <Tooltip title="Almacén donde se recibirá la mercancía. Se usa para actualizar el stock por almacén.">
                      <InfoCircleOutlined style={{ color: '#6b7280', fontSize: 13 }} />
                    </Tooltip>
                  </Space>
                }
              >
                <Select
                  allowClear
                  placeholder="Almacén destino..."
                  value={almacenId}
                  onChange={(v) => setAlmacenId(v ?? undefined)}
                  showSearch
                  filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={almacenes.map((a: any) => ({
                    value: a.id,
                    label: a.codigo ? `${a.codigo} — ${a.nombre}` : a.nombre,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={3}>
              <Form.Item label="Moneda">
                <Select value={moneda} onChange={handleMonedaChange} style={{ width: '100%' }}>
                  <Select.Option value="DOP">DOP (Pesos)</Select.Option>
                  <Select.Option value="USD">USD (Dólares)</Select.Option>
                  <Select.Option value="EUR">EUR (Euros)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            {moneda !== 'DOP' && (
              <Col xs={12} sm={3}>
                <Form.Item label={`Tasa (RD$ por ${moneda} 1)`}>
                  <InputNumber
                    value={tipoCambio} min={1} precision={4}
                    style={{ width: '100%' }}
                    onChange={v => setTipoCambio(v ?? 1)}
                    addonBefore="RD$"
                  />
                </Form.Item>
              </Col>
            )}
            <Col xs={12} sm={3}>
              <Form.Item label="Tipo de pago" required>
                <Select value={tipoPago} onChange={v => setTipoPago(v)} style={{ width: '100%' }}>
                  <Select.Option value="contado">Contado</Select.Option>
                  <Select.Option value="credito">Crédito</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            {tipoPago === 'credito' && (
              <Col xs={12} sm={3}>
                <Form.Item label="Días crédito">
                  <InputNumber min={1} max={365} value={diasCredito}
                    onChange={v => setDiasCredito(v ?? 30)} style={{ width: '100%' }} addonAfter="días" />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={4}>
              <Form.Item name="notas" label="Notas"><Input.TextArea rows={1} /></Form.Item>
            </Col>
          </Row>
          {tipoPago === 'credito' && fechaVencimientoCalc && (
            <Alert
              type="info" showIcon style={{ marginTop: 4 }}
              message={
                <span>
                  Vence el <strong>{fechaVencimientoCalc.format('DD/MM/YYYY')}</strong>
                  {' '}<Tag color="blue">{diasCredito} días crédito</Tag>
                  — se creará una Cuenta por Pagar automáticamente al recibir.
                </span>
              }
            />
          )}
          {tipoPago === 'contado' && (
            <Alert type="success" showIcon style={{ marginTop: 4 }}
              message="Pago de contado — no se generará Cuenta por Pagar." />
          )}
        </Card>
        <Card title="Ítems" style={{ marginBottom: 16 }}
          extra={<Button icon={<PlusOutlined />} onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, precioUnitario: 0, porcentajeItbis: 18 }])}>Agregar</Button>}>
          <Table columns={lineaCols as any} dataSource={lineas} rowKey="key" pagination={false} size="small"
        scroll={{ x: 'max-content' }} />
        </Card>
        {/* ── Retenciones E41 — solo para proveedores informales ── */}
        {esInformal && (
          <Card
            title={<span>⚠ Retenciones E41 — Proveedor informal</span>}
            style={{ marginBottom: 16, borderColor: '#f59e0b', background: token.colorWarningBg }}
            headStyle={{ borderColor: '#f59e0b', color: '#92400e' }}
          >
            <Row gutter={[16, 8]}>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Checkbox checked={retieneItbis} onChange={e => setRetieneItbis(e.target.checked)}>
                    Retener ITBIS
                  </Checkbox>
                  {retieneItbis && (
                    <InputNumber
                      min={0} max={100} precision={2}
                      value={pctItbis}
                      onChange={v => setPctItbis(v ?? 30)}
                      addonAfter="%" style={{ width: 110 }}
                    />
                  )}
                </div>
                {retieneItbis && (
                  <Alert type="warning" showIcon style={{ fontSize: 12 }}
                    message={`Monto a retener ITBIS: ${fmtMon(montoRetItbis, moneda)} (${pctItbis}% de ${fmtMon(itbis, moneda)})`} />
                )}
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Checkbox checked={retieneIsr} onChange={e => setRetieneIsr(e.target.checked)}>
                    Retener ISR
                  </Checkbox>
                  {retieneIsr && (
                    <InputNumber
                      min={0} max={100} precision={2}
                      value={pctIsr}
                      onChange={v => setPctIsr(v ?? 10)}
                      addonAfter="%" style={{ width: 110 }}
                    />
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

        <Card>
          <Row justify="end">
            <Col xs={24} sm={10}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Row justify="space-between"><span>Subtotal:</span><strong>{fmtMon(subtotal, moneda)}</strong></Row>
                <Row justify="space-between"><span>ITBIS (18%):</span><strong>{fmtMon(itbis, moneda)}</strong></Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row justify="space-between">
                  <span style={{ fontSize: 16 }}>Total bruto:</span>
                  <strong style={{ fontSize: 16 }}>{fmtMon(total, moneda)}</strong>
                </Row>
                {(montoRetItbis > 0 || montoRetIsr > 0) && (
                  <>
                    {montoRetItbis > 0 && (
                      <Row justify="space-between" style={{ color: '#d97706' }}>
                        <span>(-) Retención ITBIS ({pctItbis}%):</span>
                        <span>-{fmtMon(montoRetItbis, moneda)}</span>
                      </Row>
                    )}
                    {montoRetIsr > 0 && (
                      <Row justify="space-between" style={{ color: '#d97706' }}>
                        <span>(-) Retención ISR ({pctIsr}%):</span>
                        <span>-{fmtMon(montoRetIsr, moneda)}</span>
                      </Row>
                    )}
                    <Divider style={{ margin: '6px 0' }} />
                    <Row justify="space-between">
                      <span style={{ fontSize: 16, fontWeight: 700 }}>NETO A PAGAR:</span>
                      <strong style={{ fontSize: 18, color: '#059669' }}>{fmtMon(netoPagar, moneda)}</strong>
                    </Row>
                  </>
                )}
                {!(montoRetItbis > 0 || montoRetIsr > 0) && (
                  <Row justify="space-between">
                    <span style={{ fontSize: 16 }}>Total:</span>
                    <strong style={{ fontSize: 18, color: '#1677ff' }}>{fmtMon(total, moneda)}</strong>
                  </Row>
                )}
                {moneda !== 'DOP' && tipoCambio > 1 && (
                  <Row justify="space-between" style={{ color: '#888', fontSize: 12 }}>
                    <span>Equivalente RD$:</span>
                    <span>{fmtMon((montoRetItbis > 0 || montoRetIsr > 0 ? netoPagar : total) * tipoCambio, 'DOP')}</span>
                  </Row>
                )}
                <Button type="primary" htmlType="submit" block size="large" loading={createMut.isPending}>
                  Crear Orden de Compra
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
