import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import {
  Table, Button, Tag, Card, Row, Col, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, DatePicker, Space,
  Popconfirm, message, Drawer, Tabs, Badge, Progress,
  Timeline, theme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckOutlined,
  PhoneOutlined, MailOutlined, TeamOutlined,
  TrophyOutlined, FunnelPlotOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { TableActions } from '../../components/ui/TableActions';

const { Title, Text } = Typography;

// ── Enums / constants ─────────────────────────────────────────────────────────

const FUENTES = [
  { value: 'web',            label: '🌐 Web' },
  { value: 'referido',       label: '🤝 Referido' },
  { value: 'llamada',        label: '📞 Llamada' },
  { value: 'evento',         label: '🎪 Evento' },
  { value: 'redes_sociales', label: '📱 Redes sociales' },
  { value: 'email',          label: '📧 Email' },
  { value: 'otro',           label: '🔖 Otro' },
];

const ESTADOS_LEAD = [
  { value: 'nuevo',         label: 'Nuevo',          color: 'blue' },
  { value: 'contactado',    label: 'Contactado',     color: 'cyan' },
  { value: 'calificado',    label: 'Calificado',     color: 'green' },
  { value: 'no_calificado', label: 'No calificado',  color: 'default' },
  { value: 'convertido',    label: 'Convertido',     color: 'purple' },
];

const ETAPAS = [
  { value: 'prospecto',   label: 'Prospecto',   color: '#6b7280', pct: 10 },
  { value: 'contactado',  label: 'Contactado',  color: '#3b82f6', pct: 25 },
  { value: 'propuesta',   label: 'Propuesta',   color: '#f59e0b', pct: 50 },
  { value: 'negociacion', label: 'Negociación', color: '#f97316', pct: 75 },
  { value: 'ganado',      label: 'Ganado',      color: '#10b981', pct: 100 },
  { value: 'perdido',     label: 'Perdido',     color: '#ef4444', pct: 0 },
];

const TIPO_ACT = [
  { value: 'llamada', label: '📞 Llamada' },
  { value: 'email',   label: '📧 Email' },
  { value: 'reunion', label: '🤝 Reunión' },
  { value: 'nota',    label: '📝 Nota' },
  { value: 'tarea',   label: '✅ Tarea' },
  { value: 'demo',    label: '🖥️ Demo' },
];

const crmApi = {
  dashboard:          ()               => api.get('/crm/dashboard').then(r => r.data?.data ?? r.data),
  leads:              (p = 1, e?: string, f?: string) =>
    api.get(`/crm/leads?page=${p}${e ? `&estado=${e}` : ''}${f ? `&fuente=${f}` : ''}`).then(r => r.data?.data ?? r.data),
  crearLead:          (b: any)         => api.post('/crm/leads', b).then(r => r.data?.data ?? r.data),
  actualizarLead:     (id: number, b: any) => api.patch(`/crm/leads/${id}`, b).then(r => r.data?.data ?? r.data),
  eliminarLead:       (id: number)     => api.delete(`/crm/leads/${id}`).then(r => r.data?.data ?? r.data),
  oportunidades:      (etapa?: string) =>
    api.get(`/crm/oportunidades?limit=200${etapa ? `&etapa=${etapa}` : ''}`).then(r => r.data?.data ?? r.data),
  crearOport:         (b: any)         => api.post('/crm/oportunidades', b).then(r => r.data?.data ?? r.data),
  actualizarOport:    (id: number, b: any) => api.patch(`/crm/oportunidades/${id}`, b).then(r => r.data?.data ?? r.data),
  cambiarEtapa:       (id: number, etapa: string, motivo?: string) =>
    api.patch(`/crm/oportunidades/${id}/etapa`, { etapa, motivoPerdida: motivo }).then(r => r.data?.data ?? r.data),
  eliminarOport:      (id: number)     => api.delete(`/crm/oportunidades/${id}`).then(r => r.data?.data ?? r.data),
  actividades:        (leadId?: number, oportId?: number) =>
    api.get(`/crm/actividades${leadId ? `?leadId=${leadId}` : oportId ? `?oportunidadId=${oportId}` : ''}`).then(r => r.data?.data ?? r.data ?? []),
  crearActividad:     (b: any)         => api.post('/crm/actividades', b).then(r => r.data?.data ?? r.data),
  completarActividad: (id: number)     => api.patch(`/crm/actividades/${id}/completar`).then(r => r.data?.data ?? r.data),
};

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanCol({ etapa, items, onMover, onEditar, onEliminar }: {
  etapa: typeof ETAPAS[number];
  items: any[];
  onMover: (id: number, etapa: string) => void;
  onEditar: (o: any) => void;
  onEliminar: (id: number) => void;
}) {
  const { token } = theme.useToken();
  const total = items.reduce((s, o) => s + Number(o.valor ?? 0), 0);

  return (
    <div style={{ minWidth: 220, maxWidth: 240 }}>
      <div style={{
        padding: '8px 12px', borderRadius: '8px 8px 0 0',
        background: etapa.color, color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <Text strong style={{ color: '#fff', fontSize: 13 }}>{etapa.label}</Text>
        <Badge count={items.length} style={{ background: 'rgba(255,255,255,.3)' }} />
      </div>
      <div style={{
        background: token.colorFillAlter, borderRadius: '0 0 8px 8px',
        padding: 8, minHeight: 200, border: `1px solid ${token.colorBorderSecondary}`, borderTop: 0,
      }}>
        {items.map(o => (
          <motion.div key={o.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card size="small" style={{ marginBottom: 8, cursor: 'pointer', fontSize: 12 }}
              onClick={() => onEditar(o)}>
              <Text strong style={{ fontSize: 12 }}>{o.titulo}</Text>
              {o.empresa && <div><Text type="secondary" style={{ fontSize: 11 }}>{o.empresa}</Text></div>}
              <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ color: etapa.color, fontWeight: 600 }}>{fmt.money(o.valor)}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{o.probabilidad}%</Text>
              </div>
              {o.fechaCierreEsperada && (
                <div>
                  <Text type={new Date(o.fechaCierreEsperada) < new Date() ? 'danger' : 'secondary'}
                    style={{ fontSize: 10 }}>
                    📅 {fmt.date(o.fechaCierreEsperada)}
                  </Text>
                </div>
              )}
            </Card>
          </motion.div>
        ))}
        {items.length > 0 && (
          <div style={{ textAlign: 'right', paddingTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>{fmt.money(total)}</Text>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page principal ────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [estadoF, setEstadoF] = useState<string | undefined>();
  const [fuenteF, setFuenteF] = useState<string | undefined>();
  const [pageLead, setPageLead] = useState(1);
  const [leadModal, setLeadModal] = useState(false);
  const [oportModal, setOportModal] = useState(false);
  const [actModal,  setActModal]   = useState<{ leadId?: number; oportId?: number } | null>(null);
  const [editOport, setEditOport]  = useState<any>(null);
  const [editLead,  setEditLead]   = useState<any>(null);
  const [formLead]  = Form.useForm();
  const [formOport] = Form.useForm();
  const [formAct]   = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }      = useQuery({ queryKey: ['crm-dash'],                queryFn: crmApi.dashboard });
  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ['crm-leads', pageLead, estadoF, fuenteF],
    queryFn:  () => crmApi.leads(pageLead, estadoF, fuenteF),
  });
  const { data: oports }    = useQuery({ queryKey: ['crm-oports'],              queryFn: () => crmApi.oportunidades() });
  const { data: actividades } = useQuery({
    queryKey: ['crm-acts', actModal],
    queryFn:  () => crmApi.actividades(actModal?.leadId, actModal?.oportId),
    enabled: !!actModal,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['crm-leads'] });
    qc.invalidateQueries({ queryKey: ['crm-oports'] });
    qc.invalidateQueries({ queryKey: ['crm-dash'] });
  };

  const crearLeadMut = useMutation({
    mutationFn: crmApi.crearLead,
    onSuccess: () => { inv(); setLeadModal(false); formLead.resetFields(); message.success('Lead creado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const actLeadMut = useMutation({
    mutationFn: ({ id, data }: any) => crmApi.actualizarLead(id, data),
    onSuccess: () => { inv(); setEditLead(null); message.success('Lead actualizado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al actualizar'),
  });

  const elimLeadMut = useMutation({
    mutationFn: crmApi.eliminarLead,
    onSuccess: () => { inv(); message.success('Eliminado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al eliminar'),
  });

  const crearOportMut = useMutation({
    mutationFn: crmApi.crearOport,
    onSuccess: () => { inv(); setOportModal(false); formOport.resetFields(); message.success('Oportunidad creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const moverEtapaMut = useMutation({
    mutationFn: ({ id, etapa }: any) => crmApi.cambiarEtapa(id, etapa),
    onSuccess: () => inv(),
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al mover etapa'),
  });

  const crearActMut = useMutation({
    mutationFn: crmApi.crearActividad,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-acts'] });
      formAct.resetFields();
      message.success('Actividad registrada');
    },
  });

  const completarActMut = useMutation({
    mutationFn: crmApi.completarActividad,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-acts'] }),
  });

  // agrupar oportunidades por etapa
  const oportsByEtapa = ETAPAS.reduce((acc, e) => {
    acc[e.value] = (oports?.data ?? []).filter((o: any) => o.etapa === e.value);
    return acc;
  }, {} as Record<string, any[]>);

  const COLS_DEF = [
    { key: 'nombre',         label: 'Nombre',  defaultVisible: true  },
    { key: 'empresa',        label: 'Empresa', defaultVisible: true  },
    { key: 'email',          label: 'Email',   defaultVisible: true  },
    { key: 'fuente',         label: 'Fuente',  defaultVisible: true  },
    { key: 'valorEstimado',  label: 'Valor',   defaultVisible: true  },
    { key: 'estado',         label: 'Estado',  defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('crm', COLS_DEF);

  const colsLeads = [
    { title: 'Nombre',   dataIndex: 'nombre',   ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => { setEditLead(r); formLead.setFieldsValue(r); }}>
          {v}
        </Button>
      )},
    { title: 'Empresa',  dataIndex: 'empresa',  ellipsis: true, render: (v: string) => v ?? '—' },
    { title: 'Email',    dataIndex: 'email',    ellipsis: true, render: (v: string) => v ?? '—' },
    { title: 'Fuente',   dataIndex: 'fuente',   width: 140,
      render: (v: string) => FUENTES.find(f => f.value === v)?.label ?? v },
    { title: 'Valor',    dataIndex: 'valorEstimado', width: 120,
      render: (v: number) => v ? fmt.money(v) : '—' },
    { title: 'Estado',   dataIndex: 'estado',   width: 120,
      render: (v: string) => {
        const e = ESTADOS_LEAD.find(s => s.value === v);
        return <Tag color={e?.color}>{e?.label ?? v}</Tag>;
      }},
    { title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setActModal({ leadId: r.id })}
          viewLabel="Ver actividades"
          items={[
            { key: 'delete', label: 'Eliminar', danger: true, icon: <DeleteOutlined />,
              onClick: () => elimLeadMut.mutate(r.id) },
          ]}
        />
      )},
  ];

  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="CRM / Leads" planMinimo={config.planMinimo} planActual={plan} />;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>CRM · Gestión Comercial</Title>

      {/* ── KPIs ── */}
      {dash && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          {[
            { title: 'Total leads',         value: dash.totalLeads,     icon: <TeamOutlined />,       color: '#1677ff' },
            { title: 'Calificados',          value: dash.leadsCali,      icon: <FunnelPlotOutlined />, color: '#10b981' },
            { title: 'Convertidos',          value: dash.leadsConvert,   icon: <TrophyOutlined />,     color: '#7c3aed' },
            { title: 'Tasa conversión',      value: `${dash.tasaConversion}%`, color: '#f59e0b' },
            { title: 'Pipeline total',       value: fmt.money(dash.valorPipeline), color: '#1677ff' },
            { title: 'Ganadas este mes',     value: dash.ganadasMes,     icon: <TrophyOutlined />,     color: '#10b981' },
          ].map((k, i) => (
            <Col xs={12} md={4} key={i}>
              <Card size="small">
                <Statistic title={k.title} value={k.value}
                  prefix={k.icon} valueStyle={{ color: k.color, fontSize: 18 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Tabs items={[
        // ── PIPELINE (KANBAN) ────────────────────────────────────────────────
        {
          key: 'pipeline',
          label: <><FunnelPlotOutlined /> Pipeline</>,
          children: (
            <div>
              <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                <Button icon={<FileExcelOutlined />} onClick={() => {
                  const filas = (leads?.data ?? []).map((l: any) => ({
                    'Nombre':    l.nombre ?? '',
                    'Empresa':   l.empresa ?? '',
                    'Email':     l.email ?? '',
                    'Teléfono':  l.telefono ?? '',
                    'Etapa':     l.etapa ?? l.estado ?? '',
                    'Valor':     Number(l.valorEstimado ?? l.monto ?? 0),
                    'Fuente':    l.fuente ?? '',
                    'Propietario':l.propietario?.nombre ?? l.vendedor?.nombre ?? '',
                  }));
                  exportarExcel(filas, `CRM-Leads-${dayjs().format('YYYY-MM-DD')}`);
                }}>Excel leads</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOportModal(true); formOport.resetFields(); }}>
                  Nueva oportunidad
                </Button>
              </Row>
              <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, minWidth: 'max-content' }}>
                  {ETAPAS.map(etapa => (
                    <KanbanCol
                      key={etapa.value}
                      etapa={etapa}
                      items={oportsByEtapa[etapa.value] ?? []}
                      onMover={(id, e) => moverEtapaMut.mutate({ id, etapa: e })}
                      onEditar={(o) => { setEditOport(o); }}
                      onEliminar={(id) => crmApi.eliminarOport(id).then(() => inv())}
                    />
                  ))}
                </div>
              </div>
            </div>
          ),
        },

        // ── LEADS ────────────────────────────────────────────────────────────
        {
          key: 'leads',
          label: <><TeamOutlined /> Leads</>,
          children: (
            <Card extra={
              <Space>
                <Select placeholder="Estado" allowClear style={{ width: 140 }}
                  value={estadoF} onChange={v => { setEstadoF(v); setPageLead(1); }}
                  options={ESTADOS_LEAD.map(e => ({
                    value: e.value, label: <Tag color={e.color}>{e.label}</Tag>,
                  }))} />
                <Select placeholder="Fuente" allowClear style={{ width: 150 }}
                  value={fuenteF} onChange={v => { setFuenteF(v); setPageLead(1); }}
                  options={FUENTES} />
                <Button type="primary" icon={<PlusOutlined />}
                  onClick={() => { setLeadModal(true); formLead.resetFields(); }}>
                  Nuevo lead
                </Button>
                <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
              </Space>
            }>
              <Table columns={filterColumns(colsLeads)} dataSource={leads?.data ?? []} rowKey="id"
                loading={loadingLeads} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: leads?.meta?.total, pageSize: 10, current: pageLead,
                              onChange: setPageLead, showSizeChanger: false }} />
            </Card>
          ),
        },

        // ── FUENTES ──────────────────────────────────────────────────────────
        {
          key: 'fuentes',
          label: '📊 Por fuente',
          children: (
            <Card title="Distribución de leads por fuente">
              <Row gutter={[12, 12]}>
                {(dash?.porFuente ?? []).map((f: any, i: number) => {
                  const label = FUENTES.find(x => x.value === f.fuente)?.label ?? f.fuente;
                  const pct   = dash?.totalLeads > 0 ? Math.round((f.cantidad / dash.totalLeads) * 100) : 0;
                  return (
                    <Col span={24} key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ width: 160 }}>{label}</Text>
                        <Progress percent={pct} style={{ flex: 1 }} format={() => `${f.cantidad} leads`} />
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          ),
        },
      ]} />

      {/* ── Modal nuevo lead ── */}
      <Modal title="Nuevo Lead" open={leadModal} onCancel={() => setLeadModal(false)} footer={null} width={560}>
        <Form form={formLead} layout="vertical" onFinish={v => crearLeadMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="nombre"  label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="empresa" label="Empresa"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="email"   label="Email"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fuente"  label="Fuente">
              <Select options={FUENTES} defaultValue="web" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="valorEstimado" label="Valor estimado (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setLeadModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearLeadMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal nueva oportunidad ── */}
      <Modal title="Nueva Oportunidad" open={oportModal} onCancel={() => setOportModal(false)} footer={null} width={560}>
        <Form form={formOport} layout="vertical"
          initialValues={{ etapa: 'prospecto', probabilidad: 50 }}
          onFinish={v => crearOportMut.mutate({
            ...v,
            fechaCierreEsperada: v.fechaCierre?.format('YYYY-MM-DD'),
          })}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="titulo"  label="Título" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="empresa" label="Empresa"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="etapa"   label="Etapa">
              <Select options={ETAPAS.filter(e => !['ganado','perdido'].includes(e.value))
                .map(e => ({ value: e.value, label: e.label }))} />
            </Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="valor" label="Valor (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col xs={24} sm={7}><Form.Item name="probabilidad" label="Prob. (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item></Col>
            <Col xs={24} sm={7}><Form.Item name="fechaCierre" label="Cierre estimado">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción">
              <Input.TextArea rows={2} />
            </Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOportModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearOportMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Drawer editar oportunidad ── */}
      <Drawer title={editOport?.titulo} open={!!editOport} onClose={() => setEditOport(null)} width={480}
        extra={
          <Popconfirm title="¿Eliminar?" onConfirm={() => { crmApi.eliminarOport(editOport?.id).then(() => { inv(); setEditOport(null); }); }}>
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        }>
        {editOport && (
          <>
            <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
              <Col span={24}><Text type="secondary">Mover etapa:</Text></Col>
              {ETAPAS.map(e => (
                <Col key={e.value}>
                  <Button size="small"
                    type={editOport.etapa === e.value ? 'primary' : 'default'}
                    style={{ background: editOport.etapa === e.value ? e.color : undefined,
                             borderColor: e.color, color: editOport.etapa === e.value ? '#fff' : e.color }}
                    onClick={() => {
                      moverEtapaMut.mutate({ id: editOport.id, etapa: e.value });
                      setEditOport({ ...editOport, etapa: e.value });
                    }}>
                    {e.label}
                  </Button>
                </Col>
              ))}
            </Row>

            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Valor: </Text>
              <Text strong style={{ color: '#1677ff' }}>{fmt.money(editOport.valor)}</Text>
              {' · '}
              <Text type="secondary">Prob.: </Text>
              <Text strong>{editOport.probabilidad}%</Text>
            </div>

            <Button icon={<PhoneOutlined />} size="small" style={{ marginBottom: 12 }}
              onClick={() => setActModal({ oportId: editOport.id })}>
              Ver actividades
            </Button>
          </>
        )}
      </Drawer>

      {/* ── Drawer editar lead ── */}
      <Drawer title="Editar Lead" open={!!editLead} onClose={() => setEditLead(null)} width={460}>
        {editLead && (
          <Form form={formLead} layout="vertical"
            initialValues={editLead}
            onFinish={v => actLeadMut.mutate({ id: editLead.id, data: v })}>
            <Row gutter={12}>
              <Col span={24}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="empresa" label="Empresa"><Input /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="estado" label="Estado">
                <Select options={ESTADOS_LEAD.map(e => ({ value: e.value, label: e.label }))} />
              </Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="fuente" label="Fuente"><Select options={FUENTES} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="valorEstimado" label="Valor (RD$)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item></Col>
              <Col span={24}><Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item></Col>
            </Row>
            <Row justify="end" gutter={8}>
              <Col><Button onClick={() => setEditLead(null)}>Cancelar</Button></Col>
              <Col><Button type="primary" htmlType="submit" loading={actLeadMut.isPending}>Guardar</Button></Col>
            </Row>
          </Form>
        )}
      </Drawer>

      {/* ── Drawer actividades ── */}
      <Drawer title="Actividades" open={!!actModal} onClose={() => setActModal(null)} width={460}>
        <Form form={formAct} layout="vertical"
          initialValues={{ tipo: 'llamada', fecha: dayjs() }}
          onFinish={v => crearActMut.mutate({
            ...v,
            fecha:         v.fecha.toISOString(),
            leadId:        actModal?.leadId,
            oportunidadId: actModal?.oportId,
          })}>
          <Row gutter={8}>
            <Col xs={24} sm={10}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_ACT} /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="fecha" label="Fecha">
              <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
              <Input.TextArea rows={2} />
            </Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={crearActMut.isPending} icon={<PlusOutlined />} style={{ marginBottom: 20 }}>
            Registrar actividad
          </Button>
        </Form>

        <Timeline
          items={(actividades ?? []).map((a: any) => ({
            color: a.completada ? 'green' : 'blue',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 12 }}>
                    {TIPO_ACT.find(t => t.value === a.tipo)?.label ?? a.tipo}
                  </Text>
                  {!a.completada && (
                    <Button size="small" icon={<CheckOutlined />}
                      onClick={() => completarActMut.mutate(a.id)}>
                      Hecho
                    </Button>
                  )}
                </div>
                <div><Text style={{ fontSize: 12 }}>{a.descripcion}</Text></div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {dayjs(a.fecha).format('DD/MM/YYYY HH:mm')}
                  {a.completada && ' · ✅ Completada'}
                </Text>
              </div>
            ),
          }))}
        />
      </Drawer>
    </div>
  );
}
