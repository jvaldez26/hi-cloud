import { Button } from 'antd';
import { Lock, ArrowRight, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PLAN_LABEL: Record<string, string> = {
  trial:       'TRIAL',
  basico:      'BÁSICO',
  profesional: 'PROFESIONAL',
  empresarial: 'EMPRESARIAL',
  enterprise:  'ENTERPRISE',
};

const PLAN_COLOR: Record<string, string> = {
  trial:       '#94A3B8',
  basico:      '#3B82F6',
  profesional: '#8B5CF6',
  empresarial: '#F59E0B',
  enterprise:  '#EF4444',
};

interface Props {
  modulo:      string;
  planMinimo:  string;
  planActual:  string;
}

export default function ModuloBloqueado({ modulo, planMinimo, planActual }: Props) {
  const navigate = useNavigate();
  const color    = PLAN_COLOR[planMinimo] ?? '#8B5CF6';

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      borderRadius: 16,
      padding: 40,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        {/* Ícono candado */}
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: `${color}22`, border: `2px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <Lock size={36} color={color} />
        </div>

        {/* Badge plan requerido */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: `${color}22`, border: `1px solid ${color}55`,
          borderRadius: 8, padding: '4px 12px', marginBottom: 20,
        }}>
          <Crown size={14} color={color} />
          <span style={{ color, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em' }}>
            REQUIERE PLAN {PLAN_LABEL[planMinimo] ?? planMinimo.toUpperCase()}
          </span>
        </div>

        <h2 style={{
          color: '#F8FAFC', fontWeight: 800, fontSize: 22,
          margin: '0 0 12px',
        }}>
          {modulo}
        </h2>

        <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
          Este módulo no está incluido en tu plan actual{' '}
          <span style={{
            background: '#334155', borderRadius: 6, padding: '1px 8px',
            fontWeight: 700, color: '#F8FAFC', fontSize: 13,
          }}>
            {PLAN_LABEL[planActual] ?? planActual.toUpperCase()}
          </span>.
        </p>

        <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 32px' }}>
          Actualiza tu plan para acceder a este módulo y muchas más funcionalidades.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRight size={16} />}
            onClick={() => navigate('/suscripcion/planes')}
            style={{
              background: color, border: 'none',
              fontWeight: 700, height: 44, paddingInline: 28,
            }}>
            Ver planes y precios
          </Button>
          <Button
            size="large"
            onClick={() => navigate('/dashboard')}
            style={{
              background: '#1E293B', border: '1px solid #334155',
              color: '#94A3B8', height: 44,
            }}>
            Volver al Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
