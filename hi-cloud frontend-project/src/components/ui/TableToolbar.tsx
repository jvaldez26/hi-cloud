import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useVideosTutoriales } from '../../hooks/useVideosTutoriales';
import { VideoPlayerModal } from './VideoPlayerModal';

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
