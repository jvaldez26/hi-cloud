import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  Space, Typography, Tabs, Divider, Avatar, Popconfirm, message,
  Alert, theme,
} from 'antd';
import {
  BankOutlined, PlusOutlined, UserAddOutlined, TeamOutlined,
  SettingOutlined, MailOutlined, SwapOutlined,
  CheckCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';
import { fecha } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'usuario', label: 'Usuario',  defaultVisible: true },
  { key: 'rol',     label: 'Rol',      defaultVisible: true },
  { key: 'email',   label: 'Email',    defaultVisible: true },
];

const { Title, Text } = Typography;
const { Option } = Select;

const ROLES = [
  { value: 'admin',    label: 'Administrador',  color: 'red',    desc: 'Control total de la empresa' },
  { value: 'contador', label: 'Contador',        color: 'blue',   desc: 'Contabilidad, impuestos, reportes' },
  { value: 'vendedor', label: 'Vendedor',         color: 'green',  desc: 'Ventas, clientes, facturas' },
  { value: 'viewer',   label: 'Solo Lectura',     color: 'default', desc: 'Puede ver pero no editar' },
];

const SECTORES = [
  'COMERCIO', 'SERVICIOS', 'MANUFACTURA', 'CONSTRUCCION',
  'SALUD', 'EDUCACION', 'TECNOLOGIA', 'AGROPECUARIO', 'OTRO',
];

export default function EmpresasPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const { empresas: misEmpresas, empresaActual, cambiarEmpresa } = useAuthStore();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('empresas', COLS_DEF);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [modalInvitar,  setModalInvitar]  = useState<number | null>(null);
  const [formCrear]   = Form.useForm();
  const [formInvitar] = Form.useForm();
  const [searchEmpresas, setSearchEmpresas] = useState('');
  const [searchMiembros, setSearchMiembros] = useState('');

  const { data: empresasData = [] } = useQuery<any[]>({
    queryKey: ['mis-empresas'],
    queryFn:  () => api.get('/auth/mis-empresas').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: usuarios = [] } = useQuery<any[]>({
    queryKey: ['empresa-usuarios', empresaActual],
    queryFn:  () => api.get(`/multi-empresa/${empresaActual}/usuarios`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled:  !!empresaActual,
  });

  const { data: invitaciones = [] } = useQuery<any[]>({
    queryKey: ['empresa-invitaciones', empresaActual],
    queryFn:  () => api.get(`/invitaciones/empresa/${empresaActual}`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled:  !!empresaActual,
  });

  const crearEmpresa = useMutation({
    mutationFn: (dto: any) => api.post('/multi-empresa', dto),
    onSuccess: async (res: any) => {
      const nueva = res.data?.data ?? res.data;
      qc.invalidateQueries({ queryKey: ['mis-empresas'] });
      setModalCrear(false);
      formCrear.resetFields();

      // Cambiar contexto a la nueva empresa para que aparezca en el sidebar.
      // El backend ahora permite el switch aunque esté pendiente (isPrincipal=true).
      const nuevaId = nueva?.id ?? nueva?.empresaId;
      if (nuevaId) {
        try {
          await api.post('/auth/cambiar-empresa', { empresaId: nuevaId });
          localStorage.setItem('empresaId', String(nuevaId));
        } catch { /* si falla el switch, no bloquear — el usuario ve el modal igual */ }
      }

      Modal.success({
        title: '✅ Solicitud enviada exitosamente',
        content: (
          <div>
            <p>Tu solicitud fue enviada. Un administrador revisará tu empresa y recibirás un email cuando sea aprobada.</p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Tu empresa ya aparece en el sidebar como <strong>pendiente de aprobación</strong>.</p>
          </div>
        ),
        okText: 'Entendido',
        onOk: () => qc.invalidateQueries({ queryKey: ['mis-empresas'] }),
      });
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar solicitud'),
  });

  const invitarUsuario = useMutation({
    mutationFn: (dto: any) => api.post('/invitaciones', { ...dto, empresaId: empresaActual }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-invitaciones'] });
      setModalInvitar(null);
      formInvitar.resetFields();
      message.success('Invitación enviada por email');
    },
  });

  const removerUsuario = useMutation({
    mutationFn: (userId: number) => api.delete(`/multi-empresa/${empresaActual}/usuarios/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-usuarios'] });
      message.success('Acceso removido');
    },
  });

  const cancelarInvitacion = useMutation({
    mutationFn: (id: number) => api.patch(`/invitaciones/${id}/cancelar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa-invitaciones'] }),
  });

  const handleCambiarEmpresa = async (empresaId: number) => {
    try {
      // S-23: backend setea nueva cookie httpOnly con empresaId actualizado
      await api.post('/auth/cambiar-empresa', { empresaId });
      cambiarEmpresa(empresaId);   // solo actualiza UI store
      window.location.reload();
    } catch {
      message.error('No tienes acceso a esa empresa');
    }
  };

  const empresaActualData = empresasData.find((e: any) => e.empresaId === empresaActual);

  const empresasFiltradas = useMemo(() =>
    empresasData.filter((e: any) =>
      String(e.nombre ?? '').toLowerCase().includes(searchEmpresas.toLowerCase()) ||
      String(e.rnc    ?? '').toLowerCase().includes(searchEmpresas.toLowerCase())
    ), [empresasData, searchEmpresas]);

  const miembrosFiltrados = useMemo(() =>
    usuarios.filter((u: any) =>
      String(u.user?.nombre ?? '').toLowerCase().includes(searchMiembros.toLowerCase()) ||
      String(u.user?.email  ?? '').toLowerCase().includes(searchMiembros.toLowerCase()) ||
      String(u.rol          ?? '').toLowerCase().includes(searchMiembros.toLowerCase())
    ), [usuarios, searchMiembros]);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BankOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Mis Empresas</Title>
            <Text type="secondary">Gestiona tus empresas, equipo y accesos</Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
          Nueva Empresa
        </Button>
      </div>

      {/* ── Empresa activa — usar div en lugar de Card para evitar el override
           global de tokens.css que elimina linear-gradient de .ant-card ── */}
      {empresaActualData && (
        <div style={{
          background: 'linear-gradient(135deg,#1a56db,#3b82f6)',
          borderRadius: 12, marginBottom: 24,
          padding: '16px 24px',
        }}>
          <Row align="middle" gutter={16}>
            <Col>
              <Avatar size={56} style={{ background: 'rgba(255,255,255,.2)', fontSize: 22, fontWeight: 800 }}>
                {empresaActualData.nombre?.charAt(0)}
              </Avatar>
            </Col>
            <Col flex={1}>
              <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, display: 'block' }}>
                EMPRESA ACTIVA
              </Text>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 700, display: 'block' }}>
                {empresaActualData.nombre}
              </Text>
              <Space>
                <Tag style={{ background: 'rgba(255,255,255,.2)', borderColor: 'transparent', color: '#fff' }}>
                  RNC: {empresaActualData.rnc}
                </Tag>
                <Tag style={{ background: 'rgba(255,255,255,.2)', borderColor: 'transparent', color: '#fff' }}>
                  {empresaActualData.rol?.toUpperCase()}
                </Tag>
                {empresaActualData.plan && (
                  <Tag style={{ background: 'rgba(255,255,255,.2)', borderColor: 'transparent', color: '#fff' }}>
                    Plan: {empresaActualData.plan.charAt(0).toUpperCase() + empresaActualData.plan.slice(1)}
                  </Tag>
                )}
              </Space>
            </Col>
            <Col>
              <Button
                icon={<SettingOutlined />}
                ghost
                style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff' }}
              >
                Configurar
              </Button>
            </Col>
          </Row>
        </div>
      )}

      <Row gutter={[16, 16]}>
        {/* ── Lista de empresas ────────────────────────────────────────────── */}
        <Col xs={24} lg={10}>
          <Card title="Todas mis empresas" bordered={false} style={{ borderRadius: 12 }}>
            <Input
              placeholder="Buscar por nombre o RNC..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={searchEmpresas}
              onChange={e => setSearchEmpresas(e.target.value)}
              allowClear
              style={{ width: 220, marginBottom: 12 }}
            />
            {empresasFiltradas.map((e: any) => {
              const esPendiente  = e.estadoAprobacion === 'pendiente';
              const esRechazada  = e.estadoAprobacion === 'rechazada';
              const puedeAcceder = !esPendiente && !esRechazada;
              return (
                <div
                  key={e.empresaId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 0',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: puedeAcceder && e.empresaId !== empresaActual ? 'pointer' : 'default',
                    opacity: esPendiente || esRechazada ? 0.7 : 1,
                  }}
                  onClick={() => puedeAcceder && e.empresaId !== empresaActual && handleCambiarEmpresa(e.empresaId)}
                >
                  <Avatar style={{ background: e.empresaId === empresaActual ? token.colorPrimary : (esPendiente ? '#f59e0b' : esRechazada ? '#dc2626' : token.colorPrimaryBg), color: '#fff', fontWeight: 700 }}>
                    {e.nombre?.charAt(0)}
                  </Avatar>
                  <div style={{ flex: 1 }}>
                    <Text strong>{e.nombre}</Text>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      <Tag style={{ fontSize: 10 }}>{e.rol}</Tag>
                      {e.isPrincipal && <Tag color="gold" style={{ fontSize: 10 }}>Principal</Tag>}
                      {esPendiente  && <Tag color="orange" style={{ fontSize: 10 }}>⏳ En revisión</Tag>}
                      {esRechazada  && <Tag color="red"    style={{ fontSize: 10 }}>❌ Rechazada</Tag>}
                    </div>
                    {esRechazada && e.motivoRechazo && (
                      <Text type="secondary" style={{ fontSize: 11 }}>Motivo: {e.motivoRechazo}</Text>
                    )}
                  </div>
                  {e.empresaId === empresaActual
                    ? <CheckCircleOutlined style={{ color: '#1a56db', fontSize: 18 }} />
                    : puedeAcceder ? <SwapOutlined style={{ color: '#9ca3af' }} /> : null
                  }
                </div>
              );
            })}
            {empresasFiltradas.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <BankOutlined style={{ fontSize: 32, color: '#d9d9d9', marginBottom: 8 }} />
                <div><Text type="secondary">No tienes empresas. ¡Crea la primera!</Text></div>
              </div>
            )}
          </Card>
        </Col>

        {/* ── Miembros y accesos ───────────────────────────────────────────── */}
        <Col xs={24} lg={14}>
          <Card
            bordered={false}
            style={{ borderRadius: 12 }}
            title={
              <Space>
                <TeamOutlined />
                Equipo de la empresa
              </Space>
            }
            extra={
              <Space>
                <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
                <RefreshByKeyButton queryKey={['empresa-usuarios']} />
                <VideoTutorialButton />
                <Button
                  type="primary"
                  size="small"
                  icon={<UserAddOutlined />}
                  onClick={() => setModalInvitar(empresaActual)}
                >
                  Invitar
                </Button>
              </Space>
            }
          >
            <Tabs
              items={[
                {
                  key: 'miembros',
                  label: `Miembros (${usuarios.length})`,
                  children: (
                    <>
                    <Input
                      placeholder="Buscar por nombre o RNC..."
                      prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                      value={searchMiembros}
                      onChange={e => setSearchMiembros(e.target.value)}
                      allowClear
                      style={{ width: 220, marginBottom: 12 }}
                    />
                    <Table
                      dataSource={miembrosFiltrados}
                      rowKey="id"
                      size="small"
        scroll={{ x: 'max-content' }}
                      pagination={false}
                      columns={filterColumns([
                        {
                          title: 'Usuario', key: 'usuario',
                          render: (_: any, r: any) => (
                            <Space>
                              <Avatar size="small" style={{ background: token.colorPrimaryBg, color: token.colorPrimary }}>
                                {r.user?.nombre?.charAt(0)}
                              </Avatar>
                              <div>
                                <Text strong style={{ fontSize: 13 }}>{r.user?.nombre}</Text>
                                <div><Text type="secondary" style={{ fontSize: 11 }}>{r.user?.email}</Text></div>
                              </div>
                            </Space>
                          ),
                        },
                        {
                          title: 'Rol', dataIndex: 'rol', key: 'rol',
                          render: (v: any) => {
                            const r = ROLES.find(x => x.value === v);
                            return <Tag color={r?.color}>{r?.label ?? v}</Tag>;
                          },
                        },
                        {
                          title: 'Email', key: 'email',
                          render: (_: any, r: any) => (
                            <Text type="secondary" style={{ fontSize: 12 }}>{r.user?.email ?? '—'}</Text>
                          ),
                        },
                        {
                          title: '', key: 'acc',
                          render: (_: any, r: any) => (
                            <Popconfirm
                              title="¿Remover acceso?"
                              onConfirm={() => removerUsuario.mutate(r.userId)}
                            >
                              <Button size="small" danger type="text">Remover</Button>
                            </Popconfirm>
                          ),
                        },
                      ])}
                    />
                    </>
                  ),
                },
                {
                  key: 'invitaciones',
                  label: `Invitaciones (${invitaciones.length})`,
                  children: (
                    <Table
                      dataSource={invitaciones}
                      rowKey="id"
                      size="small"
        scroll={{ x: 'max-content' }}
                      pagination={false}
                      columns={[
                        { title: 'Email', dataIndex: 'email', key: 'email' },
                        {
                          title: 'Rol', dataIndex: 'rol', key: 'rol',
                          render: v => {
                            const r = ROLES.find(x => x.value === v);
                            return <Tag color={r?.color}>{r?.label ?? v}</Tag>;
                          },
                        },
                        {
                          title: 'Estado', dataIndex: 'estado', key: 'estado',
                          render: v => (
                            <Tag color={v === 'pendiente' ? 'orange' : v === 'aceptada' ? 'green' : 'red'}>
                              {v}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Vence', dataIndex: 'expiresAt', key: 'expiresAt',
                          render: v => fecha(v),
                        },
                        {
                          title: '', key: 'acc',
                          render: (_, r: any) => r.estado === 'pendiente' ? (
                            <Button size="small" type="text" danger
                              onClick={() => cancelarInvitacion.mutate(r.id)}>
                              Cancelar
                            </Button>
                          ) : null,
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Modal crear empresa ──────────────────────────────────────────────── */}
      <Modal
        title={<Space><BankOutlined />Nueva Empresa</Space>}
        open={modalCrear}
        onCancel={() => setModalCrear(false)}
        onOk={() => formCrear.submit()}
        confirmLoading={crearEmpresa.isPending}
        okText="Enviar solicitud"
        width={560}
      >
        <Alert
          type="info"
          message="Cada empresa es un espacio completamente aislado con sus propios clientes, facturas y datos."
          description="Tu solicitud será revisada por un administrador antes de activarse. Recibirás un email de confirmación."
          style={{ marginBottom: 16 }}
        />
        <Form form={formCrear} layout="vertical" onFinish={v => crearEmpresa.mutate(v)}>
          <Form.Item name="rnc" label="RNC" rules={[{ required: true, pattern: /^\d{9}$|^\d{11}$/, message: 'RNC debe tener 9 u 11 dígitos' }]}>
            <Input placeholder="130000001" maxLength={11} />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre / Razón Social" rules={[{ required: true }]}>
            <Input placeholder="Mi Empresa S.R.L." />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="nombreComercial" label="Nombre Comercial">
                <Input placeholder="Nombre que se muestra en facturas" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="sector" label="Sector" initialValue="COMERCIO">
                <Select>
                  {SECTORES.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input placeholder="809-000-0000" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email">
                <Input placeholder="info@empresa.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="direccion" label="Dirección">
            <Input placeholder="Calle Principal #123, Santo Domingo" />
          </Form.Item>
          <Form.Item name="ciudad" label="Ciudad" initialValue="Santo Domingo">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal invitar usuario ────────────────────────────────────────────── */}
      <Modal
        title={<Space><UserAddOutlined />Invitar al Equipo</Space>}
        open={!!modalInvitar}
        onCancel={() => setModalInvitar(null)}
        onOk={() => formInvitar.submit()}
        confirmLoading={invitarUsuario.isPending}
        okText="Enviar Invitación"
        width={480}
      >
        <Form form={formInvitar} layout="vertical" onFinish={v => invitarUsuario.mutate(v)}>
          <Form.Item name="email" label="Email del colaborador" rules={[{ required: true, type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="contador@gmail.com" />
          </Form.Item>
          <Form.Item name="rol" label="Rol en la empresa" initialValue="contador" rules={[{ required: true }]}>
            <Select>
              {ROLES.map(r => (
                <Option key={r.value} value={r.value}>
                  <Space>
                    <Tag color={r.color} style={{ width: 100, textAlign: 'center' }}>{r.label}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.desc}</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Se enviará un email con un enlace de invitación válido por 48 horas.
          Si el colaborador no tiene cuenta, podrá crearla al aceptar.
        </Text>
      </Modal>
    </div>
  );
}
