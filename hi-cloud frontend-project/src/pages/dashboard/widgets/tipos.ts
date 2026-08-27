import type { ComponentType } from 'react';

/**
 * Ancho que pide una gráfica dentro de la rejilla.
 *
 * No es una decisión de maquetación suelta: es una propiedad de la gráfica.
 *
 *   'ancha' → ocupa 2 columnas. Eje temporal o muchas categorías en X: 31 barras
 *             de un mes o 12 meses de serie comprimidos a media pantalla dejan de
 *             leerse.
 *   'media' → 1 columna. Donuts y rankings de 8 filas ganan poco con más ancho.
 *
 * Con 2 columnas, 'ancha' es el ancho completo; con 3, son dos tercios.
 */
export type AnchoWidget = 'ancha' | 'media';

/** Alto mínimo de cada tipo. La celda puede crecer si su fila es más alta. */
export const ALTO_MINIMO: Record<AnchoWidget, number> = {
  ancha: 400,
  media: 340,
};

export type DefinicionWidget = {
  /** Debe coincidir EXACTAMENTE con el slug del catálogo del backend. */
  slug:      string;
  titulo:    string;
  ancho:     AnchoWidget;
  /**
   * El componente trae SU PROPIA consulta dentro. Esa es la regla del panel: si
   * el widget no está montado, su petición no existe, y quitarlo no puede
   * disparar las de los demás porque no hay ninguna consulta padre que las
   * agrupe.
   */
  Componente: ComponentType;
};
