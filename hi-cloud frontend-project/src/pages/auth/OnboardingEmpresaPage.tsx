import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Button, message, Spin } from 'antd';
import { Building2, CheckCircle } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const SECTORES = [
  'COMERCIO', 'SERVICIOS', 'MANUFACTURA', 'CONSTRUCCION',
  'SALUD', 'EDUCACION', 'TECNOLOGIA', 'AGROPECUARIO', 'OTRO',
];

export default function OnboardingEmpresaPage() {
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const [form]     = Form.useForm();
  const [loading,  setLoading]  = useState(false);
  const [enviada,  setEnviada]  = useState(false);
  const [checking, setChecking] = useState(true);

  // Si ya tiene empresa → redirigir al dashboard
  useEffect(() => {
    api.get('/auth/mis-empresas')
      .then((r: any) => {
        const lista: any[] = r.data?.data ?? r.data ?? [];
        if (lista.length > 0) {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await api.post('/multi-empresa', values);
      setEnviada(true);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 20, padding: '40px 36px', maxWidth: 520, width: '100%',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {enviada ? (
          /* Pantalla de confirmación */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg,#10b98122,#059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', border: '2px solid #10b98144',
            }}>
              <CheckCircle size={34} color="#10b981" />
            </div>
            <h2 style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
              ✅ Solicitud enviada
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
              Tu empresa fue registrada. Un administrador revisará tu solicitud
              y recibirás un email cuando sea aprobada (menos de 24 horas).
            </p>
            <Button
              onClick={() => navigate('/pending-empresa', { replace: true })}
              style={{ background: '#1a56db', border: 'none', color: '#fff', borderRadius: 8, height: 40, fontWeight: 600 }}>
              Ver estado de mi solicitud
            </Button>
          </div>
        ) : (
          /* Formulario de onboarding */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={22} color="#fff" />
              </div>
              <div>
                <h1 style={{ color: '#f8fafc', fontSize: 20, fontWeight: 800, margin: 0 }}>
                  Crea tu empresa
                </h1>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                  {user?.nombre ? `Hola ${user.nombre.split(' ')[0]}, c` : 'C'}onfigura tu empresa para comenzar.
                </p>
              </div>
            </div>

            <Form form={form} layout="vertical" onFinish={handleSubmit}
              requiredMark={false}
              style={{ '--form-label-color': '#94a3b8' } as any}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="rnc" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>RNC *</span>}
                  rules={[{ required: true, message: 'RNC requerido' }, { pattern: /^\d{9}$|^\d{11}$/, message: '9 u 11 dígitos' }]}
                  style={{ marginBottom: 14 }}>
                  <Input placeholder="130000001" maxLength={11}
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 8 }} />
                </Form.Item>

                <Form.Item name="sector" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>Sector</span>}
                  initialValue="SERVICIOS" style={{ marginBottom: 14 }}>
                  <Select style={{ borderRadius: 8 }}
                    options={SECTORES.map(s => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))} />
                </Form.Item>
              </div>

              <Form.Item name="nombre" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>Razón Social *</span>}
                rules={[{ required: true, message: 'Nombre requerido' }]} style={{ marginBottom: 14 }}>
                <Input placeholder="Mi Empresa S.R.L."
                  style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 8 }} />
              </Form.Item>

              <Form.Item name="nombreComercial" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>Nombre Comercial</span>}
                style={{ marginBottom: 14 }}>
                <Input placeholder="Nombre en facturas (opcional)"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 8 }} />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="telefono" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>Teléfono</span>}
                  style={{ marginBottom: 14 }}>
                  <Input placeholder="809-000-0000"
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 8 }} />
                </Form.Item>
                <Form.Item name="email" label={<span style={{ color: '#94a3b8', fontSize: 13 }}>Email empresa</span>}
                  rules={[{ type: 'email', message: 'Email inválido' }]} style={{ marginBottom: 14 }}>
                  <Input placeholder="info@empresa.com"
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', borderRadius: 8 }} />
                </Form.Item>
              </div>

              <Button htmlType="submit" loading={loading} block
                style={{
                  background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none',
                  color: '#fff', borderRadius: 10, height: 44, fontSize: 15, fontWeight: 700, marginTop: 4,
                }}>
                Crear mi empresa →
              </Button>

              <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
                Tu solicitud será revisada. Recibirás acceso por email en menos de 24 horas.
              </p>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}
