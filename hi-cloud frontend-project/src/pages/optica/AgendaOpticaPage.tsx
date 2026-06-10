import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Tag, Space, theme, DatePicker,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

const ESTADO_OPS = [
  { value: 'programada',  label: 'Programada'  },
  { value: 'confirmada',  label: 'Confirmada'  },
  { value: 'completada',  label: 'Completada'  },
  { value: 'cancelada',   label: 'Cancelada'   },
  { value: 'no_asistio',  label: 'No asistió'  },
];
const ESTADO_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', completada: 'green',
  cancelada: 'red', no_asistio: 'default',
};

export default function AgendaOpticaPage() {
  const { token } = theme.useToken();
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: citasData, isLoading } = useQuery({
    queryKey: ['optica-citas', filtroEstado],
    queryFn: () => opticaApi.citas({ limit: 200, estado: filtroEstado }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });
  const { data: medicosData } = useQuery({
    queryKey: ['optica-medicos'],
    queryFn: () => opticaApi.medicos(),
  });

  const citas     = (citasData?.data ?? citasData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];
  const medicos   = (medicosData as any[]) ?? [];

  const rows = citas.filter((c: any) =>
    `${c.pacienteNombre ?? ''} ${c.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteOpts = pacientes.map((p: any) => ({
    value: p.id, label: `${p.nombre} ${p.apellido}`,
  }));
  const medicoOpts = medicos.map((m: any) => ({
    value: m.id, label: `Dr(a). ${m.nombre} ${m.apellido}`,
  }));

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      fechaHora: r.fechaHora ? dayjs(r.fechaHora) : null,
    });
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const body = {
        ...v,
        fechaHora: v.fechaHora?.toISOString() ?? null,
      };
      return editing ? opticaApi.actualizarCita(editing.id, body) : opticaApi.crearCita(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-citas'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
      message.success(editing ? 'Cita actualizada' : 'Cita creada');
      closeModal();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    {
      title: 'Paciente', key: 'pac', ellipsis: true,
      render: (_: any, r: any) => r.pacienteNombre ?? '—',
    },
    {
      title: 'Fecha', dataIndex: 'fechaHora', width: 110,
      render: (v: string) => v ? fmt.date(v) : '—',
    },
    {
      title: 'Hora', dataIndex: 'fechaHora', width: 80, key: 'hora',
      render: (v: string) => v ? dayjs(v).format('HH:mm') : '—',
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 130, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => (
        <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ') ?? '—'}</Tag>
      ),
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => openEdit(r)}
          viewLabel="Editar"
          items={[]}
        />
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Agenda de Citas</Title>
      <Card>
        <Row justify="space-between" gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col>
            <Space wrap>
              <Input
                placeholder="Buscar por paciente o N°..."
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
                style={{ width: 240 }}
              />
              <Select
                placeholder="Filtrar estado"
                allowClear
                value={filtroEstado}
                onChange={v => setFiltro(v)}
                options={ESTADO_OPS}
                style={{ width: 160 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <RefreshByKeyButton queryKey={['optica-citas']} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva cita
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
        title={editing ? 'Editar Cita' : 'Nueva Cita'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={580}
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
              <Form.Item name="fechaHora" label="Fecha y hora" rules={[{ required: true }]}>
                <DatePicker
                  showTime={{ format: 'HH:mm', minuteStep: 15 }}
                  style={{ width: '100%' }}
                  format="DD/MM/YYYY HH:mm"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="duracionMinutos" label="Duración (min)">
                <Select allowClear options={[
                  { value: 15, label: '15 min' },
                  { value: 30, label: '30 min' },
                  { value: 45, label: '45 min' },
                  { value: 60, label: '1 hora' },
                  { value: 90, label: '1.5 horas' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tipo" label="Tipo de cita">
                <Select allowClear options={[
                  { value: 'consulta_general', label: 'Consulta general' },
                  { value: 'control',          label: 'Control' },
                  { value: 'entrega_lentes',   label: 'Entrega de lentes' },
                  { value: 'urgencia',         label: 'Urgencia' },
                ]} />
              </Form.Item>
            </Col>
            {editing && (
              <Col xs={24} sm={12}>
                <Form.Item name="estado" label="Estado">
                  <Select options={ESTADO_OPS} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24}>
              <Form.Item name="motivoConsulta" label="Motivo de consulta">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear cita'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
