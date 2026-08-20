import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, DatePicker, Input, message, Switch, Divider } from 'antd';
import { PlusOutlined, FilePdfOutlined, CheckOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
const fmt = (v: any) => fmtObj.date(v);

const { Title } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'pac', label: 'Paciente', defaultVisible: true },
  { key: 'medicoNombre', label: 'Médico', defaultVisible: true },
  { key: 'laboratorioNombre', label: 'Laboratorio', defaultVisible: true },
  { key: 'urgente', label: 'Urgente', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'act', label: 'Acciones', defaultVisible: true },
];

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', en_proceso: 'blue', resultados_recibidos: 'green', completado: 'cyan',
};

const EXAMENES_COMUNES = [
  { categoria: 'Hematología', examenes: ['Hemograma completo','Hematocrito','Plaquetas','Tiempo de coagulación','VSG'] },
  { categoria: 'Química Sanguínea', examenes: ['Glucosa en ayunas','Glucosa postprandial','Creatinina','BUN','Ácido úrico','Colesterol total','HDL','LDL','Triglicéridos','TGO','TGP','Fosfatasa alcalina','Bilirrubinas'] },
  { categoria: 'Tiroides', examenes: ['TSH','T3 libre','T4 libre'] },
  { categoria: 'Orina', examenes: ['Uroanálisis','Urocultivo','Creatinina en orina'] },
  { categoria: 'Microbiología', examenes: ['Cultivo y antibiograma','Gram de esputo'] },
  { categoria: 'Inmunología', examenes: ['PCR','FR','ANA','ANCA'] },
];

export default function LaboratorioPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<string | undefined>();
  const [modal, setModal] = useState<'crear' | 'resultados' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();
  const [resForm] = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('clinica-lab', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-lab', page, estado],
    queryFn: () => clinicaApi.listarOrdenes({ page, limit: 20, estado }),
  });

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });
  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 500 }) });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearOrden({ ...vals, fecha: vals.fecha.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-lab'] }); setModal(null); message.success('Orden creada'); },
    onError: () => message.error('Error al crear orden'),
  });

  const guardarResultados = useMutation({
    mutationFn: ({ id, examenes }: { id: number; examenes: any[] }) => clinicaApi.registrarResultados(id, examenes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-lab'] }); setModal(null); message.success('Resultados registrados'); },
    onError: () => message.error('Error al guardar resultados'),
  });

  const abrirPdf = async (id: number) => {
    const blob = await clinicaApi.ordenPdf(id);
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const abrirResultados = async (r: any) => {
    const orden = await clinicaApi.obtenerOrden(r.id);
    setSelected(orden);
    resForm.setFieldsValue({ examenes: orden.examenes ?? [] });
    setModal('resultados');
  };

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'N°': r.numero,
      'Fecha': r.fecha,
      'Paciente': `${r.pacienteNombre} ${r.pacienteApellidos}`,
      'Médico': r.medicoNombre,
      'Laboratorio': r.laboratorioNombre ?? '',
      'Urgente': r.urgente ? 'Sí' : 'No',
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Laboratorio-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', key: 'numero', width: 120 },
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 100, render: fmt },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}` },
    { title: 'Médico', dataIndex: 'medicoNombre', key: 'medicoNombre', ellipsis: true },
    { title: 'Laboratorio', dataIndex: 'laboratorioNombre', key: 'laboratorioNombre', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Urgente', dataIndex: 'urgente', key: 'urgente', width: 80,
      render: (v: boolean) => v ? <Tag color="red">URGENTE</Tag> : null,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 160,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 140,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button icon={<FilePdfOutlined />} size="small" onClick={() => abrirPdf(r.id)}>PDF</Button>
          {r.estado !== 'resultados_recibidos' && (
            <Button icon={<CheckOutlined />} size="small" onClick={() => abrirResultados(r)}>Resultados</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Órdenes de Laboratorio</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['clinica-lab']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal('crear'); }}>Nueva Orden</Button>
        </div>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar por estado" allowClear style={{ width: 200 }} value={estado} onChange={v => { setEstado(v); setPage(1); }}>
          {['pendiente','en_proceso','resultados_recibidos','completado'].map(e => <Option key={e} value={e}>{e.replace(/_/g, ' ')}</Option>)}
        </Select>
      </Space>

      <Table
        columns={filterColumns(cols as any)}
        dataSource={data?.data ?? []}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 10, total: data?.total ?? 0, onChange: setPage, showTotal: t => `${t} órdenes` }}
      />

      {/* Modal Crear */}
      <Modal
        open={modal === 'crear'}
        title="Nueva Orden de Laboratorio"
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => crear.mutate(vals))}
        confirmLoading={crear.isPending}
        okText="Guardar"
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ fecha: dayjs(), urgente: false, examenes: [] }}>
          <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Seleccionar paciente">
              {(pacientes?.data ?? []).map((p: any) => <Option key={p.id} value={p.id} label={`${p.nombre} ${p.apellidos ?? ''}`}>{p.nombre} {p.apellidos} — {p.cedula ?? ''}</Option>)}
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
          <Form.Item name="urgente" label="Urgente" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="diagnosticoPresuntivo" label="Diagnóstico Presuntivo"><Input /></Form.Item>
          <Form.Item name="laboratorioNombre" label="Laboratorio"><Input /></Form.Item>
          <Form.Item name="indicaciones" label="Indicaciones"><Input.TextArea rows={2} /></Form.Item>

          <Divider orientation="left">Exámenes</Divider>

          <Form.List name="examenes">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item name={[name, 'categoria']} label="Categoría" style={{ width: 160 }}>
                      <Select allowClear placeholder="Cat.">
                        {EXAMENES_COMUNES.map(g => <Option key={g.categoria} value={g.categoria}>{g.categoria}</Option>)}
                      </Select>
                    </Form.Item>
                    <Form.Item name={[name, 'examen']} label="Examen" rules={[{ required: true }]} style={{ width: 280 }}>
                      <Input placeholder="Nombre del examen" />
                    </Form.Item>
                    <Button icon={<FilePdfOutlined />} size="small" danger onClick={() => remove(name)}>✕</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Agregar Examen</Button>
                <div style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary">Sugeridos: </Typography.Text>
                  {EXAMENES_COMUNES.slice(0, 2).flatMap(g => g.examenes.slice(0, 3)).map(e => (
                    <Button key={e} size="small" style={{ margin: 2 }} onClick={() => form.setFieldValue('examenes', [...(form.getFieldValue('examenes') ?? []), { examen: e }])}>
                      {e}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* Modal Resultados */}
      <Modal
        open={modal === 'resultados'}
        title={`Registrar Resultados — ${selected?.numero}`}
        onCancel={() => setModal(null)}
        onOk={() => resForm.validateFields().then(vals => guardarResultados.mutate({ id: selected.id, examenes: vals.examenes }))}
        confirmLoading={guardarResultados.isPending}
        okText="Guardar Resultados"
        width={700}
        destroyOnClose
      >
        <Form form={resForm} layout="vertical" size="small">
          <Form.List name="examenes">
            {(fields) => fields.map(({ key, name }) => (
              <div key={key} style={{ border: '1px solid #f0f0f0', padding: 8, marginBottom: 8, borderRadius: 4 }}>
                <Form.Item name={[name, 'examen']} label="Examen">
                  <Input disabled />
                </Form.Item>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name={[name, 'resultado']} label="Resultado" style={{ flex: 2 }}><Input /></Form.Item>
                  <Form.Item name={[name, 'unidad']} label="Unidad" style={{ flex: 1 }}><Input placeholder="mg/dL, U/L…" /></Form.Item>
                  <Form.Item name={[name, 'valorReferencia']} label="Referencia" style={{ flex: 2 }}><Input placeholder="ej: 70-100" /></Form.Item>
                </Space>
              </div>
            ))}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}

