import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { cotizacionesApi, type CotizacionDetallePayload } from '../../api/cotizaciones.api';
import SelectClienteConAlta from '../../components/clientes/SelectClienteConAlta';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';
import { calcularTotalesDocumento, descuentoDeLinea, r2 } from '../../utils/totalesDocumento';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Linea {
  key: string; productoId?: number; descripcion?: string;
  cantidad: number; precioUnitario: number; porcentajeIva: number;
  /** Descuento de la línea: RD$ sobre el bruto, o % */
  descuentoTipo?: 'monto' | 'pct';
  descuentoValor?: number;
}

// La aritmética vive en utils/totalesDocumento.ts, con su prueba de contrato
// contra la fórmula del backend. Aquí solo se pinta.

export default function CotizacionFormPage() {
  const { id }   = useParams<{ id?: string }>();
  const esEditar = !!id;
  const [form]   = Form.useForm();
  const [lineas, setLineas] = useState<Linea[]>([
    { key: '1', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 },
  ]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [precioInputModo, setPrecioInputModo] = useState<'c' | 's'>(() => {
    try { return (localStorage.getItem('cot_precio_input_modo') as 'c' | 's') ?? 'c'; }
    catch { return 'c'; }
  });
  const cambiarModo = (m: 'c' | 's') => {
    setPrecioInputModo(m);
    try { localStorage.setItem('cot_precio_input_modo', m); } catch {}
  };

  // Descuento general — mismo modelo que la factura: 'monto' en RD$ sobre el
  // subtotal, o 'porcentaje'
  const [descuentoGeneralTipo,  setDescuentoGeneralTipo]  = useState<'monto' | 'porcentaje'>('monto');
  const [descuentoGeneralValor, setDescuentoGeneralValor] = useState<number>(0);

  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);
  // La lista de clientes la carga SelectClienteConAlta (misma queryKey
  // 'clientes-sel', así que comparten caché con el resto de pantallas)
  const { data: productos } = useQuery({ queryKey: ['productos-sel'], queryFn: () => productosApi.list(1, 5000, '', true), staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const { data: vendedores = [] } = useQuery<any[]>({ queryKey: ['vendedores-sel'], queryFn: () => api.get('/vendedores').then((r: any) => r.data?.data?.data ?? r.data?.data ?? []) });
  const { data: sucursales = [] } = useQuery<any[]>({ queryKey: ['mis-sucursales', empresaActual], queryFn: () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []) });

  // Cargar datos existentes al editar
  const { data: cotExistente, isLoading: loadingCot } = useQuery({
    queryKey: ['cotizacion-edit', id],
    queryFn:  () => cotizacionesApi.getOne(Number(id)),
    enabled:  esEditar,
  });

  useEffect(() => {
    if (!esEditar) {
      if (sucursales.length === 1) form.setFieldValue('sucursalId', sucursales[0].id);
      else if (sucursalActual) form.setFieldValue('sucursalId', sucursalActual);
    }
  }, [sucursales, sucursalActual, esEditar]);

  useEffect(() => {
    if (cotExistente && esEditar) {
      form.setFieldsValue({
        clienteId:       cotExistente.clienteId,
        fecha:           dayjs(cotExistente.fecha),
        validezDias:     cotExistente.validezDias ?? 30,
        condicionesPago: cotExistente.condicionesPago,
        notas:           cotExistente.notas,
        vendedorId:      cotExistente.vendedorId,
        sucursalId:      (cotExistente as any).sucursalId,
      });
      // El descuento general vuelve tal como se guardó; si no lo hubo, a cero
      setDescuentoGeneralTipo((cotExistente as any).descuentoGeneralTipo === 'porcentaje'
        ? 'porcentaje' : 'monto');
      setDescuentoGeneralValor(Number((cotExistente as any).descuentoGeneralValor ?? 0));

      if (cotExistente.detalles?.length) {
        setLineas(cotExistente.detalles.map((d: any, i: number) => {
          const dm   = Number(d.descuentoMonto ?? 0);
          const dp   = Number(d.descuentoPct   ?? 0);
          const cant = Number(d.cantidad);
          // Convención B (viene del POS): precioUnitario está NETO y el
          // descuento es POR UNIDAD. Este formulario edita en convención A, que
          // espera el precio BRUTO — si se cargara el neto, el descuento se
          // volvería a restar sobre un precio que ya lo tenía dentro.
          const esConvencionB = d.precioOriginal != null && dm > 0;
          return {
            key: String(i + 1), productoId: d.productoId, descripcion: d.descripcion,
            cantidad: cant,
            precioUnitario: esConvencionB ? Number(d.precioOriginal) : Number(d.precioUnitario),
            porcentajeIva: Number(d.porcentajeIva),
            ...(dm > 0
              ? { descuentoTipo: 'monto' as const,
                  descuentoValor: esConvencionB ? r2(dm * cant) : dm }
              : dp > 0
                ? { descuentoTipo: 'pct' as const, descuentoValor: dp }
                : {}),
          };
        }));
      }
    }
  }, [cotExistente, esEditar, form]);

  const createMut = useMutation({
    mutationFn: cotizacionesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      message.success('Cotización creada exitosamente');
      navigate('/cotizaciones');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al crear'),
  });

  const updateMut = useMutation({
    mutationFn: (dto: any) => api.patch(`/cotizaciones/${id}`, dto).then((r: any) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizacion-edit', id] });
      message.success('Cotización actualizada');
      navigate('/cotizaciones');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al actualizar'),
  });

  // Totales — los calcula utils/totalesDocumento.ts, que replica la fórmula del
  // backend y tiene una prueba que compara las dos sobre 3.000 documentos. Lo
  // que se ve aquí es lo que va a quedar guardado.
  const {
    subtotalBase, descGeneral, descuentoLineasTotal, subtotal, iva, total,
  } = calcularTotalesDocumento(lineas, {
    tipo:  descuentoGeneralTipo,
    valor: descuentoGeneralValor,
  });
  const descGenVal = Math.max(0, Number(descuentoGeneralValor) || 0);

  const onProductoChange = (productoId: number, idx: number) => {
    const prod = productos?.data.find(p => p.id === productoId);
    if (!prod) return;
    const u = [...lineas];
    u[idx] = { ...u[idx], productoId, descripcion: prod.nombre, precioUnitario: Number(prod.precio), porcentajeIva: Number(prod.porcentajeIva) };
    setLineas(u);
  };

  const handleSubmit = (values: any) => {
    const vendedor = vendedores.find((v: any) => v.id === values.vendedorId);
    // Convención A: precioUnitario BRUTO y descuentoMonto TOTAL de la línea —
    // igual que el formulario de facturas. El backend lo recalcula con el mismo
    // helper, así que lo que se ve arriba es lo que se guarda.
    const detalles: CotizacionDetallePayload[] = lineas.map(l => {
      const desc = descuentoDeLinea(l);
      return {
        productoId: l.productoId, descripcion: l.descripcion!,
        cantidad: l.cantidad, precioUnitario: l.precioUnitario, porcentajeIva: l.porcentajeIva,
        ...(desc > 0
          ? l.descuentoTipo === 'pct'
            ? { descuentoPct: Number(l.descuentoValor) }
            : { descuentoMonto: desc }
          : {}),
      };
    });
    const payload = {
      clienteId:       values.clienteId,
      fecha:           values.fecha.format('YYYY-MM-DD'),
      validezDias:     values.validezDias ?? 30,
      condicionesPago: values.condicionesPago,
      notas:           values.notas,
      vendedorId:      values.vendedorId,
      nombreVendedor:  vendedor?.nombre,
      sucursalId:      (values as any).sucursalId ?? sucursalActual,
      detalles,
      ...(descGeneral > 0 ? {
        descuentoGeneralTipo:  descuentoGeneralTipo,
        descuentoGeneralValor: descGenVal,
        // El mismo descuento visto en pesos FINALES (c/ITBIS): es lo que el PDF
        // enseña entre paréntesis, porque es la cifra que el cliente negoció.
        // Se usa la tasa EFECTIVA del documento (iva/subtotal), que funciona con
        // mezcla de 18% / 16% / exentos igual que el reparto proporcional.
        descuentoGeneralFinal: r2(descGeneral * (1 + (subtotal > 0 ? iva / subtotal : 0))),
      } : {}),
    };
    if (esEditar) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  if (esEditar && loadingCot) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const lineaCols = [
    { title: 'Producto', key: 'prod', width: 200,
      render: (_: any, _r: Linea, idx: number) => (
        <Select style={{ width: '100%' }} showSearch placeholder="Buscar..."
          popupMatchSelectWidth={false}
          filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
          options={productos?.data.map(p => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }))}
          onChange={v => onProductoChange(v, idx)} />
      )},
    { title: 'Descripción', key: 'desc',
      render: (_: any, r: Linea, idx: number) => (
        <Input value={r.descripcion}
          onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
      )},
    { title: 'Cant.', key: 'qty', width: 80,
      render: (_: any, r: Linea, idx: number) => (
        <InputNumber min={1} precision={0} value={r.cantidad} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].cantidad=v??1; setLineas(u); }} />
      )},
    { title: precioInputModo === 'c' ? 'Precio c/ITBIS (RD$)' : 'Precio s/ITBIS (RD$)', key: 'price', width: 150,
      render: (_: any, r: Linea, idx: number) => {
        const pct = r.porcentajeIva / 100;
        const displayVal = precioInputModo === 'c' && pct > 0
          ? parseFloat((r.precioUnitario * (1 + pct)).toFixed(2))
          : r.precioUnitario;
        return (
          <InputNumber min={0} precision={precioInputModo === 'c' ? 2 : 4}
            value={displayVal} style={{ width:'100%' }}
            onChange={v => {
              const raw = v ?? 0;
              const base = precioInputModo === 'c' && pct > 0
                ? parseFloat((raw / (1 + pct)).toFixed(4))
                : raw;
              const u=[...lineas]; u[idx].precioUnitario=base; setLineas(u);
            }} />
        );
      }},
    { title: 'Descuento', key: 'desc', width: 150,
      render: (_: any, r: Linea, idx: number) => (
        <Space.Compact style={{ width: '100%' }}>
          <InputNumber min={0} precision={2} value={r.descuentoValor ?? 0}
            style={{ width: '62%' }} placeholder="0"
            max={r.descuentoTipo === 'pct' ? 100 : undefined}
            onChange={v => { const u=[...lineas]; u[idx].descuentoValor = v ?? 0; setLineas(u); }} />
          <Select style={{ width: '38%' }} value={r.descuentoTipo ?? 'monto'}
            onChange={v => { const u=[...lineas]; u[idx].descuentoTipo = v; setLineas(u); }}
            options={[{ value: 'monto', label: 'RD$' }, { value: 'pct', label: '%' }]} />
        </Space.Compact>
      )},
    { title: 'ITBIS %', key: 'iva', width: 80,
      render: (_: any, r: Linea, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeIva} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].porcentajeIva=v??18; setLineas(u); }} />
      )},
    { title: 'Subtotal', key: 'sub', width: 130,
      render: (_: any, r: Linea) => {
        const pct   = r.porcentajeIva / 100;
        const desc  = descuentoDeLinea(r);
        const neto  = r2(r.precioUnitario * r.cantidad) - desc;
        // En modo c/ITBIS la columna enseña el importe final, igual que antes
        const val   = precioInputModo === 'c' && pct > 0 ? neto * (1 + pct) : neto;
        if (desc <= 0) return fmt.money(val);
        const bruto = r2(r.precioUnitario * r.cantidad);
        const brutoMostrado = precioInputModo === 'c' && pct > 0 ? bruto * (1 + pct) : bruto;
        return (
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ textDecoration: 'line-through', color: '#999', fontSize: 11 }}>
              {fmt.money(brutoMostrado)}
            </div>
            <div>{fmt.money(val)}</div>
          </div>
        );
      }},
    { title: '', key: 'del', width: 40,
      render: (_: any, _r: Linea, idx: number) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      )},
  ];

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/cotizaciones')}>
          Volver
        </Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>{esEditar ? 'Editar Cotización' : 'Nueva Cotización'}</Title>
        <Tag color="blue" style={{ marginLeft: 8 }}>Válida por 30 días por defecto</Tag>
      </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ fecha: dayjs(), validezDias: 30, condicionesPago: 'Al contado' }}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={10}>
              {/* El mismo selector que la factura: buscar, y dar de alta sin
                  salir de aquí. Antes había que irse a Clientes y volver. */}
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <SelectClienteConAlta style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="validezDias" label="Validez (días)">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="condicionesPago" label="Condiciones de Pago">
                <Select options={['Al contado','30 días','60 días','90 días','Contra entrega']
                  .map(v => ({ value: v, label: v }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="vendedorId" label="Vendedor">
                <Select
                  allowClear
                  showSearch
                  placeholder="Sin vendedor asignado"
                  optionFilterProp="label"
                  options={vendedores.map((v: any) => ({
                    value: v.id,
                    label: v.codigo ? `${v.codigo} — ${v.nombre}` : v.nombre,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} style={{ display: sucursales.length > 1 ? undefined : 'none' }}>
              <Form.Item name="sucursalId" label="Sucursal" rules={[{ required: sucursales.length > 1, message: 'Selecciona una sucursal' }]}>
                <Select placeholder="Seleccionar sucursal" options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24}>
              <Form.Item name="notas" label="Notas / Términos y condiciones">
                <Input.TextArea rows={1} placeholder="Precios sujetos a variación. Oferta válida hasta la fecha indicada." />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="Ítems cotizados" style={{ marginBottom: 16 }}
          extra={
            <Space>
              {(['c', 's'] as const).map(m => (
                <button key={m} onClick={() => cambiarModo(m)}
                  style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none',
                    cursor: 'pointer', fontWeight: 600,
                    background: precioInputModo === m ? '#1677ff' : '#f0f0f0',
                    color: precioInputModo === m ? '#fff' : '#888',
                  }}>
                  {m === 'c' ? 'c/ITBIS' : 's/ITBIS'}
                </button>
              ))}
              <Button icon={<PlusOutlined />}
                onClick={() => setLineas([...lineas, { key: Date.now().toString(), cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }])}>
                Agregar ítem
              </Button>
            </Space>
          }>
          <Table columns={lineaCols as any} dataSource={lineas} rowKey="key" pagination={false} size="small" />
        </Card>

        <Card>
          <Row justify="end">
            <Col xs={24} sm={10}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {/* El descuento se enseña desglosado: precio de partida, lo que
                    se rebaja y el neto. Un total ya rebajado sin decir cuánto le
                    quita valor a la concesión que se está haciendo. */}
                {descuentoLineasTotal > 0 && (
                  <>
                    <Row justify="space-between" style={{ color: '#888' }}>
                      <span>Subtotal bruto:</span>
                      <span>{fmt.money(r2(subtotalBase + descuentoLineasTotal))}</span>
                    </Row>
                    <Row justify="space-between" style={{ color: '#cf1322' }}>
                      <span>Descuento por línea:</span>
                      <span>−{fmt.money(descuentoLineasTotal)}</span>
                    </Row>
                  </>
                )}
                <Row justify="space-between" align="middle">
                  <span>Descuento general:</span>
                  <Space.Compact style={{ width: 170 }}>
                    <InputNumber min={0} precision={2} value={descuentoGeneralValor}
                      style={{ width: '60%' }} placeholder="0"
                      max={descuentoGeneralTipo === 'porcentaje' ? 100 : undefined}
                      onChange={v => setDescuentoGeneralValor(v ?? 0)} />
                    <Select style={{ width: '40%' }} value={descuentoGeneralTipo}
                      onChange={v => setDescuentoGeneralTipo(v)}
                      options={[{ value: 'monto', label: 'RD$' }, { value: 'porcentaje', label: '%' }]} />
                  </Space.Compact>
                </Row>
                {descGeneral > 0 && (
                  <Row justify="space-between" style={{ color: '#cf1322' }}>
                    <span>Descuento general aplicado:</span>
                    <span>−{fmt.money(descGeneral)}</span>
                  </Row>
                )}
                <Row justify="space-between"><span>Subtotal:</span><strong>{fmt.money(subtotal)}</strong></Row>
                <Row justify="space-between"><span>ITBIS:</span><strong>{fmt.money(iva)}</strong></Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row justify="space-between">
                  <span style={{ fontSize: 16 }}>Total cotización:</span>
                  <strong style={{ fontSize: 18, color: '#1677ff' }}>{fmt.money(total)}</strong>
                </Row>
                <Button type="primary" htmlType="submit" block size="large"
                  loading={createMut.isPending || updateMut.isPending}>
                  {esEditar ? 'Guardar cambios' : 'Crear Cotización'}
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
