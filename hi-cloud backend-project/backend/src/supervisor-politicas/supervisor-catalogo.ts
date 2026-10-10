import type { ModoSupervisor } from './entities/supervisor-politica.entity';

export interface CatalogoItem {
  clave:            string;
  label:            string;
  descripcion:      string;
  grupo:            string;
  /** Valor con el que arranca una empresa NUEVA que nunca tocó esta política. */
  defaultRequerido: boolean;
  defaultModo:      ModoSupervisor;
}

/**
 * Catálogo único de todo lo protegible con el Modo Supervisor del POS —
 * fuente de verdad tanto para la pantalla de Configuración como para el
 * guard `RequiereSupervisor('<clave>')` en el backend.
 *
 * Las claves `pos.panel.*` deben coincidir 1:1 con los ids de
 * `POS_PANELES` del frontend (ver posPanelesConfig.ts) — un test de ese
 * archivo lo verifica.
 *
 * `defaultRequerido`/`defaultModo` son el valor de arranque para una
 * empresa NUEVA — las empresas existentes se migraron con el valor exacto
 * que ya tenían (ver migración 1770700000000-SupervisorPoliticas), no con
 * estos defaults.
 */
export const CATALOGO_SUPERVISOR: CatalogoItem[] = [
  // ── Pestañas del POS ────────────────────────────────────────────────────
  { clave: 'pos.panel.items',          label: 'Ítems',               descripcion: 'Entrar a la pantalla principal de venta',       grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.inventario',     label: 'Inventario',          descripcion: 'Entrar al panel de Inventario desde el POS',    grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.facturas',       label: 'Facturas',            descripcion: 'Entrar al listado de facturas',                 grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.pre_facturas',   label: 'Pre-Facturas',        descripcion: 'Entrar al listado de pre-facturas',             grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.cotizaciones',   label: 'Cotizaciones',        descripcion: 'Entrar al listado de cotizaciones',             grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.conduce',        label: 'Conduces',            descripcion: 'Entrar al listado de conduces',                 grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.clientes',       label: 'Clientes',            descripcion: 'Entrar al panel de Clientes desde el POS',      grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.recibos_cobro',  label: 'Recibos de Cobro',    descripcion: 'Entrar al panel de Recibos de Cobro',           grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.anticipos',      label: 'Anticipos',           descripcion: 'Entrar al panel de Anticipos',                  grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.notas_credito',  label: 'Notas de Crédito',    descripcion: 'Entrar al listado de notas de crédito',         grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.gastos',         label: 'Gastos/Retiros',      descripcion: 'Entrar al panel de Gastos y Retiros de caja',   grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.cierre_caja',    label: 'Cierre de Caja',      descripcion: 'Entrar al panel de Cierre de Caja',             grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.ventas_hoy',     label: 'Ganancias',           descripcion: 'Ver las ganancias del día',                     grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.pro_formas',     label: 'Pro Formas',          descripcion: 'Entrar al listado de pro formas',               grupo: 'Pestañas del POS', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'pos.panel.compras',        label: 'Compras',             descripcion: 'Entrar a Órdenes de Compra desde el POS',       grupo: 'Pestañas del POS', defaultRequerido: true,  defaultModo: 'sesion' },

  // ── Acciones de venta ────────────────────────────────────────────────────
  { clave: 'venta_credito',       label: 'Venta a crédito',             descripcion: 'Cobrar una venta a crédito en vez de contado',          grupo: 'Acciones de venta', defaultRequerido: false, defaultModo: 'cada_vez' },
  { clave: 'anular_documento',    label: 'Anular factura/documento',    descripcion: 'Anular una factura, pre-factura, cotización o pro forma', grupo: 'Acciones de venta', defaultRequerido: true,  defaultModo: 'cada_vez' },
  { clave: 'crear_nota_credito',  label: 'Crear Nota de Crédito',       descripcion: 'Crear una nota de crédito (devolución)',                 grupo: 'Acciones de venta', defaultRequerido: true,  defaultModo: 'cada_vez' },
  { clave: 'devolucion_efectivo', label: 'Devolución en efectivo',      descripcion: 'Devolver dinero en efectivo al crear una NC',            grupo: 'Acciones de venta', defaultRequerido: false, defaultModo: 'cada_vez' },
  { clave: 'descuento_excedido',  label: 'Descuento sobre el máximo',   descripcion: 'Aplicar un descuento mayor al % máximo configurado',    grupo: 'Acciones de venta', defaultRequerido: false, defaultModo: 'cada_vez' },
  { clave: 'modificar_precio',    label: 'Modificar precio de línea',   descripcion: 'Cambiar a mano el precio de un ítem en el carrito',     grupo: 'Acciones de venta', defaultRequerido: false, defaultModo: 'cada_vez' },

  // ── Caja ─────────────────────────────────────────────────────────────────
  { clave: 'cerrar_caja',      label: 'Cerrar caja',        descripcion: 'Confirmar el cierre de caja del turno',          grupo: 'Caja', defaultRequerido: false, defaultModo: 'cada_vez' },
  { clave: 'registrar_retiro', label: 'Registrar retiro',   descripcion: 'Registrar un retiro de efectivo de la caja',     grupo: 'Caja', defaultRequerido: false, defaultModo: 'cada_vez' },
  { clave: 'registrar_gasto',  label: 'Registrar gasto',    descripcion: 'Registrar un gasto pagado desde la caja',        grupo: 'Caja', defaultRequerido: false, defaultModo: 'sesion' },
  { clave: 'imprimir_cierre_caja_abierta', label: 'Imprimir cierre de caja abierta', descripcion: 'Imprimir (o exportar) el cierre de una caja que todavía está ABIERTA, con sus montos reales', grupo: 'Caja', defaultRequerido: true, defaultModo: 'sesion' },

  // ── Inventario y Productos ───────────────────────────────────────────────
  { clave: 'crear_producto',     label: 'Crear producto',           descripcion: 'Dar de alta un producto nuevo',                 grupo: 'Inventario y Productos', defaultRequerido: true, defaultModo: 'sesion' },
  { clave: 'editar_producto',    label: 'Editar producto',          descripcion: 'Modificar un producto existente',               grupo: 'Inventario y Productos', defaultRequerido: true, defaultModo: 'sesion' },
  { clave: 'entrada_inventario', label: 'Entrada de inventario',    descripcion: 'Registrar entrada de mercancía',                grupo: 'Inventario y Productos', defaultRequerido: true, defaultModo: 'sesion' },
  { clave: 'salida_inventario',  label: 'Salida de inventario',     descripcion: 'Registrar salida de mercancía',                 grupo: 'Inventario y Productos', defaultRequerido: true, defaultModo: 'sesion' },

  // ── Sistema ──────────────────────────────────────────────────────────────
  { clave: 'cambiar_sucursal', label: 'Cambiar sucursal', descripcion: 'Cambiar la sucursal activa de la sesión', grupo: 'Sistema', defaultRequerido: true, defaultModo: 'sesion' },

  // ── Reportes ─────────────────────────────────────────────────────────────
  { clave: 'ver_reportes', label: 'Ver reportes y analítica', descripcion: 'Reportes, Business Intelligence y KPI ejecutivo', grupo: 'Reportes', defaultRequerido: true, defaultModo: 'sesion' },

  // ── Caja: corrección posterior ──────────────────────────────────────────
  // Usan RequiereSupervisorSiempre (sin bypass por rol) — incluso un ADMIN
  // necesita la autorización de otra persona para esto.
  { clave: 'corregir_forma_pago_factura', label: 'Corregir forma de pago de una factura', descripcion: 'Cambiar cómo se registró el cobro de una factura ya emitida (el total no cambia)', grupo: 'Caja', defaultRequerido: true, defaultModo: 'cada_vez' },
  { clave: 'anular_cierre_caja', label: 'Anular cierre de caja', descripcion: 'Reabrir una caja ya cerrada para recerrarla — requiere que OTRA persona lo autorice', grupo: 'Caja', defaultRequerido: true, defaultModo: 'cada_vez' },
];

export const CLAVES_VALIDAS = new Set(CATALOGO_SUPERVISOR.map(c => c.clave));

export function esClaveValida(clave: string): boolean {
  return CLAVES_VALIDAS.has(clave);
}
