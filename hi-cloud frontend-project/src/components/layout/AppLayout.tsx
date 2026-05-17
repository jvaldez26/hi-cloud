import { useEffect, useState, useCallback, useRef, createContext, useContext, Suspense } from 'react';
import { useMobile, useTablet } from '../../hooks/useMediaQuery';
import {
  Layout, Avatar, Dropdown, Typography, Badge, Space,
  Button, Tooltip, theme, Select, Tag, Modal, Input, Divider, Checkbox, message,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import {
  LogoutOutlined, UserOutlined, BellOutlined,
  MoonOutlined, SunOutlined, SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, PlusCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import {
  LayoutDashboard, ShoppingCart, Wallet, TrendingUp, Package,
  Boxes, Briefcase, Users, BarChart3, Settings, ChevronDown,
  Menu, HelpCircle, Building2, CreditCard, Receipt,
  FileText, BookOpen, PieChart, Database, Truck,
  UserCheck, Calculator, Shield, Bell, Globe,
  Factory, Target, Banknote, ClipboardList, Tags,
  X, Lock, ChevronLeft, ChevronRight, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { usePlan, type PlanTipo } from '../../hooks/usePlan';
import SuspensionScreen from '../ui/SuspensionScreen';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
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

// Modo claro — estilo Cashflow: sidebar azul sólido con acento dorado
const sidebarLight: SidebarPalette = {
  bg:           '#1E3A8A',                       // azul Cashflow
  bgHover:      'rgba(255,255,255,0.08)',
  bgActive:     'rgba(255,255,255,0.08)',
  border:       'rgba(255,255,255,0.12)',
  separator:    'transparent',                   // sin separadores visibles
  text:         'rgba(255,255,255,0.90)',
  textActive:   '#FFFFFF',
  textCategory: 'rgba(255,255,255,0.55)',
  textSub:      'rgba(255,255,255,0.72)',
  textSubHover: '#FFFFFF',
  accent:       '#FCD34D',                       // dorado Cashflow
  footerText:   'rgba(255,255,255,0.50)',
  scrollbar:    'rgba(255,255,255,0.12)',
  panelBg:      '#1a3380',
  panelBorder:  'rgba(255,255,255,0.12)',
};

// Modo oscuro — azul más profundo para contraste oscuro
const sidebarDark: SidebarPalette = {
  bg:           '#172554',                       // azul más oscuro en dark
  bgHover:      'rgba(255,255,255,0.08)',
  bgActive:     'rgba(255,255,255,0.08)',
  border:       'rgba(255,255,255,0.10)',
  separator:    'transparent',
  text:         'rgba(255,255,255,0.85)',
  textActive:   '#FFFFFF',
  textCategory: 'rgba(255,255,255,0.50)',
  textSub:      'rgba(255,255,255,0.65)',
  textSubHover: '#FFFFFF',
  accent:       '#FCD34D',
  footerText:   'rgba(255,255,255,0.45)',
  scrollbar:    'rgba(255,255,255,0.10)',
  panelBg:      '#162050',
  panelBorder:  'rgba(255,255,255,0.10)',
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
  id:           string;
  label:        string;
  Icon:         LucideIcon;
  items:        SubItem[];
  sectionLabel?: string; // si está presente → renderizar separador de sección ANTES de esta categoría
}

const QUICK_ITEMS: QuickItem[] = [
  { path: '/dashboard', label: 'Dashboard',      Icon: LayoutDashboard },
  { path: '/pos',       label: 'Punto de Venta', Icon: ShoppingCart,    badge: 'POS' },
  { path: '/caja',      label: 'Caja Diaria',    Icon: Wallet },
];

const MENU_CATEGORIES: MenuCategory[] = [

  // ─── VENTAS & CLIENTES ─────────────────────────────────────────────────────
  {
    id: 'ventas', label: 'Ventas & Clientes', Icon: TrendingUp, sectionLabel: 'VENTAS',
    items: [
      { path: '/facturas',             label: 'Facturas' },
      { path: '/cotizaciones',         label: 'Cotizaciones' },
      { path: '/pre-facturas',         label: 'Pre-Facturas' },
      { path: '/facturas-recurrentes', label: 'Facturación Recurrente' },
      { path: '/notas-credito',        label: 'Notas de Crédito' },
      { path: '/notas-debito',         label: 'Notas de Débito' },
      { path: '/devoluciones',         label: 'Devoluciones' },
      { path: '/clientes',             label: 'Lista de Clientes' },
      { path: '/credito-cliente',      label: 'Crédito al Cliente' },
      { path: '/cxc',                  label: 'Cuentas por Cobrar' },
      { path: '/cuotas',               label: 'Cuotas / Pagos' },
      { path: '/recibos-cobro',        label: 'Recibos de Cobro' },
      { path: '/fidelidad',            label: 'Fidelidad & Puntos' },
      { path: '/conduces',             label: 'Conduces / Entregas' },
    ],
  },

  // ─── COMPRAS & GASTOS ──────────────────────────────────────────────────────
  {
    id: 'compras', label: 'Compras & Gastos', Icon: ClipboardList, sectionLabel: 'COMPRAS',
    items: [
      { path: '/solicitudes-compra',    label: 'Solicitudes de Compra' },
      { path: '/compras',               label: 'Órdenes de Compra' },
      { path: '/proveedores',           label: 'Proveedores' },
      { path: '/cxp',                   label: 'Cuentas por Pagar' },
      { path: '/notas-credito-compras', label: 'NC de Compras' },
      { path: '/gastos',                label: 'Gastos Operativos' },
      { path: '/caja-chica',            label: 'Caja Chica' },
    ],
  },

  // ─── INVENTARIO & LOGÍSTICA ────────────────────────────────────────────────
  {
    id: 'inventario', label: 'Inventario & Logística', Icon: Boxes, sectionLabel: 'INVENTARIO',
    items: [
      { path: '/productos',          label: 'Productos' },
      { path: '/almacenes',          label: 'Almacenes / Bodegas' },
      { path: '/inventario',         label: 'Movimientos de Stock' },
      { path: '/conteo-inventario',  label: 'Conteo Físico' },
      { path: '/uom',                label: 'Unidades de Medida' },
      { path: '/valoracion-stock',   label: 'Valoración AVCO' },
      { path: '/etiquetas',          label: 'Etiquetas QR' },
      { path: '/wms',                label: 'WMS — Almacén' },
      { path: '/manufactura',        label: 'Manufactura' },
      { path: '/planeacion-demanda', label: 'Planeación de Demanda' },
      { path: '/flota',              label: 'Flota de Vehículos' },
    ],
  },

  // ─── FINANZAS & CONTABILIDAD ───────────────────────────────────────────────
  {
    id: 'finanzas', label: 'Finanzas & Contabilidad', Icon: Banknote, sectionLabel: 'FINANZAS',
    items: [
      { path: '/bancos',                label: 'Bancos / Tesorería' },
      { path: '/depositos',             label: 'Depósitos Bancarios' },
      { path: '/cheques',               label: 'Cheques y Pagos' },
      { path: '/datafono',              label: 'DataFono / Tarjetas' },
      { path: '/divisas',               label: 'Divisas & Cambio' },
      { path: '/contabilidad',          label: 'Asientos Contables' },
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
    id: 'fiscal', label: 'Fiscal (DGII)', Icon: Receipt, sectionLabel: 'FISCAL',
    items: [
      { path: '/ecf',           label: 'e-CF — Panel DGII' },
      { path: '/declaraciones', label: 'Declaraciones 606/607' },
      { path: '/retenciones',   label: 'Retenciones ISR' },
    ],
  },

  // ─── COMERCIAL & SERVICIOS ─────────────────────────────────────────────────
  {
    id: 'comercial', label: 'Comercial & Servicios', Icon: Briefcase, sectionLabel: 'COMERCIAL',
    items: [
      { path: '/crm',          label: 'Leads & Oportunidades' },
      { path: '/vendedores',   label: 'Vendedores' },
      { path: '/comisiones',   label: 'Comisiones' },
      { path: '/licitaciones', label: 'Licitaciones' },
      { path: '/encuestas',    label: 'Encuestas NPS/CSAT' },
      { path: '/proyectos',    label: 'Proyectos' },
      { path: '/contratos',    label: 'Contratos' },
      { path: '/servicios',    label: 'Órdenes de Servicio' },
      { path: '/mantenimiento', label: 'Mantenimiento' },
      { path: '/objetivos',    label: 'Objetivos OKR' },
    ],
  },

  // ─── RECURSOS HUMANOS ──────────────────────────────────────────────────────
  {
    id: 'rrhh', label: 'Recursos Humanos', Icon: UserCheck, sectionLabel: 'RRHH',
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

  // ─── REPORTES & ANÁLISIS ────────────────────────────────────────────────────
  {
    id: 'reportes', label: 'Reportes & Análisis', Icon: BarChart3, sectionLabel: 'REPORTES',
    items: [
      { path: '/reportes',           label: 'Reportes' },
      { path: '/analytics',          label: 'Business Intelligence' },
      { path: '/kpi',                label: 'KPI Ejecutivo' },
      { path: '/generador-reportes', label: 'Generador de Reportes' },
      { path: '/asistente',          label: '🤖 Asistente IA' },
      { path: '/calendario',         label: 'Calendario DGII' },
    ],
  },

  // ─── SISTEMA ────────────────────────────────────────────────────────────────
  {
    id: 'sistema', label: 'Sistema', Icon: Settings, sectionLabel: 'SISTEMA',
    items: [
      { path: '/configuracion', label: 'Configuración' },
      { path: '/mis-empresas',  label: 'Empresas' },
      { path: '/sucursales',    label: 'Sucursales' },
      { path: '/equipo',        label: 'Usuarios y Roles' },
      { path: '/auditoria',     label: 'Auditoría' },
      { path: '/aprobaciones',  label: 'Aprobaciones' },
      { path: '/importacion',   label: 'Importación CSV' },
      { path: '/documentos',    label: 'Documentos' },
      { path: '/contactos',     label: 'Directorio' },
    ],
  },
];

// ── Orden de jerarquía de planes ─────────────────────────────────────────────
const PLAN_TIER: Record<PlanTipo, number> = {
  emprendedor: 1, pyme: 2, pro: 3, plus: 4,
  // Legado
  trial: 0, basico: 1, profesional: 2, empresarial: 3, enterprise: 4,
};
const PLAN_NOMBRE: Record<PlanTipo, string> = {
  emprendedor: 'Emprendedor', pyme: 'Pyme', pro: 'Pro', plus: 'Plus',
  // Legado
  trial: 'Trial', basico: 'Básico', profesional: 'Profesional',
  empresarial: 'Empresarial', enterprise: 'Enterprise',
};

// Todos los módulos están disponibles en todos los planes (Emprendedor, PYME, PRO, PLUS).
// La única restricción es: ingresos mensuales y número de usuarios — NO módulos.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PATH_MIN_PLAN: Record<string, PlanTipo> = {};

function esRutaBloqueada(_path: string, _planActual: PlanTipo): boolean {
  return false; // sin restricción de módulos por plan
}

// ── Control de acceso por rol ─────────────────────────────────────────────────
// Define qué roles pueden VER cada ruta en el sidebar y navegar a ella.
// Las rutas sin entrada son accesibles por todos los roles autenticados.

const ADMIN             = ['admin'];
const ADMIN_CONT        = ['admin', 'contador'];
const ADMIN_CONT_VEND   = ['admin', 'contador', 'vendedor'];

const PATH_ROLES: Record<string, string[]> = {
  // ── Solo Admin ────────────────────────────────────────────────────────────
  '/configuracion':      ADMIN,
  '/equipo':             ADMIN,
  '/sucursales':         ADMIN,
  '/aprobaciones':       ADMIN,
  '/importacion':        ADMIN,
  '/auditoria':          ADMIN,

  // ── Admin + Contador ──────────────────────────────────────────────────────
  '/compras':               ADMIN_CONT,
  '/solicitudes-compra':    ADMIN_CONT,
  '/proveedores':           ADMIN_CONT,
  '/cxp':                   ADMIN_CONT,
  '/gastos':                ADMIN_CONT,
  '/caja-chica':            ADMIN_CONT,
  '/notas-credito-compras': ADMIN_CONT,
  '/bancos':                ADMIN_CONT,
  '/depositos':             ADMIN_CONT,
  '/cheques':               ADMIN_CONT,
  '/datafono':              ADMIN_CONT,
  '/divisas':               ADMIN_CONT,
  '/contabilidad':          ADMIN_CONT,
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
  '/retenciones':           ADMIN_CONT,
  '/declaraciones':         ADMIN_CONT,
  '/reportes':              ADMIN_CONT,
  '/analytics':             ADMIN_CONT,
  '/kpi':                   ADMIN_CONT,
  '/generador-reportes':    ADMIN_CONT,
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

  // ── Admin + Contador + Vendedor — SOLO estos 4 módulos ──────────────────────
  '/facturas':              ADMIN_CONT_VEND,
  '/cotizaciones':          ADMIN_CONT_VEND,
  '/clientes':              ADMIN_CONT_VEND,

  // ── Admin + Contador (vendedor ya NO tiene acceso) ────────────────────────
  '/pre-facturas':          ADMIN_CONT,
  '/notas-credito':         ADMIN_CONT,
  '/notas-debito':          ADMIN_CONT,
  '/devoluciones':          ADMIN_CONT,
  '/facturas-recurrentes':  ADMIN_CONT,
  '/cxc':                   ADMIN_CONT,
  '/recibos-cobro':         ADMIN_CONT,
  '/conduces':              ADMIN_CONT,
  '/fidelidad':             ADMIN_CONT,
  '/cuotas':                ADMIN_CONT,
  '/credito-cliente':       ADMIN_CONT,
  '/productos':             ADMIN_CONT,
  '/inventario':            ADMIN_CONT,
  '/conteo-inventario':     ADMIN_CONT,
  '/etiquetas':             ADMIN_CONT,
  '/uom':                   ADMIN_CONT,
  '/valoracion-stock':      ADMIN_CONT,
  '/caja':                  ADMIN_CONT,
  '/servicios':             ADMIN_CONT,

  // ── QUICK_ITEMS filtrados ─────────────────────────────────────────────────
  '/pos':                   ADMIN_CONT_VEND,   // POS permitido para vendedor
};

function rolPuedeVerRuta(path: string, role: string): boolean {
  const allowed = PATH_ROLES[path];
  if (!allowed) return true; // sin restricción = todos los roles
  return allowed.includes(role);
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
  // Sin segundos y con whiteSpace:nowrap para evitar el corte "p. m."
  const hora = time.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <Text type="secondary" style={{ fontSize: 12, fontFeatureSettings: '"tnum"', letterSpacing: .3, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {hora}
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
    emprendedor: '#0EA5E9', pyme: '#10B981', pro: '#0d9488', plus: '#4F46E5',
    trial: '#94A3B8', basico: '#3B82F6',
    profesional: '#8B5CF6', empresarial: '#F59E0B', enterprise: '#EF4444',
  };
  const LABEL: Record<string, string> = {
    emprendedor: 'EMPRENDEDOR', pyme: 'PYME', pro: 'PRO', plus: 'PLUS',
    trial: 'TRIAL', basico: 'BÁSICO', profesional: 'PRO',
    empresarial: 'EMPR.', enterprise: 'ENT.',
  };
  const color   = COLOR[plan] ?? '#64748B';
  const label   = LABEL[plan] ?? plan.toUpperCase();
  const estado  = suscripcion.estado as string;
  const enPrueba = estado === 'prueba';
  const urgente  = enPrueba && dias <= 5;

  return (
    <Tooltip title={`Plan ${suscripcion.info?.nombre ?? label}${enPrueba ? ` · Prueba gratis — ${dias} días restantes` : dias > 0 ? ` · vence en ${dias} días` : ''} — Click para ver planes`}>
      <button
        onClick={() => navigate('/suscripcion/planes')}
        style={{
          background: urgente ? '#FEF2F222' : `${color}18`,
          border: `1px solid ${urgente ? '#EF444455' : `${color}55`}`,
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          animation: urgente ? 'pulse 2s infinite' : 'none',
        }}>
        <span style={{ color: urgente ? '#EF4444' : color, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {enPrueba && dias > 0 && (
          <span style={{ color: urgente ? '#EF4444' : '#94A3B8', fontSize: 10, whiteSpace: 'nowrap' }}>
            {dias}d prueba
          </span>
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
        padding:        collapsed ? '7px 0' : '7px 14px',
        height:         36,
        border:         'none',
        cursor:         'pointer',
        borderRadius:   6,
        justifyContent: collapsed ? 'center' : 'flex-start',
        position:       'relative',
        background:     active ? C.bgActive : hover ? C.bgHover : 'transparent',
        transition:     'all 0.15s ease',
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
        style={{ color: active ? C.accent : hover ? C.text : C.textSub, flexShrink: 0 }}
      />

      {!collapsed && (
        <>
          <span style={{
            flex:         1,
            fontSize:     13,
            fontWeight:   active ? 600 : 500,
            color:        active ? C.textActive : hover ? C.text : C.text,
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
              borderRadius: 6, background: active ? C.accent : C.accent,
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
          padding:        '7px 12px',
          height:         34,
          border:         'none',
          cursor:         'pointer',
          borderRadius:   6,
          position:       'relative',
          background:     hover ? C.bgHover : 'transparent',
          margin:         '0 8px',
          transition:     'background 0.15s',
        }}
      >
        {/* Borde dorado izquierdo cuando hay sub-item activo */}
        {hasActiveSub && (
          <span style={{
            position: 'absolute', left: 0, top: 6, bottom: 6,
            width: 3, borderRadius: '0 3px 3px 0', background: C.accent,
          }} />
        )}
        <category.Icon
          size={16}
          strokeWidth={2}
          style={{ color: C.textSub, flexShrink: 0 }}
        />
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 500,
          color: C.text,
          textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {category.label}
        </span>
        <ChevronDown
          size={13} strokeWidth={2}
          style={{
            color: C.textSub, flexShrink: 0,
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
          width: 'calc(100% - 8px)', margin: '1px 4px',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px 7px 20px',
          height: 'auto', minHeight: 32,
          borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
          borderTop: 'none', borderRight: 'none', borderBottom: 'none',
          cursor: locked ? 'not-allowed' : 'pointer',
          borderRadius: '0 6px 6px 0',
          background: active ? C.bgActive : hover ? C.bgHover : 'transparent',
          transition: 'all 0.12s ease', textAlign: 'left',
          opacity: locked ? 0.7 : 1,
        }}
      >
        <span style={{
          fontSize: 11, flexShrink: 0, lineHeight: 1,
          color: active ? C.accent : 'rgba(255,255,255,0.35)',
          transition: 'color 0.12s',
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
  onClick:    (e: React.MouseEvent<HTMLButtonElement>) => void;
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
          background: isActive ? C.bgActive : hover ? C.bgHover : 'transparent',
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
          style={{ color: (isActive || hasActiveSub) ? C.textActive : hover ? C.text : C.textCategory }}
        />
      </button>
    </Tooltip>
  );
}

// ── Panel secundario (flyout) ─────────────────────────────────────────────────
function FlyoutPanel({
  category, activePath, sidebarWidth, panelTop, onNavigate, onClose, planActual, onLocked,
}: {
  category:     MenuCategory;
  activePath:   string;
  sidebarWidth: number;
  panelTop:     number;     // posición Y del botón que lo abrió
  onNavigate:   (path: string) => void;
  onClose:      () => void;
  planActual:   PlanTipo;
  onLocked:     (item: SubItem, planMinimo: PlanTipo) => void;
}) {
  const C = useC();

  // Ajuste automático si el flyout se sale de la pantalla por abajo
  const HEADER_H = 42;
  const ITEM_H   = 34;
  const PADDING  = 10;
  const estimatedH = HEADER_H + category.items.length * ITEM_H + PADDING;
  const adjustedTop = Math.max(
    8,
    Math.min(panelTop, window.innerHeight - estimatedH - 8),
  );

  return (
    <>
      {/* Overlay full-screen: captura clicks fuera del flyout y del sidebar */}
      <div
        onMouseDown={onClose}
        style={{
          position: 'fixed',
          inset:    0,
          zIndex:   149,
        }}
      />

      <motion.div
        key={category.id}
        initial={{ opacity: 0, x: -8, scale: 0.97 }}
        animate={{ opacity: 1, x: 0,  scale: 1    }}
        exit={{    opacity: 0, x: -8, scale: 0.97 }}
        transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position:      'fixed',
          left:          sidebarWidth,
          top:           adjustedTop,
          width:         200,
          // height AUTO — se ajusta al número de items
          background:    C.panelBg,
          boxShadow:     '4px 4px 16px rgba(0,0,0,0.35)',
          zIndex:        200,
          display:       'flex',
          flexDirection: 'column',
          borderRadius:  '0 8px 8px 0',
          overflow:      'hidden',
          borderRight:   `1px solid ${C.panelBorder}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding:      '10px 14px',
          borderBottom: `1px solid ${C.panelBorder}`,
          flexShrink:   0,
          display:      'flex',
          alignItems:   'center',
          gap:          8,
        }}>
          <category.Icon size={13} strokeWidth={2.5} style={{ color: C.accent, flexShrink: 0 }} />
          <span style={{
            fontSize:      11,
            fontWeight:    700,
            color:         C.textSub,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            flex:          1,
            overflow:      'hidden',
            textOverflow:  'ellipsis',
            whiteSpace:    'nowrap',
          }}>
            {category.label}
          </span>
        </div>

        {/* Items — sin scroll (height auto ajustada al contenido) */}
        <div style={{ padding: '5px 0' }}>
          {category.items.map((item, idx) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0  }}
              transition={{ delay: idx * 0.015, duration: 0.1 }}
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
          fontSize: 11, flexShrink: 0, lineHeight: 1,
          color: active ? C.accent : C.textCategory, transition: 'color 0.12s',
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

// ── Color determinista para avatar de empresa ────────────────────────────────
function getEmpresaColor(nombre: string): string {
  const PALETTE = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316'];
  return PALETTE[(nombre.charCodeAt(0) || 72) % PALETTE.length];
}

// ── Grupos del menú configurables por el usuario ─────────────────────────────
const GRUPOS_MENU = [
  { key: 'ventas',     label: 'Ventas & Clientes',         obligatorio: false },
  { key: 'compras',    label: 'Compras & Gastos',          obligatorio: false },
  { key: 'inventario', label: 'Inventario & Logística',    obligatorio: false },
  { key: 'finanzas',   label: 'Finanzas & Contabilidad',   obligatorio: false },
  { key: 'fiscal',     label: 'Fiscal (DGII)',             obligatorio: false },
  { key: 'comercial',  label: 'Comercial & Servicios',     obligatorio: false },
  { key: 'rrhh',       label: 'Recursos Humanos',          obligatorio: false },
  { key: 'reportes',   label: 'Reportes & Análisis',       obligatorio: false },
  { key: 'sistema',    label: 'Sistema',                   obligatorio: false },
] as const;

type GrupoMenuKey = typeof GRUPOS_MENU[number]['key'];
const TODOS_LOS_GRUPOS: string[] = GRUPOS_MENU.map(g => g.key);

// ── AppLayout principal ───────────────────────────────────────────────────────
export default function AppLayout() {
  useRealtime();   // ← conexión WebSocket para actualizaciones en vivo

  const [collapsed,       setCollapsed]       = useState(false);
  const [cmdOpen,         setCmdOpen]         = useState(false);
  const [helpOpen,        setHelpOpen]        = useState(false);
  const [mobileOpen,      setMobileOpen]      = useState(false);
  const [modalEmpresa,    setModalEmpresa]    = useState(false);
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [modalMenu,       setModalMenu]       = useState(false);
  // Modal de upgrade cuando se hace click en módulo bloqueado
  const [upgradeModal, setUpgradeModal] = useState<{ label: string; planMinimo: PlanTipo } | null>(null);

  const { plan: planActual, suspendida, suscripcion } = usePlan();

  // Mostrar pantalla de suspensión cuando la empresa está suspendida
  if (suspendida) {
    return (
      <SuspensionScreen
        planActual={suscripcion?.plan}
        fechaVencimiento={suscripcion?.fechaFinPrueba ?? suscripcion?.fechaVencimiento}
      />
    );
  }

  const handleLocked = (item: SubItem, planMinimo: PlanTipo) => {
    setUpgradeModal({ label: item.label, planMinimo });
  };

  const location   = useLocation();
  const activePath = location.pathname;

  // Accordion (modo expandido): qué categorías están abiertas
  // Accordion: solo UNA categoría abierta a la vez
  const [openCategories, setOpenCategories] = useState<string | null>(() => {
    const active = MENU_CATEGORIES.find(g =>
      g.items.some(i => activePath.startsWith(i.path))
    );
    return active?.id ?? null;
  });

  // Auto-abrir la categoría de la ruta activa al navegar
  useEffect(() => {
    const activeGroup = MENU_CATEGORIES.find(g =>
      g.items.some(i => activePath.startsWith(i.path))
    );
    if (activeGroup && openCategories !== activeGroup.id) {
      setOpenCategories(activeGroup.id);
    }
  }, [activePath]);

  // Flyout (modo colapsado): qué categoría activa el panel secundario
  // { id, top } → id del grupo + posición Y del botón que lo abrió
  const [activePanel, setActivePanel] = useState<{ id: string; top: number } | null>(null);

  // Refs para detectar clicks fuera del flyout
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { total: totalAlertas, criticas: alertasCriticas, alertas } = useAlertas();
  const { status: pushStatus, subscribe: pushSubscribe, unsubscribe: pushUnsub } = usePushNotifications();
  const { user, logout }                = useAuthStore();

  // ── Guard de ruta por rol ──────────────────────────────────────────────────
  // Si el usuario navega directamente a una URL restringida, redirigir al dashboard
  const currentUserRole = user?.role ?? 'viewer';
  if (user && !rolPuedeVerRuta(activePath, currentUserRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { token }                       = theme.useToken();
  const navigate                        = useNavigate();

  // Solo el super_admin ve la entrada /super-admin en el sidebar
  const esSuperAdmin = user?.role === 'super_admin';

  const userRole = user?.role ?? 'viewer';

  // Categorías filtradas: oculta /super-admin para usuarios normales,
  // oculta rutas que el rol no puede ver, y aplica preferencias del menú
  const categoriasFiltradas = MENU_CATEGORIES
    .filter(cat => menuActivos.includes(cat.id) || !TODOS_LOS_GRUPOS.includes(cat.id))
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        (item.path !== '/super-admin' || esSuperAdmin) &&
        rolPuedeVerRuta(item.path, userRole)
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

  // Si la query ya cargó, no hay empresas vinculadas y no hay empresaId en localStorage
  useEffect(() => {
    if (!empresasLoaded || misEmpresas.length > 0 || localStorage.getItem('empresaId')) return;

    const rol = user?.role ?? 'viewer';
    const puedeCrearEmpresa = ['admin', 'super_admin'].includes(rol);

    if (puedeCrearEmpresa) {
      // Admin → puede crear su primera empresa
      if (!window.location.pathname.startsWith('/mis-empresas')) {
        navigate('/mis-empresas');
      }
    } else {
      // Viewer/vendedor/contador → fueron invitados, no crean empresas.
      // Redirigir a página de espera en lugar de la de creación.
      if (!window.location.pathname.startsWith('/sin-empresa')) {
        navigate('/sin-empresa');
      }
    }
  }, [empresasLoaded, misEmpresas.length, navigate, user?.role]);

  // ── Accordion (expandido) ────────────────────────────────────────────────────
  // Toggle accordion: abre la seleccionada, cierra la anterior
  const toggleCategory = useCallback((id: string) => {
    setOpenCategories(prev => (prev === id ? null : id));
  }, []);

  // ── Flyout (colapsado) ───────────────────────────────────────────────────────
  const closePanel  = useCallback(() => setActivePanel(null), []);
  const togglePanel = useCallback((id: string, top: number) =>
    setActivePanel(prev => (prev?.id === id ? null : { id, top })), []);

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
  const isMobile  = useMobile();
  const isTablet  = useTablet();

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
      if (openCategories) {
        const cat = MENU_CATEGORIES.find(c => c.id === openCategories);
        cat?.items.forEach(item => prefetchRoute(item.path));
      }
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

  const empresaNombre = (misEmpresas as any[]).find((e: any) => e.empresaId === empresaActiva)?.nombre ?? '';

  // ── Preferencias de menú ───────────────────────────────────────────────────
  const menuStorageKey = `hicloud-menu-${user?.id ?? 'default'}`;
  const [menuActivos, setMenuActivos] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`hicloud-menu-${user?.id ?? 'default'}`);
      if (saved) return JSON.parse(saved) as string[];
    } catch { /* ignorar */ }
    return TODOS_LOS_GRUPOS;
  });
  const [menuTemp, setMenuTemp] = useState<string[]>(menuActivos);

  const toggleGrupoTemp = (key: string) => {
    const grupo = GRUPOS_MENU.find(g => g.key === key);
    if (grupo?.obligatorio) return;
    setMenuTemp(prev => {
      if (prev.includes(key)) {
        const sinEste = prev.filter(k => k !== key);
        if (sinEste.length < 1) {
          message.warning('Debe haber al menos un módulo visible');
          return prev;
        }
        return sinEste;
      }
      return [...prev, key];
    });
  };

  const aplicarMenu = () => {
    setMenuActivos(menuTemp);
    try { localStorage.setItem(menuStorageKey, JSON.stringify(menuTemp)); } catch { /* ignorar */ }
    setModalMenu(false);
    message.success('Menú actualizado');
  };

  const cancelarMenu = () => {
    setMenuTemp(menuActivos);
    setModalMenu(false);
  };
  const empresasFiltradas = (misEmpresas as any[]).filter((e: any) =>
    e.nombre?.toLowerCase().includes(busquedaEmpresa.toLowerCase())
  );

  const SidebarContent = (
    <div style={{
      width:         collapsed ? 64 : 220,
      height:        '100%',
      display:       'flex',
      flexDirection: 'column',
      background:    C.bg,
      transition:    'width 0.25s ease',
      overflowX:     'hidden',
    }}>

      {/* ── Header Fila 1: Logo + botón colapsar ────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding:        collapsed ? '16px 12px 10px' : '14px 16px 10px',
        flexShrink:     0,
      }}>
        {collapsed ? (
          <img
            src="/logo-hicloud.png"
            alt="HiCloud"
            style={{ width: 32, height: 32, objectFit: 'contain' }}
          />
        ) : (
          <motion.div
            key="logo-full"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
          >
            <img
              src="/logo-hicloud.png"
              alt="HiCloud ERP"
              style={{ height: 28, width: 'auto', objectFit: 'contain' }}
            />
          </motion.div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(v => !v)}
            title="Colapsar menú"
            style={{
              background: 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer',
              color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, flexShrink: 0, transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ── Header Fila 2: Avatar empresa + nombre + "⋯" ───────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding:        collapsed ? '2px 12px 14px' : '2px 12px 14px 16px',
        borderBottom:   `1px solid ${C.border}`,
        flexShrink:     0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: collapsed ? undefined : 1 }}>
          {/* Avatar con iniciales */}
          <div
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            title={collapsed ? (empresaNombre || 'Mi Empresa') : undefined}
            style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: getEmpresaColor(empresaNombre || 'H'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#FFFFFF',
              cursor: collapsed ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {(empresaNombre || 'HI').slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <span style={{
              fontSize: 12.5, fontWeight: 500, color: C.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {empresaNombre || 'Mi Empresa'}
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setModalEmpresa(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.textCategory, padding: '2px 4px', borderRadius: 4,
              display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = C.text)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textCategory)}
          >
            <MoreHorizontal size={15} />
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

        {/* Items rápidos (sin categoría) — filtrados por rol */}
        <div style={{ marginBottom: 6 }}>
          {QUICK_ITEMS.filter(item => rolPuedeVerRuta(item.path, userRole)).map(item => (
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
            – Expandido → accordion inline con separadores de sección
            – Colapsado → ícono que abre panel flyout              */}
        {categoriasFiltradas.map(cat => (
          <div key={cat.id} style={{ marginBottom: 2 }}>
            {/* Divider sutil entre grupos (sin label) */}
            {cat.sectionLabel && (
              <div style={{
                height: 1,
                background: C.separator,
                margin: '6px 12px',
                opacity: 0.6,
              }} />
            )}
            {collapsed ? (
              <CategoryBtnCollapsed
                category={cat}
                activePath={activePath}
                isActive={activePanel?.id === cat.id}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  togglePanel(cat.id, rect.top);
                }}
              />
            ) : (
              <CategoryAccordion
                category={cat}
                activePath={activePath}
                isOpen={openCategories === cat.id}
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

      {/* ── Opciones de Menú ────────────────────────────────────── */}
      {!collapsed && (
        <button
          onClick={() => { setMenuTemp(menuActivos); setModalMenu(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', background: 'none', border: 'none',
            cursor: 'pointer', color: C.footerText, fontSize: 12,
            width: '100%', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.color = C.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none';    e.currentTarget.style.color = C.footerText; }}
        >
          <AppstoreOutlined style={{ fontSize: 13 }} />
          Opciones de Menú
        </button>
      )}

      {/* ── Footer: usuario + acciones ──────────────────────────── */}
      <div style={{
        borderTop:  `1px solid ${C.border}`,
        padding:    collapsed ? '10px 0' : '10px 12px',
        flexShrink: 0,
        background: C.bg,
      }}>
        {collapsed ? (
          /* Colapsado: avatar usuario + expand */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Tooltip title={user?.nombre ?? 'Perfil'} placement="right">
              <button onClick={() => navigate('/profile')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
                <Avatar size={28} style={{ background: '#FCD34D', color: '#1E3A8A', fontSize: 12 }}>
                  {user?.nombre?.charAt(0).toUpperCase()}
                </Avatar>
              </button>
            </Tooltip>
            <Tooltip title="Notificaciones" placement="right">
              <Badge count={totalAlertas} size="small" offset={[-4, 4]}
                style={{ background: alertasCriticas > 0 ? '#dc2626' : '#d97706' }}>
                <button onClick={() => setCollapsed(false)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                    color: C.footerText, display: 'flex', padding: 2 }}>
                  <Bell size={14} />
                </button>
              </Badge>
            </Tooltip>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Avatar + nombre + rol */}
            <button onClick={() => navigate('/profile')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                flex: 1, minWidth: 0, padding: '2px 0', textAlign: 'left' }}>
              <Avatar size={28} style={{ background: '#FCD34D', color: '#1E3A8A', fontSize: 12, flexShrink: 0 }}>
                {user?.nombre?.charAt(0).toUpperCase()}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.nombre?.split(' ')[0]}
                </div>
                <div style={{ fontSize: 10, color: C.footerText, textTransform: 'capitalize' }}>
                  {user?.role === 'super_admin' ? 'Super Admin' : user?.role}
                </div>
              </div>
            </button>

            {/* Notificaciones */}
            <Badge count={totalAlertas} size="small" offset={[-3, 3]}
              style={{ background: alertasCriticas > 0 ? '#dc2626' : '#d97706' }}>
              <Dropdown trigger={['click']} menu={{ items: [] }}
                dropdownRender={() => (
                  <div style={{
                    background: token.colorBgElevated,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                    width: 320, padding: 8,
                  }}>
                    <div style={{ padding: '6px 8px 10px',
                      borderBottom: `1px solid ${token.colorBorderSecondary}`, marginBottom: 6 }}>
                      <Text strong style={{ fontSize: 13 }}>Alertas</Text>
                      {totalAlertas > 0 && <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>{totalAlertas}</Tag>}
                    </div>
                    {alertas.length === 0 ? (
                      <div style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>✅ Sin alertas</Text>
                      </div>
                    ) : alertas.slice(0, 5).map((a: any) => (
                      <div key={a.id} onClick={() => navigate(a.ruta)}
                        style={{ display: 'flex', gap: 8, padding: '8px',
                          borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                          background: a.severidad === 'alta' ? token.colorErrorBg
                            : a.severidad === 'media' ? token.colorWarningBg : token.colorFillAlter }}>
                        <span style={{ fontSize: 16 }}>{a.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: 11, display: 'block' }}>{a.titulo}</Text>
                          <Text type="secondary" style={{ fontSize: 10 }}>{a.descripcion}</Text>
                        </div>
                      </div>
                    ))}
                    {alertas.length > 0 && (
                      <div style={{ textAlign: 'center', paddingTop: 6,
                        borderTop: `1px solid ${token.colorBorderSecondary}`, marginTop: 4 }}>
                        <Button type="link" size="small" onClick={() => navigate('/reportes')}>
                          Ver todas →
                        </Button>
                      </div>
                    )}
                  </div>
                )}>
                <button style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                  color: C.footerText, display: 'flex', padding: 4, borderRadius: 6,
                  transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.footerText)}>
                  <Bell size={14} />
                </button>
              </Dropdown>
            </Badge>

            {/* Toggle tema */}
            <button onClick={toggleTheme}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.footerText, display: 'flex', padding: 4, borderRadius: 6,
                transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.footerText)}>
              {isDark
                ? <SunOutlined style={{ fontSize: 13, color: '#facc15' }} />
                : <MoonOutlined style={{ fontSize: 13 }} />
              }
            </button>

            {/* Ayuda */}
            <button onClick={() => setHelpOpen(true)} title="Ayuda (F1)"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: C.footerText, display: 'flex', padding: 4, borderRadius: 6,
                transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.footerText)}>
              <HelpCircle size={13} />
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
              width:       collapsed ? 64 : 220,
              minWidth:    collapsed ? 64 : 220,
              height:      '100%',
              flexShrink:  0,
              transition:  'width 0.25s ease, min-width 0.25s ease',
              boxShadow:   '2px 0 8px rgba(0,0,0,0.18)',
              zIndex:      100,
              overflow:    'hidden',
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
                width:      220,
                zIndex:     200,
                transform:  mobileOpen ? 'translateX(0)' : 'translateX(-220px)',
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
            const cat = categoriasFiltradas.find(c => c.id === activePanel.id);
            if (!cat) return null;
            return (
              <FlyoutPanel
                key={activePanel.id}
                category={cat}
                activePath={activePath}
                sidebarWidth={collapsed ? 64 : 220}
                panelTop={activePanel.top}
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

          {/* ── Mini-topbar mobile (solo en pantallas pequeñas) ──────── */}
          {isMobile && (
            <div style={{
              background:  '#1E3A8A',
              padding:     '0 16px',
              height:       52,
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'space-between',
              flexShrink:  0,
            }}>
              <button onClick={() => setMobileOpen(v => !v)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#fff', display: 'flex', padding: 4 }}>
                <Menu size={22} strokeWidth={2} />
              </button>
              <img src="/logo-hicloud.png" alt="HiCloud" style={{ height: 26, objectFit: 'contain' }} />
              <Badge count={totalAlertas} size="small"
                style={{ background: alertasCriticas > 0 ? '#dc2626' : '#d97706' }}>
                <button onClick={() => setCmdOpen(true)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.8)', display: 'flex', padding: 4 }}>
                  <SearchOutlined style={{ fontSize: 18 }} />
                </button>
              </Badge>
            </div>
          )}

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

      {/* ── Modal Opciones de Menú ───────────────────────────────── */}
      <Modal
        open={modalMenu}
        onCancel={cancelarMenu}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={cancelarMenu}>Cancelar</Button>
            <Button type="primary" onClick={aplicarMenu}>Aplicar</Button>
          </div>
        }
        width={420}
        title={
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Mostrar en Menú</div>
            <div style={{ fontSize: 12, fontWeight: 400, color: '#9CA3AF', marginTop: 2 }}>
              Elige los módulos que deseas ver en el menú
            </div>
          </div>
        }
      >
        <div style={{ padding: '4px 0' }}>
          {GRUPOS_MENU.map((grupo, idx) => (
            <div
              key={grupo.key}
              onClick={() => toggleGrupoTemp(grupo.key)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 4px', cursor: grupo.obligatorio ? 'default' : 'pointer',
                borderBottom: idx < GRUPOS_MENU.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500 }}>{grupo.label}</span>
              <Checkbox
                checked={menuTemp.includes(grupo.key)}
                disabled={grupo.obligatorio}
                style={{ pointerEvents: 'none' }}
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Modal Cambiar Empresa ─────────────────────────────────── */}
      <Modal
        title="Cambiar Empresa"
        open={modalEmpresa}
        onCancel={() => { setModalEmpresa(false); setBusquedaEmpresa(''); }}
        footer={null}
        width={420}
        centered
      >
        <Input
          prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
          placeholder="Buscar una empresa..."
          value={busquedaEmpresa}
          onChange={e => setBusquedaEmpresa(e.target.value)}
          style={{ marginBottom: 12 }}
          autoFocus
        />

        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {empresasFiltradas.map((emp: any) => {
            const esActiva = emp.empresaId === empresaActiva;
            return (
              <div
                key={emp.empresaId}
                onClick={() => {
                  cambiarEmpresa(emp.empresaId);
                  setModalEmpresa(false);
                  setBusquedaEmpresa('');
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: esActiva ? '#EFF6FF' : 'transparent',
                  marginBottom: 4, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!esActiva) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                onMouseLeave={e => { if (!esActiva) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Avatar empresa */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: getEmpresaColor(emp.nombre || ''),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#FFFFFF',
                  userSelect: 'none',
                }}>
                  {(emp.nombre || 'HI').slice(0, 2).toUpperCase()}
                </div>
                {/* Nombre */}
                <span style={{
                  flex: 1, fontSize: 14,
                  fontWeight: esActiva ? 500 : 400,
                  color: '#111827',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {emp.nombre}
                </span>
                {/* Radio indicator */}
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${esActiva ? '#0EA5E9' : '#D1D5DB'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {esActiva && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9' }} />
                  )}
                </div>
              </div>
            );
          })}
          {empresasFiltradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 13 }}>
              Sin resultados
            </div>
          )}
        </div>

        <Divider style={{ margin: '10px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={() => { setModalEmpresa(false); navigate('/mis-empresas'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 6, color: '#374151',
              fontSize: 14, width: '100%', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <PlusCircleOutlined style={{ color: '#6B7280' }} />
            Crear nueva empresa
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 6, color: '#374151',
              fontSize: 14, width: '100%', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <LogoutOutlined style={{ color: '#6B7280' }} />
            Salir
          </button>
        </div>
      </Modal>

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
