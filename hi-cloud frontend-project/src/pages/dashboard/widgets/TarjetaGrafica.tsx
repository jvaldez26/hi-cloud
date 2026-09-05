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
  titulo, subtitulo, onRefresh, cargando, error, vacio, mensajeVacio, alto = 260,
  pieEtiqueta, pieValor, pieColor, children,
}: {
  titulo:        string;
  subtitulo?:    string;
  onRefresh:     () => void;
  /**
   * true mientras la consulta está en vuelo.
   *
   * ── Por qué esto no es un detalle ────────────────────────────────────────
   * Sin este estado, `data` llega `undefined`, las filas quedan en `[]` y la
   * tarjeta cae en `vacio` — así que mientras carga afirmaba «Sin ventas en los
   * últimos 12 meses». Con la red lenta, el dueño abría el panel y leía que no
   * había vendido nada en un año.
   *
   * Una ausencia de datos no es un dato. Cargando, fallando y vacío son tres
   * cosas distintas y tienen que verse distintas.
   */
  cargando?:     boolean;
  /** true si la consulta falló. Antes también se mostraba como «sin datos». */
  error?:        boolean;
  /** true cuando la consulta respondió y no hay nada que pintar. */
  vacio?:        boolean;
  mensajeVacio?: string;
  alto?:         number;
  pieEtiqueta?:  string;
  pieValor?:     string;
  pieColor?:     string;
  children:      ReactNode;
}) {
  const { token } = theme.useToken();

  const estado = estadoDe({ cargando, error, vacio });

  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
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

      <EstadoGrafica
        estado={estado} alto={alto} titulo={titulo}
        mensajeVacio={mensajeVacio} onRefresh={onRefresh}
      />

      {estado === 'ok' && children}

      {estado === 'ok' && pieEtiqueta && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillAlter,
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

export type EstadoWidget = 'cargando' | 'error' | 'vacio' | 'ok';

/**
 * Resuelve el estado de una gráfica a partir de la consulta.
 *
 * Existe para que ningún widget tenga que volver a decidirlo: la regla es
 * siempre la misma y equivocarse es exactamente el bug que había —tratar
 * «todavía no ha llegado» y «falló» como «no hay nada».
 */
export function estadoDe(
  { cargando, error, vacio }: { cargando?: boolean; error?: boolean; vacio?: boolean },
): EstadoWidget {
  // Cargando gana sobre error, y error sobre vacío. Un refetch tras un fallo
  // enseña el esqueleto en vez de dejar el error puesto; y un fallo nunca
  // degrada a «no hay datos», que es la mentira original.
  return cargando ? 'cargando' : error ? 'error' : vacio ? 'vacio' : 'ok';
}

/**
 * Los tres estados que no son la gráfica: cargando, error y vacío.
 *
 * Se exporta suelto porque tres widgets —Antigüedad, Ingresos & Gastos y
 * Resumen de Gastos— tienen su propio armazón y no pasan por TarjetaGrafica.
 * Sin esto habría que triplicar el esqueleto, que es como la paleta acabó
 * escrita a mano en la mitad de los archivos.
 */
export function EstadoGrafica({
  estado, alto = 260, titulo, mensajeVacio, onRefresh,
}: {
  estado:        EstadoWidget;
  alto?:         number;
  titulo:        string;
  mensajeVacio?: string;
  onRefresh:     () => void;
}) {
  const { token } = theme.useToken();
  if (estado === 'ok') return null;

  if (estado === 'cargando') {
    return (
      <div
        style={{ height: alto, padding: '18px 16px' }}
        role="status" aria-live="polite" aria-label={`Cargando ${titulo}`}
      >
        {/* Esqueleto con forma de gráfica —barras desiguales sobre una línea
            base— y no un spinner: ocupa el mismo sitio que ocupará el
            contenido, así la tarjeta no salta cuando llegan los datos. */}
        <div style={{
          height: '100%', display: 'flex', alignItems: 'flex-end',
          gap: '4%', borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}>
          {[38, 62, 45, 78, 55, 88, 48, 70].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0',
              background: token.colorFillSecondary,
              animation: 'hcPulso 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.09}s`,
            }} />
          ))}
        </div>
        <style>{`@keyframes hcPulso{0%,100%{opacity:.45}50%{opacity:.9}}`}</style>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div
        style={{
          height: alto, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 16px',
        }}
        role="alert"
      >
        <div style={{ fontSize: 30 }} aria-hidden="true">⚠️</div>
        <div style={{ fontSize: 13, color: token.colorText, textAlign: 'center' }}>
          No se pudieron cargar los datos
        </div>
        {/* Decirlo sin ofrecer salida deja al usuario recargando la página
            entera. El reintento es de esta tarjeta, no del panel. */}
        <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div style={{
      height: alto, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <div style={{ fontSize: 32 }} aria-hidden="true">📊</div>
      <div style={{ fontSize: 13, color: token.colorTextTertiary, textAlign: 'center', padding: '0 16px' }}>
        {mensajeVacio ?? 'Sin datos para este período'}
      </div>
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
