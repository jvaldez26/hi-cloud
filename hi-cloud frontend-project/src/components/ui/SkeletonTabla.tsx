import { Skeleton, theme } from 'antd';
import React, { useMemo } from 'react';

// ── Accesibilidad: sin animación de brillo si el sistema lo solicita ──────────
function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

// ── Distribución de columnas ──────────────────────────────────────────────────
// La columna "principal" (nombre, descripción) ocupa el doble.
// La última columna (acciones) ocupa la mitad.
// El resto tienen peso 1.
function getFlexWeights(cols: number): number[] {
  const w = Array.from({ length: cols }, () => 1);
  if (cols > 2) {
    w[Math.floor(cols / 3)] = 2;   // columna principal
    w[cols - 1]             = 0.5; // acciones
  }
  return w;
}

// Anchos de celda varían por fila+columna para simular contenido real
const FILL = ['82%', '68%', '91%', '58%', '76%', '88%', '62%', '79%', '95%', '55%'];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  /** Número de filas skeleton (excluye cabecera). Default 5. */
  rows?: number;
  /** Número de columnas. Debe coincidir con las columnas reales. Default 5. */
  cols?: number;
}

/**
 * Skeleton con la FORMA de una tabla real.
 *
 * Usar en lugar del spinner nativo de AntD Table cuando `isLoading`:
 * ```tsx
 * const showSkeleton = useSkeletonDelay(isLoading);
 * return showSkeleton
 *   ? <SkeletonTabla rows={6} cols={8} />
 *   : <Table loading={isLoading} dataSource={data} columns={columns} />;
 * ```
 *
 * Para tablas HTML del POS, reemplazar el `<Spin>` directamente:
 * ```tsx
 * {isLoading ? <SkeletonTabla rows={7} cols={9} /> : <table>...</table>}
 * ```
 *
 * Hereda el tema claro/oscuro de AntD. Respeta `prefers-reduced-motion`
 * (desactiva el shimmer pero conserva la forma del skeleton).
 */
export function SkeletonTabla({ rows = 5, cols = 5 }: Props) {
  const { token }  = theme.useToken();
  const active     = !usePrefersReducedMotion();
  const weights    = useMemo(() => getFlexWeights(cols), [cols]);
  const rowArr     = useMemo(() => Array.from({ length: rows }), [rows]);

  return (
    <div
      style={{
        width:        '100%',
        border:       `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        overflow:     'hidden',
      }}
    >
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display:      'flex',
          gap:          8,
          alignItems:   'center',
          padding:      '9px 12px',
          background:   token.colorFillAlter,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {weights.map((w, i) => (
          <div key={i} style={{ flex: w, minWidth: 0 }}>
            <Skeleton.Input
              active={active}
              size="small"
              style={{ width: '52%', minWidth: 28, height: 12, display: 'block' }}
            />
          </div>
        ))}
      </div>

      {/* ── Filas ────────────────────────────────────────────────────────── */}
      {rowArr.map((_, r) => (
        <div
          key={r}
          style={{
            display:      'flex',
            gap:          8,
            alignItems:   'center',
            padding:      '10px 12px',
            background:   r % 2 === 0 ? token.colorBgContainer : token.colorFillQuaternary,
            borderBottom: r < rows - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none',
          }}
        >
          {weights.map((w, i) => {
            const fillW = FILL[(r * cols + i) % FILL.length];
            return (
              <div key={i} style={{ flex: w, minWidth: 0 }}>
                <Skeleton.Input
                  active={active}
                  size="small"
                  style={{ width: fillW, minWidth: 22, height: 14, display: 'block' }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
