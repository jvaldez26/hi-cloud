import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  title:      string;
  value:      number;
  prefix?:    string;
  suffix?:    string;
  /** Color semántico — solo para ícono y valor. El fondo es siempre blanco/oscuro. */
  accent?:    string;
  /** @deprecated Usar accent en su lugar */
  gradient?:  string;
  icon:       React.ReactNode;
  trend?:     { value: number; label: string };
  formatter?: (n: number) => string;
  delay?:     number;
}

function useCountUp(target: number, duration = 1.2) {
  const [count, setCount] = useState(0);
  const frame = useRef<number>();

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setCount(Math.floor(target * ease));
      if (t < 1) frame.current = requestAnimationFrame(animate);
      else setCount(target);
    };
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current!);
  }, [target, duration]);

  return count;
}

// Extrae el primer color de un gradient legacy o devuelve el accent directo
function resolveAccent(accent?: string, gradient?: string): string {
  if (accent) return accent;
  if (gradient) {
    const m = gradient.match(/#[0-9a-fA-F]{3,6}/);
    return m ? m[0] : '#0EA5E9';
  }
  return '#0EA5E9';
}

export default function AnimatedStatCard({ title, value, prefix = '', suffix = '',
  accent, gradient, icon, trend, formatter, delay = 0 }: Props) {
  const animated = useCountUp(value, 1.4);
  const display  = formatter ? formatter(animated) : `${prefix}${animated.toLocaleString('es-DO')}${suffix}`;
  const color    = resolveAccent(accent, gradient);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      style={{ cursor: 'default', height: '100%' }}
    >
      <div style={{
        background:    'var(--hc-bg-card, #fff)',
        border:        '1px solid var(--hc-border, #E2E8F0)',
        borderRadius:  12,
        padding:       '18px 20px',
        boxShadow:     '0 1px 3px rgba(0,0,0,0.05)',
        display:       'flex',
        flexDirection: 'column',
        gap:            6,
        height:        '100%',
        position:      'relative',
      }}>
        {/* Franja de acento izquierda */}
        <div style={{
          position:     'absolute',
          left:          0, top: 16, bottom: 16,
          width:         3, borderRadius: '0 3px 3px 0',
          background:    color,
          opacity:       0.7,
        }} />

        {/* Label + ícono */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize:      12,
            fontWeight:    500,
            color:         'var(--hc-text-2, #64748B)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {title}
          </span>
          <span style={{ fontSize: 18, color, opacity: 0.85 }}>{icon}</span>
        </div>

        {/* Valor */}
        <div style={{
          fontSize:       26,
          fontWeight:     700,
          letterSpacing:  -0.5,
          color:          'var(--hc-text, #0F172A)',
          lineHeight:     1.1,
        }}>
          {display}
        </div>

        {/* Tendencia */}
        {trend && (
          <div style={{
            fontSize: 12,
            color:    trend.value >= 0 ? '#10B981' : '#EF4444',
            display:  'flex', alignItems: 'center', gap: 3,
          }}>
            <span>{trend.value >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}% {trend.label}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
