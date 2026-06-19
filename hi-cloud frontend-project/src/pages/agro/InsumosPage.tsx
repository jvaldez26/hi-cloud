import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, theme, Tag, Badge } from 'antd';
import { Plus, Edit, AlertTriangle } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function InsumosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const [soloStockBajo, setSoloStockBajo] = useState(false);

  const { data: insumos = [], isLoading } = useQuery({
    queryKey: ['agro-insumos', soloStockBajo],
    queryFn: () => agroApi.getInsumos(soloStockBajo ? { stockBajo: true } : {}),
  });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateInsumo(modal.item.id, vals) : agroApi.crearInsumo(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-insumos'] }); setModal({ open: false }); message.success('Guardado'); form.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const stockBajoCount = (insumos as any[]).filter((i: any) => Number(i.stockActual) <= Number(i.stockMinimo)).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ color: C.colorText, margin: 0 }}>Insumos Agrícolas</h2>
          {stockBajoCount > 0 && (
            <span style={{ color: '#ff4d4f', fontSize: 13 }}>
              <AlertTriangle size={12} style={{ marginRight: 4 }} />
              {stockBajoCount} insumo{stockBajoCount > 1 ? 's' : ''} con stock bajo
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Switch size="small" checked={soloStockBajo} onChange={setSoloStockBajo} />
            Solo stock bajo
          </label>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>Nuevo Insumo</Button>
        </div>
      </div>

      <Table loading={isLoading} dataSource={insumos as any[]} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Nombre', dataIndex: 'nombre', key: 'n',
            render: (v: string, r: any) => {
              const bajo = Number(r.stockActual) <= Number(r.stockMinimo);
              return bajo ? <><Badge status="error" /><span style={{ color: '#ff4d4f' }}>{v}</span></> : v;
            },
          },
          { title: 'Tipo', dataIndex: 'tipo', key: 't', render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Principio Activo', dataIndex: 'principioActivo', key: 'pa' },
          { title: 'Stock Actual', key: 'sa', render: (_: any, r: any) => `${r.stockActual} ${r.unidad ?? ''}` },
          { title: 'Stock Mínimo', key: 'sm', render: (_: any, r: any) => `${r.stockMinimo ?? '-'} ${r.unidad ?? ''}` },
          { title: 'Costo Unit.', dataIndex: 'costoUnitario', key: 'cu', render: (v: any) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '-' },
          { title: 'Carencia', dataIndex: 'periodoCarencia', key: 'car', render: (v: any) => v ? `${v} días` : '-' },
          { title: 'Reg. ICA', dataIndex: 'registroIca', key: 'ica' },
          {
            title: '', key: 'acc',
            render: (_: any, r: any) => <Button size="small" icon={<Edit size={12} />} onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button>,
          },
        ]} />

      <Modal open={modal.open} title={modal.item ? 'Editar Insumo' : 'Nuevo Insumo'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'fertilizante', label: 'Fertilizante' }, { value: 'herbicida', label: 'Herbicida' },
              { value: 'fungicida', label: 'Fungicida' }, { value: 'insecticida', label: 'Insecticida' },
              { value: 'semilla', label: 'Semilla' }, { value: 'abono', label: 'Abono' },
              { value: 'vitamina', label: 'Vitamina' }, { value: 'medicamento', label: 'Medicamento' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="principioActivo" label="Principio Activo"><Input /></Form.Item>
          <Form.Item name="fabricante" label="Fabricante"><Input /></Form.Item>
          <Form.Item name="registroIca" label="Registro ICA / IDIAF"><Input /></Form.Item>
          <Form.Item name="unidad" label="Unidad de Medida"><Input placeholder="litro, kg, saco, galón..." /></Form.Item>
          <Form.Item name="stockActual" label="Stock Actual" initialValue={0}><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="stockMinimo" label="Stock Mínimo (alerta)"><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="costoUnitario" label="Costo Unitario (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="periodoCarencia" label="Período de Carencia (días)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
