import type { ReactNode } from 'react';
import { Button, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Armazón común de las gráficas del panel.
 *
 * Repite exactamente el estilo que ya tenían Antigüedad y Resumen de Gastos
 * —cabecera con título y botón de recargar, cuerpo, pie con el total— para que
 * las diez nuevas no se noten pegadas. Sacarlo aquí evita además que cada una
 * reinvente el borde, el radio y el color del pie.
 */
export function TarjetaGrafica({
  titulo, subtitulo, onRefresh, vacio, mensajeVacio,
  pieEtiqueta, pieValor, pieColor, children,
}: {
  titulo:        string;
  subtitulo?:    string;
  onRefresh:     () => void;
  /** true cuando no hay datos que pintar. */
  vacio?:        boolean;
  mensajeVacio?: string;
  pieEtiqueta?:  string;
  pieValor?:     string;
  pieColor?:     string;
  children:      ReactNode;
}) {
  const { token } = theme.useToken();

  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
        flexShrink: 0,
        // Deja sitio a la papelera del MarcoWidget, que se posiciona encima.
        paddingRight: 56,
      }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</span>
          {subtitulo && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary, marginLeft: 8 }}>
              {subtitulo}
            </span>
          )}
        </div>
        <Button
          type="text" size="small" icon={<ReloadOutlined />} onClick={onRefresh}
          style={{ color: token.colorTextTertiary, flexShrink: 0 }}
          aria-label={`Actualizar ${titulo}`}
        />
      </div>

      {vacio ? (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          flex: 1,
        }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div style={{ fontSize: 13, color: token.colorTextTertiary, textAlign: 'center', padding: '0 16px' }}>
            {mensajeVacio ?? 'Sin datos para este período'}
          </div>
        </div>
      ) : (
        // El cuerpo crece con la celda: si la fila es alta porque otra grafica
        // lo es, esta la acompana en vez de dejar aire debajo.
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      )}

      {!vacio && pieEtiqueta && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillAlter, flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {pieEtiqueta}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: pieColor ?? token.colorText }}>
            {pieValor}
          </span>
        </div>
      )}
    </div>
  );
}

/** Paleta del panel. Misma que ya usaba el donut de gastos. */
export const COLORES = [
  '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#F97316', '#EC4899', '#06B6D4',
];

/** Ejes y rejilla con el mismo aspecto en todas las gráficas. */
export const ejeMonto = (v: number) => (v === 0 ? '0' : `${(v / 1000).toFixed(0)}K`);
