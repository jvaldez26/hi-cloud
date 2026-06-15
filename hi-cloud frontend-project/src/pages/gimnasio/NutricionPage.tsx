import { useState } from 'react';
import { Table, Button, Modal, Form, Select, Input, InputNumber, message } from 'antd';
import { PlusOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function NutricionPage() {
  const [miembroFiltro, setMiembroFiltro] = useState<number | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-nutricion', miembroFiltro],
    queryFn: () => gimnasioApi.getNutricion(miembroFiltro ? { miembroId: miembroFiltro } : undefined),
  });
  const planes = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const crearMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.crearNutricion(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-nutricion'] }); message.success('Plan nutricional creado'); setModalOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const verPdf = async (id: number) => {
    try {
      const blob = await gimnasioApi.getNutricionPdf(id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      message.error('Error al obtener el PDF');
    }
  };

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre' },
    { title: 'Miembro', dataIndex: 'miembroNombre' },
    { title: 'Calorias Objetivo', dataIndex: 'caloriasObjetivo', render: (v: number) => v != null ? `${v} kcal` : '' },
    { title: 'Proteinas (g)', dataIndex: 'proteinasGramos' },
    { title: 'Carbos (g)', dataIndex: 'carbohidratosGramos' },
    { title: 'Grasas (g)', dataIndex: 'grasasGramos' },
    {
      title: 'Acciones', render: (_: any, r: any) => (
        <Button icon={<FilePdfOutlined />} size="small" onClick={() => verPdf(r.id)}>PDF</Button>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Planes Nutricionales</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>Nuevo Plan</Button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select style={{ width: 250 }} placeholder="Filtrar por miembro" allowClear showSearch optionFilterProp="children"
          value={miembroFiltro} onChange={v => setMiembroFiltro(v)}>
          {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
        </Select>
      </div>
      <Table dataSource={planes} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
      <Modal open={modalOpen} title="Nuevo Plan Nutricional"
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate(v))}
        confirmLoading={crearMut.isPending}
        width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre del Plan" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro">
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="caloriasObjetivo" label="Calorias Objetivo (kcal)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="proteinasGramos" label="Proteinas (g)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="carbohidratosGramos" label="Carbohidratos (g)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="grasasGramos" label="Grasas (g)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="objetivo" label="Objetivo"><Select><Select.Option value="perder_peso">Perder Peso</Select.Option><Select.Option value="ganar_masa">Ganar Masa</Select.Option><Select.Option value="mantenimiento">Mantenimiento</Select.Option></Select></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
