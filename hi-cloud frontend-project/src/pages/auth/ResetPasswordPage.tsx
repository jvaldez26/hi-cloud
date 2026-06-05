import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Result, message,
         ConfigProvider, theme as antTheme } from 'antd';
import { LockOutlined, CheckCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate  = useNavigate();
  const [done, setDone] = useState(false);

  const mut = useMutation({
    mutationFn: (password: string) =>
      api.post(`/auth/reset-password/${token}`, { password }).then(r => r.data?.data ?? r.data),
    onSuccess: () => setDone(true),
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? e?.message ?? 'Error al restablecer la contraseña'),
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

          {done ? (
            <Result
              icon={<CheckCircleOutlined style={{ color: '#10B981', fontSize: 48 }} />}
              title={<span style={{ color: '#0F172A' }}>¡Contraseña restablecida!</span>}
              subTitle={<Text style={{ color: '#6B7280' }}>Tu contraseña ha sido actualizada exitosamente.</Text>}
              extra={
                <Button type="primary" onClick={() => navigate('/login')}
                  style={{ background: '#2563EB', border: 'none', borderRadius: 10, fontWeight: 600 }}>
                  Ir al login
                </Button>
              }
            />
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                  background: '#ECFDF5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>🔑</div>
                <Title level={3} style={{ color: '#0F172A', margin: 0 }}>Nueva contraseña</Title>
                <Text style={{ color: '#6B7280', display: 'block', marginTop: 6 }}>
                  Elige una contraseña segura para tu cuenta.
                </Text>
              </div>

              {mut.isError && (
                <Alert type="error"
                  message={(mut.error as any)?.response?.data?.errors?.[0] ?? 'El enlace ha expirado. Solicita uno nuevo.'}
                  style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
              )}

              <Form layout="vertical" onFinish={v => mut.mutate(v.password)}>
                <Form.Item name="password"
                  label={<Text style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 600 }}>Nueva contraseña</Text>}
                  rules={[
                    { required: true },
                    { min: 8, message: 'Mínimo 8 caracteres' },
                    { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, message: 'Mayúscula, minúscula y número' },
                  ]}>
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#64748B' }} />}
                    placeholder="Mínimo 8 caracteres" size="large" />
                </Form.Item>

                <Form.Item name="confirm"
                  label={<Text style={{ color: '#1E3A8A', fontSize: 13, fontWeight: 600 }}>Confirmar contraseña</Text>}
                  dependencies={['password']}
                  rules={[
                    { required: true },
                    ({ getFieldValue }) => ({
                      validator(_, v) {
                        return !v || getFieldValue('password') === v
                          ? Promise.resolve()
                          : Promise.reject('Las contraseñas no coinciden');
                      },
                    }),
                  ]}>
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#64748B' }} />}
                    placeholder="Repite la contraseña" size="large" />
                </Form.Item>

                <Button type="primary" htmlType="submit" block size="large"
                  loading={mut.isPending}
                  style={{
                    height: 48, background: '#059669',
                    border: 'none', borderRadius: 10, fontWeight: 600,
                  }}>
                  Restablecer contraseña
                </Button>
              </Form>

              <Text style={{ display: 'block', textAlign: 'center', marginTop: 16,
                             color: '#9CA3AF', fontSize: 12 }}>
                ¿No pediste esto?{' '}
                <Link to="/login" style={{ color: '#64748B' }}>Ignora este enlace</Link>
              </Text>
            </>
          )}
        </motion.div>
      </div>
    </ConfigProvider>
  );
}
