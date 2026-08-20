import { Skeleton, theme } from 'antd';
import React from 'react';

function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

interface Props {
  /**
   * Número de tarjetas skeleton a mostrar.
   * Debe coincidir con los productos visibles en vista defecto (default 12).
   */
  count?: number;
}

/**
 * Skeleton que replica la REJILLA DE PRODUCTOS del POS.
 *
 * Usa exactamente el mismo grid que ProductCard:
 * `repeat(auto-fill, minmax(140px, 1fr))` — las tarjetas ocupan el mismo
 * espacio que los productos reales para que NO haya salto de layout al cargar.
 *
 * ```tsx
 * const showSkeleton = useSkeletonDelay(isLoading, 200);
 * return showSkeleton
 *   ? <SkeletonProductos count={12} />
 *   : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
 *       {lista.map(p => <ProductCard ... />)}
 *     </div>;
 * ```
 *
 * Hereda el tema claro/oscuro de AntD.
 * Respeta `prefers-reduced-motion` (sin shimmer, mantiene la forma).
 */
export function SkeletonProductos({ count = 12 }: Props) {
  const { token } = theme.useToken();
  const active    = !usePrefersReducedMotion();

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap:                 10,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height:        148,          // mismo que ProductCard
            borderRadius:  14,           // mismo que ProductCard
            background:    token.colorBgContainer,
            border:        `1px solid ${token.colorBorderSecondary}`,
            overflow:      'hidden',
            display:       'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Área del ícono — flex:1, centrada — ─────────────────── */}
          <div
            style={{
              flex:            1,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              padding:         '8px 6px 4px',
            }}
          >
            <Skeleton.Avatar
              active={active}
              size={64}
              shape="square"
              style={{ borderRadius: 8 }}
            />
          </div>

          {/* ── Info inferior — padding 0 8px 7px — ─────────────────── */}
          <div style={{ padding: '0 8px 8px', flexShrink: 0 }}>
            {/* Nombre — 11px, truncado */}
            <Skeleton.Input
              active={active}
              size="small"
              style={{ width: '88%', height: 11, marginBottom: 3, display: 'block' }}
            />
            {/* SKU — 9px, estrecho */}
            <Skeleton.Input
              active={active}
              size="small"
              style={{ width: '52%', height: 9, marginBottom: 6, display: 'block' }}
            />
            {/* Precio + botón + */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <Skeleton.Input
                  active={active}
                  size="small"
                  style={{ width: 60, height: 13, marginBottom: 2, display: 'block' }}
                />
                <Skeleton.Input
                  active={active}
                  size="small"
                  style={{ width: 44, height: 9, display: 'block' }}
                />
              </div>
              {/* Botón circular "+" */}
              <Skeleton.Avatar active={active} size={24} shape="circle" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
