import { Modal } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

function fmtDuracion(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface VideoPlayerModalProps {
  open:             boolean;
  onClose:          () => void;
  titulo:           string;
  proveedor:        'youtube' | 'vimeo';
  videoId:          string;
  duracionSegundos?: number | null;
}

/**
 * Modal de player de video tutorial reutilizable.
 * Sin autoplay. Respeta prefers-reduced-motion mostrando un enlace externo.
 * Usado por VideoTutorialButton (TableToolbar) y por los módulos que no tienen
 * TableToolbar: POS, Dashboard, Configuración.
 */
export function VideoPlayerModal({
  open, onClose, titulo, proveedor, videoId, duracionSegundos,
}: VideoPlayerModalProps) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const srcUrl = proveedor === 'youtube'
    ? `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`
    : `https://player.vimeo.com/video/${videoId}?autoplay=0&dnt=1`;

  const externalUrl = proveedor === 'youtube'
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://vimeo.com/${videoId}`;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      width={780}
      styles={{ content: { padding: 0, overflow: 'hidden', borderRadius: 12 }, body: { padding: 0 } }}
      destroyOnClose
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <PlayCircleOutlined style={{ fontSize: 18, color: '#3B82F6' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', lineHeight: 1.3 }}>
            {titulo}
          </div>
          {duracionSegundos ? (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {fmtDuracion(duracionSegundos)} min
            </div>
          ) : null}
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none', flexShrink: 0 }}
        >
          Abrir en {proveedor === 'youtube' ? 'YouTube' : 'Vimeo'} ↗
        </a>
      </div>

      {/* Player */}
      {prefersReduced ? (
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🎬</div>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>
            Tienes activada la preferencia de movimiento reducido.
          </p>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3B82F6', fontWeight: 600, fontSize: 15 }}
          >
            Ver video en {proveedor === 'youtube' ? 'YouTube' : 'Vimeo'} →
          </a>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingTop: '56.25%' }}>
          <iframe
            src={srcUrl}
            title={titulo}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              border: 'none',
            }}
          />
        </div>
      )}
    </Modal>
  );
}
