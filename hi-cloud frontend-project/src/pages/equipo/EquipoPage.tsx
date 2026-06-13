import { useState, useMemo } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Button, Table, Tag, Avatar, Typography, Space, Modal,
  Form, Input, Select, Popconfirm, message, Row, Col,
  Tooltip, Badge, Divider, Alert, theme,
} from 'antd';
import { TableActions } from '../../components/ui/TableActions';
import {
  UserAddOutlined, MailOutlined, DeleteOutlined, CrownOutlined,
  TeamOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ReloadOutlined, CopyOutlined, SearchOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ROL_INFO: Record<string, { label: string; color: string; desc: string; icon: string }> = {
  admin:    { label: 'Administrador', color: '#1677ff', desc: 'Acceso total al sistema', icon: '👑' },
  contador: { label: 'Contador',      color: '#7c3aed', desc: 'Contabilidad, facturas, reportes fiscales', icon: '📊' },
  vendedor: { label: 'Vendedor',      color: '#10b981', desc: 'POS, facturas, clientes, cotizaciones', icon: '🛒' },
  viewer:   { label: 'Solo lectura',  color: '#64748b', desc: 'Puede ver, no puede crear ni editar', icon: '👁️' },
};

const ESTADO_INV: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'orange'  },
  aceptada:  { label: 'Aceptada',  color: 'green'   },
  expirada:  { label: 'Expirada',  color: 'default' },
  cancelada: { label: 'Cancelada', color: 'red'     },
};

const equipoApi = {
  miembros:    (empresaId: number) => api.get(`/multi-empresa/${empresaId}/usuarios`).then(r => r.data?.data ?? r.data),
  invitaciones:(empresaId: number) => api.get(`/invitaciones/empresa/${empresaId}`).then(r => r.data?.data ?? r.data),
  invitar:     (body: any)         => api.post('/invitaciones', body).then(r => r.data?.data ?? r.data),
  cancelarInv: (id: number)        => api.delete(`/invitaciones/${id}`).then(r => r.data?.data ?? r.data),
  cambiarRol:  (empresaId: number, userId: number, rol: string) =>
    api.patch(`/multi-empresa/${empresaId}/usuarios/${userId}`, { rol }).then(r => r.data?.data ?? r.data),
  asignarSucursal: (empresaId: number, userId: number, sucursalId: number | null) =>
    api.patch(`/multi-empresa/${empresaId}/usuarios/${userId}/sucursal`, { sucursalId }).then(r => r.data?.data ?? r.data),
  remover:     (empresaId: number, userId: number) =>
    api.delete(`/multi-empresa/${empresaId}/usuarios/${userId}`).then(r => r.data?.data ?? r.data),
};

function getEmpresaId(): number {
  return Number(localStorage.getItem('empresaId') ?? 1);
}

function RolCard({ rol, selected, onSelect }: {
  rol: string; selected: boolean; onSelect: () => void;
}) {
  const info = ROL_INFO[rol];
  return (
    <div onClick={onSelect} style={{
      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
      border: `2px solid ${selected ? info.color : '#e2e8f0'}`,
      background: selected ? `${info.color}10` : 'transparent',
      transition: 'all .15s',
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{info.icon}</div>
      <Text strong style={{ fontSize: 13, color: selected ? info.color : '#1e293b', display: 'block' }}>
        {info.label}
      </Text>
      <Text type="secondary" style={{ fontSize: 11 }}>{info.desc}</Text>
    </div>
  );
}

export default function EquipoPage() {
  const empresaId = getEmpresaId();
  const { token } = theme.useToken();
  const [search, setSearch]         = useState('');
  const [invModal,   setInvModal]   = useState(false);
  const [rolModal,   setRolModal]   = useState<{ userId: number; rolActual: string } | null>(null);
  const [sucModal,   setSucModal]   = useState<{ userId: number; nombre: string; sucursalActual: number | null } | null>(null);
  const [rolForm]                   = Form.useForm();
  const [invForm]                   = Form.useForm();
  const [rolSeleccionado, setRol]   = useState('viewer');
  const [sucursalSel, setSucursalSel] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: miembros,    isLoading: loadM } = useQuery({
    queryKey: ['equipo-miembros', empresaId],
    queryFn:  () => equipoApi.miembros(empresaId),
  });

  const { data: invitaciones, isLoading: loadI } = useQuery({
    queryKey: ['equipo-invs', empresaId],
    queryFn:  () => equipoApi.invitaciones(empresaId),
  });

  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['sucursales'],
    queryFn:  () => api.get('/sucursales').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['equipo-miembros'] });
    qc.invalidateQueries({ queryKey: ['equipo-invs'] });
  };

  const invitarMut = useMutation({
    mutationFn: equipoApi.invitar,
    onSuccess: (res: any) => {
      inv(); setInvModal(false); invForm.resetFields(); setRol('viewer');

      const enlace: string | undefined = res?.enlace ?? res?.data?.enlace;
      const emailOk: boolean = res?.emailEnviado ?? res?.data?.emailEnviado ?? false;

      if (emailOk) {
        message.success('Invitación enviada por email ✉️');
      } else if (enlace) {
        Modal.info({
          title: '✅ Invitación creada — comparte el enlace',
          width: 520,
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>
                El email no pudo enviarse (SMTP no configurado). Comparte este enlace directamente con el usuario:
              </p>
              <Input.TextArea
                value={enlace}
                readOnly
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Button
                type="primary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(enlace)
                    .then(() => message.success('Enlace copiado'))
                    .catch(() => message.info('Copia el enlace manualmente'));
                }}
              >
                📋 Copiar enlace
              </Button>
              <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
                El enlace expira en 48 horas. Para enviar emails configura SMTP en el .env del backend.
              </p>
            </div>
          ),
          okText: 'Entendido',
        });
      } else {
        message.success('Invitación creada');
      }
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al crear invitación'),
  });

  const cancelarInvMut = useMutation({
    mutationFn: equipoApi.cancelarInv,
    onSuccess: () => { inv(); message.success('Invitación cancelada'); },
  });

  const cambiarRolMut = useMutation({
    mutationFn: ({ userId, rol }: any) => equipoApi.cambiarRol(empresaId, userId, rol),
    onSuccess: () => { inv(); setRolModal(null); message.success('Rol actualizado correctamente'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al cambiar el rol'),
  });

  const asignarSucursalMut = useMutation({
    mutationFn: ({ userId, sucursalId }: { userId: number; sucursalId: number | null }) =>
      equipoApi.asignarSucursal(empresaId, userId, sucursalId),
    onSuccess: () => {
      inv();
      setSucModal(null);
      message.success('Sucursal asignada. El usuario debe volver a iniciar sesión para actualizar su JWT.');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al asignar sucursal'),
  });

  const removerMut = useMutation({
    mutationFn: (userId: number) => equipoApi.remover(empresaId, userId),
    onSuccess: () => { inv(); message.success('Usuario removido'); },
  });

  const miembrosData = miembros ?? [];
  const invsData     = (invitaciones ?? []).filter((i: any) => i.estado === 'pendiente');

  const miembrosFiltrados = useMemo(() =>
    miembrosData.filter((m: any) =>
      String(m.user?.nombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(m.user?.email ?? '').toLowerCase().includes(search.toLowerCase())
    ), [miembrosData, search]);

  const COLS_DEF = [
    { key: 'user',        label: 'Usuario',           defaultVisible: true  },
    { key: 'rol',         label: 'Rol',               defaultVisible: true  },
    { key: 'sucursal',    label: 'Sucursal',          defaultVisible: true  },
    { key: 'estado',      label: 'Estado',            defaultVisible: true  },
    { key: 'isPrincipal', label: 'Empresa principal', defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcEquipo } = useColumnVisibility('equipo', COLS_DEF);

  const colsMiembros = [
    {
      title: 'Usuario', key: 'user',
      render: (_: any, r: any) => (
        <Space>
          <Avatar size={34} style={{ background: ROL_INFO[r.rol]?.color ?? '#1677ff', fontSize: 13 }}>
            {(r.user?.nombre ?? '?').charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.user?.nombre ?? '—'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{r.user?.email ?? '—'}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Rol', dataIndex: 'rol', key: 'rol', width: 160,
      render: (v: string) => {
        const info = ROL_INFO[v];
        return info ? (
          <Tag color={info.color} style={{ fontWeight: 600 }}>
            {info.icon} {info.label}
          </Tag>
        ) : <Tag>{v}</Tag>;
      },
    },
    {
      title: 'Sucursal', key: 'sucursal', width: 180,
      render: (_: any, r: any) => {
        const suc = sucursales.find((s: any) => s.id === r.sucursalId);
        return suc
          ? <Tag icon={<BankOutlined />} color="blue">{suc.nombre}</Tag>
          : <Tag color="default" style={{ color: '#94a3b8' }}>Sin asignar</Tag>;
      },
    },
    {
      title: 'Estado', key: 'estado', width: 100,
      render: (_: any, r: any) => r.user?.isActive !== false
        ? <Badge status="success" text="Activo" />
        : <Badge status="default" text="Inactivo" />,
    },
    {
      title: 'Empresa principal', dataIndex: 'isPrincipal', key: 'isPrincipal', width: 140,
      render: (v: boolean) => v ? <Tag color="blue">Principal</Tag> : <Tag>Adicional</Tag>,
    },
    {
      title: '', key: 'actions', width: 100,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => { setRolModal({ userId: r.userId, rolActual: r.rol }); setRol(r.rol); }}
          viewLabel="Cambiar rol"
          items={[
            { key: 'rol', label: 'Cambiar rol', icon: <CrownOutlined />, onClick: () => { setRolModal({ userId: r.userId, rolActual: r.rol }); setRol(r.rol); } },
            { key: 'sucursal', label: 'Asignar sucursal', icon: <BankOutlined />, onClick: () => { setSucModal({ userId: r.userId, nombre: r.user?.nombre ?? '?', sucursalActual: r.sucursalId ?? null }); setSucursalSel(r.sucursalId ?? null); } },
            { type: 'divider' as const },
            { key: 'remover', label: 'Remover del equipo', danger: true, icon: <DeleteOutlined />, onClick: () => removerMut.mutate(r.userId) },
          ]}
        />
      ),
    },
  ];

  const colsInvs = [
    {
      title: 'Email', dataIndex: 'email', ellipsis: true,
      render: (v: string) => (
        <Space>
          <MailOutlined style={{ color: '#64748b' }} />
          <Text>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Rol', dataIndex: 'rol', width: 140,
      render: (v: string) => {
        const info = ROL_INFO[v];
        return <Tag color={info?.color}>{info?.icon} {info?.label}</Tag>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => {
        const s = ESTADO_INV[v] ?? { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: 'Expira', dataIndex: 'expiresAt', width: 130,
      render: (v: string) => (
        <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
          {dayjs(v).format('DD/MM/YYYY HH:mm')}
        </Text>
      ),
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: any) => r.estado === 'pendiente' ? (
        <Space size={4}>
          <Tooltip title="Reenviar invitación (genera nuevo enlace de 48h)">
            <Button size="small" icon={<ReloadOutlined />}
              loading={invitarMut.isPending}
              onClick={() => invitarMut.mutate({ email: r.email, rol: r.rol })} />
          </Tooltip>
          <Popconfirm title="¿Cancelar invitación?" onConfirm={() => cancelarInvMut.mutate(r.id)}>
            <Button size="small" danger icon={<CloseCircleOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Equipo & Accesos
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Gestiona quién tiene acceso a tu empresa en HiCloud ERP
          </Text>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por nombre o correo..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 220, minWidth: 0 }}
            />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['equipo-miembros']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<UserAddOutlined />}
              onClick={() => { setInvModal(true); invForm.resetFields(); setRol('viewer'); }}>
              Invitar usuario
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Miembros activos */}
      <Card title={<Space><TeamOutlined /><span>Miembros del equipo</span></Space>}
        style={{ marginBottom: 16 }}>
        <Table columns={fcEquipo(colsMiembros)} dataSource={miembrosFiltrados}
          rowKey="userId" loading={loadM} size="small"
          scroll={{ x: 'max-content' }} pagination={false} />
      </Card>

      {/* Invitaciones pendientes */}
      {invsData.length > 0 && (
        <Card title={
          <Space>
            <MailOutlined style={{ color: '#f59e0b' }} />
            <span>Invitaciones pendientes</span>
            <Badge count={invsData.length} style={{ background: '#f59e0b' }} />
          </Space>
        }>
          <Table columns={colsInvs} dataSource={invsData}
            rowKey="id" loading={loadI} size="small"
            scroll={{ x: 'max-content' }} pagination={false} />
        </Card>
      )}

      {/* Roles explicados */}
      <Card title="Guía de roles" size="small" style={{ marginTop: 16 }}>
        <Row gutter={[12, 12]}>
          {Object.entries(ROL_INFO).map(([key, info]) => (
            <Col xs={24} sm={12} md={6} key={key}>
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: `${info.color}0a`, border: `1px solid ${info.color}30`,
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{info.icon}</div>
                <Tag color={info.color} style={{ marginBottom: 6, fontWeight: 600 }}>{info.label}</Tag>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{info.desc}</Text>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* ── Modal invitar ── */}
      <Modal
        title={<Space><UserAddOutlined />Invitar usuario al equipo</Space>}
        open={invModal}
        onCancel={() => setInvModal(false)}
        footer={null}
        width={560}
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="info" showIcon
          message="Se enviará un email con un enlace de registro. El enlace expira en 48 horas."
        />

        <Form form={invForm} layout="vertical"
          onFinish={v => invitarMut.mutate({ email: v.email, rol: rolSeleccionado })}>
          <Form.Item name="email" label="Email del usuario"
            rules={[{ required: true, type: 'email', message: 'Email válido requerido' }]}>
            <Input prefix={<MailOutlined />} placeholder="contador@empresa.com" size="large" />
          </Form.Item>

          <Form.Item label="Rol en la empresa" required>
            <Row gutter={[8, 8]}>
              {Object.keys(ROL_INFO).map(rol => (
                <Col xs={24} sm={12} key={rol}>
                  <RolCard rol={rol} selected={rolSeleccionado === rol}
                    onSelect={() => setRol(rol)} />
                </Col>
              ))}
            </Row>
          </Form.Item>

          <Row justify="end" gutter={8} style={{ marginTop: 8 }}>
            <Col><Button onClick={() => setInvModal(false)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={invitarMut.isPending}
                icon={<MailOutlined />}>
                Enviar invitación
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal cambiar rol ── */}
      <Modal
        title={<Space><CrownOutlined />Cambiar rol del usuario</Space>}
        open={!!rolModal}
        onCancel={() => setRolModal(null)}
        footer={null}
        width={480}
      >
        <Form layout="vertical"
          onFinish={() => rolModal && cambiarRolMut.mutate({ userId: rolModal.userId, rol: rolSeleccionado })}>
          <Form.Item label="Nuevo rol">
            <Row gutter={[8, 8]}>
              {Object.keys(ROL_INFO).map(rol => (
                <Col xs={24} sm={12} key={rol}>
                  <RolCard rol={rol} selected={rolSeleccionado === rol}
                    onSelect={() => setRol(rol)} />
                </Col>
              ))}
            </Row>
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setRolModal(null)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={cambiarRolMut.isPending}>
                Cambiar rol
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal asignar sucursal ── */}
      <Modal
        title={<Space><BankOutlined />Asignar sucursal — {sucModal?.nombre}</Space>}
        open={!!sucModal}
        onCancel={() => setSucModal(null)}
        onOk={() => sucModal && asignarSucursalMut.mutate({ userId: sucModal.userId, sucursalId: sucursalSel })}
        confirmLoading={asignarSucursalMut.isPending}
        okText="Guardar"
        width={440}
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="info" showIcon
          message="La sucursal determina qué almacén usa el usuario al facturar y registrar compras. El usuario debe cerrar sesión e iniciar nuevamente para que el JWT se actualice."
        />
        <Form layout="vertical">
          <Form.Item label="Sucursal asignada">
            <Select
              allowClear
              placeholder="Sin sucursal asignada (usa la principal)"
              value={sucursalSel ?? undefined}
              onChange={v => setSucursalSel(v ?? null)}
              options={sucursales.map((s: any) => ({
                value: s.id,
                label: s.esPrincipal ? `${s.nombre} ⭐ (Principal)` : s.nombre,
              }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          {sucursalSel && (() => {
            const suc = sucursales.find((s: any) => s.id === sucursalSel);
            return suc?.almacenPrincipalId ? (
              <Alert
                type="success" showIcon
                message={`Almacén que se asignará automáticamente: ID ${suc.almacenPrincipalId}`}
              />
            ) : (
              <Alert
                type="warning" showIcon
                message="Esta sucursal no tiene almacén principal asignado. El JWT no incluirá almacenId. Configura el almacén principal en la página de Sucursales."
              />
            );
          })()}
        </Form>
      </Modal>
    </div>
  );
}
