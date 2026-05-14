import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Result, message } from 'antd';
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
    <div style={{
      minHeight: '100vh', background: '#0d1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        style={{
          width: 420, background: '#111827',
          borderRadius: 16, padding: 36,
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 6,
                                   marginBottom: 28, textDecoration: 'none', color: 'rgba(255,255,255,.5)' }}>
          <ArrowLeftOutlined style={{ fontSize: 12 }} />
          <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>Volver al login</Text>
        </Link>

        {sent ? (
          <Result
            icon={<MailOutlined style={{ color: '#1677ff', fontSize: 48 }} />}
            title={<span style={{ color: '#fff' }}>Revisa tu email</span>}
            subTitle={
              <Text style={{ color: 'rgba(255,255,255,.5)' }}>
                Si el email está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </Text>
            }
          />
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                background: 'rgba(26,86,219,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>🔐</div>
              <Title level={3} style={{ color: '#fff', margin: 0 }}>¿Olvidaste tu contraseña?</Title>
              <Text style={{ color: 'rgba(255,255,255,.4)', display: 'block', marginTop: 6 }}>
                Ingresa tu email y te enviaremos un enlace para restablecerla.
              </Text>
            </div>

            {mut.isError && (
              <Alert type="error" message="Error al procesar la solicitud"
                style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
            )}

            <Form layout="vertical" onFinish={v => mut.mutate(v.email)}>
              <Form.Item name="email" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Email</Text>}
                rules={[{ required: true }, { type: 'email' }]}>
                <Input prefix={<MailOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                  placeholder="tu@empresa.com" size="large"
                  style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large"
                loading={mut.isPending}
                style={{
                  height: 48, background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                  border: 'none', borderRadius: 10, fontWeight: 600,
                }}>
                Enviar enlace de restablecimiento
              </Button>
            </Form>
          </>
        )}
      </motion.div>
    </div>
  );
}
