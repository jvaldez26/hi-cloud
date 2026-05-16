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

    // S-23: el backend seteó la cookie httpOnly — llamamos /auth/me
    // para obtener los datos reales del usuario (id correcto, empresas, etc.)
    const empresaId  = params.get('empresaId');
    const sinEmpresa = params.get('sinEmpresa') === 'true' || !empresaId;

    api.get('/auth/me')
      .then(r => {
        const user = r.data?.data?.user ?? r.data?.user ?? r.data;
        if (!user?.id) throw new Error('Sin usuario');

        const empresasRaw = localStorage.getItem('mis_empresas');
        const empresas    = empresasRaw ? JSON.parse(empresasRaw) : [];
        login(user, empresaId ? Number(empresaId) : null, empresas);

        if (user.role === 'super_admin') {
          navigate('/super-admin', { replace: true });
        } else if (sinEmpresa) {
          // Usuario nuevo con Google o sin empresa → ir directo a crear empresa
          navigate('/mis-empresas', { replace: true });
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
