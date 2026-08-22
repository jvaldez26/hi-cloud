import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Divider, Tooltip, DatePicker,
} from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, SearchOutlined, FileTextOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import { hoyRD } from '../../utils/fechaRD';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'pac', label: 'Paciente', defaultVisible: true },
  { key: 'med', label: 'Médico', defaultVisible: true },
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'diagnostico', label: 'Diagnóstico', defaultVisible: true },
  { key: 'costoConsulta', label: 'Costo', defaultVisible: true },
  { key: 'quick', label: 'Receta', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function ConsultasOpticaPage() {
  const { token } = theme.useToken();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch]   = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('optica-consultas', COLS_DEF);

  const { data: consultasData, isLoading } = useQuery({
    queryKey: ['optica-consultas'],
    queryFn: () => opticaApi.consultas({ limit: 200 }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });
  const { data: medicosData } = useQuery({
    queryKey: ['optica-medicos'],
    queryFn: () => opticaApi.medicos(),
  });

  const consultas = (consultasData?.data ?? consultasData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];
  const medicos   = (medicosData as any[]) ?? [];

  const rows = consultas.filter((c: any) =>
    `${c.pacienteNombre ?? ''} ${c.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));
  const medicoOpts   = medicos.map((m: any) => ({ value: m.id, label: `Dr(a). ${m.nombre} ${m.apellido}` }));

  // Prefill desde URL params (quick-link desde cita)
  useEffect(() => {
    const pacienteId = searchParams.get('pacienteId');
    const citaId     = searchParams.get('citaId');
    if (pacienteId) {
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        pacienteId: Number(pacienteId),
        fecha: dayjs(),
        ...(citaId ? { citaId: Number(citaId) } : {}),
      });
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldValue('fecha', dayjs()); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : dayjs(), proximaCita: r.proximaCita ? dayjs(r.proximaCita) : undefined }); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        fecha: v.fecha ? dayjs(v.fecha).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        proximaCita: v.proximaCita ? dayjs(v.proximaCita).format('YYYY-MM-DD') : undefined,
      };
      return editing ? opticaApi.actualizarConsulta(editing.id, payload) : opticaApi.crearConsulta(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-consultas'] });
      message.success(editing ? 'Consulta actualizada' : 'Consulta creada');
      closeModal();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar consulta');
    },
  });

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    { title: 'Médico',   key: 'med', ellipsis: true, render: (_: any, r: any) => r.medicoNombre ? `Dr(a). ${r.medicoNombre}` : '—' },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Diagnóstico', dataIndex: 'diagnostico', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Costo', dataIndex: 'costoConsulta', width: 100, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: '', key: 'quick', width: 50, align: 'center' as const,
      render: (_: any, r: any) => (
        <Tooltip title="Crear receta desde esta consulta">
          <Button
            size="small" type="link" icon={<FileTextOutlined />}
            onClick={() => nav(`/optica/recetas?pacienteId=${r.pacienteId}&consultaId=${r.id}`)}
          />
        </Tooltip>
      ),
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions onView={() => openEdit(r)} viewLabel="Editar" items={[]} />
      ),
    },
  ];

  const exportar = () => {
    const filas = consultas.map((r: any) => ({
      'N°': r.numero ?? '',
      'Paciente': r.pacienteNombre ?? '',
      'Médico': r.medicoNombre ? `Dr(a). ${r.medicoNombre}` : '',
      'Fecha': r.fecha ?? '',
      'Diagnóstico': r.diagnostico ?? '',
      'Costo': r.costoConsulta ?? '',
    }));
    exportarExcel(filas, `Consultas-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Consultas</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Input
            placeholder="Buscar por paciente o N°..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['optica-consultas']} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Nueva consulta
            </Button>
          </div>
        </div>

        <Table
          columns={filterColumns(cols as any)}
          dataSource={rows}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editing ? 'Editar Consulta' : 'Nueva Consulta'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={860}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={pacienteOpts} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="medicoId" label="Médico">
                <Select showSearch optionFilterProp="label" options={medicoOpts} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: 'Selecciona la fecha' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="citaId" label="Cita asociada (ID)">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="motivoConsulta" label="Motivo de consulta">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="costoConsulta" label="Costo consulta">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>
            Agudeza visual
          </Divider>
          <Row gutter={12}>
            {[
              ['agudezaVisualOD', 'AV OD'], ['agudezaVisualOI', 'AV OI'],
              ['avOdLejos', 'AV OD Lejos'], ['avOiLejos', 'AV OI Lejos'],
              ['avOdCerca', 'AV OD Cerca'], ['avOiCerca', 'AV OI Cerca'],
            ].map(([name, label]) => (
              <Col xs={12} sm={4} key={name}>
                <Form.Item name={name} label={label}>
                  <Input placeholder="20/20" />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>
            Refracción OD
          </Divider>
          <Row gutter={12}>
            {[
              ['refEsferaOD', 'Esfera OD'], ['refCilindroOD', 'Cilindro OD'],
              ['refEjeOD', 'Eje OD'], ['refAdicionOD', 'Adición OD'],
            ].map(([name, label]) => (
              <Col xs={12} sm={6} key={name}>
                <Form.Item name={name} label={label}>
                  <InputNumber style={{ width: '100%' }} step={0.25} precision={2} />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>
            Refracción OI
          </Divider>
          <Row gutter={12}>
            {[
              ['refEsferaOI', 'Esfera OI'], ['refCilindroOI', 'Cilindro OI'],
              ['refEjeOI', 'Eje OI'], ['refAdicionOI', 'Adición OI'],
            ].map(([name, label]) => (
              <Col xs={12} sm={6} key={name}>
                <Form.Item name={name} label={label}>
                  <InputNumber style={{ width: '100%' }} step={0.25} precision={2} />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>
            Presión intraocular
          </Divider>
          <Row gutter={12}>
            <Col xs={12} sm={6}>
              <Form.Item name="presionOcularOD" label="PIO OD (mmHg)">
                <InputNumber style={{ width: '100%' }} min={0} precision={1} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="presionOcularOI" label="PIO OI (mmHg)">
                <InputNumber style={{ width: '100%' }} min={0} precision={1} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24}>
              <Form.Item name="diagnostico" label="Diagnóstico">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="tratamiento" label="Tratamiento">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="hallazgos" label="Hallazgos">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="proximaCita" label="Próxima cita">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear consulta'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

