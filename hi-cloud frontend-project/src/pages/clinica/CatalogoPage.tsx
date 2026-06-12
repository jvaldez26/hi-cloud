import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, Input, InputNumber, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
const fmtMoney = (v: any) => fmtObj.money(v);

const { Title } = Typography;
const { Option } = Select;

const ESPECIALIDADES = [
  'Medicina General','Medicina Interna','Pediatría','Cardiología','Dermatología',
  'Endocrinología','Gastroenterología','Ginecología','Neurología','Ortopedia',
  'Laboratorio','Radiología','Cirugía',
];

export default function CatalogoPage() {
  const qc = useQueryClient();
  const [especialidad, setEspecialidad] = useState<string | undefined>();
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { data = [], isLoading } = useQuery({
    queryKey: ['clinica-catalogo', especialidad],
    queryFn: () => clinicaApi.listarCatalogo({ especialidad }),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearCatalogo(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-catalogo'] }); setModal(null); message.success('Servicio creado'); },
    onError: () => message.error('Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarCatalogo(selected?.id, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-catalogo'] }); setModal(null); message.success('Actualizado'); },
    onError: () => message.error('Error'),
  });

  const openEditar = (r: any) => { setSelected(r); form.setFieldsValue(r); setModal('editar'); };

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 100, render: (v: any) => v ?? '—' },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'Especialidad', dataIndex: 'especialidad', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Precio', dataIndex: 'precio', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Precio ARS', dataIndex: 'precioArs', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Duración', dataIndex: 'duracionMinutos', width: 90, render: (v: any) => `${v ?? 30} min` },
    {
      title: 'Req. Autorización', dataIndex: 'requiereAutorizacion', width: 130,
      render: (v: boolean) => v ? <Tag color="orange">Sí</Tag> : <Tag color="green">No</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v !== false ? 'green' : 'default'}>{v !== false ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 80,
      render: (_: any, r: any) => <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />,
    },
  ];

  const CatForm = () => (
    <>
      <Form.Item name="codigo" label="Código"><Input /></Form.Item>
      <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="especialidad" label="Especialidad">
        <Select showSearch allowClear>
          {ESPECIALIDADES.map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="precio" label="Precio (RD$)">
        <InputNumber style={{ width: '100%' }} min={0} step={100} />
      </Form.Item>
      <Form.Item name="precioArs" label="Precio ARS (RD$)">
        <InputNumber style={{ width: '100%' }} min={0} step={100} />
      </Form.Item>
      <Form.Item name="duracionMinutos" label="Duración (min)">
        <Select>{[10,15,20,30,45,60,90,120].map(d => <Option key={d} value={d}>{d} min</Option>)}</Select>
      </Form.Item>
      <Form.Item name="requiereAutorizacion" label="Requiere Autorización ARS" valuePropName="checked">
        <Switch />
      </Form.Item>
      {modal === 'editar' && (
        <Form.Item name="isActive" label="Activo" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Catálogo de Servicios</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ duracionMinutos: 30, requiereAutorizacion: false, isActive: true }); setModal('crear'); }}>
          Nuevo Servicio
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar especialidad" allowClear style={{ width: 200 }} value={especialidad} onChange={v => setEspecialidad(v)}>
          {ESPECIALIDADES.map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Space>

      <Table
        columns={cols}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showTotal: t => `${t} servicios` }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nuevo Servicio' : 'Editar Servicio'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText="Guardar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <CatForm />
        </Form>
      </Modal>
    </div>
  );
}
