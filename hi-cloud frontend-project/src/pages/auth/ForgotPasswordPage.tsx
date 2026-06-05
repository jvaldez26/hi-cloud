import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Result, message, ConfigProvider, theme as antTheme } from 'antd';
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const mut = useMutation({
    mutationFn: (email: string) =>
      api.post('/auth/forgot-password', { email }).then(r => r.data?.data ?? r.data),
    onSuccess: () => setSent(true),
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? e?.message ?? 'Error al enviar el correo'),
  });

  return (
    <ConfigProvider theme={{
      algorithm: antTheme.defaultAlgorithm,
      token: { colorBgContainer:'#F8FAFC', colorText:'#0F172A', colorBorder:'#CBD5E1', colorPrimary:'#2563EB', borderRadius:10, controlHeight:48 },
    }}>
      <div style={{
        minHeight: '100vh', background: '#F8FAFC',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          style={{
            width: 420, background: '#FFFFFF',
            borderRadius: 16, padding: 36,
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 24px rgba(0,0,0,.06)',
          }}
        >
          <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 6,
                                     marginBottom: 28, textDecoration: 'none' }}>
            <ArrowLeftOutlined style={{ fontSize: 12, color: '#64748B' }} />
            <Text style={{ color: '#64748B', fontSize: 13 }}>Volver al login</Text>
          </Link>

          {sent ? (
            <Result
              icon={<MailOutlined style={{ color: '#2563EB', fontSize: 48 }} />}
              title={<span style={{ color: '#0F172A' }}>Revisa tu email</span>}
              subTitle={
                <Text style={{ color: '#6B7280' }}>
                  Si el email está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
                </Text>
              }
            />
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                  background: '#EFF6FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>🔐</div>
                <Title level={3} style={{ color: '#0F172A', margin: 0 }}>¿Olvidaste tu contraseña?</Title>
                <Text style={{ color: '#6B7280', display: 'block', marginTop: 6 }}>
                  Ingresa tu email y te enviaremos un enlace para restablecerla.
                </Text>
              </div>

              {mut.isError && (
                <Alert type="error" message="Error al procesar la solicitud"
                  style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
              )}

              <Form layout="vertical" onFinish={v => mut.mutate(v.email)}>
                <Form.Item name="email" label={<Text style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 600 }}>Email</Text>}
                  rules={[{ required: true }, { type: 'email' }]}>
                  <Input prefix={<MailOutlined style={{ color: '#64748B' }} />}
                    placeholder="tu@empresa.com" size="large" />
                </Form.Item>
                <Button type="primary" htmlType="submit" block size="large"
                  loading={mut.isPending}
                  style={{ height: 48, background: '#2563EB', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                  Enviar enlace de restablecimiento
                </Button>
              </Form>
            </>
          )}
        </motion.div>
      </div>
    </ConfigProvider>
  );
}
