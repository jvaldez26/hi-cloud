import { useState, useEffect } from 'react';
import { Button } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import { useMobile } from '../../hooks/useMediaQuery';

const STORAGE_KEY = 'hicloud-pwa-banner-dismissed';

export default function PwaInstallBanner() {
  const isMobile = useMobile();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Escuchar el evento beforeinstallprompt del navegador
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, [isMobile]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position:       'fixed',
        bottom:         'calc(64px + env(safe-area-inset-bottom, 0px))',
        left:           12,
        right:          12,
        background:     '#1E3A8A',
        color:          '#fff',
        borderRadius:   12,
        padding:        '12px 14px',
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        zIndex:         200,
        boxShadow:      '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      <img src="/icons/icon-48.png" alt="HiCloud" style={{ width: 36, height: 36, borderRadius: 8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Instalar HiCloud ERP</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>Acceso rápido desde tu pantalla de inicio</div>
      </div>
      <Button
        type="primary"
        size="small"
        icon={<DownloadOutlined />}
        onClick={handleInstall}
        style={{ background: '#fff', color: '#1E3A8A', border: 'none', fontWeight: 600, flexShrink: 0 }}
      >
        Instalar
      </Button>
      <button
        onClick={dismiss}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', padding: 4, flexShrink: 0 }}
      >
        <CloseOutlined />
      </button>
    </div>
  );
}
