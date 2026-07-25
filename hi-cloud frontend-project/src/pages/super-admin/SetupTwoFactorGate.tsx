/**
 * S-65 — Enrollment obligatorio de 2FA para el Super Admin.
 *
 * El backend (SuperAdminGuard) responde 403 con code SUPER_ADMIN_2FA_REQUERIDA a
 * todo /admin/* mientras la cuenta no tenga segundo factor. Esta pantalla es la
 * vía de salida: /auth/2fa/* va con JwtAuthGuard, no con SuperAdminGuard, así que
 * sigue accesible desde la sesión ya iniciada. Configurada la 2FA, el panel se
 * desbloquea sin intervención manual — no hay forma de quedarse fuera.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Typography, Space, Alert, Spin, App as AntApp } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title, Text, Paragraph } = Typography;

interface Props { children: React.ReactNode; }

export default function SetupTwoFactorGate({ children }: Props) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState('');
  const [qrData, setQrData] = useState<{ qrDataUrl: string; secret: string } | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn:  () => api.get('/auth/2fa/status').then(r => r.data?.data ?? r.data),
    staleTime: 0,
  });

  const setup = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup', {}).then(r => r.data?.data ?? r.data),
    onSuccess: (d) => setQrData(d),
    onError:   () => message.error('No se pudo generar el código QR'),
  });

  const activar = useMutation({
    mutationFn: (c: string) => api.post('/auth/2fa/activate', { codigo: c }).then(r => r.data?.data ?? r.data),
    onSuccess: () => {
      message.success('Verificación en dos pasos activada');
      setCodigo('');
      qc.invalidateQueries();          // desbloquea el panel y refresca sus datos
    },
    onError: () => message.error('Código incorrecto — revisa tu autenticador'),
  });

  if (isLoading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><Spin size="large" /></div>;
  }

  // Ya tiene 2FA → panel normal. GET /auth/2fa/status devuelve { enabled }.
  if (status?.enabled === true) return <>{children}</>;

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24, background: 'var(--hc-bg, #f5f5f5)' }}>
      <Card style={{ maxWidth: 520, width: '100%' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <SafetyCertificateOutlined style={{ fontSize: 48, color: '#1a56db' }} />
            <Title level={3} style={{ marginTop: 12, marginBottom: 0 }}>
              Protege el panel de administración
            </Title>
          </div>

          <Alert
            type="warning"
            showIcon
            message="Verificación en dos pasos requerida"
            description="Esta cuenta controla todas las empresas de la plataforma. Para usar el panel necesitas configurar un segundo factor. Tu sesión sigue activa: al terminar, el panel se desbloquea."
          />

          {!qrData ? (
            <Button
              type="primary" size="large" block
              loading={setup.isPending}
              onClick={() => setup.mutate()}
            >
              Comenzar configuración
            </Button>
          ) : (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Paragraph style={{ marginBottom: 0 }}>
                1. Escanea el código con Google Authenticator, Authy o similar:
              </Paragraph>
              <div style={{ textAlign: 'center' }}>
                <img src={qrData.qrDataUrl} alt="Código QR para 2FA" style={{ width: 200, height: 200 }} />
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    ¿No puedes escanear? Código manual:{' '}
                    <Text code copyable style={{ fontSize: 11 }}>{qrData.secret}</Text>
                  </Text>
                </div>
              </div>

              <Paragraph style={{ marginBottom: 0 }}>
                2. Escribe el código de 6 dígitos que muestra la app:
              </Paragraph>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="large"
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                  onPressEnter={() => codigo.length === 6 && activar.mutate(codigo)}
                  style={{ letterSpacing: 4, textAlign: 'center' }}
                />
                <Button
                  type="primary" size="large"
                  loading={activar.isPending}
                  disabled={codigo.length !== 6}
                  onClick={() => activar.mutate(codigo)}
                >
                  Activar
                </Button>
              </Space.Compact>
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
}
