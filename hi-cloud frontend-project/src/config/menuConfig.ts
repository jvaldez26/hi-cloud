/**
 * Fuente única de verdad para rutas, permisos y categorías del menú.
 * Importado por AppLayout (añade íconos) Y por CommandPalette (filtrado por rol/add-on).
 * SIN imports de lucide ni de React — solo datos puros para evitar importaciones circulares.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MenuItemData {
  path:  string;
  label: string;
  /** Código de transacción tipo SAP (2 letras de área + 2 dígitos), único en
   *  toda la app — ver CommandPalette.codigos.test.ts para la validación. */
  codigo: string;
  /** Atajo de creación rápida asociado ("Nueva Factura" para /facturas, etc.) —
   *  el buscador global lo expone bajo "Acciones" con las mismas reglas de
   *  visibilidad que el ítem padre. */
  accionRapida?: { path: string; label: string; codigo: string };
}

export interface MenuCategoryData {
  id:            string;
  label:         string;
  sectionLabel?: string;   // separador visual "OPERACIONES", "GESTIÓN", etc.
  items:         MenuItemData[];
}

export interface QuickAccessItemData {
  path:   string;
  label:  string;
  codigo: string;
}

/**
 * Accesos rápidos fuera de las categorías del menú (Inicio, POS, Caja,
 * Bandeja, Xlink) — ÚNICA fuente para el sidebar (AppLayout.tsx le agrega su
 * ícono de lucide) y el buscador global (CommandPalette le agrega su emoji).
 * No incluye "Activar factura electrónica": su visibilidad depende de un
 * veredicto del backend (GET /activacion-ecf/estado), no de rol/add-on —
 * calcularla aquí duplicaría esa lógica y podría discrepar del sidebar.
 */
export const QUICK_ACCESS_ITEMS: QuickAccessItemData[] = [
  { path: '/dashboard',         label: 'Inicio',               codigo: 'GN01' },
  { path: '/bandeja',           label: 'Bandeja de entrada',    codigo: 'GN02' },
  { path: '/xlink',             label: 'HiCloud Xlink',         codigo: 'XL01' },
  { path: '/pos',               label: 'Punto de Venta',        codigo: 'CJ01' },
  { path: '/caja',              label: 'Caja Diaria',           codigo: 'CJ02' },
];

// ── Grupos de roles ───────────────────────────────────────────────────────────

const ADMIN            = ['admin'];
const ADMIN_CONT       = ['admin', 'contador'];
const ADMIN_CONT_VEND  = ['admin', 'contador', 'vendedor'];
const ALL_ROLES        = ['admin', 'contador', 'vendedor', 'viewer'];
/** Como ALL_ROLES pero sin vendedor — ver PosGuard/SupervisorGateGuard en el
 *  backend: crear/editar producto ya requiere sesión de supervisor activa
 *  para ese rol, así que el link deja de tener sentido fuera del POS. */
const ADMIN_CONT_VIEWER = ['admin', 'contador', 'viewer'];
/** Único caso hoy donde super_admin entra en esta lista — HiCloud Xlink
 *  opera por empresa, pero un super_admin que entra a una empresa (vía
 *  impersonación) también debe poder verlo. */
const ADMIN_CONT_SUPER = ['admin', 'contador', 'super_admin'];

// ── IDs de módulos add-on ─────────────────────────────────────────────────────

export const ADDON_IDS: string[] = [
  'clinica', 'taller', 'optica', 'farmacia', 'restaurante',
  'gimnasio', 'servicios_pro', 'prestamista', 'agro', 'transporte', 'educativo', 'car_wash',
];

// ── Restricciones de ruta por rol ─────────────────────────────────────────────

export const PATH_ROLES: Record<string, string[]> = {
  // ── Solo Admin ────────────────────────────────────────────────────────────
  '/configuracion':      ADMIN_CONT_VEND,  // vendedor/contador ven solo la sección Apariencia
  '/equipo':             ADMIN,
  '/sucursales':         ADMIN,
  '/aprobaciones':       ADMIN,
  '/importacion':        ADMIN,
  '/auditoria':          ADMIN_CONT,

  // ── Admin + Contador ──────────────────────────────────────────────────────
  '/compras':               ADMIN_CONT,
  '/solicitudes-compra':    ADMIN_CONT,
  '/proveedores':           ADMIN_CONT,
  '/reposicion-proveedor':  ADMIN_CONT_VEND,
  '/cxp':                   ADMIN_CONT,
  // Registrar un gasto ya requiere sesión de supervisor activa para
  // vendedor (ver requireSupervisor('Gastos / Retiros') en el POS).
  '/gastos':                ADMIN_CONT,
  '/caja-chica':            ADMIN_CONT,
  '/notas-credito-compras': ADMIN_CONT,
  '/bancos':                ADMIN_CONT,
  '/depositos':             ADMIN_CONT,
  '/cheques':               ADMIN_CONT,
  '/datafono':              ADMIN_CONT,
  '/divisas':               ADMIN_CONT,
  '/contabilidad':          ADMIN_CONT,
  '/configuracion-contable': ADMIN_CONT,
  '/libro-mayor':           ADMIN_CONT,
  '/periodo-contable':      ADMIN_CONT,
  '/balance-comprobacion':  ADMIN_CONT,
  '/libro-ventas':          ADMIN_CONT,
  '/reportes-financieros':  ADMIN_CONT,
  '/presupuestos':          ADMIN_CONT,
  '/activos-fijos':         ADMIN_CONT,
  '/centro-costos':         ADMIN_CONT,
  '/flujo-caja':            ADMIN_CONT,
  '/distribucion-costos':   ADMIN_CONT,
  '/ecf':                   ADMIN_CONT,
  '/ecf/activar':           ADMIN_CONT,
  '/ecf-recibidos':         ADMIN_CONT,
  '/xlink':                 ADMIN_CONT_SUPER,
  '/retenciones':           ADMIN_CONT,
  '/declaraciones':         ADMIN_CONT,
  '/herramientas-fiscales': ADMIN_CONT,
  // Modo supervisor del POS ya exige aprobación para "Ver Ganancias" (única
  // acción marcada Forced, máxima sensibilidad) — fuera del POS, vendedor no
  // tiene ningún camino equivalente para ver estos reportes.
  '/reportes':              ADMIN_CONT,
  '/analytics':             ADMIN_CONT,
  '/kpi':                   ADMIN_CONT,
  // Ya bloqueado en backend hoy para vendedor (ADMIN/CONTADOR/VIEWER) — el
  // link era puramente cosmético, nunca funcionaba para ese rol.
  '/generador-reportes':    ADMIN_CONT_VIEWER,
  '/calendario':            ADMIN_CONT,
  '/asistente':             ADMIN_CONT,
  '/nomina':                ADMIN_CONT,
  '/portal-empleado':       ADMIN_CONT,
  '/vacaciones':            ADMIN_CONT,
  '/tss':                   ADMIN_CONT,
  '/isr':                   ADMIN_CONT,
  '/evaluaciones':          ADMIN_CONT,
  '/capacitacion':          ADMIN_CONT,
  '/proyectos':             ADMIN_CONT,
  '/contratos':             ADMIN_CONT,
  '/objetivos':             ADMIN_CONT,
  '/licitaciones':          ADMIN_CONT,
  '/encuestas':             ADMIN_CONT,
  '/crm':                   ADMIN_CONT,
  '/comisiones':            ADMIN_CONT,
  '/vendedores':            ADMIN_CONT,
  '/almacenes':             ADMIN_CONT,
  '/wms':                   ADMIN_CONT,
  '/manufactura':           ADMIN_CONT,
  '/planeacion-demanda':    ADMIN_CONT,
  '/flota':                 ADMIN_CONT,
  '/mantenimiento':         ADMIN_CONT,

  // ── Todos los roles autenticados ─────────────────────────────────────────
  '/facturas':              ALL_ROLES,
  '/clientes':              ALL_ROLES,
  // Crear/editar producto ya requiere sesión de supervisor activa para
  // vendedor (ver requireSupervisor('Inventario') en el POS) — el link deja
  // de tener sentido fuera del POS para ese rol. viewer conserva acceso de
  // solo lectura.
  '/productos':             ADMIN_CONT_VIEWER,

  // ── Admin + Contador + Vendedor ───────────────────────────────────────────
  '/cotizaciones':          ADMIN_CONT_VEND,
  '/pre-facturas':          ADMIN_CONT_VEND,
  '/pro-formas':            ADMIN_CONT_VEND,
  // Emitir NC ya requiere sesión de supervisor activa para vendedor (ver
  // requireSupervisor('Devolución en efectivo'/'Nueva Nota de Crédito')).
  '/notas-credito':         ADMIN_CONT,
  '/notas-debito':          ADMIN_CONT,
  '/devoluciones':          ADMIN_CONT,
  '/facturas-recurrentes':  ADMIN_CONT,
  '/cxc':                   ADMIN_CONT_VEND,
  // Emitir un recibo de cobro ya requiere sesión de supervisor activa para
  // vendedor (ver requireSupervisor('Recibos de Cobro') en el POS).
  '/recibos-cobro':         ADMIN_CONT,
  '/conduces':              ADMIN_CONT_VEND,
  '/fidelidad':             ADMIN_CONT,
  '/soporte/tickets':       ADMIN_CONT,
  '/cuotas':                ADMIN_CONT,
  '/credito-cliente':       ADMIN_CONT,
  '/anticipos-cliente':     ADMIN_CONT_VEND,
  // Entrada/salida de stock ya requiere sesión de supervisor activa para
  // vendedor (mismo gate 'Inventario' del POS que Productos, arriba).
  '/inventario':            ADMIN_CONT,
  // Ya bloqueado en backend hoy para vendedor (ni siquiera lectura) — el
  // link era puramente cosmético.
  '/conteo-inventario':     ADMIN_CONT,
  '/etiquetas':             ADMIN_CONT_VEND,
  // Mutar (crear/eliminar) ya bloqueado en backend para vendedor; ocultar
  // también la lectura — es un catálogo de soporte a Productos, no algo que
  // el vendedor necesite consultar aparte.
  '/uom':                   ADMIN_CONT,
  '/valoracion-stock':      ADMIN_CONT_VEND,
  '/caja':                  ADMIN_CONT,
  '/servicios':             ADMIN_CONT,
  '/pos':                   ADMIN_CONT_VEND,

  // ── Módulos Add-on ────────────────────────────────────────────────────────
  '/clinica':                   ADMIN_CONT,
  '/clinica/pacientes':         ADMIN_CONT,
  '/clinica/agenda':            ADMIN_CONT,
  '/clinica/sala-espera':       ADMIN_CONT,
  '/clinica/consultas':         ADMIN_CONT,
  '/clinica/recetas':           ADMIN_CONT,
  '/clinica/laboratorio':       ADMIN_CONT,
  '/clinica/procedimientos':    ADMIN_CONT,
  '/clinica/ars':               ADMIN_CONT,
  '/clinica/medicos':           ADMIN_CONT,
  '/clinica/catalogo':          ADMIN_CONT,
  '/clinica/reportes':          ADMIN_CONT,
  '/taller':                    ADMIN_CONT,
  '/taller/ordenes':            ADMIN_CONT,
  '/taller/vehiculos':          ADMIN_CONT,
  '/taller/tecnicos':           ADMIN_CONT,
  '/taller/agenda':             ADMIN_CONT,
  '/taller/catalogo':           ADMIN_CONT,
  '/taller/reportes':           ADMIN_CONT,
  '/optica':                    ADMIN_CONT,
  '/optica/pacientes':          ADMIN_CONT,
  '/optica/medicos':            ADMIN_CONT,
  '/optica/agenda':             ADMIN_CONT,
  '/optica/consultas':          ADMIN_CONT,
  '/optica/recetas':            ADMIN_CONT,
  '/optica/ordenes':            ADMIN_CONT,
  '/optica/ars':                ADMIN_CONT,
  '/optica/inventario':         ADMIN_CONT,
  '/farmacia':                  ADMIN_CONT,
  '/farmacia/dispensacion':     ADMIN_CONT,
  '/farmacia/medicamentos':     ADMIN_CONT,
  '/farmacia/lotes':            ADMIN_CONT,
  '/farmacia/recepciones':      ADMIN_CONT,
  '/farmacia/narcoticos':       ADMIN_CONT,
  '/farmacia/devoluciones':     ADMIN_CONT,
  '/farmacia/ars':              ADMIN_CONT,
  '/farmacia/reportes':         ADMIN_CONT,
  '/restaurante':               ADMIN_CONT,
  '/restaurante/mesas':         ADMIN_CONT,
  '/restaurante/kds':           ADMIN_CONT,
  '/restaurante/delivery':      ADMIN_CONT,
  '/restaurante/reservaciones': ADMIN_CONT,
  '/restaurante/menu':          ADMIN_CONT,
  '/restaurante/turnos':        ADMIN_CONT,
  '/restaurante/reportes':      ADMIN_CONT,
  '/gimnasio':                  ADMIN_CONT,
  '/gimnasio/acceso':           ADMIN_CONT,
  '/gimnasio/miembros':         ADMIN_CONT,
  '/gimnasio/membresias':       ADMIN_CONT,
  '/gimnasio/clases':           ADMIN_CONT,
  '/gimnasio/entrenadores':     ADMIN_CONT,
  '/gimnasio/rutinas':          ADMIN_CONT,
  '/gimnasio/progreso':         ADMIN_CONT,
  '/gimnasio/accesos':          ADMIN_CONT,
  '/gimnasio/lockers':          ADMIN_CONT,
  '/gimnasio/nutricion':        ADMIN_CONT,
  '/gimnasio/tienda':           ADMIN_CONT,
  '/gimnasio/reportes':         ADMIN_CONT,
  '/car-wash/dashboard':        ADMIN_CONT_VEND,
  '/car-wash':                  ADMIN_CONT_VEND,
  '/car-wash/turnos':           ADMIN_CONT_VEND,
  '/car-wash/recepcion':        ADMIN_CONT_VEND,
  '/car-wash/servicios':        ADMIN,
  '/car-wash/lavadores':        ADMIN,
  '/car-wash/pagos-lavadores':  ADMIN,
  '/car-wash/config':           ADMIN,
  '/servicios-pro':                  ADMIN_CONT,
  '/servicios-pro/expedientes':      ADMIN_CONT,
  '/servicios-pro/time-tracker':     ADMIN_CONT,
  '/servicios-pro/tareas':           ADMIN_CONT,
  '/servicios-pro/reuniones':        ADMIN_CONT,
  '/servicios-pro/contratos':        ADMIN_CONT,
  '/servicios-pro/honorarios':       ADMIN_CONT,
  '/servicios-pro/retainers':        ADMIN_CONT,
  '/servicios-pro/profesionales':    ADMIN_CONT,
  '/servicios-pro/reportes':         ADMIN_CONT,
  '/prestamista':                    ADMIN_CONT,
  '/prestamista/deudores':           ADMIN_CONT,
  '/prestamista/solicitudes':        ADMIN_CONT,
  '/prestamista/prestamos':          ADMIN_CONT,
  '/prestamista/simulador':          ADMIN_CONT,
  '/prestamista/cobranza':           ADMIN_CONT,
  '/prestamista/vehiculos':          ADMIN_CONT,
  '/prestamista/productos':          ADMIN_CONT,
  '/prestamista/reportes':           ADMIN_CONT,
  '/agro':                           ADMIN_CONT,
  '/agro/fincas':                    ADMIN_CONT,
  '/agro/parcelas':                  ADMIN_CONT,
  '/agro/cultivos':                  ADMIN_CONT,
  '/agro/ciclos':                    ADMIN_CONT,
  '/agro/cosechas':                  ADMIN_CONT,
  '/agro/ganaderia':                 ADMIN_CONT,
  '/agro/insumos':                   ADMIN_CONT,
  '/agro/maquinaria':                ADMIN_CONT,
  '/agro/reportes':                  ADMIN_CONT,
  '/transporte':                     ADMIN_CONT,
  '/transporte/viajes':              ADMIN_CONT,
  '/transporte/vehiculos':           ADMIN_CONT,
  '/transporte/choferes':            ADMIN_CONT,
  '/transporte/combustible':         ADMIN_CONT,
  '/transporte/mantenimiento':       ADMIN_CONT,
  '/transporte/reportes':            ADMIN_CONT,
  // ── Educativo ──────────────────────────────────────────────────────────
  '/educativo':                      ALL_ROLES,
  '/educativo/estudiantes':          ALL_ROLES,
  '/educativo/tutores':              ADMIN_CONT,
  '/educativo/matriculas':           ADMIN_CONT_VEND,
  '/educativo/estructura':           ADMIN_CONT,
  '/educativo/docentes':             ADMIN_CONT,
  '/educativo/notas':                ALL_ROLES,
  '/educativo/boletines':            ALL_ROLES,
  '/educativo/asistencia':           ALL_ROLES,
  '/educativo/colegiatura':          ADMIN_CONT_VEND,
  '/educativo/becas':                ADMIN_CONT_VEND,
  '/educativo/pagos':                ADMIN_CONT_VEND,
  '/educativo/disciplina':           ALL_ROLES,
  '/educativo/biblioteca':           ALL_ROLES,
  '/educativo/transporte':           ADMIN_CONT,
  '/educativo/comedor':              ADMIN_CONT,
  // Datos médicos de menores — solo admin (dirección/enfermería comparten
  // la cuenta admin, no hay un rol "enfermería" propio en el sistema hoy;
  // ver feedback_educativo_enfermeria_acceso en memoria).
  '/educativo/enfermeria':           ADMIN,
  '/educativo/comunicados':          ADMIN_CONT_VEND,
  '/educativo/reportes':             ADMIN_CONT,
};

// ── Función de permisos ───────────────────────────────────────────────────────

export function rolPuedeVerRuta(path: string, role: string): boolean {
  const allowed = PATH_ROLES[path];
  if (!allowed) return true; // sin restricción → todos los roles
  return allowed.includes(role);
}

// ── Categorías del menú (datos sin íconos) ────────────────────────────────────

export const MENU_CATEGORIES_DATA: MenuCategoryData[] = [

  // ─── VENTAS & CLIENTES ─────────────────────────────────────────────────────
  {
    id: 'ventas', label: 'Ventas & Clientes', sectionLabel: 'OPERACIONES',
    items: [
      { path: '/facturas',             label: 'Facturas', codigo: 'VT02', accionRapida: { path: '/facturas/nueva', label: 'Nueva Factura', codigo: 'VT01' } },
      { path: '/cotizaciones',         label: 'Cotizaciones', codigo: 'VT05', accionRapida: { path: '/cotizaciones/nueva', label: 'Nueva Cotización', codigo: 'VT04' } },
      { path: '/pre-facturas',         label: 'Pre-Facturas', codigo: 'VT06' },
      { path: '/pro-formas',           label: 'Pro Formas', codigo: 'VT07' },
      { path: '/facturas-recurrentes', label: 'Facturación Recurrente', codigo: 'VT08' },
      { path: '/notas-credito',        label: 'Notas de Crédito', codigo: 'VT09' },
      { path: '/notas-debito',         label: 'Notas de Débito', codigo: 'VT10' },
      { path: '/devoluciones',         label: 'Devoluciones', codigo: 'VT11' },
      { path: '/clientes',             label: 'Lista de Clientes', codigo: 'VT12' },
      { path: '/credito-cliente',      label: 'Crédito al Cliente', codigo: 'VT13' },
      { path: '/cxc',                  label: 'Cuentas por Cobrar', codigo: 'VT14' },
      { path: '/cuotas',               label: 'Cuotas / Pagos', codigo: 'VT15' },
      { path: '/recibos-cobro',        label: 'Recibos de Cobro', codigo: 'VT16' },
      { path: '/anticipos-cliente',    label: 'Anticipos de Clientes', codigo: 'VT17' },
      { path: '/fidelidad',            label: 'Fidelidad & Puntos', codigo: 'VT18' },
      { path: '/conduces',             label: 'Conduces / Entregas', codigo: 'VT19' },
      { path: '/soporte/tickets',      label: 'Tickets de Soporte', codigo: 'VT20' },
    ],
  },

  // ─── COMPRAS & GASTOS ──────────────────────────────────────────────────────
  {
    id: 'compras', label: 'Compras & Gastos',
    items: [
      { path: '/solicitudes-compra',    label: 'Solicitudes de Compra', codigo: 'CP04' },
      { path: '/compras',               label: 'Órdenes de Compra', codigo: 'CP02', accionRapida: { path: '/compras/nueva', label: 'Nueva Compra', codigo: 'CP01' } },
      { path: '/proveedores',           label: 'Proveedores', codigo: 'CP05' },
      { path: '/reposicion-proveedor',  label: 'Reposición por Proveedor', codigo: 'CP06' },
      { path: '/cxp',                   label: 'Cuentas por Pagar', codigo: 'CP07' },
      { path: '/notas-credito-compras', label: 'NC de Compras', codigo: 'CP08' },
      { path: '/gastos',                label: 'Gastos Operativos', codigo: 'CP09' },
      { path: '/caja-chica',            label: 'Caja Chica', codigo: 'CP10' },
    ],
  },

  // ─── INVENTARIO & LOGÍSTICA ────────────────────────────────────────────────
  {
    id: 'inventario', label: 'Inventario & Logística',
    items: [
      { path: '/productos',          label: 'Productos', codigo: 'IN02', accionRapida: { path: '/productos?nuevo=1', label: 'Nuevo Producto', codigo: 'IN01' } },
      { path: '/almacenes',          label: 'Almacenes / Bodegas', codigo: 'IN04' },
      { path: '/inventario',         label: 'Movimientos de Stock', codigo: 'IN05' },
      { path: '/conteo-inventario',  label: 'Conteo Físico', codigo: 'IN06' },
      { path: '/uom',                label: 'Unidades de Medida', codigo: 'IN07' },
      { path: '/valoracion-stock',   label: 'Valoración AVCO', codigo: 'IN08' },
      { path: '/etiquetas',          label: 'Etiquetas', codigo: 'IN09' },
      { path: '/wms',                label: 'WMS — Almacén', codigo: 'IN10' },
      { path: '/manufactura',        label: 'Manufactura', codigo: 'IN11' },
      { path: '/planeacion-demanda', label: 'Planeación de Demanda', codigo: 'IN12' },
      { path: '/flota',              label: 'Flota de Vehículos', codigo: 'IN13' },
    ],
  },

  // ─── FINANZAS & CONTABILIDAD ───────────────────────────────────────────────
  {
    id: 'finanzas', label: 'Finanzas & Contabilidad',
    items: [
      { path: '/bancos',                label: 'Bancos / Tesorería', codigo: 'CJ03' },
      { path: '/depositos',             label: 'Depósitos Bancarios', codigo: 'CJ04' },
      { path: '/cheques',               label: 'Cheques y Pagos', codigo: 'CJ05' },
      { path: '/datafono',              label: 'DataFono / Tarjetas', codigo: 'CJ06' },
      { path: '/divisas',               label: 'Divisas & Cambio', codigo: 'CJ07' },
      { path: '/contabilidad',          label: 'Asientos Contables', codigo: 'CT01' },
      { path: '/plan-cuentas',          label: 'Plan de Cuentas', codigo: 'CT02' },
      { path: '/configuracion-contable', label: 'Configuración Contable', codigo: 'CT03' },
      { path: '/libro-mayor',           label: 'Libro Mayor', codigo: 'CT04' },
      { path: '/balance-comprobacion',  label: 'Balance de Comprobación', codigo: 'CT05' },
      { path: '/reportes-financieros',  label: 'Estados Financieros', codigo: 'CT06' },
      { path: '/libro-ventas',          label: 'Libro de Ventas', codigo: 'CT07' },
      { path: '/periodo-contable',      label: 'Períodos Contables', codigo: 'CT08' },
      { path: '/presupuestos',          label: 'Presupuestos', codigo: 'CT09' },
      { path: '/activos-fijos',         label: 'Activos Fijos', codigo: 'CT10' },
      { path: '/centro-costos',         label: 'Centro de Costos', codigo: 'CT11' },
      { path: '/flujo-caja',            label: 'Flujo de Caja', codigo: 'CT12' },
      { path: '/distribucion-costos',   label: 'Distribución de Costos', codigo: 'CT13' },
    ],
  },

  // ─── FISCAL (DGII) ─────────────────────────────────────────────────────────
  {
    id: 'fiscal', label: 'Fiscal (DGII)', sectionLabel: 'GESTIÓN',
    items: [
      { path: '/ecf',                    label: 'e-CF — Panel DGII', codigo: 'FS01' },
      { path: '/ecf-recibidos',          label: 'e-CF Recibidos', codigo: 'FS02' },
      { path: '/declaraciones',          label: 'Declaraciones 606/607', codigo: 'FS05' },
      { path: '/retenciones',            label: 'Retenciones ISR', codigo: 'FS03' },
      { path: '/herramientas-fiscales',  label: 'Herramientas Fiscales', codigo: 'FS04' },
    ],
  },

  // ─── COMERCIAL & SERVICIOS ─────────────────────────────────────────────────
  {
    id: 'comercial', label: 'Comercial & Servicios',
    items: [
      { path: '/crm',           label: 'Leads & Oportunidades', codigo: 'CM01' },
      { path: '/vendedores',    label: 'Vendedores', codigo: 'CM02' },
      { path: '/comisiones',    label: 'Comisiones', codigo: 'CM03' },
      { path: '/licitaciones',  label: 'Licitaciones', codigo: 'CM04' },
      { path: '/encuestas',     label: 'Encuestas NPS/CSAT', codigo: 'CM05' },
      { path: '/proyectos',     label: 'Proyectos', codigo: 'CM06' },
      { path: '/contratos',     label: 'Contratos', codigo: 'CM07' },
      { path: '/servicios',     label: 'Órdenes de Servicio', codigo: 'CM08' },
      { path: '/mantenimiento', label: 'Mantenimiento', codigo: 'CM09' },
      { path: '/objetivos',     label: 'Objetivos OKR', codigo: 'CM10' },
    ],
  },

  // ─── RECURSOS HUMANOS ──────────────────────────────────────────────────────
  {
    id: 'rrhh', label: 'Recursos Humanos',
    items: [
      { path: '/nomina',          label: 'Nómina', codigo: 'RH01' },
      { path: '/portal-empleado', label: 'Portal Empleados', codigo: 'RH02' },
      { path: '/vacaciones',      label: 'Vacaciones y Permisos', codigo: 'RH03' },
      { path: '/tss',             label: 'TSS / Seguridad Social', codigo: 'RH04' },
      { path: '/isr',             label: 'ISR Empleados', codigo: 'RH05' },
      { path: '/evaluaciones',    label: 'Evaluaciones', codigo: 'RH06' },
      { path: '/capacitacion',    label: 'Capacitación', codigo: 'RH07' },
    ],
  },

  // ─── REPORTES & ANÁLISIS ───────────────────────────────────────────────────
  {
    id: 'reportes', label: 'Reportes & Análisis',
    items: [
      { path: '/reportes',           label: 'Reportes', codigo: 'RP01' },
      { path: '/analytics',          label: 'Business Intelligence', codigo: 'RP02' },
      { path: '/kpi',                label: 'KPI Ejecutivo', codigo: 'RP03' },
      { path: '/generador-reportes', label: 'Generador de Reportes', codigo: 'RP04' },
      { path: '/asistente',          label: 'Asistente IA', codigo: 'RP05' },
      { path: '/calendario',         label: 'Calendario de Obligaciones', codigo: 'RP06' },
    ],
  },

  // ─── SISTEMA ────────────────────────────────────────────────────────────────
  {
    id: 'sistema', label: 'Sistema',
    items: [
      { path: '/configuracion',  label: 'Configuración', codigo: 'AD01' },
      { path: '/mi-suscripcion', label: 'Mi Suscripción y Pagos', codigo: 'AD02' },
      { path: '/mis-empresas',   label: 'Empresas', codigo: 'AD03' },
      { path: '/sucursales',     label: 'Sucursales', codigo: 'AD04' },
      { path: '/equipo',         label: 'Usuarios y Roles', codigo: 'AD05' },
      { path: '/aprobaciones',   label: 'Aprobaciones', codigo: 'AD06' },
      { path: '/importacion',    label: 'Importación CSV', codigo: 'AD07' },
      { path: '/documentos',     label: 'Documentos', codigo: 'AD08' },
      { path: '/contactos',      label: 'Directorio', codigo: 'AD09' },
      { path: '/codigos-transaccion', label: 'Códigos de Transacción', codigo: 'AD90' },
      { path: '/notificaciones', label: 'Centro de Notificaciones', codigo: 'AD91' },
    ],
  },

  // ─── MÓDULOS ADD-ON ──────────────────────────────────────────────────────────
  {
    id: 'clinica', label: 'Clínica / Consultorio', sectionLabel: 'MÓDULOS ADD-ON',
    items: [
      { path: '/clinica',              label: 'Panel Clínica', codigo: 'CL01' },
      { path: '/clinica/pacientes',    label: 'Pacientes', codigo: 'CL02' },
      { path: '/clinica/agenda',       label: 'Agenda', codigo: 'CL03' },
      { path: '/clinica/sala-espera',  label: 'Sala de Espera', codigo: 'CL04' },
      { path: '/clinica/consultas',    label: 'Consultas', codigo: 'CL05' },
      { path: '/clinica/recetas',      label: 'Recetas', codigo: 'CL06' },
      { path: '/clinica/laboratorio',  label: 'Laboratorio', codigo: 'CL07' },
      { path: '/clinica/procedimientos', label: 'Procedimientos', codigo: 'CL08' },
      { path: '/clinica/ars',          label: 'ARS', codigo: 'CL09' },
      { path: '/clinica/medicos',      label: 'Médicos', codigo: 'CL10' },
      { path: '/clinica/catalogo',     label: 'Catálogo', codigo: 'CL11' },
      { path: '/clinica/reportes',     label: 'Reportes', codigo: 'CL12' },
    ],
  },
  {
    id: 'taller', label: 'Taller Mecánico',
    items: [
      { path: '/taller',           label: 'Panel Taller', codigo: 'TL01' },
      { path: '/taller/ordenes',   label: 'Órdenes de Servicio', codigo: 'TL02' },
      { path: '/taller/vehiculos', label: 'Vehículos', codigo: 'TL03' },
      { path: '/taller/tecnicos',  label: 'Técnicos', codigo: 'TL04' },
      { path: '/taller/agenda',    label: 'Agenda', codigo: 'TL05' },
      { path: '/taller/catalogo',  label: 'Catálogo', codigo: 'TL06' },
      { path: '/taller/reportes',  label: 'Reportes', codigo: 'TL07' },
    ],
  },
  {
    id: 'optica', label: 'Óptica',
    items: [
      { path: '/optica',           label: 'Panel Óptica', codigo: 'OP01' },
      { path: '/optica/pacientes', label: 'Pacientes', codigo: 'OP02' },
      { path: '/optica/medicos',   label: 'Médicos', codigo: 'OP03' },
      { path: '/optica/agenda',    label: 'Agenda', codigo: 'OP04' },
      { path: '/optica/consultas', label: 'Consultas', codigo: 'OP05' },
      { path: '/optica/recetas',   label: 'Recetas', codigo: 'OP06' },
      { path: '/optica/ordenes',   label: 'Órdenes de Trabajo', codigo: 'OP07' },
      { path: '/optica/ars',       label: 'Reclamaciones ARS', codigo: 'OP08' },
      { path: '/optica/inventario', label: 'Inventario', codigo: 'OP09' },
    ],
  },
  {
    id: 'farmacia', label: 'Farmacia',
    items: [
      { path: '/farmacia',               label: 'Panel Farmacia', codigo: 'FA01' },
      { path: '/farmacia/dispensacion',  label: 'Dispensación POS', codigo: 'FA02' },
      { path: '/farmacia/medicamentos',  label: 'Medicamentos', codigo: 'FA03' },
      { path: '/farmacia/lotes',         label: 'Lotes / Vencimientos', codigo: 'FA04' },
      { path: '/farmacia/recepciones',   label: 'Recepciones', codigo: 'FA05' },
      { path: '/farmacia/narcoticos',    label: 'Narcóticos / Psicotrópicos', codigo: 'FA06' },
      { path: '/farmacia/devoluciones',  label: 'Devoluciones', codigo: 'FA07' },
      { path: '/farmacia/ars',           label: 'Reclamaciones ARS', codigo: 'FA08' },
      { path: '/farmacia/reportes',      label: 'Reportes', codigo: 'FA09' },
    ],
  },
  {
    id: 'restaurante', label: 'Restaurante',
    items: [
      { path: '/restaurante',               label: 'Panel Restaurante', codigo: 'RS01' },
      { path: '/restaurante/mesas',         label: 'Mapa de Mesas', codigo: 'RS02' },
      { path: '/restaurante/kds',           label: 'Pantalla Cocina (KDS)', codigo: 'RS03' },
      { path: '/restaurante/delivery',      label: 'Delivery', codigo: 'RS04' },
      { path: '/restaurante/reservaciones', label: 'Reservaciones', codigo: 'RS05' },
      { path: '/restaurante/menu',          label: 'Gestión del Menú', codigo: 'RS06' },
      { path: '/restaurante/turnos',        label: 'Turnos', codigo: 'RS07' },
      { path: '/restaurante/reportes',      label: 'Reportes', codigo: 'RS08' },
    ],
  },
  {
    id: 'gimnasio', label: 'Gimnasio',
    items: [
      { path: '/gimnasio',              label: 'Panel Gimnasio', codigo: 'GM01' },
      { path: '/gimnasio/acceso',       label: 'Control de Acceso', codigo: 'GM02' },
      { path: '/gimnasio/miembros',     label: 'Miembros', codigo: 'GM03' },
      { path: '/gimnasio/membresias',   label: 'Membresías', codigo: 'GM04' },
      { path: '/gimnasio/clases',       label: 'Clases', codigo: 'GM05' },
      { path: '/gimnasio/entrenadores', label: 'Entrenadores', codigo: 'GM06' },
      { path: '/gimnasio/rutinas',      label: 'Rutinas', codigo: 'GM07' },
      { path: '/gimnasio/progreso',     label: 'Progreso', codigo: 'GM08' },
      { path: '/gimnasio/accesos',      label: 'Historial Accesos', codigo: 'GM09' },
      { path: '/gimnasio/lockers',      label: 'Lockers', codigo: 'GM10' },
      { path: '/gimnasio/nutricion',    label: 'Nutrición', codigo: 'GM11' },
      { path: '/gimnasio/tienda',       label: 'Tienda', codigo: 'GM12' },
      { path: '/gimnasio/reportes',     label: 'Reportes', codigo: 'GM13' },
    ],
  },
  {
    id: 'car_wash', label: 'Car Wash',
    items: [
      { path: '/car-wash/dashboard',       label: 'Dashboard', codigo: 'CW01' },
      { path: '/car-wash',                 label: 'Tablero', codigo: 'CW02' },
      { path: '/car-wash/recepcion',       label: 'Recepción', codigo: 'CW03' },
      { path: '/car-wash/servicios',       label: 'Servicios', codigo: 'CW04' },
      { path: '/car-wash/lavadores',       label: 'Lavadores', codigo: 'CW05' },
      { path: '/car-wash/pagos-lavadores', label: 'Pagos a lavadores', codigo: 'CW06' },
      { path: '/car-wash/config',          label: 'Configuración', codigo: 'CW07' },
    ],
  },
  {
    id: 'servicios_pro', label: 'Servicios Profesionales',
    items: [
      { path: '/servicios-pro',                label: 'Panel', codigo: 'SP01' },
      { path: '/servicios-pro/expedientes',    label: 'Expedientes', codigo: 'SP02' },
      { path: '/servicios-pro/time-tracker',   label: 'Time Tracker', codigo: 'SP03' },
      { path: '/servicios-pro/tareas',         label: 'Tareas', codigo: 'SP04' },
      { path: '/servicios-pro/reuniones',      label: 'Reuniones', codigo: 'SP05' },
      { path: '/servicios-pro/contratos',      label: 'Contratos', codigo: 'SP06' },
      { path: '/servicios-pro/honorarios',     label: 'Honorarios', codigo: 'SP07' },
      { path: '/servicios-pro/retainers',      label: 'Retainers', codigo: 'SP08' },
      { path: '/servicios-pro/profesionales',  label: 'Profesionales', codigo: 'SP09' },
      { path: '/servicios-pro/reportes',       label: 'Reportes', codigo: 'SP10' },
    ],
  },
  {
    id: 'prestamista', label: 'Prestamista / Financiera',
    items: [
      { path: '/prestamista',              label: 'Panel', codigo: 'PR01' },
      { path: '/prestamista/deudores',     label: 'Deudores', codigo: 'PR02' },
      { path: '/prestamista/solicitudes',  label: 'Solicitudes', codigo: 'PR03' },
      { path: '/prestamista/prestamos',    label: 'Préstamos', codigo: 'PR04' },
      { path: '/prestamista/simulador',    label: 'Simulador', codigo: 'PR05' },
      { path: '/prestamista/cobranza',     label: 'Cobranza', codigo: 'PR06' },
      { path: '/prestamista/vehiculos',    label: 'Vehículos', codigo: 'PR07' },
      { path: '/prestamista/productos',    label: 'Productos', codigo: 'PR08' },
      { path: '/prestamista/reportes',     label: 'Reportes', codigo: 'PR09' },
    ],
  },
  {
    id: 'agro', label: 'Agro / Finca',
    items: [
      { path: '/agro',            label: 'Panel', codigo: 'AG01' },
      { path: '/agro/fincas',     label: 'Fincas', codigo: 'AG02' },
      { path: '/agro/parcelas',   label: 'Parcelas', codigo: 'AG03' },
      { path: '/agro/cultivos',   label: 'Cultivos', codigo: 'AG04' },
      { path: '/agro/ciclos',     label: 'Ciclos', codigo: 'AG05' },
      { path: '/agro/cosechas',   label: 'Cosechas', codigo: 'AG06' },
      { path: '/agro/ganaderia',  label: 'Ganadería', codigo: 'AG07' },
      { path: '/agro/insumos',    label: 'Insumos', codigo: 'AG08' },
      { path: '/agro/maquinaria', label: 'Maquinaria', codigo: 'AG09' },
      { path: '/agro/reportes',   label: 'Reportes', codigo: 'AG10' },
    ],
  },
  {
    id: 'transporte', label: 'Transporte',
    items: [
      { path: '/transporte',               label: 'Panel', codigo: 'TR01' },
      { path: '/transporte/viajes',        label: 'Viajes', codigo: 'TR02' },
      { path: '/transporte/vehiculos',     label: 'Vehículos', codigo: 'TR03' },
      { path: '/transporte/choferes',      label: 'Choferes', codigo: 'TR04' },
      { path: '/transporte/combustible',   label: 'Combustible', codigo: 'TR05' },
      { path: '/transporte/mantenimiento', label: 'Mantenimiento', codigo: 'TR06' },
      { path: '/transporte/reportes',      label: 'Reportes', codigo: 'TR07' },
    ],
  },
  {
    id: 'educativo', label: 'Centro Educativo',
    items: [
      { path: '/educativo',              label: 'Panel', codigo: 'ED01' },
      { path: '/educativo/estudiantes',  label: 'Estudiantes', codigo: 'ED02' },
      { path: '/educativo/tutores',      label: 'Tutores', codigo: 'ED03' },
      { path: '/educativo/docentes',     label: 'Docentes', codigo: 'ED04' },
      { path: '/educativo/matriculas',   label: 'Matrículas', codigo: 'ED05' },
      { path: '/educativo/estructura',   label: 'Estructura', codigo: 'ED06' },
      { path: '/educativo/notas',        label: 'Calificaciones', codigo: 'ED07' },
      { path: '/educativo/boletines',    label: 'Boletines', codigo: 'ED08' },
      { path: '/educativo/asistencia',   label: 'Asistencia', codigo: 'ED09' },
      { path: '/educativo/colegiatura',  label: 'Colegiatura', codigo: 'ED10' },
      { path: '/educativo/becas',        label: 'Becas', codigo: 'ED11' },
      { path: '/educativo/pagos',        label: 'Pagos', codigo: 'ED12' },
      { path: '/educativo/disciplina',   label: 'Disciplina', codigo: 'ED13' },
      { path: '/educativo/biblioteca',   label: 'Biblioteca', codigo: 'ED14' },
      { path: '/educativo/transporte',   label: 'Transporte', codigo: 'ED15' },
      { path: '/educativo/comedor',      label: 'Comedor', codigo: 'ED16' },
      { path: '/educativo/enfermeria',   label: 'Enfermería', codigo: 'ED17' },
      { path: '/educativo/comunicados',  label: 'Comunicados', codigo: 'ED18' },
      { path: '/educativo/reportes',     label: 'Reportes', codigo: 'ED19' },
    ],
  },
];

// ── Sinónimos de búsqueda ──────────────────────────────────────────────────────
// Usados solo por el buscador global (CommandPalette) — el sidebar no los necesita.

/** Sinónimos para accesos rápidos (fuera de las categorías del menú). */
export const QUICK_ACCESS_KEYWORDS: Record<string, string[]> = {
  '/dashboard': ['dashboard', 'inicio', 'home', 'panel', 'resumen', 'kpi'],
  '/bandeja':   ['bandeja', 'mensajes', 'notificaciones', 'inbox', 'avisos'],
  '/xlink':     ['xlink', 'integracion', 'sincronizacion', 'conector', 'hicloud xlink'],
  '/pos':       ['pos', 'punto de venta', 'caja', 'venta', 'cobro', 'terminal', 'tienda', 'cashier'],
  '/caja':      ['caja', 'caja diaria', 'efectivo', 'arqueo', 'apertura', 'cierre', 'cash'],
};

/**
 * Sinónimos BÁSICOS por categoría de módulo add-on — se suman a los de cada
 * ítem individual (PATH_KEYWORDS) para que buscar "lavadero" encuentre
 * cualquier pantalla de Car Wash, sin tener que repetir el sinónimo en cada
 * una de sus ~7 pantallas.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  clinica:       ['clinica', 'consultorio', 'medico', 'doctor', 'salud', 'consulta medica'],
  taller:        ['taller', 'taller mecanico', 'mecanico', 'auto', 'reparacion vehiculo'],
  optica:        ['optica', 'lentes', 'gafas', 'vision', 'oftalmologia'],
  farmacia:      ['farmacia', 'medicamentos', 'botica', 'drogueria', 'pastillas'],
  restaurante:   ['restaurante', 'comida', 'menu', 'mesas', 'delivery', 'cocina'],
  gimnasio:      ['gimnasio', 'gym', 'fitness', 'membresia', 'entrenamiento', 'pesas'],
  car_wash:      ['car wash', 'lavadero', 'lavado de autos', 'autolavado', 'auto spa', 'lavar carro'],
  servicios_pro: ['servicios profesionales', 'consultoria', 'despacho', 'bufete', 'firma'],
  prestamista:   ['prestamista', 'prestamos', 'financiera', 'creditos', 'financiamiento'],
  agro:          ['agro', 'finca', 'agricultura', 'campo', 'cultivo', 'granja'],
  transporte:    ['transporte', 'flota', 'viajes', 'camiones', 'fleet'],
  educativo:     ['colegio', 'escuela', 'centro educativo', 'estudiantes', 'liceo'],
};

/** Sinónimos por ruta individual — módulos del núcleo (no add-on). */
export const PATH_KEYWORDS: Record<string, string[]> = {
  '/facturas':             ['facturas','factura','facturacion','invoice','comprobante','ecf','e-cf','fiscal','e31','e32'],
  '/cotizaciones':         ['cotizaciones','cotizacion','presupuesto','proforma','oferta','quote','propuesta'],
  '/pre-facturas':         ['pre-facturas','pre facturas','pre-factura','pedidos','orden venta'],
  '/pro-formas':           ['pro formas','proforma','oferta formal','quotation'],
  '/facturas-recurrentes': ['facturas recurrentes','facturacion recurrente','suscripcion','recurring','periodica'],
  '/notas-credito':        ['notas de credito','nota credito','e34','credito ventas','nc ventas','devolucion ventas'],
  '/notas-debito':         ['notas de debito','nota debito','e33','debito','ajuste cobrar'],
  '/devoluciones':         ['devoluciones','devolucion','retornos','returns','nc e34','reversal'],
  '/clientes':             ['clientes','cliente','customers','compradores','contacto de venta'],
  '/credito-cliente':      ['credito cliente','linea de credito','limite credito','credit line'],
  '/cxc':                  ['cuentas por cobrar','cobros','cxc','cartera','receivables','facturas pendientes cobro'],
  '/cuotas':               ['cuotas','plan de pago','pagos a plazos','financiamiento','installments'],
  '/recibos-cobro':        ['recibos de cobro','recibo de cobro','cobros','pagos clientes','registrar pago','abono','receipt'],
  '/anticipos-cliente':    ['anticipos','adelanto cliente','prepago','anticipo'],
  '/fidelidad':            ['fidelidad','puntos','programa puntos','lealtad','loyalty','rewards'],
  '/conduces':             ['conduces','conduce','entregas','despacho','delivery','guia de entrega','remision'],
  '/soporte/tickets':      ['soporte','tickets','ayuda','helpdesk','ticket soporte','incidencias'],

  '/solicitudes-compra':    ['solicitudes de compra','solicitud compra','requisicion','requerimiento','rfq'],
  '/compras':               ['compras','compra','ordenes de compra','orden de compra','purchase','pedidos proveedor'],
  '/proveedores':           ['proveedores','proveedor','supplier','abastecedores','partners'],
  '/cxp':                   ['cuentas por pagar','pagos','cxp','deudas','payables','facturas pendientes pago'],
  '/notas-credito-compras': ['notas credito compras','nc compras','devolucion proveedor','credito proveedor'],
  '/gastos':                ['gastos','gasto','gastos operativos','e43','expenses','egresos','desembolso'],
  '/caja-chica':            ['caja chica','caja menor','petty cash','gastos menores','fondo fijo'],

  '/productos':            ['productos','producto','articulos','items','catalogo','servicios','sku'],
  '/almacenes':            ['almacenes','almacen','bodegas','bodega','warehouse','transferencias almacen'],
  '/inventario':           ['inventario','stock','existencias','movimientos stock','entradas','salidas','warehouse'],
  '/conteo-inventario':    ['conteo inventario','conteo fisico','inventario fisico','toma de inventario','stocktaking'],
  '/uom':                  ['unidades de medida','uom','medidas','litros','kilos','cajas','unidades'],
  '/valoracion-stock':     ['valoracion stock','avco','costo promedio','costo inventario','stock valuation'],
  '/etiquetas':            ['etiquetas','etiqueta','qr','codigo barras','labels','impresion etiquetas'],
  '/wms':                  ['wms','warehouse management','picking','pack','ship','ordenes picking','gestion almacen'],
  '/manufactura':          ['manufactura','produccion','fabricacion','listas de materiales','bom','ordenes produccion'],
  '/planeacion-demanda':   ['planeacion demanda','proyeccion ventas','abastecimiento','forecast','demanda','reposicion stock'],
  '/flota':                ['flota','vehiculos','autos','camiones','transporte','fleet','gestion vehiculos'],

  '/bancos':               ['bancos','banco','tesoreria','conciliacion bancaria','cuentas bancarias','banking'],
  '/depositos':            ['depositos','deposito','deposito bancario','abono cuenta','bank deposit'],
  '/cheques':              ['cheques','cheque','pago con cheque','impresion cheques','checks'],
  '/datafono':             ['datafono','tarjetas','pos bancario','visa','mastercard','pagos electronicos'],
  '/divisas':              ['divisas','tasa de cambio','usd','dolar','euro','moneda extranjera','forex'],
  '/contabilidad':         ['asientos contables','contabilidad','libro diario','asiento','journal entry'],
  '/libro-mayor':          ['libro mayor','ledger','cuentas contables','mayor general','plan cuentas'],
  '/balance-comprobacion': ['balance comprobacion','trial balance','balanza comprobacion','saldos cuentas'],
  '/reportes-financieros': ['estados financieros','balance general','estado resultados','p&l','ganancias perdidas'],
  '/libro-ventas':         ['libro ventas','libro compras','606','607','608','dgii reportes','it-1','it-2'],
  '/periodo-contable':     ['periodo contable','periodos','cierre contable','apertura periodo','ejercicio fiscal'],
  '/presupuestos':         ['presupuestos','presupuesto','budget','planificacion financiera','forecast'],
  '/activos-fijos':        ['activos fijos','activo fijo','depreciacion','amortizacion','fixed assets'],
  '/centro-costos':        ['centro costos','centro de costos','cost center','distribucion costos'],
  '/flujo-caja':           ['flujo caja','cash flow','proyeccion efectivo','liquidez'],
  '/distribucion-costos':  ['distribucion costos','costos distribucion','imputacion costos'],

  '/ecf':                  ['ecf','e-cf','comprobantes fiscales','dgii','e31','e32','e33','e34','ncf','encf'],
  '/ecf-recibidos':        ['ecf recibidos','comprobantes recibidos','facturas proveedor ecf'],
  '/declaraciones':        ['declaraciones','dgii','it-1','ir-17','606','607','608','ir2','declaracion impuestos'],
  '/retenciones':          ['retenciones','retencion isr','retencion impuesto','withholding'],

  '/crm':          ['crm','leads','oportunidades','pipeline','prospectos','embudo ventas','funnel','seguimiento'],
  '/vendedores':   ['vendedores','vendedor','fuerza de ventas','sales rep','representante','agente'],
  '/comisiones':   ['comisiones','comision','comisiones vendedores','incentivos','bonus ventas'],
  '/licitaciones': ['licitaciones','licitacion','concurso','propuesta publica','bid','rfp'],
  '/encuestas':    ['encuestas','encuesta','nps','csat','satisfaccion cliente','feedback'],
  '/proyectos':    ['proyectos','proyecto','project','gestion proyectos','tareas','hitos','gantt'],
  '/contratos':    ['contratos','contrato','contract','acuerdo','convenio'],
  '/servicios':    ['servicios','servicio','ordenes servicio','orden servicio','mantenimiento cliente'],
  '/mantenimiento':['mantenimiento','equipos','maquinaria','preventivo','correctivo','orden mantenimiento'],
  '/objetivos':    ['objetivos','okr','metas','kpi objetivos','key results','goals'],

  '/nomina':          ['nomina','nominas','payroll','salarios','pago empleados','liquidacion nomina','recibo sueldo'],
  '/portal-empleado': ['portal empleado','self service empleado','mi portal','empleados portal'],
  '/vacaciones':      ['vacaciones','permisos','dias libres','ausencias','leave management'],
  '/tss':             ['tss','seguridad social','ley 87-01','sfs','afp','srl','infotep','aportes sociales'],
  '/isr':             ['isr','impuesto renta','ley 11-92','retencion isr','ir17','declaracion empleados'],
  '/evaluaciones':    ['evaluaciones','desempeno','performance','calificacion empleados','appraisal'],
  '/capacitacion':    ['capacitacion','entrenamiento','formacion','cursos','training','aprendizaje'],

  '/reportes':           ['reportes','reporte','informes','estadisticas','ventas reporte','606','607'],
  '/analytics':          ['analytics','business intelligence','bi','analisis','graficas','reportes avanzados'],
  '/kpi':                ['kpi','indicadores','metricas','performance','cuadro mando','ejecutivo dashboard'],
  '/generador-reportes': ['generador reportes','reportes personalizados','custom reports','crear reporte'],
  '/asistente':          ['asistente','ia','inteligencia artificial','chatgpt','claude','ai','assistant'],
  '/calendario':         ['calendario','obligaciones','fechas limite','vencimientos','dgii fechas'],

  '/configuracion':  ['configuracion','config','settings','ajustes','parametros','empresa configuracion','setup'],
  '/mi-suscripcion': ['suscripcion','pagos plan','facturacion hicloud','plan','upgrade','billing'],
  '/mis-empresas':   ['empresas','empresa','multi empresa','negocios','organizaciones','companies'],
  '/sucursales':     ['sucursales','sucursal','tiendas','puntos venta','branch','locations'],
  '/equipo':         ['usuarios','usuario','roles','permisos','accesos','equipo','users','staff'],
  '/aprobaciones':   ['aprobaciones','workflow','flujo aprobacion','autorizar','approve','solicitudes'],
  '/importacion':    ['importacion','importar','csv','excel','bulk upload','carga masiva','migracion datos'],
  '/documentos':     ['documentos','archivos','files','documentacion','adjuntos','storage'],
  '/contactos':      ['contactos','directorio','agenda','address book','personas','emails'],
  '/codigos-transaccion': ['codigos de transaccion','codigos','transacciones','sap','atajos','shortcuts'],
};

// ── Códigos de transacción con parámetro ───────────────────────────────────────
// Códigos que no mapean 1:1 a un MenuItemData — comparten ruta con otro ítem
// (ej. los tres formatos DGII viven en /declaraciones) o abren un documento
// específico de la empresa activa en vez de solo navegar a una pantalla.

export type ModoParametro = 'busqueda' | 'periodo' | 'ninguno';

export interface CodigoParametrizado {
  codigo: string;
  label:  string;
  path:   string;
  /** Rol/add-on se validan contra ESTA ruta (PATH_ROLES / ADDON_IDS), igual
   *  que un MenuItemData normal — comparten la misma pantalla. */
  modo:   ModoParametro;
  /** 'busqueda': tipo que devuelve /busqueda a resolver (factura/compra/producto). */
  tipoBusqueda?: string;
  /** 'periodo': query param ?tab= de DeclaracionesPage. */
  tab?: string;
  /** Texto de ayuda sobre qué espera el parámetro — se muestra en el buscador. */
  paramDescripcion: string;
}

export const CODIGOS_PARAMETRIZADOS: CodigoParametrizado[] = [
  { codigo: 'VT03', label: 'Consultar factura', path: '/facturas', modo: 'busqueda', tipoBusqueda: 'factura', paramDescripcion: 'folio o e-NCF' },
  { codigo: 'CP03', label: 'Consultar compra',  path: '/compras',  modo: 'busqueda', tipoBusqueda: 'compra',  paramDescripcion: 'folio' },
  { codigo: 'IN03', label: 'Consultar producto', path: '/productos', modo: 'busqueda', tipoBusqueda: 'producto', paramDescripcion: 'código, barras o SKU' },

  // DGII — número real del formulario cuando existe (606/607/608); IT-1 (FS11)
  // y sus anexos (FS12 del IT-1, FS21/22/23 del IR-2) usan 1x/2x porque FS01
  // ya está tomado por el Panel DGII. Las tres primeras llevan mes/año — sin
  // parámetro, DeclaracionesPage abre el mes anterior (ver ese componente).
  { codigo: 'FS06', label: 'Formato 606 — Compras y Gastos', path: '/declaraciones', modo: 'periodo', tab: 'f606', paramDescripcion: 'mes/año (ej. 09/2026) — sin parámetro, mes anterior' },
  { codigo: 'FS07', label: 'Formato 607 — Ventas',           path: '/declaraciones', modo: 'periodo', tab: 'f607', paramDescripcion: 'mes/año — sin parámetro, mes anterior' },
  { codigo: 'FS08', label: 'Formato 608 — Anulados',         path: '/declaraciones', modo: 'periodo', tab: 'f608', paramDescripcion: 'mes/año — sin parámetro, mes anterior' },
  { codigo: 'FS11', label: 'IT-1 — ITBIS mensual',           path: '/declaraciones', modo: 'periodo', tab: 'it1',  paramDescripcion: 'mes/año — sin parámetro, mes anterior' },
  { codigo: 'FS12', label: 'Anexo A (ITBIS) del IT-1',       path: '/declaraciones', modo: 'periodo', tab: 'anexo-a-itbis', paramDescripcion: 'mes/año — sin parámetro, mes anterior' },
  { codigo: 'FS21', label: 'Anexo A1 (IR-2)',                path: '/declaraciones', modo: 'periodo', tab: 'anexo-a1', paramDescripcion: 'año (opcional)' },
  { codigo: 'FS22', label: 'Anexo B1 (IR-2)',                path: '/declaraciones', modo: 'periodo', tab: 'anexo-b1', paramDescripcion: 'año (opcional)' },
  { codigo: 'FS23', label: 'Anexo D (IR-2)',                 path: '/declaraciones', modo: 'periodo', tab: 'anexo-d',  paramDescripcion: 'año (opcional)' },
  { codigo: 'FS30', label: 'Resumen Anual de Declaraciones', path: '/declaraciones', modo: 'ninguno', tab: 'anual',       paramDescripcion: '' },
  { codigo: 'FS31', label: 'Historial de Declaraciones',     path: '/declaraciones', modo: 'ninguno', tab: 'historial',   paramDescripcion: '' },
  { codigo: 'FS32', label: 'Conciliación Fiscal',            path: '/declaraciones', modo: 'ninguno', tab: 'conciliacion', paramDescripcion: '' },
];
