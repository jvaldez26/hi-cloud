import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Tag, Typography, Spin, Divider, theme, message } from 'antd';
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useMisModulosAddon } from '../../hooks/useCatalogQueries';
import { useAuthStore } from '../../store/auth.store';
import { usePlan } from '../../hooks/usePlan';
import {
  MENU_CATEGORIES_DATA, ADDON_IDS, rolPuedeVerRuta,
  QUICK_ACCESS_ITEMS, QUICK_ACCESS_KEYWORDS, CATEGORY_KEYWORDS, PATH_KEYWORDS,
  CODIGOS_PARAMETRIZADOS, type CodigoParametrizado,
} from '../../config/menuConfig';

const { Text } = Typography;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface NavItem {
  key:        string;
  label:      string;
  group:      string;
  categoryId: string;
  emoji:      string;
  keywords:   string[];
  codigo?:    string;
}

// ── Emoji por categoría ───────────────────────────────────────────────────────

const GROUP_EMOJI: Record<string, string> = {
  ventas:        '🛒',
  compras:       '📦',
  inventario:    '🗄️',
  finanzas:      '🏦',
  fiscal:        '🏛️',
  comercial:     '🎯',
  rrhh:          '👤',
  reportes:      '📊',
  sistema:       '⚙️',
  clinica:       '🏥',
  taller:        '🔧',
  optica:        '👁️',
  farmacia:      '💊',
  restaurante:   '🍽️',
  gimnasio:      '🏋️',
  servicios_pro: '📋',
  prestamista:   '💰',
  agro:          '🌾',
  transporte:    '🚚',
  Principal:     '📊',
  Acciones:      '➕',
};

// ── Colores de Tag por categoryId ─────────────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  ventas:        'green',
  compras:       'purple',
  inventario:    'cyan',
  finanzas:      'gold',
  fiscal:        'red',
  comercial:     'lime',
  rrhh:          'magenta',
  reportes:      'blue',
  sistema:       'default',
  clinica:       'pink',
  taller:        'orange',
  optica:        'geekblue',
  farmacia:      'green',
  restaurante:   'volcano',
  gimnasio:      'purple',
  servicios_pro: 'blue',
  prestamista:   'gold',
  agro:          'lime',
  transporte:    'geekblue',
  Principal:     'blue',
  Acciones:      'volcano',
};

const TIPO_EMOJI: Record<string, string> = {
  factura: '🧾', cliente: '👥', producto: '📦',
  proveedor: '🏭', compra: '🛒', cotizacion: '📋',
};

// ── Índice de navegación — misma fuente que el sidebar (menuConfig) ──────────
// Exportado puro (sin hooks) para poder testear la paridad rol/add-on contra
// el sidebar sin montar el componente completo.

export function construirNavItems(
  userRole: string,
  modulosActivos: string[],
  xlinkHabilitado: boolean,
): NavItem[] {
  const items: NavItem[] = [];

  for (const qa of QUICK_ACCESS_ITEMS) {
    if (!rolPuedeVerRuta(qa.path, userRole)) continue;
    if (qa.path.startsWith('/xlink') && !xlinkHabilitado) continue;
    items.push({
      key: qa.path, label: qa.label, group: 'Principal', categoryId: 'Principal',
      emoji: GROUP_EMOJI['Principal'] ?? '📄',
      keywords: QUICK_ACCESS_KEYWORDS[qa.path] ?? [],
      codigo: qa.codigo,
    });
  }

  for (const cat of MENU_CATEGORIES_DATA) {
    if (ADDON_IDS.includes(cat.id) && !modulosActivos.includes(cat.id)) continue;
    const catKeywords = CATEGORY_KEYWORDS[cat.id] ?? [];

    for (const item of cat.items) {
      if (!rolPuedeVerRuta(item.path, userRole)) continue;
      items.push({
        key: item.path, label: item.label, group: cat.label, categoryId: cat.id,
        emoji: GROUP_EMOJI[cat.id] ?? '📄',
        keywords: [...(PATH_KEYWORDS[item.path] ?? []), ...catKeywords],
        codigo: item.codigo,
      });

      if (item.accionRapida) {
        items.push({
          key: item.accionRapida.path, label: item.accionRapida.label,
          group: 'Acciones', categoryId: 'Acciones', emoji: GROUP_EMOJI['Acciones'] ?? '➕',
          keywords: [`nueva ${item.label.toLowerCase()}`, `crear ${item.label.toLowerCase()}`],
          codigo: item.accionRapida.codigo,
        });
      }
    }
  }

  return items;
}

/** Códigos con parámetro visibles para este rol/add-ons — mismo gate que un ítem normal. */
export function construirCodigosParametrizados(
  userRole: string,
  modulosActivos: string[],
): CodigoParametrizado[] {
  // Los códigos parametrizados hoy solo viven en pantallas del núcleo
  // (facturas, compras, productos, declaraciones) — ninguna es add-on, pero
  // se deja el filtro por si algún día se agrega uno sobre una pantalla add-on.
  const catPorPath = new Map<string, string>();
  for (const cat of MENU_CATEGORIES_DATA) for (const item of cat.items) catPorPath.set(item.path, cat.id);

  return CODIGOS_PARAMETRIZADOS.filter(c => {
    if (!rolPuedeVerRuta(c.path, userRole)) return false;
    const catId = catPorPath.get(c.path);
    if (catId && ADDON_IDS.includes(catId) && !modulosActivos.includes(catId)) return false;
    return true;
  });
}

// ── Códigos de transacción (tipo SAP) ─────────────────────────────────────────

export interface CodigoEntry {
  codigo:         string;
  label:          string;
  group:          string;
  categoryId:     string;
  emoji:          string;
  path:           string;
  parametrizado?: CodigoParametrizado;
}

export function construirIndiceCodigos(
  navItems: NavItem[],
  parametrizados: CodigoParametrizado[],
): CodigoEntry[] {
  const entries: CodigoEntry[] = [];
  for (const item of navItems) {
    if (!item.codigo) continue;
    entries.push({
      codigo: item.codigo, label: item.label, group: item.group,
      categoryId: item.categoryId, emoji: item.emoji, path: item.key,
    });
  }
  for (const p of parametrizados) {
    entries.push({
      codigo: p.codigo, label: p.label, group: 'Declaraciones DGII', categoryId: 'fiscal',
      emoji: GROUP_EMOJI['fiscal'] ?? '📄', path: p.path, parametrizado: p,
    });
  }
  return entries;
}

/**
 * Catálogo COMPLETO de códigos, sin filtrar por rol/add-on — solo para
 * distinguir "código inexistente" (se trata como texto normal) de "código
 * real pero sin acceso" (mensaje explícito). Se calcula una sola vez al
 * cargar el módulo: ADDON_IDS cubre todos los add-on y 'admin' pasa todas
 * las restricciones de PATH_ROLES salvo las super_admin-only (que hoy no
 * tienen códigos propios).
 */
const INDICE_CODIGOS_COMPLETO: CodigoEntry[] = construirIndiceCodigos(
  construirNavItems('admin', ADDON_IDS, true),
  CODIGOS_PARAMETRIZADOS,
);

/** ¿El texto escrito tiene forma de código (2 letras + al menos 1 dígito)? */
export function pareceCodigoTransaccion(query: string): boolean {
  return /^[a-z]{2}\d/i.test(query.trim());
}

/** Separa "VT03 FAC-1001" en { codigo: 'VT03', parametro: 'FAC-1001' }. */
export function parsearEntradaCodigo(query: string): { codigo: string; parametro?: string } | null {
  const m = query.trim().match(/^([a-z]{2}\d{2})(?:\s+(.+))?$/i);
  if (!m) return null;
  return { codigo: m[1].toUpperCase(), parametro: m[2]?.trim() || undefined };
}

export function buscarPorCodigo(prefijo: string, indice: CodigoEntry[]): CodigoEntry[] {
  const pref = prefijo.trim().toUpperCase();
  if (!pref) return [];
  return indice
    .filter(e => e.codigo.startsWith(pref))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .slice(0, 15);
}

/** Mes/año por defecto: el mes anterior al actual (ver requisito de FS06-08/FS11-12). */
export function mesAnteriorPorDefecto(hoy = new Date()): { mes: number; anio: number } {
  const mesIdx0 = hoy.getMonth(); // 0-11
  return mesIdx0 === 0
    ? { mes: 12, anio: hoy.getFullYear() - 1 }
    : { mes: mesIdx0, anio: hoy.getFullYear() };
}

/** Parsea "MM/AAAA", "MM-AAAA" o "MM AAAA"; sin valor (o inválido) cae al mes anterior. */
export function parsearPeriodo(valor: string | undefined, hoy = new Date()): { mes: number; anio: number } {
  if (valor) {
    const m = valor.match(/^(\d{1,2})[/\-\s](\d{4})$/);
    if (m) {
      const mes = Number(m[1]);
      if (mes >= 1 && mes <= 12) return { mes, anio: Number(m[2]) };
    }
  }
  return mesAnteriorPorDefecto(hoy);
}

const HISTORIAL_CODIGOS_KEY = 'hicloud_codigos_transaccion_recientes';
const HISTORIAL_MAX = 8;

export function leerHistorialCodigos(): string[] {
  try {
    const raw = localStorage.getItem(HISTORIAL_CODIGOS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(c => typeof c === 'string') : [];
  } catch { return []; }
}

export function registrarCodigoUsado(codigo: string): string[] {
  const actual = leerHistorialCodigos().filter(c => c !== codigo);
  actual.unshift(codigo);
  const recortado = actual.slice(0, HISTORIAL_MAX);
  try { localStorage.setItem(HISTORIAL_CODIGOS_KEY, JSON.stringify(recortado)); } catch {}
  return recortado;
}

// ── Resolución de un código de transacción — pura, sin hooks ni navigate ────
// Separada del componente a propósito: testeable sin montar React, inyectando
// `buscarEnApi` en vez de pegarle a /busqueda de verdad.

export type ResultadoCodigo =
  | { tipo: 'ruta';          ruta: string; codigo: string }
  | { tipo: 'sin-acceso';    codigo: string }
  | { tipo: 'no-reconocido' }
  | { tipo: 'sin-resultado'; mensaje: string };

export async function resolverCodigoTransaccion(
  entrada:          string,
  indiceAccesible:  CodigoEntry[],
  indiceCompleto:   CodigoEntry[],
  buscarEnApi:      (valor: string) => Promise<Record<string, any[]>>,
): Promise<ResultadoCodigo> {
  const parsed = parsearEntradaCodigo(entrada);
  if (!parsed) return { tipo: 'no-reconocido' };
  const { codigo, parametro } = parsed;

  const accesible = indiceAccesible.find(e => e.codigo === codigo);
  if (!accesible) {
    const existeEnElSistema = indiceCompleto.some(e => e.codigo === codigo);
    return existeEnElSistema ? { tipo: 'sin-acceso', codigo } : { tipo: 'no-reconocido' };
  }

  if (!accesible.parametrizado) {
    return { tipo: 'ruta', ruta: accesible.path, codigo };
  }

  const p = accesible.parametrizado;
  if (p.modo === 'ninguno') {
    return { tipo: 'ruta', ruta: `${p.path}?tab=${p.tab}`, codigo };
  }
  if (p.modo === 'periodo') {
    const { mes, anio } = parsearPeriodo(parametro);
    return { tipo: 'ruta', ruta: `${p.path}?tab=${p.tab}&mes=${mes}&anio=${anio}`, codigo };
  }

  // modo === 'busqueda' (VT03/CP03/IN03) — sin valor, abre la pantalla general.
  if (!parametro) {
    return { tipo: 'ruta', ruta: accesible.path, codigo };
  }
  const resultadosApi = await buscarEnApi(parametro);
  const candidatos = Object.values(resultadosApi ?? {}).flat() as any[];
  const delTipo = candidatos.filter(r => r.tipo === p.tipoBusqueda);
  if (!delTipo.length) {
    return {
      tipo: 'sin-resultado',
      mensaje: `No se encontró ningún resultado para "${parametro}" en ${p.label.toLowerCase()} de esta empresa`,
    };
  }
  const exacto = delTipo.find(r => normalizar(String(r.titulo ?? '')) === normalizar(parametro));
  const ruta = (exacto ?? delTipo[0]).ruta;
  return ruta ? { tipo: 'ruta', ruta, codigo } : {
    tipo: 'sin-resultado',
    mensaje: `No se encontró ningún resultado para "${parametro}" en ${p.label.toLowerCase()} de esta empresa`,
  };
}

// ── Búsqueda con score ────────────────────────────────────────────────────────

/** Normaliza para comparar sin distinguir acentos ni mayúsculas ("dashboard" == "Dáshboard"). */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function buscarNav(query: string, items: NavItem[]): NavItem[] {
  const q = normalizar(query);
  if (!q) return items.slice(0, 10);

  const scored = items.map(item => {
    const label = normalizar(item.label);
    const group = normalizar(item.group);
    const keys  = item.keywords.map(normalizar);
    let score   = 0;

    if (label === q)               score += 100;
    else if (label.startsWith(q))  score += 80;
    else if (label.includes(q))    score += 60;

    if (group.includes(q))         score += 20;

    for (const kw of keys) {
      if (kw === q)              score += 90;
      else if (kw.startsWith(q)) score += 70;
      else if (kw.includes(q))   score += 50;
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

  const { user } = useAuthStore();
  const userRole = user?.role ?? 'viewer';

  // Hook centralizado (misma queryKey + mismo staleTime que AppLayout).
  const { data: _misModulosRes } = useMisModulosAddon(!!user);
  const modulosActivos: string[] = _misModulosRes?.modulos ?? [];

  // Mismo gate de plan que usa el sidebar para HiCloud Xlink (AppLayout.tsx) —
  // tieneModulo() es siempre true hoy, pero si algún plan llega a desactivarlo
  // el buscador debe reaccionar igual que el sidebar, sin tocar este archivo.
  const { tieneModulo } = usePlan();
  const xlinkHabilitado = tieneModulo('xlink');

  // ── Índice dinámico — misma fuente y mismas reglas que el sidebar ─────────
  const allNavItems = useMemo<NavItem[]>(
    () => construirNavItems(userRole, modulosActivos, xlinkHabilitado),
    [userRole, modulosActivos, xlinkHabilitado],
  );
  const codigosParametrizados = useMemo(
    () => construirCodigosParametrizados(userRole, modulosActivos),
    [userRole, modulosActivos],
  );
  const indiceCodigos = useMemo(
    () => construirIndiceCodigos(allNavItems, codigosParametrizados),
    [allNavItems, codigosParametrizados],
  );

  // ── Historial de códigos usados — localStorage, últimos 8 ─────────────────
  const [historial, setHistorial] = useState<string[]>(() => leerHistorialCodigos());
  const historialResuelto = useMemo(
    () => historial.map(c => indiceCodigos.find(e => e.codigo === c)).filter((e): e is CodigoEntry => !!e),
    [historial, indiceCodigos],
  );

  const esModoCodigo = pareceCodigoTransaccion(query);
  const codigoResultados = useMemo(
    () => esModoCodigo ? buscarPorCodigo(query, indiceCodigos) : [],
    [esModoCodigo, query, indiceCodigos],
  );

  const debouncedQuery = useDebounce(query.trim());
  // En modo código no se consulta /busqueda — el usuario está navegando por
  // código, no buscando un documento por texto libre.
  const isSearching    = debouncedQuery.length >= 2 && !esModoCodigo;

  // Resultados del backend (registros de BD)
  const { data: backendResults, isFetching } = useQuery<Record<string, any[]>>({
    queryKey: ['busqueda-global', debouncedQuery],
    queryFn:  () => api.get(`/busqueda?q=${encodeURIComponent(debouncedQuery)}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  isSearching,
    staleTime: 5_000,
  });

  const navResultsTexto = useMemo(() => buscarNav(query.trim(), allNavItems), [query, allNavItems]);
  const codigoEntryANavItem = (e: CodigoEntry): NavItem => ({
    key: e.path, label: e.label, group: e.group, categoryId: e.categoryId, emoji: e.emoji,
    keywords: [], codigo: e.codigo,
  });
  // Sin query: antepone el historial a los accesos rápidos de siempre (sin repetir
  // un ítem que ya esté en ambas listas).
  const navResults: NavItem[] = esModoCodigo
    ? codigoResultados.map(codigoEntryANavItem)
    : (!query.trim() && historialResuelto.length)
      ? (() => {
          const historialItems = historialResuelto.map(codigoEntryANavItem);
          const yaIncluidos = new Set(historialItems.map(i => i.key));
          return [...historialItems, ...navResultsTexto.filter(i => !yaIncluidos.has(i.key))];
        })()
      : navResultsTexto;

  const backendFlat = isSearching && backendResults
    ? Object.values(backendResults).flat().map(r => ({ ...r, isBackend: true }))
    : [];
  const navFlat = navResults.map(r => ({ ...r, isBackend: false }));
  const allFlat = [...navFlat, ...backendFlat];

  /** Resuelve "VT03 FAC-1001" / "GN01" / etc. — true si manejó el Enter. */
  const manejarEnterCodigo = useCallback(async (crudo: string): Promise<boolean> => {
    const resultado = await resolverCodigoTransaccion(
      crudo, indiceCodigos, INDICE_CODIGOS_COMPLETO,
      (valor) => api.get(`/busqueda?q=${encodeURIComponent(valor)}`).then((r: any) => r.data?.data ?? r.data),
    );

    if (resultado.tipo === 'no-reconocido') return false; // se trata como texto normal
    if (resultado.tipo === 'sin-acceso')    { message.error(`No tienes acceso a ${resultado.codigo}`); return true; }
    if (resultado.tipo === 'sin-resultado') { message.error(resultado.mensaje); return true; }

    setHistorial(registrarCodigoUsado(resultado.codigo));
    navigate(resultado.ruta);
    onClose();
    setQuery('');
    return true;
  }, [indiceCodigos, navigate, onClose]);

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
      if (e.key === 'Enter') {
        // Código exacto (con o sin parámetro) tiene prioridad sobre la
        // selección resaltada — "VT03 FAC-1001" + Enter abre esa factura
        // aunque el primer resultado visible sea otro.
        manejarEnterCodigo(query).then(manejado => {
          if (!manejado && allFlat[selected]) go(allFlat[selected]);
        });
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, allFlat, selected, go, onClose, manejarEnterCodigo, query]);

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
      {item.codigo && (
        <Tag color="geekblue" style={{ fontSize: 10, margin: 0, fontFamily: 'monospace' }}>
          {item.codigo}
        </Tag>
      )}
      <Tag
        color={GROUP_COLORS[item.categoryId] ?? 'default'}
        style={{ fontSize: 10, margin: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
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
            placeholder="Buscar módulos, código de transacción (VT02), clientes, facturas..."
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

          {navResults.length > 0 && (
            <>
              <div style={{ padding: '4px 16px 3px', fontSize: 10, fontWeight: 700, color: token.colorTextTertiary, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                {esModoCodigo
                  ? 'Códigos de transacción'
                  : query.trim()
                    ? 'Módulos'
                    : historialResuelto.length ? 'Recientes + Accesos rápidos' : 'Accesos rápidos'}
              </div>
              {navResults.map((item, idx) => renderNavItem(item, idx))}
            </>
          )}

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
            {allNavItems.length} módulos indexados
          </Text>
        </div>
      </motion.div>
    </div>
  );
}
