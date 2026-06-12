import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, DatePicker, Input, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import dayjs from 'dayjs';
const fmt = (v: any) => fmtObj.date(v);
const fmtMoney = (v: any) => fmtObj.money(v);

const { Title } = Typography;
const { Option } = Select;

const ESTADO_COLOR: Record<string, string> = {
  programado: 'blue', en_progreso: 'orange', completado: 'green', cancelado: 'red',
};

export default function ProcedimientosPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<string | undefined>();
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-procedimientos', page, estado],
    queryFn: () => clinicaApi.listarProcedimientos({ page, limit: 20, estado }),
  });

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });
  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 500 }) });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearProcedimiento({ ...vals, fecha: vals.fecha.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-procedimientos'] }); setModal(null); message.success('Procedimiento creado'); },
    onError: () => message.error('Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarProcedimiento(selected?.id, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-procedimientos'] }); setModal(null); message.success('Actualizado'); },
    onError: () => message.error('Error al actualizar'),
  });

  const openEditar = (r: any) => {
    setSelected(r);
    form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : undefined });
    setModal('editar');
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 120 },
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}` },
    { title: 'Médico', dataIndex: 'medicoNombre', ellipsis: true },
    { title: 'Sala', dataIndex: 'sala', width: 80, render: (v: any) => v ?? '—' },
    { title: 'Costo', dataIndex: 'costo', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 80,
      render: (_: any, r: any) => <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />,
    },
  ];

  const ProcForm = ({ editar = false }) => (
    <>
      {!editar && (
        <>
          <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Seleccionar paciente">
              {(pacientes?.data ?? []).map((p: any) => <Option key={p.id} value={p.id} label={`${p.nombre} ${p.apellidos ?? ''}`}>{p.nombre} {p.apellidos} — {p.cedula ?? ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="medicoId" label="Médico" rules={[{ required: true }]}>
            <Select>{medicos.map((m: any) => <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </>
      )}
      <Form.Item name="nombre" label="Nombre del Procedimiento" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
      <Space style={{ display: 'flex' }}>
        <Form.Item name="duracionMinutos" label="Duración (min)" style={{ width: 140 }}>
          <InputNumber style={{ width: '100%' }} min={1} />
        </Form.Item>
        <Form.Item name="anestesia" label="Anestesia" style={{ flex: 1 }}>
          <Select allowClear>
            <Option value="general">General</Option>
            <Option value="local">Local</Option>
            <Option value="regional">Regional</Option>
            <Option value="sedacion">Sedación</Option>
            <Option value="ninguna">Ninguna</Option>
          </Select>
        </Form.Item>
        <Form.Item name="sala" label="Sala" style={{ width: 120 }}>
          <Input placeholder="ej: Q.1" />
        </Form.Item>
      </Space>
      <Space style={{ display: 'flex' }}>
        <Form.Item name="costo" label="Costo (RD$)" style={{ flex: 1 }}>
          <InputNumber style={{ width: '100%' }} min={0} step={100} />
        </Form.Item>
        <Form.Item name="estado" label="Estado" style={{ flex: 1 }}>
          <Select>
            <Option value="programado">Programado</Option>
            <Option value="en_progreso">En Progreso</Option>
            <Option value="completado">Completado</Option>
            <Option value="cancelado">Cancelado</Option>
          </Select>
        </Form.Item>
      </Space>
      {editar && (
        <Form.Item name="complicaciones" label="Complicaciones">
          <Input.TextArea rows={2} />
        </Form.Item>
      )}
      <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Procedimientos</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ estado: 'programado', fecha: dayjs() }); setModal('crear'); }}>
          Nuevo Procedimiento
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar estado" allowClear style={{ width: 180 }} value={estado} onChange={v => { setEstado(v); setPage(1); }}>
          {['programado','en_progreso','completado','cancelado'].map(e => <Option key={e} value={e}>{e.replace(/_/g, ' ')}</Option>)}
        </Select>
      </Space>

      <Table
        columns={cols}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showTotal: t => `${t} procedimientos` }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nuevo Procedimiento' : 'Editar Procedimiento'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText="Guardar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <ProcForm editar={modal === 'editar'} />
        </Form>
      </Modal>
    </div>
  );
}
