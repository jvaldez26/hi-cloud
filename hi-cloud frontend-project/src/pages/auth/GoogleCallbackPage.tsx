import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../../store/auth.store';

export default function GoogleCallbackPage() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    const token     = params.get('token');
    const error     = params.get('error');
    const empresaId = params.get('empresaId');
    const nombre    = params.get('nombre') ?? '';
    const email     = params.get('email')  ?? '';
    const role      = params.get('role')   ?? 'viewer';

    if (error || !token) {
      navigate('/login?error=google_failed', { replace: true });
      return;
    }

    login(
      token,
      { id: 0, nombre, email, role: role as any },
      empresaId ? Number(empresaId) : null,
      [],
    );

    navigate('/dashboard', { replace: true });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0d1117' }}>
      <Spin size="large" />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Iniciando sesión con Google…</p>
    </div>
  );
}
