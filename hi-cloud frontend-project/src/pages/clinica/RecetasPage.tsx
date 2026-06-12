import { useState } from 'react';
import { Table, Button, Space, Typography, Modal, Form, Select, DatePicker, Input, message, Divider, InputNumber } from 'antd';
import { PlusOutlined, FilePdfOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import dayjs from 'dayjs';
const fmt = (v: any) => fmtObj.date(v);

const { Title } = Typography;
const { Option } = Select;

export default function RecetasPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-recetas', page],
    queryFn: () => clinicaApi.listarRecetas({ page, limit: 20 }),
  });

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });
  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 500 }) });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearReceta({
      ...vals,
      fecha: vals.fecha.format('YYYY-MM-DD'),
      fechaVencimiento: vals.fechaVencimiento?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-recetas'] }); setModal(false); message.success('Receta creada'); },
    onError: () => message.error('Error al crear receta'),
  });

  const abrirPdf = async (id: number) => {
    const blob = await clinicaApi.recetaPdf(id);
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 120 },
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}` },
    { title: 'Médico', dataIndex: 'medicoNombre', ellipsis: true },
    { title: 'Diagnóstico', dataIndex: 'diagnostico', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Vence', dataIndex: 'fechaVencimiento', width: 100, render: (v: any) => v ? fmt(v) : '—' },
    {
      title: 'Acciones', key: 'act', width: 100,
      render: (_: any, r: any) => (
        <Button icon={<FilePdfOutlined />} size="small" onClick={() => abrirPdf(r.id)}>PDF</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Recetas Médicas</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>Nueva Receta</Button>
      </div>

      <Table
        columns={cols}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showTotal: (t) => `${t} recetas` }}
      />

      <Modal
        open={modal}
        title="Nueva Receta"
        onCancel={() => setModal(false)}
        onOk={() => form.validateFields().then(vals => crear.mutate(vals))}
        confirmLoading={crear.isPending}
        okText="Guardar"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ medicamentos: [{}], fecha: dayjs() }}>
          <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Seleccionar paciente">
              {(pacientes?.data ?? []).map((p: any) => (
                <Option key={p.id} value={p.id} label={`${p.nombre} ${p.apellidos ?? ''}`}>
                  {p.nombre} {p.apellidos} — {p.cedula ?? ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="medicoId" label="Médico" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar médico">
              {medicos.map((m: any) => <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha Vencimiento">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="diagnostico" label="Diagnóstico"><Input /></Form.Item>

          <Divider orientation="left">Medicamentos</Divider>

          <Form.List name="medicamentos">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <div key={key} style={{ border: '1px solid #f0f0f0', padding: 8, marginBottom: 8, borderRadius: 4 }}>
                    <Form.Item name={[name, 'medicamento']} label="Medicamento" rules={[{ required: true }]}>
                      <Input placeholder="Nombre del medicamento" />
                    </Form.Item>
                    <Space style={{ display: 'flex', width: '100%' }} align="baseline">
                      <Form.Item name={[name, 'concentracion']} label="Concentración" style={{ flex: 1 }}>
                        <Input placeholder="ej: 500mg" />
                      </Form.Item>
                      <Form.Item name={[name, 'forma']} label="Forma" style={{ flex: 1 }}>
                        <Select allowClear placeholder="Forma">
                          {['Tableta','Cápsula','Jarabe','Suspensión','Inyectable','Gotas','Crema','Parche','Supositorio'].map(f =>
                            <Option key={f} value={f}>{f}</Option>
                          )}
                        </Select>
                      </Form.Item>
                      <Form.Item name={[name, 'via']} label="Vía" style={{ flex: 1 }}>
                        <Select allowClear placeholder="Vía">
                          {['Oral','IV','IM','SC','Tópica','Inhalatoria','Sublingual'].map(v =>
                            <Option key={v} value={v}>{v}</Option>
                          )}
                        </Select>
                      </Form.Item>
                    </Space>
                    <Space style={{ display: 'flex', width: '100%' }} align="baseline">
                      <Form.Item name={[name, 'dosis']} label="Dosis" style={{ flex: 1 }}><Input placeholder="ej: 1 tableta" /></Form.Item>
                      <Form.Item name={[name, 'frecuencia']} label="Frecuencia" style={{ flex: 1 }}><Input placeholder="ej: cada 8 horas" /></Form.Item>
                      <Form.Item name={[name, 'duracion']} label="Duración" style={{ flex: 1 }}><Input placeholder="ej: 7 días" /></Form.Item>
                      <Form.Item name={[name, 'cantidad']} label="Cant." style={{ width: 70 }}>
                        <InputNumber style={{ width: '100%' }} min={1} />
                      </Form.Item>
                    </Space>
                    <Form.Item name={[name, 'indicaciones']} label="Indicaciones especiales">
                      <Input />
                    </Form.Item>
                    <Button icon={<MinusCircleOutlined />} size="small" danger onClick={() => remove(name)}>Quitar</Button>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Agregar Medicamento</Button>
              </>
            )}
          </Form.List>

          <Form.Item name="indicacionesGenerales" label="Indicaciones Generales" style={{ marginTop: 8 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
