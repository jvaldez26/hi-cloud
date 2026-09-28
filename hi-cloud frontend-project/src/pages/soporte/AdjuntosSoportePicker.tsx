import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { MAX_ADJUNTOS_POR_TICKET } from '../../api/soporte.api';
import type { PreviewAdjunto } from './useAdjuntosSoporte';

interface Props {
  previews:   PreviewAdjunto[];
  onAgregar:  (archivos: File[]) => void;
  onQuitar:   (idx: number) => void;
  procesando: boolean;
}

/** Zona de arrastrar + selector de archivo. El pegado (Ctrl+V) se conecta a nivel del formulario, ver useAdjuntosSoporte. */
export function AdjuntosSoportePicker({ previews, onAgregar, onQuitar, procesando }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const lleno = previews.length >= MAX_ADJUNTOS_POR_TICKET;

  return (
    <div>
      <div
        onClick={() => !lleno && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!lleno) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => {
          e.preventDefault();
          setArrastrando(false);
          if (!lleno) onAgregar(Array.from(e.dataTransfer.files));
        }}
        style={{
          border:     `1.5px dashed ${arrastrando ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: 8,
          padding:    '14px 12px',
          textAlign:  'center',
          cursor:     lleno ? 'default' : 'pointer',
          background: arrastrando ? '#EFF6FF' : '#FAFAFA',
          opacity:    lleno ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          hidden
          disabled={lleno}
          onChange={e => { onAgregar(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <Upload size={18} style={{ color: '#9CA3AF' }} />
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
          {lleno
            ? `Máximo ${MAX_ADJUNTOS_POR_TICKET} imágenes alcanzado`
            : <>Arrastra imágenes, pégalas (Ctrl+V) o <span style={{ color: '#2563EB' }}>haz clic para elegir</span></>}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
          PNG, JPG o WEBP — máximo {MAX_ADJUNTOS_POR_TICKET} imágenes, 5 MB cada una
        </div>
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {previews.map((p, i) => (
            <div key={p.url} style={{ position: 'relative', width: 64, height: 64 }}>
              <img
                src={p.url}
                alt={p.file.name}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #E5E7EB' }}
              />
              <button
                type="button"
                onClick={() => onQuitar(i)}
                title="Quitar"
                style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                  background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {procesando && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Procesando imágenes…</div>}
    </div>
  );
}
