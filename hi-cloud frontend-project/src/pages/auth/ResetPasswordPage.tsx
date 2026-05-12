import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Result } from 'antd';
import { LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
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
        {done ? (
          <Result
            icon={<CheckCircleOutlined style={{ color: '#10b981', fontSize: 48 }} />}
            title={<span style={{ color: '#fff' }}>¡Contraseña restablecida!</span>}
            subTitle={<Text style={{ color: 'rgba(255,255,255,.5)' }}>Tu contraseña ha sido actualizada exitosamente.</Text>}
            extra={
              <Button type="primary" onClick={() => navigate('/login')}
                style={{ background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none' }}>
                Ir al login
              </Button>
            }
          />
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                background: 'rgba(16,185,129,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>🔑</div>
              <Title level={3} style={{ color: '#fff', margin: 0 }}>Nueva contraseña</Title>
              <Text style={{ color: 'rgba(255,255,255,.4)', display: 'block', marginTop: 6 }}>
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
                label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Nueva contraseña</Text>}
                rules={[
                  { required: true },
                  { min: 8, message: 'Mínimo 8 caracteres' },
                  { pattern: /(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, message: 'Mayúscula, minúscula y número' },
                ]}>
                <Input.Password prefix={<LockOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                  placeholder="Mínimo 8 caracteres" size="large"
                  style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
              </Form.Item>
              <Form.Item name="confirm" label={<Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Confirmar contraseña</Text>}
                dependencies={['password']}
                rules={[{ required: true },
                         ({ getFieldValue }) => ({
                           validator(_, v) {
                             return !v || getFieldValue('password') === v
                               ? Promise.resolve()
                               : Promise.reject('Las contraseñas no coinciden');
                           },
                         })]}>
                <Input.Password prefix={<LockOutlined style={{ color: 'rgba(255,255,255,.3)' }} />}
                  placeholder="Repite la contraseña" size="large"
                  style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#fff', borderRadius: 8 }} />
              </Form.Item>
              <Button type="primary" htmlType="submit" block size="large"
                loading={mut.isPending}
                style={{
                  height: 48, background: 'linear-gradient(135deg,#059669,#10b981)',
                  border: 'none', borderRadius: 10, fontWeight: 600,
                }}>
                Restablecer contraseña
              </Button>
            </Form>

            <Text style={{ display: 'block', textAlign: 'center', marginTop: 16,
                           color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
              ¿No pediste esto?{' '}
              <Link to="/login" style={{ color: 'rgba(255,255,255,.5)' }}>Ignora este enlace</Link>
            </Text>
          </>
        )}
      </motion.div>
    </div>
  );
}
