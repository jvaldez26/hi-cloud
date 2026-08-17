/**
 * Claves válidas para videos tutoriales — fuente única de verdad.
 *
 * REGLA INVARIANTE: cada clave DEBE coincidir con el primer segmento de una
 * ruta registrada en App.tsx. El script scripts/check-video-modulos.mjs falla
 * en CI si detecta una clave sin ruta correspondiente.
 *
 * Cómo añadir una clave:
 *  1. Agrégala aquí.
 *  2. Confirma que App.tsx tiene <Route path="/tu-clave ..."/>.
 *  3. CI lo verifica automáticamente.
 *
 * Correcciones respecto a los nombres de carpeta originales:
 *   conduce      → conduces             (ruta real: /conduces)
 *   empresas     → mis-empresas         (ruta real: /mis-empresas)
 *   pre-factura  → pre-facturas         (ruta real: /pre-facturas)
 *   precios      → precios-especiales   (ruta real: /precios-especiales)
 *
 * Claves adicionales sin TableToolbar — botón añadido manualmente en esa pantalla:
 *   pos, dashboard, configuracion
 */
export const VIDEO_TUTORIAL_MODULOS = [
  // ── Pantallas sin TableToolbar (botón añadido manualmente) ────────────────
  'pos',               // /pos
  'dashboard',         // /dashboard
  'configuracion',     // /configuracion

  // ── Ventas ────────────────────────────────────────────────────────────────
  'clientes',          // /clientes
  'facturas',          // /facturas
  'cotizaciones',      // /cotizaciones
  'pre-facturas',      // /pre-facturas
  'pro-formas',        // /pro-formas
  'devoluciones',      // /devoluciones
  'notas-credito',     // /notas-credito
  'notas-debito',      // /notas-debito
  'conduces',          // /conduces

  // ── Compras ───────────────────────────────────────────────────────────────
  'compras',           // /compras
  'proveedores',       // /proveedores
  'solicitudes-compra',// /solicitudes-compra
  'notas-credito-compras', // /notas-credito-compras
  'retenciones',       // /retenciones
  'importacion',       // /importacion

  // ── Inventario ────────────────────────────────────────────────────────────
  'inventario',        // /inventario
  'almacenes',         // /almacenes
  'productos',         // /productos
  'precios-especiales',// /precios-especiales
  'valoracion-stock',  // /valoracion-stock
  'descuentos',        // /descuentos
  'etiquetas',         // /etiquetas
  'uom',               // /uom

  // ── Finanzas ──────────────────────────────────────────────────────────────
  'cxc',               // /cxc
  'cxp',               // /cxp
  'bancos',            // /bancos
  'cheques',           // /cheques
  'depositos',         // /depositos
  'tesoreria',         // /tesoreria
  'caja',              // /caja
  'caja-chica',        // /caja-chica
  'recibos-cobro',     // /recibos-cobro
  'anticipos-cliente', // /anticipos-cliente
  'credito-cliente',   // /credito-cliente
  'cuotas',            // /cuotas
  'comisiones',        // /comisiones
  'datafono',          // /datafono
  'divisas',           // /divisas

  // ── Contabilidad & Fiscal ─────────────────────────────────────────────────
  'contabilidad',      // /contabilidad
  'libro-mayor',       // /libro-mayor
  'libro-ventas',      // /libro-ventas
  'declaraciones',     // /declaraciones
  'isr',               // /isr
  'ecf',               // /ecf
  'reportes',          // /reportes
  'presupuestos',      // /presupuestos
  'centro-costos',     // /centro-costos

  // ── RRHH & Nómina ─────────────────────────────────────────────────────────
  'nomina',            // /nomina
  'vacaciones',        // /vacaciones
  'tss',               // /tss
  'evaluaciones',      // /evaluaciones
  'equipo',            // /equipo
  'capacitacion',      // /capacitacion

  // ── CRM & Gestión ─────────────────────────────────────────────────────────
  'crm',               // /crm
  'proyectos',         // /proyectos
  'contratos',         // /contratos
  'contactos',         // /contactos
  'licitaciones',      // /licitaciones
  'objetivos',         // /objetivos
  'encuestas',         // /encuestas
  'comunicaciones',    // /comunicaciones
  'fidelidad',         // /fidelidad
  'aprobaciones',      // /aprobaciones

  // ── Logística & Operaciones ───────────────────────────────────────────────
  'flota',             // /flota
  'mantenimiento',     // /mantenimiento
  'sucursales',        // /sucursales
  'documentos',        // /documentos
  'gastos',            // /gastos
  'activos-fijos',     // /activos-fijos
  'manufactura',       // /manufactura

  // ── Verticales especializados ─────────────────────────────────────────────
  'optica',            // /optica
  'taller',            // /taller
  'clinica',           // /clinica
  'farmacia',          // /farmacia
  'restaurante',       // /restaurante
  'gimnasio',          // /gimnasio
  'servicios-pro',     // /servicios-pro
  'prestamista',       // /prestamista
  'agro',              // /agro

  // ── Administración ────────────────────────────────────────────────────────
  'mis-empresas',      // /mis-empresas
  'auditoria',         // /auditoria
  'vendedores',        // /vendedores
  'servicios',         // /servicios
  'grupos',            // /grupos
  'cuentas-estadisticas', // /cuentas-estadisticas
] as const;

export type VideoTutorialModulo = typeof VIDEO_TUTORIAL_MODULOS[number];

/** Set para lookup O(1) — usado en el badge de huérfano del panel SuperAdmin */
export const VIDEO_TUTORIAL_MODULOS_SET = new Set<string>(
  VIDEO_TUTORIAL_MODULOS as unknown as string[],
);
