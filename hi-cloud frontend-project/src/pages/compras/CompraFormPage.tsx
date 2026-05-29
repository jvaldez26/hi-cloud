import { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Select,
         DatePicker, Table, InputNumber, Space, Divider, message, Tag, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { comprasApi, type CompraDetallePayload } from '../../api/compras.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Linea { key: string; productoId?: number; descripcion?: string; cantidad: number; precioUnitario: number; porcentajeItbis: number; }

export default function CompraFormPage() {
  const [form] = Form.useForm();
  const [lineas, setLineas] = useState<Linea[]>([{ key: '1', cantidad: 1, precioUnitario: 0, porcentajeItbis: 18 }]);
  const [tipoPago, setTipoPago]     = useState<'contado' | 'credito'>('credito');
  const [diasCredito, setDiasCredito] = useState(30);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: proveedores } = useQuery({ queryKey: ['proveedores-sel'], queryFn: () => proveedoresApi.list(1, 200) });
  const { data: productos }   = useQuery({ queryKey: ['productos-sel'],   queryFn: () => productosApi.list(1, 200) });

  const createMut = useMutation({
    mutationFn: comprasApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Compra creada'); navigate('/compras'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear compra'),
  });

  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const itbis    = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (l.porcentajeItbis / 100), 0);
  const total    = subtotal + itbis;

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
    });
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
    { title: 'Subtotal', key: 'sub', width: 110, render: (_: unknown, r: Linea) => fmt.money(r.precioUnitario * r.cantidad) },
    { title: '', key: 'del', width: 50, render: (_: unknown, _r: Linea, idx: number) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} />
      )},
  ];

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compras')}>Volver</Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>Nueva Factura de Compra</Title>
      </Row>
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ fecha: dayjs() }}>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={10}>
              <Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={proveedores?.data.map(p => ({ value: p.id, label: `${p.rnc} — ${p.nombre}` }))} />
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
        <Card>
          <Row justify="end">
            <Col xs={24} sm={10}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Row justify="space-between"><span>Subtotal:</span><strong>{fmt.money(subtotal)}</strong></Row>
                <Row justify="space-between"><span>ITBIS (18%):</span><strong>{fmt.money(itbis)}</strong></Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row justify="space-between">
                  <span style={{ fontSize: 16 }}>Total:</span>
                  <strong style={{ fontSize: 18, color: '#1677ff' }}>{fmt.money(total)}</strong>
                </Row>
                <Button type="primary" htmlType="submit" block size="large" loading={createMut.isPending}>
                  Crear Factura de Compra
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
}
