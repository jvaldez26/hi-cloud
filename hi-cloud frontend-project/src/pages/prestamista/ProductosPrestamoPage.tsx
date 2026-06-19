import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Select, Tag, message, theme } from 'antd';
import { Plus } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;

export default function ProductosPrestamoPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const { data = [], isLoading } = useQuery({
    queryKey: ['prestamista-productos'],
    queryFn: prestamistalApi.getProductos,
  });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? prestamistalApi.updateProducto(editing.id, vals)
      : prestamistalApi.crearProducto(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prestamista-productos'] }); setOpen(false); form.resetFields(); setEditing(null); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const openForm = (row?: any) => {
    setEditing(row ?? null);
    form.setFieldsValue(row ? { ...row } : { metodoAmortizacion: 'frances', frecuenciaPago: 'mensual', diasGracia: 0, porcentajeMora: 0, cargoCierre: 0 });
    setOpen(true);
  };

  const cols = [
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'Tasa Mensual', dataIndex: 'tasaInteresMensual', render: (v: any) => `${v}%` },
    { title: 'Método', dataIndex: 'metodoAmortizacion', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Plazo (meses)', key: 'plazo', render: (_: any, r: any) => `${r.plazoMinimoMeses ?? '—'} - ${r.plazoMaximoMeses ?? '—'}` },
    { title: 'Mora %', dataIndex: 'porcentajeMora', render: (v: any) => `${v}%` },
    { title: 'Días Gracia', dataIndex: 'diasGracia' },
    { title: 'Activo', dataIndex: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
    { title: '', key: 'acc', width: 80, render: (_: any, r: any) => <Button size="small" onClick={() => openForm(r)}>Editar</Button> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Productos de Préstamo</h2>
        <Button type="primary" icon={<Plus size={15} />} onClick={() => openForm()}>Nuevo Producto</Button>
      </div>

      <Table dataSource={(data as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={cols}
        loading={isLoading} scroll={{ x: 'max-content' }} pagination={false} />

      <Modal title={editing ? 'Editar Producto' : 'Nuevo Producto'} open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => save.mutate(v))} okText="Guardar" width={640} confirmLoading={save.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="tasaInteresMensual" label="Tasa Interés Mensual (%)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={3} addonAfter="%" />
            </Form.Item>
            <Form.Item name="metodoAmortizacion" label="Método Amortización">
              <Select><Option value="frances">Francés (cuota fija)</Option><Option value="aleman">Alemán (capital fijo)</Option></Select>
            </Form.Item>
            <Form.Item name="frecuenciaPago" label="Frecuencia de Pago">
              <Select><Option value="semanal">Semanal</Option><Option value="quincenal">Quincenal</Option><Option value="mensual">Mensual</Option></Select>
            </Form.Item>
            <Form.Item name="porcentajeMora" label="Mora Mensual (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={3} addonAfter="%" />
            </Form.Item>
            <Form.Item name="diasGracia" label="Días de Gracia">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="cargoCierre" label="Cargo al Cierre (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
            <Form.Item name="plazoMinimoMeses" label="Plazo Mínimo (meses)">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="plazoMaximoMeses" label="Plazo Máximo (meses)">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="montoMinimo" label="Monto Mínimo (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
            <Form.Item name="montoMaximo" label="Monto Máximo (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item name="requiereGarantia" label="Requiere Garantía" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requiereGarante" label="Requiere Garante" valuePropName="checked"><Switch /></Form.Item>
            {editing && <Form.Item name="isActive" label="Activo" valuePropName="checked"><Switch /></Form.Item>}
          </div>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
