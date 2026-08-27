import type { DefinicionWidget } from './tipos';
import { WidgetIngresosGastos } from './WidgetIngresosGastos';
import { WidgetAntiguedadCobrar, WidgetAntiguedadPagar } from './WidgetAntiguedad';
import { WidgetResumenGastos } from './WidgetResumenGastos';

/**
 * Registro de gráficas del dashboard.
 *
 * Los `slug` tienen que coincidir EXACTAMENTE con los del catálogo del backend
 * (`src/preferencias/dashboard-widgets.catalogo.ts`). El servidor es quien decide
 * qué slugs existen y quién puede verlos; esto solo dice qué componente pinta
 * cada uno.
 *
 * Si aquí falta un slug que el backend sí conoce, el panel lo ignora sin
 * romperse — igual que el backend ignora al leer los que ya no existen. Las dos
 * puntas toleran ir descompasadas un despliegue.
 */
export const REGISTRO_WIDGETS: Record<string, DefinicionWidget> = {
  'ingresos-gastos-anual': {
    slug: 'ingresos-gastos-anual',
    titulo: 'Ingresos & Gastos',
    ancho: 'principal',
    Componente: WidgetIngresosGastos,
  },
  'antiguedad-cobrar': {
    slug: 'antiguedad-cobrar',
    titulo: 'Antigüedad por Cobrar',
    ancho: 'tarjeta',
    Componente: WidgetAntiguedadCobrar,
  },
  'antiguedad-pagar': {
    slug: 'antiguedad-pagar',
    titulo: 'Antigüedad por Pagar',
    ancho: 'tarjeta',
    Componente: WidgetAntiguedadPagar,
  },
  'resumen-gastos': {
    slug: 'resumen-gastos',
    titulo: 'Resumen de Gastos',
    ancho: 'tarjeta',
    Componente: WidgetResumenGastos,
  },
};

export const widgetPorSlug = (slug: string): DefinicionWidget | undefined =>
  REGISTRO_WIDGETS[slug];

/** Los slugs que este frontend sabe pintar hoy. */
export const SLUGS_IMPLEMENTADOS = Object.keys(REGISTRO_WIDGETS);
