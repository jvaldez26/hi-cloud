import { UserRole } from '../users/enums/user-role.enum';

/**
 * Catalogo de graficas del dashboard — fuente de verdad del SERVIDOR.
 *
 * El frontend tiene su propio registro (slug -> componente), pero la validacion
 * no puede vivir alli: un PUT llega por HTTP y el navegador no es de fiar. Aqui
 * se decide que slugs existen y quien puede pedirlos.
 *
 * Los `roles` no son decorativos: los endpoints de /analytics admiten VIEWER y
 * los de /reportes usados aqui no. Sin este filtro, un viewer podria guardarse
 * una grafica que al cargar le devolveria 403 y le dejaria el panel roto.
 *
 * Al retirar una grafica del catalogo, NO hace falta tocar lo que la gente tenga
 * guardado: la lectura ignora los slugs desconocidos. Ver PreferenciasService.
 */

export type WidgetDashboard = {
  slug:     string;
  titulo:   string;
  endpoint: string;
  roles:    UserRole[];
};

const TODOS  = [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER];
const NO_VIEWER = [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR];

/** El orden de este array ES el orden del menu "Agregar grafica". */
export const CATALOGO_WIDGETS: readonly WidgetDashboard[] = [
  // ── Las cuatro que ya estaban en el dashboard ────────────────────────────
  { slug: 'ingresos-gastos-anual', titulo: 'Ingresos & Gastos',
    endpoint: '/reportes/dashboard/ingresos-gastos-anual', roles: NO_VIEWER },
  { slug: 'antiguedad-cobrar', titulo: 'Antigüedad por Cobrar',
    endpoint: '/reportes/dashboard/antiguedad-cobrar', roles: NO_VIEWER },
  { slug: 'antiguedad-pagar', titulo: 'Antigüedad por Pagar',
    endpoint: '/reportes/dashboard/antiguedad-pagar', roles: NO_VIEWER },
  { slug: 'resumen-gastos', titulo: 'Resumen de Gastos',
    endpoint: '/reportes/dashboard/resumen-gastos', roles: NO_VIEWER },

  // ── Las diez nuevas, en el orden acordado para el menu ───────────────────
  { slug: 'ecf-estado-mes', titulo: 'e-CF por estado DGII (mes)',
    endpoint: '/reportes/fiscal/ecf', roles: NO_VIEWER },
  { slug: 'ventas-por-vendedor', titulo: 'Ventas por vendedor',
    endpoint: '/analytics/ventas-por-vendedor', roles: TODOS },
  { slug: 'ventas-tendencia-12m', titulo: 'Ventas mensuales (12 meses)',
    endpoint: '/analytics/ventas-tendencia', roles: TODOS },
  { slug: 'top-clientes', titulo: 'Top clientes',
    endpoint: '/analytics/top-clientes', roles: TODOS },
  { slug: 'top-productos', titulo: 'Top productos',
    endpoint: '/analytics/top-productos', roles: TODOS },
  { slug: 'ventas-por-dia-mes', titulo: 'Ventas por día del mes',
    endpoint: '/reportes/ventas/por-dia', roles: NO_VIEWER },
  { slug: 'compras-por-dia-mes', titulo: 'Compras por día del mes',
    endpoint: '/reportes/compras/por-dia', roles: NO_VIEWER },
  { slug: 'compras-por-proveedor', titulo: 'Compras por proveedor',
    endpoint: '/reportes/compras/por-proveedor', roles: NO_VIEWER },
  { slug: 'inventario-valor-categoria', titulo: 'Valor de inventario por categoría',
    endpoint: '/reportes/inventario/valor', roles: NO_VIEWER },
  { slug: 'horas-pico', titulo: 'Horas y días pico de venta',
    endpoint: '/analytics/horas-pico', roles: TODOS },
] as const;

/**
 * Lo que ve quien nunca ha tocado nada.
 *
 * Son las cuatro que ya estaban en el dashboard antes de que fuera configurable:
 * nadie se encuentra su panel cambiado el dia del despliegue.
 */
export const WIDGETS_POR_DEFECTO = [
  // El ORDEN importa, no solo el contenido.
  //
  // Las tres tarjetas fijas del panel (Bancos, Actividad, Facturas & Cobros) son
  // tres, impares. Si la cuarta celda la pidiera una grafica ANCHA —Ingresos &
  // Gastos— a dos columnas no cabria en la columna que sobra y dejaria un hueco
  // en mitad del panel, que ademas es la configuracion mas comun de todas.
  //
  // Poniendo una MEDIA en cuarto lugar, las cuatro primeras celdas se llenan
  // solas y la ancha empieza fila limpia. Es un cambio de datos, no de layout, y
  // no toca el orden estricto: lo que se ve sigue siendo lo que se guardo.
  'antiguedad-cobrar',
  'ingresos-gastos-anual',
  'antiguedad-pagar',
  'resumen-gastos',
] as const;

/** Tope de graficas por usuario. Un panel de 30 no lo lee nadie. */
export const MAX_WIDGETS = 12;

export const CLAVE_DASHBOARD_WIDGETS = 'dashboard.widgets';

const PORSLUG = new Map(CATALOGO_WIDGETS.map(w => [w.slug, w]));

export const existeWidget = (slug: string) => PORSLUG.has(slug);

export const widgetPermitido = (slug: string, rol: UserRole) =>
  PORSLUG.get(slug)?.roles.includes(rol) ?? false;

export const catalogoParaRol = (rol: UserRole) =>
  CATALOGO_WIDGETS.filter(w => w.roles.includes(rol));

/**
 * Los defaults que ese rol puede ver de verdad.
 *
 * Las cuatro de siempre viven en /reportes, que NO admite viewer: un viewer que
 * entra por primera vez se quedaria con cero graficas y el mensaje de "las
 * quitaste todas", que ademas es mentira. Cuando ningun default le sirve, se le
 * dan las primeras del catalogo que si puede ver — las de /analytics.
 */
export const defectoParaRol = (rol: UserRole) => {
  const permitidos = WIDGETS_POR_DEFECTO.filter(s => widgetPermitido(s, rol));
  if (permitidos.length > 0) return permitidos;
  return catalogoParaRol(rol).slice(0, 4).map(w => w.slug);
};
