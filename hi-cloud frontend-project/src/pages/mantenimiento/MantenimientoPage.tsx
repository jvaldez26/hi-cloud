import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic, Button,
  Space, Modal, Form, Input, Select, DatePicker, InputNumber,
  Tabs, Popconfirm, message, Badge, Tooltip,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, StopOutlined, ToolOutlined, FileExcelOutlined,
  WarningOutlined, CalendarOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const mntApi = {
  dashboard:   ()               => api.get('/mantenimiento/dashboard').then(r => r.data?.data ?? r.data),
  ordenes:     (p = 1, e?: string) =>
    api.get(`/mantenimiento/ordenes?page=${p}${e ? `&estado=${e}` : ''}`).then(r => r.data?.data ?? r.data),
  crearOrden:  (b: any)         => api.post('/mantenimiento/ordenes', b).then(r => r.data?.data ?? r.data),
  completar:   (id: number, b: any) => api.patch(`/mantenimiento/ordenes/${id}/completar`, b).then(r => r.data?.data ?? r.data),
  cancelar:    (id: number)     => api.patch(`/mantenimiento/ordenes/${id}/cancelar`).then(r => r.data?.data ?? r.data),
  programas:   ()               => api.get('/mantenimiento/programas').then(r => r.data?.data ?? r.data),
  crearProg:   (b: any)         => api.post('/mantenimiento/programas', b).then(r => r.data?.data ?? r.data),
  elimProg:    (id: number)     => api.delete(`/mantenimiento/programas/${id}`).then(r => r.data?.data ?? r.data),
  activos:     ()               => api.get('/activos-fijos?limit=200').then(r => r.data.data?.data ?? []),
};

const ESTADO_MNT: Record<string, { label: string; color: string }> = {
  programado: { label: 'Programado', color: 'blue'    },
  en_proceso: { label: 'En proceso', color: 'orange'  },
  completado: { label: 'Completado', color: 'success' },
  cancelado:  { label: 'Cancelado',  color: 'default' },
  vencido:    { label: 'Vencido',    color: 'error'   },
};

const TIPO_MNT = [
  { value: 'preventivo',  label: '🔧 Preventivo' },
  { value: 'correctivo',  label: '🔨 Correctivo' },
  { value: 'predictivo',  label: '🔬 Predictivo' },
];

const PRIORIDAD = [
  { value: 'baja',    label: '🟢 Baja',    color: 'green'   },
  { value: 'media',   label: '🟡 Media',   color: 'gold'    },
  { value: 'alta',    label: '🟠 Alta',    color: 'orange'  },
  { value: 'critica', label: '🔴 Crítica', color: 'red'     },
];

export default function MantenimientoPage() {
  const [estadoF,      setEstadoF]      = useState<string | undefined>();
  const [pageOrd,      setPageOrd]      = useState(1);
  const [ordenModal,   setOrdenModal]   = useState(false);
  const [completModal, setCompletModal] = useState<any>(null);
  const [progModal,    setProgModal]    = useState(false);
  const [formOrd]  = Form.useForm();
  const [formComp] = Form.useForm();
  const [formProg] = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }     = useQuery({ queryKey: ['mnt-dash'],           queryFn: mntApi.dashboard });
  const { data: ordenes, isLoading } = useQuery({
    queryKey: ['mnt-ordenes', pageOrd, estadoF],
    queryFn:  () => mntApi.ordenes(pageOrd, estadoF),
  });
  const { data: programas } = useQuery({ queryKey: ['mnt-progs'],         queryFn: mntApi.programas });
  const { data: activos }   = useQuery({ queryKey: ['activos-mnt'],       queryFn: mntApi.activos });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['mnt-dash'] });
    qc.invalidateQueries({ queryKey: ['mnt-ordenes'] });
    qc.invalidateQueries({ queryKey: ['mnt-progs'] });
  };

  const crearOrdenMut = useMutation({
    mutationFn: mntApi.crearOrden,
    onSuccess: () => { inv(); setOrdenModal(false); formOrd.resetFields(); message.success('Orden creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const completarMut = useMutation({
    mutationFn: ({ id, data }: any) => mntApi.completar(id, data),
    onSuccess: () => { inv(); setCompletModal(null); message.success('Orden completada'); },
  });

  const cancelarMut = useMutation({
    mutationFn: mntApi.cancelar,
    onSuccess: () => { inv(); message.success('Orden cancelada'); },
  });

  const crearProgMut = useMutation({
    mutationFn: mntApi.crearProg,
    onSuccess: () => { inv(); setProgModal(false); formProg.resetFields(); message.success('Programa creado'); },
  });

  const activosOpts = (activos ?? []).map((a: any) => ({
    value: a.id, label: `${a.codigo} — ${a.descripcion}`,
  }));

  const cols = [
    { title: 'Número',   dataIndex: 'numero',      width: 130, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Activo',   key: 'act',               ellipsis: true, render: (_: any, r: any) => r.activo?.descripcion ?? '—' },
    { title: 'Tipo',     dataIndex: 'tipo',         width: 110, render: (v: string) => TIPO_MNT.find(t => t.value === v)?.label ?? v },
    { title: 'Prioridad',dataIndex: 'prioridad',    width: 100,
      render: (v: string) => {
        const p = PRIORIDAD.find(x => x.value === v);
        return <Tag color={p?.color}>{p?.label ?? v}</Tag>;
      }},
    { title: 'Programado',dataIndex:'fechaProgramada',width: 105, render: (v: string) => fmt.date(v) },
    { title: 'Estado',   dataIndex: 'estado',       width: 110,
      render: (v: string) => {
        const s = ESTADO_MNT[v] ?? { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }},
    { title: 'Costo est.',dataIndex: 'costoEstimado',width: 110, render: (v: number) => v ? fmt.money(v) : '—' },
    { title: '', key: 'actions', width: 120,
      render: (_: any, r: any) => (
        <Space size={4}>
          {(r.estado === 'programado' || r.estado === 'en_proceso') && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              style={{ background: '#10b981', border: 'none' }}
              onClick={() => { setCompletModal(r); formComp.resetFields(); }}>
              Completar
            </Button>
          )}
          {r.estado === 'programado' && (
            <Popconfirm title="¿Cancelar?" onConfirm={() => cancelarMut.mutate(r.id)}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
            Mantenimiento de Equipos
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<CalendarOutlined />} onClick={() => setProgModal(true)}>
              Programa preventivo
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (ordenes?.data ?? []).map((o: any) => ({
                'Número':    o.numero ?? '',
                'Equipo':    o.equipo ?? o.activo?.nombre ?? '',
                'Tipo':      o.tipo ?? '',
                'Prioridad': o.prioridad ?? '',
                'Estado':    o.estado ?? '',
                'Técnico':   o.tecnico ?? o.empleado?.nombre ?? '',
                'Fecha':     o.fechaProgramada ?? o.createdAt ?? '',
                'Costo':     Number(o.costoTotal ?? 0),
              }));
              exportarExcel(filas, 'Mantenimiento-Ordenes');
            }}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOrdenModal(true)}>
              Nueva orden
            </Button>
          </Space>
        </Col>
      </Row>

      {/* KPIs */}
      {dash && (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          {[
            { label: 'Programadas',    value: dash.programados,  color: '#3b82f6' },
            { label: 'En proceso',     value: dash.enProceso,    color: '#f59e0b' },
            { label: 'Completadas',    value: dash.completados,  color: '#10b981' },
            { label: 'Vencidas',       value: dash.vencidos,     color: '#ef4444' },
            { label: 'Próximas 7 días',value: dash.proximos7,    color: '#7c3aed' },
            { label: 'Costo mes',      value: fmt.money(dash.costoMes), color: '#1677ff', noFormat: true },
          ].map((k, i) => (
            <Col xs={12} md={4} key={i}>
              <Card size="small" style={{ borderTop: `3px solid ${k.color}` }}>
                <Statistic title={k.label} value={k.value}
                  valueStyle={{ color: k.color, fontSize: 18 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Tabs items={[
        {
          key: 'ordenes',
          label: <><ToolOutlined /> Órdenes</>,
          children: (
            <Card extra={
              <Select placeholder="Estado" allowClear style={{ width: 140 }}
                value={estadoF} onChange={v => { setEstadoF(v); setPageOrd(1); }}
                options={Object.entries(ESTADO_MNT).map(([v, s]) => ({
                  value: v, label: <Tag color={s.color}>{s.label}</Tag>,
                }))} />
            }>
              <Table columns={cols} dataSource={ordenes?.data ?? []} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: ordenes?.meta?.total, pageSize: 15, current: pageOrd,
                              onChange: setPageOrd, showSizeChanger: false }} />
            </Card>
          ),
        },
        {
          key: 'programas',
          label: <><CalendarOutlined /> Programas preventivos</>,
          children: (
            <Card>
              <Table
                size="small"
        scroll={{ x: 'max-content' }}
                dataSource={programas ?? []}
                rowKey="id"
                pagination={false}
                columns={[
                  { title: 'Activo',       key: 'act', ellipsis: true, render: (_: any, r: any) => r.activo?.descripcion },
                  { title: 'Tipo',         dataIndex: 'tipo',           render: (v: string) => TIPO_MNT.find(t => t.value === v)?.label },
                  { title: 'Descripción',  dataIndex: 'descripcion',    ellipsis: true },
                  { title: 'Frecuencia',   dataIndex: 'frecuenciaDias', width: 110, render: (v: number) => `Cada ${v} días` },
                  { title: 'Próximo',      dataIndex: 'proximoMantenimiento', width: 110,
                    render: (v: string) => v ? (
                      <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'}>{fmt.date(v)}</Text>
                    ) : '—' },
                  { title: '', key: 'del', width: 50,
                    render: (_: any, r: any) => (
                      <Popconfirm title="¿Eliminar programa?" onConfirm={() => {
                        mntApi.elimProg(r.id).then(() => inv());
                      }}>
                        <Button size="small" danger icon={<StopOutlined />} />
                      </Popconfirm>
                    )},
                ]}
              />
            </Card>
          ),
        },
        {
          key: 'alertas',
          label: <><WarningOutlined /> Alertas críticas</>,
          children: dash?.criticas?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dash.criticas.map((c: any) => (
                <Card key={c.id} size="small" style={{ borderLeft: '4px solid #ef4444' }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text strong>{c.activo?.descripcion ?? '—'}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {c.descripcion} · Programado: {fmt.date(c.fechaProgramada)}
                      </Text>
                    </Col>
                    <Col>
                      <Tag color="red">🔴 Crítica</Tag>
                    </Col>
                  </Row>
                </Card>
              ))}
            </div>
          ) : (
            <Card><Text type="secondary">No hay órdenes críticas pendientes.</Text></Card>
          ),
        },
      ]} />

      {/* Modal nueva orden */}
      <Modal title="Nueva Orden de Mantenimiento" open={ordenModal}
        onCancel={() => setOrdenModal(false)} footer={null} width={560}>
        <Form form={formOrd} layout="vertical"
          initialValues={{ tipo: 'preventivo', prioridad: 'media', fechaProgramada: dayjs() }}
          onFinish={v => crearOrdenMut.mutate({
            ...v, fechaProgramada: v.fechaProgramada.format('YYYY-MM-DD'),
          })}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="activoId" label="Activo / Equipo" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())} options={activosOpts} />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_MNT} /></Form.Item></Col>
            <Col span={12}><Form.Item name="prioridad" label="Prioridad">
              <Select options={PRIORIDAD.map(p => ({ value: p.value, label: p.label }))} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="fechaProgramada" label="Fecha programada" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="costoEstimado" label="Costo estimado (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="tecnico" label="Técnico responsable"><Input /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOrdenModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearOrdenMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal completar */}
      <Modal title={`Completar: ${completModal?.numero}`} open={!!completModal}
        onCancel={() => setCompletModal(null)} footer={null} width={440}>
        <Form form={formComp} layout="vertical"
          onFinish={v => completarMut.mutate({ id: completModal.id, data: v })}>
          <Form.Item name="costoReal" label="Costo real (RD$)">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="tecnico" label="Técnico que realizó"><Input /></Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={3} /></Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCompletModal(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" style={{ background: '#10b981', border: 'none' }}
              loading={completarMut.isPending} icon={<CheckOutlined />}>
              Marcar completado
            </Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal programa preventivo */}
      <Modal title="Nuevo Programa de Mantenimiento Preventivo" open={progModal}
        onCancel={() => setProgModal(false)} footer={null} width={500}>
        <Form form={formProg} layout="vertical"
          initialValues={{ tipo: 'preventivo', frecuenciaDias: 30 }}
          onFinish={v => crearProgMut.mutate(v)}>
          <Form.Item name="activoId" label="Activo / Equipo" rules={[{ required: true }]}>
            <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())} options={activosOpts} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_MNT} /></Form.Item></Col>
            <Col span={12}><Form.Item name="frecuenciaDias" label="Cada (días)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item></Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="costoEstimado" label="Costo estimado (RD$)">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setProgModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearProgMut.isPending}>Crear programa</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
