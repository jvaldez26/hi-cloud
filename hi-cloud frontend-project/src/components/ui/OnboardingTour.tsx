import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Progress, Space } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';

const { Title, Text } = Typography;

const PASOS = [
  {
    titulo:      '¡Bienvenido a HiCloud ERP! 🎉',
    descripcion: 'Estás a pocos pasos de tener tu empresa completamente digitalizada. Te mostraremos lo más importante en 60 segundos.',
    emoji:       '🚀',
    accion:      null,
    color:       '#1a56db',
  },
  {
    titulo:      'Configuración de la empresa',
    descripcion: 'Primero, completa los datos fiscales de tu empresa: RNC, razón social, dirección y logo. Estos datos aparecerán en tus facturas.',
    emoji:       '🏢',
    accion:      { label: 'Ir a Configuración', ruta: '/configuracion' },
    color:       '#7c3aed',
  },
  {
    titulo:      'Agrega tus clientes',
    descripcion: 'Registra tus clientes con su RNC (para e-CF E31) o sin RNC (e-CF E32 Consumidor Final). Puedes importarlos masivamente desde Excel.',
    emoji:       '👥',
    accion:      { label: 'Gestionar Clientes', ruta: '/clientes' },
    color:       '#059669',
  },
  {
    titulo:      'Carga tu catálogo de productos',
    descripcion: 'Agrega tus productos con código SAT, precio e ITBIS. También puedes importar desde un archivo CSV directamente.',
    emoji:       '🛍️',
    accion:      { label: 'Agregar Productos', ruta: '/productos' },
    color:       '#d97706',
  },
  {
    titulo:      'Tu primera factura electrónica',
    descripcion: 'Con clientes y productos registrados, crea tu primera Cotización o Factura. El sistema genera el e-CF automáticamente.',
    emoji:       '🧾',
    accion:      { label: 'Nueva Factura', ruta: '/facturas/nueva' },
    color:       '#1a56db',
  },
  {
    titulo:      '¡Listo para facturar! ✅',
    descripcion: 'Tu empresa está configurada. Recuerda que puedes acceder a todos los módulos desde el menú lateral. ¡Éxito con tu negocio!',
    emoji:       '🎊',
    accion:      { label: 'Ir al Dashboard', ruta: '/dashboard' },
    color:       '#10b981',
  },
];

export default function OnboardingTour() {
  const [open,  setOpen]  = useState(false);
  const [paso,  setPaso]  = useState(0);
  const { user, login } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const lsKey = `hicloud_tour_v2_${user.id}`;

    // 1. BD dice que ya completó → sincronizar localStorage y no mostrar
    if (user.tourCompletado) {
      localStorage.setItem(lsKey, '1');
      return;
    }

    // 2. localStorage dice que ya completó, pero BD no está actualizada
    //    → intentar sincronizar BD silenciosamente y no mostrar
    if (localStorage.getItem(lsKey)) {
      api.patch('/auth/tour-completado').catch(() => {});
      return;
    }

    // 3. Ni BD ni localStorage → primer login real, mostrar tour
    setTimeout(() => setOpen(true), 800);
  }, [user?.id, user?.tourCompletado]); // solo re-ejecutar si cambia el usuario o su estado

  const completar = async () => {
    setOpen(false);
    if (!user) return;

    // Guardar en localStorage inmediatamente (no vuelve a aparecer en esta sesión)
    localStorage.setItem(`hicloud_tour_v2_${user.id}`, '1');

    // Persiste en BD (cross-device, permanente)
    try {
      await api.patch('/auth/tour-completado');
      // Actualizar el store para que user.tourCompletado === true
      const st = useAuthStore.getState();
      login(
        st.token ?? '',
        { ...user, tourCompletado: true },
        st.empresaActual,
        st.empresas,
      );
    } catch {
      // Si falla la BD, el localStorage ya evita que reaparezca en esta sesión
    }
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
          style={{ padding: 28, overflow: 'hidden' }}
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
                          lineHeight: 1.7, marginBottom: 24,
                          wordBreak: 'break-word', overflowWrap: 'break-word',
                          maxWidth: '100%' }}>
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
