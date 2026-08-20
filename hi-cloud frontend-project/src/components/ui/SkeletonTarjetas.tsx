import { Skeleton, Row, Col, theme } from 'antd';
import React from 'react';

function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

interface Props {
  /** Número de tarjetas a mostrar. Default 4. */
  count?: number;
  /**
   * Tamaño de columna AntD en desktop (1-24).
   * Default 6 = 4 tarjetas en fila en pantalla ancha.
   * Usa 8 para 3 en fila, 12 para 2 en fila.
   */
  colSpan?: number;
}

/**
 * Skeleton con la FORMA de tarjetas de métricas (Dashboard).
 *
 * ```tsx
 * {isLoading ? <SkeletonTarjetas count={4} /> : <MetricCards data={stats} />}
 * ```
 *
 * Hereda el tema claro/oscuro de AntD.
 * Respeta `prefers-reduced-motion` (sin shimmer, mantiene la forma).
 */
export function SkeletonTarjetas({ count = 4, colSpan = 6 }: Props) {
  const { token } = theme.useToken();
  const active    = !usePrefersReducedMotion();

  return (
    <Row gutter={[16, 16]}>
      {Array.from({ length: count }, (_, i) => (
        <Col key={i} xs={24} sm={12} md={colSpan}>
          <div
            style={{
              padding:      '16px 20px',
              background:   token.colorBgContainer,
              border:       `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {/* Ícono placeholder — cuadrado redondeado */}
              <Skeleton.Avatar
                active={active}
                size={48}
                shape="square"
                style={{ borderRadius: token.borderRadius, flexShrink: 0 }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Valor principal (número grande) */}
                <Skeleton.Input
                  active={active}
                  style={{ width: '70%', height: 26, marginBottom: 8, display: 'block' }}
                />
                {/* Etiqueta descriptiva */}
                <Skeleton.Input
                  active={active}
                  size="small"
                  style={{ width: '85%', height: 13, display: 'block' }}
                />
              </div>
            </div>

            {/* Línea de tendencia / comparación — opcional en tarjetas reales */}
            <div style={{ marginTop: 12 }}>
              <Skeleton.Input
                active={active}
                size="small"
                style={{ width: '45%', height: 11, display: 'block' }}
              />
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}
