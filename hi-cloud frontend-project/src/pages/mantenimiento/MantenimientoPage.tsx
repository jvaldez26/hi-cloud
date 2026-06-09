import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Typography, Table, Tag, Button,
  Space, Modal, Form, Input, Select, DatePicker, InputNumber,
  Tabs, message, Badge, Tooltip, theme, Checkbox, Divider, Descriptions,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, StopOutlined, ToolOutlined, FileExcelOutlined,
  WarningOutlined, CalendarOutlined, ClockCircleOutlined, SearchOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
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
  const { token } = theme.useToken();
  const [search,       setSearch]       = useState('');
  const [estadoF,      setEstadoF]      = useState<string | undefined>();
  const [pageOrd,      setPageOrd]      = useState(1);
  const [ordenModal,        setOrdenModal]        = useState(false);
  const [completModal,      setCompletModal]      = useState<any>(null);
  const [visorModal,        setVisorModal]        = useState<any>(null);
  const [progModal,         setProgModal]         = useState(false);
  const [requiereRepuestos, setRequiereRepuestos] = useState(false);
  const [formOrd]  = Form.useForm();
  const [formComp] = Form.useForm();
  const [formProg] = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }     = useQuery({ queryKey: ['mnt-dash'],           queryFn: mntApi.dashboard });
  const { data: ordenes, isLoading } = useQuery({
    queryKey: ['mnt-ordenes', pageOrd, estadoF, search],
    queryFn:  () => mntApi.ordenes(pageOrd, estadoF),
  });

  const ordenesFiltradas = useMemo(() =>
    (ordenes?.data ?? []).filter((i: any) =>
      String(i.numero ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.activo?.descripcion ?? i.tecnico ?? '').toLowerCase().includes(search.toLowerCase())
    ), [ordenes, search]);
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
    onSuccess: () => {
      inv();
      setCompletModal(null);
      setRequiereRepuestos(false);
      message.success('Orden completada');
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? e?.message ?? 'Error al completar la orden'),
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

  const COLS_DEF = [
    { key: 'numero',         label: 'Número',     defaultVisible: true  },
    { key: 'act',            label: 'Activo',     defaultVisible: true  },
    { key: 'tipo',           label: 'Tipo',       defaultVisible: true  },
    { key: 'prioridad',      label: 'Prioridad',  defaultVisible: true  },
    { key: 'fechaProgramada',label: 'Programado', defaultVisible: true  },
    { key: 'estado',         label: 'Estado',     defaultVisible: true  },
    { key: 'costoEstimado',  label: 'Costo est.', defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('mantenimiento', COLS_DEF);

  const cols = [
    { title: 'Número',   dataIndex: 'numero',      key: 'numero',          width: 130, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Activo',   key: 'act',               ellipsis: true, render: (_: any, r: any) => r.activo?.descripcion ?? '—' },
    { title: 'Tipo',     dataIndex: 'tipo',         key: 'tipo',            width: 110, render: (v: string) => TIPO_MNT.find(t => t.value === v)?.label ?? v },
    { title: 'Prioridad',dataIndex: 'prioridad',    key: 'prioridad',       width: 100,
      render: (v: string) => {
        const p = PRIORIDAD.find(x => x.value === v);
        return <Tag color={p?.color}>{p?.label ?? v}</Tag>;
      }},
    { title: 'Programado',dataIndex:'fechaProgramada', key: 'fechaProgramada', width: 105, render: (v: string) => fmt.date(v) },
    { title: 'Estado',   dataIndex: 'estado',       key: 'estado',          width: 110,
      render: (v: string) => {
        const s = ESTADO_MNT[v] ?? { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }},
    { title: 'Costo est.',dataIndex: 'costoEstimado', key: 'costoEstimado', width: 110, render: (v: number) => v ? fmt.money(v) : '—' },
    { title: '', key: 'actions', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => {
            const esTerminada = r.estado === 'completado' || r.estado === 'cancelado' || r.estado === 'vencido';
            if (esTerminada) {
              setVisorModal(r);
            } else {
              setCompletModal(r);
              formComp.resetFields();
              formComp.setFieldsValue({ fechaRealizada: dayjs() });
              setRequiereRepuestos(false);
            }
          }}
          viewLabel={r.estado === 'completado' || r.estado === 'cancelado' || r.estado === 'vencido' ? 'Ver detalle' : 'Completar'}
          items={[
            ...(r.estado === 'programado' || r.estado === 'en_proceso' ? [{
              key: 'completar', label: 'Completar', icon: <CheckOutlined />,
              onClick: () => { setCompletModal(r); formComp.resetFields(); formComp.setFieldsValue({ fechaRealizada: dayjs() }); setRequiereRepuestos(false); },
            }] : []),
            ...(r.estado === 'programado' ? [
              { type: 'divider' as const },
              { key: 'cancelar', label: 'Cancelar', danger: true, icon: <StopOutlined />,
                onClick: () => { if (window.confirm('¿Cancelar?')) cancelarMut.mutate(r.id); } },
            ] : []),
          ]}
        />
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
            Mantenimiento de Equipos
          </Title>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por activo o técnico..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPageOrd(1); }}
              allowClear
              style={{ width: '100%', maxWidth: 220, minWidth: 0 }}
            />
            <Button icon={<CalendarOutlined />} onClick={() => setProgModal(true)}>
              Programa preventivo
            </Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
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
            <RefreshByKeyButton queryKey={['mantenimiento']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOrdenModal(true)}>
              Nueva orden
            </Button>
          </Space>
        </Col>
      </Row>

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
              <Table columns={filterColumns(cols)} dataSource={ordenesFiltradas} rowKey="id"
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
                  { title: '', key: 'del', width: 72, align: 'right' as const,
                    render: (_: any, r: any) => (
                      <TableActions
                        onView={() => {}}
                        viewLabel="Programa"
                        items={[
                          { key: 'del', label: 'Eliminar', danger: true, icon: <StopOutlined />,
                            onClick: () => { if (window.confirm('¿Eliminar programa?')) mntApi.elimProg(r.id).then(() => inv()); } },
                        ]}
                      />
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
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_MNT} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="prioridad" label="Prioridad">
              <Select options={PRIORIDAD.map(p => ({ value: p.value, label: p.label }))} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaProgramada" label="Fecha programada" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="costoEstimado" label="Costo estimado (RD$)">
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
      <Modal
        title={`Completar: ${completModal?.numero}`}
        open={!!completModal}
        onCancel={() => { setCompletModal(null); setRequiereRepuestos(false); }}
        footer={null}
        width={560}
      >
        <Form
          form={formComp}
          layout="vertical"
          initialValues={{ fechaRealizada: dayjs() }}
          onFinish={v => {
            const data = {
              costoReal:            v.costoReal,
              tecnico:              v.tecnico,
              observaciones:        v.observaciones,
              fechaRealizada:       v.fechaRealizada?.format('YYYY-MM-DD'),
              proximoMantenimiento: v.proximoMantenimiento?.format('YYYY-MM-DD'),
              repuestosUsados:      requiereRepuestos ? (v.repuestosUsados ?? []) : undefined,
            };
            completarMut.mutate({ id: completModal.id, data });
          }}
        >
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="fechaRealizada" label="Fecha de realización">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="costoReal" label="Costo real (RD$)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="tecnico" label="Técnico que realizó"><Input /></Form.Item>
          <Form.Item name="proximoMantenimiento" label="Próximo mantenimiento (opcional)">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY"
              placeholder="Dejar vacío para calcular automáticamente" />
          </Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>

          <Divider style={{ margin: '8px 0' }} />

          <Form.Item>
            <Checkbox
              checked={requiereRepuestos}
              onChange={e => setRequiereRepuestos(e.target.checked)}
            >
              ¿Se utilizaron repuestos?
            </Checkbox>
          </Form.Item>

          {requiereRepuestos && (
            <Form.Item label="Repuestos utilizados">
              <Form.List name="repuestosUsados">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name }) => (
                      <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                        <Col flex="auto">
                          <Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: 'Descripción requerida' }]}>
                            <Input placeholder="Descripción del repuesto" />
                          </Form.Item>
                        </Col>
                        <Col style={{ width: 130 }}>
                          <Form.Item name={[name, 'costo']} noStyle rules={[{ required: true, message: 'Costo requerido' }]}>
                            <InputNumber placeholder="Costo RD$" min={0} precision={2} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col>
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block size="small">
                      Agregar repuesto
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          )}

          <Row justify="end" gutter={8} style={{ marginTop: 8 }}>
            <Col>
              <Button onClick={() => { setCompletModal(null); setRequiereRepuestos(false); }}>
                Cancelar
              </Button>
            </Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                style={{ background: '#10b981', border: 'none' }}
                loading={completarMut.isPending}
                icon={<CheckOutlined />}
              >
                Marcar completado
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal visor — detalle de orden */}
      <Modal
        title={`Orden ${visorModal?.numero}`}
        open={!!visorModal}
        onCancel={() => setVisorModal(null)}
        footer={<Button onClick={() => setVisorModal(null)}>Cerrar</Button>}
        width={560}
      >
        {visorModal && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Activo" span={2}>{visorModal.activo?.descripcion ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Tipo">
              {TIPO_MNT.find(t => t.value === visorModal.tipo)?.label ?? visorModal.tipo}
            </Descriptions.Item>
            <Descriptions.Item label="Prioridad">
              {(() => { const p = PRIORIDAD.find(x => x.value === visorModal.prioridad); return <Tag color={p?.color}>{p?.label ?? visorModal.prioridad}</Tag>; })()}
            </Descriptions.Item>
            <Descriptions.Item label="Estado" span={2}>
              {(() => { const s = ESTADO_MNT[visorModal.estado] ?? { label: visorModal.estado, color: 'default' }; return <Tag color={s.color}>{s.label}</Tag>; })()}
            </Descriptions.Item>
            <Descriptions.Item label="Fecha programada">{fmt.date(visorModal.fechaProgramada)}</Descriptions.Item>
            <Descriptions.Item label="Fecha realizada">{visorModal.fechaRealizada ? fmt.date(visorModal.fechaRealizada) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Costo estimado">{visorModal.costoEstimado ? fmt.money(visorModal.costoEstimado) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Costo real">{visorModal.costoReal ? fmt.money(visorModal.costoReal) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Técnico" span={2}>{visorModal.tecnico ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Descripción" span={2}>{visorModal.descripcion}</Descriptions.Item>
            {visorModal.observaciones && (
              <Descriptions.Item label="Observaciones" span={2}>{visorModal.observaciones}</Descriptions.Item>
            )}
            {visorModal.repuestosUsados?.length > 0 && (
              <Descriptions.Item label="Repuestos usados" span={2}>
                {visorModal.repuestosUsados.map((rep: any, i: number) => (
                  <div key={i}>{rep.descripcion} — {fmt.money(rep.costo)}</div>
                ))}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
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
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_MNT} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="frecuenciaDias" label="Cada (días)" rules={[{ required: true }]}>
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
