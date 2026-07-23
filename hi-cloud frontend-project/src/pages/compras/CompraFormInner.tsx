import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Row, Col, Select, DatePicker, Table,
         InputNumber, Space, Divider, message, Tag, Alert, Checkbox, theme, Tooltip, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  permiteDecimales?: boolean;
  precioIncluyeItbis?: boolean;
}

const fmtMon = (v: number, moneda = 'DOP') => {
  const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'RD$';
  return `${sym} ${v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface Props {
  onSuccess?: (orden: any) => void;
  onCancel?: () => void;
}

export default function CompraFormInner({ onSuccess, onCancel }: Props) {
  const [form] = Form.useForm();
  const { token } = theme.useToken();
  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);
  const qc = useQueryClient();

  const [lineas, setLineas] = useState<Linea[]>([{ key: '1', cantidad: 1, cantidadBonificada: 0, precioUnitario: 0, porcentajeItbis: 18 }]);
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
  const { data: productosBusqueda, isFetching: buscandoProd } = useQuery({
    queryKey: ['productos-compra-search', productoSearch],
    queryFn:  () => api.get(`/productos?page=1&limit=50&search=${encodeURIComponent(productoSearch)}&incluirSinStock=true`).then(r => r.data?.data ?? r.data),
    enabled:  productoSearch.length >= 2,
    staleTime: 30_000,
  });
  const { data: almacenes = [] } = useQuery<any[]>({
    queryKey: ['almacenes-sel'],
    queryFn:  () => api.get('/almacenes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });
  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['mis-sucursales', empresaActual],
    queryFn:  () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const proveedorSel = (proveedores?.data ?? []).find((p: any) => p.id === proveedorSelId);
  const esInformal   = proveedorSel
    ? (!proveedorSel.rnc || proveedorSel.rnc === '000000000' || (proveedorSel as any).esInformal === true)
    : false;

  useEffect(() => {
    if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
    else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
  }, [sucursales, sucursalActual]);

  // Mantener la sesión activa mientras el formulario está abierto (previene logout por idle).
  // Cada 8 minutos hace un GET /auth/me que activa el interceptor de refresco si el token expiró.
  useEffect(() => {
    const iv = setInterval(() => { api.get('/auth/me').catch(() => {}); }, 8 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const createMut = useMutation({
    mutationFn: comprasApi.create,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      onSuccess?.(data?.data ?? data);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear compra'),
  });

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

  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const itbis    = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeItbis / 100), 0);
  const total    = subtotal + itbis;

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
    { title: 'Producto', key: 'prod',
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
        return (
          <Select style={{ width: '100%' }} showSearch placeholder="Escribe para buscar..."
            filterOption={false}
            onSearch={(v) => { setProductoSearch(v); }}
            loading={buscandoProd}
            notFoundContent={productoSearch.length < 2 ? 'Escribe al menos 2 letras' : 'Sin resultados'}
            options={opts}
            value={_r.productoId}
            popupMatchSelectWidth={false}
            dropdownStyle={{ minWidth: 380 }}
            onChange={(v) => onProductoChange(v, idx)}
            dropdownRender={(menu) => (
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
        );
      }},
    { title: 'Descripción', key: 'desc', width: 100,
      render: (_: unknown, r: Linea, idx: number) => (
        <Input value={r.descripcion} style={{ overflow: 'hidden' }}
          onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
      )},
    { title: 'Cantidad', key: 'qty', width: 82,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber
          controls={false}
          min={0.0001}
          value={r.cantidad}
          style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].cantidad=v??0.001; setLineas(u); }} />
      )},
    { title: 'Bonif.', key: 'bon', width: 72,
      render: (_: unknown, r: Linea, idx: number) => (
        <InputNumber
          controls={false}
          min={0}
          value={r.cantidadBonificada}
          style={{ width:'100%' }}
          placeholder="0"
          onChange={v => { const u=[...lineas]; u[idx].cantidadBonificada=v??0; setLineas(u); }} />
      )},
    { title: 'Inv. / Costo', key: 'inv', width: 92,
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
    { title: 'Precio', key: 'price', width: 90,
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
    { title: 'ITBIS %', key: 'itbis', width: 100,
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
    { title: 'Subtotal', key: 'sub', width: 98,
      render: (_: unknown, r: Linea) => fmtMon(r.precioUnitario * r.cantidad, moneda) },
    { title: '', key: 'del', width: 44,
      render: (_: unknown, _r: Linea, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      )},
  ];

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ fecha: dayjs() }}>
      <Card style={{ marginBottom: 16 }}>
        {/* Fila 1 — Documento */}
        <Row gutter={[16, 0]}>
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
          <Col xs={12} sm={5}>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
              <DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={5}>
            <Form.Item name="numeroFacturaProveedor" label="NCF Proveedor">
              <Input placeholder="B01-00000001" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={4}>
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
                allowClear placeholder="Almacén..."
                value={almacenId} onChange={(v) => setAlmacenId(v ?? undefined)}
                showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={almacenes.map((a: any) => ({
                  value: a.id, label: a.codigo ? `${a.codigo} — ${a.nombre}` : a.nombre,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        {/* Fila 2 — Pago y configuración */}
        <Row gutter={[16, 0]}>
          <Col xs={12} sm={5}>
            <Form.Item label="Moneda">
              <Select value={moneda} onChange={handleMonedaChange} style={{ width: '100%' }}>
                <Select.Option value="DOP">DOP — Pesos</Select.Option>
                <Select.Option value="USD">USD — Dólares</Select.Option>
                <Select.Option value="EUR">EUR — Euros</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          {moneda !== 'DOP' && (
            <Col xs={12} sm={4}>
              <Form.Item label={`Tasa RD$/${moneda}`}>
                <InputNumber controls={false} value={tipoCambio} min={1} precision={4} style={{ width: '100%' }}
                  onChange={v => setTipoCambio(v ?? 1)} addonBefore="RD$" />
              </Form.Item>
            </Col>
          )}
          <Col xs={12} sm={5}>
            <Form.Item label="Tipo de pago" required>
              <Select value={tipoPago} onChange={v => setTipoPago(v)} style={{ width: '100%' }}>
                <Select.Option value="contado">Contado</Select.Option>
                <Select.Option value="credito">Crédito</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          {tipoPago === 'credito' && (
            <Col xs={12} sm={4}>
              <Form.Item label="Días crédito">
                <InputNumber controls={false} min={1} max={365} value={diasCredito}
                  onChange={v => setDiasCredito(v ?? 30)} style={{ width: '100%' }} addonAfter="días" />
              </Form.Item>
            </Col>
          )}
          {sucursales.length > 1 && (
            <Col xs={24} sm={5}>
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: true, message: 'Selecciona una sucursal' }]}>
                <Select placeholder="Seleccionar sucursal" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={tipoPago === 'credito' ? (sucursales.length > 1 ? 5 : 10) : (sucursales.length > 1 ? 9 : 14)}>
            <Form.Item name="notas" label="Notas"><Input.TextArea rows={1} /></Form.Item>
          </Col>
        </Row>
        {tipoPago === 'credito' && fechaVencimientoCalc && (
          <Alert type="info" showIcon style={{ marginTop: 4 }}
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
        extra={<Button icon={<PlusOutlined />} onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, cantidadBonificada: 0, precioUnitario: 0, porcentajeItbis: 18 }])}>Agregar</Button>}>
        <Table columns={lineaCols as any} dataSource={lineas} rowKey="key" pagination={false} size="small"
          tableLayout="fixed" style={{ overflowX: 'auto' }} />
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
              <Row gutter={8} style={{ marginTop: 4 }}>
                {onCancel && (
                  <Col span={8}>
                    <Button block size="large" onClick={onCancel} disabled={createMut.isPending}>
                      Cancelar
                    </Button>
                  </Col>
                )}
                <Col span={onCancel ? 16 : 24}>
                  <Button type="primary" htmlType="submit" block size="large" loading={createMut.isPending}>
                    Crear Orden de Compra
                  </Button>
                </Col>
              </Row>
            </Space>
          </Col>
        </Row>
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
            esCreacionRapida: true,
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
