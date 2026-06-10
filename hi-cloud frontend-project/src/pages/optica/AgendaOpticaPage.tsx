import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Tag, Space, theme, DatePicker, Tabs, Badge,
  List, Drawer, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, TableOutlined, CalendarOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Calendar } from 'antd';
import type { Dayjs } from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { useNavigate } from 'react-router-dom';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

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
const BADGE_STATUS: Record<string, any> = {
  programada: 'processing', confirmada: 'processing',
  completada: 'success', cancelada: 'error', no_asistio: 'default',
};

// ── Vista tabla ───────────────────────────────────────────────────────────────

function TablaView({
  citas, isLoading, search, setSearch, filtroEstado, setFiltro, token,
  openEdit, openCreate,
}: any) {
  const nav = useNavigate();
  const rows = citas.filter((c: any) =>
    `${c.pacienteNombre ?? ''} ${c.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    {
      title: 'Fecha / Hora', dataIndex: 'fechaHora', width: 145,
      render: (v: string) => v ? `${fmt.date(v)} ${dayjs(v).format('HH:mm')}` : '—',
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 130, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => (
        <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ') ?? '—'}</Tag>
      ),
    },
    {
      title: '', key: 'consulta', width: 50, align: 'center' as const,
      render: (_: any, r: any) => (
        <Tooltip title="Crear consulta desde esta cita">
          <Button
            size="small" type="link" icon={<MedicineBoxOutlined />}
            onClick={() => nav(`/optica/consultas?citaId=${r.id}&pacienteId=${r.pacienteId}`)}
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
    <>
      <Row justify="space-between" gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col>
          <Space wrap>
            <Input
              placeholder="Buscar..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search} onChange={e => setSearch(e.target.value)}
              allowClear style={{ width: 220 }}
            />
            <Select
              placeholder="Estado" allowClear value={filtroEstado}
              onChange={v => setFiltro(v)} options={ESTADO_OPS} style={{ width: 150 }}
            />
          </Space>
        </Col>
        <Col>
          <Space>
            <RefreshByKeyButton queryKey={['optica-citas']} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva cita</Button>
          </Space>
        </Col>
      </Row>
      <Table columns={cols} dataSource={rows} rowKey="id" loading={isLoading}
        size="small" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20 }} />
    </>
  );
}

// ── Vista calendario ──────────────────────────────────────────────────────────

function CalendarioView({ citas, openEdit, openCreate }: any) {
  const { token } = theme.useToken();
  const [selectedDay, setSelectedDay] = useState<Dayjs | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const citasPorDia = (citas as any[]).reduce((acc: Record<string, any[]>, c) => {
    if (!c.fechaHora) return acc;
    const key = dayjs(c.fechaHora).format('YYYY-MM-DD');
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const dateCellRender = (value: Dayjs) => {
    const key  = value.format('YYYY-MM-DD');
    const list = citasPorDia[key] ?? [];
    if (!list.length) return null;
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {list.slice(0, 3).map((c: any) => (
          <li key={c.id} style={{ overflow: 'hidden' }}>
            <Badge
              status={BADGE_STATUS[c.estado] ?? 'default'}
              text={
                <Text style={{ fontSize: 11 }} ellipsis>
                  {dayjs(c.fechaHora).format('HH:mm')} {c.pacienteNombre}
                </Text>
              }
            />
          </li>
        ))}
        {list.length > 3 && (
          <li>
            <Text type="secondary" style={{ fontSize: 11 }}>+{list.length - 3} más</Text>
          </li>
        )}
      </ul>
    );
  };

  const cellRender = (value: Dayjs, info: any) => {
    if (info.type === 'date') return dateCellRender(value);
    return info.originNode;
  };

  const onSelect = (day: Dayjs) => {
    setSelectedDay(day);
    const key = day.format('YYYY-MM-DD');
    if ((citasPorDia[key] ?? []).length > 0) setDrawerOpen(true);
  };

  const drawerCitas = selectedDay ? (citasPorDia[selectedDay.format('YYYY-MM-DD')] ?? []) : [];

  return (
    <>
      <Row justify="end" style={{ marginBottom: 8 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} size="small">
          Nueva cita
        </Button>
      </Row>

      <Calendar
        cellRender={cellRender}
        onSelect={onSelect}
        style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}
      />

      <Drawer
        title={selectedDay ? `Citas del ${selectedDay.format('DD/MM/YYYY')}` : ''}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={380}
      >
        <List
          dataSource={drawerCitas}
          renderItem={(c: any) => (
            <List.Item
              key={c.id}
              actions={[
                <Button size="small" type="link" onClick={() => { openEdit(c); setDrawerOpen(false); }}>
                  Editar
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{dayjs(c.fechaHora).format('HH:mm')}</Text>
                    <Text>{c.pacienteNombre}</Text>
                  </Space>
                }
                description={
                  <Space size={4}>
                    <Tag color={ESTADO_COLOR[c.estado] ?? 'default'} style={{ fontSize: 11 }}>
                      {c.estado?.replace('_', ' ')}
                    </Tag>
                    {c.tipo && <Text type="secondary" style={{ fontSize: 11 }}>{c.tipo}</Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </>
  );
}

// ── Modal cita ─────────────────────────────────────────────────────────────────

function CitaModal({ open, editing, form, pacienteOpts, medicoOpts, saveMut, onClose }: any) {
  return (
    <Modal
      title={editing ? 'Editar Cita' : 'Nueva Cita'}
      open={open} onCancel={onClose} footer={null} width={580}
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
              <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }}
                style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="duracionMinutos" label="Duración">
              <Select allowClear options={[
                { value: 15, label: '15 min' }, { value: 30, label: '30 min' },
                { value: 45, label: '45 min' }, { value: 60, label: '1 hora' },
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
          <Col><Button onClick={onClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
              {editing ? 'Guardar cambios' : 'Crear cita'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

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
    queryFn: () => opticaApi.citas({ limit: 500, estado: filtroEstado }),
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

  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));
  const medicoOpts   = medicos.map((m: any) => ({ value: m.id, label: `Dr(a). ${m.nombre} ${m.apellido}` }));

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => {
    setEditing(r);
    form.setFieldsValue({ ...r, fechaHora: r.fechaHora ? dayjs(r.fechaHora) : null });
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const body = { ...v, fechaHora: v.fechaHora?.toISOString() ?? null };
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

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Agenda de Citas</Title>
      <Card>
        <Tabs
          defaultActiveKey="tabla"
          items={[
            {
              key: 'tabla',
              label: <Space><TableOutlined />Lista</Space>,
              children: (
                <TablaView
                  citas={citas} isLoading={isLoading}
                  search={search} setSearch={setSearch}
                  filtroEstado={filtroEstado} setFiltro={setFiltro}
                  token={token} openEdit={openEdit} openCreate={openCreate}
                />
              ),
            },
            {
              key: 'calendario',
              label: <Space><CalendarOutlined />Calendario</Space>,
              children: (
                <CalendarioView citas={citas} openEdit={openEdit} openCreate={openCreate} />
              ),
            },
          ]}
        />
      </Card>

      <CitaModal
        open={open} editing={editing} form={form}
        pacienteOpts={pacienteOpts} medicoOpts={medicoOpts}
        saveMut={saveMut} onClose={closeModal}
      />
    </div>
  );
}
