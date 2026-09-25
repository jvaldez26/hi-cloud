import type { CSSProperties, ReactNode } from 'react';
import { Button, Tooltip, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useMobile } from '../../../hooks/useMediaQuery';

/**
 * Armazón común de las gráficas del panel.
 *
 * Repite exactamente el estilo que ya tenían Antigüedad y Resumen de Gastos
 * —cabecera con título y botón de recargar, cuerpo, pie con el total— para que
 * las diez nuevas no se noten pegadas. Sacarlo aquí evita además que cada una
 * reinvente el borde, el radio y el color del pie.
 */
export function TarjetaGrafica({
  titulo, subtitulo, onRefresh, cargando, error, vacio, mensajeVacio, accionVacio, alto = 260,
  pieEtiqueta, pieValor, pieColor, alClic, ejemplo, children,
}: {
  titulo:        string;
  subtitulo?:    string;
  onRefresh:     () => void;
  /**
   * Tarjeta completa como clic → listado relacionado. Solo activo con
   * estado 'ok' (con cargando/error/vacío no hay a dónde ir todavía — el
   * botón de recargar sigue funcionando aparte, con stopPropagation).
   * Se ignora en modo ejemplo — no hay listado real a donde ir.
   */
  alClic?:       () => void;
  /**
   * Modo ejemplo (empresa nueva sin movimientos, ver useModoEjemplo): el
   * caller pasa datos ficticios como si fueran reales (estado sigue siendo
   * 'ok', nunca 'vacio') y esta tarjeta se encarga de que no se puedan
   * confundir con datos reales — marca de agua sobre la gráfica, badge en
   * la cabecera, recargar deshabilitado y sin clic-a-listado (no tiene
   * sentido "actualizar" o "filtrar" algo que no existe).
   */
  ejemplo?:      boolean;
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
  accionVacio?:  { texto: string; onClick: () => void };
  alto?:         number;
  pieEtiqueta?:  string;
  pieValor?:     string;
  pieColor?:     string;
  children:      ReactNode;
}) {
  const { token } = theme.useToken();

  const estado = estadoDe({ cargando, error, vacio });
  const clickeable = estado === 'ok' && !!alClic && !ejemplo;

  return (
    <div
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 12, overflow: 'hidden',
        cursor: clickeable ? 'pointer' : 'default',
      }}
      onClick={clickeable ? alClic : undefined}
      role={clickeable ? 'button' : undefined}
      aria-label={clickeable ? `Ver listado de ${titulo}` : undefined}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
        // Deja sitio a la papelera del MarcoWidget, que se posiciona encima.
        paddingRight: 56,
      }}>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{titulo}</span>
          {subtitulo && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
              {subtitulo}
            </span>
          )}
          {/* Solo con estado 'ok': si el caller pasara ejemplo=true junto a
              vacio=true por error, más vale un vacío normal (sin badge) que
              un badge de "datos de ejemplo" flotando sobre un vacío real. */}
          {ejemplo && estado === 'ok' && <BadgeEjemplo />}
        </div>
        <Tooltip title={ejemplo ? 'Datos de ejemplo — se activa solo cuando haya movimientos reales' : undefined}>
          <Button
            type="text" size="small" icon={<ReloadOutlined />}
            disabled={ejemplo}
            onClick={e => { e.stopPropagation(); onRefresh(); }}
            style={{ color: token.colorTextTertiary, flexShrink: 0 }}
            aria-label={`Actualizar ${titulo}`}
          />
        </Tooltip>
      </div>

      <EstadoGrafica
        estado={estado} alto={alto} titulo={titulo}
        mensajeVacio={mensajeVacio} accionVacio={accionVacio} onRefresh={onRefresh}
      />

      {estado === 'ok' && (
        <div style={{ position: 'relative' }}>
          {children}
          {ejemplo && <MarcaAguaEjemplo />}
        </div>
      )}

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

      {clickeable && (
        <div style={{ padding: '4px 16px 10px', textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
            Ver listado completo →
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Badge inline (no absoluto): la esquina superior derecha ya la ocupan el
 * botón de recargar y, encima de ambos, la papelera de MarcoWidget — un
 * badge posicionado ahí competiría con los dos. Va junto al título, en el
 * flujo normal, donde no colisiona con nada y sigue leyéndose como "esto
 * está arriba de la tarjeta", que es lo que pedía la esquina.
 */
export function BadgeEjemplo() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: '#F59E0B', color: '#fff', fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 999, letterSpacing: '0.03em',
      textTransform: 'uppercase', flexShrink: 0, lineHeight: 1.6,
    }}>
      Datos de ejemplo
    </span>
  );
}

/**
 * Marca de agua diagonal repetida sobre el cuerpo de la gráfica — a
 * propósito mucho más marcada que un watermark decorativo: el pedido fue
 * explícito en que tiene que ser imposible confundir con datos reales
 * incluso en una mirada rápida. pointerEvents:none para no bloquear el
 * tooltip/interacción de la gráfica que tiene debajo.
 */
export function MarcaAguaEjemplo() {
  const filas = 4;
  const cols  = 3;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, rowGap: 28, columnGap: 36,
        transform: 'rotate(-26deg) scale(1.5)', width: '170%',
      }}>
        {Array.from({ length: filas * cols }).map((_, i) => (
          <span key={i} style={{
            fontSize: 22, fontWeight: 800, color: 'rgba(100,100,100,0.30)',
            whiteSpace: 'nowrap', textAlign: 'center', letterSpacing: '0.08em',
            textTransform: 'uppercase', userSelect: 'none',
          }}>
            Ejemplo
          </span>
        ))}
      </div>
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
  estado, alto = 260, titulo, mensajeVacio, onRefresh, accionVacio,
}: {
  estado:        EstadoWidget;
  alto?:         number;
  titulo:        string;
  mensajeVacio?: string;
  onRefresh:     () => void;
  /**
   * Estado vacío accionable: un link corto a la acción que resuelve el
   * "sin datos" ("Registrar una venta a crédito", "Registrar un gasto"...).
   * Sin esto la tarjeta vacía es un callejón sin salida — informa que no hay
   * nada, pero no dice qué hacer al respecto.
   */
  accionVacio?:  { texto: string; onClick: () => void };
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
      {accionVacio && (
        <Button
          type="link" size="small"
          onClick={e => { e.stopPropagation(); accionVacio.onClick(); }}
          style={{ padding: 0, height: 'auto', fontSize: 12 }}
        >
          {accionVacio.texto} →
        </Button>
      )}
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

/**
 * Estilo del tooltip de Recharts, en un solo sitio.
 *
 * Estaba copiado en las 12 gráficas: cinco líneas idénticas por archivo,
 * esperando a que alguien cambiara una sola y el panel quedara descuadrado. Es
 * la misma deriva que tuvo la paleta.
 *
 * Se pasa como `contentStyle={estiloTooltip(token)}` y no como componente para
 * no envolver <Tooltip> de Recharts: cada gráfica sigue poniendo su propio
 * `formatter`, que es lo único que de verdad cambia entre ellas.
 */
export function estiloTooltip(token: {
  colorBgElevated: string; colorBorderSecondary: string;
}): CSSProperties {
  return {
    background:   token.colorBgElevated,
    border:       `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 8,
    fontSize:     12,
  };
}

/**
 * Alto de la gráfica según el ancho de pantalla.
 *
 * Estaba fijo en 260 en las nueve tarjetas. En un móvil de 375px eso deja una
 * gráfica casi cuadrada que se come la pantalla: con dos o tres widgets en el
 * panel hay que hacer scroll para ver el siguiente título, y el panel se navega
 * peor justo donde menos sitio hay.
 *
 * El mismo valor se le pasa a TarjetaGrafica como `alto` para que el esqueleto
 * de carga y el estado vacío midan lo mismo que la gráfica: si no, la tarjeta
 * pega un salto al llegar los datos.
 */
export function useAltoGrafica(): number {
  return useMobile() ? 200 : 260;
}
