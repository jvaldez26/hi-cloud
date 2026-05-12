import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Typography } from 'antd';

const { Text, Title } = Typography;

interface Props {
  title:      string;
  value:      number;
  prefix?:    string;
  suffix?:    string;
  gradient:   string;
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

export default function AnimatedStatCard({ title, value, prefix = '', suffix = '',
  gradient, icon, trend, formatter, delay = 0 }: Props) {
  const animated = useCountUp(value, 1.4);
  const display  = formatter ? formatter(animated) : `${prefix}${animated.toLocaleString('es-DO')}${suffix}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4, scale: 1.025, transition: { duration: 0.2 } }}
      style={{ cursor: 'default' }}
    >
      <div style={{
        background:   gradient,
        borderRadius: 14,
        padding:      '20px 24px',
        boxShadow:    '0 8px 32px rgba(0,0,0,.14)',
        display:      'flex',
        flexDirection: 'column',
        gap:           8,
        color:         '#fff',
        position:     'relative',
        overflow:     'hidden',
      }}>
        {/* Círculo decorativo de fondo */}
        <div style={{
          position:     'absolute',
          right:        -20,
          top:          -20,
          width:         90,
          height:        90,
          borderRadius: '50%',
          background:   'rgba(255,255,255,.12)',
          pointerEvents:'none',
        }} />
        <div style={{
          position:     'absolute',
          right:         10,
          bottom:       -30,
          width:         70,
          height:        70,
          borderRadius: '50%',
          background:   'rgba(255,255,255,.08)',
          pointerEvents:'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 500 }}>{title}</Text>
          <div style={{ fontSize: 22, opacity: .9 }}>{icon}</div>
        </div>

        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
          {display}
        </div>

        {trend && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{trend.value >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}% {trend.label}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
