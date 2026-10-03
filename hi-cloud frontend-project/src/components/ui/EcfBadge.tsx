import { Tooltip } from 'antd';
import { CheckCircle, Clock, XCircle, AlertTriangle, Send, FileText, RefreshCw } from 'lucide-react';

export type EstadoEcf =
  | 'pendiente' | 'aceptado' | 'rechazado' | 'condicionado'
  | 'borrador' | 'pendiente_envio' | 'enviado' | 'observado' | 'contingencia'
  | 'en_validacion_dgii';

interface Config { label: string; color: string; bg: string; icon: React.ReactNode; tooltipExtra?: string }

const ESTADO_CONFIG: Record<EstadoEcf, Config> = {
  aceptado:      { label: 'Aceptado DGII',    color: '#15803D', bg: '#F0FDF4', icon: <CheckCircle size={11} /> },
  observado:     { label: 'Observado DGII',   color: '#92400E', bg: '#FFFBEB', icon: <AlertTriangle size={11} /> },
  rechazado:     { label: 'Rechazado DGII',   color: '#DC2626', bg: '#FEF2F2', icon: <XCircle size={11} /> },
  condicionado:  { label: 'Condicionado',     color: '#D97706', bg: '#FFFBEB', icon: <AlertTriangle size={11} /> },
  enviado:       { label: 'Enviado a DGII',   color: '#1D4ED8', bg: '#EFF6FF', icon: <Send size={11} /> },
  pendiente_envio:{ label: 'Pendiente envío', color: '#D97706', bg: '#FFFBEB', icon: <Clock size={11} /> },
  pendiente:     { label: 'Pendiente',        color: '#D97706', bg: '#FFFBEB', icon: <Clock size={11} /> },
  borrador:      { label: 'Borrador',         color: '#64748B', bg: '#F1F5F9', icon: <FileText size={11} /> },
  contingencia:  { label: 'Contingencia',     color: '#7C3AED', bg: '#F5F3FF', icon: <AlertTriangle size={11} /> },
  en_validacion_dgii: {
    label: 'En validación DGII', color: '#D97706', bg: '#FFFBEB', icon: <RefreshCw size={11} />,
    tooltipExtra: 'DGII no ha respondido (posible mantenimiento). HiCloud lo consulta automáticamente cada cierto tiempo. No es necesario reenviar.',
  },
};

interface Props {
  estado:  EstadoEcf;
  encf?:   string;
  small?:  boolean;
}

export default function EcfBadge({ estado, encf, small }: Props) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.pendiente;
  const tooltipTitle = cfg.tooltipExtra
    ? (encf ? `${cfg.tooltipExtra} (eNCF: ${encf})` : cfg.tooltipExtra)
    : (encf ? `eNCF: ${encf}` : undefined);
  return (
    <Tooltip title={tooltipTitle}>
      <span style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:             4,
        background:      cfg.bg,
        color:           cfg.color,
        border:         `1px solid ${cfg.color}33`,
        borderRadius:    5,
        padding:         small ? '1px 5px' : '2px 7px',
        fontSize:        small ? 10 : 11,
        fontWeight:      600,
        whiteSpace:      'nowrap',
        cursor:          encf ? 'help' : 'default',
      }}>
        {cfg.icon}
        {cfg.label}
        {encf && !small && (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10 }}>
            {encf.slice(-6)}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
