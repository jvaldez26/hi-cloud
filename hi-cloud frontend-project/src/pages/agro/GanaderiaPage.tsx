import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag, Space } from 'antd';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { agroApi } from '../../api/agro.api';

export default function GanaderiaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<any>({});

  const { data: resp, isLoading } = useQuery({
    queryKey: ['agro-animales', filters],
    queryFn: () => agroApi.getAnimales(filters),
  });
  const animales: any[] = (resp as any)?.data ?? resp ?? [];

  const { data: fincas = [] } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateAnimal(modal.item.id, vals) : agroApi.crearAnimal({
      ...vals,
      fechaNacimiento: vals.fechaNacimiento?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-animales'] }); setModal({ open: false }); message.success('Guardado'); form.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const estadoColor: Record<string, string> = { activo: 'green', vendido: 'blue', muerto: 'red', descartado: 'orange' };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Ganadería</h2>
        <Space>
          <Select placeholder="Tipo" allowClear style={{ width: 120 }} onChange={v => setFilters((f: any) => ({ ...f, tipo: v }))}
            options={[{ value: 'bovino', label: 'Bovino' }, { value: 'porcino', label: 'Porcino' }, { value: 'ovino', label: 'Ovino' }, { value: 'caprino', label: 'Caprino' }, { value: 'equino', label: 'Equino' }, { value: 'avicola', label: 'Avícola' }, { value: 'otro', label: 'Otro' }]} />
          <Select placeholder="Estado" allowClear style={{ width: 120 }} onChange={v => setFilters((f: any) => ({ ...f, estado: v }))}
            options={[{ value: 'activo', label: 'Activo' }, { value: 'vendido', label: 'Vendido' }, { value: 'muerto', label: 'Muerto' }]} />
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>Nuevo Animal</Button>
        </Space>
      </div>

      <Table loading={isLoading} dataSource={animales} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Arete', dataIndex: 'arete', key: 'ar' },
          { title: 'Nombre', dataIndex: 'nombre', key: 'n' },
          { title: 'Tipo', dataIndex: 'tipo', key: 't' },
          { title: 'Raza', dataIndex: 'raza', key: 'r' },
          { title: 'Sexo', dataIndex: 'sexo', key: 's', render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Nac.', dataIndex: 'fechaNacimiento', key: 'fn', render: (v: string) => v ? String(v).split('T')[0] : '-' },
          { title: 'Peso (kg)', dataIndex: 'pesoActual', key: 'pe' },
          { title: 'Propósito', dataIndex: 'proposito', key: 'pr' },
          { title: 'Estado', dataIndex: 'estado', key: 'est', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
          {
            title: '', key: 'acc', render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<Eye size={12} />} onClick={() => navigate(`/agro/ganaderia/${r.id}`)}>Ver</Button>
                <Button size="small" onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button>
              </Space>
            ),
          },
        ]} />

      <Modal open={modal.open} title={modal.item ? 'Editar Animal' : 'Registrar Animal'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fincaId" label="Finca">
            <Select options={(fincas as any[]).map((f: any) => ({ value: f.id, label: f.nombre }))} allowClear />
          </Form.Item>
          <Form.Item name="arete" label="Arete / Identificador" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nombre" label="Nombre"><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[{ value: 'bovino', label: 'Bovino' }, { value: 'porcino', label: 'Porcino' }, { value: 'ovino', label: 'Ovino' }, { value: 'caprino', label: 'Caprino' }, { value: 'equino', label: 'Equino' }, { value: 'avicola', label: 'Avícola' }, { value: 'otro', label: 'Otro' }]} />
          </Form.Item>
          <Form.Item name="raza" label="Raza"><Input /></Form.Item>
          <Form.Item name="sexo" label="Sexo" rules={[{ required: true }]}>
            <Select options={[{ value: 'macho', label: 'Macho' }, { value: 'hembra', label: 'Hembra' }]} />
          </Form.Item>
          <Form.Item name="fechaNacimiento" label="Fecha Nacimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="pesoNacimiento" label="Peso al Nacer (kg)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="pesoActual" label="Peso Actual (kg)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="proposito" label="Propósito">
            <Select allowClear options={[{ value: 'leche', label: 'Leche' }, { value: 'carne', label: 'Carne' }, { value: 'doble', label: 'Doble Propósito' }, { value: 'reproduccion', label: 'Reproducción' }, { value: 'trabajo', label: 'Trabajo' }]} />
          </Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="activo">
            <Select options={[{ value: 'activo', label: 'Activo' }, { value: 'vendido', label: 'Vendido' }, { value: 'muerto', label: 'Muerto' }, { value: 'descartado', label: 'Descartado' }]} />
          </Form.Item>
          <Form.Item name="colorPelaje" label="Color / Pelaje"><Input /></Form.Item>
          <Form.Item name="marcas" label="Marcas Distintivas"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
