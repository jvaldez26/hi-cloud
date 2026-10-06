/**
 * Fuente única de las pestañas/paneles del POS — antes vivían triplicadas
 * en POSPage.tsx (NAV_ITEMS, MENU_EXTRAS y PANEL_TITLES, que había que
 * mantener sincronizadas a mano). La barra inferior, el drawer "Menú", los
 * títulos de cada panel abierto Y el catálogo de Modo Supervisor
 * (Configuración) salen TODOS de este archivo.
 *
 * `claveSupervisor` es la clave del catálogo de políticas en el backend
 * (ver supervisor-catalogo.ts) — con guion bajo, mientras que `id` (el
 * PanelId real que usa POSPage) va con guion medio. Un test verifica que
 * cada entrada de aquí tiene su contraparte exacta en el catálogo del
 * backend (ver posPanelesConfig.test.ts).
 */

export type PanelId =
  | 'items' | 'inventario' | 'facturas' | 'pre-facturas' | 'cotizaciones' | 'conduce'
  | 'clientes' | 'recibos-cobro' | 'anticipos'
  | 'notas-credito' | 'gastos' | 'cierre-caja' | 'ventas-hoy' | 'pro-formas' | 'compras';

export interface PosPanelConfig {
  id:             PanelId;
  label:          string;
  /** Solo para la barra inferior, donde no cabe el label completo — si falta, se usa `label`. */
  labelCorto?:    string;
  icon:           string;
  /** 'barra' = visible siempre en la barra inferior; 'menu' = dentro de "Menú". */
  grupo:          'barra' | 'menu';
  claveSupervisor: string;
}

export const POS_PANELES: PosPanelConfig[] = [
  { id: 'items',          label: 'Ítems',             icon: '🛒',  grupo: 'barra', claveSupervisor: 'pos.panel.items' },
  { id: 'inventario',     label: 'Inventario',        icon: '📦',  grupo: 'barra', claveSupervisor: 'pos.panel.inventario' },
  { id: 'facturas',       label: 'Facturas',          icon: '📄',  grupo: 'barra', claveSupervisor: 'pos.panel.facturas' },
  { id: 'pre-facturas',   label: 'Pre-Facturas',      labelCorto: 'Pre-Fact.', icon: '📋',  grupo: 'barra', claveSupervisor: 'pos.panel.pre_facturas' },
  { id: 'cotizaciones',   label: 'Cotizaciones',      labelCorto: 'Cotizac.',  icon: '💬',  grupo: 'barra', claveSupervisor: 'pos.panel.cotizaciones' },
  { id: 'compras',        label: 'Órdenes de Compra', labelCorto: 'Compras', icon: '🛍️', grupo: 'barra', claveSupervisor: 'pos.panel.compras' },

  { id: 'ventas-hoy',     label: 'Ganancias',         icon: '📈',  grupo: 'menu', claveSupervisor: 'pos.panel.ventas_hoy' },
  { id: 'conduce',        label: 'Conduce',           icon: '🚚',  grupo: 'menu', claveSupervisor: 'pos.panel.conduce' },
  { id: 'clientes',       label: 'Clientes',          icon: '👤',  grupo: 'menu', claveSupervisor: 'pos.panel.clientes' },
  { id: 'recibos-cobro',  label: 'Recibos de Cobro',  icon: '🧾',  grupo: 'menu', claveSupervisor: 'pos.panel.recibos_cobro' },
  { id: 'anticipos',      label: 'Anticipos',         icon: '💰',  grupo: 'menu', claveSupervisor: 'pos.panel.anticipos' },
  { id: 'pro-formas',     label: 'Pro Formas',        icon: '📋',  grupo: 'menu', claveSupervisor: 'pos.panel.pro_formas' },
  { id: 'notas-credito',  label: 'Notas de Crédito',  icon: '📝',  grupo: 'menu', claveSupervisor: 'pos.panel.notas_credito' },
  { id: 'gastos',         label: 'Gastos/Retiros',    icon: '💸',  grupo: 'menu', claveSupervisor: 'pos.panel.gastos' },
  { id: 'cierre-caja',    label: 'Cierre de Caja',    icon: '🏧',  grupo: 'menu', claveSupervisor: 'pos.panel.cierre_caja' },
];

export const PANEL_TITLES: Record<PanelId, { label: string; icon: string }> =
  Object.fromEntries(POS_PANELES.map(p => [p.id, { label: p.label, icon: p.icon }])) as Record<PanelId, { label: string; icon: string }>;

/**
 * Clave de Modo Supervisor por pestaña, para que el handler de cambio de
 * panel en POSPage.tsx pueda gatear CUALQUIER pestaña de forma genérica —
 * una vez hubo una versión recableada a mano ahí que solo cubría 5 de las
 * 15 pestañas (las demás, incluidas Cotizaciones y Conduce, quedaban
 * accesibles sin supervisor aunque la política las marcara). Esta es la
 * única fuente: cada entrada de POS_PANELES aparece aquí automáticamente.
 */
export const CLAVE_SUPERVISOR_POR_PANEL: Record<PanelId, string> =
  Object.fromEntries(POS_PANELES.map(p => [p.id, p.claveSupervisor])) as Record<PanelId, string>;

/** Barra inferior — paneles de grupo 'barra' + el botón "Menú" al final. */
export const NAV_ITEMS: Array<{ id: PanelId | 'menu'; label: string; icon: string }> = [
  ...POS_PANELES.filter(p => p.grupo === 'barra').map(p => ({ id: p.id, label: p.labelCorto ?? p.label, icon: p.icon })),
  { id: 'menu', label: 'Menú', icon: '⋮' },
];

/**
 * Contenido del drawer "Menú" — paneles de grupo 'menu' más 2 acciones que
 * NO son paneles navegables (abren un modal/dialog propio): Nueva NC e
 * Impresora BT. Esas dos quedan fuera de POS_PANELES a propósito — no
 * tienen panel propio que gatear con Modo Supervisor por sí solas (Nueva NC
 * ya se gatea con la clave 'crear_nota_credito'). Se insertan en la misma
 * posición que tenían antes de unificar esta lista (Nueva NC justo después
 * de Notas de Crédito, Impresora BT al final) para no reordenar el menú.
 */
const panelesMenu = POS_PANELES.filter(p => p.grupo === 'menu').map(p => ({ label: p.label, icon: p.icon, panel: p.id as PanelId | 'nueva-nc' | 'impresora-bt' }));
const idxNotasCredito = panelesMenu.findIndex(p => p.panel === 'notas-credito');
export const MENU_EXTRAS: Array<{ label: string; icon: string; panel: PanelId | 'nueva-nc' | 'impresora-bt' }> = [
  ...panelesMenu.slice(0, idxNotasCredito + 1),
  { label: 'Nueva NC', icon: '➕', panel: 'nueva-nc' },
  ...panelesMenu.slice(idxNotasCredito + 1),
  { label: 'Impresora BT', icon: '🖨️', panel: 'impresora-bt' },
];
