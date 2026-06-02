import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spin } from 'antd';
import { Clock, CheckCircle, Mail, LogOut } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

export default function PendingEmpresaPage() {
  const navigate          = useNavigate();
  const { user, logout }  = useAuthStore();
  const [empresa, setEmpresa] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/mis-empresas')
      .then((r: any) => {
        const lista: any[] = r.data?.data ?? r.data ?? [];
        if (lista.length === 0) {
          // Sin empresa → volver al onboarding
          navigate('/onboarding/empresa', { replace: true });
          return;
        }
        const pendiente = lista.find((e: any) => e.estadoAprobacion === 'pendiente');
        const aprobada  = lista.find((e: any) => e.estadoAprobacion === 'aprobada' || !e.estadoAprobacion);

        if (aprobada) {
          // Tiene empresa aprobada → ir al dashboard
          navigate('/dashboard', { replace: true });
          return;
        }
        setEmpresa(pendiente ?? lista[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (loading) {
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
        borderRadius: 20, padding: '48px 40px', maxWidth: 520, width: '100%',
        textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Icono */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg,#f59e0b22,#d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', border: '2px solid #f59e0b44',
        }}>
          <Clock size={36} color="#f59e0b" />
        </div>

        <h1 style={{ color: '#f8fafc', fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>
          ⏳ Tu empresa está siendo revisada
        </h1>
        {empresa && (
          <p style={{ color: '#3b82f6', fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>
            {empresa.nombre}
          </p>
        )}
        <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6, margin: '0 0 32px' }}>
          Un administrador revisará tu solicitud y recibirás acceso en menos de{' '}
          <strong style={{ color: '#e2e8f0' }}>24 horas</strong>.
        </p>

        {/* Pasos */}
        <div style={{
          background: '#0f172a', borderRadius: 12, padding: '20px 24px',
          marginBottom: 28, textAlign: 'left',
        }}>
          {[
            { icon: <CheckCircle size={16} color="#10b981" />, text: 'Empresa registrada correctamente', done: true },
            { icon: <Clock size={16} color="#f59e0b" />, text: 'Revisión del equipo HiCloud (< 24h)', done: false },
            { icon: <Mail size={16} color="#64748b" />, text: `Email de confirmación a ${user?.email ?? ''}`, done: false },
          ].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0', borderBottom: i < 2 ? '1px solid #1e293b' : 'none',
            }}>
              {step.icon}
              <span style={{ color: step.done ? '#e2e8f0' : '#64748b', fontSize: 14 }}>{step.text}</span>
            </div>
          ))}
        </div>

        <p style={{ color: '#475569', fontSize: 13, marginBottom: 20 }}>
          ¿Tienes preguntas? Escríbenos a{' '}
          <a href="mailto:soporte@hicloudrd.com" style={{ color: '#3b82f6' }}>soporte@hicloudrd.com</a>
        </p>

        <Button onClick={handleLogout} icon={<LogOut size={14} />}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, height: 38 }}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
