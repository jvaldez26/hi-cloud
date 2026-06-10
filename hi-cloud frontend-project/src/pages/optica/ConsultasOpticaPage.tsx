import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Divider, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';

const { Title } = Typography;

export default function ConsultasOpticaPage() {
  const { token } = theme.useToken();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch]   = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

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
        ...(citaId ? { citaId: Number(citaId) } : {}),
      });
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue(r); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) =>
      editing ? opticaApi.actualizarConsulta(editing.id, v) : opticaApi.crearConsulta(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-consultas'] });
      message.success(editing ? 'Consulta actualizada' : 'Consulta creada');
      closeModal();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
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

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Consultas</Title>
      <Card>
        <Row justify="space-between" style={{ marginBottom: 12 }}>
          <Col>
            <Input
              placeholder="Buscar por paciente o N°..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
          </Col>
          <Col>
            <Space>
              <RefreshByKeyButton queryKey={['optica-consultas']} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva consulta
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={cols}
          dataSource={rows}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Editar Consulta' : 'Nueva Consulta'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={680}
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
              <Form.Item name="citaId" label="Cita asociada (ID)">
                <InputNumber style={{ width: '100%' }} min={1} />
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
              ['avOdLejos', 'AV OD Lejos'], ['avOiLejos', 'AV OI Lejos'],
              ['avOdCerca', 'AV OD Cerca'], ['avOiCerca', 'AV OI Cerca'],
            ].map(([name, label]) => (
              <Col xs={12} sm={6} key={name}>
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
