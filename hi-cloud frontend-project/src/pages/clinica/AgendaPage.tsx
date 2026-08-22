import { useState } from 'react';
import { Card, Button, Select, Tag, Space, Typography, Modal, Form, DatePicker, TimePicker, Input, message, Table } from 'antd';
import { PlusOutlined, LeftOutlined, RightOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const { Title } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'hora', label: 'Hora', defaultVisible: true },
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'pac', label: 'Paciente', defaultVisible: true },
  { key: 'medicoNombre', label: 'Médico', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: false },
  { key: 'tipoCita', label: 'Tipo', defaultVisible: true },
  { key: 'motivo', label: 'Motivo', defaultVisible: false },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'act', label: 'Acciones', defaultVisible: true },
];

const ESTADO_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', en_sala: 'orange',
  en_consulta: 'green', completada: 'default', cancelada: 'red', no_asistio: 'red',
};

export default function AgendaPage() {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(dayjs().format('YYYY-MM-DD'));
  const [medicoId, setMedicoId] = useState<number | undefined>();
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('clinica-agenda', COLS_DEF);

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-citas', fecha, medicoId],
    queryFn: () => clinicaApi.listarCitas({ fecha, medicoId, limit: 100 }),
  });

  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 200 }) });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearCita({
      ...vals,
      fecha: vals.fecha.format('YYYY-MM-DD'),
      hora: vals.hora.format('HH:mm'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-citas'] }); setModal(false); message.success('Cita creada'); },
    onError: () => message.error('Error al crear cita'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => clinicaApi.cambiarEstadoCita(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica-citas'] }),
    onError: () => message.error('Error al cambiar estado'),
  });

  const avanzar = () => setFecha(dayjs(fecha).add(1, 'day').format('YYYY-MM-DD'));
  const retroceder = () => setFecha(dayjs(fecha).subtract(1, 'day').format('YYYY-MM-DD'));

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'Hora': r.hora,
      'N°': r.numero,
      'Paciente': `${r.pacienteNombre} ${r.pacienteApellidos}`,
      'Médico': r.medicoNombre,
      'Especialidad': r.especialidad ?? '',
      'Tipo Cita': r.tipoCita ?? '',
      'Motivo': r.motivo ?? '',
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Agenda-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const cols = [
    { title: 'Hora', dataIndex: 'hora', key: 'hora', width: 70 },
    { title: 'N°', dataIndex: 'numero', key: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}` },
    { title: 'Médico', dataIndex: 'medicoNombre', key: 'medicoNombre', ellipsis: true },
    { title: 'Especialidad', dataIndex: 'especialidad', key: 'especialidad', ellipsis: true },
    { title: 'Tipo', dataIndex: 'tipoCita', key: 'tipoCita', width: 110, render: (v: any) => v ?? '—' },
    { title: 'Motivo', dataIndex: 'motivo', key: 'motivo', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 120,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 200,
      render: (_: any, r: any) => (
        <Space size="small" wrap>
          {r.estado === 'programada' && (
            <Button size="small" onClick={() => cambiarEstado.mutate({ id: r.id, estado: 'en_sala' })}>En Sala</Button>
          )}
          {r.estado === 'en_sala' && (
            <Button size="small" type="primary" onClick={() => clinicaApi.iniciarConsulta(r.id).then(() => { qc.invalidateQueries({ queryKey: ['clinica-citas'] }); message.success('Consulta iniciada'); })}>
              Iniciar Consulta
            </Button>
          )}
          {r.estado !== 'completada' && r.estado !== 'cancelada' && (
            <Button size="small" danger onClick={() => cambiarEstado.mutate({ id: r.id, estado: 'cancelada' })}>Cancelar</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Agenda</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['clinica-citas']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ fecha: dayjs(fecha) }); setModal(true); }}>Nueva Cita</Button>
        </div>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button icon={<LeftOutlined />} onClick={retroceder} />
          <DatePicker
            value={dayjs(fecha)}
            onChange={d => d && setFecha(d.format('YYYY-MM-DD'))}
            format="DD/MM/YYYY"
            allowClear={false}
          />
          <Button icon={<RightOutlined />} onClick={avanzar} />
          <Button onClick={() => setFecha(dayjs().format('YYYY-MM-DD'))}>Hoy</Button>
          <Select
            placeholder="Todos los médicos"
            allowClear
            style={{ width: 220 }}
            value={medicoId}
            onChange={v => setMedicoId(v)}
          >
            {medicos.map((m: any) => (
              <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos} — {m.especialidad}</Option>
            ))}
          </Select>
          <span style={{ color: '#888' }}>{dayjs(fecha).format('dddd, D [de] MMMM [de] YYYY')}</span>
        </Space>
      </Card>

      <Table
        columns={filterColumns(cols as any)}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={false}
        locale={{ emptyText: 'Sin citas para este día' }}
      />

      <Modal
        open={modal}
        title="Nueva Cita"
        onCancel={() => setModal(false)}
        onOk={() => form.validateFields().then(vals => crear.mutate(vals))}
        confirmLoading={crear.isPending}
        okText="Guardar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ duracionMinutos: 30, prioridad: 'normal', estado: 'programada' }}>
          <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar paciente">
              {(pacientes?.data ?? []).map((p: any) => (
                <Option key={p.id} value={p.id}>{p.nombre} {p.apellidos} — {p.cedula ?? ''}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="medicoId" label="Médico" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar médico">
              {medicos.map((m: any) => (
                <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos} — {m.especialidad}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="hora" label="Hora" rules={[{ required: true }]}>
            <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={15} />
          </Form.Item>
          <Form.Item name="tipoCita" label="Tipo Cita">
            <Select allowClear>
              {['primera_vez','seguimiento','control','urgencia','procedimiento','teleconsulta'].map(t => (
                <Option key={t} value={t}>{t.replace(/_/g, ' ')}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="motivo" label="Motivo"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="prioridad" label="Prioridad">
            <Select>
              <Option value="normal">Normal</Option>
              <Option value="alta">Alta</Option>
              <Option value="urgente">Urgente</Option>
            </Select>
          </Form.Item>
          <Form.Item name="duracionMinutos" label="Duración (minutos)">
            <Select>
              {[15, 20, 30, 45, 60, 90, 120].map(d => <Option key={d} value={d}>{d} min</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
