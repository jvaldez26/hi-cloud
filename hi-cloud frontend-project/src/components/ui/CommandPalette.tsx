import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Tag, Typography, Spin, Divider, theme } from 'antd';
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const { Text } = Typography;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NavItem {
  key:      string;
  label:    string;
  group:    string;
  emoji:    string;
  keywords: string[];  // ← nuevo: aliases de búsqueda
}

// ── Índice completo de módulos con keywords ───────────────────────────────────

const NAV_ITEMS: NavItem[] = [

  // ── PRINCIPAL ──────────────────────────────────────────────────────────────
  { key: '/dashboard',      label: 'Dashboard',              group: 'Principal',   emoji: '📊',
    keywords: ['dashboard','inicio','home','panel','inicio','resumen','kpi'] },
  { key: '/pos',            label: 'Punto de Venta',         group: 'Principal',   emoji: '⚡',
    keywords: ['pos','punto de venta','caja','venta','cobro','terminal','tienda','cashier'] },
  { key: '/caja',           label: 'Caja Diaria',            group: 'Principal',   emoji: '💵',
    keywords: ['caja','caja diaria','efectivo','arqueo','apertura','cierre','cash'] },

  // ── ACCIONES RÁPIDAS ───────────────────────────────────────────────────────
  { key: '/facturas/nueva',      label: 'Nueva Factura',       group: 'Acciones', emoji: '➕',
    keywords: ['nueva factura','crear factura','emitir factura','agregar factura'] },
  { key: '/compras/nueva',       label: 'Nueva Compra',        group: 'Acciones', emoji: '➕',
    keywords: ['nueva compra','crear compra','orden de compra'] },
  { key: '/cotizaciones/nueva',  label: 'Nueva Cotización',    group: 'Acciones', emoji: '➕',
    keywords: ['nueva cotizacion','crear cotizacion','nueva proforma'] },
  { key: '/clientes',            label: 'Nuevo Cliente',       group: 'Acciones', emoji: '➕',
    keywords: ['nuevo cliente','agregar cliente','crear cliente'] },

  // ── VENTAS ─────────────────────────────────────────────────────────────────
  { key: '/clientes',          label: 'Clientes',                    group: 'Ventas', emoji: '👥',
    keywords: ['clientes','cliente','customers','compradores','contacto de venta'] },
  { key: '/cotizaciones',      label: 'Cotizaciones',                group: 'Ventas', emoji: '📋',
    keywords: ['cotizaciones','cotizacion','presupuesto','proforma','oferta','quote','propuesta'] },
  { key: '/pre-facturas',      label: 'Pre-Facturas',               group: 'Ventas', emoji: '📄',
    keywords: ['pre-facturas','pre facturas','pre-factura','pedidos','orden venta'] },
  { key: '/facturas',          label: 'Facturas (e-CF)',             group: 'Ventas', emoji: '🧾',
    keywords: ['facturas','factura','facturacion','invoice','comprobante','ecf','e-cf','fiscal','e31','e32'] },
  { key: '/notas-debito',      label: 'Notas de Débito (E33)',       group: 'Ventas', emoji: '📤',
    keywords: ['notas de debito','nota debito','e33','debito','ajuste cobrar'] },
  { key: '/notas-credito',     label: 'Notas de Crédito Ventas (E34)', group: 'Ventas', emoji: '📥',
    keywords: ['notas de credito','nota credito','e34','credito ventas','nc ventas','devolucion ventas'] },
  { key: '/devoluciones',      label: 'Devoluciones',                group: 'Ventas', emoji: '↩️',
    keywords: ['devoluciones','devolucion','retornos','returns','nc e34','reversal'] },
  { key: '/conduces',          label: 'Conduces / Entregas',         group: 'Ventas', emoji: '🚚',
    keywords: ['conduces','conduce','entregas','despacho','delivery','guia de entrega','remision'] },
  { key: '/facturas-recurrentes', label: 'Facturación Recurrente',  group: 'Ventas', emoji: '🔄',
    keywords: ['facturas recurrentes','facturacion recurrente','suscripcion','recurring','periodica'] },
  { key: '/precios-especiales', label: 'Precios Especiales',        group: 'Ventas', emoji: '🏷️',
    keywords: ['precios especiales','lista de precios','tarifas','descuento cliente','pricing'] },
  { key: '/descuentos',        label: 'Descuentos Automáticos',     group: 'Ventas', emoji: '%',
    keywords: ['descuentos','descuento','promociones','rebaja','offerts','cupones'] },
  { key: '/fidelidad',         label: 'Fidelidad & Puntos',         group: 'Ventas', emoji: '⭐',
    keywords: ['fidelidad','puntos','programa puntos','lealtad','loyalty','rewards'] },
  { key: '/cuotas',            label: 'Cuotas / Planes de Pago',    group: 'Ventas', emoji: '📅',
    keywords: ['cuotas','plan de pago','pagos a plazos','financiamiento','cuotas cliente','installments'] },
  { key: '/credito-cliente',   label: 'Crédito al Cliente',         group: 'Ventas', emoji: '💳',
    keywords: ['credito cliente','linea de credito','limite credito','credit line'] },

  // ── CRM & COMERCIAL ────────────────────────────────────────────────────────
  { key: '/crm',               label: 'CRM — Leads & Oportunidades',group: 'CRM', emoji: '🎯',
    keywords: ['crm','leads','oportunidades','pipeline','prospectos','embudo ventas','funnel','seguimiento'] },
  { key: '/vendedores',        label: 'Vendedores',                  group: 'CRM', emoji: '👔',
    keywords: ['vendedores','vendedor','fuerza de ventas','sales rep','representante','agente'] },
  { key: '/comisiones',        label: 'Comisiones de Ventas',       group: 'CRM', emoji: '💰',
    keywords: ['comisiones','comision','comisiones vendedores','incentivos','bonus ventas'] },
  { key: '/licitaciones',      label: 'Licitaciones',               group: 'CRM', emoji: '📜',
    keywords: ['licitaciones','licitacion','concurso','propuesta publica','bid','rfp','gobierno'] },
  { key: '/encuestas',         label: 'Encuestas NPS/CSAT',         group: 'CRM', emoji: '📊',
    keywords: ['encuestas','encuesta','nps','csat','satisfaccion cliente','feedback','calificacion'] },

  // ── COMPRAS ────────────────────────────────────────────────────────────────
  { key: '/compras',            label: 'Órdenes de Compra',         group: 'Compras', emoji: '🛒',
    keywords: ['compras','compra','ordenes de compra','orden de compra','purchase','pedidos proveedor'] },
  { key: '/solicitudes-compra', label: 'Solicitudes de Compra',     group: 'Compras', emoji: '📝',
    keywords: ['solicitudes de compra','solicitud compra','requisicion','requerimiento','rfq','cotizacion proveedor'] },
  { key: '/proveedores',        label: 'Proveedores',               group: 'Compras', emoji: '🏭',
    keywords: ['proveedores','proveedor','supplier','abastecedores','vendedores externos','partners'] },
  { key: '/notas-credito-compras', label: 'NC de Compras',          group: 'Compras', emoji: '📥',
    keywords: ['notas credito compras','nc compras','devolucion proveedor','credito proveedor'] },
  { key: '/gastos',             label: 'Gastos Operativos',         group: 'Compras', emoji: '💸',
    keywords: ['gastos','gasto','gastos operativos','e43','expenses','egresos','desembolso','gasto menor'] },
  { key: '/caja-chica',         label: 'Caja Chica',               group: 'Compras', emoji: '🪙',
    keywords: ['caja chica','caja menor','petty cash','gastos menores','fondo fijo'] },

  // ── COBROS & PAGOS ─────────────────────────────────────────────────────────
  { key: '/cxc',               label: 'Cuentas por Cobrar',        group: 'Cobros & Pagos', emoji: '💰',
    keywords: ['cuentas por cobrar','cobros','cxc','cartera','receivables','facturas pendientes cobro','pendientes cobro'] },
  { key: '/recibos-cobro',     label: 'Recibos de Cobro',          group: 'Cobros & Pagos', emoji: '🧾',
    keywords: ['recibos de cobro','recibo de cobro','recibos de cobros','recibos cobros','recibos','cobros','pagos clientes','registrar pago','abono','receipt','pago recibido'] },
  { key: '/datafono',          label: 'DataFono / Tarjetas',       group: 'Cobros & Pagos', emoji: '💳',
    keywords: ['datafono','tarjetas','pos bancario','visa','mastercard','credito debito','pagos electronicos','terminal pago'] },
  { key: '/cxp',               label: 'Cuentas por Pagar',         group: 'Cobros & Pagos', emoji: '📤',
    keywords: ['cuentas por pagar','pagos','cxp','deudas','payables','facturas pendientes pago','obligaciones proveedor'] },
  { key: '/bancos',            label: 'Bancos / Tesorería',        group: 'Cobros & Pagos', emoji: '🏦',
    keywords: ['bancos','banco','tesoreria','conciliacion bancaria','cuentas bancarias','extracto bancario','banking'] },
  { key: '/depositos',         label: 'Depósitos Bancarios',       group: 'Cobros & Pagos', emoji: '🏧',
    keywords: ['depositos','deposito','deposito bancario','abono cuenta','bank deposit'] },
  { key: '/cheques',           label: 'Cheques y Pagos',           group: 'Cobros & Pagos', emoji: '📄',
    keywords: ['cheques','cheque','pago con cheque','impresion cheques','checks'] },
  { key: '/divisas',           label: 'Divisas & Tasas de Cambio', group: 'Cobros & Pagos', emoji: '💱',
    keywords: ['divisas','tasa de cambio','usd','dolar','euro','moneda extranjera','forex','tipo de cambio'] },

  // ── INVENTARIO & PRODUCCIÓN ────────────────────────────────────────────────
  { key: '/productos',          label: 'Productos',                group: 'Inventario', emoji: '📦',
    keywords: ['productos','producto','articulos','items','catalogo','servicios','sku','producto inventario'] },
  { key: '/grupos',             label: 'Grupos & Segmentos',       group: 'Inventario', emoji: '🏷️',
    keywords: ['grupos','grupo','segmentos','categorias producto','familias','clasificacion'] },
  { key: '/inventario',         label: 'Movimientos de Stock',     group: 'Inventario', emoji: '🗄️',
    keywords: ['inventario','stock','existencias','movimientos stock','entradas','salidas','almacen','bodega','warehouse'] },
  { key: '/conteo-inventario',  label: 'Conteo Físico',            group: 'Inventario', emoji: '🔢',
    keywords: ['conteo inventario','conteo fisico','inventario fisico','toma de inventario','stocktaking'] },
  { key: '/valoracion-stock',   label: 'Valoración AVCO',          group: 'Inventario', emoji: '📊',
    keywords: ['valoracion stock','avco','costo promedio','costo inventario','stock valuation'] },
  { key: '/almacenes',          label: 'Almacenes / Bodegas',      group: 'Inventario', emoji: '🏭',
    keywords: ['almacenes','almacen','bodegas','bodega','warehouse','transferencias almacen','ubicaciones'] },
  { key: '/wms',                label: 'WMS — Gestión de Almacén', group: 'Inventario', emoji: '📍',
    keywords: ['wms','warehouse management','picking','pack','ship','rutas recogida','ordenes picking','gestion almacen'] },
  { key: '/manufactura',        label: 'Manufactura & Producción', group: 'Inventario', emoji: '🏗️',
    keywords: ['manufactura','produccion','fabricacion','listas de materiales','bom','ordenes produccion','manufactura'] },
  { key: '/planeacion-demanda', label: 'Planeación de la Demanda', group: 'Inventario', emoji: '📈',
    keywords: ['planeacion demanda','proyeccion ventas','abastecimiento','forecast','demanda','reposicion stock'] },
  { key: '/etiquetas',          label: 'Etiquetas',                group: 'Inventario', emoji: '🔳',
    keywords: ['etiquetas','etiqueta','qr','codigo barras','labels','impresion etiquetas'] },

  // ── PROYECTOS & SERVICIOS ──────────────────────────────────────────────────
  { key: '/proyectos',    label: 'Proyectos',              group: 'Proyectos', emoji: '📁',
    keywords: ['proyectos','proyecto','project','gestion proyectos','tareas','hitos','gantt'] },
  { key: '/contratos',    label: 'Contratos',              group: 'Proyectos', emoji: '📜',
    keywords: ['contratos','contrato','contract','acuerdo','convenio','servicio contratado'] },
  { key: '/servicios',    label: 'Órdenes de Servicio',    group: 'Proyectos', emoji: '🔧',
    keywords: ['servicios','servicio','ordenes servicio','orden servicio','tickets','soporte tecnico','mantenimiento cliente'] },
  { key: '/mantenimiento', label: 'Mantenimiento de Equipos', group: 'Proyectos', emoji: '⚙️',
    keywords: ['mantenimiento','equipos','maquinaria','preventivo','correctivo','orden mantenimiento'] },
  { key: '/flota',        label: 'Flota de Vehículos',     group: 'Proyectos', emoji: '🚗',
    keywords: ['flota','vehiculos','autos','camiones','transporte','fleet','gestion vehiculos'] },
  { key: '/objetivos',    label: 'Objetivos OKR',          group: 'Proyectos', emoji: '🎯',
    keywords: ['objetivos','okr','metas','kpi objetivos','key results','goals'] },

  // ── RECURSOS HUMANOS ───────────────────────────────────────────────────────
  { key: '/nomina',          label: 'Nómina',               group: 'RRHH', emoji: '👤',
    keywords: ['nomina','nominas','payroll','salarios','pago empleados','liquidacion nomina','recibo sueldo'] },
  { key: '/portal-empleado', label: 'Portal Empleados',     group: 'RRHH', emoji: '🏠',
    keywords: ['portal empleado','self service empleado','mi portal','empleados portal'] },
  { key: '/vacaciones',      label: 'Vacaciones y Permisos',group: 'RRHH', emoji: '🏖️',
    keywords: ['vacaciones','permisos','dias libres','ausencias','leave management','dias libres empleado'] },
  { key: '/tss',             label: 'TSS / Seguridad Social',group: 'RRHH', emoji: '🏥',
    keywords: ['tss','seguridad social','ley 87-01','sfs','afp','srl','infotep','aportes sociales'] },
  { key: '/isr',             label: 'ISR Empleados',        group: 'RRHH', emoji: '📋',
    keywords: ['isr','impuesto renta','ley 11-92','retencion isr','ir17','declaracion empleados'] },
  { key: '/evaluaciones',    label: 'Evaluaciones de Desempeño', group: 'RRHH', emoji: '⭐',
    keywords: ['evaluaciones','desempeno','performance','calificacion empleados','appraisal'] },
  { key: '/capacitacion',    label: 'Capacitación',         group: 'RRHH', emoji: '🎓',
    keywords: ['capacitacion','entrenamiento','formacion','cursos','training','aprendizaje'] },

  // ── CONTABILIDAD & FISCAL ──────────────────────────────────────────────────
  { key: '/contabilidad',         label: 'Asientos Contables',      group: 'Contabilidad', emoji: '📒',
    keywords: ['asientos contables','contabilidad','libro diario','asiento','journal entry','mayor','contable'] },
  { key: '/libro-mayor',          label: 'Libro Mayor',             group: 'Contabilidad', emoji: '📗',
    keywords: ['libro mayor','ledger','cuentas contables','mayor general','plan cuentas'] },
  { key: '/balance-comprobacion', label: 'Balance de Comprobación', group: 'Contabilidad', emoji: '⚖️',
    keywords: ['balance comprobacion','trial balance','balanza comprobacion','saldos cuentas'] },
  { key: '/reportes-financieros', label: 'Estados Financieros',     group: 'Contabilidad', emoji: '📊',
    keywords: ['estados financieros','balance general','estado resultados','p&l','ganancias perdidas','flujo efectivo','financial statements'] },
  { key: '/libro-ventas',         label: 'Libro de Ventas & Compras', group: 'Contabilidad', emoji: '📔',
    keywords: ['libro ventas','libro compras','606','607','608','dgii reportes','it-1','it-2','it-3'] },
  { key: '/periodo-contable',     label: 'Períodos Contables',      group: 'Contabilidad', emoji: '📅',
    keywords: ['periodo contable','periodos','cierre contable','apertura periodo','ejercicio fiscal'] },
  { key: '/presupuestos',         label: 'Presupuestos',            group: 'Contabilidad', emoji: '💹',
    keywords: ['presupuestos','presupuesto','budget','planificacion financiera','forecast','proyeccion'] },
  { key: '/activos-fijos',        label: 'Activos Fijos',           group: 'Contabilidad', emoji: '🏢',
    keywords: ['activos fijos','activo fijo','depreciacion','amortizacion','fixed assets','propiedad planta equipo'] },
  { key: '/centro-costos',        label: 'Centro de Costos',        group: 'Contabilidad', emoji: '🎯',
    keywords: ['centro costos','centro de costos','cost center','distribucion costos','departamentos costos'] },
  { key: '/flujo-caja',           label: 'Flujo de Caja',           group: 'Contabilidad', emoji: '💧',
    keywords: ['flujo caja','cash flow','proyeccion efectivo','liquidez','flujo efectivo'] },
  { key: '/cuentas-estadisticas', label: 'Cuentas Estadísticas',    group: 'Contabilidad', emoji: '📈',
    keywords: ['cuentas estadisticas','kpi financiero','indicadores','estadisticas contables','metricas'] },
  { key: '/ecf',                  label: 'e-CF — Panel DGII',       group: 'Contabilidad', emoji: '🔒',
    keywords: ['ecf','e-cf','comprobantes fiscales','dgii','e31','e32','e33','e34','e41','e43','ncf','encf','comprobante fiscal electronico'] },
  { key: '/declaraciones',        label: 'Declaraciones DGII',      group: 'Contabilidad', emoji: '🏛️',
    keywords: ['declaraciones','dgii','it-1','ir-17','606','607','608','ir2','declaracion impuestos','tax return'] },
  { key: '/retenciones',          label: 'Retenciones ISR',         group: 'Contabilidad', emoji: '✂️',
    keywords: ['retenciones','retencion isr','retencion impuesto','withholding','isr pagado terceros'] },

  // ── ANÁLISIS & REPORTES ────────────────────────────────────────────────────
  { key: '/asistente',          label: '🤖 Asistente IA',          group: 'Análisis', emoji: '🤖',
    keywords: ['asistente','ia','inteligencia artificial','chatgpt','claude','ai','assistant','preguntas'] },
  { key: '/analytics',          label: 'Business Intelligence',    group: 'Análisis', emoji: '📈',
    keywords: ['analytics','business intelligence','bi','analisis','graficas','reportes avanzados','dashboard ejecutivo'] },
  { key: '/kpi',                label: 'KPI Ejecutivo',            group: 'Análisis', emoji: '🎯',
    keywords: ['kpi','indicadores','metricas','performance','cuadro mando','ejecutivo dashboard'] },
  { key: '/generador-reportes', label: 'Generador de Reportes',   group: 'Análisis', emoji: '📋',
    keywords: ['generador reportes','reportes personalizados','custom reports','crear reporte','exportar datos'] },
  { key: '/reportes',           label: 'Reportes',                 group: 'Análisis', emoji: '📊',
    keywords: ['reportes','reporte','informes','estadisticas','ventas reporte','606','607'] },
  { key: '/calendario',         label: 'Calendario de Obligaciones', group: 'Análisis', emoji: '📅',
    keywords: ['calendario','obligaciones','fechas limite','vencimientos','dgii fechas','fiscal calendar'] },

  // ── SISTEMA ────────────────────────────────────────────────────────────────
  { key: '/configuracion',  label: 'Configuración',          group: 'Sistema', emoji: '⚙️',
    keywords: ['configuracion','config','settings','ajustes','parametros','empresa configuracion','setup'] },
  { key: '/sucursales',     label: 'Sucursales',             group: 'Sistema', emoji: '🏪',
    keywords: ['sucursales','sucursal','tiendas','puntos venta','branch','locations'] },
  { key: '/equipo',         label: 'Usuarios y Roles',       group: 'Sistema', emoji: '👥',
    keywords: ['usuarios','usuario','roles','permisos','accesos','equipo','users','staff'] },
  { key: '/mis-empresas',   label: 'Mis Empresas',           group: 'Sistema', emoji: '🏢',
    keywords: ['empresas','empresa','multi empresa','negocios','organizaciones','companies'] },
  { key: '/aprobaciones',   label: 'Aprobaciones & Workflow', group: 'Sistema', emoji: '✅',
    keywords: ['aprobaciones','workflow','flujo aprobacion','autorizar','approve','solicitudes aprobacion'] },
  { key: '/documentos',     label: 'Documentos',             group: 'Sistema', emoji: '📁',
    keywords: ['documentos','archivos','files','documentacion','adjuntos','storage'] },
  { key: '/comunicaciones', label: 'WhatsApp & Mensajería',  group: 'Sistema', emoji: '💬',
    keywords: ['comunicaciones','whatsapp','mensajeria','notificaciones','sms','mensajes','messaging'] },
  { key: '/importacion',    label: 'Importación CSV',        group: 'Sistema', emoji: '📤',
    keywords: ['importacion','importar','csv','excel','bulk upload','carga masiva','migracion datos'] },
  { key: '/auditoria',      label: 'Auditoría',              group: 'Sistema', emoji: '🔍',
    keywords: ['auditoria','audit','logs','historial cambios','trazabilidad','registro actividad'] },
  { key: '/contactos',      label: 'Directorio de Contactos', group: 'Sistema', emoji: '📇',
    keywords: ['contactos','directorio','agenda','address book','personas','emails'] },
  { key: '/profile',        label: 'Mi Perfil',              group: 'Sistema', emoji: '👤',
    keywords: ['perfil','mi cuenta','mi perfil','profile','account','datos personales','cambiar contrasena'] },
];

// ── Colores por grupo ─────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  Principal: 'blue',  Acciones: 'volcano', Ventas: 'green',
  CRM: 'lime',        Compras: 'purple',   'Cobros & Pagos': 'gold',
  Inventario: 'cyan', Proyectos: 'geekblue', RRHH: 'magenta',
  Contabilidad: 'red', Análisis: 'blue',   Sistema: 'default',
};

const TIPO_EMOJI: Record<string, string> = {
  factura: '🧾', cliente: '👥', producto: '📦',
  proveedor: '🏭', compra: '🛒', cotizacion: '📋',
};

// ── Algoritmo de búsqueda mejorado ────────────────────────────────────────────

function buscarNav(query: string): NavItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return NAV_ITEMS.slice(0, 10);

  const scored = NAV_ITEMS.map(item => {
    const label = item.label.toLowerCase();
    const group = item.group.toLowerCase();
    const keys  = item.keywords;

    // Score: cuanto más alto, mejor coincidencia
    let score = 0;

    if (label === q)                                  score += 100; // exacto
    else if (label.startsWith(q))                     score += 80;  // inicio
    else if (label.includes(q))                       score += 60;  // contiene

    if (group.includes(q))                            score += 20;

    // Keywords — buscar en cada alias
    for (const kw of keys) {
      if (kw === q)                score += 90;
      else if (kw.startsWith(q))  score += 70;
      else if (kw.includes(q))    score += 50;
    }

    return { item, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.item)
    .slice(0, 12);
}

// ── Debounce ─────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 280): T {
  const [deb, setDeb] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void; }

export default function CommandPalette({ open, onClose }: Props) {
  const { token }               = theme.useToken();
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef                = useRef<HTMLInputElement>(null);
  const navigate                = useNavigate();

  const debouncedQuery = useDebounce(query.trim());
  const isSearching    = debouncedQuery.length >= 2;

  // Resultados del backend (registros de BD)
  const { data: backendResults, isFetching } = useQuery<Record<string, any[]>>({
    queryKey: ['busqueda-global', debouncedQuery],
    queryFn:  () => api.get(`/busqueda?q=${encodeURIComponent(debouncedQuery)}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  isSearching,
    staleTime: 5_000,
  });

  // Resultados de módulos (siempre se muestran, filtrados por score)
  const navResults = useMemo(() => buscarNav(query.trim()), [query]);

  // Lista plana para navegación con teclado
  const backendFlat = isSearching && backendResults
    ? Object.values(backendResults).flat().map(r => ({ ...r, isBackend: true }))
    : [];
  const navFlat = navResults.map(r => ({ ...r, isBackend: false }));
  const allFlat = [...navFlat, ...backendFlat];

  const go = useCallback((item: any) => {
    navigate(item.isBackend ? item.ruta : item.key);
    onClose();
    setQuery('');
  }, [navigate, onClose]);

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => { if (!open) { setQuery(''); setSelected(0); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allFlat.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && allFlat[selected]) go(allFlat[selected]);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, allFlat, selected, go, onClose]);

  if (!open) return null;

  const renderNavItem = (item: NavItem, idx: number) => (
    <div
      key={item.key}
      onClick={() => go({ ...item, isBackend: false })}
      onMouseEnter={() => setSelected(idx)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 14px', cursor: 'pointer',
        background: idx === selected ? token.colorFillSecondary : 'transparent',
        borderRadius: 6, margin: '1px 6px', transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 16, minWidth: 24, textAlign: 'center' }}>{item.emoji}</span>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.label}</Text>
      <Tag color={GROUP_COLORS[item.group] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>
        {item.group}
      </Tag>
      {idx === selected && <ArrowRightOutlined style={{ color: token.colorPrimary, fontSize: 10 }} />}
    </div>
  );

  const renderBackendItem = (item: any, flatIdx: number) => (
    <div
      key={`${item.tipo}-${item.id}`}
      onClick={() => go({ ...item, isBackend: true })}
      onMouseEnter={() => setSelected(flatIdx)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 14px', cursor: 'pointer',
        background: flatIdx === selected ? token.colorFillSecondary : 'transparent',
        borderRadius: 6, margin: '1px 6px', transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 16, minWidth: 24, textAlign: 'center' }}>
        {TIPO_EMOJI[item.tipo] ?? '📄'}
      </span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Text style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>{item.titulo}</Text>
        {item.subtitulo && (
          <Text type="secondary" style={{ fontSize: 11 }}>{item.subtitulo}</Text>
        )}
      </div>
      {item.extra && (
        <Tag style={{ fontSize: 10, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
          {item.extra}
        </Tag>
      )}
      {flatIdx === selected && <ArrowRightOutlined style={{ color: token.colorPrimary, fontSize: 10 }} />}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 100,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
        style={{
          width: 560, maxHeight: 560,
          borderRadius: 14, overflow: 'hidden',
          background: token.colorBgElevated,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          border: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Input ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
        }}>
          {isFetching
            ? <Spin size="small" style={{ flexShrink: 0 }} />
            : <SearchOutlined style={{ fontSize: 18, color: token.colorPrimary, flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar módulos, clientes, facturas, productos..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, background: 'transparent',
              color: token.colorText, fontFamily: 'Inter, sans-serif',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: token.colorTextQuaternary, fontSize: 16, lineHeight: 1, padding: 2,
              }}
            >×</button>
          )}
          <Tag style={{ cursor: 'default', fontSize: 10, flexShrink: 0, background: token.colorFillAlter, margin: 0 }}>
            Esc
          </Tag>
        </div>

        {/* ── Resultados ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>

          {/* ── Módulos / accesos rápidos — siempre visibles ── */}
          {navResults.length > 0 && (
            <>
              <div style={{ padding: '4px 16px 3px', fontSize: 10, fontWeight: 700, color: token.colorTextTertiary, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                {query.trim() ? 'Módulos' : 'Accesos rápidos'}
              </div>
              {navResults.map((item, idx) => renderNavItem(item, idx))}
            </>
          )}

          {/* ── Resultados del backend (registros) — solo cuando hay query ── */}
          {isSearching && backendResults && Object.keys(backendResults).length > 0 && (
            <>
              <Divider style={{ margin: '6px 0' }} />
              {Object.entries(backendResults).map(([categoria, items], catIdx) => {
                const offset = navResults.length +
                  (catIdx > 0 ? Object.values(backendResults).slice(0, catIdx).reduce((s, a) => s + a.length, 0) : 0);
                return (
                  <div key={categoria}>
                    {catIdx > 0 && <div style={{ height: 4 }} />}
                    <div style={{ padding: '2px 16px 3px', fontSize: 10, fontWeight: 700, color: token.colorTextTertiary, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                      {categoria}
                    </div>
                    {items.map((item: any, i: number) => renderBackendItem(item, offset + i))}
                  </div>
                );
              })}
            </>
          )}

          {/* Sin resultados — solo cuando no hay nada en ninguno de los dos lados */}
          {query.trim().length >= 2 && navResults.length === 0 && !isFetching &&
           (!backendResults || Object.keys(backendResults).length === 0) && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>🔍</span>
              <Text type="secondary">Sin resultados para "<strong>{query}</strong>"</Text>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '5px 16px',
          display: 'flex', gap: 16, alignItems: 'center',
          background: token.colorFillAlter,
        }}>
          {[
            { key: '↑↓', label: 'Navegar' },
            { key: '↵',  label: 'Abrir' },
            { key: 'Esc', label: 'Cerrar' },
          ].map(h => (
            <span key={h.key} style={{ fontSize: 11, color: token.colorTextSecondary }}>
              <kbd style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 4, padding: '1px 5px',
                fontFamily: 'monospace', fontSize: 10, marginRight: 4,
              }}>{h.key}</kbd>
              {h.label}
            </span>
          ))}
          <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 10 }}>
            {NAV_ITEMS.length} módulos indexados
          </Text>
        </div>
      </motion.div>
    </div>
  );
}
