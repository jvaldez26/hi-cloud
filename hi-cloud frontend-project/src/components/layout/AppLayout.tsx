import { useEffect, useState, useCallback, useRef, createContext, useContext, Suspense } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import {
  Layout, Avatar, Dropdown, Typography, Badge, Space,
  Button, Tooltip, theme, Select, Tag, Modal,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import {
  LogoutOutlined, UserOutlined, BellOutlined,
  MoonOutlined, SunOutlined, SearchOutlined,
} from '@ant-design/icons';
import {
  LayoutDashboard, ShoppingCart, Wallet, TrendingUp, Package,
  Boxes, Briefcase, Users, BarChart3, Settings, ChevronDown,
  Menu, HelpCircle, Building2, CreditCard, Receipt,
  FileText, BookOpen, PieChart, Database, Truck,
  UserCheck, Calculator, Shield, Bell, Globe,
  Factory, Target, Banknote, ClipboardList, Tags,
  X, Lock,
  type LucideIcon,
} from 'lucide-react';
import { usePlan, type PlanTipo } from '../../hooks/usePlan';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore }  from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import CommandPalette    from '../ui/CommandPalette';
import PageTransition    from '../ui/PageTransition';
import PlanBanner        from '../ui/PlanBanner';
import OnboardingTour    from '../ui/OnboardingTour';
import HelpCenter        from '../ui/HelpCenter';
import { useRealtime, useRealtimeStatus } from '../../hooks/useRealtime';
import { useAlertas }    from '../../hooks/useAlertas';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const { Header, Content } = Layout;
const { Text } = Typography;

// ── Paletas de colores del sidebar ───────────────────────────────────────────

type SidebarPalette = {
  bg: string; bgHover: string; bgActive: string; border: string;
  separator: string; text: string; textActive: string;
  textCategory: string; textSub: string; textSubHover: string;
  accent: string; footerText: string; scrollbar: string;
  panelBg: string; panelBorder: string;
};

// Modo claro — azul corporativo (referencia Cashflow)
// Contraste verificado sobre bg #1854D8:
//   #FFFFFF       → 6.4:1 ✅  (texto principal)
//   #E2E8F0       → 5.2:1 ✅  (subítems)
//   #BFDBFE       → 4.5:1 ✅  (categorías / footer)
//   #93C5FD       → 4.8:1 ✅  (acento / íconos activos)
const sidebarLight: SidebarPalette = {
  bg:           '#1854D8',
  bgHover:      'rgba(255,255,255,0.13)', // hover blanco suave sobre azul
  bgActive:     '#1D4ED8',                // azul más oscuro — contraste claro
  border:       'rgba(255,255,255,0.15)',
  separator:    'rgba(255,255,255,0.15)',
  text:         '#FFFFFF',                // 6.4:1 ✅
  textActive:   '#FFFFFF',
  textCategory: '#BFDBFE',               // azul-200 → 4.5:1 ✅ (era 0.55 opacity ~3.1:1)
  textSub:      '#E2E8F0',               // slate-200 → 5.2:1 ✅ (era 0.65 opacity ~3.7:1)
  textSubHover: '#FFFFFF',
  accent:       '#93C5FD',               // blue-300 → 4.8:1 ✅
  footerText:   '#BFDBFE',               // 4.5:1 ✅ (era 0.35 opacity ~2.4:1)
  scrollbar:    'rgba(255,255,255,0.20)',
  panelBg:      '#1648C2',
  panelBorder:  'rgba(255,255,255,0.15)',
};

// Modo oscuro — navy profundo con acentos azules
const sidebarDark: SidebarPalette = {
  bg:           '#0F172A',
  bgHover:      '#1E293B',
  bgActive:     'rgba(30,64,175,0.35)',
  border:       '#1E293B',
  separator:    'rgba(148,163,184,0.08)',
  text:         '#CBD5E1',
  textActive:   '#FFFFFF',
  textCategory: '#64748B',
  textSub:      '#94A3B8',
  textSubHover: '#F1F5F9',
  accent:       '#3B82F6',
  footerText:   '#475569',
  scrollbar:    '#1E293B',
  panelBg:      '#1E293B',
  panelBorder:  '#334155',
};

// Contexto de tema del sidebar — inyectado una vez en AppLayout
const SidebarCtx = createContext<SidebarPalette>(sidebarDark);
const useC = () => useContext(SidebarCtx);

// ── Estructura de navegación ──────────────────────────────────────────────────

interface QuickItem {
  path:   string;
  label:  string;
  Icon:   LucideIcon;
  badge?: string;
}

interface SubItem {
  path:  string;
  label: string;
}

interface MenuCategory {
  id:    string;
  label: string;
  Icon:  LucideIcon;
  items: SubItem[];
}

const QUICK_ITEMS: QuickItem[] = [
  { path: '/dashboard', label: 'Dashboard',      Icon: LayoutDashboard },
  { path: '/pos',       label: 'Punto de Venta', Icon: ShoppingCart,    badge: 'POS' },
  { path: '/caja',      label: 'Caja Diaria',    Icon: Wallet },
];

const MENU_CATEGORIES: MenuCategory[] = [
  // ── 1. VENTAS ──────────────────────────────────────────────────────────────
  {
    id: 'ventas', label: 'Ventas', Icon: TrendingUp,
    items: [
      { path: '/clientes',             label: 'Clientes' },
      { path: '/cotizaciones',         label: 'Cotizaciones' },
      { path: '/pre-facturas',         label: 'Pre-Facturas' },
      { path: '/facturas',             label: 'Facturas (e-CF)' },
      { path: '/notas-debito',         label: 'Notas de Débito (E33)' },
      { path: '/notas-credito',        label: 'Notas de Crédito (E34)' },
      { path: '/devoluciones',         label: 'Devoluciones' },
      { path: '/conduces',             label: 'Conduces / Entregas' },
      { path: '/facturas-recurrentes', label: 'Facturación Recurrente' },
      { path: '/precios-especiales',   label: 'Precios Especiales' },
      { path: '/descuentos',           label: 'Descuentos Automáticos' },
      { path: '/fidelidad',            label: 'Fidelidad & Puntos' },
      { path: '/cuotas',               label: 'Cuotas / Planes de Pago' },
      { path: '/credito-cliente',      label: 'Crédito al Cliente' },
    ],
  },

  // ── 2. CRM & COMERCIAL ─────────────────────────────────────────────────────
  {
    id: 'crm', label: 'CRM & Comercial', Icon: Target,
    items: [
      { path: '/crm',          label: 'CRM — Leads & Oportunidades' },
      { path: '/vendedores',   label: 'Vendedores' },
      { path: '/comisiones',   label: 'Comisiones de Ventas' },
      { path: '/licitaciones', label: 'Licitaciones' },
      { path: '/encuestas',    label: 'Encuestas NPS/CSAT' },
    ],
  },

  // ── 3. COMPRAS ─────────────────────────────────────────────────────────────
  {
    id: 'compras', label: 'Compras', Icon: ClipboardList,
    items: [
      { path: '/compras',               label: 'Órdenes de Compra' },
      { path: '/solicitudes-compra',    label: 'Solicitudes de Compra' },
      { path: '/proveedores',           label: 'Proveedores' },
      { path: '/notas-credito-compras', label: 'NC de Compras' },
      { path: '/gastos',                label: 'Gastos Operativos' },
      { path: '/caja-chica',            label: 'Caja Chica' },
    ],
  },

  // ── 4. COBROS & PAGOS ──────────────────────────────────────────────────────
  {
    id: 'cobrospagos', label: 'Cobros & Pagos', Icon: CreditCard,
    items: [
      { path: '/cxc',           label: 'Cuentas por Cobrar' },
      { path: '/recibos-cobro', label: 'Recibos de Cobro' },
      { path: '/datafono',      label: 'DataFono / Tarjetas' },
      { path: '/cxp',           label: 'Cuentas por Pagar' },
      { path: '/bancos',        label: 'Bancos / Tesorería' },
      { path: '/depositos',     label: 'Depósitos Bancarios' },
      { path: '/cheques',       label: 'Cheques y Pagos' },
      { path: '/divisas',       label: 'Divisas & Tasas de Cambio' },
    ],
  },

  // ── 5. INVENTARIO & PRODUCCIÓN ─────────────────────────────────────────────
  {
    id: 'inventario', label: 'Inventario & Producción', Icon: Boxes,
    items: [
      { path: '/productos',          label: 'Productos' },
      { path: '/grupos',             label: 'Grupos & Segmentos' },
      { path: '/inventario',         label: 'Movimientos de Stock' },
      { path: '/conteo-inventario',  label: 'Conteo Físico' },
      { path: '/valoracion-stock',   label: 'Valoración AVCO' },
      { path: '/almacenes',          label: 'Almacenes / Bodegas' },
      { path: '/wms',                label: 'WMS — Gestión de Almacén' },
      { path: '/manufactura',        label: 'Manufactura & Producción' },
      { path: '/planeacion-demanda', label: 'Planeación de la Demanda' },
      { path: '/uom',                label: 'Unidades de Medida' },
      { path: '/etiquetas',          label: 'Etiquetas QR' },
    ],
  },

  // ── 6. PROYECTOS & SERVICIOS ───────────────────────────────────────────────
  {
    id: 'proyectos', label: 'Proyectos & Servicios', Icon: Briefcase,
    items: [
      { path: '/proyectos',    label: 'Proyectos' },
      { path: '/contratos',    label: 'Contratos' },
      { path: '/servicios',    label: 'Órdenes de Servicio' },
      { path: '/mantenimiento', label: 'Mantenimiento de Equipos' },
      { path: '/flota',        label: 'Flota de Vehículos' },
      { path: '/objetivos',    label: 'Objetivos OKR' },
    ],
  },

  // ── 7. RECURSOS HUMANOS ────────────────────────────────────────────────────
  {
    id: 'rrhh', label: 'Recursos Humanos', Icon: Users,
    items: [
      { path: '/nomina',          label: 'Nómina' },
      { path: '/portal-empleado', label: 'Portal Empleados' },
      { path: '/vacaciones',      label: 'Vacaciones y Permisos' },
      { path: '/tss',             label: 'TSS / Seguridad Social' },
      { path: '/isr',             label: 'ISR Empleados' },
      { path: '/evaluaciones',    label: 'Evaluaciones de Desempeño' },
      { path: '/capacitacion',    label: 'Capacitación' },
    ],
  },

  // ── 8. CONTABILIDAD & FISCAL ───────────────────────────────────────────────
  {
    id: 'contabilidad', label: 'Contabilidad & Fiscal', Icon: BookOpen,
    items: [
      { path: '/contabilidad',         label: 'Asientos Contables' },
      { path: '/libro-mayor',          label: 'Libro Mayor' },
      { path: '/balance-comprobacion', label: 'Balance de Comprobación' },
      { path: '/reportes-financieros', label: 'Estados Financieros' },
      { path: '/libro-ventas',         label: 'Libro de Ventas & Compras' },
      { path: '/periodo-contable',     label: 'Períodos Contables' },
      { path: '/presupuestos',         label: 'Presupuestos' },
      { path: '/activos-fijos',        label: 'Activos Fijos' },
      { path: '/centro-costos',        label: 'Centro de Costos' },
      { path: '/flujo-caja',           label: 'Flujo de Caja' },
      { path: '/cuentas-estadisticas', label: 'Cuentas Estadísticas' },
      { path: '/distribucion-costos',  label: 'Distribución de Costos' },
      { path: '/ecf',                  label: 'e-CF — Panel DGII' },
      { path: '/declaraciones',        label: 'Declaraciones DGII' },
      { path: '/retenciones',          label: 'Retenciones ISR' },
    ],
  },

  // ── 9. ANÁLISIS & REPORTES ─────────────────────────────────────────────────
  {
    id: 'analisis', label: 'Análisis & Reportes', Icon: BarChart3,
    items: [
      { path: '/asistente',          label: '🤖 Asistente IA' },
      { path: '/analytics',          label: 'Business Intelligence' },
      { path: '/kpi',                label: 'KPI Ejecutivo' },
      { path: '/generador-reportes', label: 'Generador de Reportes' },
      { path: '/reportes',           label: 'Reportes' },
      { path: '/calendario',         label: 'Calendario de Obligaciones' },
    ],
  },

  // ── 10. SISTEMA ────────────────────────────────────────────────────────────
  {
    id: 'sistema', label: 'Sistema', Icon: Settings,
    items: [
      { path: '/configuracion',  label: 'Configuración' },
      { path: '/sucursales',     label: 'Sucursales' },
      { path: '/equipo',         label: 'Usuarios y Roles' },
      { path: '/mis-empresas',   label: 'Empresas' },
      { path: '/aprobaciones',   label: 'Aprobaciones & Workflow' },
      { path: '/documentos',     label: 'Documentos' },
      { path: '/comunicaciones', label: 'WhatsApp & Mensajería' },
      { path: '/importacion',    label: 'Importación CSV' },
      { path: '/auditoria',      label: 'Auditoría' },
      { path: '/contactos',      label: 'Directorio de Contactos' },
      { path: '/super-admin',    label: 'Super Admin' },
    ],
  },
];

// ── Orden de jerarquía de planes ─────────────────────────────────────────────
const PLAN_TIER: Record<PlanTipo, number> = {
  trial: 0, basico: 1, profesional: 2, empresarial: 3, enterprise: 4,
};
const PLAN_NOMBRE: Record<PlanTipo, string> = {
  trial: 'Trial', basico: 'Básico', profesional: 'Profesional',
  empresarial: 'Empresarial', enterprise: 'Enterprise',
};

// Mapa ruta → plan mínimo requerido (rutas sin entrada son accesibles en trial)
const PATH_MIN_PLAN: Record<string, PlanTipo> = {
  // ── Básico+ ──────────────────────────────────────────────────────────────
  '/ecf':                   'basico',
  '/compras':               'basico',
  '/notas-credito':         'basico',
  '/notas-credito-compras': 'basico',
  '/proveedores':           'basico',
  '/gastos':                'basico',
  '/caja-chica':            'basico',
  '/conteo-inventario':     'basico',
  '/etiquetas':             'basico',
  '/retenciones':           'basico',
  '/bancos':                'basico',
  '/depositos':             'basico',
  '/cheques':               'basico',
  '/datafono':              'basico',
  '/importacion':           'basico',
  '/reportes':              'basico',
  '/calendario':            'basico',
  '/fidelidad':             'basico',
  '/cuotas':                'basico',
  '/credito-cliente':       'basico',
  '/cotizaciones':          'basico',
  '/pre-facturas':          'basico',
  '/notas-debito':          'basico',
  '/conduces':              'basico',
  '/devoluciones':          'basico',
  '/facturas-recurrentes':  'basico',
  '/precios-especiales':    'basico',
  '/descuentos':            'basico',
  '/comisiones':            'basico',
  '/vendedores':            'basico',
  '/contactos':             'basico',
  '/documentos':            'basico',
  '/equipo':                'basico',
  // ── Profesional+ ─────────────────────────────────────────────────────────
  '/cxc':                   'profesional',
  '/recibos-cobro':         'profesional',
  '/cxp':                   'profesional',
  '/centro-costos':         'profesional',
  '/flujo-caja':            'profesional',
  '/activos-fijos':         'profesional',
  '/divisas':               'profesional',
  '/contabilidad':          'profesional',
  '/libro-mayor':           'profesional',
  '/periodo-contable':      'profesional',
  '/reportes-financieros':  'profesional',
  '/balance-comprobacion':  'profesional',
  '/libro-ventas':          'profesional',
  '/declaraciones':         'profesional',
  '/presupuestos':          'profesional',
  '/sucursales':            'profesional',
  '/generador-reportes':    'profesional',
  '/valoracion-stock':      'profesional',
  '/solicitudes-compra':    'profesional',
  '/cuentas-estadisticas':  'profesional',
  '/distribucion-costos':   'profesional',
  '/uom':                   'basico',
  // ── Empresarial+ ─────────────────────────────────────────────────────────
  '/proyectos':             'empresarial',
  '/contratos':             'empresarial',
  '/servicios':             'empresarial',
  '/objetivos':             'empresarial',
  '/crm':                   'empresarial',
  '/licitaciones':          'empresarial',
  '/encuestas':             'empresarial',
  '/almacenes':             'empresarial',
  '/wms':                   'empresarial',
  '/manufactura':           'empresarial',
  '/planeacion-demanda':    'empresarial',
  '/nomina':                'empresarial',
  '/portal-empleado':       'empresarial',
  '/isr':                   'empresarial',
  '/tss':                   'empresarial',
  '/vacaciones':            'empresarial',
  '/evaluaciones':          'empresarial',
  '/capacitacion':          'empresarial',
  '/flota':                 'empresarial',
  '/mantenimiento':         'empresarial',
  '/analytics':             'empresarial',
  '/kpi':                   'empresarial',
  '/aprobaciones':          'empresarial',
  '/auditoria':             'empresarial',
  // ── Enterprise ───────────────────────────────────────────────────────────
  '/asistente':             'enterprise',
  '/comunicaciones':        'enterprise',
};

function esRutaBloqueada(path: string, planActual: PlanTipo): boolean {
  const minPlan = PATH_MIN_PLAN[path];
  if (!minPlan) return false;
  return PLAN_TIER[planActual] < PLAN_TIER[minPlan];
}

// ── Skeleton de carga de módulo (solo ocupa el área de contenido) ─────────────
function ContentLoader() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '60vh', gap: 12,
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: '2px solid rgba(22,119,255,.15)',
          borderTopColor: '#1677ff',
        }}
      />
      <span style={{ color: '#9ca3af', fontSize: 12 }}>Cargando módulo…</span>
    </div>
  );
}

// ── Reloj ─────────────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text type="secondary" style={{ fontSize: 12, fontFeatureSettings: '"tnum"', letterSpacing: .3 }}>
      {time.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </Text>
  );
}

// ── Indicador En Vivo ─────────────────────────────────────────────────────────
function RealtimeDot() {
  const status = useRealtimeStatus();
  const cfg = {
    connected:    { color: '#10b981', title: 'En vivo — actualizaciones automáticas activas' },
    connecting:   { color: '#f59e0b', title: 'Conectando...' },
    disconnected: { color: '#94a3b8', title: 'Sin conexión en tiempo real' },
  }[status];

  return (
    <Tooltip title={cfg.title}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: cfg.color,
          boxShadow: status === 'connected' ? `0 0 0 2px ${cfg.color}33` : 'none',
          animation: status === 'connected' ? 'pulse-live 2s infinite' : 'none',
          display: 'inline-block',
        }} />
        {status === 'connected' && (
          <Text style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>EN VIVO</Text>
        )}
      </span>
    </Tooltip>
  );
}

// ── Saludo ────────────────────────────────────────────────────────────────────
function Greeting({ nombre }: { nombre: string }) {
  const h      = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const emoji  = h < 12 ? '☀️' : h < 18 ? '🌤️' : '🌙';
  return (
    <Text style={{ fontSize: 12 }}>
      {emoji} {saludo}, <strong>{nombre.split(' ')[0]}</strong>
    </Text>
  );
}

// ── Indicador de plan en el header ──────────────────────────────────────────
function PlanIndicadorHeader() {
  const { data: suscripcion } = useQuery({
    queryKey: ['mi-plan'],
    queryFn:  () => api.get('/suscripciones/mi-plan').then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const navigate = useNavigate();

  if (!suscripcion) return null;

  const plan   = suscripcion.plan as string;
  const dias   = suscripcion.diasRestantes as number;
  const COLOR: Record<string, string> = {
    trial: '#94A3B8', basico: '#3B82F6',
    profesional: '#8B5CF6', empresarial: '#F59E0B', enterprise: '#EF4444',
  };
  const LABEL: Record<string, string> = {
    trial: 'TRIAL', basico: 'BÁSICO', profesional: 'PRO',
    empresarial: 'EMPR.', enterprise: 'ENT.',
  };
  const color = COLOR[plan] ?? '#64748B';
  const label = LABEL[plan] ?? plan.toUpperCase();
  const urgente = plan === 'trial' && dias <= 5;

  return (
    <Tooltip title={`Plan ${suscripcion.info?.nombre ?? plan}${dias > 0 ? ` · ${dias} días restantes` : ''} — Click para ver planes`}>
      <button
        onClick={() => navigate('/suscripcion/planes')}
        style={{
          background: `${color}18`,
          border: `1px solid ${color}55`,
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          animation: urgente ? 'pulse 2s infinite' : 'none',
        }}>
        <span style={{ color, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em' }}>{label}</span>
        {plan === 'trial' && dias > 0 && (
          <span style={{ color: dias <= 5 ? '#EF4444' : '#94A3B8', fontSize: 10 }}>{dias}d</span>
        )}
      </button>
    </Tooltip>
  );
}

// ── Item de menú rápido (sin categoría) ──────────────────────────────────────
function QuickItemComp({
  item, active, collapsed, onClick, onHover,
}: {
  item: QuickItem; active: boolean; collapsed: boolean; onClick: () => void; onHover?: () => void;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);

  const btn = (
    <button
      onClick={onClick}
      onMouseEnter={() => { setHover(true); onHover?.(); }}
      onMouseLeave={() => setHover(false)}
      style={{
        width:          collapsed ? 40 : 'calc(100% - 16px)',
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        collapsed ? '10px 0' : '10px 14px',
        height:         40,
        border:         'none',
        cursor:         'pointer',
        borderRadius:   8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        position:       'relative',
        background:     active
          ? C.bgActive
          : hover
            ? C.bgHover
            : 'transparent',
        boxShadow:      active
          ? '0 0 0 1px rgba(59,130,246,0.3)'
          : 'none',
        transition:     'all 0.2s ease',
        margin:         '0 8px',
      }}
    >
      {/* Borde izquierdo activo */}
      {active && (
        <span style={{
          position:     'absolute',
          left:         0, top: 6, bottom: 6,
          width:        3,
          borderRadius: '0 3px 3px 0',
          background:   C.accent,
        }} />
      )}

      <item.Icon
        size={16}
        strokeWidth={active ? 2.5 : 2}
        style={{ color: active ? '#fff' : hover ? '#fff' : C.text, flexShrink: 0 }}
      />

      {!collapsed && (
        <>
          <span style={{
            flex:         1,
            fontSize:     13,
            fontWeight:   active ? 600 : 500,
            color:        active ? '#fff' : hover ? '#fff' : C.text,
            textAlign:    'left',
            whiteSpace:   'nowrap',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            transition:   'color 0.15s',
          }}>
            {item.label}
          </span>
          {item.badge && (
            <span style={{
              fontSize:     9, fontWeight: 700, padding: '2px 7px',
              borderRadius: 6, background: active ? 'rgba(255,255,255,0.25)' : C.accent,
              color:        '#fff', letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );

  return collapsed
    ? <Tooltip title={item.label} placement="right">{btn}</Tooltip>
    : btn;
}

// ── MODO EXPANDIDO: Categoría accordion ──────────────────────────────────────
function CategoryAccordion({
  category, activePath, isOpen, onToggle, onNavigate, planActual, onLocked, onHoverItem,
}: {
  category:    MenuCategory;
  activePath:  string;
  isOpen:      boolean;
  onToggle:    () => void;
  onNavigate:  (path: string) => void;
  planActual:  PlanTipo;
  onLocked:    (item: SubItem, planMinimo: PlanTipo) => void;
  onHoverItem?: (path: string) => void;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);
  const hasActiveSub = category.items.some(i => activePath.startsWith(i.path));

  return (
    <div>
      <button
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width:          'calc(100% - 16px)',
          display:        'flex',
          alignItems:     'center',
          gap:            10,
          padding:        '9px 12px',
          height:         38,
          border:         'none',
          cursor:         'pointer',
          borderRadius:   7,
          position:       'relative',
          background:     hasActiveSub ? C.bgActive : hover ? C.bgHover : 'transparent',
          margin:         '0 8px',
          transition:     'background 0.15s',
        }}
      >
        {hasActiveSub && (
          <span style={{
            position: 'absolute', left: 0, top: 7, bottom: 7,
            width: 3, borderRadius: '0 3px 3px 0', background: C.accent,
          }} />
        )}
        <category.Icon
          size={15}
          strokeWidth={hasActiveSub ? 2.5 : 2}
          style={{ color: hasActiveSub ? C.accent : hover ? C.text : C.textCategory, flexShrink: 0 }}
        />
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: hasActiveSub ? 600 : 500,
          color: hasActiveSub ? '#E2E8F0' : hover ? C.text : C.textCategory,
          textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {category.label}
        </span>
        <ChevronDown
          size={13} strokeWidth={2}
          style={{
            color: C.textCategory, flexShrink: 0,
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.22s ease',
          }}
        />
      </button>

      {isOpen && (
          <motion.div
            key="sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div style={{ paddingBottom: 4 }}>
              {category.items.map(item => {
                const isActive  = activePath.startsWith(item.path);
                const minPlan   = PATH_MIN_PLAN[item.path] as PlanTipo | undefined;
                const isLocked  = !!minPlan && esRutaBloqueada(item.path, planActual);
                return (
                  <AccordionSubItem
                    key={item.path}
                    item={item}
                    active={isActive}
                    locked={isLocked}
                    planMinimo={minPlan}
                    onClick={() => isLocked ? onLocked(item, minPlan!) : onNavigate(item.path)}
                    onHover={() => onHoverItem?.(item.path)}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
    </div>
  );
}

// ── Sub-ítem del accordion (modo expandido) ───────────────────────────────────
function AccordionSubItem({
  item, active, onClick, locked, planMinimo, onHover,
}: {
  item: SubItem; active: boolean; onClick: () => void;
  locked?: boolean; planMinimo?: PlanTipo; onHover?: () => void;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);
  return (
    <Tooltip
      title={locked ? `Disponible en plan ${PLAN_NOMBRE[planMinimo!] ?? ''}` : undefined}
      placement="right"
    >
      <button
        onClick={onClick}
        onMouseEnter={() => { setHover(true); onHover?.(); }}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 'calc(100% - 16px)', margin: '1px 8px',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px 7px 28px',
          height: 32, border: 'none',
          cursor: locked ? 'not-allowed' : 'pointer',
          borderRadius: 6,
          background: active ? C.bgActive : hover ? C.bgHover : 'transparent',
          transition: 'all 0.12s ease', textAlign: 'left',
          opacity: locked ? 0.7 : 1,
        }}
      >
        <span style={{
          fontSize: 13, lineHeight: 1, flexShrink: 0,
          color: active ? C.accent : hover ? C.textSubHover : C.textCategory,
          transition: 'color 0.12s', userSelect: 'none',
        }}>↳</span>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: active ? 500 : 400,
          color: locked ? C.accent : active ? C.textActive : hover ? C.textSubHover : C.textSub,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'color 0.12s',
        }}>
          {item.label}
        </span>
        {locked && <Lock size={10} color={C.accent} style={{ flexShrink: 0 }} />}
      </button>
    </Tooltip>
  );
}

// ── MODO COLAPSADO: Botón de categoría solo ícono ─────────────────────────────
function CategoryBtnCollapsed({
  category, activePath, isActive, onClick,
}: {
  category:   MenuCategory;
  activePath: string;
  isActive:   boolean;
  onClick:    () => void;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);
  const hasActiveSub = category.items.some(i => activePath.startsWith(i.path));

  return (
    <Tooltip title={category.label} placement="right">
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: 40, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer', borderRadius: 7, position: 'relative',
          background: isActive ? '#1E293B' : hover ? 'rgba(30,41,59,0.8)' : 'transparent',
          margin: '2px auto', transition: 'background 0.15s',
        }}
      >
        {(isActive || hasActiveSub) && (
          <span style={{
            position: 'absolute', left: 0, top: 7, bottom: 7,
            width: 3, borderRadius: '0 3px 3px 0', background: C.accent,
          }} />
        )}
        <category.Icon
          size={16}
          strokeWidth={(isActive || hasActiveSub) ? 2.5 : 2}
          style={{ color: isActive ? '#FFFFFF' : hasActiveSub ? C.accent : hover ? '#CBD5E1' : C.textCategory }}
        />
      </button>
    </Tooltip>
  );
}

// ── Panel secundario (flyout) ─────────────────────────────────────────────────
function FlyoutPanel({
  category, activePath, sidebarWidth, onNavigate, onClose, planActual, onLocked,
}: {
  category:     MenuCategory;
  activePath:   string;
  sidebarWidth: number;
  onNavigate:   (path: string) => void;
  onClose:      () => void;
  planActual:   PlanTipo;
  onLocked:     (item: SubItem, planMinimo: PlanTipo) => void;
}) {
  const C = useC();
  return (
    <>
      {/* Overlay — cubre el área de contenido, captura clicks fuera del panel */}
      <div
        onMouseDown={onClose}
        style={{
          position: 'fixed',
          top: 0, bottom: 0,
          left: sidebarWidth + 220, // empieza después del panel
          right: 0,
          zIndex: 150,
        }}
      />

    <motion.div
      key={category.id}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        position:      'fixed',
        left:          sidebarWidth,
        top:           0,
        width:         220,
        height:        '100vh',
        background:    C.panelBg,
        boxShadow:     '6px 0 20px rgba(0,0,0,0.3)',
        zIndex:        200,
        display:       'flex',
        flexDirection: 'column',
        borderRight:   `1px solid ${C.panelBorder}`,
      }}
    >
      {/* Header compacto */}
      <div style={{
        padding:       '12px 16px',
        borderBottom:  '1px solid #334155',
        flexShrink:    0,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <category.Icon size={14} strokeWidth={2.5} style={{ color: C.accent, flexShrink: 0 }} />
          <span style={{
            fontSize:      11,
            fontWeight:    700,
            color:         C.textSub,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {category.label}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: C.footerText, display: 'flex', padding: 3, borderRadius: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = C.textSub)}
          onMouseLeave={e => (e.currentTarget.style.color = C.footerText)}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Lista de items compacta */}
      <div style={{
        flex:           1,
        overflowY:      'auto',
        padding:        '6px 0',
        scrollbarWidth: 'thin',
        scrollbarColor: '#334155 transparent',
      }}>
        {category.items.map((item, idx) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.018, duration: 0.12 }}
          >
            <FlyoutItem
              item={item}
              active={activePath.startsWith(item.path)}
              locked={esRutaBloqueada(item.path, planActual)}
              planMinimo={PATH_MIN_PLAN[item.path] as PlanTipo | undefined}
              onClick={() => {
                const minPlan = PATH_MIN_PLAN[item.path] as PlanTipo | undefined;
                if (minPlan && esRutaBloqueada(item.path, planActual)) {
                  onClose(); onLocked(item, minPlan);
                } else { onNavigate(item.path); onClose(); }
              }}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
    </>
  );
}

// ── Ítem dentro del flyout ────────────────────────────────────────────────────
function FlyoutItem({
  item, active, onClick, locked, planMinimo,
}: {
  item: SubItem; active: boolean; onClick: () => void;
  locked?: boolean; planMinimo?: PlanTipo;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);

  return (
    <Tooltip
      title={locked ? `Disponible en plan ${PLAN_NOMBRE[planMinimo!] ?? ''}` : undefined}
      placement="right"
    >
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', width: 'calc(100% - 16px)',
          margin: '1px 8px', height: 34, border: 'none',
          cursor: locked ? 'not-allowed' : 'pointer',
          borderRadius: 6,
          background: active ? C.bgActive : hover ? C.bgHover : 'transparent',
          transition: 'all 0.12s ease', textAlign: 'left',
          opacity: locked ? 0.7 : 1,
        }}
      >
        <span style={{
          fontSize: 13, lineHeight: 1, flexShrink: 0,
          color: active ? C.accent : hover ? C.textSubHover : C.textCategory,
          transition: 'color 0.12s', userSelect: 'none',
        }}>↳</span>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: active ? 600 : 400,
          color: locked ? C.accent : active ? C.textActive : hover ? C.textSubHover : C.textSub,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'color 0.12s',
        }}>
          {item.label}
        </span>
        {locked && <Lock size={10} color={C.accent} style={{ flexShrink: 0 }} />}
      </button>
    </Tooltip>
  );
}

// ── AppLayout principal ───────────────────────────────────────────────────────
export default function AppLayout() {
  useRealtime();   // ← conexión WebSocket para actualizaciones en vivo

  const [collapsed,   setCollapsed]   = useState(false);
  const [cmdOpen,     setCmdOpen]     = useState(false);
  const [helpOpen,    setHelpOpen]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  // Modal de upgrade cuando se hace click en módulo bloqueado
  const [upgradeModal, setUpgradeModal] = useState<{ label: string; planMinimo: PlanTipo } | null>(null);

  const { plan: planActual } = usePlan();
  const handleLocked = (item: SubItem, planMinimo: PlanTipo) => {
    setUpgradeModal({ label: item.label, planMinimo });
  };

  const location   = useLocation();
  const activePath = location.pathname;

  // Accordion (modo expandido): qué categorías están abiertas
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    const s = new Set<string>();
    MENU_CATEGORIES.forEach(g => {
      if (g.items.some(i => activePath.startsWith(i.path))) s.add(g.id);
    });
    return s;
  });

  // Auto-abrir la categoría de la ruta activa al navegar (sin cerrar otras)
  useEffect(() => {
    const activeGroup = MENU_CATEGORIES.find(g =>
      g.items.some(i => activePath.startsWith(i.path))
    );
    if (activeGroup) {
      setOpenCategories(prev => {
        if (prev.has(activeGroup.id)) return prev; // ya está abierta, no re-render
        const next = new Set(prev);
        next.add(activeGroup.id);
        return next;
      });
    }
  }, [activePath]);

  // Flyout (modo colapsado): qué categoría activa el panel secundario
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Refs para detectar clicks fuera del flyout
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { total: totalAlertas, criticas: alertasCriticas, alertas } = useAlertas();
  const { status: pushStatus, subscribe: pushSubscribe, unsubscribe: pushUnsub } = usePushNotifications();
  const { user, logout }                = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { token }                       = theme.useToken();
  const navigate                        = useNavigate();

  // Solo el super_admin ve la entrada /super-admin en el sidebar
  const esSuperAdmin = user?.role === 'super_admin';

  // Categorías filtradas: oculta /super-admin para usuarios normales
  const categoriasFiltradas = MENU_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      item.path !== '/super-admin' || esSuperAdmin
    ),
  })).filter(cat => cat.items.length > 0);

  // Paleta activa del sidebar según el modo de tema
  const C = isDark ? sidebarDark : sidebarLight;

  // Selector de empresa
  const [empresaActiva, setEmpresaActiva] = useState<number | null>(
    localStorage.getItem('empresaId') ? Number(localStorage.getItem('empresaId')) : null,
  );
  const { data: misEmpresas = [], isSuccess: empresasLoaded } = useQuery<any[]>({
    queryKey: ['mis-empresas', user?.id],
    queryFn:  () => api.get('/multi-empresa/mis-empresas').then(r => r.data?.data ?? r.data ?? []),
    enabled:  !!user,
    staleTime: 60_000,
  });
  const cambiarEmpresa = useCallback((id: number) => {
    setEmpresaActiva(id);
    localStorage.setItem('empresaId', String(id));
    window.location.reload();
  }, []);

  // Auto-seleccionar la primera empresa si no hay ninguna activa
  useEffect(() => {
    if (misEmpresas.length > 0 && !localStorage.getItem('empresaId')) {
      cambiarEmpresa(misEmpresas[0].empresaId);
    }
  }, [misEmpresas, cambiarEmpresa]);

  // Si la query ya cargó, no hay empresas vinculadas y no hay empresaId en localStorage → redirigir a crear empresa
  useEffect(() => {
    if (empresasLoaded && misEmpresas.length === 0 && !localStorage.getItem('empresaId')) {
      if (!window.location.pathname.startsWith('/mis-empresas')) {
        navigate('/mis-empresas');
      }
    }
  }, [empresasLoaded, misEmpresas.length, navigate]);

  // ── Accordion (expandido) ────────────────────────────────────────────────────
  const toggleCategory = useCallback((id: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Flyout (colapsado) ───────────────────────────────────────────────────────
  const closePanel  = useCallback(() => setActivePanel(null), []);
  const togglePanel = useCallback((id: string) =>
    setActivePanel(prev => (prev === id ? null : id)), []);

  // Al expandir el sidebar → cerrar cualquier panel flyout abierto
  useEffect(() => { if (!collapsed) closePanel(); }, [collapsed, closePanel]);

  // B) Cerrar flyout al cambiar de ruta
  useEffect(() => { closePanel(); }, [location.pathname, closePanel]);

  // A) Click fuera del sidebar cuando el panel está abierto → cerrar flyout
  // (el overlay del FlyoutPanel cubre el área de contenido directamente)
  useEffect(() => {
    if (!activePanel) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePanel, closePanel]);

  // D) ESC → cerrar flyout
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [closePanel]);

  // Navegar y cerrar panel
  const isMobile = useMobile();

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    closePanel();
    setMobileOpen(false); // cierra drawer mobile al navegar
  }, [navigate, closePanel]);

  // Prefetch del chunk de una ruta en hover para que el clic sea instantáneo
  const prefetchRoute = useCallback((path: string) => {
    const map: Record<string, () => Promise<any>> = {
      '/facturas':         () => import('../../pages/facturas/FacturasPage'),
      '/clientes':         () => import('../../pages/clientes/ClientesPage'),
      '/productos':        () => import('../../pages/productos/ProductosPage'),
      '/inventario':       () => import('../../pages/inventario/InventarioPage'),
      '/compras':          () => import('../../pages/compras/ComprasPage'),
      '/proveedores':      () => import('../../pages/proveedores/ProveedoresPage'),
      '/dashboard':        () => import('../../pages/dashboard/DashboardPage'),
      '/pos':              () => import('../../pages/pos/POSPage'),
      '/caja':             () => import('../../pages/caja/CajaPage'),
      '/cotizaciones':     () => import('../../pages/cotizaciones/CotizacionesPage'),
      '/cxc':              () => import('../../pages/cxc/CxCPage'),
      '/cxp':              () => import('../../pages/cxp/CxPPage'),
      '/contabilidad':     () => import('../../pages/contabilidad/ContabilidadPage'),
      '/nomina':           () => import('../../pages/nomina/NominaPage'),
      '/reportes':         () => import('../../pages/reportes/ReportesPage'),
      '/bancos':           () => import('../../pages/bancos/BancosPage'),
      '/crm':              () => import('../../pages/crm/CRMPage'),
      '/gastos':           () => import('../../pages/gastos/GastosPage'),
      '/notas-debito':     () => import('../../pages/notas-debito/NotasDebitoPage'),
      '/notas-credito':    () => import('../../pages/notas-credito/NotasCreditoPage'),
      '/devoluciones':     () => import('../../pages/devoluciones/DevolucionesPage'),
      '/conduces':         () => import('../../pages/conduce/ConducePage'),
      '/pre-facturas':     () => import('../../pages/pre-factura/PreFacturaPage'),
      '/retenciones':      () => import('../../pages/retenciones/RetencionesPage'),
      '/presupuestos':     () => import('../../pages/presupuestos/PresupuestosPage'),
      '/activos-fijos':    () => import('../../pages/activos-fijos/ActivosFijosPage'),
      '/vendedores':       () => import('../../pages/vendedores/VendedoresPage'),
      '/equipo':           () => import('../../pages/equipo/EquipoPage'),
      '/ecf':              () => import('../../pages/ecf/ECFPage'),
      '/auditoria':        () => import('../../pages/auditoria/AuditoriaPage'),
      '/configuracion':    () => import('../../pages/configuracion/ConfiguracionPage'),
    };
    map[path]?.();
  }, []);

  // Prefetch proactivo: al abrir una categoría, pre-descarga los chunks de sus rutas
  useEffect(() => {
    const timer = setTimeout(() => {
      openCategories.forEach(catId => {
        const cat = MENU_CATEGORIES.find(c => c.id === catId);
        cat?.items.forEach(item => prefetchRoute(item.path));
      });
    }, 800); // esperar 800ms tras el montaje para no competir con el chunk activo
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atajos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
      if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: 'Mi perfil',     onClick: () => navigate('/profile') },
      { type: 'divider' as const },
      { key: 'logout',  icon: <LogoutOutlined />, label: 'Cerrar sesión', danger: true,
        onClick: () => { logout(); navigate('/login'); } },
    ],
  };

  // ── Sidebar interno ─────────────────────────────────────────────────────────

  const SidebarContent = (
    <div style={{
      width:         collapsed ? 64 : 260,
      height:        '100%',
      display:       'flex',
      flexDirection: 'column',
      background:    C.bg,
      transition:    'width 0.25s ease',
      overflowX:     'hidden',
    }}>

      {/* ── Header / Logo ────────────────────────────────────────────── */}
      <div style={{
        height:         64,
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding:        collapsed ? '0 12px' : '0 16px',
        borderBottom:   `1px solid ${C.separator}`,
        flexShrink:     0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo pill */}
          <div style={{
            width:          36, height: 36,
            borderRadius:   10,
            background:     'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       16, fontWeight: 900, color: '#fff',
            flexShrink:     0,
            boxShadow:      '0 4px 12px rgba(59,130,246,0.35)',
            letterSpacing:  '-0.5px',
          }}>
            H
          </div>

          {/* Empresa */}
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px' }}>
                HiCloud ERP
              </div>
              <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 1 }}>
                República Dominicana
              </div>
            </motion.div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              color:       C.textCategory,
              padding:     4,
              borderRadius: 6,
              display:     'flex',
              transition:  'color 0.15s',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Navegación ──────────────────────────────────────────────── */}
      <div style={{
        flex:           1,
        overflowY:      'scroll',    // siempre reserva espacio → sin jerk al aparecer
        overflowX:      'hidden',
        paddingTop:     10,
        paddingBottom:  20,
        scrollbarWidth: 'thin',
        scrollbarColor: `${C.scrollbar} transparent`,
        // scrollbar-gutter: stable evita shift en navegadores que lo soportan
        // @ts-ignore
        scrollbarGutter: 'stable',
      }}>

        {/* Items rápidos (sin categoría) */}
        <div style={{ marginBottom: 6 }}>
          {QUICK_ITEMS.map(item => (
            <QuickItemComp
              key={item.path}
              item={item}
              active={activePath.startsWith(item.path)}
              collapsed={collapsed}
              onClick={() => { handleNavigate(item.path); }}
              onHover={() => prefetchRoute(item.path)}
            />
          ))}
        </div>

        {/* Separador */}
        <div style={{
          height:     1,
          margin:     collapsed ? '8px 10px 10px' : '8px 16px 10px',
          background: C.separator,
        }} />

        {/* Categorías:
            – Expandido → accordion inline
            – Colapsado → ícono que abre panel flyout              */}
        {categoriasFiltradas.map(cat => (
          <div key={cat.id} style={{ marginBottom: 2 }}>
            {collapsed ? (
              <CategoryBtnCollapsed
                category={cat}
                activePath={activePath}
                isActive={activePanel === cat.id}
                onClick={() => togglePanel(cat.id)}
              />
            ) : (
              <CategoryAccordion
                category={cat}
                activePath={activePath}
                isOpen={openCategories.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
                onNavigate={handleNavigate}
                planActual={planActual}
                onLocked={handleLocked}
                onHoverItem={prefetchRoute}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div style={{
        borderTop:  `1px solid ${C.separator}`,
        padding:    collapsed ? '10px 0' : '10px 16px',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.15)',
      }}>
        {collapsed ? (
          <Tooltip title="Expandir menú" placement="right">
            <button
              onClick={() => setCollapsed(false)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.textCategory, width: '100%', display: 'flex',
                justifyContent: 'center', padding: '4px 0',
              }}
            >
              <Menu size={18} strokeWidth={2} />
            </button>
          </Tooltip>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.footerText }}>
              v1.0.0 · DGII RD 2026
            </span>
            <button
              onClick={() => setHelpOpen(true)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.footerText, display: 'flex', padding: 2,
              }}
            >
              <HelpCircle size={14} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Modo POS: pantalla completa sin sidebar ni header ───────────────
  const isPOS = activePath === '/pos' || activePath.startsWith('/pos/');
  if (isPOS) {
    return (
      <>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <Outlet />
      </>
    );
  }

  return (
    <>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Layout SPA: contenido en height:100vh overflow:hidden — el scroll
          ocurre en #main-content, nunca en el body. Esto evita saltos de
          posición al navegar y hace que ScrollToTop funcione con certeza. */}
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* ══ SIDEBAR + FLYOUT — envueltos en el proveedor de tema ══ */}
        <SidebarCtx.Provider value={C}>

        {/* ══ SIDEBAR DESKTOP (oculto en mobile) ═══════════════════ */}
        {!isMobile && (
          <div
            ref={sidebarRef}
            style={{
              width:       collapsed ? 64 : 260,
              minWidth:    collapsed ? 64 : 260,
              height:      '100%',
              flexShrink:  0,
              transition:  'width 0.25s ease, min-width 0.25s ease',
              boxShadow:   '1px 0 0 rgba(148,163,184,0.06)',
              zIndex:      100,
              overflowY:   'hidden',
            }}
          >
            {SidebarContent}
          </div>
        )}

        {/* ══ SIDEBAR MOBILE — drawer overlay ════════════════════════ */}
        {isMobile && (
          <>
            {/* Overlay oscuro */}
            {mobileOpen && (
              <div
                className="mobile-drawer-overlay"
                onClick={() => setMobileOpen(false)}
              />
            )}
            {/* Drawer */}
            <div
              ref={sidebarRef}
              style={{
                position:   'fixed',
                top:        0,
                left:       0,
                height:     '100%',
                width:      260,
                zIndex:     200,
                transform:  mobileOpen ? 'translateX(0)' : 'translateX(-260px)',
                transition: 'transform 0.25s ease',
                overflowY:  'hidden',
                boxShadow:  mobileOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {SidebarContent}
            </div>
          </>
        )}

        {/* ══ FLYOUT PANEL ═══════════════════════════════════════════ */}
        <AnimatePresence>
          {activePanel && (() => {
            const cat = categoriasFiltradas.find(c => c.id === activePanel);
            if (!cat) return null;
            return (
              <FlyoutPanel
                key={activePanel}
                category={cat}
                activePath={activePath}
                sidebarWidth={collapsed ? 64 : 260}
                onNavigate={handleNavigate}
                onClose={closePanel}
                planActual={planActual}
                onLocked={handleLocked}
              />
            );
          })()}
        </AnimatePresence>

        </SidebarCtx.Provider>

        {/* ══ CONTENIDO PRINCIPAL ════════════════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* ── Header — fijo naturalmente dentro del flex column ──── */}
          <div style={{
            background:     token.colorBgContainer,
            padding:        '0 20px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexShrink:     0,
            height:          52,
            borderBottom:   `1px solid ${token.colorBorderSecondary}`,
            boxShadow:      isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {/* Izquierda */}
            <Space size={8}>
              {/* Hamburguesa mobile */}
              {isMobile && (
                <button
                  onClick={() => setMobileOpen(v => !v)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: token.colorTextSecondary, display: 'flex',
                    padding: 4, borderRadius: 6,
                  }}
                >
                  <Menu size={20} strokeWidth={2} />
                </button>
              )}
              {/* Botón expandir sidebar (solo desktop colapsado) */}
              {!isMobile && collapsed && (
                <button
                  onClick={() => setCollapsed(false)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: token.colorTextSecondary, display: 'flex',
                    padding: 4, borderRadius: 6,
                  }}
                >
                  <Menu size={18} strokeWidth={2} />
                </button>
              )}
              {!isMobile && <Greeting nombre={user?.nombre ?? 'Usuario'} />}
            </Space>

            {/* Derecha */}
            <Space size={4}>
              {/* Selector empresa — oculto en mobile si solo hay 1 */}
              {Array.isArray(misEmpresas) && misEmpresas.length >= 1 && !isMobile && (
                <Select
                  value={empresaActiva}
                  onChange={cambiarEmpresa}
                  size="small"
                  style={{ width: 200, marginRight: 4 }}
                  optionLabelProp="label"
                  options={misEmpresas.map((e: any) => ({
                    value: e.empresaId,
                    label: e.nombre,
                    rol:   e.rol,
                  }))}
                  optionRender={(opt: any) => (
                    <Space size={6}>
                      <span style={{ fontSize: 13 }}>{opt.data.label}</span>
                      <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                        {opt.data.rol}
                      </Tag>
                    </Space>
                  )}
                />
              )}

              {!isMobile && <PlanIndicadorHeader />}
              {!isMobile && <LiveClock />}
              <RealtimeDot />

              {/* Búsqueda — solo ícono en mobile */}
              <Tooltip title="Búsqueda global (Ctrl+K)">
                <Button type="text" size="small" icon={<SearchOutlined />}
                  onClick={() => setCmdOpen(true)}>
                  {!isMobile && <Text type="secondary" style={{ fontSize: 11 }}>Ctrl+K</Text>}
                </Button>
              </Tooltip>

              {/* Modo oscuro — oculto en mobile (disponible en perfil) */}
              {!isMobile && (
                <Tooltip title={isDark ? 'Modo claro' : 'Modo oscuro'}>
                  <motion.div whileTap={{ rotate: 180 }} transition={{ duration: .3 }}>
                    <Button type="text" size="small"
                      icon={isDark
                        ? <MoonOutlined style={{ color: '#facc15' }} />
                        : <SunOutlined />}
                      onClick={toggleTheme} />
                  </motion.div>
                </Tooltip>
              )}

              {!isMobile && (
                <Tooltip title="Centro de ayuda (F1)">
                  <Button type="text" size="small" onClick={() => setHelpOpen(true)}
                    style={{ fontWeight: 700, color: 'rgba(120,120,120,.7)', fontSize: 14 }}>
                    ?
                  </Button>
                </Tooltip>
              )}

              <Badge
                count={totalAlertas}
                size="small"
                offset={[-2, 2]}
                style={{ background: alertasCriticas > 0 ? '#dc2626' : '#d97706' }}
              >
                <Dropdown
                  trigger={['click']}
                  menu={{ items: [] }}
                  dropdownRender={() => (
                    <div style={{
                      background: token.colorBgElevated,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                      width: 340,
                      padding: 8,
                    }}>
                      <div style={{ padding: '6px 8px 10px', borderBottom: `1px solid ${token.colorBorderSecondary}`, marginBottom: 6 }}>
                        <Text strong style={{ fontSize: 13 }}>Centro de Alertas</Text>
                        {totalAlertas > 0 && <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>{totalAlertas} activa(s)</Tag>}
                      </div>
                      {alertas.length === 0 ? (
                        <div style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>✅ Sin alertas — todo en orden</Text>
                        </div>
                      ) : (
                        alertas.slice(0, 6).map((a: any) => (
                          <div
                            key={a.id}
                            onClick={() => navigate(a.ruta)}
                            style={{
                              display: 'flex', gap: 10, padding: '8px',
                              borderRadius: 6, cursor: 'pointer',
                              background: a.severidad === 'alta' ? token.colorErrorBg : a.severidad === 'media' ? token.colorWarningBg : token.colorFillAlter,
                              marginBottom: 4,
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{a.emoji}</span>
                            <div style={{ flex: 1 }}>
                              <Text strong style={{ fontSize: 12, display: 'block' }}>{a.titulo}</Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>{a.descripcion}</Text>
                            </div>
                            <Tag
                              color={a.severidad === 'alta' ? 'red' : a.severidad === 'media' ? 'orange' : 'default'}
                              style={{ fontSize: 9, alignSelf: 'flex-start' }}
                            >
                              {a.severidad}
                            </Tag>
                          </div>
                        ))
                      )}
                      {alertas.length > 0 && (
                        <div style={{ padding: '6px 4px 2px', borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 4, textAlign: 'center' }}>
                          <Button type="link" size="small" onClick={() => navigate('/reportes')}>
                            Ver todas las alertas →
                          </Button>
                        </div>
                      )}
                      <div style={{ padding: '6px 4px 2px', borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 4, textAlign: 'center' }}>
                        {pushStatus === 'subscribed' ? (
                          <Button type="text" size="small" danger onClick={pushUnsub} style={{ fontSize: 11 }}>
                            🔕 Desactivar notificaciones push
                          </Button>
                        ) : pushStatus === 'unsubscribed' ? (
                          <Button type="text" size="small" onClick={pushSubscribe} style={{ fontSize: 11, color: token.colorPrimary }}>
                            🔔 Activar notificaciones push
                          </Button>
                        ) : pushStatus === 'denied' ? (
                          <Text type="secondary" style={{ fontSize: 10 }}>🚫 Notificaciones bloqueadas por el navegador</Text>
                        ) : null}
                      </div>
                    </div>
                  )}
                >
                  <Button type="text" size="small" icon={<BellOutlined style={{ fontSize: 16 }} />} />
                </Dropdown>
              </Badge>

              <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
                <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
                  <Avatar size={28} style={{ background: '#1677ff', fontSize: 12 }}>
                    {user?.nombre?.charAt(0).toUpperCase()}
                  </Avatar>
                  <div style={{ lineHeight: 1.3 }}>
                    <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
                      {user?.nombre?.split(' ')[0]}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 10, textTransform: 'capitalize' }}>
                      {user?.role}
                    </Text>
                  </div>
                </Space>
              </Dropdown>
            </Space>
          </div>

          <PlanBanner />

          {/* Único área scrollable — scroll siempre aquí, nunca en el body */}
          <div
            id="main-content"
            style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 20 }}
          >
            <Suspense fallback={<ContentLoader />}>
              <PageTransition>
                <Outlet />
              </PageTransition>
            </Suspense>
          </div>
        </div>
      </div>

      <OnboardingTour />
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* ── Modal upgrade de plan ─────────────────────────────────── */}
      <Modal
        open={!!upgradeModal}
        onCancel={() => setUpgradeModal(null)}
        footer={null}
        centered
        width={440}
        styles={{ content: { background: '#1E293B', border: '1px solid #334155', borderRadius: 14 } }}
        title={null}
      >
        {upgradeModal && (
          <div style={{ padding: '8px 4px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
              background: `${
                upgradeModal.planMinimo === 'basico' ? '#3B82F6' :
                upgradeModal.planMinimo === 'profesional' ? '#8B5CF6' :
                upgradeModal.planMinimo === 'empresarial' ? '#F59E0B' : '#EF4444'
              }22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock size={28} color={
                upgradeModal.planMinimo === 'basico' ? '#3B82F6' :
                upgradeModal.planMinimo === 'profesional' ? '#8B5CF6' :
                upgradeModal.planMinimo === 'empresarial' ? '#F59E0B' : '#EF4444'
              } />
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#0F172A', border: '1px solid #334155',
              borderRadius: 6, padding: '3px 10px', marginBottom: 16,
            }}>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>
                Requiere plan <strong style={{ color: '#F8FAFC' }}>
                  {PLAN_NOMBRE[upgradeModal.planMinimo]}
                </strong>
              </span>
            </div>
            <h3 style={{ color: '#F8FAFC', fontWeight: 800, fontSize: 18, margin: '0 0 10px' }}>
              {upgradeModal.label}
            </h3>
            <p style={{ color: '#94A3B8', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
              Este módulo no está disponible en tu plan actual.
              Actualiza para acceder a <strong style={{ color: '#F8FAFC' }}>{upgradeModal.label}</strong> y
              muchas más funcionalidades.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => { setUpgradeModal(null); handleNavigate('/suscripcion/planes'); }}
                style={{
                  background: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                Ver planes y precios →
              </button>
              <button
                onClick={() => setUpgradeModal(null)}
                style={{
                  background: '#0F172A', color: '#94A3B8',
                  border: '1px solid #334155', borderRadius: 10,
                  padding: '10px 20px', fontSize: 14, cursor: 'pointer',
                }}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
