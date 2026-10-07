import { useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';

interface Props {
  open: boolean;
  titulo?: string;
  onClose: () => void;
  onDetectado: (texto: string) => void;
}

/**
 * Escaneo de Code128/QR con la cámara — para tablet/celular sin escáner
 * físico (ver punto 6 del pedido de tarjetas de supervisor). Usa
 * `BarcodeDetector` nativo del navegador cuando existe (Chrome/Edge,
 * desktop y Android — más liviano, cero dependencias) y cae a
 * `@zxing/browser` (carga perezosa) en Safari/iOS/Firefox, que no lo
 * implementan.
 */
export function EscanerCamaraModal({ open, titulo, onClose, onDetectado }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setError('');

    const detener = () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    const detectadoUnaVez = (texto: string) => {
      if (cancelado) return;
      cancelado = true;
      detener();
      onDetectado(texto);
    };

    const iniciar = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (e: any) {
        if (!cancelado) {
          setError(
            e?.name === 'NotAllowedError'
              ? 'Permiso de cámara denegado — habilítalo en el navegador e intenta de nuevo.'
              : 'No se pudo acceder a la cámara de este dispositivo.',
          );
        }
        return;
      }
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch { /* algunos navegadores ya lo reproducen solos */ }

      const BarcodeDetectorNativo = (window as any).BarcodeDetector;
      if (BarcodeDetectorNativo) {
        const detector = new BarcodeDetectorNativo({ formats: ['code_128', 'qr_code'] });
        const tick = async () => {
          if (cancelado || !videoRef.current) return;
          try {
            const codigos = await detector.detect(videoRef.current);
            if (codigos?.[0]?.rawValue) { detectadoUnaVez(codigos[0].rawValue); return; }
          } catch { /* frame no decodificable todavía — seguir intentando */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Fallback sin BarcodeDetector nativo (Safari/iOS/Firefox).
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(stream, videoRef.current, (resultado) => {
          if (resultado) detectadoUnaVez(resultado.getText());
        });
        zxingControlsRef.current = controls;
      } catch {
        if (!cancelado) setError('Este navegador no puede leer códigos con la cámara.');
      }
    };

    void iniciar();
    return () => { cancelado = true; detener(); };
  }, [open, onDetectado]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={titulo ?? 'Escanear con la cámara'}
      width={360}
      destroyOnClose
    >
      {error ? (
        <div style={{ color: '#EF4444', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>{error}</div>
      ) : (
        <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block' }} />
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
        Apunta la cámara al código de barras o al QR de la tarjeta.
      </div>
    </Modal>
  );
}
