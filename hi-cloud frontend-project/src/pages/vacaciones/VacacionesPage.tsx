import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Table, Button, Tag, Card, Row, Col, Typography,
  Modal, Form, Select, DatePicker, Input, Space, Popconfirm,
  message, Drawer, Tabs, Badge, Progress, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined, DeleteOutlined,
  CalendarOutlined, UserOutlined, FileExcelOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', aprobada: 'green', rechazada: 'red', cancelada: 'default',
};

const TIPO_AUSENCIA = [
  { value: 'enfermedad',        label: '🤒 Enfermedad' },
  { value: 'personal',          label: '🏠 Personal' },
  { value: 'tardia',            label: '⏰ Tardía' },
  { value: 'sin_aviso',         label: '⚠️ Sin aviso' },
  { value: 'maternidad',        label: '👶 Maternidad' },
  { value: 'paternidad',        label: '👨‍👧 Paternidad' },
  { value: 'luto',              label: '🖤 Luto' },
  { value: 'licencia_especial', label: '📋 Licencia especial' },
];

const vacApi = {
  balance:     (anio?: number) =>
    api.get(`/vacaciones/balance${anio ? `?anio=${anio}` : ''}`).then(r => r.data?.data ?? r.data),
  solicitudes: (p = 1, estado?: string) =>
    api.get(`/vacaciones/solicitudes?page=${p}${estado ? `&estado=${estado}` : ''}`).then(r => r.data?.data ?? r.data),
  ausencias:   (p = 1, mes?: number, anio?: number) =>
    api.get(`/vacaciones/ausencias?page=${p}${mes ? `&mes=${mes}&anio=${anio}` : ''}`).then(r => r.data?.data ?? r.data),
  resumen:     (mes: number, anio: number) =>
    api.get(`/vacaciones/resumen?mes=${mes}&anio=${anio}`).then(r => r.data?.data ?? r.data),
  empleados:   () =>
    api.get('/nomina/empleados?limit=100').then(r => r.data?.data?.data ?? r.data?.data ?? []),
  crearSol:    (body: any) =>
    api.post('/vacaciones/solicitudes', body).then(r => r.data?.data ?? r.data),
  aprobar:     (id: number, obs?: string) =>
    api.patch(`/vacaciones/solicitudes/${id}/aprobar`, { observacion: obs }).then(r => r.data?.data ?? r.data),
  rechazar:    (id: number, obs?: string) =>
    api.patch(`/vacaciones/solicitudes/${id}/rechazar`, { observacion: obs }).then(r => r.data?.data ?? r.data),
  crearAus:    (body: any) =>
    api.post('/vacaciones/ausencias', body).then(r => r.data?.data ?? r.data),
  eliminarAus: (id: number) =>
    api.delete(`/vacaciones/ausencias/${id}`).then(r => r.data?.data ?? r.data),
};

export default function VacacionesPage() {
  const { token } = theme.useToken();
  const [search, setSearch]           = useState('');
  const [anio,        setAnio]        = useState(dayjs().year());
  const [mes,         setMes]         = useState(dayjs().month() + 1);
  const [estadoF,     setEstadoF]     = useState<string | undefined>();
  const [pageSol,     setPageSol]     = useState(1);
  const [pageAus,     setPageAus]     = useState(1);
  const [solOpen,     setSolOpen]     = useState(false);
  const [ausOpen,     setAusOpen]     = useState(false);
  const [respModal,   setRespModal]   = useState<{ id: number; tipo: 'aprobar' | 'rechazar' } | null>(null);
  const [formSol]                     = Form.useForm();
  const [formAus]                     = Form.useForm();
  const [formResp]                    = Form.useForm();
  const qc = useQueryClient();

  const { data: balance }     = useQuery({ queryKey: ['vac-balance', anio],      queryFn: () => vacApi.balance(anio) });
  const { data: solicitudes, isLoading: loadingSol } = useQuery({
    queryKey: ['vac-sol', pageSol, estadoF],
    queryFn:  () => vacApi.solicitudes(pageSol, estadoF),
  });
  const { data: ausencias, isLoading: loadingAus } = useQuery({
    queryKey: ['vac-aus', pageAus, mes, anio],
    queryFn:  () => vacApi.ausencias(pageAus, mes, anio),
  });
  const { data: resumen } = useQuery({
    queryKey: ['vac-res', mes, anio],
    queryFn:  () => vacApi.resumen(mes, anio),
  });
  const { data: empleados } = useQuery({ queryKey: ['empleados-vac'], queryFn: vacApi.empleados });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vac-sol'] });
    qc.invalidateQueries({ queryKey: ['vac-balance'] });
    qc.invalidateQueries({ queryKey: ['vac-res'] });
  };

  const crearSolMut = useMutation({
    mutationFn: vacApi.crearSol,
    onSuccess: () => { invalidate(); setSolOpen(false); formSol.resetFields(); message.success('Solicitud creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const aprobarMut = useMutation({
    mutationFn: ({ id, obs }: any) => vacApi.aprobar(id, obs),
    onSuccess: () => { invalidate(); setRespModal(null); message.success('Solicitud aprobada'); },
  });

  const rechazarMut = useMutation({
    mutationFn: ({ id, obs }: any) => vacApi.rechazar(id, obs),
    onSuccess: () => { invalidate(); setRespModal(null); message.success('Solicitud rechazada'); },
  });

  const crearAusMut = useMutation({
    mutationFn: vacApi.crearAus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vac-aus'] });
      qc.invalidateQueries({ queryKey: ['vac-res'] });
      setAusOpen(false); formAus.resetFields(); message.success('Ausencia registrada');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const elimAusMut = useMutation({
    mutationFn: vacApi.eliminarAus,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vac-aus'] }); message.success('Eliminada'); },
  });

  const solicitudesFiltradas = useMemo(() =>
    (solicitudes?.data ?? []).filter((i: any) => {
      const nombre = `${i.empleado?.nombre ?? ''} ${i.empleado?.apellido ?? ''}`.toLowerCase();
      return nombre.includes(search.toLowerCase());
    }), [solicitudes, search]);

  const ausenciasFiltradas = useMemo(() =>
    (ausencias?.data ?? []).filter((i: any) => {
      const nombre = `${i.empleado?.nombre ?? ''} ${i.empleado?.apellido ?? ''}`.toLowerCase();
      return nombre.includes(search.toLowerCase());
    }), [ausencias, search]);

  const COLS_DEF = [
    { key: 'emp',             label: 'Empleado', defaultVisible: true  },
    { key: 'fechaInicio',     label: 'Inicio',   defaultVisible: true  },
    { key: 'fechaFin',        label: 'Fin',      defaultVisible: true  },
    { key: 'diasSolicitados', label: 'Días',     defaultVisible: true  },
    { key: 'estado',          label: 'Estado',   defaultVisible: true  },
    { key: 'motivo',          label: 'Motivo',   defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('vacaciones', COLS_DEF);

  const colsSol = filterColumns([
    { title: 'Empleado',  key: 'emp', ellipsis: true,
      render: (_: any, r: any) => `${r.empleado?.nombre ?? ''} ${r.empleado?.apellido ?? ''}`.trim() },
    { title: 'Inicio',    dataIndex: 'fechaInicio', key: 'fechaInicio', width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Fin',       dataIndex: 'fechaFin',    key: 'fechaFin',    width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Días',      dataIndex: 'diasSolicitados', key: 'diasSolicitados', width: 60, render: (v: number) => <Text strong>{v}</Text> },
    { title: 'Estado',    dataIndex: 'estado', key: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{v.toUpperCase()}</Tag> },
    { title: 'Motivo',    dataIndex: 'motivo', key: 'motivo', ellipsis: true, render: (v: string) => v ?? '—' },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => {}}
          viewLabel="Ver solicitud"
          items={[
            ...(r.estado === 'pendiente' ? [
              { key: 'aprobar',  label: 'Aprobar solicitud',  icon: <CheckOutlined />, onClick: () => setRespModal({ id: r.id, tipo: 'aprobar' }) },
              { key: 'rechazar', label: 'Rechazar solicitud', icon: <CloseOutlined />, danger: true, onClick: () => setRespModal({ id: r.id, tipo: 'rechazar' }) },
            ] : []),
          ]}
        />
      )},
  ]);

  const colsAus = [
    { title: 'Empleado',  key: 'emp', ellipsis: true,
      render: (_: any, r: any) => `${r.empleado?.nombre ?? ''} ${r.empleado?.apellido ?? ''}`.trim() },
    { title: 'Fecha',      dataIndex: 'fecha',      width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Tipo',       dataIndex: 'tipo',       width: 150,
      render: (v: string) => TIPO_AUSENCIA.find(t => t.value === v)?.label ?? v },
    { title: 'Días',       dataIndex: 'dias',       width: 60 },
    { title: 'Justificada',dataIndex: 'justificada',width: 100,
      render: (v: boolean) => v ? <Tag color="green">Sí</Tag> : <Tag color="red">No</Tag> },
    { title: 'Descripción',dataIndex: 'descripcion',ellipsis: true, render: (v: string) => v ?? '—' },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => {}}
          viewLabel="Ver ausencia"
          items={[
            { key: 'eliminar', label: 'Eliminar ausencia', icon: <DeleteOutlined />, danger: true,
              onClick: () => { if (window.confirm('¿Eliminar esta ausencia?')) elimAusMut.mutate(r.id); } },
          ]}
        />
      )},
  ];

  const colsBalance = [
    { title: 'Empleado',       dataIndex: 'nombre',          ellipsis: true },
    { title: 'Corresponden',   dataIndex: 'correspondientes', width: 110, render: (v: number) => `${v} días` },
    { title: 'Usados',         dataIndex: 'usados',           width: 90,  render: (v: number) => `${v} días` },
    { title: 'Disponibles',    dataIndex: 'disponibles',      width: 100,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#10b981' : '#ef4444' }}>{v} días</Text> },
    { title: '',               key: 'prog', width: 180,
      render: (_: any, r: any) => (
        <Progress
          percent={r.correspondientes > 0 ? Math.round((r.usados / r.correspondientes) * 100) : 0}
          size="small"
          status={r.disponibles === 0 ? 'exception' : 'normal'}
        />
      )},
  ];

  const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Vacaciones y Ausencias</Title></Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por empleado..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPageSol(1); setPageAus(1); }}
              allowClear
              style={{ width: 220 }}
            />
            <Select value={mes}  onChange={setMes}  style={{ width: 120 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['vacaciones']} />
            <VideoTutorialButton />
          </Space>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'solicitudes',
          label: <><CalendarOutlined /> Solicitudes</>,
          children: (
            <Card extra={
              <Space>
                <Select placeholder="Filtrar estado" allowClear style={{ width: 140 }}
                  value={estadoF} onChange={(v) => { setEstadoF(v); setPageSol(1); }}
                  options={['pendiente','aprobada','rechazada','cancelada'].map(v => ({
                    value: v, label: <Tag color={ESTADO_COLOR[v]}>{v.toUpperCase()}</Tag>,
                  }))} />
                <Button icon={<FileExcelOutlined />} onClick={() => {
                  const filas = (solicitudes?.data ?? []).map((s: any) => ({
                    'Empleado':  `${s.empleado?.nombre ?? ''} ${s.empleado?.apellido ?? ''}`.trim(),
                    'Cédula':    s.empleado?.cedula ?? '',
                    'Tipo':      s.tipoAusencia ?? 'vacaciones',
                    'Desde':     s.fechaInicio ? dayjs(s.fechaInicio).format('DD/MM/YYYY') : '',
                    'Hasta':     s.fechaFin    ? dayjs(s.fechaFin).format('DD/MM/YYYY')    : '',
                    'Días':      s.diasHabiles ?? s.dias ?? '',
                    'Estado':    s.estado ?? '',
                    'Aprobador': s.aprobadoPor?.nombre ?? '',
                  }));
                  exportarExcel(filas, `Vacaciones-${dayjs().format('YYYY-MM')}`);
                }}>Excel</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSolOpen(true); formSol.resetFields(); }}>
                  Nueva solicitud
                </Button>
              </Space>
            }>
              <Table columns={colsSol} dataSource={solicitudesFiltradas} rowKey="id"
                loading={loadingSol} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: solicitudes?.meta?.total, pageSize: 10, current: pageSol,
                              onChange: setPageSol, showSizeChanger: false }} />
            </Card>
          ),
        },
        {
          key: 'ausencias',
          label: <><UserOutlined /> Ausencias</>,
          children: (
            <Card extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setAusOpen(true); formAus.resetFields(); }}>
                Registrar ausencia
              </Button>
            }>
              <Table columns={colsAus} dataSource={ausenciasFiltradas} rowKey="id"
                loading={loadingAus} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: ausencias?.meta?.total, pageSize: 10, current: pageAus,
                              onChange: setPageAus, showSizeChanger: false }} />
            </Card>
          ),
        },
        {
          key: 'balance',
          label: '📊 Balance Anual',
          children: (
            <Card title={`Balance de vacaciones ${anio}`}>
              <Table columns={colsBalance} dataSource={balance ?? []} rowKey="empleadoId"
                size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
            </Card>
          ),
        },
        {
          key: 'calendario',
          label: '📅 En vacaciones',
          children: (
            <Card title="Empleados en vacaciones este mes">
              {(resumen?.detalleVacaciones ?? []).length === 0 ? (
                <Text type="secondary">Ningún empleado en vacaciones este mes.</Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(resumen?.detalleVacaciones ?? []).map((v: any, i: number) => (
                    <Card key={i} size="small" style={{ borderLeft: '3px solid #1677ff' }}>
                      <Row justify="space-between">
                        <Col><Text strong>{v.empleado}</Text></Col>
                        <Col>
                          <Tag color="blue">{v.dias} días</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {fmt.date(v.fechaInicio)} → {fmt.date(v.fechaFin)}
                          </Text>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          ),
        },
      ]} />

      {/* Modal nueva solicitud */}
      <Modal title="Nueva Solicitud de Vacaciones" open={solOpen} onCancel={() => setSolOpen(false)} footer={null} width={520}>
        <Form form={formSol} layout="vertical"
          onFinish={v => crearSolMut.mutate({
            empleadoId:  v.empleadoId,
            fechaInicio: v.rango[0].format('YYYY-MM-DD'),
            fechaFin:    v.rango[1].format('YYYY-MM-DD'),
            motivo:      v.motivo,
          })}>
          <Form.Item name="empleadoId" label="Empleado" rules={[{ required: true }]}>
            <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
              options={empleados?.map((e: any) => ({ value: e.id, label: `${e.nombre} ${e.apellido ?? ''}`.trim() }))} />
          </Form.Item>
          <Form.Item name="rango" label="Período" rules={[{ required: true }]}>
            <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setSolOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearSolMut.isPending}>Crear solicitud</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal registrar ausencia */}
      <Modal title="Registrar Ausencia" open={ausOpen} onCancel={() => setAusOpen(false)} footer={null} width={520}>
        <Form form={formAus} layout="vertical"
          initialValues={{ justificada: false, dias: 1 }}
          onFinish={v => crearAusMut.mutate({ ...v, fecha: v.fecha.format('YYYY-MM-DD') })}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="empleadoId" label="Empleado" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={empleados?.map((e: any) => ({ value: e.id, label: `${e.nombre} ${e.apellido ?? ''}`.trim() }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
                <Select options={TIPO_AUSENCIA} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="dias" label="Días">
                <Select options={[{ value: 1, label: 'Día completo' }, { value: 0.5, label: 'Medio día' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="justificada" label="Justificada">
                <Select options={[{ value: true, label: '✅ Sí' }, { value: false, label: '❌ No' }]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setAusOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearAusMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal responder solicitud */}
      <Modal
        title={respModal?.tipo === 'aprobar' ? '✅ Aprobar solicitud' : '❌ Rechazar solicitud'}
        open={!!respModal} onCancel={() => setRespModal(null)} footer={null}
      >
        <Form form={formResp} layout="vertical"
          onFinish={v => {
            if (!respModal) return;
            if (respModal.tipo === 'aprobar') aprobarMut.mutate({ id: respModal.id, obs: v.obs });
            else rechazarMut.mutate({ id: respModal.id, obs: v.obs });
          }}>
          <Form.Item name="obs" label="Observación (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setRespModal(null)}>Cancelar</Button></Col>
            <Col>
              <Button
                type="primary"
                danger={respModal?.tipo === 'rechazar'}
                htmlType="submit"
                loading={aprobarMut.isPending || rechazarMut.isPending}
              >
                {respModal?.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
