import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, DatePicker, Input, InputNumber, AutoComplete, message, Row, Col } from 'antd';
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
  pendiente: 'orange', aprobado: 'green', rechazado: 'red', parcial: 'gold',
};

const ARS_COMUNES = ['ARS Salud Segura','ARS Reservas','ARS APS','ARS Humano','ARS León','ARS Universal','ARS Constitución'];

export default function ArsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<string | undefined>();
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-ars', page, estado],
    queryFn: () => clinicaApi.listarArs({ page, limit: 20, estado }),
  });

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });
  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 500 }) });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearArs({ ...vals, fechaSolicitud: vals.fechaSolicitud?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-ars'] }); setModal(null); message.success('Solicitud creada'); },
    onError: () => message.error('Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarArs(selected?.id, { ...vals, fechaRespuesta: vals.fechaRespuesta?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-ars'] }); setModal(null); message.success('Actualizado'); },
    onError: () => message.error('Error'),
  });

  const openEditar = (r: any) => {
    setSelected(r);
    form.setFieldsValue({ ...r, fechaRespuesta: r.fechaRespuesta ? dayjs(r.fechaRespuesta) : undefined });
    setModal('editar');
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 120 },
    { title: 'Fecha', dataIndex: 'createdAt', width: 100, render: fmt },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}` },
    { title: 'ARS', dataIndex: 'arsNombre', ellipsis: true },
    { title: 'Tipo Servicio', dataIndex: 'tipoServicio', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Monto Aut.', dataIndex: 'montoAutorizado', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Cubierto', dataIndex: 'montoCubierto', width: 100, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Paciente Paga', dataIndex: 'montoPaciente', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 80,
      render: (_: any, r: any) => <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Autorizaciones ARS</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ fechaSolicitud: dayjs() }); setModal('crear'); }}>
          Nueva Solicitud
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar estado" allowClear style={{ width: 180 }} value={estado} onChange={v => { setEstado(v); setPage(1); }}>
          {['pendiente','aprobado','rechazado','parcial'].map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Space>

      <Table
        columns={cols}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showTotal: t => `${t} solicitudes` }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nueva Solicitud ARS' : 'Actualizar Autorización ARS'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText="Guardar"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          {modal === 'crear' && (
            <>
              <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" placeholder="Seleccionar paciente">
                  {(pacientes?.data ?? []).map((p: any) => <Option key={p.id} value={p.id} label={`${p.nombre} ${p.apellidos ?? ''}`}>{p.nombre} {p.apellidos} — {p.cedula ?? ''}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="medicoId" label="Médico (opcional)">
                <Select allowClear>{medicos.map((m: any) => <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos}</Option>)}</Select>
              </Form.Item>
              <Form.Item name="arsNombre" label="ARS" rules={[{ required: true }]}>
                <AutoComplete
                  options={ARS_COMUNES.map(a => ({ value: a }))}
                  placeholder="Seleccionar o escribir ARS"
                  filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item name="arsNumeroAfiliado" label="No. Afiliado"><Input /></Form.Item>
              <Form.Item name="tipoServicio" label="Tipo de Servicio">
                <Select allowClear>
                  {['consulta','laboratorio','procedimiento','radiologia','hospitalizacion','cirugia','urgencia'].map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="descripcion" label="Descripción del Servicio"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item name="fechaSolicitud" label="Fecha Solicitud">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </>
          )}
          {modal === 'editar' && (
            <>
              <Form.Item name="estado" label="Estado">
                <Select>
                  {['pendiente','aprobado','rechazado','parcial'].map(e => <Option key={e} value={e}>{e}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="codigoAutorizacion" label="Código de Autorización"><Input /></Form.Item>
              <Row gutter={12}>
                <Col span={8}><Form.Item name="montoAutorizado" label="Monto Autorizado"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item></Col>
                <Col span={8}><Form.Item name="montoCubierto" label="Monto Cubierto ARS"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item></Col>
                <Col span={8}><Form.Item name="montoPaciente" label="Monto Paciente"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item></Col>
              </Row>
              <Form.Item name="fechaRespuesta" label="Fecha Respuesta">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </>
          )}
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
