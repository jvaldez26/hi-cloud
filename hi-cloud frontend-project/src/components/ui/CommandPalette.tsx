import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Tag, Typography, Spin, Divider, theme } from 'antd';
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
    if (qa.path === '/xlink' && !xlinkHabilitado) continue;
    items.push({
      key: qa.path, label: qa.label, group: 'Principal', categoryId: 'Principal',
      emoji: GROUP_EMOJI['Principal'] ?? '📄',
      keywords: QUICK_ACCESS_KEYWORDS[qa.path] ?? [],
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
      });

      if (item.accionRapida) {
        items.push({
          key: item.accionRapida.path, label: item.accionRapida.label,
          group: 'Acciones', categoryId: 'Acciones', emoji: GROUP_EMOJI['Acciones'] ?? '➕',
          keywords: [`nueva ${item.label.toLowerCase()}`, `crear ${item.label.toLowerCase()}`],
        });
      }
    }
  }

  return items;
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

  const debouncedQuery = useDebounce(query.trim());
  const isSearching    = debouncedQuery.length >= 2;

  // Resultados del backend (registros de BD)
  const { data: backendResults, isFetching } = useQuery<Record<string, any[]>>({
    queryKey: ['busqueda-global', debouncedQuery],
    queryFn:  () => api.get(`/busqueda?q=${encodeURIComponent(debouncedQuery)}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  isSearching,
    staleTime: 5_000,
  });

  const navResults = useMemo(() => buscarNav(query.trim(), allNavItems), [query, allNavItems]);

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

          {navResults.length > 0 && (
            <>
              <div style={{ padding: '4px 16px 3px', fontSize: 10, fontWeight: 700, color: token.colorTextTertiary, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                {query.trim() ? 'Módulos' : 'Accesos rápidos'}
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
