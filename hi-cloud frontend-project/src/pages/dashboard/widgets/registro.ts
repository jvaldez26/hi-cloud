import type { DefinicionWidget } from './tipos';
import { WidgetIngresosGastos } from './WidgetIngresosGastos';
import { WidgetAntiguedadCobrar, WidgetAntiguedadPagar } from './WidgetAntiguedad';
import { WidgetResumenGastos } from './WidgetResumenGastos';
import { WidgetEcfEstado } from './WidgetEcfEstado';
import { WidgetVentasPorVendedor } from './WidgetVentasPorVendedor';
import { WidgetVentasTendencia } from './WidgetVentasTendencia';
import { WidgetTopClientes } from './WidgetTopClientes';
import { WidgetTopProductos } from './WidgetTopProductos';
import { WidgetVentasPorDia, WidgetComprasPorDia } from './WidgetPorDiaDelMes';
import { WidgetComprasPorProveedor } from './WidgetComprasPorProveedor';
import { WidgetInventarioValor } from './WidgetInventarioValor';
import { WidgetHorasPico } from './WidgetHorasPico';

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
    ancho: 'ancha',
    Componente: WidgetIngresosGastos,
  },
  'antiguedad-cobrar': {
    slug: 'antiguedad-cobrar',
    titulo: 'Antigüedad por Cobrar',
    ancho: 'media',
    Componente: WidgetAntiguedadCobrar,
  },
  'antiguedad-pagar': {
    slug: 'antiguedad-pagar',
    titulo: 'Antigüedad por Pagar',
    ancho: 'media',
    Componente: WidgetAntiguedadPagar,
  },
  'resumen-gastos': {
    slug: 'resumen-gastos',
    titulo: 'Resumen de Gastos',
    ancho: 'media',
    Componente: WidgetResumenGastos,
  },

  // ── Lote 1 de la Fase 4 ─────────────────────────────────────────────────
  'ecf-estado-mes': {
    slug: 'ecf-estado-mes',
    titulo: 'e-CF por estado DGII (mes)',
    ancho: 'media',
    Componente: WidgetEcfEstado,
  },
  'ventas-por-vendedor': {
    slug: 'ventas-por-vendedor',
    titulo: 'Ventas por vendedor',
    ancho: 'media',
    Componente: WidgetVentasPorVendedor,
  },
  'ventas-tendencia-12m': {
    slug: 'ventas-tendencia-12m',
    titulo: 'Ventas mensuales (12 meses)',
    ancho: 'ancha',
    Componente: WidgetVentasTendencia,
  },

  // ── Lote 2 de la Fase 4 ─────────────────────────────────────────────────
  'top-clientes': {
    slug: 'top-clientes',
    titulo: 'Top clientes',
    ancho: 'media',
    Componente: WidgetTopClientes,
  },
  'top-productos': {
    slug: 'top-productos',
    titulo: 'Top productos',
    ancho: 'media',
    Componente: WidgetTopProductos,
  },
  'ventas-por-dia-mes': {
    slug: 'ventas-por-dia-mes',
    titulo: 'Ventas por día del mes',
    ancho: 'ancha',
    Componente: WidgetVentasPorDia,
  },

  // ── Lote 3 de la Fase 4 ─────────────────────────────────────────────────
  'compras-por-dia-mes': {
    slug: 'compras-por-dia-mes',
    titulo: 'Compras por día del mes',
    ancho: 'ancha',
    Componente: WidgetComprasPorDia,
  },
  'compras-por-proveedor': {
    slug: 'compras-por-proveedor',
    titulo: 'Compras por proveedor',
    ancho: 'media',
    Componente: WidgetComprasPorProveedor,
  },

  // ── Lote 4 de la Fase 4 — con esto el catalogo queda completo ───────────
  'inventario-valor-categoria': {
    slug: 'inventario-valor-categoria',
    titulo: 'Valor de inventario por categoría',
    ancho: 'media',
    Componente: WidgetInventarioValor,
  },
  'horas-pico': {
    slug: 'horas-pico',
    titulo: 'Horas y días pico de venta',
    ancho: 'ancha',
    Componente: WidgetHorasPico,
  }
};

export const widgetPorSlug = (slug: string): DefinicionWidget | undefined =>
  REGISTRO_WIDGETS[slug];

/** Los slugs que este frontend sabe pintar hoy. */
export const SLUGS_IMPLEMENTADOS = Object.keys(REGISTRO_WIDGETS);
