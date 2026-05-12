import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Progress, Space } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

const PASOS = [
  {
    titulo:    '¡Bienvenido a HiCloud ERP! 🎉',
    descripcion: 'Estás a pocos pasos de tener tu empresa completamente digitalizada. Te mostraremos lo más importante en 60 segundos.',
    emoji:     '🚀',
    accion:    null,
    color:     '#1a56db',
  },
  {
    titulo:    'Configuración de la empresa',
    descripcion: 'Primero, completa los datos fiscales de tu empresa: RNC, razón social, dirección y logo. Estos datos aparecerán en tus facturas.',
    emoji:     '🏢',
    accion:    { label: 'Ir a Configuración', ruta: '/configuracion' },
    color:     '#7c3aed',
  },
  {
    titulo:    'Agrega tus clientes',
    descripcion: 'Registra tus clientes con su RNC (para e-CF E31) o sin RNC (e-CF E32 Consumidor Final). Puedes importarlos masivamente desde Excel.',
    emoji:     '👥',
    accion:    { label: 'Gestionar Clientes', ruta: '/clientes' },
    color:     '#059669',
  },
  {
    titulo:    'Carga tu catálogo de productos',
    descripcion: 'Agrega tus productos con código SAT, precio e ITBIS. También puedes importar desde un archivo CSV directamente.',
    emoji:     '🛍️',
    accion:    { label: 'Agregar Productos', ruta: '/productos' },
    color:     '#d97706',
  },
  {
    titulo:    'Tu primera factura electrónica',
    descripcion: 'Con clientes y productos registrados, crea tu primera Cotización o Factura. El sistema genera el e-CF automáticamente.',
    emoji:     '🧾',
    accion:    { label: 'Nueva Factura', ruta: '/facturas/nueva' },
    color:     '#1a56db',
  },
  {
    titulo:    '¡Listo para facturar! ✅',
    descripcion: 'Tu empresa está configurada. Recuerda que puedes acceder a todos los módulos desde el menú lateral. ¡Éxito con tu negocio!',
    emoji:     '🎊',
    accion:    { label: 'Ir al Dashboard', ruta: '/dashboard' },
    color:     '#10b981',
  },
];

const TOUR_KEY = 'hicloud_tour_completed';

export default function OnboardingTour() {
  const [open,  setOpen]  = useState(false);
  const [paso,  setPaso]  = useState(0);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY);
    if (!done && user) {
      setTimeout(() => setOpen(true), 800);
    }
  }, [user]);

  const completar = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setOpen(false);
  };

  const pasoActual = PASOS[paso];

  return (
    <Modal
      open={open}
      closable={false}
      footer={null}
      width={480}
      centered
      styles={{ body: { padding: 0 }, mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,.5)' } }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={paso}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22 }}
          style={{ padding: 28 }}
        >
          {/* Ícono */}
          <motion.div
            initial={{ scale: 0.5 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: .1 }}
            style={{
              width: 72, height: 72, borderRadius: 20,
              background: `${pasoActual.color}18`,
              border: `2px solid ${pasoActual.color}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, margin: '0 auto 20px',
            }}
          >
            {pasoActual.emoji}
          </motion.div>

          <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
            {pasoActual.titulo}
          </Title>

          <Text style={{ display: 'block', textAlign: 'center', color: '#6b7280',
                          lineHeight: 1.7, marginBottom: 24 }}>
            {pasoActual.descripcion}
          </Text>

          {/* Progress */}
          <Progress
            percent={Math.round(((paso + 1) / PASOS.length) * 100)}
            strokeColor={pasoActual.color}
            style={{ marginBottom: 20 }}
            format={() => `${paso + 1} / ${PASOS.length}`}
          />

          {/* Botones */}
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button type="text" onClick={completar} style={{ color: '#9ca3af' }}>
              Saltar tour
            </Button>

            <Space>
              {paso > 0 && (
                <Button onClick={() => setPaso(p => p - 1)}>← Atrás</Button>
              )}

              {pasoActual.accion && (
                <Button
                  onClick={() => { navigate(pasoActual.accion!.ruta); completar(); }}
                  style={{ background: `${pasoActual.color}18`,
                            border: `1px solid ${pasoActual.color}44`,
                            color: pasoActual.color }}>
                  {pasoActual.accion.label}
                </Button>
              )}

              {paso < PASOS.length - 1 ? (
                <Button type="primary" onClick={() => setPaso(p => p + 1)}
                  style={{ background: pasoActual.color, border: 'none' }}>
                  Siguiente →
                </Button>
              ) : (
                <Button type="primary" onClick={completar}
                  style={{ background: pasoActual.color, border: 'none' }}>
                  ¡Empezar ahora! 🚀
                </Button>
              )}
            </Space>
          </Space>
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
