import { useState, useCallback, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import type { PlanTipo } from '../../../hooks/usePlan';
import {
  useC, QuickItemComp, CategoryAccordion, CategoryBtnCollapsed, isActivePath,
  type QuickItem, type SubItem, type MenuCategory,
} from './base';

/**
 * Armazón del menú lateral, compartido por el ERP y el panel de Super Admin.
 *
 * Aquí vive SOLO lo que es igual en los dos: el ancho que se anima al colapsar,
 * la marca de arriba, la lista de items y grupos, y el scroll. Todo lo que
 * cambia de un sitio a otro —la fila de empresa, la barra de accesos rápidos y
 * el pie— entra como slot, para no acabar con un componente lleno de `if
 * (esSuperAdmin)`.
 *
 * La paleta se lee del contexto (SidebarCtx), así que el tema oscuro sale gratis:
 * cada sitio provee la suya y este componente no se entera.
 */

/**
 * Estado de colapsado con memoria entre sesiones.
 *
 * La clave se pasa por parámetro a propósito: el menú del ERP y el de Super
 * Admin son dos menús distintos, y colapsar uno no debe colapsar el otro.
 */
export function useSidebarColapsado(clave: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(clave);
      // Limpiar cualquier valor corrupto (no es 'true' ni 'false' ni null)
      if (saved !== null && saved !== 'true' && saved !== 'false') {
        localStorage.removeItem(clave);
        return false;
      }
      return saved === 'true';  // default false si null
    } catch {
      return false;
    }
  });

  const setCollapsedPersisted = useCallback((next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(clave, String(next)); } catch { /* ignorar */ }
  }, [clave]);

  return { collapsed, setCollapsed: setCollapsedPersisted };
}

export interface SidebarShellProps {
  collapsed:   boolean;
  onCollapsed: (next: boolean) => void;

  /** Segunda línea de la marca: "ERP · DGII", "SUPER ADMIN"… */
  tagline: string;

  /** Fila bajo la marca. En el ERP es el selector de empresa; puede ir vacía. */
  identidad?: ReactNode;

  /**
   * Items sueltos del principio. Llegan YA filtrados por rol y con su badge
   * puesto: quién puede ver qué no es asunto del armazón.
   */
  itemsRapidos:      QuickItem[];
  etiquetaPrincipal?: string;

  /** Grupos de add-on, arriba, y grupos normales, tras el separador. */
  gruposAddon:   MenuCategory[];
  gruposNormales: MenuCategory[];

  activePath:     string;
  onNavegar:      (path: string) => void;
  onPrefetch:     (path: string) => void;

  /** Grupo desplegado (expandido) y panel flotante abierto (colapsado). */
  categoriaAbierta:  string | null;
  onToggleCategoria: (id: string) => void;
  panelAbiertoId?:   string | null;
  onAbrirPanel:      (id: string, top: number) => void;

  /**
   * Candado por plan. Opcional: el panel de Super Admin no tiene plan.
   * Cuando falta se asume el tier más alto, que es no bloquear nada.
   */
  planActual?:  PlanTipo;
  onBloqueado?: (item: SubItem, planMinimo: PlanTipo) => void;

  /** Barra de botones sobre el pie (Opciones / Buscar en el ERP). */
  barra?: ReactNode;
  /** Pie: usuario, alertas, tema, cerrar sesión. */
  pie?: ReactNode;
}

export function SidebarShell({
  collapsed, onCollapsed, tagline, identidad,
  itemsRapidos, etiquetaPrincipal = 'PRINCIPAL',
  gruposAddon, gruposNormales,
  activePath, onNavegar, onPrefetch,
  categoriaAbierta, onToggleCategoria, panelAbiertoId, onAbrirPanel,
  planActual, onBloqueado,
  barra, pie,
}: SidebarShellProps) {
  const C = useC();

  /** Un grupo se pinta igual sea add-on o normal; solo cambia dónde va. */
  const renderGrupo = (cat: MenuCategory) => (
    <div key={cat.id} style={{ marginBottom: 2 }}>
      {cat.sectionLabel && !collapsed && (
        <div style={{
          padding: '14px 18px 4px',
          fontSize: 9, fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: C.textCategory,
        }}>
          {cat.sectionLabel}
        </div>
      )}
      {cat.sectionLabel && collapsed && (
        <div style={{ height: 1, background: C.separator, margin: '8px 10px' }} />
      )}
      {collapsed ? (
        <CategoryBtnCollapsed
          category={cat}
          activePath={activePath}
          isActive={panelAbiertoId === cat.id}
          onClick={(e: any) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onAbrirPanel(cat.id, rect.top);
          }}
        />
      ) : (
        <CategoryAccordion
          category={cat}
          activePath={activePath}
          isOpen={categoriaAbierta === cat.id}
          onToggle={() => onToggleCategoria(cat.id)}
          onNavigate={onNavegar}
          planActual={planActual ?? 'plus'}
          onLocked={onBloqueado ?? (() => {})}
          onHoverItem={onPrefetch}
        />
      )}
    </div>
  );

  return (
    <div style={{
      width:         collapsed ? 64 : 240,
      height:        '100%',
      display:       'flex',
      flexDirection: 'column',
      background:    C.bg,
      transition:    'width 0.25s ease',
      overflowX:     'hidden',
      fontFamily:    "'Plus Jakarta Sans', 'Inter', sans-serif",
    }}>

      {/* ── Header Fila 1: Marca HiCloud + botón colapsar ───────────── */}
      <div style={{
        position:       'relative',
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding:        collapsed ? '12px 10px 11px' : '12px 16px 11px',
        flexShrink:     0,
        background:     C.headerGlow,
        borderBottom:   `1px solid ${C.border}`,
      }}>
        {/* Lockup: badge + wordmark — click colapsa/expande */}
        <div
          onClick={() => onCollapsed(!collapsed)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, cursor: 'pointer' }}
        >
          {/* ── Badge 46×46 ──────────────────────────────────────── */}
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background:  'linear-gradient(135deg, #4C86E8 0%, #1E4BA8 100%)',
            boxShadow:   '0 2px 10px rgba(28,70,180,.5), inset 0 1px 0 rgba(255,255,255,.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* ── Logo SVG placeholder — sustituir paths por el SVG real del logo ── */}
            <svg width="27" height="27" viewBox="0 0 27 27" fill="none" aria-hidden="true">
              <path
                d="M7.5 18a4.5 4.5 0 01-.5-8.95A6 6 0 0119.5 11.5h.5a3.5 3.5 0 010 7h-12z"
                fill="rgba(255,255,255,.95)"
              />
              <path
                d="M10 14.5l2.2 2.2 4.3-4.3"
                stroke="#4C86E8" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
            {/* ── Fin placeholder ─────────────────────────────────── */}
          </div>

          {/* Wordmark + tagline — oculto cuando colapsado */}
          {!collapsed && (
            <motion.div
              key="wordmark"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
              style={{ lineHeight: 1 }}
            >
              <div style={{
                fontFamily:    "'Sora', 'Inter', system-ui, sans-serif",
                fontWeight:    800,
                fontSize:      23,
                letterSpacing: '-0.02em',
                color:         C.wordmarkColor,
                lineHeight:    1.1,
                userSelect:    'none',
              }}>
                Hi<span style={{ color: '#4C86E8' }}>Cloud</span>
              </div>
              <div style={{
                fontSize:      10.5,
                color:         C.textCategory,
                textTransform: 'uppercase',
                letterSpacing: '.14em',
                marginTop:     2.5,
                fontWeight:    500,
                userSelect:    'none',
              }}>
                {tagline}
              </div>
            </motion.div>
          )}
        </div>

        {/* Botón colapsar — visible solo cuando expandido */}
        {!collapsed && (
          <button
            onClick={() => onCollapsed(!collapsed)}
            aria-label="Contraer menú lateral"
            title="Contraer menú"
            style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: C.collapseBtn,
              border:     `1px solid ${C.collapseBtnBorder}`,
              cursor:     'pointer',
              display:    'flex', alignItems: 'center', justifyContent: 'center',
              color:      C.collapseBtnColor,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.collapseBtnHover; e.currentTarget.style.color = C.text; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.collapseBtn; e.currentTarget.style.color = C.collapseBtnColor; }}
          >
            <ChevronLeft size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* ── Header Fila 2: identidad (empresa en el ERP) ─────────────── */}
      {identidad}

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

        {/* Label PRINCIPAL */}
        {!collapsed && itemsRapidos.length > 0 && (
          <div style={{ padding: '4px 18px 4px', fontSize: 9, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.8px', color: C.textCategory }}>
            {etiquetaPrincipal}
          </div>
        )}

        <div style={{ marginBottom: 6 }}>
          {itemsRapidos.map(item => (
            <QuickItemComp
              key={item.path}
              item={item}
              active={isActivePath(activePath, item.path)}
              collapsed={collapsed}
              onClick={() => { onNavegar(item.path); }}
              onHover={() => onPrefetch(item.path)}
            />
          ))}
        </div>

        {/* Módulos add-on activos — justo después de PRINCIPAL */}
        {gruposAddon.map(renderGrupo)}

        {/* Separador — solo si hay algo arriba que separar. Sin esta guarda, un
            menú sin items rápidos ni add-ons (el de Super Admin) empieza con una
            raya suelta. */}
        {(itemsRapidos.length > 0 || gruposAddon.length > 0) && (
          <div style={{
            height:     1,
            margin:     collapsed ? '8px 10px 10px' : '8px 16px 10px',
            background: C.separator,
          }} />
        )}

        {/* Categorías:
            – Expandido → accordion inline con separadores de sección
            – Colapsado → ícono que abre panel flyout              */}
        {gruposNormales.map(renderGrupo)}
      </div>

      {/* ── Barra de accesos rápidos ─────────────────────────── */}
      {!collapsed && barra}

      {/* ── Footer: usuario + acciones ──────────────────────────── */}
      <div style={{
        borderTop:  `1px solid ${C.border}`,
        padding:    collapsed ? '10px 0' : '10px 12px',
        flexShrink: 0,
        background: C.bg,
      }}>
        {pie}
      </div>
    </div>
  );
}
