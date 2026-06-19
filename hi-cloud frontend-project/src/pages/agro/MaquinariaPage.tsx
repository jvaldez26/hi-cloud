import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag } from 'antd';
import { Plus, Edit } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function MaquinariaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();

  const { data: maquinaria = [], isLoading } = useQuery({ queryKey: ['agro-maquinaria'], queryFn: () => agroApi.getMaquinaria() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateMaquinaria(modal.item.id, vals) : agroApi.crearMaquinaria({
      ...vals,
      fechaCompra: vals.fechaCompra?.format('YYYY-MM-DD'),
      proximoMantenimiento: vals.proximoMantenimiento?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-maquinaria'] }); setModal({ open: false }); message.success('Guardado'); form.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Maquinaria y Equipos</h2>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>Nueva Maquinaria</Button>
      </div>

      <Table loading={isLoading} dataSource={maquinaria as any[]} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre', key: 'n' },
          { title: 'Tipo', dataIndex: 'tipo', key: 't', render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Marca', dataIndex: 'marca', key: 'm' },
          { title: 'Modelo', dataIndex: 'modelo', key: 'mo' },
          { title: 'Año', dataIndex: 'anio', key: 'a' },
          { title: 'Costo/Hora', key: 'ch', render: (_: any, r: any) => r.costoPorHora ? `RD$${Number(r.costoPorHora).toLocaleString('es-DO')}` : '-' },
          { title: 'Costo/Día', key: 'cd', render: (_: any, r: any) => r.costoPorDia ? `RD$${Number(r.costoPorDia).toLocaleString('es-DO')}` : '-' },
          { title: 'Estado', dataIndex: 'estado', key: 'est', render: (v: string) => <Tag color={v === 'disponible' ? 'green' : v === 'en_uso' ? 'blue' : 'orange'}>{v}</Tag> },
          { title: 'Prox. Mant.', dataIndex: 'proximoMantenimiento', key: 'pm', render: (v: string) => v ? String(v).split('T')[0] : '-' },
          { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" icon={<Edit size={12} />} onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button> },
        ]} />

      <Modal open={modal.open} title={modal.item ? 'Editar Maquinaria' : 'Nueva Maquinaria'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'tractor', label: 'Tractor' }, { value: 'bomba_riego', label: 'Bomba de Riego' },
              { value: 'cosechadora', label: 'Cosechadora' }, { value: 'fumigadora', label: 'Fumigadora' },
              { value: 'sembradora', label: 'Sembradora' }, { value: 'vehiculo', label: 'Vehículo' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="marca" label="Marca"><Input /></Form.Item>
          <Form.Item name="modelo" label="Modelo"><Input /></Form.Item>
          <Form.Item name="anio" label="Año"><InputNumber min={1900} max={2100} style={{ width: 120 }} /></Form.Item>
          <Form.Item name="numeroSerie" label="N° Serie"><Input /></Form.Item>
          <Form.Item name="fechaCompra" label="Fecha de Compra"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="valorCompra" label="Valor de Compra (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="costoPorHora" label="Costo por Hora (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="costoPorDia" label="Costo por Día (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="disponible">
            <Select options={[{ value: 'disponible', label: 'Disponible' }, { value: 'en_uso', label: 'En Uso' }, { value: 'mantenimiento', label: 'Mantenimiento' }, { value: 'fuera_servicio', label: 'Fuera de Servicio' }]} />
          </Form.Item>
          <Form.Item name="proximoMantenimiento" label="Próx. Mantenimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
