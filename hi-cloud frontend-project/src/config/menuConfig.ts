/**
 * Fuente única de verdad para rutas, permisos y categorías del menú.
 * Importado por AppLayout (añade íconos) Y por CommandPalette (filtrado por rol/add-on).
 * SIN imports de lucide ni de React — solo datos puros para evitar importaciones circulares.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MenuItemData {
  path:  string;
  label: string;
  /** Atajo de creación rápida asociado ("Nueva Factura" para /facturas, etc.) —
   *  el buscador global lo expone bajo "Acciones" con las mismas reglas de
   *  visibilidad que el ítem padre. */
  accionRapida?: { path: string; label: string };
}

export interface MenuCategoryData {
  id:            string;
  label:         string;
  sectionLabel?: string;   // separador visual "OPERACIONES", "GESTIÓN", etc.
  items:         MenuItemData[];
}

export interface QuickAccessItemData {
  path:  string;
  label: string;
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
  { path: '/dashboard', label: 'Inicio' },
  { path: '/bandeja',   label: 'Bandeja de entrada' },
  { path: '/xlink',     label: 'HiCloud Xlink' },
  { path: '/pos',       label: 'Punto de Venta' },
  { path: '/caja',      label: 'Caja Diaria' },
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
      { path: '/facturas',             label: 'Facturas', accionRapida: { path: '/facturas/nueva', label: 'Nueva Factura' } },
      { path: '/cotizaciones',         label: 'Cotizaciones', accionRapida: { path: '/cotizaciones/nueva', label: 'Nueva Cotización' } },
      { path: '/pre-facturas',         label: 'Pre-Facturas' },
      { path: '/pro-formas',           label: 'Pro Formas' },
      { path: '/facturas-recurrentes', label: 'Facturación Recurrente' },
      { path: '/notas-credito',        label: 'Notas de Crédito' },
      { path: '/notas-debito',         label: 'Notas de Débito' },
      { path: '/devoluciones',         label: 'Devoluciones' },
      { path: '/clientes',             label: 'Lista de Clientes' },
      { path: '/credito-cliente',      label: 'Crédito al Cliente' },
      { path: '/cxc',                  label: 'Cuentas por Cobrar' },
      { path: '/cuotas',               label: 'Cuotas / Pagos' },
      { path: '/recibos-cobro',        label: 'Recibos de Cobro' },
      { path: '/anticipos-cliente',    label: 'Anticipos de Clientes' },
      { path: '/fidelidad',            label: 'Fidelidad & Puntos' },
      { path: '/conduces',             label: 'Conduces / Entregas' },
      { path: '/soporte/tickets',      label: 'Tickets de Soporte' },
    ],
  },

  // ─── COMPRAS & GASTOS ──────────────────────────────────────────────────────
  {
    id: 'compras', label: 'Compras & Gastos',
    items: [
      { path: '/solicitudes-compra',    label: 'Solicitudes de Compra' },
      { path: '/compras',               label: 'Órdenes de Compra', accionRapida: { path: '/compras/nueva', label: 'Nueva Compra' } },
      { path: '/proveedores',           label: 'Proveedores' },
      { path: '/reposicion-proveedor',  label: 'Reposición por Proveedor' },
      { path: '/cxp',                   label: 'Cuentas por Pagar' },
      { path: '/notas-credito-compras', label: 'NC de Compras' },
      { path: '/gastos',                label: 'Gastos Operativos' },
      { path: '/caja-chica',            label: 'Caja Chica' },
    ],
  },

  // ─── INVENTARIO & LOGÍSTICA ────────────────────────────────────────────────
  {
    id: 'inventario', label: 'Inventario & Logística',
    items: [
      { path: '/productos',          label: 'Productos' },
      { path: '/almacenes',          label: 'Almacenes / Bodegas' },
      { path: '/inventario',         label: 'Movimientos de Stock' },
      { path: '/conteo-inventario',  label: 'Conteo Físico' },
      { path: '/uom',                label: 'Unidades de Medida' },
      { path: '/valoracion-stock',   label: 'Valoración AVCO' },
      { path: '/etiquetas',          label: 'Etiquetas' },
      { path: '/wms',                label: 'WMS — Almacén' },
      { path: '/manufactura',        label: 'Manufactura' },
      { path: '/planeacion-demanda', label: 'Planeación de Demanda' },
      { path: '/flota',              label: 'Flota de Vehículos' },
    ],
  },

  // ─── FINANZAS & CONTABILIDAD ───────────────────────────────────────────────
  {
    id: 'finanzas', label: 'Finanzas & Contabilidad',
    items: [
      { path: '/bancos',                label: 'Bancos / Tesorería' },
      { path: '/depositos',             label: 'Depósitos Bancarios' },
      { path: '/cheques',               label: 'Cheques y Pagos' },
      { path: '/datafono',              label: 'DataFono / Tarjetas' },
      { path: '/divisas',               label: 'Divisas & Cambio' },
      { path: '/contabilidad',          label: 'Asientos Contables' },
      { path: '/plan-cuentas',          label: 'Plan de Cuentas' },
      { path: '/configuracion-contable', label: 'Configuración Contable' },
      { path: '/libro-mayor',           label: 'Libro Mayor' },
      { path: '/balance-comprobacion',  label: 'Balance de Comprobación' },
      { path: '/reportes-financieros',  label: 'Estados Financieros' },
      { path: '/libro-ventas',          label: 'Libro de Ventas' },
      { path: '/periodo-contable',      label: 'Períodos Contables' },
      { path: '/presupuestos',          label: 'Presupuestos' },
      { path: '/activos-fijos',         label: 'Activos Fijos' },
      { path: '/centro-costos',         label: 'Centro de Costos' },
      { path: '/flujo-caja',            label: 'Flujo de Caja' },
      { path: '/distribucion-costos',   label: 'Distribución de Costos' },
    ],
  },

  // ─── FISCAL (DGII) ─────────────────────────────────────────────────────────
  {
    id: 'fiscal', label: 'Fiscal (DGII)', sectionLabel: 'GESTIÓN',
    items: [
      { path: '/ecf',                    label: 'e-CF — Panel DGII' },
      { path: '/ecf-recibidos',          label: 'e-CF Recibidos' },
      { path: '/declaraciones',          label: 'Declaraciones 606/607' },
      { path: '/retenciones',            label: 'Retenciones ISR' },
      { path: '/herramientas-fiscales',  label: 'Herramientas Fiscales' },
    ],
  },

  // ─── COMERCIAL & SERVICIOS ─────────────────────────────────────────────────
  {
    id: 'comercial', label: 'Comercial & Servicios',
    items: [
      { path: '/crm',           label: 'Leads & Oportunidades' },
      { path: '/vendedores',    label: 'Vendedores' },
      { path: '/comisiones',    label: 'Comisiones' },
      { path: '/licitaciones',  label: 'Licitaciones' },
      { path: '/encuestas',     label: 'Encuestas NPS/CSAT' },
      { path: '/proyectos',     label: 'Proyectos' },
      { path: '/contratos',     label: 'Contratos' },
      { path: '/servicios',     label: 'Órdenes de Servicio' },
      { path: '/mantenimiento', label: 'Mantenimiento' },
      { path: '/objetivos',     label: 'Objetivos OKR' },
    ],
  },

  // ─── RECURSOS HUMANOS ──────────────────────────────────────────────────────
  {
    id: 'rrhh', label: 'Recursos Humanos',
    items: [
      { path: '/nomina',          label: 'Nómina' },
      { path: '/portal-empleado', label: 'Portal Empleados' },
      { path: '/vacaciones',      label: 'Vacaciones y Permisos' },
      { path: '/tss',             label: 'TSS / Seguridad Social' },
      { path: '/isr',             label: 'ISR Empleados' },
      { path: '/evaluaciones',    label: 'Evaluaciones' },
      { path: '/capacitacion',    label: 'Capacitación' },
    ],
  },

  // ─── REPORTES & ANÁLISIS ───────────────────────────────────────────────────
  {
    id: 'reportes', label: 'Reportes & Análisis',
    items: [
      { path: '/reportes',           label: 'Reportes' },
      { path: '/analytics',          label: 'Business Intelligence' },
      { path: '/kpi',                label: 'KPI Ejecutivo' },
      { path: '/generador-reportes', label: 'Generador de Reportes' },
      { path: '/asistente',          label: 'Asistente IA' },
      { path: '/calendario',         label: 'Calendario de Obligaciones' },
    ],
  },

  // ─── SISTEMA ────────────────────────────────────────────────────────────────
  {
    id: 'sistema', label: 'Sistema',
    items: [
      { path: '/configuracion',  label: 'Configuración' },
      { path: '/mi-suscripcion', label: 'Mi Suscripción y Pagos' },
      { path: '/mis-empresas',   label: 'Empresas' },
      { path: '/sucursales',     label: 'Sucursales' },
      { path: '/equipo',         label: 'Usuarios y Roles' },
      { path: '/aprobaciones',   label: 'Aprobaciones' },
      { path: '/importacion',    label: 'Importación CSV' },
      { path: '/documentos',     label: 'Documentos' },
      { path: '/contactos',      label: 'Directorio' },
    ],
  },

  // ─── MÓDULOS ADD-ON ──────────────────────────────────────────────────────────
  {
    id: 'clinica', label: 'Clínica / Consultorio', sectionLabel: 'MÓDULOS ADD-ON',
    items: [
      { path: '/clinica',              label: 'Panel Clínica' },
      { path: '/clinica/pacientes',    label: 'Pacientes' },
      { path: '/clinica/agenda',       label: 'Agenda' },
      { path: '/clinica/sala-espera',  label: 'Sala de Espera' },
      { path: '/clinica/consultas',    label: 'Consultas' },
      { path: '/clinica/recetas',      label: 'Recetas' },
      { path: '/clinica/laboratorio',  label: 'Laboratorio' },
      { path: '/clinica/procedimientos', label: 'Procedimientos' },
      { path: '/clinica/ars',          label: 'ARS' },
      { path: '/clinica/medicos',      label: 'Médicos' },
      { path: '/clinica/catalogo',     label: 'Catálogo' },
      { path: '/clinica/reportes',     label: 'Reportes' },
    ],
  },
  {
    id: 'taller', label: 'Taller Mecánico',
    items: [
      { path: '/taller',           label: 'Panel Taller' },
      { path: '/taller/ordenes',   label: 'Órdenes de Servicio' },
      { path: '/taller/vehiculos', label: 'Vehículos' },
      { path: '/taller/tecnicos',  label: 'Técnicos' },
      { path: '/taller/agenda',    label: 'Agenda' },
      { path: '/taller/catalogo',  label: 'Catálogo' },
      { path: '/taller/reportes',  label: 'Reportes' },
    ],
  },
  {
    id: 'optica', label: 'Óptica',
    items: [
      { path: '/optica',           label: 'Panel Óptica' },
      { path: '/optica/pacientes', label: 'Pacientes' },
      { path: '/optica/medicos',   label: 'Médicos' },
      { path: '/optica/agenda',    label: 'Agenda' },
      { path: '/optica/consultas', label: 'Consultas' },
      { path: '/optica/recetas',   label: 'Recetas' },
      { path: '/optica/ordenes',   label: 'Órdenes de Trabajo' },
      { path: '/optica/ars',       label: 'Reclamaciones ARS' },
      { path: '/optica/inventario', label: 'Inventario' },
    ],
  },
  {
    id: 'farmacia', label: 'Farmacia',
    items: [
      { path: '/farmacia',               label: 'Panel Farmacia' },
      { path: '/farmacia/dispensacion',  label: 'Dispensación POS' },
      { path: '/farmacia/medicamentos',  label: 'Medicamentos' },
      { path: '/farmacia/lotes',         label: 'Lotes / Vencimientos' },
      { path: '/farmacia/recepciones',   label: 'Recepciones' },
      { path: '/farmacia/narcoticos',    label: 'Narcóticos / Psicotrópicos' },
      { path: '/farmacia/devoluciones',  label: 'Devoluciones' },
      { path: '/farmacia/ars',           label: 'Reclamaciones ARS' },
      { path: '/farmacia/reportes',      label: 'Reportes' },
    ],
  },
  {
    id: 'restaurante', label: 'Restaurante',
    items: [
      { path: '/restaurante',               label: 'Panel Restaurante' },
      { path: '/restaurante/mesas',         label: 'Mapa de Mesas' },
      { path: '/restaurante/kds',           label: 'Pantalla Cocina (KDS)' },
      { path: '/restaurante/delivery',      label: 'Delivery' },
      { path: '/restaurante/reservaciones', label: 'Reservaciones' },
      { path: '/restaurante/menu',          label: 'Gestión del Menú' },
      { path: '/restaurante/turnos',        label: 'Turnos' },
      { path: '/restaurante/reportes',      label: 'Reportes' },
    ],
  },
  {
    id: 'gimnasio', label: 'Gimnasio',
    items: [
      { path: '/gimnasio',              label: 'Panel Gimnasio' },
      { path: '/gimnasio/acceso',       label: 'Control de Acceso' },
      { path: '/gimnasio/miembros',     label: 'Miembros' },
      { path: '/gimnasio/membresias',   label: 'Membresías' },
      { path: '/gimnasio/clases',       label: 'Clases' },
      { path: '/gimnasio/entrenadores', label: 'Entrenadores' },
      { path: '/gimnasio/rutinas',      label: 'Rutinas' },
      { path: '/gimnasio/progreso',     label: 'Progreso' },
      { path: '/gimnasio/accesos',      label: 'Historial Accesos' },
      { path: '/gimnasio/lockers',      label: 'Lockers' },
      { path: '/gimnasio/nutricion',    label: 'Nutrición' },
      { path: '/gimnasio/tienda',       label: 'Tienda' },
      { path: '/gimnasio/reportes',     label: 'Reportes' },
    ],
  },
  {
    id: 'car_wash', label: 'Car Wash',
    items: [
      { path: '/car-wash/dashboard',       label: 'Dashboard' },
      { path: '/car-wash',                 label: 'Tablero' },
      { path: '/car-wash/recepcion',       label: 'Recepción' },
      { path: '/car-wash/servicios',       label: 'Servicios' },
      { path: '/car-wash/lavadores',       label: 'Lavadores' },
      { path: '/car-wash/pagos-lavadores', label: 'Pagos a lavadores' },
      { path: '/car-wash/config',          label: 'Configuración' },
    ],
  },
  {
    id: 'servicios_pro', label: 'Servicios Profesionales',
    items: [
      { path: '/servicios-pro',                label: 'Panel' },
      { path: '/servicios-pro/expedientes',    label: 'Expedientes' },
      { path: '/servicios-pro/time-tracker',   label: 'Time Tracker' },
      { path: '/servicios-pro/tareas',         label: 'Tareas' },
      { path: '/servicios-pro/reuniones',      label: 'Reuniones' },
      { path: '/servicios-pro/contratos',      label: 'Contratos' },
      { path: '/servicios-pro/honorarios',     label: 'Honorarios' },
      { path: '/servicios-pro/retainers',      label: 'Retainers' },
      { path: '/servicios-pro/profesionales',  label: 'Profesionales' },
      { path: '/servicios-pro/reportes',       label: 'Reportes' },
    ],
  },
  {
    id: 'prestamista', label: 'Prestamista / Financiera',
    items: [
      { path: '/prestamista',              label: 'Panel' },
      { path: '/prestamista/deudores',     label: 'Deudores' },
      { path: '/prestamista/solicitudes',  label: 'Solicitudes' },
      { path: '/prestamista/prestamos',    label: 'Préstamos' },
      { path: '/prestamista/simulador',    label: 'Simulador' },
      { path: '/prestamista/cobranza',     label: 'Cobranza' },
      { path: '/prestamista/vehiculos',    label: 'Vehículos' },
      { path: '/prestamista/productos',    label: 'Productos' },
      { path: '/prestamista/reportes',     label: 'Reportes' },
    ],
  },
  {
    id: 'agro', label: 'Agro / Finca',
    items: [
      { path: '/agro',            label: 'Panel' },
      { path: '/agro/fincas',     label: 'Fincas' },
      { path: '/agro/parcelas',   label: 'Parcelas' },
      { path: '/agro/cultivos',   label: 'Cultivos' },
      { path: '/agro/ciclos',     label: 'Ciclos' },
      { path: '/agro/cosechas',   label: 'Cosechas' },
      { path: '/agro/ganaderia',  label: 'Ganadería' },
      { path: '/agro/insumos',    label: 'Insumos' },
      { path: '/agro/maquinaria', label: 'Maquinaria' },
      { path: '/agro/reportes',   label: 'Reportes' },
    ],
  },
  {
    id: 'transporte', label: 'Transporte',
    items: [
      { path: '/transporte',               label: 'Panel' },
      { path: '/transporte/viajes',        label: 'Viajes' },
      { path: '/transporte/vehiculos',     label: 'Vehículos' },
      { path: '/transporte/choferes',      label: 'Choferes' },
      { path: '/transporte/combustible',   label: 'Combustible' },
      { path: '/transporte/mantenimiento', label: 'Mantenimiento' },
      { path: '/transporte/reportes',      label: 'Reportes' },
    ],
  },
  {
    id: 'educativo', label: 'Centro Educativo',
    items: [
      { path: '/educativo',              label: 'Panel' },
      { path: '/educativo/estudiantes',  label: 'Estudiantes' },
      { path: '/educativo/tutores',      label: 'Tutores' },
      { path: '/educativo/docentes',     label: 'Docentes' },
      { path: '/educativo/matriculas',   label: 'Matrículas' },
      { path: '/educativo/estructura',   label: 'Estructura' },
      { path: '/educativo/notas',        label: 'Calificaciones' },
      { path: '/educativo/boletines',    label: 'Boletines' },
      { path: '/educativo/asistencia',   label: 'Asistencia' },
      { path: '/educativo/colegiatura',  label: 'Colegiatura' },
      { path: '/educativo/becas',        label: 'Becas' },
      { path: '/educativo/pagos',        label: 'Pagos' },
      { path: '/educativo/disciplina',   label: 'Disciplina' },
      { path: '/educativo/biblioteca',   label: 'Biblioteca' },
      { path: '/educativo/transporte',   label: 'Transporte' },
      { path: '/educativo/comedor',      label: 'Comedor' },
      { path: '/educativo/enfermeria',   label: 'Enfermería' },
      { path: '/educativo/comunicados',  label: 'Comunicados' },
      { path: '/educativo/reportes',     label: 'Reportes' },
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
};
