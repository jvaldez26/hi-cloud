import { useState } from 'react';
import { Table, Button, Input, Space, Tag, Typography, Modal, Form, Select, DatePicker, message, Row, Col } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { useNavigate } from 'react-router-dom';
import { fmt as fmtObj } from '../../utils/formatters';
import dayjs from 'dayjs';
const fmt = (v: any) => fmtObj.date(v);

const { Title } = Typography;
const { Option } = Select;

export default function PacientesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-pacientes', page, search],
    queryFn: () => clinicaApi.listarPacientes({ page, limit: 20, search: search || undefined }),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearPaciente({ ...vals, fechaNacimiento: vals.fechaNacimiento?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-pacientes'] }); setModal(null); message.success('Paciente creado'); },
    onError: () => message.error('Error al crear paciente'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarPaciente(selected?.id, { ...vals, fechaNacimiento: vals.fechaNacimiento?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-pacientes'] }); setModal(null); message.success('Paciente actualizado'); },
    onError: () => message.error('Error al actualizar'),
  });

  const openEditar = (r: any) => {
    setSelected(r);
    form.setFieldsValue({ ...r, fechaNacimiento: r.fechaNacimiento ? dayjs(r.fechaNacimiento) : undefined });
    setModal('editar');
  };

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 100 },
    { title: 'Nombre', key: 'nombre', render: (_: any, r: any) => `${r.nombre} ${r.apellidos ?? ''}`, ellipsis: true },
    { title: 'Cédula', dataIndex: 'cedula', width: 120 },
    { title: 'Teléfono', dataIndex: 'telefono', width: 120 },
    { title: 'ARS', dataIndex: 'arsNombre', width: 120, render: (v: any) => v ?? '—' },
    { title: 'Fecha Nac.', dataIndex: 'fechaNacimiento', width: 110, render: fmt },
    {
      title: 'Estado', dataIndex: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 120,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button icon={<EyeOutlined />} size="small" onClick={() => navigate(`/clinica/pacientes/${r.id}`)}>Ver</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />
        </Space>
      ),
    },
  ];

  const PacienteForm = () => (
    <>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="apellidos" label="Apellidos"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="cedula" label="Cédula"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="fechaNacimiento" label="Fecha Nacimiento"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="sexo" label="Sexo">
            <Select allowClear>
              <Option value="M">Masculino</Option>
              <Option value="F">Femenino</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="grupoSanguineo" label="Grupo Sanguíneo"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="telefonoEmergencia" label="Tel. Emergencia"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="contactoEmergencia" label="Contacto Emergencia"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="arsNombre" label="ARS Nombre"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="arsNumeroAfiliado" label="No. Afiliado ARS"><Input /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="arsTipo" label="Tipo ARS">
          <Select allowClear>
            <Option value="prepagada">Prepagada</Option>
            <Option value="subsidiada">Subsidiada</Option>
            <Option value="contributiva">Contributiva</Option>
          </Select>
        </Form.Item></Col>
        <Col span={12}><Form.Item name="arsPlan" label="Plan ARS"><Input /></Form.Item></Col>
      </Row>
      <Form.Item name="alergias" label="Alergias"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="medicamentosActuales" label="Medicamentos Actuales"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="antecedentesPersonales" label="Antecedentes Personales"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="antecedentesFamiliares" label="Antecedentes Familiares"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="direccion" label="Dirección"><Input /></Form.Item>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Pacientes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal('crear'); }}>Nuevo Paciente</Button>
      </div>

      <Input.Search
        prefix={<SearchOutlined />}
        placeholder="Buscar por nombre, cédula, código o teléfono..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ marginBottom: 16, maxWidth: 400 }}
        allowClear
      />

      <Table
        columns={cols}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `${t} pacientes`,
        }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nuevo Paciente' : 'Editar Paciente'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        width={700}
        okText="Guardar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <PacienteForm />
        </Form>
      </Modal>
    </div>
  );
}
