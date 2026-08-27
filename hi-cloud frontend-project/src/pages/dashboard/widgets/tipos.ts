import type { ComponentType } from 'react';

/**
 * Ancho que pide una gráfica.
 *
 * No es una decisión de maquetación suelta: es una propiedad de la gráfica. Una
 * serie de doce meses necesita ancho para leerse; un donut de cinco categorías
 * se lee igual de bien en una tarjeta de un tercio. Por eso vive en el registro
 * y no en el layout.
 */
export type AnchoWidget = 'principal' | 'tarjeta';

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
