import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

/**
 * Transición de entrada sin AnimatePresence.
 * AnimatePresence sin mode="wait" mantiene AMBAS páginas en el DOM
 * simultáneamente, duplicando la altura y causando saltos de scroll.
 * Con solo motion.div + key, React desmonta la página vieja y monta
 * la nueva inmediatamente — sin doble montaje, sin salto de scroll.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      style={{ width: '100%', minWidth: 0 }}
    >
      {children}
    </motion.div>
  );
}
