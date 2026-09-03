/**
 * Piezas compartidas del menu lateral.
 *
 * Vivian dentro de AppLayout.tsx. Se sacaron aqui para que el panel de Super
 * Admin use EL MISMO menu y no una copia: ya tenemos dos plantillas termicas y
 * dos formulas de cierre, y no queremos un tercer caso.
 *
 * El contenido es un traslado literal — ningun cambio de comportamiento.
 */
import { useEffect, useState, useCallback, useRef, createContext, useContext, Suspense, type ReactNode } from 'react';
import { useMobile, useTablet } from '../../../hooks/useMediaQuery';
import {
  Layout, Avatar, Dropdown, Typography, Badge, Space,
  Button, Tooltip, theme, Select, Tag, Modal, Input, Divider, Checkbox, message,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMisModulosAddon, useSucursalesQuery } from '../../../hooks/useCatalogQueries';
import api from '../../../api/client';
import { authApi } from '../../../api/auth.api';
import {
  LogoutOutlined, UserOutlined, BellOutlined,
  MoonOutlined, SunOutlined, SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, PlusCircleOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import {
  Home, Inbox, LayoutDashboard, ShoppingCart, Wallet, TrendingUp, Package,
  Boxes, Briefcase, Users, BarChart3, Settings, ChevronDown,
  Menu, HelpCircle, Building2, CreditCard, Receipt,
  FileText, BookOpen, PieChart, Database, Truck,
  UserCheck, Calculator, Shield, Bell, Globe, Wrench, Stethoscope, Pill,
  Factory, Target, Banknote, ClipboardList, Tags,
  FileCheck, X, Lock, ChevronLeft, ChevronRight, MoreHorizontal, UtensilsCrossed, Landmark, Sprout, GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { usePlan, type PlanTipo } from '../../../hooks/usePlan';
import SuspensionScreen from '../../ui/SuspensionScreen';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore }  from '../../../store/auth.store';
import { useThemeStore } from '../../../store/theme.store';
import CommandPalette    from '../../ui/CommandPalette';
import PageTransition    from '../../ui/PageTransition';
import PlanBanner        from '../../ui/PlanBanner';
import OnboardingTour    from '../../ui/OnboardingTour';
import HelpCenter        from '../../ui/HelpCenter';
import BottomNav         from '../BottomNav';
import PwaInstallBanner  from '../../ui/PwaInstallBanner';
import MobileWarningModal from '../../ui/MobileWarningModal';
import { useRealtime, useRealtimeStatus } from '../../../hooks/useRealtime';
import { useAlertas }    from '../../../hooks/useAlertas';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import { MENU_CATEGORIES_DATA, ADDON_IDS, PATH_ROLES, rolPuedeVerRuta } from '../../../config/menuConfig';
import { markNavigatingAway } from '../../../utils/sessionEvents';
import { ahora, hora, horaDelDiaRD } from '../../../utils/fechaRD';


const { Text } = Typography;


// ══ A  paletas, contexto, tipos ══
export type SidebarPalette = {
  // fondos + bordes
  bg: string; bgHover: string; bgActive: string; border: string;
  separator: string; scrollbar: string; panelBg: string; panelBorder: string;
  // texto
  text: string; textActive: string; textCategory: string;
  textSub: string; textSubHover: string; footerText: string;
  // acento
  accent: string;
  // íconos (valores directos — no pueden derivarse de bg cuando hay mezcla claro/oscuro)
  iconBg: string; iconColor: string; arrowColor: string; activeBorder: string;
  // chips / tags
  chipBg: string; chipInk: string;
  // avatar usuario footer
  avBg: string; avInk: string;
  // header logo
  headerGlow: string; wordmarkColor: string;
  // botón colapsar
  collapseBtn: string; collapseBtnHover: string;
  collapseBtnBorder: string; collapseBtnColor: string;
  // botones rápidos (Opciones / Buscar)
  quickBtnBg: string; quickBtnHover: string;
};

// ── Paletas del sidebar ───────────────────────────────────────────────────────
// 'dark' se usa cuando isDark=true; los 7 restantes son opciones del modo claro.
export const PALETTES: Record<string, SidebarPalette> = {
  dark: {
    bg:                'linear-gradient(160deg, #111e3d 0%, #080f20 100%)',
    bgHover:           'rgba(255,255,255,0.07)',
    bgActive:          'rgba(99,130,255,0.18)',
    border:            'rgba(255,255,255,0.07)',
    separator:         'rgba(255,255,255,0.07)',
    text:              'rgba(255,255,255,0.55)',
    textActive:        '#a0b4ff',
    textCategory:      'rgba(255,255,255,0.22)',
    textSub:           'rgba(255,255,255,0.45)',
    textSubHover:      'rgba(255,255,255,0.85)',
    accent:            '#7b9fff',
    footerText:        'rgba(255,255,255,0.30)',
    scrollbar:         'rgba(255,255,255,0.07)',
    panelBg:           '#111e3d',
    panelBorder:       'rgba(255,255,255,0.07)',
    iconBg:            'rgba(255,255,255,0.05)',
    iconColor:         'rgba(255,255,255,0.45)',
    arrowColor:        'rgba(255,255,255,0.35)',
    activeBorder:      'rgba(99,130,255,0.25)',
    chipBg:            '#3b5bdb',
    chipInk:           '#fff',
    avBg:              '#FCD34D',
    avInk:             '#1E3A8A',
    headerGlow:        'radial-gradient(120% 100% at 20% 0%, rgba(76,134,232,.22), transparent 60%)',
    wordmarkColor:     '#fff',
    collapseBtn:       'rgba(255,255,255,.06)',
    collapseBtnHover:  'rgba(255,255,255,.14)',
    collapseBtnBorder: 'rgba(255,255,255,.10)',
    collapseBtnColor:  'rgba(255,255,255,.5)',
    quickBtnBg:        'rgba(255,255,255,0.05)',
    quickBtnHover:     'rgba(255,255,255,0.09)',
  },
  nube: {
    bg:                '#FBFBFC',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#E9EFFC',
    border:            '#E3E7EC',
    separator:         '#E3E7EC',
    text:              '#2E3641',
    textActive:        '#1A44BD',
    textCategory:      '#7C8593',
    textSub:           '#2E3641',
    textSubHover:      '#2E3641',
    accent:            '#1D4FD7',
    footerText:        '#7C8593',
    scrollbar:         '#E3E7EC',
    panelBg:           '#F4F6F8',
    panelBorder:       '#E3E7EC',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#7C8593',
    arrowColor:        '#B0BAC5',
    activeBorder:      '#C7D4F5',
    chipBg:            '#DDF1F2',
    chipInk:           '#116A72',
    avBg:              '#F0D48A',
    avInk:             '#6B4E10',
    headerGlow:        'none',
    wordmarkColor:     '#2E3641',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#E3E7EC',
    collapseBtnColor:  '#7C8593',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  marea: {
    bg:                '#EEF4F3',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#DCEAE9',
    border:            '#D4E0DE',
    separator:         '#D4E0DE',
    text:              '#22302F',
    textActive:        '#0B5A5E',
    textCategory:      '#6D7C7A',
    textSub:           '#22302F',
    textSubHover:      '#22302F',
    accent:            '#0E6E72',
    footerText:        '#6D7C7A',
    scrollbar:         '#D4E0DE',
    panelBg:           '#E5EDEC',
    panelBorder:       '#D4E0DE',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#6D7C7A',
    arrowColor:        '#A8B8B6',
    activeBorder:      '#C0D6D4',
    chipBg:            '#D3E7E8',
    chipInk:           '#0D5F63',
    avBg:              '#E9C97F',
    avInk:             '#5C4610',
    headerGlow:        'none',
    wordmarkColor:     '#22302F',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#D4E0DE',
    collapseBtnColor:  '#6D7C7A',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  indigo: {
    bg:                '#F2F1F9',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#E4E2F4',
    border:            '#DBD9EA',
    separator:         '#DBD9EA',
    text:              '#2A2840',
    textActive:        '#3E3897',
    textCategory:      '#757390',
    textSub:           '#2A2840',
    textSubHover:      '#2A2840',
    accent:            '#4A43A8',
    footerText:        '#757390',
    scrollbar:         '#DBD9EA',
    panelBg:           '#EAE9F4',
    panelBorder:       '#DBD9EA',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#757390',
    arrowColor:        '#AEACCA',
    activeBorder:      '#C8C5E8',
    chipBg:            '#D9DDF5',
    chipInk:           '#3F3A93',
    avBg:              '#EFD08A',
    avInk:             '#5F4711',
    headerGlow:        'none',
    wordmarkColor:     '#2A2840',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#DBD9EA',
    collapseBtnColor:  '#757390',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  bosque: {
    bg:                '#F5F4ED',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#E5E7DB',
    border:            '#DEDBCF',
    separator:         '#DEDBCF',
    text:              '#2C302A',
    textActive:        '#29553F',
    textCategory:      '#7B7C6F',
    textSub:           '#2C302A',
    textSubHover:      '#2C302A',
    accent:            '#2E5D46',
    footerText:        '#7B7C6F',
    scrollbar:         '#DEDBCF',
    panelBg:           '#EDEBE2',
    panelBorder:       '#DEDBCF',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#7B7C6F',
    arrowColor:        '#ADAE9E',
    activeBorder:      '#C9CABD',
    chipBg:            '#DDE7DC',
    chipInk:           '#35604A',
    avBg:              '#E4C57C',
    avInk:             '#57420F',
    headerGlow:        'none',
    wordmarkColor:     '#2C302A',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#DEDBCF',
    collapseBtnColor:  '#7B7C6F',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  cemento: {
    bg:                '#F2F2F3',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#E3E3E6',
    border:            '#DCDCDF',
    separator:         '#DCDCDF',
    text:              '#1F1F21',
    textActive:        '#18181B',
    textCategory:      '#71717A',
    textSub:           '#1F1F21',
    textSubHover:      '#1F1F21',
    accent:            '#18181B',
    footerText:        '#71717A',
    scrollbar:         '#DCDCDF',
    panelBg:           '#EAEAEC',
    panelBorder:       '#DCDCDF',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#71717A',
    arrowColor:        '#A1A1AA',
    activeBorder:      '#C4C4C8',
    chipBg:            '#DCDCDF',
    chipInk:           '#3F3F46',
    avBg:              '#E7C87E',
    avInk:             '#4A3A0D',
    headerGlow:        'none',
    wordmarkColor:     '#1F1F21',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#DCDCDF',
    collapseBtnColor:  '#71717A',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  ciruela: {
    bg:                '#F6F1F5',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#E9DEE7',
    border:            '#DFD5DD',
    separator:         '#DFD5DD',
    text:              '#2F2830',
    textActive:        '#63355A',
    textCategory:      '#7E7280',
    textSub:           '#2F2830',
    textSubHover:      '#2F2830',
    accent:            '#6E3B63',
    footerText:        '#7E7280',
    scrollbar:         '#DFD5DD',
    panelBg:           '#EEE7EC',
    panelBorder:       '#DFD5DD',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#7E7280',
    arrowColor:        '#B0A8AF',
    activeBorder:      '#D0C2CD',
    chipBg:            '#E4DAE2',
    chipInk:           '#6A3A60',
    avBg:              '#E9C77E',
    avInk:             '#5A430F',
    headerGlow:        'none',
    wordmarkColor:     '#2F2830',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#DFD5DD',
    collapseBtnColor:  '#7E7280',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },
  bronce: {
    bg:                '#F7F4EE',
    bgHover:           'rgba(0,0,0,0.04)',
    bgActive:          '#EBE4D7',
    border:            '#E1DBCF',
    separator:         '#E1DBCF',
    text:              '#302C25',
    textActive:        '#7A4E17',
    textCategory:      '#82796A',
    textSub:           '#302C25',
    textSubHover:      '#302C25',
    accent:            '#8A5A1E',
    footerText:        '#82796A',
    scrollbar:         '#E1DBCF',
    panelBg:           '#F0ECE3',
    panelBorder:       '#E1DBCF',
    iconBg:            'rgba(0,0,0,0.04)',
    iconColor:         '#82796A',
    arrowColor:        '#B3A99A',
    activeBorder:      '#CFC4B5',
    chipBg:            '#E1E6DA',
    chipInk:           '#4E6340',
    avBg:              '#DFC079',
    avInk:             '#4F3A0C',
    headerGlow:        'none',
    wordmarkColor:     '#302C25',
    collapseBtn:       'rgba(0,0,0,0.04)',
    collapseBtnHover:  'rgba(0,0,0,0.08)',
    collapseBtnBorder: '#E1DBCF',
    collapseBtnColor:  '#82796A',
    quickBtnBg:        'rgba(0,0,0,0.04)',
    quickBtnHover:     'rgba(0,0,0,0.07)',
  },

  // ── Paletas intensas (fondo sólido oscuro, texto blanco) ───────────────────
  cobalto: {
    bg:               '#0063CB',
    bgHover:          '#005AB8',
    bgActive:         'rgba(255,255,255,0.16)',
    border:           'rgba(255,255,255,0.16)',
    separator:        'rgba(255,255,255,0.10)',
    scrollbar:        'rgba(255,255,255,0.20)',
    panelBg:          '#0057B2',
    panelBorder:      'rgba(255,255,255,0.16)',
    text:             '#FFFFFF',
    textActive:       '#FFFFFF',
    textCategory:     'rgba(255,255,255,0.62)',
    textSub:          '#FFFFFF',
    textSubHover:     '#FFFFFF',
    footerText:       'rgba(255,255,255,0.62)',
    accent:           '#FFFFFF',
    iconBg:           'transparent',
    iconColor:        'rgba(255,255,255,0.82)',
    arrowColor:       'rgba(255,255,255,0.55)',
    activeBorder:     '#FFFFFF',
    chipBg:           'rgba(255,255,255,0.18)',
    chipInk:          '#FFFFFF',
    avBg:             '#F5C960',
    avInk:            '#4A3407',
    headerGlow:       'transparent',
    wordmarkColor:    '#FFFFFF',
    collapseBtn:      '#0057B2',
    collapseBtnHover: '#004E9E',
    collapseBtnBorder:'rgba(255,255,255,0.20)',
    collapseBtnColor: 'rgba(255,255,255,0.70)',
    quickBtnBg:       'rgba(255,255,255,0.10)',
    quickBtnHover:    'rgba(255,255,255,0.18)',
  },
  azul: {
    bg:               '#3F46B8',
    bgHover:          '#383FA8',
    bgActive:         'rgba(255,255,255,0.17)',
    border:           'rgba(255,255,255,0.17)',
    separator:        'rgba(255,255,255,0.10)',
    scrollbar:        'rgba(255,255,255,0.20)',
    panelBg:          '#363DA3',
    panelBorder:      'rgba(255,255,255,0.17)',
    text:             '#FFFFFF',
    textActive:       '#FFFFFF',
    textCategory:     'rgba(255,255,255,0.62)',
    textSub:          '#FFFFFF',
    textSubHover:     '#FFFFFF',
    footerText:       'rgba(255,255,255,0.62)',
    accent:           '#FFFFFF',
    iconBg:           'transparent',
    iconColor:        'rgba(255,255,255,0.82)',
    arrowColor:       'rgba(255,255,255,0.55)',
    activeBorder:     '#FFFFFF',
    chipBg:           'rgba(255,255,255,0.18)',
    chipInk:          '#FFFFFF',
    avBg:             '#F5C960',
    avInk:            '#4A3407',
    headerGlow:       'transparent',
    wordmarkColor:    '#FFFFFF',
    collapseBtn:      '#363DA3',
    collapseBtnHover: '#2F3590',
    collapseBtnBorder:'rgba(255,255,255,0.20)',
    collapseBtnColor: 'rgba(255,255,255,0.70)',
    quickBtnBg:       'rgba(255,255,255,0.10)',
    quickBtnHover:    'rgba(255,255,255,0.18)',
  },
  verde: {
    bg:               '#147A3D',
    bgHover:          '#116C35',
    bgActive:         'rgba(255,255,255,0.17)',
    border:           'rgba(255,255,255,0.17)',
    separator:        'rgba(255,255,255,0.10)',
    scrollbar:        'rgba(255,255,255,0.20)',
    panelBg:          '#116A35',
    panelBorder:      'rgba(255,255,255,0.17)',
    text:             '#FFFFFF',
    textActive:       '#FFFFFF',
    textCategory:     'rgba(255,255,255,0.62)',
    textSub:          '#FFFFFF',
    textSubHover:     '#FFFFFF',
    footerText:       'rgba(255,255,255,0.62)',
    accent:           '#FFFFFF',
    iconBg:           'transparent',
    iconColor:        'rgba(255,255,255,0.82)',
    arrowColor:       'rgba(255,255,255,0.55)',
    activeBorder:     '#FFFFFF',
    chipBg:           'rgba(255,255,255,0.18)',
    chipInk:          '#FFFFFF',
    avBg:             '#F5C960',
    avInk:            '#4A3407',
    headerGlow:       'transparent',
    wordmarkColor:    '#FFFFFF',
    collapseBtn:      '#116A35',
    collapseBtnHover: '#0E5C2C',
    collapseBtnBorder:'rgba(255,255,255,0.20)',
    collapseBtnColor: 'rgba(255,255,255,0.70)',
    quickBtnBg:       'rgba(255,255,255,0.10)',
    quickBtnHover:    'rgba(255,255,255,0.18)',
  },
  petroleo: {
    bg:               '#0B6A6E',
    bgHover:          '#095E62',
    bgActive:         'rgba(255,255,255,0.17)',
    border:           'rgba(255,255,255,0.17)',
    separator:        'rgba(255,255,255,0.10)',
    scrollbar:        'rgba(255,255,255,0.20)',
    panelBg:          '#095B5F',
    panelBorder:      'rgba(255,255,255,0.17)',
    text:             '#FFFFFF',
    textActive:       '#FFFFFF',
    textCategory:     'rgba(255,255,255,0.62)',
    textSub:          '#FFFFFF',
    textSubHover:     '#FFFFFF',
    footerText:       'rgba(255,255,255,0.62)',
    accent:           '#FFFFFF',
    iconBg:           'transparent',
    iconColor:        'rgba(255,255,255,0.82)',
    arrowColor:       'rgba(255,255,255,0.55)',
    activeBorder:     '#FFFFFF',
    chipBg:           'rgba(255,255,255,0.18)',
    chipInk:          '#FFFFFF',
    avBg:             '#F5C960',
    avInk:            '#4A3407',
    headerGlow:       'transparent',
    wordmarkColor:    '#FFFFFF',
    collapseBtn:      '#095B5F',
    collapseBtnHover: '#074D50',
    collapseBtnBorder:'rgba(255,255,255,0.20)',
    collapseBtnColor: 'rgba(255,255,255,0.70)',
    quickBtnBg:       'rgba(255,255,255,0.10)',
    quickBtnHover:    'rgba(255,255,255,0.18)',
  },
  violeta: {
    bg:               '#6B3F73',
    bgHover:          '#5F3867',
    bgActive:         'rgba(255,255,255,0.17)',
    border:           'rgba(255,255,255,0.17)',
    separator:        'rgba(255,255,255,0.10)',
    scrollbar:        'rgba(255,255,255,0.20)',
    panelBg:          '#5C3564',
    panelBorder:      'rgba(255,255,255,0.17)',
    text:             '#FFFFFF',
    textActive:       '#FFFFFF',
    textCategory:     'rgba(255,255,255,0.62)',
    textSub:          '#FFFFFF',
    textSubHover:     '#FFFFFF',
    footerText:       'rgba(255,255,255,0.62)',
    accent:           '#FFFFFF',
    iconBg:           'transparent',
    iconColor:        'rgba(255,255,255,0.82)',
    arrowColor:       'rgba(255,255,255,0.55)',
    activeBorder:     '#FFFFFF',
    chipBg:           'rgba(255,255,255,0.18)',
    chipInk:          '#FFFFFF',
    avBg:             '#F5C960',
    avInk:            '#4A3407',
    headerGlow:       'transparent',
    wordmarkColor:    '#FFFFFF',
    collapseBtn:      '#5C3564',
    collapseBtnHover: '#502D58',
    collapseBtnBorder:'rgba(255,255,255,0.20)',
    collapseBtnColor: 'rgba(255,255,255,0.70)',
    quickBtnBg:       'rgba(255,255,255,0.10)',
    quickBtnHover:    'rgba(255,255,255,0.18)',
  },
};

// Contexto de tema del sidebar — inyectado una vez en AppLayout
export const SidebarCtx = createContext<SidebarPalette>(PALETTES.dark);
export const useC = () => useContext(SidebarCtx);

// ── Comparación de rutas sin falsos positivos ─────────────────────────────────
// activePath.startsWith('/notas-credito') también matchea '/notas-credito-compras'.
// Esta función exige que el path coincida exactamente O que lo que sigue sea '/'.
export function isActivePath(activePath: string, path: string): boolean {
  return activePath === path || activePath.startsWith(path + '/');
}

// ── Estructura de navegación ──────────────────────────────────────────────────

export interface QuickItem {
  path:        string;
  label:       string;
  Icon:        LucideIcon;
  badge?:      string;
  /** Conteo de no leídos — muestra un punto rojo con número cuando > 0 */
  badgeCount?: number;
}

export interface SubItem {
  path:  string;
  label: string;
  /**
   * Los cuatro siguientes son opcionales y hoy solo los usa el panel de Super
   * Admin, que necesita contadores y avisos por entrada. En el ERP van vacíos y
   * la entrada se pinta exactamente igual que antes.
   */
  icono?:      ReactNode;
  badgeCount?: number;
  badgeColor?: string;
  /** Punto rojo de aviso — p. ej. "sin respaldo reciente". */
  alerta?:     boolean;
}

export interface MenuCategory {
  id:           string;
  label:        string;
  Icon:         LucideIcon;
  items:        SubItem[];
  sectionLabel?: string; // si está presente → renderizar separador de sección ANTES de esta categoría
}


// ══ B  helpers de plan ══
export const PLAN_TIER: Record<PlanTipo, number> = {
  emprendedor: 1, pyme: 2, pro: 3, plus: 4,
  // Legado
  trial: 0, basico: 1, profesional: 2, empresarial: 3, enterprise: 4,
};
export const PLAN_NOMBRE: Record<PlanTipo, string> = {
  emprendedor: 'Emprendedor', pyme: 'Pyme', pro: 'Pro', plus: 'Plus',
  // Legado
  trial: 'Trial', basico: 'Básico', profesional: 'Profesional',
  empresarial: 'Empresarial', enterprise: 'Enterprise',
};

// Todos los módulos están disponibles en todos los planes (Emprendedor, PYME, PRO, PLUS).
// La única restricción es: ingresos mensuales y número de usuarios — NO módulos.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const PATH_MIN_PLAN: Record<string, PlanTipo> = {};

export function esRutaBloqueada(_path: string, _planActual: PlanTipo): boolean {
  return false; // sin restricción de módulos por plan
}

// ── Skeleton de carga de módulo (solo ocupa el área de contenido) ─────────────

// ══ C  piezas del menu ══
export function QuickItemComp({
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
        width:          collapsed ? 44 : 'calc(100% - 16px)',
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        collapsed ? '6px 0' : '8px 10px',
        height:         36,
        border:         active ? `1px solid ${C.activeBorder}` : '1px solid transparent',
        cursor:         'pointer',
        borderRadius:   10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        background:     active ? C.bgActive : hover ? C.bgHover : 'transparent',
        transition:     'all 0.15s ease',
        margin:         '1px 8px',
      }}
    >
      {/* Contenedor de ícono 28×28 */}
      <span style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: active ? C.bgActive : C.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}>
        <item.Icon
          size={15}
          strokeWidth={active ? 2.2 : 1.8}
          style={{ color: active ? C.accent : hover ? C.text : C.iconColor }}
        />
      </span>

      {!collapsed && (
        <>
          <span style={{
            flex:         1,
            fontSize:     12.5,
            fontWeight:   active ? 600 : 500,
            color:        active ? C.textActive : hover ? C.textSubHover : C.text,
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
              fontSize: 9, fontWeight: 700, padding: '2px 7px',
              borderRadius: 5, background: C.chipBg,
              color: C.chipInk, letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              {item.badge}
            </span>
          )}
          {!!item.badgeCount && item.badgeCount > 0 && (
            <span style={{
              minWidth: 16, height: 16, borderRadius: 8, flexShrink: 0,
              background: '#ff4d4f', color: '#fff',
              fontSize: 9, fontWeight: 700, lineHeight: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px',
            }}>
              {item.badgeCount > 99 ? '99+' : item.badgeCount}
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
export function CategoryAccordion({
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
  // Color de la línea lateral: deriva del accent del tema actual.
  // Paletas intensas (accent=#FFFFFF) → blanco semitransparente.
  // Paletas claras → accent al 50% de opacidad.
  const categoryLineColor = C.accent === '#FFFFFF'
    ? 'rgba(255,255,255,0.28)'
    : (() => {
        const h = C.accent.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},0.50)`;
      })();
  const hasActiveSub = category.items.some(i => isActivePath(activePath, i.path));

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
          padding:        '8px 10px',
          height:         36,
          border:         hasActiveSub ? `1px solid ${C.activeBorder}` : '1px solid transparent',
          cursor:         'pointer',
          borderRadius:   10,
          background:     hasActiveSub ? C.bgActive : hover ? C.bgHover : 'transparent',
          margin:         '1px 8px',
          transition:     'all 0.15s',
        }}
      >
        {/* Contenedor de ícono 28×28 */}
        <span style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: hasActiveSub ? C.bgActive : C.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}>
          <category.Icon
            size={15} strokeWidth={1.8}
            style={{ color: hasActiveSub ? C.accent : hover ? C.text : C.iconColor }}
          />
        </span>
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: hasActiveSub ? 600 : 500,
          color: hasActiveSub ? C.textActive : hover ? C.textSubHover : C.text,
          textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {category.label}
        </span>
        <ChevronDown
          size={12} strokeWidth={2}
          style={{
            color: hasActiveSub ? C.accent : C.textCategory, flexShrink: 0,
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
            {/* Línea lateral que delimita visualmente la categoría expandida */}
            <div style={{ position: 'relative', paddingBottom: 4 }}>
              <div style={{
                position: 'absolute',
                left: 16,
                top: 4,
                bottom: 8,
                width: 2,
                borderRadius: 2,
                background: categoryLineColor,
                pointerEvents: 'none',
              }} />
              {category.items.map(item => {
                const isActive  = isActivePath(activePath, item.path);
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
export function AccordionSubItem({
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
          color: active ? C.accent : C.arrowColor,
          transition: 'color 0.12s',
          display: item.icono ? 'flex' : undefined,
        }}>{item.icono ?? '↳'}</span>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: active ? 500 : 400,
          color: locked ? C.accent : active ? C.textActive : hover ? C.textSubHover : C.textSub,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'color 0.12s',
        }}>
          {item.label}
        </span>
        {!!item.badgeCount && item.badgeCount > 0 && (
          <span style={{
            background:   item.badgeColor ?? C.bgActive,
            color:        item.badgeColor ? '#fff' : C.textActive,
            borderRadius: 10, padding: '1px 7px',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>
            {item.badgeCount > 99 ? '99+' : item.badgeCount}
          </span>
        )}
        {item.alerta && (
          <span
            title="Requiere revisión"
            style={{
              flexShrink: 0, width: 8, height: 8, borderRadius: '50%',
              background: '#dc2626', boxShadow: '0 0 0 3px rgba(220,38,38,.2)',
            }}
          />
        )}
        {locked && <Lock size={10} color={C.accent} style={{ flexShrink: 0 }} />}
      </button>
    </Tooltip>
  );
}

// ── MODO COLAPSADO: Botón de categoría solo ícono ─────────────────────────────
export function CategoryBtnCollapsed({
  category, activePath, isActive, onClick,
}: {
  category:   MenuCategory;
  activePath: string;
  isActive:   boolean;
  onClick:    (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const C = useC();
  const [hover, setHover] = useState(false);
  const hasActiveSub = category.items.some(i => isActivePath(activePath, i.path));

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
export function FlyoutPanel({
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
                active={isActivePath(activePath, item.path)}
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
export function FlyoutItem({
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
export function getEmpresaColor(nombre: string): string {
  const PALETTE = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316'];
  return PALETTE[(nombre.charCodeAt(0) || 72) % PALETTE.length];
}

// ── Grupos del menú configurables ────────────────────────────────────────────
