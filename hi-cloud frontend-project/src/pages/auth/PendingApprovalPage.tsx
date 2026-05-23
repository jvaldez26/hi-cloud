import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { Clock, Mail, CheckCircle } from 'lucide-react';

export default function PendingApprovalPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 20,
        padding: '48px 40px',
        maxWidth: 520,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Icono animado */}
        <div style={{
          width: 80, height: 80,
          background: 'linear-gradient(135deg, #f59e0b22, #d97706)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          border: '2px solid #f59e0b44',
        }}>
          <Clock size={36} color="#f59e0b" />
        </div>

        <h1 style={{ color: '#f8fafc', fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
          Solicitud recibida
        </h1>

        <p style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1.6, margin: '0 0 32px' }}>
          Tu cuenta está <strong style={{ color: '#f59e0b' }}>pendiente de aprobación</strong>.
          Nuestro equipo revisará tu solicitud y recibirás un email en menos de{' '}
          <strong style={{ color: '#e2e8f0' }}>24 horas</strong>.
        </p>

        {/* Pasos */}
        <div style={{
          background: '#0f172a',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 32,
          textAlign: 'left',
        }}>
          {[
            { icon: <CheckCircle size={16} color="#10b981" />, text: 'Cuenta registrada correctamente', done: true },
            { icon: <Clock size={16} color="#f59e0b" />,       text: 'Revisión del equipo HiCloud (< 24h)', done: false },
            { icon: <Mail size={16} color="#64748b" />,        text: 'Recibirás un email con acceso', done: false },
          ].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 0',
              borderBottom: i < 2 ? '1px solid #1e293b' : 'none',
            }}>
              {step.icon}
              <span style={{ color: step.done ? '#e2e8f0' : '#64748b', fontSize: 14 }}>
                {step.text}
              </span>
            </div>
          ))}
        </div>

        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
          ¿Tienes preguntas? Escríbenos a{' '}
          <a href="mailto:soporte@hicloudrd.com" style={{ color: '#3b82f6' }}>
            soporte@hicloudrd.com
          </a>
        </p>

        <Button
          type="default"
          onClick={() => navigate('/login')}
          style={{
            background: 'transparent',
            border: '1px solid #334155',
            color: '#94a3b8',
            borderRadius: 8,
            height: 40,
          }}
        >
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}
