import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, Input, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';

const { Title } = Typography;
const { Option } = Select;

const ESPECIALIDADES = [
  'Medicina General','Medicina Interna','Pediatría','Cardiología','Dermatología',
  'Endocrinología','Gastroenterología','Ginecología','Neurología','Oftalmología',
  'Ortopedia','Otorrinolaringología','Psiquiatría','Pulmonología','Reumatología',
  'Urología','Cirugía General','Cirugía Plástica','Traumatología','Oncología',
];

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];

export default function MedicosPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { data = [], isLoading } = useQuery({
    queryKey: ['clinica-medicos'],
    queryFn: () => clinicaApi.listarMedicos(),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearMedico(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-medicos'] }); setModal(null); message.success('Médico creado'); },
    onError: () => message.error('Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarMedico(selected?.id, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-medicos'] }); setModal(null); message.success('Actualizado'); },
    onError: () => message.error('Error'),
  });

  const openEditar = (r: any) => { setSelected(r); form.setFieldsValue(r); setModal('editar'); };

  const cols = [
    { title: 'Nombre', key: 'nom', render: (_: any, r: any) => `${r.nombre} ${r.apellidos ?? ''}`, ellipsis: true },
    { title: 'Especialidad', dataIndex: 'especialidad', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Exequatur', dataIndex: 'exequatur', width: 120, render: (v: any) => v ?? '—' },
    { title: 'Teléfono', dataIndex: 'telefono', width: 120 },
    { title: 'Email', dataIndex: 'email', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Tarifa Consulta', dataIndex: 'tarifaConsulta', width: 130, render: (v: any) => v ? `RD$${v}` : '—' },
    {
      title: 'Estado', dataIndex: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v !== false ? 'green' : 'default'}>{v !== false ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 80,
      render: (_: any, r: any) => <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />,
    },
  ];

  const MedicoForm = () => (
    <>
      <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="apellidos" label="Apellidos"><Input /></Form.Item>
      <Form.Item name="especialidad" label="Especialidad">
        <Select showSearch allowClear>
          {ESPECIALIDADES.map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="subespecialidad" label="Subespecialidad"><Input /></Form.Item>
      <Form.Item name="exequatur" label="Exequatur"><Input /></Form.Item>
      <Form.Item name="colegiatura" label="No. Colegiatura"><Input /></Form.Item>
      <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
      <Form.Item name="email" label="Email"><Input /></Form.Item>
      <Form.Item name="tarifaConsulta" label="Tarifa Consulta (RD$)">
        <InputNumber style={{ width: '100%' }} min={0} step={100} />
      </Form.Item>
      <Title level={5} style={{ marginTop: 8 }}>Horario</Title>
      {DIAS.map(d => (
        <Form.Item key={d} name={`horario${d.charAt(0).toUpperCase() + d.slice(1)}`} label={d.charAt(0).toUpperCase() + d.slice(1)}>
          <Input placeholder="ej: 08:00-12:00, 14:00-18:00" />
        </Form.Item>
      ))}
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Médicos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal('crear'); }}>Nuevo Médico</Button>
      </div>

      <Table
        columns={cols}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showTotal: t => `${t} médicos` }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nuevo Médico' : 'Editar Médico'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText="Guardar"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <MedicoForm />
        </Form>
      </Modal>
    </div>
  );
}
