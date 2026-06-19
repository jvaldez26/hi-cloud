import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, theme, Space, Tag } from 'antd';
import { Plus, Edit } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function FincasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();

  const { data: fincas = [], isLoading } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateFinca(modal.item.id, vals) : agroApi.crearFinca(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-fincas'] }); setModal({ open: false }); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const openCreate = () => { form.resetFields(); setModal({ open: true }); };
  const openEdit   = (item: any) => { form.setFieldsValue(item); setModal({ open: true, item }); };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Fincas / Propiedades</h2>
        <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>Nueva Finca</Button>
      </div>

      <Table loading={isLoading} dataSource={fincas as any[]} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', render: (v: string, r: any) => <a onClick={() => openEdit(r)}>{v}</a> },
          { title: 'Provincia', dataIndex: 'provincia', key: 'provincia' },
          { title: 'Municipio', dataIndex: 'municipio', key: 'municipio' },
          { title: 'Área', key: 'area', render: (_: any, r: any) => r.areaTotal ? `${r.areaTotal} ${r.unidadArea ?? 'tareas'}` : '-' },
          { title: 'Riego', dataIndex: 'tieneRiego', key: 'riego', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
          { title: 'Encargado', dataIndex: 'encargado', key: 'enc' },
          { title: 'Parcelas', dataIndex: 'totalParcelas', key: 'parc' },
          { title: 'Activa', dataIndex: 'isActive', key: 'act', render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Sí' : 'No'}</Tag> },
          { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" icon={<Edit size={12} />} onClick={() => openEdit(r)}>Editar</Button> },
        ]} />

      <Modal open={modal.open} title={modal.item ? 'Editar Finca' : 'Nueva Finca'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="provincia" label="Provincia"><Input /></Form.Item>
          <Form.Item name="municipio" label="Municipio"><Input /></Form.Item>
          <Form.Item name="ubicacion" label="Dirección / Referencia"><Input /></Form.Item>
          <Space>
            <Form.Item name="areaTotal" label="Área Total"><InputNumber min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="unidadArea" label="Unidad" initialValue="tarea">
              <Select style={{ width: 120 }} options={[{ value: 'tarea', label: 'Tarea' }, { value: 'hectarea', label: 'Hectárea' }, { value: 'metro2', label: 'Metro²' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="tieneRiego" label="¿Tiene riego?" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="tipoRiego" label="Tipo de Riego">
            <Select allowClear options={[{ value: 'goteo', label: 'Goteo' }, { value: 'aspersion', label: 'Aspersión' }, { value: 'gravedad', label: 'Gravedad' }, { value: 'manual', label: 'Manual' }]} />
          </Form.Item>
          <Form.Item name="fuenteAgua" label="Fuente de Agua"><Input /></Form.Item>
          <Form.Item name="encargado" label="Encargado"><Input /></Form.Item>
          <Form.Item name="encargadoTelefono" label="Teléfono Encargado"><Input /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
