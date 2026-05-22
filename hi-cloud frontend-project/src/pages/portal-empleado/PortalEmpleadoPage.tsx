import {
  Card, Row, Col, Typography, Tag, Alert, Table, Progress,
  Tabs, Space, Button, Modal, Form, DatePicker, Input,
  Descriptions, Badge, message, theme, Avatar, Statistic, Spin,
} from 'antd';
import {
  UserOutlined, DollarOutlined, CalendarOutlined, FileTextOutlined,
  DownloadOutlined, PlusOutlined, SendOutlined, ClockCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('es-DO') : '—';

const calcAntig = (fechaIngreso: any) => {
  if (!fechaIngreso) return '—';
  const anos = Math.floor((Date.now() - new Date(fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 365));
  return `${anos} año${anos !== 1 ? 's' : ''}`;
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', aprobada: 'green', rechazada: 'red', cancelada: 'default',
  pagada: 'green', procesada: 'blue', borrador: 'default', anulada: 'red',
};

// ── Descarga de recibo PDF ────────────────────────────────────────────────────
async function descargarReciboPdf(periodoId: number, empleadoId: number, periodo: string) {
  const eid = localStorage.getItem('empresaId') ?? '';
  const res = await fetch(`/api/v1/nomina/periodos/${periodoId}/recibo/${empleadoId}/pdf`, {
    credentials: 'include', headers: { 'X-Empresa-ID': eid },
  });
  if (!res.ok) { message.error('No se pudo generar el PDF'); return; }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recibo-${periodo}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Tab: Mi Perfil ────────────────────────────────────────────────────────────
function TabPerfil({ emp, calc }: { emp: any; calc: any }) {
  const { token } = theme.useToken();
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title={<Space><UserOutlined />Datos Personales</Space>} bordered={false} style={{ borderRadius: 10 }}>
          {[
            { label: 'Nombre completo', value: `${emp.nombre} ${emp.apellido}` },
            { label: 'Cédula',          value: emp.cedula ?? '—' },
            { label: 'Email',           value: emp.email ?? '—' },
            { label: 'Teléfono',        value: emp.telefono ?? '—' },
            { label: 'Fecha nacimiento',value: fmtDate(emp.fechaNacimiento) },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text>
              <Text strong style={{ fontSize: 12 }}>{r.value}</Text>
            </div>
          ))}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title={<Space><FileTextOutlined />Datos Laborales</Space>} bordered={false} style={{ borderRadius: 10 }}>
          {[
            { label: 'Cargo',           value: emp.cargo },
            { label: 'Departamento',    value: emp.departamento ?? '—' },
            { label: 'Tipo contrato',   value: emp.tipoContrato },
            { label: 'Fecha ingreso',   value: fmtDate(emp.fechaIngreso) },
            { label: 'Antigüedad',      value: calcAntig(emp.fechaIngreso) },
            { label: 'Banco',           value: emp.banco ?? '—' },
            { label: 'Cuenta bancaria', value: emp.cuentaBancaria ?? '—' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '7px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text>
              <Text strong style={{ fontSize: 12 }}>{r.value}</Text>
            </div>
          ))}
        </Card>
      </Col>
      {calc && (
        <Col xs={24}>
          <Card title={<Space><DollarOutlined />Mi Sueldo Mensual</Space>} bordered={false} style={{ borderRadius: 10 }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={6}><Statistic title="Salario Bruto" value={fmt(calc.salarioBruto)} valueStyle={{ color: '#1677ff', fontSize: 18 }} /></Col>
              <Col xs={24} sm={6}><Statistic title="AFP (2.87%)" value={`-${fmt(calc.descuentoAfp)}`} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} /></Col>
              <Col xs={24} sm={6}><Statistic title="SFS (3.04%)" value={`-${fmt(calc.descuentoSfs)}`} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} /></Col>
              <Col xs={24} sm={6}><Statistic title="Salario Neto" value={fmt(calc.salarioNeto)} valueStyle={{ color: '#52c41a', fontSize: 18, fontWeight: 700 }} /></Col>
            </Row>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Deducciones sobre bruto</Text>
              <Progress percent={+((calc.totalDescuentos / calc.salarioBruto) * 100).toFixed(1)}
                strokeColor="#faad14" size="small" style={{ marginTop: 4 }} />
            </div>
          </Card>
        </Col>
      )}
    </Row>
  );
}

// ── Tab: Mis Recibos ──────────────────────────────────────────────────────────
function TabRecibos({ empleadoId, nominas }: { empleadoId: number; nominas: any[] }) {
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const nominasFiltradas = useMemo(() =>
    nominas.filter(i =>
      String(i.periodo ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.estado  ?? '').toLowerCase().includes(search.toLowerCase())
    ), [nominas, search]);
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="Buscar..."
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />
      </div>
    <Table
      dataSource={nominasFiltradas}
      rowKey="periodoId"
      size="middle"
      pagination={{ pageSize: 12 }}
      columns={[
        { title: 'Período', dataIndex: 'periodo', key: 'p', render: v => <Text strong>{v}</Text> },
        { title: 'Días', dataIndex: 'diasTrabajados', key: 'd', align: 'center' as const },
        { title: 'Bruto', dataIndex: 'salarioBruto', key: 'b', align: 'right' as const, render: v => fmt(Number(v)) },
        { title: 'AFP', dataIndex: 'descuentoAfp', key: 'afp', align: 'right' as const, render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
        { title: 'SFS', dataIndex: 'descuentoSfs', key: 'sfs', align: 'right' as const, render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
        { title: 'ISR', dataIndex: 'descuentoIsr', key: 'isr', align: 'right' as const, render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
        { title: 'Neto', dataIndex: 'salarioNeto', key: 'n', align: 'right' as const, render: v => <Text strong style={{ color: token.colorSuccess }}>{fmt(Number(v))}</Text> },
        { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{(v ?? '').toUpperCase()}</Tag> },
        { title: 'Pago', dataIndex: 'fechaPago', key: 'fp', render: v => v ?? '—' },
        {
          title: '', key: 'pdf', width: 60, align: 'center' as const,
          render: (_: any, r: any) => r.periodoId ? (
            <Button size="small" icon={<DownloadOutlined />} type="text"
              title="Descargar recibo PDF"
              onClick={() => descargarReciboPdf(r.periodoId, empleadoId, r.periodo)} />
          ) : null,
        },
      ]}
    />
    </>
  );
}

// ── Tab: Vacaciones ───────────────────────────────────────────────────────────
function TabVacaciones({ usuarioId, vac }: { usuarioId: number; vac: any }) {
  const qc  = useQueryClient();
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [modal, setModal] = useState(false);

  const solicitar = useMutation({
    mutationFn: (dto: any) => api.post('/portal-empleado/solicitar-vacaciones', {
      fechaInicio: dto.fechas[0].format('YYYY-MM-DD'),
      fechaFin:    dto.fechas[1].format('YYYY-MM-DD'),
      motivo:      dto.motivo,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-vacaciones'] });
      qc.invalidateQueries({ queryKey: ['portal-solicitudes'] });
      setModal(false); form.resetFields();
      message.success('Solicitud enviada correctamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al enviar', 5),
  });

  return (
    <div>
      {/* Resumen */}
      {vac && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          {[
            { label: 'Días disponibles', value: vac.diasDisponibles, color: token.colorSuccess },
            { label: 'Días usados',      value: vac.diasUsados,      color: token.colorWarning },
            { label: 'Días por ley',     value: vac.diasPorLey,      color: token.colorPrimary },
            { label: 'Años de servicio', value: vac.aniosServicio,   color: token.colorTextSecondary },
          ].map(item => (
            <Col xs={12} sm={6} key={item.label}>
              <Card bordered={false} style={{ borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: item.color }}>{item.value}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
              </Card>
            </Col>
          ))}
          <Col xs={24}>
            <Progress
              percent={vac.diasPorLey > 0 ? +((vac.diasUsados / vac.diasPorLey) * 100).toFixed(0) : 0}
              strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
              format={() => `${vac.diasUsados}/${vac.diasPorLey} usados`}
            />
          </Col>
        </Row>
      )}

      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)} style={{ marginBottom: 16 }}>
        Solicitar vacaciones
      </Button>

      {/* Historial */}
      <Table
        dataSource={vac?.historial ?? []}
        rowKey={(r: any, i: any) => `${r.fechaInicio}-${i}`}
        size="small"
        pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Desde',  dataIndex: 'fechaInicio', key: 'fi', render: v => fmtDate(v) },
          { title: 'Hasta',  dataIndex: 'fechaFin',    key: 'ff', render: v => fmtDate(v) },
          { title: 'Días',   dataIndex: 'dias',         key: 'd',  align: 'center' as const },
          { title: 'Motivo', dataIndex: 'motivo',       key: 'm',  render: v => v ?? '—', ellipsis: true },
          { title: 'Estado', dataIndex: 'estado',       key: 'e',  render: v => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{(v ?? '').toUpperCase()}</Tag> },
        ]}
      />

      {/* Modal solicitud */}
      <Modal
        title={<Space><SendOutlined />Solicitud de Vacaciones</Space>}
        open={modal}
        onCancel={() => { setModal(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={solicitar.isPending}
        okText="Enviar solicitud"
        width={440}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={v => solicitar.mutate(v)}>
          <Form.Item name="fechas" label="Período de vacaciones" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY"
              disabledDate={d => d && d < dayjs().startOf('day')} />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo (opcional)">
            <Input.TextArea rows={2} placeholder="Ej: Vacaciones familiares, viaje..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Tab: Solicitudes ──────────────────────────────────────────────────────────
function TabSolicitudes() {
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery<any>({
    queryKey: ['portal-solicitudes'],
    queryFn:  () => api.get('/portal-empleado/mis-solicitudes').then(r => r.data?.data ?? r.data),
    retry: false,
  });

  const solicitudes = data?.solicitudes ?? [];
  const solicitudesFiltradas = useMemo(() =>
    solicitudes.filter((i: any) =>
      String(i.motivo ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.estado ?? '').toLowerCase().includes(search.toLowerCase())
    ), [solicitudes, search]);

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="Buscar..."
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />
      </div>
    <Table
      dataSource={solicitudesFiltradas}
      rowKey="id"
      loading={isLoading}
      size="middle"
      pagination={{ pageSize: 12 }}
      columns={[
        { title: 'Desde',   dataIndex: 'fechaInicio',    key: 'fi', render: v => fmtDate(v) },
        { title: 'Hasta',   dataIndex: 'fechaFin',       key: 'ff', render: v => fmtDate(v) },
        { title: 'Días',    dataIndex: 'diasSolicitados', key: 'd',  align: 'center' as const },
        { title: 'Motivo',  dataIndex: 'motivo',          key: 'm',  render: v => v ?? '—', ellipsis: true },
        {
          title: 'Estado', dataIndex: 'estado', key: 'e',
          render: v => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{(v ?? '').toUpperCase()}</Tag>,
        },
        { title: 'Observación', dataIndex: 'observacionAprobador', key: 'obs', render: v => v ?? '—', ellipsis: true },
        { title: 'Fecha solicitud', dataIndex: 'createdAt', key: 'c', render: v => fmtDate(v) },
      ]}
      locale={{ emptyText: 'No tienes solicitudes registradas' }}
    />
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PortalEmpleadoPage() {
  const { token } = theme.useToken();
  const { user }  = useAuthStore();

  const { data: resumen, isLoading, error } = useQuery<any>({
    queryKey: ['portal-resumen'],
    queryFn:  () => api.get('/portal-empleado/mi-resumen').then((r: any) => r.data?.data ?? r.data),
    retry: false,
  });

  const { data: nominasData } = useQuery<any>({
    queryKey: ['portal-nominas'],
    queryFn:  () => api.get('/portal-empleado/mis-nominas').then((r: any) => r.data?.data ?? r.data),
    enabled:  !error,
    retry: false,
  });

  const { data: vacData } = useQuery<any>({
    queryKey: ['portal-vacaciones'],
    queryFn:  () => api.get('/portal-empleado/mis-vacaciones').then((r: any) => r.data?.data ?? r.data),
    enabled:  !error,
    retry: false,
  });

  if (isLoading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>;

  if (error || !resumen) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="info" showIcon icon={<UserOutlined />}
          message="Portal del Empleado"
          description={
            <>
              <p>Este portal muestra tu información laboral, recibos de nómina y saldo de vacaciones.</p>
              <p><strong>Para habilitar el portal</strong>, el administrador debe vincular tu usuario de sistema ({user?.email}) con tu registro de empleado en el módulo de Nómina.</p>
            </>
          }
          style={{ borderRadius: 8 }} />
      </div>
    );
  }

  const emp    = resumen.empleado;
  const calc   = resumen.calculoMensual;
  const nominas = nominasData?.nominas ?? [];
  const empId  = nominasData?.empleado?.id ?? 0;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Card bordered={false} style={{ borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar size={56} style={{ background: token.colorPrimary, fontSize: 22, fontWeight: 700 }}>
            {emp.nombre?.charAt(0).toUpperCase()}
          </Avatar>
          <div style={{ flex: 1 }}>
            <Title level={4} style={{ margin: 0 }}>{emp.nombre} {emp.apellido ?? ''}</Title>
            <Text type="secondary">{emp.cargo}{emp.departamento ? ` · ${emp.departamento}` : ''}</Text>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Tag color="green" style={{ fontSize: 12 }}>Activo</Tag>
            <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 4 }}>
              Ingreso: {fmtDate(emp.fechaIngreso)}
            </div>
          </div>
        </div>

        {/* Stats rápidas */}
        <Row gutter={16} style={{ marginTop: 16 }}>
          {[
            { label: 'Salario Base',    value: fmt(calc?.salarioBruto ?? emp.salarioBase ?? 0), color: token.colorPrimary },
            { label: 'Salario Neto',    value: fmt(calc?.salarioNeto ?? 0),                     color: token.colorSuccess },
            { label: 'Días Vacac.',     value: `${vacData?.diasDisponibles ?? 0} disponibles`,  color: token.colorWarning },
            { label: 'Antigüedad',      value: calcAntig(emp.fechaIngreso),                     color: token.colorTextSecondary },
          ].map(s => (
            <Col xs={12} sm={6} key={s.label}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Tabs */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs defaultActiveKey="perfil">
          <TabPane tab={<Space><UserOutlined />Mi Perfil</Space>} key="perfil">
            <TabPerfil emp={emp} calc={calc} />
          </TabPane>
          <TabPane tab={<Space><DollarOutlined />Mis Recibos</Space>} key="recibos">
            <TabRecibos empleadoId={empId} nominas={nominas} />
          </TabPane>
          <TabPane tab={<Space><CalendarOutlined />Vacaciones</Space>} key="vacaciones">
            <TabVacaciones usuarioId={user?.id ?? 0} vac={vacData} />
          </TabPane>
          <TabPane tab={<Space><ClockCircleOutlined />Mis Solicitudes</Space>} key="solicitudes">
            <TabSolicitudes />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
}
