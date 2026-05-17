import { useState } from 'react';
import { Button, Tooltip, Modal } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

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
export function VideoTutorialButton({ url }: { url?: string }) {
  const handle = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Modal.info({
        title: 'Video Tutorial',
        content: (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
            <p style={{ color: '#6B7280', margin: 0 }}>
              El video tutorial de este módulo estará disponible próximamente.
            </p>
          </div>
        ),
        okText: 'Entendido',
        icon: null,
      });
    }
  };

  return (
    <Tooltip title="Video Tutorial">
      <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={handle} />
    </Tooltip>
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
  videoUrl,
  columnToggle,
  accionPrincipal,
  extra,
}: TableToolbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 16, gap: 12, flexWrap: 'wrap',
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
        <VideoTutorialButton url={videoUrl} />
        {accionPrincipal && <ToolbarSeparator />}
        {accionPrincipal}
      </div>
    </div>
  );
}
