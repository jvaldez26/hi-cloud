import { motion } from 'framer-motion';

export default function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 200, gap: 10,
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid rgba(22,119,255,.15)',
          borderTopColor: '#1677ff',
          flexShrink: 0,
        }}
      />
      <span style={{ color: '#9ca3af', fontSize: 13 }}>Cargando…</span>
    </div>
  );
}
