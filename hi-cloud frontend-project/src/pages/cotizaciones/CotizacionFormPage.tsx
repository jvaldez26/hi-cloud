import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { cotizacionesApi, type CotizacionDetallePayload } from '../../api/cotizaciones.api';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Linea {
  key: string; productoId?: number; descripcion?: string;
  cantidad: number; precioUnitario: number; porcentajeIva: number;
}

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

  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const empresaActual  = useAuthStore(s => s.empresaActual);
  const { data: clientes  } = useQuery({ queryKey: ['clientes-sel'],  queryFn: () => clientesApi.list(1, 100) });
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
      if (cotExistente.detalles?.length) {
        setLineas(cotExistente.detalles.map((d: any, i: number) => ({
          key: String(i + 1), productoId: d.productoId, descripcion: d.descripcion,
          cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario),
          porcentajeIva: Number(d.porcentajeIva),
        })));
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

  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const iva      = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeIva / 100), 0);
  const total    = subtotal + iva;

  const onProductoChange = (productoId: number, idx: number) => {
    const prod = productos?.data.find(p => p.id === productoId);
    if (!prod) return;
    const u = [...lineas];
    u[idx] = { ...u[idx], productoId, descripcion: prod.nombre, precioUnitario: Number(prod.precio), porcentajeIva: Number(prod.porcentajeIva) };
    setLineas(u);
  };

  const handleSubmit = (values: any) => {
    const vendedor = vendedores.find((v: any) => v.id === values.vendedorId);
    const detalles: CotizacionDetallePayload[] = lineas.map(l => ({
      productoId: l.productoId, descripcion: l.descripcion!,
      cantidad: l.cantidad, precioUnitario: l.precioUnitario, porcentajeIva: l.porcentajeIva,
    }));
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
    { title: 'ITBIS %', key: 'iva', width: 80,
      render: (_: any, r: Linea, idx: number) => (
        <InputNumber min={0} max={100} value={r.porcentajeIva} style={{ width:'100%' }}
          onChange={v => { const u=[...lineas]; u[idx].porcentajeIva=v??18; setLineas(u); }} />
      )},
    { title: 'Subtotal', key: 'sub', width: 110,
      render: (_: any, r: Linea) => {
        const pct = r.porcentajeIva / 100;
        const val = precioInputModo === 'c' && pct > 0
          ? r.precioUnitario * r.cantidad * (1 + pct)
          : r.precioUnitario * r.cantidad;
        return fmt.money(val);
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
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={clientes?.data.map(c => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))} />
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
                <Row justify="space-between"><span>Subtotal:</span><strong>{fmt.money(subtotal)}</strong></Row>
                <Row justify="space-between"><span>ITBIS (18%):</span><strong>{fmt.money(iva)}</strong></Row>
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
