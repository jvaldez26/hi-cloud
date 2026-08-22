import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Row, Col, Typography, Tag, Avatar,
         Space, Divider, message, Alert, Modal, Tooltip, Table, Popconfirm } from 'antd';
import { UserOutlined, LockOutlined, SaveOutlined, SafetyOutlined,
         EditOutlined, CloseOutlined, GoogleOutlined, LinkOutlined,
         DesktopOutlined, LogoutOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';
import { dRD } from '../../utils/fechaRD';
dayjs.extend(relativeTime);
dayjs.locale('es');

const { Title, Text } = Typography;

const roleColor: Record<string, string> = {
  admin: 'red', contador: 'blue', vendedor: 'green', viewer: 'default',
};

const roleLabel: Record<string, string> = {
  admin: 'Administrador', contador: 'Contador', vendedor: 'Vendedor', viewer: 'Solo Lectura',
};

function TwoFactorSection() {
  const qc = useQueryClient();
  const [qrModal,      setQrModal]      = useState(false);
  const [code,         setCode]         = useState('');
  const [qrData,       setQrData]       = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [backupCodes,  setBackupCodes]  = useState<string[] | null>(null);

  const { data: status } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get('/auth/2fa/status').then(r => r.data?.data ?? r.data),
  });
  const enabled = status?.enabled ?? false;

  const setupMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup', {}).then(r => r.data?.data ?? r.data),
    onSuccess: (data) => { setQrData(data); setQrModal(true); },
  });

  const activateMut = useMutation({
    mutationFn: (codigo: string) => api.post('/auth/2fa/activate', { codigo }).then(r => r.data?.data ?? r.data),
    onSuccess: (data: any) => {
      setQrModal(false); setCode(''); setQrData(null);
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      if (data?.backupCodes) setBackupCodes(data.backupCodes);
    },
    onError: () => message.error('Código incorrecto. Intenta de nuevo.'),
  });

  const deactivateMut = useMutation({
    mutationFn: (codigo: string) => api.delete('/auth/2fa/deactivate', { data: { codigo } }),
    onSuccess: () => {
      message.success('2FA desactivado');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: () => message.error('Código incorrecto. Intenta de nuevo.'),
  });

  const handleDeactivate = () => {
    Modal.confirm({
      title: 'Desactivar autenticación de dos factores',
      content: (
        <div>
          <p>Ingresa tu código de autenticador para confirmar:</p>
          <Input
            id="2fa-deactivate-code"
            maxLength={6}
            placeholder="123456"
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: 'Desactivar',
      okButtonProps: { danger: true },
      onOk: () => {
        const val = (document.getElementById('2fa-deactivate-code') as HTMLInputElement)?.value;
        if (!val || val.length !== 6) { message.error('Ingresa el código de 6 dígitos'); return Promise.reject(); }
        return deactivateMut.mutateAsync(val);
      },
    });
  };

  return (
    <Card
      title={<><SafetyOutlined /> Autenticación en Dos Factores (2FA)</>}
      style={{ marginTop: 16 }}
      extra={enabled
        ? <Tag color="green">Activado</Tag>
        : <Tag color="default">Desactivado</Tag>
      }
    >
      {enabled ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="success" showIcon
            message="Tu cuenta está protegida con 2FA"
            description="Cada vez que inicies sesión necesitarás tu aplicación de autenticador."
          />
          <Button danger onClick={handleDeactivate} loading={deactivateMut.isPending}>
            Desactivar 2FA
          </Button>
        </Space>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info" showIcon
            message="Protege tu cuenta con 2FA"
            description="Usa Google Authenticator, Authy u otra aplicación TOTP para añadir una capa extra de seguridad."
          />
          <Button
            type="primary" icon={<SafetyOutlined />}
            onClick={() => setupMut.mutate()}
            loading={setupMut.isPending}
          >
            Configurar 2FA
          </Button>
        </Space>
      )}

      {/* ── Modal códigos de respaldo ────────────────────────────────────── */}
      <Modal
        open={!!backupCodes}
        title="🔐 Guarda tus códigos de respaldo"
        onCancel={() => setBackupCodes(null)}
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => { navigator.clipboard.writeText((backupCodes ?? []).join('\n')); message.success('Códigos copiados'); }}>
              Copiar códigos
            </Button>
            <Button type="primary" onClick={() => { setBackupCodes(null); message.success('2FA activado exitosamente'); }}>
              He guardado mis códigos
            </Button>
          </div>
        }
        width={420}
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="Solo se muestran una vez"
          description="Guarda estos códigos en un lugar seguro. Úsalos si pierdes acceso a tu autenticador." />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#F8FAFC', padding: 16, borderRadius: 8, fontFamily: 'monospace', fontSize: 14 }}>
          {(backupCodes ?? []).map(code => (
            <div key={code} style={{ textAlign: 'center', padding: '6px 0', border: '1px solid #E2E8F0', borderRadius: 6, color: '#1E293B', fontWeight: 600 }}>{code}</div>
          ))}
        </div>
      </Modal>

      <Modal
        open={qrModal}
        title="Configura tu autenticador"
        onCancel={() => { setQrModal(false); setCode(''); }}
        footer={null}
        centered
        width={380}
      >
        {qrData && (
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
              Escanea este código QR con tu aplicación de autenticador (Google Authenticator, Authy, etc.)
            </Text>
            <img src={qrData.qrDataUrl} alt="QR 2FA" style={{ width: 200, height: 200 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>
              O ingresa el código manual: <Text code copyable style={{ fontSize: 10 }}>{qrData.secret}</Text>
            </Text>
            <Divider style={{ margin: '8px 0' }} />
            <Text strong>Ingresa el código de 6 dígitos para confirmar:</Text>
            <Input
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 4, width: 160 }}
              onPressEnter={() => code.length === 6 && activateMut.mutate(code)}
            />
            <Button
              type="primary" size="large" block
              disabled={code.length !== 6}
              loading={activateMut.isPending}
              onClick={() => activateMut.mutate(code)}
            >
              Activar 2FA
            </Button>
          </Space>
        )}
      </Modal>
    </Card>
  );
}

// ─── Helpers de dispositivos y ubicación ─────────────────────────────────────

function parsearDispositivo(ua: string | undefined): { nombre: string; esMovil: boolean } {
  if (!ua) return { nombre: 'Dispositivo desconocido', esMovil: false };
  const s = ua.toLowerCase();
  if (s.includes('iphone'))                          return { nombre: 'Apple iPhone', esMovil: true  };
  if (s.includes('ipad'))                            return { nombre: 'Apple iPad',   esMovil: true  };
  if (s.includes('android'))                         return { nombre: 'Android',      esMovil: true  };
  if (s.includes('macintosh') || s.includes('mac os x')) return { nombre: 'Mac',     esMovil: false };
  if (s.includes('windows'))                         return { nombre: 'Windows PC',   esMovil: false };
  if (s.includes('linux'))                           return { nombre: 'Linux',        esMovil: false };
  return { nombre: 'Dispositivo desconocido', esMovil: false };
}

async function resolverPais(ip: string): Promise<string> {
  if (!ip || ip.startsWith('10.') || ip.startsWith('192.168.')
          || ip.startsWith('172.1') || ip === '127.0.0.1' || ip === '::1') return 'Local';
  try {
    const r = await fetch(`https://api.country.is/${ip}`);
    const d = await r.json();
    return (d?.country as string) || '—';
  } catch {
    return '—';
  }
}

// ─── Sección de dispositivos conectados ──────────────────────────────────────

function SesionesActivasSection() {
  const qc = useQueryClient();
  const [paises, setPaises] = useState<Record<string, string>>({});

  const { data: sesiones, isLoading } = useQuery({
    queryKey: ['mis-sesiones'],
    queryFn: () => api.get('/auth/mis-sesiones').then(r => (r.data?.data ?? r.data) as any[]),
    refetchInterval: 60_000,
  });

  // Resolver país de cada IP única al cargar las sesiones
  useEffect(() => {
    if (!sesiones?.length) return;
    const ipsUnicas = [...new Set((sesiones as any[]).map(s => s.ipAddress).filter(Boolean))] as string[];
    ipsUnicas.forEach(async ip => {
      if (paises[ip]) return;
      const pais = await resolverPais(ip);
      setPaises(prev => ({ ...prev, [ip]: pais }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesiones]);

  const revocarMut = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sesiones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mis-sesiones'] });
      message.success('Sesión cerrada correctamente');
    },
    onError: () => message.error('No se pudo cerrar la sesión'),
  });

  // La sesión actual es la primera (backend la devuelve más reciente primero)
  const sesionActualId = sesiones?.[0]?.id;

  const columns = [
    {
      title: 'Nombre del dispositivo',
      key: 'dispositivo',
      render: (_: any, r: any) => {
        const { nombre, esMovil } = parsearDispositivo(r.deviceInfo);
        const esCurrent = r.id === sesionActualId;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{esMovil ? '📱' : '🖥️'}</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {nombre}
                {esCurrent && (
                  <Tag color="green" style={{ fontSize: 11, lineHeight: '18px', marginLeft: 2 }}>
                    Sesión actual
                  </Tag>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Ubicación aproximada',
      key: 'ubicacion',
      width: 160,
      render: (_: any, r: any) => {
        const pais = r.ipAddress ? (paises[r.ipAddress] ?? '…') : '—';
        return (
          <span style={{ color: '#1677ff', fontSize: 13 }}>
            {pais === 'Local' ? r.ipAddress ?? 'Local' : pais}
          </span>
        );
      },
    },
    {
      title: 'Actividad reciente',
      key: 'actividad',
      width: 170,
      render: (_: any, r: any) => {
        if (r.id === sesionActualId) {
          return <span style={{ color: '#6B7280', fontSize: 13 }}>Sesión actual</span>;
        }
        return (
          <Tooltip title={dRD(r.createdAt).format('DD/MM/YYYY HH:mm')}>
            <span style={{ fontSize: 13, color: '#6B7280', textTransform: 'capitalize' }}>
              {dayjs(r.createdAt).fromNow()}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '',
      key: 'cerrar',
      width: 48,
      render: (_: any, r: any) =>
        r.id === sesionActualId
          ? (
            <Tooltip title="No puedes cerrar tu sesión actual desde aquí">
              <Button type="text" size="small" disabled
                icon={<LogoutOutlined style={{ color: '#d1d5db' }} />} />
            </Tooltip>
          ) : (
            <Popconfirm
              title="¿Cerrar esta sesión?"
              description="El dispositivo quedará desconectado."
              okText="Cerrar"
              okButtonProps={{ danger: true }}
              onConfirm={() => revocarMut.mutate(r.id)}
            >
              <Tooltip title="Cerrar sesión en este dispositivo">
                <Button type="text" size="small"
                  icon={<LogoutOutlined style={{ color: '#9CA3AF' }} />}
                  loading={revocarMut.isPending} />
              </Tooltip>
            </Popconfirm>
          ),
    },
  ];

  return (
    <Card
      title={<><DesktopOutlined /> Dispositivos conectados</>}
      style={{ marginTop: 16 }}
      extra={
        <Popconfirm
          title="¿Cerrar todas las demás sesiones?"
          description="Quedarás conectado solo en el dispositivo actual."
          okText="Cerrar todas"
          okButtonProps={{ danger: true }}
          onConfirm={() => api.post('/auth/logout-all').then(() => {
            qc.invalidateQueries({ queryKey: ['mis-sesiones'] });
            message.success('Sesiones cerradas en todos los demás dispositivos');
          })}
        >
          <Button size="small" danger>Cerrar todas las demás</Button>
        </Popconfirm>
      }
    >
      <Table
        dataSource={sesiones ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        locale={{ emptyText: 'No hay sesiones activas' }}
        showHeader={!!sesiones?.length}
      />
    </Card>
  );
}

export default function ProfilePage() {
  const { user, updateUser, empresaActual } = useAuthStore();
  const [form]   = Form.useForm();
  const [ok,  setOk]  = useState(false);
  const [err, setErr] = useState('');

  // ── Edición de perfil ─────────────────────────────────────────────────────
  const [editing,     setEditing]     = useState(false);
  const [editNombre,  setEditNombre]  = useState('');

  const startEdit = () => {
    setEditNombre(user?.nombre ?? '');
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const updateProfileMut = useMutation({
    mutationFn: (nombre: string) =>
      api.patch('/auth/profile', { nombre }).then(r => r.data),
    onSuccess: (data) => {
      updateUser({ nombre: data.nombre });
      setEditing(false);
      message.success('Nombre actualizado correctamente');
    },
    onError: (e: any) => {
      const msg: string =
        e?.response?.data?.errors?.[0] ??
        e?.response?.data?.message ??
        'Error al actualizar el perfil';
      message.error(msg);
    },
  });

  const handleSaveProfile = () => {
    const nombre = editNombre.trim();
    if (!nombre || nombre.length < 3) {
      message.warning('El nombre debe tener al menos 3 caracteres');
      return;
    }
    updateProfileMut.mutate(nombre);
  };

  const isGoogleUser = user?.provider === 'GOOGLE';

  const changePwMut = useMutation({
    mutationFn: async (values: { currentPassword: string; newPassword: string }) => {
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword:     values.newPassword,
      });
    },
    onSuccess: () => {
      form.resetFields();
      setOk(true);
      setErr('');
      message.success('Contraseña actualizada exitosamente');
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.errors?.[0] ?? 'Error al cambiar contraseña');
      setOk(false);
    },
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>Mi Perfil</Title>

      <Row gutter={[24, 24]}>
        {/* Info del usuario */}
        <Col xs={24} md={8}>
          <Card>
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              {/* Avatar */}
              <Avatar size={80} style={{ background: '#1677ff', fontSize: 32 }} icon={<UserOutlined />} />

              {/* Nombre — modo lectura / edición */}
              {editing ? (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Input
                    value={editNombre}
                    onChange={e => setEditNombre(e.target.value)}
                    onPressEnter={handleSaveProfile}
                    maxLength={200}
                    autoFocus
                    size="large"
                    style={{ textAlign: 'center', fontWeight: 600 }}
                    placeholder="Tu nombre completo"
                    status={editNombre.trim().length > 0 && editNombre.trim().length < 3 ? 'error' : ''}
                  />
                  {editNombre.trim().length > 0 && editNombre.trim().length < 3 && (
                    <Text type="danger" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
                      Mínimo 3 caracteres
                    </Text>
                  )}
                  <Space style={{ justifyContent: 'center', width: '100%' }}>
                    <Button
                      type="primary" size="small" icon={<SaveOutlined />}
                      loading={updateProfileMut.isPending}
                      onClick={handleSaveProfile}
                      disabled={editNombre.trim().length < 3}
                    >
                      Guardar
                    </Button>
                    <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit}>
                      Cancelar
                    </Button>
                  </Space>
                </Space>
              ) : (
                <Space align="center" size={6}>
                  <Title level={4} style={{ margin: 0 }}>{user?.nombre}</Title>
                  <Tooltip title="Editar nombre">
                    <Button
                      type="text" size="small"
                      icon={<EditOutlined style={{ color: '#1677ff' }} />}
                      onClick={startEdit}
                      style={{ padding: '0 4px', height: 'auto' }}
                    />
                  </Tooltip>
                </Space>
              )}

              {/* Email — con indicador Google si aplica */}
              {isGoogleUser ? (
                <Tooltip title="Email vinculado a cuenta Google — no se puede cambiar">
                  <Space size={4} style={{ cursor: 'default' }}>
                    <GoogleOutlined style={{ color: '#ea4335', fontSize: 13 }} />
                    <Text type="secondary" style={{ fontSize: 13 }}>{user?.email}</Text>
                    <LinkOutlined style={{ color: '#94a3b8', fontSize: 11 }} />
                  </Space>
                </Tooltip>
              ) : (
                <Text type="secondary">{user?.email}</Text>
              )}

              <Tag color={roleColor[user?.role ?? 'viewer']} style={{ fontSize: 13, padding: '4px 12px' }}>
                {roleLabel[user?.role ?? 'viewer']}
              </Tag>
            </Space>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }}>
              <Row justify="space-between">
                <Text type="secondary">ID de usuario:</Text>
                <Text strong>#{user?.id}</Text>
              </Row>
              {empresaActual && (
                <Row justify="space-between">
                  <Text type="secondary">ID de empresa:</Text>
                  <Text strong>#{empresaActual}</Text>
                </Row>
              )}
              <Row justify="space-between">
                <Text type="secondary">Rol:</Text>
                <Text strong style={{ textTransform: 'capitalize' }}>{user?.role}</Text>
              </Row>
              {isGoogleUser && (
                <Row justify="space-between">
                  <Text type="secondary">Cuenta:</Text>
                  <Space size={4}>
                    <GoogleOutlined style={{ color: '#ea4335', fontSize: 12 }} />
                    <Text strong style={{ fontSize: 13 }}>Google</Text>
                  </Space>
                </Row>
              )}
              <Row justify="space-between">
                <Text type="secondary">Sistema:</Text>
                <Text strong>HiCloud ERP</Text>
              </Row>
            </Space>
          </Card>
        </Col>

        {/* Cambiar contraseña */}
        <Col xs={24} md={16}>
          <Card title={<><LockOutlined /> Cambiar contraseña</>}>
            {ok  && <Alert type="success" message="Contraseña actualizada exitosamente" showIcon style={{ marginBottom: 16 }} closable onClose={() => setOk(false)} />}
            {err && <Alert type="error"   message={err}                                  showIcon style={{ marginBottom: 16 }} closable onClose={() => setErr('')} />}

            <Form form={form} layout="vertical"
              onFinish={v => changePwMut.mutate(v)}
              style={{ maxWidth: 480 }}>
              <Form.Item name="currentPassword" label="Contraseña actual"
                rules={[{ required: true, message: 'Ingresa tu contraseña actual' }]}>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Contraseña actual"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Form.Item name="newPassword" label="Nueva contraseña"
                rules={[
                  { required: true, message: 'Ingresa la nueva contraseña' },
                  { min: 8, message: 'Mínimo 8 caracteres' },
                  { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, message: 'Debe tener mayúscula, minúscula y número' },
                ]}>
                <Input.Password prefix={<LockOutlined />} placeholder="Nueva contraseña" autoComplete="new-password" />
              </Form.Item>

              <Form.Item name="confirmPassword" label="Confirmar contraseña"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Confirma tu contraseña' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error('Las contraseñas no coinciden'));
                    },
                  }),
                ]}>
                <Input.Password prefix={<LockOutlined />} placeholder="Repite la nueva contraseña" autoComplete="new-password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={changePwMut.isPending}>
                Actualizar contraseña
              </Button>
            </Form>
          </Card>

          <TwoFactorSection />

          {['admin', 'contador'].includes(user?.role ?? '') && <SesionesActivasSection />}

          <Card title="Permisos de acceso" style={{ marginTop: 16 }}>
            <Row gutter={[12, 12]}>
              {[
                { label: 'Ver Dashboard',          ok: true },
                { label: 'Gestionar Clientes',     ok: ['admin','contador','vendedor'].includes(user?.role ?? '') },
                { label: 'Crear Facturas',         ok: ['admin','contador','vendedor'].includes(user?.role ?? '') },
                { label: 'Ver Reportes Fiscales',  ok: ['admin','contador'].includes(user?.role ?? '') },
                { label: 'Gestionar Usuarios',     ok: user?.role === 'admin' },
                { label: 'Configuración Sistema',  ok: user?.role === 'admin' },
                { label: 'Acceso a Auditoría',     ok: user?.role === 'admin' },
              ].map(p => (
                <Col span={12} key={p.label}>
                  <Tag color={p.ok ? 'success' : 'default'} style={{ width: '100%', textAlign: 'center', padding: '4px 0' }}>
                    {p.ok ? '✓' : '✗'} {p.label}
                  </Tag>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
