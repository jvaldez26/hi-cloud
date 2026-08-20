import { useState, useEffect } from 'react';
import { Modal, Checkbox, Button } from 'antd';
import { MonitorSmartphone } from 'lucide-react';

// ─── Claves de almacenamiento ────────────────────────────────────────────────
// LS_KEY  → permanente: "no mostrar nunca más" (checked por el usuario)
// SS_KEY  → solo esta pestaña/sesión: evita que aparezca en cada refresh
const LS_KEY = 'hicloud-mobile-no-mostrar';
const SS_KEY = 'hicloud-mobile-ya-mostrado';

// ─── Detección de móvil ───────────────────────────────────────────────────────
function esMobil(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const uaEsMovil = /iphone|android|blackberry|windows phone|opera mini|iemobile|mobile/.test(ua);
  // También detectar por ancho de pantalla (tablet/phablet angosto)
  const anchoEsMovil = window.innerWidth < 768;
  return uaEsMovil || anchoEsMovil;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function MobileWarningModal() {
  const [visible, setVisible]    = useState(false);
  const [noMostrar, setNoMostrar] = useState(false);

  useEffect(() => {
    // Solo mostrar en móvil
    if (!esMobil()) return;
    // El usuario eligió "no volver a mostrar" (permanente)
    if (localStorage.getItem(LS_KEY) === 'true') return;
    // Ya se mostró en esta sesión/pestaña (evita aparecer en cada refresh)
    if (sessionStorage.getItem(SS_KEY) === 'true') return;
    // Marcar como ya mostrado para esta sesión ANTES de mostrarlo
    sessionStorage.setItem(SS_KEY, 'true');
    // Pequeño delay para no solapar con la animación de carga del layout
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  const handleOk = () => {
    if (noMostrar) {
      localStorage.setItem(LS_KEY, 'true');
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal
      open={visible}
      footer={null}
      closable={true}
      onCancel={handleOk}
      centered
      width={340}
      style={{ top: 0 }}
      styles={{
        content: {
          borderRadius: 20,
          padding: '32px 24px 24px',
          textAlign: 'center',
          height: 'fit-content',
        },
        wrapper: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(2px)' },
      }}
    >
      {/* Ícono */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 72, height: 72, borderRadius: 18,
        background: 'linear-gradient(135deg, #e6f7f4 0%, #b7ece4 100%)',
        marginBottom: 20,
      }}>
        <MonitorSmartphone size={36} color="#13c2a8" strokeWidth={1.5} />
      </div>

      {/* Título */}
      <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.35, marginBottom: 12, color: 'var(--ant-color-text)' }}>
        ¡Obtén el máximo potencial<br />de HiCloud desde tu computadora!
      </div>

      {/* Subtítulo */}
      <div style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)', marginBottom: 24, lineHeight: 1.55 }}>
        Visualiza tus facturas, inventarios y reportes de forma más cómoda y ágil.
      </div>

      {/* Checkbox */}
      <div style={{ marginBottom: 20, textAlign: 'left' }}>
        <Checkbox
          checked={noMostrar}
          onChange={e => setNoMostrar(e.target.checked)}
        >
          <span style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)' }}>
            No volver a mostrar este mensaje
          </span>
        </Checkbox>
      </div>

      {/* Botón */}
      <Button
        type="primary"
        block
        size="large"
        onClick={handleOk}
        style={{
          borderRadius: 10, fontWeight: 600, fontSize: 15,
          background: '#13c2a8', borderColor: '#13c2a8',
          height: 48,
        }}
      >
        ¡Entendido!
      </Button>
    </Modal>
  );
}
