import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';

export default function GoogleCallbackPage() {
  const [params]              = useSearchParams();
  const navigate              = useNavigate();
  const { login, setHydrated } = useAuthStore();
  const called                = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const error = params.get('error');
    if (error) {
      navigate('/login?error=google_failed', { replace: true });
      return;
    }

    // El backend redirige a /pending-approval si la cuenta es nueva (pendiente de aprobación)
    // Nota: este componente también maneja el caso en que el backend redirigió
    // directamente a /auth/callback — la ruta /pending-approval es manejada
    // por el backend directamente. Este guard es defensa extra en caso de
    // que el backend redirija con ?pending=true en el futuro.
    if (params.get('pending') === 'true') {
      navigate('/pending-approval', { replace: true });
      return;
    }

    // S-23: el backend seteó la cookie httpOnly — llamamos /auth/me
    // para obtener los datos reales del usuario (id correcto, empresas, etc.)
    // Si el usuario no tiene cuenta/empresa el backend redirigió a /login?error=...
    // y este componente no se ejecutaría — llegamos aquí solo con usuarios válidos.

    // SEGURIDAD: limpiar empresaId del localStorage al hacer login con Google.
    localStorage.removeItem('empresaId');
    localStorage.removeItem('mis_empresas');

    api.get('/auth/me')
      .then(r => {
        const user = r.data?.data?.user ?? r.data?.user ?? r.data;
        if (!user?.id) throw new Error('Sin usuario');

        login(user, null, []);

        if (user.role === 'super_admin') {
          navigate('/super-admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => {
        setHydrated(true);
        navigate('/login?error=google_failed', { replace: true });
      });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0d1117' }}>
      <Spin size="large" />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Iniciando sesión con Google…</p>
    </div>
  );
}
