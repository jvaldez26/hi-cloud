import { Button, Progress } from 'antd';
import { AlertTriangle, Zap, Crown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { suscripcionesApi } from '../../api/suscripciones.api';

export default function PlanBanner() {
  const navigate = useNavigate();

  const { data: suscripcion } = useQuery({
    queryKey: ['mi-plan'],
    queryFn:  suscripcionesApi.miPlan,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: limites } = useQuery({
    queryKey: ['mis-limites'],
    queryFn:  suscripcionesApi.misLimites,
    staleTime: 2 * 60 * 1000,
    enabled: !!suscripcion,
    retry: false,
  });

  if (!suscripcion) return null;

  const plan   = suscripcion.plan as string;
  const dias   = suscripcion.diasRestantes as number;
  const estado = suscripcion.estado as string;

  // ── Vencida / suspendida ──────────────────────────────────────────────────
  if (estado === 'vencida' || estado === 'suspendida') {
    return (
      <div style={{
        background: '#FEF2F2', borderBottom: '2px solid #EF4444',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 13 }}>
            Tu suscripción ha <strong>vencido</strong>. El acceso al sistema está limitado.
          </span>
        </div>
        <Button danger size="small" onClick={() => navigate('/suscripcion/planes')}>
          Renovar ahora
        </Button>
      </div>
    );
  }

  // ── Límites bloqueados ────────────────────────────────────────────────────
  const bloqueos: string[] = [];
  const alertasLimites: string[] = [];

  if (limites) {
    for (const key of ['facturas', 'productos', 'clientes', 'usuarios']) {
      const l = limites[key as keyof typeof limites] as any;
      if (!l || l.ilimitado) continue;
      if (l.bloqueado)   bloqueos.push(`${l.usado}/${l.limite} ${key}`);
      else if (l.alerta) alertasLimites.push(`${l.usado}/${l.limite} ${key} (${l.porcentaje}%)`);
    }
  }

  if (bloqueos.length > 0) {
    return (
      <div style={{
        background: '#FEF2F2', borderBottom: '2px solid #EF4444',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 13 }}>
            🚫 Límite alcanzado: <strong>{bloqueos.join(', ')}</strong>. Actualiza tu plan.
          </span>
        </div>
        <Button danger size="small" onClick={() => navigate('/suscripcion/planes')}>
          Ver planes
        </Button>
      </div>
    );
  }

  if (alertasLimites.length > 0) {
    return (
      <div style={{
        background: '#FFFBEB', borderBottom: '2px solid #F59E0B',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#D97706" />
          <span style={{ color: '#92400E', fontSize: 13 }}>
            ⚠️ Cerca del límite: <strong>{alertasLimites.join(', ')}</strong>
          </span>
        </div>
        <Button size="small" onClick={() => navigate('/suscripcion/planes')}
          style={{ borderColor: '#D97706', color: '#92400E' }}>
          Actualizar plan
        </Button>
      </div>
    );
  }

  // ── Trial activo ──────────────────────────────────────────────────────────
  if (plan === 'trial') {
    const urgente = dias <= 5;
    return (
      <div style={{
        background: urgente ? '#FEF2F2' : '#EFF6FF',
        borderBottom: `2px solid ${urgente ? '#EF4444' : '#3B82F6'}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {urgente ? <AlertTriangle size={16} color="#EF4444" /> : <Zap size={16} color="#3B82F6" />}
          <span style={{
            background: urgente ? '#EF444422' : '#3B82F622',
            border: `1px solid ${urgente ? '#EF4444' : '#3B82F6'}44`,
            borderRadius: 5, padding: '1px 7px',
            color: urgente ? '#EF4444' : '#3B82F6', fontSize: 11, fontWeight: 700,
          }}>TRIAL</span>
          <span style={{ color: urgente ? '#991B1B' : '#1E3A5F', fontSize: 13, fontWeight: 500 }}>
            {urgente
              ? `¡Solo quedan ${dias} día${dias !== 1 ? 's' : ''} de prueba!`
              : `Prueba gratuita · ${dias} días restantes`}
          </span>
          <Progress percent={Math.round((1 - dias / 30) * 100)} size="small"
            style={{ width: 70, margin: 0 }}
            strokeColor={urgente ? '#EF4444' : '#3B82F6'} showInfo={false} />
        </div>
        <Button size="small" type={urgente ? 'primary' : 'default'}
          onClick={() => navigate('/suscripcion/planes')}
          style={urgente ? { background: '#EF4444', border: 'none', color: '#fff' } : undefined}>
          {urgente ? 'Actualizar ahora' : 'Ver planes'}
        </Button>
      </div>
    );
  }

  // ── Plan pago activo → indicador discreto ─────────────────────────────────
  return (
    <div style={{
      background: '#F0FDF4', borderBottom: '1px solid #BBF7D0',
      padding: '5px 20px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <Crown size={12} color="#10B981" />
      <span style={{ color: '#065F46', fontSize: 12 }}>
        Plan <strong>{suscripcion.info?.nombre ?? plan}</strong> activo
        {dias > 0 ? ` · vence en ${dias} días` : ''}
      </span>
      <button onClick={() => navigate('/suscripcion/planes')} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#10B981', fontSize: 11, fontWeight: 600, marginLeft: 4,
        padding: 0, textDecoration: 'underline',
      }}>Ver planes</button>
    </div>
  );
}
