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

/**
 * ── Colores del panel ───────────────────────────────────────────────────────
 *
 * Hay DOS cosas distintas aquí y antes estaban mezcladas, con el resultado de
 * que `#10B981` hacía las dos según el archivo:
 *
 *   SEMANTICO — el color ES el significado. Ingreso es verde porque es ingreso.
 *               Cambiarlo cambia lo que dice la gráfica. No se asigna por
 *               posición y no se reordena nunca.
 *
 *   CATEGORICO — el color solo separa una serie de la siguiente. Qué cliente
 *                sale azul y cuál verde no significa nada; se asigna por índice.
 *
 * Mezclarlas es como se llega a que el verde signifique «ingreso» en una tarjeta
 * y «el tercer proveedor» en la de al lado.
 *
 * Antes de esto había 13 hexadecimales sueltos repartidos por los widgets y una
 * constante COLORES que solo la mitad importaba. Si añades una gráfica, coge de
 * aquí; no escribas un hex en el archivo del widget.
 */
export const SEMANTICO = {
  /** Dinero que entra: ventas, cobros, ingresos. */
  ingreso: '#10B981',
  /** Dinero que sale: gastos, compras, cuentas por pagar. */
  gasto:   '#EF4444',
  /** Atención sin ser un problema todavía: por vencer, pendiente. */
  alerta:  '#F59E0B',
  /** Neutro: totales, referencias, series de apoyo. */
  neutro:  '#0EA5E9',
} as const;

/**
 * Rampa categórica — para series donde el color solo distingue, no significa.
 *
 * El orden importa por contraste entre vecinos, no por jerarquía: los dos
 * primeros son los que más se diferencian entre sí, porque la mayoría de las
 * gráficas del panel enseñan dos o tres categorías.
 */
export const COLORES = [
  '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#F97316', '#EC4899', '#06B6D4',
];
/**
 * Rampa de severidad — para tramos ORDENADOS que van de bien a mal.
 *
 * Es un tercer tipo y no encaja en los otros dos: no es semántico (ningún tramo
 * tiene un significado fijo por sí solo) ni categórico (el orden sí importa;
 * barajarlos rompe la lectura). La usa la antigüedad de saldos, donde el salto
 * de verde a rojo ES la información.
 *
 * Va de índice 0 = corriente a 4 = el tramo más vencido.
 */
export const RAMPA_SEVERIDAD = [
  '#10B981', '#0EA5E9', '#F59E0B', '#F97316', '#EF4444',
];


/**
 * Gris de «esto no es una categoría».
 *
 * Para el cajón de sastre —«Otras», «Pendiente», lo desconocido—. Va aparte de
 * la rampa categórica a propósito: si entrara en ella, el resto acabaría del
 * color de un cliente cualquiera y parecería una categoría más.
 */
export const GRIS_RESTO = '#94A3B8';

// ejeMonto vive en formatoEje.ts —módulo puro, sin React— para que
// verificar-ejes.mjs pueda transpilarlo y ejecutarlo. Se reexporta aquí para no
// cambiarle el import a los seis widgets que ya lo usaban.
export { ejeMonto } from './formatoEje';
