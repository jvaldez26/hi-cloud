import { useState } from 'react';
import { Button, Tooltip, Modal } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useVideosTutoriales } from '../../hooks/useVideosTutoriales';

// ── Botón Actualizar tabla ────────────────────────────────────────────────────
// Acepta un callback onRefresh (puede ser refetch() de useQuery o invalidateQueries)
export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<any> | void }) {
  const [spinning, setSpinning] = useState(false);

  const handle = async () => {
    setSpinning(true);
    try { await onRefresh(); } finally { setSpinning(false); }
  };

  return (
    <Tooltip title="Actualizar tabla">
      <Button type="text" size="small" icon={<ReloadOutlined spin={spinning} />} onClick={handle} />
    </Tooltip>
  );
}

// Variante que invalida por queryKey (útil cuando no se tiene refetch accesible)
export function RefreshByKeyButton({ queryKey }: { queryKey: readonly unknown[] }) {
  const qc = useQueryClient();
  return (
    <RefreshButton onRefresh={() => qc.invalidateQueries({ queryKey: queryKey as any })} />
  );
}

// ── Player modal de video ─────────────────────────────────────────────────────

interface VideoPlayerModalProps {
  open:    boolean;
  onClose: () => void;
  titulo:  string;
  proveedor: 'youtube' | 'vimeo';
  videoId:   string;
  duracionSegundos?: number | null;
}

function fmtDuracion(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VideoPlayerModal({ open, onClose, titulo, proveedor, videoId, duracionSegundos }: VideoPlayerModalProps) {
  // Respetar prefers-reduced-motion: si el usuario prefiere sin movimiento,
  // mostramos un enlace en vez del iframe embebido
  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', lineHeight: 1.3 }}>{titulo}</div>
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
        /* Usuarios con prefers-reduced-motion: link en vez de iframe animado */
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
        <div style={{ position: 'relative', paddingTop: '56.25%' /* 16:9 */ }}>
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

// ── Botón Video Tutorial ──────────────────────────────────────────────────────
// Lee la ruta actual para determinar el módulo automáticamente.
// Si hay video configurado → abre player modal.
// Si no hay video → se oculta completamente (sin "próximamente").
export function VideoTutorialButton({ url: _legacyUrl }: { url?: string }) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: videos } = useVideosTutoriales();

  // Extraer clave del módulo desde el primer segmento de la ruta
  // Ej: /clientes → "clientes", /pos/caja → "pos"
  const modulo = pathname.split('/').filter(Boolean)[0] ?? '';
  const video  = modulo && videos ? videos[modulo] : null;

  // Sin video configurado y activo → botón completamente oculto
  if (!video) return null;

  return (
    <>
      <Tooltip title="Video Tutorial">
        <Button
          type="text"
          size="small"
          icon={<PlayCircleOutlined />}
          onClick={() => setPlayerOpen(true)}
        />
      </Tooltip>
      <VideoPlayerModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        titulo={video.titulo}
        proveedor={video.proveedor}
        videoId={video.videoId}
        duracionSegundos={video.duracionSegundos}
      />
    </>
  );
}

// ── Separador vertical ────────────────────────────────────────────────────────
export function ToolbarSeparator() {
  return (
    <div style={{
      width: 1, height: 20, background: 'rgba(0,0,0,0.12)',
      margin: '0 4px', flexShrink: 0,
    }} />
  );
}

// ── Componente completo TableToolbar ─────────────────────────────────────────
interface TableToolbarProps {
  titulo?: string;
  onRefresh: () => Promise<any> | void;
  onExport?: () => void;
  videoUrl?: string;
  columnToggle?: ReactNode;
  accionPrincipal?: ReactNode;
  extra?: ReactNode;
}

export function TableToolbar({
  titulo,
  onRefresh,
  onExport,
  columnToggle,
  accionPrincipal,
  extra,
}: TableToolbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 16, gap: 8, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {titulo && <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{titulo}</h4>}
        {extra}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto', flexShrink: 0 }}>
        {onExport && (
          <Tooltip title="Exportar a Excel">
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={onExport} />
          </Tooltip>
        )}
        {columnToggle}
        <RefreshButton onRefresh={onRefresh} />
        <VideoTutorialButton />
        {accionPrincipal && <ToolbarSeparator />}
        {accionPrincipal}
      </div>
    </div>
  );
}
