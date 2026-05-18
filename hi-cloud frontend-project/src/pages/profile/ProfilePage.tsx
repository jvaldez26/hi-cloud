import { useState } from 'react';
import { Card, Form, Input, Button, Row, Col, Typography, Tag, Avatar,
         Space, Divider, message, Alert, Modal } from 'antd';
import { UserOutlined, LockOutlined, SaveOutlined, SafetyOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';

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

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [form]   = Form.useForm();
  const [ok,  setOk]  = useState(false);
  const [err, setErr] = useState('');

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
              <Avatar size={80} style={{ background: '#1677ff', fontSize: 32 }} icon={<UserOutlined />} />
              <Title level={4} style={{ margin: 0 }}>{user?.nombre}</Title>
              <Text type="secondary">{user?.email}</Text>
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
              <Row justify="space-between">
                <Text type="secondary">Rol:</Text>
                <Text strong style={{ textTransform: 'capitalize' }}>{user?.role}</Text>
              </Row>
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
