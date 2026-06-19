import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, theme, Tag } from 'antd';
import { Plus, Edit } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function ParcelasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();

  const { data: parcelas = [], isLoading } = useQuery({ queryKey: ['agro-parcelas'], queryFn: () => agroApi.getParcelas() });
  const { data: fincas = [] } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateParcela(modal.item.id, vals) : agroApi.crearParcela(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-parcelas'] }); setModal({ open: false }); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const estadoColor: Record<string, string> = { disponible: 'green', sembrada: 'blue', en_descanso: 'orange', preparacion: 'purple' };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Parcelas / Lotes</h2>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>Nueva Parcela</Button>
      </div>

      <Table loading={isLoading} dataSource={parcelas as any[]} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre', key: 'n' },
          { title: 'Código', dataIndex: 'codigo', key: 'c' },
          { title: 'Área', key: 'a', render: (_: any, r: any) => r.area ? `${r.area} ${r.unidadArea}` : '-' },
          { title: 'Tipo Suelo', dataIndex: 'tipoSuelo', key: 'ts' },
          { title: 'Estado', dataIndex: 'estado', key: 'est', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
          { title: 'Cultivo Actual', dataIndex: 'cultivoActual', key: 'ca' },
          { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" icon={<Edit size={12} />} onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button> },
        ]} />

      <Modal open={modal.open} title={modal.item ? 'Editar Parcela' : 'Nueva Parcela'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fincaId" label="Finca">
            <Select options={(fincas as any[]).map((f: any) => ({ value: f.id, label: f.nombre }))} allowClear />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="codigo" label="Código"><Input /></Form.Item>
          <Form.Item name="area" label="Área"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="unidadArea" label="Unidad de Área" initialValue="tarea">
            <Select options={[{ value: 'tarea', label: 'Tarea' }, { value: 'hectarea', label: 'Hectárea' }]} />
          </Form.Item>
          <Form.Item name="tipoSuelo" label="Tipo de Suelo">
            <Select allowClear options={[{ value: 'arcilloso', label: 'Arcilloso' }, { value: 'arenoso', label: 'Arenoso' }, { value: 'franco', label: 'Franco' }, { value: 'limoso', label: 'Limoso' }]} />
          </Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="disponible">
            <Select options={[{ value: 'disponible', label: 'Disponible' }, { value: 'sembrada', label: 'Sembrada' }, { value: 'en_descanso', label: 'En Descanso' }, { value: 'preparacion', label: 'Preparación' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
