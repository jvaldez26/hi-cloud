import { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useRncLookup } from '../../hooks/useRncLookup';
import QRCode from 'qrcode';
import { Select, Modal, Badge, Empty, Spin, Tooltip, message, Avatar, Popover, Input, Button, Segmented, Tabs } from 'antd';
import { SearchOutlined, ShoppingCartOutlined, CheckCircleOutlined, DisconnectOutlined, LogoutOutlined, PrinterOutlined, LockOutlined, UserSwitchOutlined, SwapOutlined, EyeOutlined, EyeInvisibleOutlined, ShopOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../../hooks/useMediaQuery';
import { productosApi } from '../../api/productos.api';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { configuracionApi } from '../../api/configuracion.api';
import { useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../../api/facturas.api';
import { inventarioApi } from '../../api/inventario.api';
import { fmt, round2 } from '../../utils/formatters';
import { imprimirElemento, imprimirReciboTermico } from '../../utils/printUtils';
import { useThemeStore } from '../../store/theme.store';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useSupervisor } from '../../hooks/useSupervisor';
import type { Producto, Cliente } from '../../types';
import dayjs from 'dayjs';
import { useModuloAddon } from '../../hooks/useModuloAddon';
import { modulosAddonApi } from '../../api/modulos-addon.api';
import { tallerApi } from '../../api/taller.api';
import { opticaApi } from '../../api/optica.api';
import { clinicaApi } from '../../api/clinica.api';
import { RestaurantePOS, TallerPOS, FarmaciaPOS, OpticaPOS, ClinicaPOS, GimnasioPOS } from './modos';
import CompraFormInner from '../compras/CompraFormInner';

// ── Alias type ────────────────────────────────────────────────────────────────
type Prod = Producto;

// ── Dual palettes ─────────────────────────────────────────────────────────────
const darkC = {
  bg:         '#080E1A',
  topbar:     '#0C1220',
  sidebar:    '#0F1929',
  sidebarHov: '#1A2640',
  card:       '#1A2234',
  imgBg:      '#0d1526',
  inputBg:    'rgba(255,255,255,.05)',
  totalsBg:   'rgba(0,0,0,.30)',
  border:     'rgba(255,255,255,0.07)',
  border2:    'rgba(255,255,255,0.13)',
  text:       '#F1F5F9',
  textMuted:  '#475569',
  textSub:    '#94A3B8',
  blue:       '#3B82F6',
  green:      '#10B981',
  orange:     '#F59E0B',
  red:        '#EF4444',
};

const lightC = {
  bg:         '#F1F5F9',
  topbar:     '#1854D8',   // azul corporativo — igual que la barra lateral del ERP en modo claro
  sidebar:    '#FFFFFF',
  sidebarHov: '#F1F5F9',
  card:       '#FFFFFF',
  imgBg:      '#EEF2F7',
  inputBg:    'rgba(0,0,0,.04)',
  totalsBg:   '#F8FAFC',
  border:     'rgba(0,0,0,0.07)',
  border2:    'rgba(0,0,0,0.13)',
  text:       '#0F172A',
  textMuted:  '#CBD5E1',
  textSub:    '#64748B',
  blue:       '#2563EB',
  green:      '#059669',
  orange:     '#D97706',
  red:        '#DC2626',
};

type Palette = typeof darkC;
const ThemeCtx = createContext<Palette>(darkC);
const useC = () => useContext(ThemeCtx);

// ── Interfaces ────────────────────────────────────────────────────────────────
type PrecioLista = 'precio1' | 'precio2' | 'precio3';

interface CartItem {
  produto:          Prod;
  cantidad:         number;
  precio:           number;
  descuentoMonto:   number;
  precioModificado?: boolean;
  precioLista?:     PrecioLista;  // qué lista de precio está aplicada
}

interface ParkedSale {
  id:        string;
  items:     CartItem[];
  clienteId?: number;
  label:     string;
}

interface Sale {
  folio:                   string;
  total:                   number;
  cambio:                  number;
  pagoRecibido?:           number;  // monto que entregó el cliente (efectivo)
  metodo:                  string;
  items:                   CartItem[];
  cliente?:                string;
  iva:                     number;
  subtotal:                number;
  facturaId?:              number;
  // e-CF
  tipoNcf?:                string;
  encf?:                   string;
  ecfPendiente?:           boolean;
  ecfFecha?:               string;
  rncComprador?:           string;
  razonSocial?:            string;
  securityCode?:           string;
  qrUrl?:                  string;
  notas?:                  string;   // incluye "Crédito X días" para ventas a crédito
  diasCredito?:            number;
  clienteId?:              number;   // para pre-llenar conduce
  // NC — referencia al documento modificado
  facturaOriginalFolio?:   string;
  ncfOriginal?:            string;
  codigoModificacion?:     string;
  descripcionMotivo?:      string;
  // Descuento global (sobre subtotal)
  descuentoGlobal?:        number;
  // Propina (opcional)
  propina?:                number;
  // Emisor
  cajero?:                 string;
  sucursalNombre?:         string;
  empresaNombreComercial?: string;
  empresaRnc?:             string;
  empresaDireccion?:       string;
  empresaTelefono?:        string;
  modoContexto?:           string;
}

type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'cheque' | 'vale';

type ModoFacturacion = 'factura' | 'pro-forma' | 'pre-factura' | 'conduce' | 'cotizacion';

const MODOS_FACTURACION: Array<{ id: ModoFacturacion; label: string; icon: string; desc: string }> = [
  { id: 'factura',     label: 'Factura',     icon: '📄', desc: 'Factura electrónica con NCF' },
  { id: 'pro-forma',   label: 'Pro Forma',   icon: '📋', desc: 'Presupuesto informativo (sin NCF)' },
  { id: 'pre-factura', label: 'Pre-Factura', icon: '📝', desc: 'Documento previo a factura' },
  { id: 'conduce',     label: 'Conduce',     icon: '🚚', desc: 'Nota de entrega / remisión' },
  { id: 'cotizacion',  label: 'Cotización',  icon: '💬', desc: 'Presupuesto al cliente' },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { key: 'tarjeta',       label: 'Tarjeta',        icon: '💳' },
  { key: 'transferencia', label: 'Transferencia',  icon: '🏦' },
  { key: 'credito',       label: 'Crédito',        icon: '📋' },
];

const NCF_OPTS = [
  { code: 'E32', label: 'Consumo',          color: '#6B7280' },
  { code: 'E31', label: 'Crédito Fiscal',   color: '#3B82F6' },
  { code: 'E44', label: 'Zona Franca',      color: '#10B981' },
  { code: 'E45', label: 'Gubernamental',    color: '#F59E0B' },
];

const RECEIPT_ID = 'hc-pos-receipt';

// ── Helpers ───────────────────────────────────────────────────────────────────
function avatarBg(name: string) {
  const colors = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#0891B2'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {t.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

// ── Numpad ────────────────────────────────────────────────────────────────────
function Numpad({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const press = (k: string) => {
    const s = value === 0 ? '' : String(value);
    if (k === '⌫') { const n = s.slice(0, -1); onChange(n === '' ? 0 : Number(n)); return; }
    if (k === '.') { if (!s.includes('.')) onChange(Number(s + '.') as any); return; }
    onChange(Number(s + k));
  };
  const keys = ['7','8','9','4','5','6','1','2','3','.','0','⌫'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>
      {keys.map(k => (
        <button key={k} onClick={() => press(k)} style={{
          height: 48, borderRadius: 8, cursor: 'pointer', outline: 'none', fontSize: 16, fontWeight: 600,
          border: k === '⌫' ? '1px solid #FECACA' : '1px solid #E2E8F0',
          background: k === '⌫' ? '#FEF2F2' : '#F8FAFC',
          color: k === '⌫' ? '#EF4444' : '#1E293B',
          transition: 'background 0.1s',
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = k === '⌫' ? '#FEE2E2' : '#EFF6FF'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = k === '⌫' ? '#FEF2F2' : '#F8FAFC'; }}
        >{k}</button>
      ))}
    </div>
  );
}

// ── Product card — diseño moderno ─────────────────────────────────────────────

/** Genera color de tarjeta consistente basado en categoría o nombre */
function cardColor(seed: string, dark: boolean): { bg: string; accent: string; icon: string } {
  const palettes = [
    { bg: dark?'#0e2218':'#E6F7EE', accent:'#22C55E', icon:'🪣' },  // verde
    { bg: dark?'#241500':'#FFF3E0', accent:'#F97316', icon:'🔧' },  // naranja
    { bg: dark?'#0a1929':'#EFF6FF', accent:'#3B82F6', icon:'⚡' },  // azul
    { bg: dark?'#1e0a29':'#F3E8FF', accent:'#A855F7', icon:'📦' },  // violeta
    { bg: dark?'#290a0a':'#FEE2E2', accent:'#EF4444', icon:'🔑' },  // rojo
    { bg: dark?'#0f1f29':'#E0F2FE', accent:'#0EA5E9', icon:'🚿' },  // celeste
    { bg: dark?'#29200a':'#FEF3C7', accent:'#EAB308', icon:'🔩' },  // amarillo
    { bg: dark?'#0a2420':'#CCFBF1', accent:'#14B8A6', icon:'🪚' },  // teal
  ];
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

/** Ícono por categoría */
function categoryIcon(cat?: string): string {
  if (!cat) return '📦';
  const c = cat.toLowerCase();
  if (c.includes('electr')) return '⚡';
  if (c.includes('ferret') || c.includes('herram')) return '🔧';
  if (c.includes('pintur')) return '🪣';
  if (c.includes('plomer') || c.includes('agua')) return '🚿';
  if (c.includes('cemento') || c.includes('constr')) return '🏗️';
  if (c.includes('madera') || c.includes('mueble')) return '🪵';
  if (c.includes('tubo') || c.includes('pvc')) return '⬛';
  if (c.includes('cerraj') || c.includes('candado')) return '🔒';
  if (c.includes('serv')) return '⚙️';
  if (c.includes('aliment') || c.includes('comida')) return '🍔';
  if (c.includes('bebida')) return '🥤';
  if (c.includes('ropa') || c.includes('textil')) return '👔';
  return '📦';
}

function ProductCard({ produto, onAdd, mostrarStock = true, permitirStockNegativo = false }: {
  produto: Prod; onAdd: (p: Prod) => void; mostrarStock?: boolean; permitirStockNegativo?: boolean;
}) {
  const C        = useC();
  const isDark   = C === darkC;
  const esServicio = (produto as any).tipo === 'servicio';
  const sinStock = !esServicio && Number(produto.stock) <= 0;  // servicios nunca tienen "sin stock"
  const stockBajo= !esServicio && !sinStock && Number(produto.stock) <= Number((produto as any).stockMinimo ?? 3);
  const stock    = Number(produto.stock);

  const cat   = (produto as any).categoria as string | undefined;
  const color = cardColor(cat ?? produto.nombre, isDark); // solo se usa para el ícono
  const icon  = categoryIcon(cat);

  const stockColor = esServicio ? C.blue : sinStock ? C.red : stockBajo ? C.orange : C.green;
  const stockBg    = esServicio ? C.blue+'22' : sinStock ? C.red+'22' : stockBajo ? C.orange+'22' : C.green+'22';
  const unidad     = (produto as any).unidadMedida ?? 'unidad';
  // Stock display: entero si la unidad es discreta, 1 decimal si es continua; servicios muestran '∞'
  const unidadEsEntera = /^(unidad|und|pza|pieza|piezas|u)$/i.test(unidad.trim());
  const stockDisplay   = esServicio ? '∞' : sinStock ? '0' : unidadEsEntera ? String(Math.floor(stock)) : stock.toFixed(1);

  return (
    <motion.div
      whileHover={(!sinStock || permitirStockNegativo) ? { y: -2, boxShadow: `0 8px 24px rgba(59,130,246,.18)` } : {}}
      whileTap={(!sinStock || permitirStockNegativo) ? { scale: 0.96 } : {}}
      onClick={() => (!sinStock || permitirStockNegativo) && onAdd(produto)}
      style={{
        cursor:       (sinStock && !permitirStockNegativo) ? 'not-allowed' : 'pointer',
        borderRadius: 14,
        background:   C.card,
        border:       `1px solid ${C.border}`,
        overflow:     'hidden',
        opacity:      (sinStock && !permitirStockNegativo) ? 0.6 : 1,
        position:     'relative',
        display:      'flex', flexDirection: 'column',
        height:       148,
        transition:   'box-shadow 0.18s',
        userSelect:   'none',
      }}
    >
      {/* Badge de stock (top right) */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 2,
        background: stockBg, color: stockColor,
        fontSize: 10, fontWeight: 800, borderRadius: 10,
        padding: '2px 7px', border: `1px solid ${stockColor}44`,
        fontVariantNumeric: 'tabular-nums',
        display: mostrarStock ? undefined : 'none',
      }}>
        {stockDisplay}
      </div>

      {/* Área del ícono */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px 6px 4px',
      }}>
        {(produto as any).imagenUrl ? (
          <img src={(produto as any).imagenUrl} alt={produto.nombre}
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
        ) : (
          <span style={{ fontSize: 36, lineHeight: 1, filter: sinStock ? 'grayscale(1)' : 'none' }}>
            {icon}
          </span>
        )}
      </div>

      {/* Info inferior */}
      <div style={{ padding: '0 8px 7px', flexShrink: 0 }}>
        {/* Nombre */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: isDark ? '#F1F5F9' : '#1E293B',
          lineHeight: 1.25, marginBottom: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {produto.nombre}
        </div>
        {/* SKU */}
        <div style={{ fontSize: 9, color: isDark ? '#475569' : '#94A3B8', marginBottom: 3 }}>
          {produto.codigo}
        </div>
        {/* Precio + botón + */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.blue, lineHeight: 1 }}>
              {fmt.money(Number(produto.precio))}
            </div>
            <div style={{ fontSize: 9, color: isDark ? '#475569' : '#94A3B8', marginTop: 1 }}>
              por {unidad}
            </div>
          </div>
          {/* Botón + */}
          <button
            onClick={e => { e.stopPropagation(); !sinStock && onAdd(produto); }}
            disabled={sinStock}
            style={{
              width: 24, height: 24, borderRadius: '50%', border: 'none',
              background: sinStock ? (isDark ? '#1E293B' : '#E2E8F0') : '#3B82F6',
              color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: sinStock ? 'not-allowed' : 'pointer',
              outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {sinStock ? '↓' : '+'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Cart row ──────────────────────────────────────────────────────────────────
function CartRow({ item, onQty, onRemove, onDescuento, onPrecio, onLista, permitirModificarPrecio, permitirDescuentos = true, requireSupervisor }: {
  item: CartItem; onQty: (d: number) => void; onRemove: () => void; onDescuento: (monto: number) => void;
  onPrecio?: (p: number) => void; onLista?: (lista: PrecioLista) => void;
  permitirModificarPrecio?: boolean; permitirDescuentos?: boolean;
  requireSupervisor?: (action: string, detail?: string) => Promise<boolean>;
}) {
  const C = useC();
  const [descFocus,    setDescFocus]    = useState(false);
  const [precioDraft,  setPrecioDraft]  = useState<string | null>(null);
  const sub = (item.precio - item.descuentoMonto) * item.cantidad;
  const showDesc = descFocus || item.descuentoMonto > 0;

  const confirmarPrecio = (raw: string) => {
    const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (v > 0) onPrecio?.(v);
    setPrecioDraft(null);
  };

  return (
    <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }} transition={{ duration: 0.15 }}>
      <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
        {/* Fila 1: nombre + total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.produto.nombre}
            </span>
            <span style={{ fontSize: 11, color: C.textSub, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {permitirModificarPrecio ? (
                precioDraft !== null ? (
                  <input
                    type="number"
                    autoFocus
                    value={precioDraft}
                    min={0.01}
                    step={0.01}
                    style={{ width: 88, fontSize: 11, borderRadius: 4,
                      border: `1px solid ${C.blue}`, background: 'transparent',
                      color: C.text, textAlign: 'right', padding: '1px 4px', outline: 'none' }}
                    onChange={e => setPrecioDraft(e.target.value)}
                    onBlur={e => confirmarPrecio(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmarPrecio((e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setPrecioDraft(null);
                    }}
                  />
                ) : (
                  <span onClick={async () => {
                      if (requireSupervisor) {
                        const ok = await requireSupervisor('Modificar precio', `Producto: ${item.produto.nombre} — Precio actual: ${fmt.money(item.precio)}`);
                        if (!ok) return;
                      }
                      setPrecioDraft(String(item.precio));
                    }}
                    style={{ cursor: 'pointer', borderBottom: `1px dashed ${C.blue}`, paddingBottom: 1 }}
                    title="Click para editar precio">
                    {fmt.money(item.precio)} ✏
                  </span>
                )
              ) : (
                <span>{fmt.money(item.precio)}</span>
              )}
              <span>× PZA</span>
              {item.descuentoMonto > 0 && <span style={{ color: C.orange, fontWeight: 700 }}>−{fmt.money(item.descuentoMonto)}</span>}
              {item.precioModificado && <span style={{ color: C.orange, fontSize: 10 }}>✎</span>}
            </span>
          </div>
          <span style={{ color: C.blue, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{fmt.money(sub)}</span>
        </div>

        {/* Fila 2: controles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Cantidad */}
          <button onClick={() => onQty(-1)} disabled={item.cantidad <= 1}
            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border2}`, background: 'transparent',
              color: item.cantidad <= 1 ? C.textMuted : C.text,
              cursor: item.cantidad <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>−</button>
          <span style={{ width: 30, textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.text }}>{item.cantidad}</span>
          <button onClick={() => onQty(1)}
            disabled={(item.produto as any).tipo !== 'servicio' && item.cantidad >= Number(item.produto.stock)}
            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border2}`, background: 'transparent',
              color: (item.produto as any).tipo !== 'servicio' && item.cantidad >= Number(item.produto.stock) ? C.textMuted : C.text,
              cursor: (item.produto as any).tipo !== 'servicio' && item.cantidad >= Number(item.produto.stock) ? 'not-allowed' : 'pointer',
              fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>+</button>

          {/* Selector de lista de precios — solo si el producto tiene precio2 o precio3 */}
          {(item.produto.precio2 || item.produto.precio3) && onLista && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 4,
              background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: 2, border: `1px solid rgba(255,255,255,.1)` }}>
              {([
                { key: 'precio1' as PrecioLista, label: 'P1', val: item.produto.precio },
                ...(item.produto.precio2 ? [{ key: 'precio2' as PrecioLista, label: 'P2', val: item.produto.precio2 }] : []),
                ...(item.produto.precio3 ? [{ key: 'precio3' as PrecioLista, label: 'P3', val: item.produto.precio3 }] : []),
              ]).map(({ key, label, val }) => {
                const activo = (item.precioLista ?? 'precio1') === key;
                return (
                  <Tooltip key={key} title={`${label}: ${fmt.money(Number(val))}`}>
                    <button onClick={() => onLista(key)} style={{
                      height: 20, padding: '0 6px', borderRadius: 4, border: 'none', cursor: 'pointer', outline: 'none',
                      background: activo ? C.blue : 'transparent',
                      color: activo ? '#fff' : C.textMuted,
                      fontSize: 10, fontWeight: activo ? 700 : 500, transition: 'all .15s',
                    }}>{label}</button>
                  </Tooltip>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Descuento por monto (RD$) — aparece si permitirDescuentos y si >0 o en foco */}
          {permitirDescuentos && showDesc ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 10, color: item.descuentoMonto > 0 ? C.orange : C.textMuted, fontWeight: 600 }}>-$</span>
              <input type="number" value={item.descuentoMonto} min={0} max={item.precio} step={0.01}
                onChange={e => onDescuento(Math.min(item.precio, Math.max(0, Number(e.target.value))))}
                onFocus={() => setDescFocus(true)}
                onBlur={() => setDescFocus(false)}
                autoFocus={descFocus && item.descuentoMonto === 0}
                style={{ width: 62, height: 24, borderRadius: 6,
                  border: `1px solid ${item.descuentoMonto > 0 ? C.orange : C.border2}`,
                  background: item.descuentoMonto > 0 ? C.orange + '11' : 'rgba(255,255,255,.05)',
                  color: item.descuentoMonto > 0 ? C.orange : C.text,
                  textAlign: 'center', fontSize: 11, fontWeight: 700, outline: 'none', padding: '0 2px' }} />
            </div>
          ) : permitirDescuentos ? (
            <Tooltip title="Aplicar descuento en RD$">
              <button onClick={() => setDescFocus(true)}
                style={{ height: 24, padding: '0 7px', borderRadius: 6,
                  border: `1px solid ${C.border2}`, background: 'transparent',
                  color: C.textMuted, cursor: 'pointer', fontSize: 10, fontWeight: 500,
                  outline: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 12 }}>%</span>
              </button>
            </Tooltip>
          ) : null}

          {/* Eliminar */}
          <button onClick={onRemove}
            style={{ width: 26, height: 26, borderRadius: 6, border: 'none',
              background: 'rgba(239,68,68,.12)', color: C.red, cursor: 'pointer',
              fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>✕</button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Helper: obtiene nombre de sucursal activa del cache de React Query ───────
function sucursalNombreFromCache(qcClient: any): string | undefined {
  const empresaActual = useAuthStore.getState().empresaActual;
  const lista: any[] = qcClient.getQueryData?.(['mis-sucursales', empresaActual]) ?? [];
  const sid = useAuthStore.getState().sucursalActual;
  return lista.find((s: any) => s.id === sid)?.nombre
    ?? localStorage.getItem('pos_sucursal_nombre') ?? undefined;
}

// ── Thermal receipt — HTML puro para impresión directa ───────────────────────
const NCF_LABEL: Record<string, [string, string]> = {
  E32: ['FACTURA DE CONSUMO',       'ELECTRÓNICA (E32)'],
  E31: ['FACTURA CRÉDITO FISCAL',   'ELECTRÓNICA (E31)'],
  E34: ['NOTA DE CRÉDITO',          'ELECTRÓNICA (E34)'],
  E44: ['FACTURA RÉGIMEN ESPECIAL', 'ZONA FRANCA (E44)'],
  E45: ['FACTURA GUBERNAMENTAL',    'ELECTRÓNICA (E45)'],
};
const RNC_GENERICOS_TICKET = new Set(['000000000', '00000000000', '']);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const IMPRESORA_CONFIG: Record<string, { width: string; fontSize: string; paddingLR: string }> = {
  '58mm':   { width: '58mm',  fontSize: '10pt', paddingLR: '3mm' },
  '80mm':   { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
  'carta':  { width: '210mm', fontSize: '12pt', paddingLR: '15mm' },
  'ninguna':{ width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
};

function buildReciboTermicoHTML(
  sale: Sale,
  qrDataUrl: string | null,
  cfg: { mostrarEcf?: boolean; tipoImpresora?: string; mensajeTicket?: string; politicaDev?: string; tipoDoc?: 'PRE-FACTURA' | 'COTIZACIÓN' | 'PRO-FORMA'; validezDias?: number } = {},
): string {
  const { mostrarEcf = true, tipoImpresora = '80mm', mensajeTicket, politicaDev, tipoDoc, validezDias } = cfg;
  const prn   = IMPRESORA_CONFIG[tipoImpresora] ?? IMPRESORA_CONFIG['80mm'];
  const ahora = dayjs();
  const fmt     = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row     = (l: string, v: string) => `<div class="row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const rowBold = (l: string, v: string) => `<div class="row bold"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const line    = () => '<div class="line"></div>';
  const dbl     = () => '<div class="dbl"></div>';

  const tipoCode = sale.tipoNcf ?? 'E32';
  const [ncfL1, ncfL2] = tipoDoc
    ? [tipoDoc, tipoDoc === 'PRE-FACTURA' ? 'Documento No Fiscal' : tipoDoc === 'PRO-FORMA' ? 'Presupuesto Informativo · Sin NCF' : 'No válida como comprobante fiscal']
    : (NCF_LABEL[tipoCode] ?? ['FACTURA ELECTRÓNICA', `(${esc(tipoCode)})`]);
  const esExento = tipoCode === 'E44';
  const mostrarComprador = !!(sale.rncComprador && !RNC_GENERICOS_TICKET.has(sale.rncComprador));
  const metodoLabel = METODOS.find(m => m.key === sale.metodo)?.label ?? 'Pago';
  const pagoMostrar = sale.pagoRecibido ?? (sale.metodo === 'efectivo' && sale.cambio > 0 ? sale.total + sale.cambio : sale.total);

  const tieneModificados = sale.items.some(i => i.precioModificado);
  const itemsHtml = sale.items.map(item => {
    const sub        = (item.precio - item.descuentoMonto) * item.cantidad;
    const nom        = item.produto.nombre.length > 26 ? item.produto.nombre.slice(0, 25) + '…' : item.produto.nombre;
    const modMark    = item.precioModificado ? ' *' : '';
    const itemLine   = `<div class="row"><span>${esc(nom + modMark)} ×${item.cantidad}</span><span>${sub.toFixed(2)}</span></div>`;
    const descLine   = item.descuentoMonto > 0
      ? `<div class="row small"><span>  Desc: -RD$${item.descuentoMonto.toFixed(2)} (de ${item.precio.toFixed(2)})</span><span>-${(item.descuentoMonto * item.cantidad).toFixed(2)}</span></div>`
      : '';
    return itemLine + descLine;
  }).join('');

  const compradorHtml = mostrarComprador ? `
    ${line()}
    <div class="bold">COMPRADOR:</div>
    <div>RNC: ${esc(sale.rncComprador ?? '')}</div>
    ${sale.razonSocial ? `<div>${esc(sale.razonSocial)}</div>` : ''}` : '';

  const modificaHtml = (sale.facturaOriginalFolio || sale.ncfOriginal || sale.codigoModificacion || sale.descripcionMotivo)
    ? `${line()}
    <div class="center bold">── MODIFICA A ──</div>
    ${sale.facturaOriginalFolio ? row('Factura orig.:', sale.facturaOriginalFolio) : ''}
    ${sale.ncfOriginal          ? row('e-NCF orig.:',   sale.ncfOriginal)          : ''}
    ${sale.codigoModificacion   ? row('Cód.Modif.:',    sale.codigoModificacion)   : ''}
    ${sale.descripcionMotivo    ? `<div class="small">${esc(sale.descripcionMotivo)}</div>` : ''}`
    : '';

  let ecfHtml = '';
  if (!tipoDoc) {
    if (sale.encf && mostrarEcf) {
      ecfHtml = `${line()}
    ${row('e-NCF:', sale.encf)}
    ${row('Fecha:', sale.ecfFecha ?? ahora.format('DD-MM-YYYY HH:mm:ss'))}
    ${sale.securityCode ? row('Cód.Seg.:', sale.securityCode) : ''}
    ${line()}
    ${qrDataUrl && !sale.ecfPendiente
      ? `<div class="center"><img src="${qrDataUrl}" width="130" height="130" alt="QR DGII"></div>
         <div class="center small">Escanea para verificar en DGII</div>`
      : '<div class="center small">Verifica en: dgii.gov.do</div>'}
    ${sale.ecfPendiente ? `${line()}<div class="center box"><div class="bold">&#9888; COMPROBANTE EN PROCESO</div><div>DE VALIDACIÓN DGII</div><div class="small">Será enviado cuando sea procesado.</div></div>` : ''}`;
    } else {
      ecfHtml = `<div class="center box"><div class="bold">&#9888; COMPROBANTE EN PROCESO</div><div>DE VALIDACIÓN DGII</div></div>`;
    }
  }

  const MODO_INFO: Record<string, { icono: string; label: string }> = {
    restaurante: { icono: '🍽️', label: 'Restaurante' },
    taller:      { icono: '🔧', label: 'Taller'      },
    farmacia:    { icono: '💊', label: 'Farmacia'     },
    optica:      { icono: '👓', label: 'Óptica'       },
    clinica:     { icono: '🏥', label: 'Clínica'      },
    gimnasio:    { icono: '🏋️', label: 'Gimnasio'    },
  };
  const modoInfo = sale.modoContexto && sale.modoContexto !== 'general'
    ? MODO_INFO[sale.modoContexto] : null;

  const pagoHtml = tipoDoc === 'COTIZACIÓN' || tipoDoc === 'PRO-FORMA'
    ? row('Validez:', `${validezDias ?? 30} días`)
    : tipoDoc === 'PRE-FACTURA'
    ? row('Estado:', 'PENDIENTE DE PAGO')
    : [
        sale.metodo === 'efectivo' ? row('PAGADO:', fmt(pagoMostrar)) : row(`${esc(metodoLabel)}:`, fmt(pagoMostrar)),
        sale.metodo === 'credito' && sale.diasCredito ? row('Plazo:', `${sale.diasCredito} días`) : '',
        Number(sale.cambio) > 0 ? rowBold('CAMBIO:', fmt(Number(sale.cambio))) : '',
      ].join('\n');
  const footerHtml = tipoDoc === 'PRE-FACTURA'
    ? '<div class="center bold">** DOCUMENTO NO FISCAL **</div><div class="center small">Presente este ticket para pagar</div>'
    : tipoDoc === 'COTIZACIÓN'
    ? '<div class="center bold">** COTIZACIÓN — NO ES FACTURA **</div>'
    : tipoDoc === 'PRO-FORMA'
    ? '<div class="center bold">** PRO FORMA — NO ES FACTURA **</div><div class="center small">No válida como comprobante fiscal</div>'
    : '<div class="center">— Gracias por su compra —</div>';

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=302,initial-scale=1,shrink-to-fit=no">
<title>Recibo ${esc(sale.folio)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word}
html{margin:0;padding:0;width:${prn.width}}
body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
  width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
  color:#000;background:#fff;
  -webkit-font-smoothing:none;font-smooth:never}
.center{text-align:center}
.bold{font-weight:bold}
.large{font-size:13pt;font-weight:bold}
.xlarge{font-size:15pt;font-weight:bold}
.small{font-size:9pt}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0;width:100%}
.row span:first-child{flex:1;overflow:hidden}
.row span:last-child{text-align:right;white-space:nowrap}
.line{border-top:1px dashed #000;margin:4px 0}
.dbl{border-top:2px solid #000;margin:4px 0}
.box{border:1px dashed #000;padding:3px 2px;margin:3px 0}
img{display:block;margin:4px auto}
@page{size:${prn.width} auto;margin:0}
@media print{html,body{width:${prn.width}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
<script>
window.addEventListener('load',function(){setTimeout(function(){window.print()},350)});
window.addEventListener('afterprint',function(){setTimeout(function(){
  try{window.close()}catch(e){}
  setTimeout(function(){if(!window.closed){document.body.innerHTML='<div style="text-align:center;padding:40px;font-family:sans-serif"><h2 style="color:#059669">&#10003; Impresión lista</h2><p style="margin-top:8px;color:#666">Puede cerrar esta ventana</p></div>'}},600)
},300)});
</script>
</head><body>

<div class="center xlarge">${esc(sale.empresaNombreComercial ?? 'NOMBRE EMPRESA')}</div>
<div class="center small">República Dominicana</div>
${sale.empresaRnc ? `<div>RNC Emisor: ${esc(sale.empresaRnc)}</div>` : ''}
${sale.empresaDireccion ? `<div class="small">${esc(sale.empresaDireccion)}</div>` : ''}
${sale.empresaTelefono ? `<div>Tel: ${esc(sale.empresaTelefono)}</div>` : ''}
${dbl()}
<div class="center bold">${esc(ncfL1)}</div>
<div class="center bold">${esc(ncfL2)}</div>
${line()}
${row('Fecha:', ahora.format('DD/MM/YYYY'))}
${row('Hora:', ahora.format('HH:mm:ss'))}
${rowBold(tipoDoc ? `${tipoDoc}:` : 'Factura:', sale.folio)}
${sale.cajero ? row('Cajero:', sale.cajero) : ''}
${sale.sucursalNombre ? row('Sucursal:', sale.sucursalNombre) : ''}
${modoInfo ? `${row('Módulo:', modoInfo.icono + ' ' + modoInfo.label)}` : ''}
${compradorHtml}
${modificaHtml}
${line()}
<div class="row bold"><span>DESCRIPCIÓN</span><span>TOTAL</span></div>
${line()}
${itemsHtml}
${line()}
${row('Subtotal:', fmt(sale.subtotal))}
${(sale.descuentoGlobal ?? 0) > 0 ? row('Descuento:', `-${fmt(sale.descuentoGlobal!)}`) : ''}
${row(esExento ? 'ITBIS (Exento ZF):' : 'ITBIS (18%):', esExento ? 'RD$0.00' : fmt(sale.iva))}
${(sale.propina ?? 0) > 0 ? row('Propina:', fmt(sale.propina!)) : ''}
${dbl()}
<div class="row xlarge bold"><span>TOTAL:</span><span>${fmt(sale.total)}</span></div>
${line()}
${pagoHtml}
${ecfHtml}
${dbl()}
${tieneModificados ? `${line()}<div class="small">* Precio modificado en venta</div>` : ''}
${mensajeTicket?.trim() ? `${line()}<div style="text-align:center;white-space:pre-wrap;word-break:break-word;">${esc(mensajeTicket.trim())}</div>` : ''}
${politicaDev?.trim() ? `${line()}<div class="small"><strong>POLÍTICA DE DEVOLUCIONES:</strong><br/>${esc(politicaDev.trim())}</div>` : ''}
${line()}
${footerHtml}

</body></html>`;
}

const ECF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  E32: { bg: 'rgba(107,114,128,.2)',  text: '#D1D5DB', border: 'rgba(107,114,128,.4)' },
  E31: { bg: 'rgba(59,130,246,.2)',   text: '#93C5FD', border: 'rgba(59,130,246,.4)'  },
  E44: { bg: 'rgba(16,185,129,.2)',   text: '#6EE7B7', border: 'rgba(16,185,129,.4)'  },
  E45: { bg: 'rgba(245,158,11,.2)',   text: '#FCD34D', border: 'rgba(245,158,11,.4)'  },
};

const ATAJOS_POS = [
  { tecla: 'F2',  accion: 'Buscar producto'  },
  { tecla: 'F4',  accion: 'Limpiar carrito'  },
  { tecla: 'F9',  accion: 'Cobrar'           },
  { tecla: 'Esc', accion: 'Cancelar búsqueda'},
];

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ empresaNombre, cajeroNombre, isOffline, onExit, onBloquear, onSupervisor, onCambiarUsuario, supervisorActiveBadge, onDesactivarSupervisor,
  modoFacturacion, onModoChange, tipoNcf, onTipoNcfChange, ecfOnline,
  modosPOS, modoContexto, onModoContextoChange, requireSupervisor,
  listaGlobal, onListaGlobalChange }: {
  empresaNombre: string; cajeroNombre: string; isOffline: boolean; onExit: () => void;
  onBloquear: () => void; onSupervisor: () => void; onCambiarUsuario: () => void;
  modoFacturacion: ModoFacturacion; onModoChange: (m: ModoFacturacion) => void;
  tipoNcf: string; onTipoNcfChange: (t: string) => void;
  ecfOnline: boolean | null;
  supervisorActiveBadge?: string;
  onDesactivarSupervisor?: () => void;
  requireSupervisor?: (action: string) => Promise<boolean>;
  modosPOS: { codigo: string; label: string; icono: string }[];
  modoContexto: string;
  onModoContextoChange: (m: string) => void;
  listaGlobal: PrecioLista;
  onListaGlobalChange: (l: PrecioLista) => void;
}) {
  const C = useC();
  const [showModoMenu,     setShowModoMenu]     = useState(false);
  const [showNcfMenu,      setShowNcfMenu]      = useState(false);
  const [showOpcionesMenu, setShowOpcionesMenu] = useState(false);
  const [showModoContexto, setShowModoContexto] = useState(false);
  const [showAtalhos,  setShowAtalhos]    = useState(false);

  // ESC cierra el modo supervisor
  useEffect(() => {
    if (!supervisorActiveBadge || !onDesactivarSupervisor) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDesactivarSupervisor(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [supervisorActiveBadge, onDesactivarSupervisor]);
  const modoActual = MODOS_FACTURACION.find(m => m.id === modoFacturacion)!;
  const ecfColors  = ECF_COLORS[tipoNcf] ?? ECF_COLORS.E32;
  const esFactura  = modoFacturacion === 'factura';

  // ── Cambiar sucursal ─────────────────────────────────────────────────────────
  const { sucursalActual, setSucursalActual, setAlmacenActual } = useAuthStore();
  const empresaActual = useAuthStore(s => s.empresaActual);
  const qc = useQueryClient();
  const [modalCambiarSucursal, setModalCambiarSucursal] = useState(false);
  const [cambiandoSucursal,    setCambiandoSucursal]    = useState(false);
  const { data: sucursales = [] } = useQuery<{ id: number; nombre: string; esPrincipal: boolean }[]>({
    queryKey: ['mis-sucursales', empresaActual],
    queryFn: () => api.get('/auth/mis-sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const sucursalNombre = sucursales.find(s => s.id === sucursalActual)?.nombre
    ?? localStorage.getItem('pos_sucursal_nombre') ?? undefined;
  useEffect(() => {
    if (sucursalNombre) localStorage.setItem('pos_sucursal_nombre', sucursalNombre);
  }, [sucursalNombre]);

  async function handleCambiarSucursal(sucursalId: number) {
    setCambiandoSucursal(true);
    try {
      const res = await api.post('/auth/cambiar-sucursal', { sucursalId });
      const data = res.data?.data ?? res.data;
      setSucursalActual(data.sucursalActual);
      setAlmacenActual(data.almacenActual ?? null);
      if (data.sucursalNombre) localStorage.setItem('pos_sucursal_nombre', data.sucursalNombre);
      qc.clear();
      setModalCambiarSucursal(false);
      message.success(`Sucursal activa: ${data.sucursalNombre}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Error al cambiar sucursal');
    } finally {
      setCambiandoSucursal(false);
    }
  }

  return (
    <div style={{
      height: 52, flexShrink: 0,
      background: C.topbar, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
    }}>
      {/* Logo + empresa */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <img src="/logo-hicloud.png" alt="HiCloud" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.18)' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Punto de Venta</div>
          <div style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 1, marginTop: 2 }}>{empresaNombre}</div>
        </div>
      </div>

      {/* ── Selector modo de facturación ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={() => { setShowModoMenu(v => !v); setShowNcfMenu(false); }} style={{
          height: 32, padding: '0 10px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,.22)',
          background: showModoMenu ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)',
          color: '#fff', cursor: 'pointer', outline: 'none',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
        }}>
          <span style={{ fontSize: 15 }}>{modoActual.icon}</span>
          <span>{modoActual.label}</span>
          <span style={{ fontSize: 10, opacity: 0.75 }}>▼</span>
        </button>
        {showModoMenu && (
          <>
            <div onClick={() => setShowModoMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 501,
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden',
              minWidth: 210, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
              {MODOS_FACTURACION.map((modo, i) => (
                <button key={modo.id} onClick={() => { onModoChange(modo.id); setShowModoMenu(false); }}
                  style={{ width: '100%', padding: '10px 14px', border: 'none',
                    borderBottom: i < MODOS_FACTURACION.length - 1 ? '1px solid #F1F5F9' : 'none',
                    background: modoFacturacion === modo.id ? '#EFF6FF' : '#fff',
                    color: modoFacturacion === modo.id ? '#2563EB' : '#1E293B',
                    cursor: 'pointer', outline: 'none', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{modo.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{modo.label}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{modo.desc}</div>
                  </div>
                  {modoFacturacion === modo.id && <span style={{ marginLeft: 'auto', color: '#2563EB' }}>✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Selector de modo de contexto ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => { setShowModoContexto(v => !v); setShowModoMenu(false); setShowNcfMenu(false); }} style={{
            height: 32, padding: '0 10px', borderRadius: 8,
            border: `1px solid ${modoContexto !== 'general' ? 'rgba(16,185,129,.6)' : 'rgba(255,255,255,.22)'}`,
            background: modoContexto !== 'general' ? 'rgba(16,185,129,.2)' : (showModoContexto ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)'),
            color: '#fff', cursor: 'pointer', outline: 'none',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          }}>
            <span style={{ fontSize: 15 }}>{modosPOS.find(m => m.codigo === modoContexto)?.icono ?? '🏪'}</span>
            <span>{modosPOS.find(m => m.codigo === modoContexto)?.label ?? 'General'}</span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>▼</span>
          </button>
          {showModoContexto && (
            <>
              <div onClick={() => setShowModoContexto(false)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 501,
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden',
                minWidth: 210, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
                {modosPOS.map((modo, i) => (
                  <button key={modo.codigo} onClick={() => { onModoContextoChange(modo.codigo); setShowModoContexto(false); }}
                    style={{ width: '100%', padding: '10px 14px', border: 'none',
                      borderBottom: i < modosPOS.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: modoContexto === modo.codigo ? '#F0FDF4' : '#fff',
                      color: modoContexto === modo.codigo ? '#059669' : '#1E293B',
                      cursor: 'pointer', outline: 'none', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{modo.icono}</span>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{modo.label}</div>
                    {modoContexto === modo.codigo && <span style={{ marginLeft: 'auto', color: '#059669' }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

      {/* ── Badge e-CF (solo cuando es factura) ── */}
      {esFactura && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => { setShowNcfMenu(v => !v); setShowModoMenu(false); }}
            style={{ height: 30, padding: '0 10px', borderRadius: 8, cursor: 'pointer', outline: 'none',
              background: ecfColors.bg, border: `1px solid ${ecfColors.border}`,
              display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: ecfColors.text, fontFamily: 'monospace', letterSpacing: '0.5px' }}>{tipoNcf}</span>
            <span style={{ fontSize: 11, color: ecfColors.text, opacity: 0.9 }}>
              {NCF_OPTS.find(o => o.code === tipoNcf)?.label}
            </span>
            <span style={{ fontSize: 9, color: ecfColors.text, opacity: 0.7 }}>▼</span>
          </button>
          {showNcfMenu && (
            <>
              <div onClick={() => setShowNcfMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 501,
                background: '#1E293B', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden',
                minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                {NCF_OPTS.map((opt, i) => {
                  const oc = ECF_COLORS[opt.code];
                  return (
                    <button key={opt.code} onClick={() => { onTipoNcfChange(opt.code); setShowNcfMenu(false); }}
                      style={{ width: '100%', padding: '10px 14px', border: 'none',
                        borderBottom: i < NCF_OPTS.length - 1 ? '1px solid #334155' : 'none',
                        background: tipoNcf === opt.code ? 'rgba(255,255,255,.06)' : 'transparent',
                        cursor: 'pointer', outline: 'none', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace',
                        background: oc.bg, color: oc.text, border: `1px solid ${oc.border}`,
                        borderRadius: 5, padding: '2px 7px', letterSpacing: '0.5px' }}>{opt.code}</span>
                      <span style={{ fontSize: 12, color: '#F1F5F9', fontWeight: tipoNcf === opt.code ? 700 : 400 }}>{opt.label}</span>
                      {tipoNcf === opt.code && <span style={{ marginLeft: 'auto', color: oc.text }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* ── Selector global de lista de precios ── */}
      <Tooltip title="Lista de precios activa — se aplica a todos los productos al agregar al carrito">
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0,
          background: listaGlobal !== 'precio1' ? 'rgba(234,179,8,.12)' : 'rgba(255,255,255,.06)',
          borderRadius: 7, padding: 3,
          border: `1px solid ${listaGlobal !== 'precio1' ? 'rgba(234,179,8,.4)' : 'rgba(255,255,255,.12)'}` }}>
          {([
            { key: 'precio1' as PrecioLista, label: 'P1', tip: 'Detalle' },
            { key: 'precio2' as PrecioLista, label: 'P2', tip: 'Mayorista' },
            { key: 'precio3' as PrecioLista, label: 'P3', tip: 'Especial' },
          ]).map(({ key, label, tip }) => {
            const activo = listaGlobal === key;
            return (
              <button key={key} onClick={() => onListaGlobalChange(key)}
                title={tip}
                style={{ height: 22, padding: '0 8px', borderRadius: 5, border: 'none', cursor: 'pointer', outline: 'none',
                  background: activo ? (key === 'precio1' ? '#3B82F6' : '#EAB308') : 'transparent',
                  color: activo ? '#fff' : '#94A3B8',
                  fontSize: 11, fontWeight: activo ? 700 : 500, transition: 'all .15s' }}>
                {label}
              </button>
            );
          })}
        </div>
      </Tooltip>

      {/* ── Indicador tu proveedor e-CF / DGII ── */}
      <Tooltip title={
        isOffline ? 'Sin conexión a internet' :
        ecfOnline === false ? 'tu proveedor e-CF no responde — modo contingencia activo' :
        'DGII / tu proveedor e-CF en línea'
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          background: isOffline || ecfOnline === false ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.12)',
          borderRadius: 6, padding: '3px 8px',
          border: `1px solid ${isOffline || ecfOnline === false ? 'rgba(239,68,68,.35)' : 'rgba(16,185,129,.3)'}` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isOffline || ecfOnline === false ? '#EF4444' : ecfOnline === null ? '#F59E0B' : '#10B981',
            boxShadow: isOffline || ecfOnline === false ? '0 0 4px #EF4444' : ecfOnline === null ? '0 0 4px #F59E0B' : '0 0 5px #10B981',
            display: 'inline-block' }} />
          <span style={{ fontSize: 11, fontWeight: 600,
            color: isOffline || ecfOnline === false ? '#FCA5A5' : ecfOnline === null ? '#FDE68A' : '#6EE7B7' }}>
            {isOffline ? 'Offline' : ecfOnline === false ? 'Contingencia' : 'DGII Online'}
          </span>
        </div>
      </Tooltip>

      {/* ── Atajos de teclado ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Tooltip title="Atajos de teclado">
          <button onClick={() => setShowAtalhos(v => !v)} style={{
            width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,.15)',
            background: showAtalhos ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)',
            color: '#94A3B8', cursor: 'pointer', outline: 'none', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>
            </svg>
          </button>
        </Tooltip>
        {showAtalhos && (
          <>
            <div onClick={() => setShowAtalhos(false)} style={{ position: 'fixed', inset: 0, zIndex: 500 }} />
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 501,
              background: '#1E293B', border: '1px solid #334155', borderRadius: 10,
              padding: '12px 0', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', padding: '0 14px 8px' }}>Atajos de teclado</div>
              {ATAJOS_POS.map(a => (
                <div key={a.tecla} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 14px', gap: 16 }}>
                  <kbd style={{ background: '#0F172A', border: '1px solid #475569', borderRadius: 5,
                    padding: '2px 8px', fontSize: 11, fontFamily: 'monospace', color: '#F1F5F9',
                    fontWeight: 700, boxShadow: '0 1px 0 #475569' }}>{a.tecla}</kbd>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{a.accion}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Clock ── */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums',
        background: 'rgba(255,255,255,.07)', borderRadius: 6, padding: '4px 10px', flexShrink: 0 }}>
        <LiveClock />
      </div>
      {/* Cajero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
        background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '4px 10px 4px 6px',
        border: '1px solid rgba(255,255,255,.1)' }}>
        <Avatar size={26} style={{ background: avatarBg(cajeroNombre), fontSize: 11, flexShrink: 0 }}>
          {cajeroNombre.charAt(0).toUpperCase()}
        </Avatar>
        <div>
          <div style={{ fontSize: 10, color: '#CBD5E1', lineHeight: 1, textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: 1 }}>Cajero</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9', lineHeight: 1,
            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cajeroNombre}
          </div>
        </div>
      </div>
      {/* Badge supervisor activo */}
      {supervisorActiveBadge && (
        <Tooltip title="Modo supervisor activo — presiona ESC o × para salir">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F59E0B22',
            border: '1px solid #F59E0B55', borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
            <span style={{ fontSize: 10 }}>🛡</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', whiteSpace: 'nowrap' }}>
              SUP: {supervisorActiveBadge}
            </span>
            {onDesactivarSupervisor && (
              <button
                onClick={onDesactivarSupervisor}
                title="Salir del modo supervisor"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px',
                  color: '#F59E0B', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center' }}
              >×</button>
            )}
          </div>
        </Tooltip>
      )}
      {/* ── Menú de opciones (candado) ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowOpcionesMenu(v => !v)}
          style={{ height: 30, width: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,.15)', background: showOpcionesMenu ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)', color: '#F1F5F9', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Opciones"
        >
          <LockOutlined style={{ fontSize: 14 }} />
        </button>
        {showOpcionesMenu && (
          <>
            <div onClick={() => setShowOpcionesMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 1001, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', minWidth: 230, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
              <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>OPCIONES</div>
              {[
                { icon: <UserSwitchOutlined />, label: 'Supervisor', sub: 'Privilegios de supervisor', action: () => { setShowOpcionesMenu(false); onSupervisor(); } },
                { icon: <SwapOutlined />, label: 'Cambiar Usuario', sub: 'Intercambiar Usuario', action: () => { setShowOpcionesMenu(false); onCambiarUsuario(); } },
              ].map(item => (
                <button key={item.label} onClick={item.action} style={{ width: '100%', padding: '9px 16px', border: 'none', borderBottom: '1px solid #F8FAFC', background: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                  <span style={{ fontSize: 16, color: '#6B7280' }}>{item.icon}</span>
                  <div><div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{item.label}</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>{item.sub}</div></div>
                </button>
              ))}
              {/* Sucursal activa — siempre visible; botón "Cambiar" solo si hay >1 */}
              <div style={{ width: '100%', padding: '9px 16px', borderBottom: '1px solid #F8FAFC', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 16, color: '#6B7280' }}><ShopOutlined /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Sucursal</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sucursalNombre ?? '—'}</div>
                </div>
                {sucursales.length > 1 && (
                  <button
                    onClick={async () => {
                      setShowOpcionesMenu(false);
                      if (requireSupervisor) {
                        const ok = await requireSupervisor('Cambiar sucursal');
                        if (!ok) return;
                      }
                      setModalCambiarSucursal(true);
                    }}
                    style={{ flexShrink: 0, fontSize: 11, color: '#3B82F6', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Cambiar →
                  </button>
                )}
              </div>
              {[
                { icon: <LockOutlined />, label: 'Bloquear pantalla', sub: 'Bloquear pantalla con clave', action: () => { setShowOpcionesMenu(false); onBloquear(); } },
              ].map(item => (
                <button key={item.label} onClick={item.action} style={{ width: '100%', padding: '9px 16px', border: 'none', borderBottom: '1px solid #F8FAFC', background: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                  <span style={{ fontSize: 16, color: '#6B7280' }}>{item.icon}</span>
                  <div><div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{item.label}</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>{item.sub}</div></div>
                </button>
              ))}
              <button onClick={() => { setShowOpcionesMenu(false); onExit(); }} style={{ width: '100%', padding: '9px 16px', border: 'none', borderTop: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', outline: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <LogoutOutlined style={{ fontSize: 16, color: '#EF4444' }} />
                <div><div style={{ fontSize: 13, fontWeight: 500, color: '#EF4444' }}>Salir</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>Cerrar sesión</div></div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal: seleccionar sucursal */}
      <Modal
        open={modalCambiarSucursal}
        onCancel={() => { if (!cambiandoSucursal) setModalCambiarSucursal(false); }}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShopOutlined style={{ color: '#3B82F6' }} /> Cambiar sucursal</span>}
        footer={null}
        width={360}
      >
        {cambiandoSucursal ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}><Spin /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {sucursales.map(s => {
              const isActual = s.id === sucursalActual;
              return (
                <button
                  key={s.id}
                  disabled={isActual}
                  onClick={() => handleCambiarSucursal(s.id)}
                  style={{ width: '100%', padding: '10px 14px', border: `1px solid ${isActual ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 8, background: isActual ? '#EFF6FF' : '#fff', cursor: isActual ? 'default' : 'pointer', outline: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'background .12s' }}
                  onMouseEnter={e => { if (!isActual) (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { if (!isActual) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                >
                  <ShopOutlined style={{ fontSize: 16, color: isActual ? '#3B82F6' : '#6B7280' }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: isActual ? 600 : 400, color: isActual ? '#1D4ED8' : '#111827' }}>{s.nombre}</span>
                  {isActual && <span style={{ fontSize: 11, color: '#3B82F6', background: '#DBEAFE', borderRadius: 4, padding: '1px 6px' }}>Activa</span>}
                  {s.esPrincipal && !isActual && <span style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', borderRadius: 4, padding: '1px 6px' }}>Principal</span>}
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Categories sidebar ────────────────────────────────────────────────────────
function CategoriasSidebar({ categorias, selected, onSelect }: {
  categorias: string[]; selected: string; onSelect: (c: string) => void;
}) {
  const C = useC();
  const icons: Record<string, string> = { '__all__': '🏪', Bebidas: '🥤', Comida: '🍔', Electrónica: '📱', Ropa: '👔', Servicios: '⚙️' };
  return (
    <div style={{ width: 220, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: '10px 8px', scrollbarWidth: 'thin', scrollbarColor: C.border + ' transparent' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8, paddingLeft: 8 }}>Categorías</div>
      {categorias.map(cat => {
        const isSel = selected === cat;
        return (
          <button key={cat} onClick={() => onSelect(cat)} style={{
            width: '100%', height: 36, borderRadius: 8, border: 'none',
            background: isSel ? C.blue : 'transparent',
            color: isSel ? '#fff' : C.textSub,
            cursor: 'pointer', outline: 'none', marginBottom: 2,
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
            fontSize: 13, fontWeight: isSel ? 600 : 400, textAlign: 'left',
            transition: 'background 0.15s',
          }}
            onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = C.sidebarHov; }}
            onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 14 }}>{icons[cat] ?? '📦'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat === '__all__' ? 'Todos' : cat}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Apertura de turno ─────────────────────────────────────────────────────────
function ModalAperturaTurno({ open, vendedores, sucursales, onAbrir, onCancelar }: {
  open: boolean;
  vendedores: any[];
  sucursales: any[];
  onAbrir: (monto: number, vendedorId?: number, sucursalId?: number) => void;
  onCancelar: () => void;
}) {
  const C = useC();
  const [monto,       setMonto]      = useState(0);
  const [vendedorId,  setVendedorId] = useState<number | undefined>(() => {
    const v = localStorage.getItem('pos_last_vendedor_id');
    return v ? Number(v) : undefined;
  });
  const [sucursalSel, setSucursalSel] = useState<number | undefined>(() => {
    const s = localStorage.getItem('pos_last_sucursal_id');
    return s ? Number(s) : undefined;
  });
  const [t,           setT]          = useState(new Date());
  const [abriendo,    setAbriendo]   = useState(false);

  // Estado de la caja diaria — distingue entre sin apertura y ya cerrada
  const [cajaStatus, setCajaStatus] = useState<'loading' | 'sin_apertura' | 'abierta' | 'cerrada_hoy'>('loading');
  const [cajaInfo,   setCajaInfo]   = useState<{ id?: number; saldoApertura?: number } | null>(null);

  // Reloj
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Validar que el vendedor/sucursal guardados sigan existiendo en las listas
  useEffect(() => {
    if (vendedores.length > 0 && vendedorId && !vendedores.find((v: any) => v.id === vendedorId)) {
      setVendedorId(undefined);
      localStorage.removeItem('pos_last_vendedor_id');
    }
  }, [vendedores, vendedorId]);
  useEffect(() => {
    if (sucursales.length > 0 && sucursalSel && !sucursales.find((s: any) => s.id === sucursalSel)) {
      setSucursalSel(undefined);
      localStorage.removeItem('pos_last_sucursal_id');
    }
  }, [sucursales, sucursalSel]);

  // Consultar caja del día para este vendedor — se re-ejecuta al cambiar vendedorId
  useEffect(() => {
    if (!open) return;
    if (!vendedorId) { setCajaStatus('sin_apertura'); return; }
    setCajaStatus('loading');
    api.get(`/caja/hoy?vendedorId=${vendedorId}`)
      .then((res: any) => {
        const payload = res.data?.data ?? res.data;
        const caja    = payload?.cajas ? payload.cajas[0] : payload;
        if (!caja || caja.estado === 'sin_apertura') {
          setCajaStatus('sin_apertura');
          setCajaInfo(null);
        } else if (caja.estado === 'abierta') {
          setCajaStatus('abierta');
          setCajaInfo({ id: caja.id, saldoApertura: Number(caja.saldoApertura ?? 0) });
          if (caja.saldoApertura) setMonto(Number(caja.saldoApertura));
        } else {
          // estado === 'cerrada' o 'revisada' → turno ya terminado hoy
          setCajaStatus('cerrada_hoy');
          setCajaInfo(null);
        }
      })
      .catch(() => { setCajaStatus('sin_apertura'); setCajaInfo(null); });
  }, [open, vendedorId]);

  const sinVendedores     = vendedores.length === 0;
  const vendedorRequerido = !vendedorId;          // siempre obligatorio
  const turnoYaCerrado    = cajaStatus === 'cerrada_hoy';
  const bloqueado         = vendedorRequerido || turnoYaCerrado;
  const cargando          = cajaStatus === 'loading' || abriendo;

  const handleAbrir = async () => {
    if (bloqueado || cargando) return;
    setAbriendo(true);
    if (vendedorId) localStorage.setItem('pos_last_vendedor_id', String(vendedorId));
    if (sucursalSel) localStorage.setItem('pos_last_sucursal_id', String(sucursalSel));
    const vendedorSeleccionado = vendedores.find((v: any) => v.id === vendedorId);
    const nombreVendedor       = vendedorSeleccionado?.nombre ?? undefined;
    try {
      if (cajaStatus === 'sin_apertura') {
        await api.post('/caja/abrir', {
          saldoApertura:  monto,
          vendedorId,
          vendedorNombre: nombreVendedor,
        });
      }
      onAbrir(monto, vendedorId, sucursalSel);
    } catch (e: any) {
      const httpStatus = (e as any)?.response?.status;
      const errMsg: string = (e as any)?.response?.data?.errors?.[0] ?? (e as any)?.response?.data?.message ?? '';

      // 400 — caja ya cerrada hoy
      if (httpStatus === 400 && (errMsg.includes('cerrada') || errMsg.includes('ya existe') || errMsg.includes('ya abierta'))) {
        setCajaStatus('cerrada_hoy');
        setAbriendo(false);
        return;
      }

      // 401 / sesión expirada — NO abrir turno sin caja en BD
      // El interceptor ya redirige a login; aquí solo bloqueamos la apertura
      if (httpStatus === 401 || errMsg.includes('SESION_DESPLAZADA') || errMsg.includes('expirado') || errMsg.includes('inválido')) {
        message.error('Tu sesión expiró. Por favor inicia sesión nuevamente.', 5);
        setAbriendo(false);
        return; // NO llamar onAbrir — el interceptor maneja la redirección
      }

      // Cualquier otro error de red / 500 — tampoco abrir sin caja
      const detalleError = (e as any)?.response?.data?.message ?? (e as any)?.message ?? 'error desconocido';
      console.error('[AperturaTurno] Error al abrir caja:', detalleError, e);
      message.error(`No se pudo registrar la caja diaria. Verifica tu conexión e intenta de nuevo.`, 5);
      setAbriendo(false);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <Modal open={open} footer={null} closable={false} centered width="min(400px, 95vw)"
      styles={{ content: { background: C.card, borderRadius: 20, padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}>
      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <Tooltip title="Salir del Punto de Venta">
            <button onClick={onCancelar} style={{
              position: 'absolute', top: 0, right: 0,
              width: 30, height: 30, borderRadius: 8,
              border: `1px solid ${C.border2}`, background: C.inputBg,
              color: C.textSub, cursor: 'pointer', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none',
              transition: 'background 0.15s, color 0.15s',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,.4)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.inputBg; (e.currentTarget as HTMLButtonElement).style.color = C.textSub; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border2; }}
            >✕</button>
          </Tooltip>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏪</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text, display: 'block' }}>Apertura de Turno</span>
          <span style={{ fontSize: 12, color: C.textSub, display: 'block', marginTop: 4 }}>
            {t.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.blue, display: 'block', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {t.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Estado de la caja diaria */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          borderRadius: 10, padding: '10px 14px',
          background: cajaStatus === 'abierta' ? C.green+'18' : cajaStatus === 'cerrada_hoy' ? C.red+'18' : cajaStatus === 'sin_apertura' ? C.orange+'18' : 'rgba(255,255,255,.04)',
          border: `1px solid ${cajaStatus === 'abierta' ? C.green+'44' : cajaStatus === 'cerrada_hoy' ? C.red+'44' : cajaStatus === 'sin_apertura' ? C.orange+'44' : C.border}`,
        }}>
          <span style={{ fontSize: 18 }}>
            {cajaStatus === 'loading' ? '⏳' : cajaStatus === 'abierta' ? '✅' : cajaStatus === 'cerrada_hoy' ? '🔒' : '💰'}
          </span>
          <div>
            <span style={{
              fontSize: 12, fontWeight: 700, display: 'block',
              color: cajaStatus === 'abierta'     ? C.green  :
                     cajaStatus === 'cerrada_hoy' ? C.red    :
                     cajaStatus === 'sin_apertura'? C.orange : C.textSub,
            }}>
              {cajaStatus === 'loading'      ? 'Verificando caja diaria...'                  :
               cajaStatus === 'abierta'      ? 'Caja diaria ya abierta hoy'                  :
               cajaStatus === 'cerrada_hoy'  ? 'Este cajero ya cerró su turno hoy'           :
               sinVendedores                 ? 'No hay vendedores — configúralos primero'    :
               vendedorId                    ? 'La caja diaria se abrirá junto con el turno' :
                                               'Selecciona el cajero para verificar su caja'}
            </span>
            {cajaStatus === 'abierta' && cajaInfo?.saldoApertura != null && (
              <span style={{ fontSize: 11, color: C.textSub }}>
                Apertura: RD$ {cajaInfo.saldoApertura.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>
            )}
            {cajaStatus === 'sin_apertura' && vendedorId && (
              <span style={{ fontSize: 11, color: C.textSub }}>
                El monto inicial se usará como saldo de apertura
              </span>
            )}
            {cajaStatus === 'cerrada_hoy' && (
              <div style={{ fontSize: 11, color: C.textSub }}>
                <div>Un cajero solo puede tener un turno por día.</div>
                <div style={{ marginTop: 4, color: C.orange, fontWeight: 600 }}>
                  ✦ El administrador puede ir a <strong>Caja Diaria</strong> → menú de esta caja → <strong>"Anular cierre"</strong> para reabrir el turno.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cajero / vendedor */}
        {vendedores.length > 0 && (
          <div>
            <span style={{ fontSize: 12, color: C.textSub, marginBottom: 8, display: 'block' }}>Cajero responsable</span>
            <Select
              showSearch allowClear
              placeholder="Selecciona el cajero"
              style={{ width: '100%' }}
              value={vendedorId}
              onChange={(v) => setVendedorId(v)}
              optionFilterProp="label"
              options={vendedores.map((v: any) => ({ value: v.id, label: `${v.codigo ? v.codigo + ' — ' : ''}${v.nombre}` }))}
              styles={{ popup: { root: { zIndex: 9999 } } }}
            />
          </div>
        )}

        {/* Sucursal */}
        {sucursales.length > 1 && (
          <div>
            <span style={{ fontSize: 12, color: C.textSub, marginBottom: 8, display: 'block' }}>Sucursal</span>
            <Select
              showSearch allowClear
              placeholder="Selecciona la sucursal"
              style={{ width: '100%' }}
              value={sucursalSel}
              onChange={(v) => setSucursalSel(v)}
              optionFilterProp="label"
              options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))}
              styles={{ popup: { root: { zIndex: 9999 } } }}
            />
          </div>
        )}

        {/* Monto inicial — solo editable si la caja está cerrada */}
        <div>
          <span style={{ fontSize: 12, color: C.textSub, marginBottom: 8, display: 'block' }}>
            Monto inicial en caja (RD$)
            {cajaStatus === 'abierta' && (
              <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 600 }}>— ya registrado en caja</span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.inputBg, borderRadius: 10, padding: '8px 14px', border: `1px solid ${cajaStatus === 'abierta' ? C.green+'44' : C.border2}`, opacity: (cajaStatus === 'abierta' || turnoYaCerrado) ? 0.6 : 1 }}>
            <span style={{ color: C.textSub, fontSize: 14 }}>RD$</span>
            <input type="number" value={monto || ''} onChange={(e) => setMonto(Number(e.target.value))}
              placeholder="0.00" readOnly={cajaStatus === 'abierta' || turnoYaCerrado}
              style={{ flex: 1, background: 'transparent', border: 'none', color: C.text, fontSize: 20, fontWeight: 600, outline: 'none', textAlign: 'right' }} />
          </div>
          {cajaStatus === 'sin_apertura' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[500, 1000, 2000, 5000].map(a => (
                <button key={a} onClick={() => setMonto(a)} style={{ flex: 1, height: 28, borderRadius: 6, border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.05)', color: C.textSub, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                  {a >= 1000 ? `${a/1000}K` : a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Advertencias */}
        {sinVendedores && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.red+'18', border: `1px solid ${C.red}44`, borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 13 }}>🚫</span>
            <span style={{ fontSize: 12, color: C.red, fontWeight: 500 }}>
              No hay vendedores configurados. Ve a <strong>Configuración → Vendedores</strong> para agregar uno antes de abrir el turno.
            </span>
          </div>
        )}
        {!sinVendedores && vendedorRequerido && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.orange+'18', border: `1px solid ${C.orange}44`, borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span style={{ fontSize: 12, color: C.orange, fontWeight: 500 }}>Debes seleccionar el cajero responsable para abrir el turno.</span>
          </div>
        )}
        {turnoYaCerrado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.red+'18', border: `1px solid ${C.red}44`, borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 12, color: C.red, fontWeight: 500 }}>Este cajero ya completó su turno hoy. Solo puede abrirse un turno por vendedor por día.</span>
          </div>
        )}

        <button onClick={handleAbrir}
          disabled={bloqueado || cargando}
          style={{
            height: 48, borderRadius: 12, border: 'none',
            background: (bloqueado || cargando) ? '#4B5563' : 'linear-gradient(135deg,#059669,#10B981)',
            color: (bloqueado || cargando) ? '#9CA3AF' : '#fff',
            fontSize: 15, fontWeight: 700,
            cursor: (bloqueado || cargando) ? 'not-allowed' : 'pointer',
            outline: 'none',
            boxShadow: (bloqueado || cargando) ? 'none' : '0 4px 16px rgba(16,185,129,.35)',
            transition: 'all 0.2s',
          }}>
          {abriendo ? '⏳ Abriendo...' : turnoYaCerrado ? '🔒 Turno cerrado' : '🏪 Abrir Turno'}
        </button>
      </div>
    </Modal>
  );
}

// ── Recibo térmico genérico (cotizaciones, pre-facturas, conduces, etc.) ─────

interface GenericDocData {
  tipo:        string;          // "COTIZACIÓN", "PRE-FACTURA", "CONDUCE", etc.
  numero:      string;
  fecha:       string;
  empresa?:    { nombre?: string; rnc?: string; direccion?: string; telefono?: string };
  cliente?:    string;
  rncCliente?: string;
  items:       Array<{ desc: string; cant?: number; precio?: number; total?: number }>;
  subtotal?:   number;
  itbis?:      number;
  total?:      number;
  nota1?:      string;         // línea extra (ej: "Factura ref: FAC-XXX")
  nota2?:      string;
  notas?:      string;
}

function GenericThermalDoc({ doc }: { doc: GenericDocData }) {
  const moneda = (v?: number) => v !== undefined ? `RD$${Number(v).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '';
  const e = doc.empresa ?? {};
  return (
    <div style={{ fontFamily:'monospace', fontSize:12, color:'#000', background:'#fff', width:'100%', maxWidth:300, padding:'6px 4px', lineHeight:1.5 }}>
      {/* Encabezado empresa */}
      {e.nombre && <div style={{ textAlign:'center', fontWeight:900, fontSize:14, letterSpacing:1 }}>{e.nombre}</div>}
      {e.rnc     && <div style={{ textAlign:'center', fontSize:11 }}>RNC: {e.rnc}</div>}
      {e.direccion&&<div style={{ textAlign:'center', fontSize:10, wordBreak:'break-word' }}>{e.direccion}</div>}
      {e.telefono && <div style={{ textAlign:'center', fontSize:10 }}>Tel: {e.telefono}</div>}

      <div style={{ borderTop:'1px dashed #000', margin:'5px 0' }} />

      {/* Tipo y número */}
      <div style={{ textAlign:'center', fontWeight:900, fontSize:13 }}>{doc.tipo}</div>
      <div style={{ textAlign:'center', fontWeight:700, fontSize:11 }}>N°: {doc.numero}</div>
      <div style={{ fontSize:11 }}>Fecha: {doc.fecha}</div>
      {doc.cliente    && <div style={{ fontSize:11 }}>Cliente: {doc.cliente}</div>}
      {doc.rncCliente && <div style={{ fontSize:10 }}>RNC: {doc.rncCliente}</div>}
      {doc.nota1      && <div style={{ fontSize:10 }}>{doc.nota1}</div>}

      <div style={{ borderTop:'1px dashed #000', margin:'5px 0' }} />

      {/* Encabezado columnas */}
      <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:10 }}>
        <span style={{ flex:2 }}>DESCRIPCIÓN</span>
        {doc.items.some(i=>i.cant!==undefined)   && <span style={{ width:30, textAlign:'right' }}>CANT</span>}
        {doc.items.some(i=>i.total!==undefined)  && <span style={{ width:65, textAlign:'right' }}>TOTAL</span>}
      </div>
      <div style={{ borderTop:'1px solid #000', marginBottom:2 }} />

      {/* Ítems */}
      {doc.items.map((it, i) => (
        <div key={i} style={{ marginBottom:2 }}>
          <div style={{ fontSize:11, fontWeight:600, wordBreak:'break-word' }}>{it.desc}</div>
          {(it.cant !== undefined || it.precio !== undefined) && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#444', paddingLeft:6 }}>
              {it.cant  !== undefined && <span>{it.cant} × {moneda(it.precio)}</span>}
              {it.total !== undefined && <span style={{ fontWeight:700, color:'#000' }}>{moneda(it.total)}</span>}
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop:'1px dashed #000', margin:'5px 0' }} />

      {/* Totales */}
      {doc.subtotal !== undefined && (
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
          <span>Subtotal</span><span>{moneda(doc.subtotal)}</span>
        </div>
      )}
      {doc.itbis !== undefined && doc.itbis > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
          <span>ITBIS (18%)</span><span>{moneda(doc.itbis)}</span>
        </div>
      )}
      {doc.total !== undefined && (
        <div style={{ display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:14, marginTop:3 }}>
          <span>TOTAL</span><span>{moneda(doc.total)}</span>
        </div>
      )}

      {/* Notas */}
      {doc.nota2 && (
        <>
          <div style={{ borderTop:'1px dashed #000', margin:'5px 0' }} />
          <div style={{ fontSize:10, textAlign:'center' }}>{doc.nota2}</div>
        </>
      )}
      {doc.notas && (
        <div style={{ fontSize:10, marginTop:4, borderTop:'1px dashed #000', paddingTop:4 }}>
          Nota: {doc.notas}
        </div>
      )}

      <div style={{ textAlign:'center', fontSize:9, marginTop:8, color:'#555' }}>
        Generado por HiCloud ERP · hicloud.app
      </div>
    </div>
  );
}

// ── Recibo térmico genérico (conduce, cobro, anticipo, notas crédito/débito) ──
function buildDocTermicoHTML(
  gd: GenericDocData,
  cfg: { tipoImpresora?: string } = {},
): string {
  const { tipoImpresora = '80mm' } = cfg;
  const prn  = IMPRESORA_CONFIG[tipoImpresora] ?? IMPRESORA_CONFIG['80mm'];
  const fmt  = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row  = (l: string, v: string) => `<div class="row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const line = () => '<div class="line"></div>';
  const dbl  = () => '<div class="dbl"></div>';
  const e    = gd.empresa ?? {};
  const tipo = gd.tipo;

  const hasTotals = gd.items.some(i => i.total !== undefined);
  const hasCant   = gd.items.some(i => i.cant  !== undefined);

  const itemsHtml = gd.items.map(item => {
    const nom = (item.desc ?? '').length > 26 ? (item.desc ?? '').slice(0, 25) + '…' : (item.desc ?? '');
    if (hasTotals) {
      const qtyStr   = item.cant !== undefined && item.cant > 0 ? ` ×${item.cant}` : '';
      const totalStr = item.total !== undefined ? item.total.toFixed(2) : '';
      return `<div class="row"><span>${esc(nom + qtyStr)}</span><span>${totalStr}</span></div>`;
    }
    const qtyStr = item.cant !== undefined ? ` — ${item.cant}` : '';
    return `<div>${esc(nom + qtyStr)}</div>`;
  }).join('');

  const footerHtml =
      tipo.includes('CONDUCE')  ? '<div class="center bold">** DOCUMENTO DE DESPACHO **</div>'
    : tipo.includes('ANTICIPO') ? '<div class="center bold">** RECIBO DE ANTICIPO **</div><div class="center small">Documento interno de pago</div>'
    : tipo.includes('COBRO')    ? '<div class="center bold">** RECIBO DE COBRO **</div><div class="center small">Documento interno de pago</div>'
    : tipo.includes('CRÉDITO')  ? '<div class="center bold">** NOTA DE CRÉDITO **</div>'
    : tipo.includes('DÉBITO')   ? '<div class="center bold">** NOTA DE DÉBITO **</div>'
    : tipo.includes('GASTO')    ? '<div class="center bold">** COMPROBANTE DE GASTO **</div>'
    :                             '<div class="center small">Documento no fiscal</div>';

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=302,initial-scale=1,shrink-to-fit=no">
<title>${esc(tipo)} ${esc(gd.numero)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word}
html{margin:0;padding:0;width:${prn.width}}
body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
  width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
  color:#000;background:#fff;-webkit-font-smoothing:none;font-smooth:never}
.center{text-align:center}
.bold{font-weight:bold}
.xlarge{font-size:15pt;font-weight:bold}
.small{font-size:9pt}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0;width:100%}
.row span:first-child{flex:1;overflow:hidden}
.row span:last-child{text-align:right;white-space:nowrap}
.line{border-top:1px dashed #000;margin:4px 0}
.dbl{border-top:2px solid #000;margin:4px 0}
@page{size:${prn.width} auto;margin:0}
@media print{html,body{width:${prn.width}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

${e.nombre    ? `<div class="center xlarge">${esc(e.nombre)}</div>`    : ''}
<div class="center small">República Dominicana</div>
${e.rnc       ? `<div>RNC Emisor: ${esc(e.rnc)}</div>`                : ''}
${e.direccion ? `<div class="small">${esc(e.direccion)}</div>`         : ''}
${e.telefono  ? `<div>Tel: ${esc(e.telefono)}</div>`                   : ''}
${dbl()}
<div class="center bold">${esc(tipo)}</div>
${line()}
${row('Número:', gd.numero)}
${row('Fecha:',  gd.fecha)}
${gd.cliente    ? row('Cliente:', gd.cliente)    : ''}
${gd.rncCliente ? row('RNC:',     gd.rncCliente) : ''}
${gd.nota1      ? `<div class="small">${esc(gd.nota1)}</div>` : ''}
${line()}
<div class="row bold"><span>DESCRIPCIÓN</span>${hasTotals ? '<span>TOTAL</span>' : hasCant ? '<span>CANT</span>' : ''}</div>
${line()}
${itemsHtml}
${dbl()}
${gd.subtotal !== undefined                        ? row('Subtotal:',    fmt(gd.subtotal)) : ''}
${gd.itbis    !== undefined && gd.itbis > 0        ? row('ITBIS (18%):', fmt(gd.itbis))   : ''}
${gd.total    !== undefined ? `<div class="row xlarge bold"><span>TOTAL:</span><span>${fmt(gd.total)}</span></div>` : ''}
${line()}
${gd.nota2 ? `<div class="small">${esc(gd.nota2)}</div>\n${line()}` : ''}
${gd.notas ? `<div class="small">Nota: ${esc(gd.notas)}</div>\n${line()}` : ''}
${footerHtml}

</body></html>`;
}

// ── Impresión térmica de Cierre de Caja ──────────────────────────────────────
function buildCierreCajaHTML(params: {
  empresa:  { nombre?: string; rnc?: string; direccion?: string; telefono?: string };
  caja:     { numero?: string; id: number; fecha: string; vendedorNombre?: string; cantidadTransacciones?: number };
  ops:      { efectivoInicial: number; vendidoContado: number; vendidoCredito: number; totalVendido: number; totalRecibos: number; totalAnticipos: number; gastosEfectivo: number; efectivoEnCaja: number };
  billetes: Record<string, number>;
  pago:     Record<string, string>;
  totalBilletes: number;
  totalFisico:   number;
  nota?:    string;
  tipoImpresora?: string;
}): string {
  const prn = IMPRESORA_CONFIG[params.tipoImpresora ?? '80mm'] ?? IMPRESORA_CONFIG['80mm'];
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = (v: number) => `RD$${v.toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const line = () => `<div class="sep">--------------------------------</div>`;
  const row  = (lbl: string, val: string, bold = false) =>
    `<div class="row${bold?' bold':''}"><span>${esc(lbl)}</span><span>${esc(val)}</span></div>`;

  const emp = params.empresa;
  const c   = params.caja;
  const ops = params.ops;

  const billetesRows = Object.entries(params.billetes)
    .filter(([,qty]) => Number(qty) > 0)
    .map(([den,qty]) => row(`  ${Number(den).toLocaleString()}  ×${qty}:`, fmt(Number(den)*Number(qty))))
    .join('\n');

  const PAGO_LABELS: Record<string,string> = {
    efectivo:'Efectivo', tarjetaCredito:'Tarjeta Crédito', tarjetaDebito:'Tarjeta Débito',
    cheque:'Cheque', transferencia:'Transferencia', otro:'Otro', deposito:'Depósito', documentos:'Documentos',
  };
  const pagoRows = Object.entries(params.pago)
    .filter(([,v]) => Number(v) > 0)
    .map(([k,v]) => row(`  ${PAGO_LABELS[k] ?? k}:`, fmt(Number(v))))
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @media print { @page { size:${prn.width} auto; margin:0; } }
  body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
    width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
    color:#000;background:#fff;-webkit-font-smoothing:none;font-smooth:never}
  .center{text-align:center}
  .row{display:flex;justify-content:space-between;gap:4px}
  .bold{font-weight:900}
  .sep{color:#000;margin:2px 0}
  .small{font-size:0.85em}
  .xlarge{font-size:1.2em}
  .title{font-size:1.1em;font-weight:900;text-align:center;letter-spacing:1px;margin:4px 0}
</style></head><body>
${emp.nombre ? `<div class="center bold">${esc(emp.nombre)}</div>` : ''}
${emp.rnc    ? `<div class="center small">RNC: ${esc(emp.rnc)}</div>` : ''}
${emp.direccion ? `<div class="center small">${esc(emp.direccion)}</div>` : ''}
${emp.telefono  ? `<div class="center small">Tel: ${esc(emp.telefono)}</div>` : ''}
${line()}
<div class="title">CIERRE DE CAJA</div>
${line()}
${row('Caja:', c.numero ?? `#${c.id}`)}
${row('Fecha:', String(c.fecha).substring(0,10))}
${c.vendedorNombre ? row('Vendedor:', c.vendedorNombre) : ''}
${c.cantidadTransacciones != null ? row('Transacciones:', String(c.cantidadTransacciones)) : ''}
${line()}
<div class="small bold">DESGLOSE DE OPERACIONES</div>
${row('Efectivo Inicial:', fmt(ops.efectivoInicial))}
${row('Vendido Contado:', fmt(ops.vendidoContado))}
${row('Vendido Crédito:', fmt(ops.vendidoCredito))}
${row('Total Vendido:', fmt(ops.totalVendido), true)}
${row('Total Recibos:', fmt(ops.totalRecibos))}
${row('Total Anticipos:', fmt(ops.totalAnticipos))}
${row('Total Dev. y Des:', fmt(ops.gastosEfectivo))}
${line()}
${row('Efectivo en Caja:', fmt(ops.efectivoEnCaja), true)}
${params.totalBilletes > 0 ? `${line()}
<div class="small bold">DESGLOSE DE BILLETES</div>
${billetesRows}
${row('Total Billetes:', fmt(params.totalBilletes), true)}` : ''}
${pagoRows ? `${line()}
<div class="small bold">DESGLOSE DE PAGO</div>
${pagoRows}` : ''}
${params.totalFisico > 0 ? `${line()}
${row('Total Físico:', fmt(params.totalFisico), true)}` : ''}
${params.nota ? `${line()}<div class="small">Nota: ${esc(params.nota)}</div>` : ''}
${line()}
<div class="center bold">** CIERRE DE CAJA **</div>
<div class="center small">Documento interno</div>
${line()}
</body></html>`;
}

// ── Modal éxito post-venta ────────────────────────────────────────────────────
function ModalExito({ sale, onNueva, onCrearConduce, autoImprimir, mostrarEcf = true, posConfig = {} }: {
  sale: Sale | null;
  onNueva: () => void;
  onCrearConduce?: () => void;
  autoImprimir?: boolean;
  mostrarEcf?: boolean;
  posConfig?: { tipoImpresora?: string; mensajeTicket?: string; politicaDev?: string };
}) {
  const C = useC();
  const [countdown, setCountdown] = useState(10);
  const intervalRef  = useRef<ReturnType<typeof setInterval>  | null>(null);
  const printTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // QR generado aquí para incluirlo en el HTML del botón de impresión manual
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const autoPrintedFolioRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sale?.qrUrl || sale.ecfPendiente) { setQrDataUrl(null); return; }
    QRCode.toDataURL(sale.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [sale?.qrUrl, sale?.ecfPendiente]);

  const cancelarContador = useCallback(() => {
    if (printTimerRef.current) { clearTimeout(printTimerRef.current);  printTimerRef.current  = null; }
    if (intervalRef.current)   { clearInterval(intervalRef.current);   intervalRef.current    = null; }
  }, []);

  useEffect(() => {
    if (!sale) return;
    setCountdown(10);
    intervalRef.current = setInterval(() => setCountdown(c => {
      if (c <= 1) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        onNueva();
        return 0;
      }
      return c - 1;
    }), 1000);
    return cancelarContador;
  }, [sale]);

  // Auto-imprimir: el QR se genera dentro del effect para evitar condiciones de carrera
  // con el state qrDataUrl — si se dependiera del state, el setQrDataUrl() del QR effect
  // cancelaría el setTimeout antes de que dispare (cleanup de react al cambiar deps).
  useEffect(() => {
    if (!sale || !autoImprimir) return;
    if (autoPrintedFolioRef.current === sale.folio) return;
    autoPrintedFolioRef.current = sale.folio;
    let cancelled = false;
    const qrPromise: Promise<string | null> = sale.qrUrl && !sale.ecfPendiente
      ? QRCode.toDataURL(sale.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }).catch(() => null)
      : Promise.resolve(null);
    qrPromise.then(qr => {
      if (cancelled) return;
      cancelarContador();
      imprimirReciboTermico(buildReciboTermicoHTML(sale, qr, { mostrarEcf, ...posConfig }), onNueva);
    });
    return () => { cancelled = true; };
  }, [sale?.folio, autoImprimir]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = () => {
    cancelarContador();
    imprimirReciboTermico(buildReciboTermicoHTML(sale!, qrDataUrl, { mostrarEcf, ...posConfig }), onNueva);
  };


  if (!sale) return null;

  return (
    <Modal open={!!sale} footer={null} closable={false} centered width="min(400px, 95vw)"
      styles={{ content: { background: C.card, borderRadius: 20, padding: 0, overflow: 'hidden' }, body: { padding: 0 } }}>
      <div>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'linear-gradient(135deg,#059669,#10B981)', padding: '28px 24px', textAlign: 'center' }}>
          <motion.div animate={{ scale: [0.5, 1.2, 1] }} transition={{ duration: 0.5 }}>
            <CheckCircleOutlined style={{ fontSize: 52, color: '#fff', display: 'block', margin: '0 auto' }} />
          </motion.div>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, display: 'block', marginTop: 10 }}>¡Venta completada!</span>
          <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 13 }}>{sale.folio}</span>
        </motion.div>
        <div style={{ padding: '16px 20px' }}>
          {sale.cliente && (
            <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(255,255,255,.05)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: C.textSub }}>Cliente: </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{sale.cliente}</span>
            </div>
          )}
          <div style={{ borderTop: `1px dashed ${C.border2}`, borderBottom: `1px dashed ${C.border2}`, padding: '8px 0', margin: '8px 0' }}>
            {sale.items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: C.text }}>{item.produto.nombre.substring(0, 22)} ×{item.cantidad}</span>
                <span style={{ fontWeight: 600, color: C.text }}>{fmt.money((item.precio - item.descuentoMonto) * item.cantidad)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: C.textSub }}>Subtotal</span>
            <span style={{ fontSize: 11, color: C.text }}>{fmt.money(sale.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: (sale.propina ?? 0) > 0 ? 4 : 8 }}>
            <span style={{ fontSize: 11, color: C.textSub }}>ITBIS</span>
            <span style={{ fontSize: 11, color: C.text }}>{fmt.money(sale.iva)}</span>
          </div>
          {(sale.propina ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#B45309' }}>🙏 Propina</span>
              <span style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>+{fmt.money(sale.propina!)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${C.border2}`, paddingTop: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>TOTAL</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{fmt.money(sale.total)}</span>
          </div>
          <div style={{ background: 'rgba(16,185,129,.1)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: C.textSub }}>Método</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{METODOS.find(m => m.key === sale.metodo)?.icon} {METODOS.find(m => m.key === sale.metodo)?.label}</span>
            </div>
            {sale.metodo === 'efectivo' && sale.cambio > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Cambio</span>
                <span style={{ fontSize: 17, color: C.green, fontWeight: 700 }}>{fmt.money(sale.cambio)}</span>
              </div>
            )}
          </div>

          {/* Estado del e-CF */}
          {sale.encf ? (
            <div style={{
              borderRadius: 8, padding: '7px 12px', marginBottom: 10,
              background: sale.ecfPendiente ? 'rgba(251,191,36,.1)' : 'rgba(16,185,129,.08)',
              border: `1px solid ${sale.ecfPendiente ? '#FCD34D55' : '#6EE7B755'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: 'uppercase' }}>
                  {sale.ecfPendiente ? '⏳ e-CF En Proceso' : '✓ e-CF'}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: sale.ecfPendiente ? '#D97706' : C.green }}>
                  {sale.encf}
                </span>
              </div>
              {sale.ecfPendiente && (
                <div style={{ fontSize: 10, color: '#D97706', marginTop: 2 }}>
                  Se validará con DGII automáticamente
                </div>
              )}
            </div>
          ) : (
            <div style={{ borderRadius: 8, padding: '6px 12px', marginBottom: 10, background: 'rgba(107,114,128,.1)', border: '1px solid rgba(107,114,128,.2)' }}>
              <span style={{ fontSize: 11, color: C.textSub }}>⏳ Comprobante en proceso de emisión</span>
            </div>
          )}
          <button onClick={handlePrint} style={{
            width: '100%', height: 38, borderRadius: 10, border: `1px solid ${C.border2}`,
            background: 'rgba(255,255,255,.07)', color: C.text,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 8,
          }}>
            <PrinterOutlined style={{ fontSize: 16 }} /> Imprimir recibo térmico
          </button>
          {onCrearConduce && (
            <button onClick={() => { cancelarContador(); onCrearConduce(); }}
              style={{ width: '100%', height: 38, borderRadius: 10, border: `1px solid #3B82F6`,
                background: 'rgba(59,130,246,.1)', color: '#3B82F6',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
              🚚 Crear Conduce de Entrega
            </button>
          )}
          <button onClick={onNueva} style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#059669,#10B981)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', outline: 'none', boxShadow: '0 4px 16px rgba(16,185,129,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            ✚ Nueva Venta
            <span style={{ fontSize: 11, opacity: 0.8, background: 'rgba(0,0,0,.25)', borderRadius: 4, padding: '1px 7px' }}>{countdown}s</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── POS Bottom Navigation Bar ─────────────────────────────────────────────────

// ── Modal Nota de Crédito POS ────────────────────────────────────────────────

const CODIGOS_MOD_POS = [
  { value: '1', label: 'Código 1: Anulación total',             desc: 'Anula completamente la factura original ante la DGII.' },
  { value: '2', label: 'Código 2: Corrección de texto',         desc: 'Corrige datos descriptivos sin afectar montos.' },
  { value: '3', label: 'Código 3: Devolución / Ajuste montos',  desc: 'Devuelve mercancía o acredita un monto parcial o total.' },
  { value: '4', label: 'Código 4: Reemplazo por contingencia',  desc: 'Reemplaza un comprobante emitido en modo contingencia.' },
];

function POSNotaCreditoModal({ open, onClose, palette, requireSupervisor }: {
  open: boolean; onClose: () => void; palette: Palette;
  requireSupervisor?: (action: string, detail?: string) => Promise<boolean>;
}) {
  const C  = palette;
  const qc = useQueryClient();
  const [tipo,        setTipo]        = useState<'descuento'|'devolucion'>('devolucion');
  const [codigoMod,   setCodigoMod]   = useState('3');
  const [clienteId,   setClienteId]   = useState<number|null>(null);
  const [facturaRef,  setFacturaRef]  = useState('');
  const [facturaData, setFacturaData] = useState<any>(null);
  const [saldoNC,     setSaldoNC]     = useState<any>(null);
  const [fecha,       setFecha]       = useState(dayjs().format('YYYY-MM-DD'));
  const [notas,       setNotas]       = useState('');
  const [inclIVA,     setInclIVA]     = useState(true);
  const [sinItbis,    setSinItbis]    = useState(false);
  const [esEfectivo,  setEsEfectivo]  = useState(false);
  const [aplicarFac,  setAplicarFac]  = useState(true);
  const [buscando,    setBuscando]    = useState(false);
  const [devolver,    setDevolver]    = useState<Record<number,number>>({});
  const [precioEdit,  setPrecioEdit]  = useState<Record<number,string>>({});

  const { data: clientes } = useQuery<any>({
    queryKey: ['pos-clientes-nc'],
    queryFn: () => api.get('/clientes?limit=50').then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    staleTime: 60_000,
    enabled: open,
  });

  const buscarFactura = async () => {
    if (!facturaRef.trim()) return;
    setBuscando(true);
    setSaldoNC(null);
    try {
      const r = await api.get(`/facturas?search=${encodeURIComponent(facturaRef.trim())}&limit=1`);
      const d = r.data?.data ?? r.data;
      const rows = d?.data ?? d ?? [];
      if (rows.length > 0) {
        const full = await api.get(`/facturas/${rows[0].id}`);
        const f = full.data?.data ?? full.data;
        setFacturaData(f);
        if (f.clienteId) setClienteId(f.clienteId);
        const devInit: Record<number,number> = {};
        const precInit: Record<number,string> = {};
        (f.detalles ?? []).forEach((det: any) => {
          devInit[det.id]  = Number(det.cantidad);
          precInit[det.id] = String(Number(det.precioUnitario));
        });
        setDevolver(devInit);
        setPrecioEdit(precInit);
        // Cargar saldo disponible para NC
        try {
          const sr = await api.get(`/notas-credito/por-factura/${f.id}/saldo-disponible`);
          setSaldoNC(sr.data?.data ?? sr.data);
        } catch { /* no crítico */ }
      } else {
        message.warning('Factura no encontrada');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Error al buscar factura');
    } finally { setBuscando(false); }
  };

  // Calcular subtotal y total de la NC en tiempo real
  const subtotalNC = (() => {
    if (!facturaData?.detalles) return 0;
    return facturaData.detalles
      .filter((d: any) => (devolver[d.id] ?? 0) > 0)
      .reduce((s: number, d: any) => s + (Number(precioEdit[d.id] ?? d.precioUnitario) * (devolver[d.id] ?? 0)), 0);
  })();
  const itbisNC  = sinItbis ? 0 : subtotalNC * 0.18;
  const totalNC  = subtotalNC + itbisNC;
  const saldoDisponible = saldoNC ? saldoNC.saldoDisponible : Number(facturaData?.total ?? 0);

  const guardarMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error('Selecciona un cliente');
      if (!facturaData?.id) throw new Error('Busca la factura de origen primero');
      if (!codigoMod)  throw new Error('Selecciona el Código de Modificación DGII');

      // Validar que no supere el saldo disponible
      if (codigoMod !== '1' && totalNC > saldoDisponible + 0.005) {
        throw new Error(`El monto a acreditar (${fmt.money(totalNC)}) supera el saldo disponible (${fmt.money(saldoDisponible)})`);
      }

      // Calcular porcentaje ITBIS exacto del original para revertirlo sin duplicarlo
      const _subOrig = Number(facturaData.subtotal) || Number(facturaData.total) || 1;
      const _ivaOrig = Number(facturaData.iva ?? 0);
      const _pctOrig = _subOrig > 0.01 ? Math.round(_ivaOrig / _subOrig * 10000) / 100 : 0;
      const detalles = codigoMod === '1'
        ? [{ descripcion: `Anulación total de ${facturaData.folio}`, cantidad: 1,
             precioUnitario: _subOrig,
             porcentajeIva: sinItbis ? 0 : _pctOrig }]
        : facturaData.detalles
            .filter((d: any) => (devolver[d.id] ?? 0) > 0)
            .map((d: any) => ({
              productoId: d.productoId, descripcion: d.descripcion,
              cantidad: devolver[d.id] ?? 0,
              precioUnitario: Number(precioEdit[d.id] ?? d.precioUnitario),
              porcentajeIva: sinItbis ? 0 : (Number(d.porcentajeIva) || 18),
            }));

      if (detalles.length === 0) throw new Error('Selecciona al menos un ítem a acreditar');

      // Paso 1: Crear NC (estado BORRADOR)
      const ncRes = await api.post('/notas-credito', {
        clienteId,
        fecha,
        tipoNcf: 'E34',
        facturaOriginalId: facturaData.id,
        facturaOriginalFolio: facturaData.folio,
        motivo: tipo === 'descuento' ? 'descuento_otorgado' : 'devolucion',
        descripcionMotivo: notas || (tipo === 'descuento' ? 'Descuento posterior otorgado' : 'Devolución de mercancía'),
        notas,
        moneda: facturaData.moneda ?? 'DOP',
        tipoCambio: facturaData.tipoCambio ? Number(facturaData.tipoCambio) : 1,
        detalles,
      });
      const nc = ncRes.data?.data ?? ncRes.data;
      if (!nc?.id) throw new Error('No se pudo crear la Nota de Crédito');

      // Paso 2: Emitir NC (BORRADOR → EMITIDA)
      await api.patch(`/notas-credito/${nc.id}/emitir`);

      // Paso 3: Generar e-CF E34 y enviar a MSeller/DGII
      const ecfRes    = await api.post(`/ecf/nota-credito/${nc.id}/emitir`, { codigoModificacion: codigoMod });
      const ecfResult = ecfRes.data?.data ?? ecfRes.data;

      return { nc, ecfResult, detalles };
    },
    onSuccess: async (result: any) => {
      const { nc, ecfResult, detalles: det } = result ?? {};
      message.success('Nota de Crédito emitida y e-CF E34 generado ✓');
      qc.invalidateQueries({ queryKey: ['pos-panel', 'notas-credito'] });
      qc.refetchQueries({ queryKey: ['pos-panel', 'notas-credito'] });
      onClose();
      setFacturaData(null); setFacturaRef(''); setSaldoNC(null);
      setNotas(''); setClienteId(null); setDevolver({}); setPrecioEdit({});
      setCodigoMod('3'); setFecha(dayjs().format('YYYY-MM-DD'));
      // Imprimir recibo térmico con datos fiscales E34
      try {
        const empRes  = await api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({}));
        const empConf = (empRes.configuracion ?? {}) as any;
        const estadoEcf: string = ecfResult?.estado ?? '';
        const ecfPendiente = ['pendiente_envio', 'pendiente', 'contingencia'].includes(estadoEcf);
        const ncSubtotal   = Number(nc?.subtotal ?? 0) || (det ?? []).reduce((s: number, d: any) => s + Number(d.precioUnitario) * Number(d.cantidad), 0);
        const saleNC: Sale = {
          folio:                  nc?.folio ?? '—',
          total:                  Number(nc?.total ?? 0),
          cambio:                 0,
          metodo:                 'credito',
          items:                  (det ?? []).map((d: any) => ({
            produto:         { nombre: d.descripcion } as any,
            precio:          Number(d.precioUnitario),
            cantidad:        Number(d.cantidad),
            descuentoMonto:  0,
          })),
          iva:                    Number(nc?.iva ?? 0),
          subtotal:               ncSubtotal,
          facturaId:              nc?.id,
          tipoNcf:                'E34',
          encf:                   ecfResult?.encf,
          ecfPendiente,
          qrUrl:                  ecfResult?.qrUrl ?? null,
          securityCode:           ecfResult?.securityCode,
          ecfFecha:               dayjs().format('DD/MM/YYYY HH:mm'),
          facturaOriginalFolio:   nc?.facturaOriginalFolio ?? facturaData?.folio,
          ncfOriginal:            ecfResult?.ncfModificado,
          codigoModificacion:     ecfResult?.codigoModificacion ? String(ecfResult.codigoModificacion) : codigoMod,
          descripcionMotivo:      nc?.descripcionMotivo,
          empresaNombreComercial: empRes.razonSocial ?? empRes.nombre,
          empresaRnc:             empRes.rnc,
          empresaDireccion:       empRes.direccion,
          empresaTelefono:        empRes.telefono,
        };
        const qrDUrl = ecfResult?.qrUrl && !ecfPendiente
          ? await QRCode.toDataURL(ecfResult.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }).catch(() => null)
          : null;
        imprimirReciboTermico(buildReciboTermicoHTML(saleNC, qrDUrl, {
          mostrarEcf:    true,
          tipoImpresora: empConf.posTipoImpresora,
          mensajeTicket: empConf.posMensajeTicket,
          politicaDev:   empConf.posPoliticaDev,
        }));
      } catch { /* impresión no crítica */ }
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.message ?? 'Error al emitir NC'),
  });

  const isDark = C === darkC;
  const bg     = isDark ? '#1E293B' : '#fff';
  const border = isDark ? '#334155' : '#E2E8F0';
  const txt    = isDark ? '#F1F5F9' : '#1E293B';
  const sub    = isDark ? '#94A3B8' : '#64748B';
  const inputS: React.CSSProperties = { width:'100%', height:38, padding:'0 10px', borderRadius:8, border:`1px solid ${border}`, fontSize:13, outline:'none', background: isDark?'#0F172A':bg, color:txt, boxSizing:'border-box' };
  const labelS: React.CSSProperties = { fontSize:11, fontWeight:700, color:sub, textTransform:'uppercase', letterSpacing:'0.4px', display:'block', marginBottom:4 };

  const ToggleBtn = ({ active, onClick, label }: { active:boolean; onClick:()=>void; label:string }) => (
    <button onClick={onClick} style={{
      padding:'5px 11px', borderRadius:20, border:`1px solid ${active?'#F59E0B':border}`,
      background: active?(isDark?'#422006':'#FFF7ED'):(isDark?'#0F172A':bg),
      color: active?'#D97706':sub, fontSize:12, fontWeight:active?700:500, cursor:'pointer', outline:'none',
    }}>{active?'✓ ':''}{label}</button>
  );

  if (!open) return null;

  const ecfOrig = facturaData?.ecf ?? facturaData?.ecfNumero;
  const tipoEcfOrig = facturaData?.tipoNcf ?? 'E32';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)' }} />
      <div style={{ position:'relative', background:bg, borderRadius:16, width:560, maxHeight:'92vh',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.4)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background: isDark?'#0F172A':bg }}>
          <span style={{ fontSize:16, fontWeight:700, color:txt }}>📝 Nueva Nota de Crédito — e-CF E34</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:sub, outline:'none' }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tipo Descuento / Devolución */}
          <div>
            <span style={labelS}>Tipo</span>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {(['descuento','devolucion'] as const).map(t => (
                <button key={t} onClick={() => setTipo(t)} style={{
                  padding:'8px 0', borderRadius:10, border:`1px solid ${tipo===t?'#F59E0B':border}`,
                  background: tipo===t?(isDark?'#422006':'#FFF7ED'):(isDark?'#0F172A':bg),
                  color:tipo===t?'#D97706':sub, fontSize:13, fontWeight:tipo===t?700:500, cursor:'pointer', outline:'none',
                }}>{t==='descuento'?'Descuento':'Devolución'}</button>
              ))}
            </div>
          </div>

          {/* Código de Modificación DGII */}
          <div>
            <span style={labelS}>Código de Modificación DGII *</span>
            <select value={codigoMod} onChange={e=>setCodigoMod(e.target.value)} style={inputS}>
              {CODIGOS_MOD_POS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <span style={{ fontSize:11, color:'#0EA5E9', marginTop:3, display:'block' }}>
              {CODIGOS_MOD_POS.find(c=>c.value===codigoMod)?.desc}
            </span>
          </div>

          {/* Factura de origen */}
          <div>
            <span style={labelS}>Factura Original *</span>
            <div style={{ display:'flex', gap:6 }}>
              <input value={facturaRef} onChange={e=>setFacturaRef(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&buscarFactura()}
                placeholder="Folio de factura (ej: FAC-201)" style={{ ...inputS, flex:1 }} />
              <button onClick={buscarFactura} disabled={buscando} style={{
                width:40, height:38, borderRadius:8, border:`1px solid #2563EB`, background:'#EFF6FF',
                color:'#2563EB', cursor:'pointer', outline:'none', fontSize:18, flexShrink:0 }}>
                {buscando?'⏳':'🔍'}
              </button>
            </div>
          </div>

          {/* Panel verde — Documento original cargado */}
          {facturaData && (
            <div style={{ background: isDark?'#052e16':'#F0FDF4', border:`1px solid ${isDark?'#166534':'#BBF7D0'}`, borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <span style={{ color:'#16A34A', fontWeight:700, fontSize:13 }}>✓ Documento original cargado</span>
                <span style={{ background:'#DCFCE7', color:'#16A34A', padding:'1px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{tipoEcfOrig}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                <div>
                  <span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>Cliente</span>
                  <span style={{ fontSize:13, fontWeight:600, color:txt }}>{facturaData.cliente?.nombre ?? 'Consumidor Final'}</span>
                </div>
                <div>
                  <span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>eNCF Original (ref. DGII)</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#2563EB' }}>{facturaData.ecf?.numero ?? ecfOrig ?? '—'}</span>
                </div>
                <div>
                  <span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>Fecha</span>
                  <span style={{ fontSize:12, color:txt }}>{facturaData.fecha ? dayjs(facturaData.fecha).format('DD/MM/YYYY') : '—'}</span>
                </div>
                <div style={{ display:'flex', gap:12 }}>
                  <div><span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>Subtotal</span><span style={{ fontSize:12, color:txt }}>{fmt.money(Number(facturaData.subtotal??0))}</span></div>
                  <div><span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>ITBIS</span><span style={{ fontSize:12, color:txt }}>{fmt.money(Number(facturaData.iva??0))}</span></div>
                  <div><span style={{ ...labelS, color: isDark?'#86EFAC':'#166534' }}>Total</span><span style={{ fontSize:13, fontWeight:700, color:'#16A34A' }}>{fmt.money(Number(facturaData.total??0))}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Panel azul — Balance NC */}
          {saldoNC && (
            <div style={{ background: isDark?'#0c1a2e':'#EFF6FF', border:`1px solid ${isDark?'#1e40af':'#BFDBFE'}`, borderRadius:10, padding:'10px 14px' }}>
              <span style={{ fontWeight:700, fontSize:12, color: isDark?'#93C5FD':'#1D4ED8', display:'block', marginBottom:6 }}>📊 Balance NC — {facturaData?.folio}</span>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                <div><span style={labelS}>Total original</span><span style={{ fontSize:13, color:txt }}>{fmt.money(saldoNC.totalFactura)}</span></div>
                <div><span style={labelS}>NC emitidas</span><span style={{ fontSize:13, color:'#DC2626' }}>-{fmt.money(saldoNC.ncEmitidas)}</span></div>
                <div><span style={labelS}>Saldo disponible</span><span style={{ fontSize:13, fontWeight:700, color:'#16A34A' }}>{fmt.money(saldoNC.saldoDisponible)}</span></div>
              </div>
            </div>
          )}

          {/* Fecha */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <span style={labelS}>Fecha *</span>
              <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={inputS} />
            </div>
            <div>
              <span style={labelS}>Descripción / Notas</span>
              <input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Detalle adicional..." style={inputS} />
            </div>
          </div>

          {/* Toggles opciones */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <ToggleBtn active={esEfectivo} onClick={()=>setEsEfectivo(v=>!v)} label="Es Efectivo" />
            <ToggleBtn active={aplicarFac} onClick={()=>setAplicarFac(v=>!v)} label="Aplicar a Factura" />
          </div>

          {/* Ítems a acreditar */}
          {facturaData?.detalles?.length > 0 && codigoMod !== '1' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:700, color:txt }}>Ítems a acreditar</span>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:sub, cursor:'pointer' }}>
                  <input type="checkbox" checked={sinItbis} onChange={e=>setSinItbis(e.target.checked)} style={{ cursor:'pointer' }} />
                  No aplica ITBIS
                </label>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background: isDark?'#0F172A':'#F8FAFC' }}>
                  {['Descripción','Cant.','P. Unit.','Devolver'].map(h=>(
                    <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:sub, fontWeight:600, fontSize:11, borderBottom:`1px solid ${border}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{facturaData.detalles.map((det:any)=>(
                  <tr key={det.id} style={{ borderBottom:`1px solid ${isDark?'#1E293B':'#F1F5F9'}` }}>
                    <td style={{ padding:'6px 8px', fontWeight:500, color:txt }}>{det.descripcion}</td>
                    <td style={{ padding:'6px 8px', textAlign:'center', color:sub }}>{Number(det.cantidad).toFixed(0)}</td>
                    <td style={{ padding:'6px 8px' }}>
                      <input type="number" min="0" value={precioEdit[det.id]??det.precioUnitario}
                        onChange={e=>setPrecioEdit(p=>({...p,[det.id]:e.target.value}))}
                        style={{ width:70, height:26, textAlign:'right', borderRadius:6, border:`1px solid ${border}`, fontSize:12, outline:'none', background: isDark?'#0F172A':bg, color:txt, padding:'0 4px' }} />
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <input type="number" min="0" max={det.cantidad} value={devolver[det.id]??0}
                        onChange={e=>setDevolver(p=>({...p,[det.id]:Math.min(Number(e.target.value),Number(det.cantidad))}))}
                        style={{ width:60, height:26, textAlign:'center', borderRadius:6, border:`1px solid ${border}`, fontSize:12, outline:'none', background: isDark?'#0F172A':bg, color:txt, padding:'0 4px' }} />
                    </td>
                  </tr>
                ))}</tbody>
              </table>

              {/* Resumen */}
              {subtotalNC > 0 && (
                <div style={{ marginTop:10, background: isDark?'#0F172A':'#F8FAFC', borderRadius:8, padding:'10px 12px', border:`1px solid ${border}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:sub, marginBottom:3 }}>
                    <span>Factura original:</span><span style={{ fontWeight:600, color:txt }}>{fmt.money(Number(facturaData.total??0))}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#DC2626', marginBottom:3 }}>
                    <span>Monto a acreditar (subtotal):</span><span style={{ fontWeight:600 }}>-{fmt.money(subtotalNC)}</span>
                  </div>
                  {!sinItbis && (
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#DC2626', marginBottom:6 }}>
                      <span>ITBIS a revertir (18%):</span><span style={{ fontWeight:600 }}>-{fmt.money(itbisNC)}</span>
                    </div>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, borderTop:`1px solid ${border}`, paddingTop:6 }}>
                    <span style={{ color:txt }}>Saldo pendiente del cliente:</span>
                    <span style={{ color: (saldoNC?.saldoDisponible??Number(facturaData.total??0)) - totalNC <= 0.01 ? '#16A34A' : '#2563EB' }}>
                      {fmt.money(Math.max(0, (saldoNC?.saldoDisponible??Number(facturaData.total??0)) - totalNC))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${border}`, background: isDark?'#0F172A':bg, display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, height:42, borderRadius:10, border:`1px solid ${border}`, background:'transparent', color:sub, fontWeight:600, fontSize:14, cursor:'pointer', outline:'none' }}>
            Cancelar
          </button>
          <button onClick={async () => {
              if (esEfectivo && requireSupervisor) {
                const ok = await requireSupervisor('Devolución en efectivo', `NC sobre ${facturaData?.folio ?? ''}`);
                if (!ok) return;
              }
              guardarMut.mutate();
            }} disabled={guardarMut.isPending}
            style={{ flex:2, height:42, borderRadius:10, border:'none',
              background: guardarMut.isPending?'#94A3B8':'#2563EB',
              color:'#fff', fontWeight:700, fontSize:14, cursor:guardarMut.isPending?'not-allowed':'pointer' }}>
            {guardarMut.isPending ? '⏳ Emitiendo NC...' : '📝 Crear en Borrador y Emitir'}
          </button>
        </div>
      </div>
    </div>
  );
}

type PanelId = 'items' | 'inventario' | 'facturas' | 'pre-facturas' | 'cotizaciones' | 'conduce'
             | 'despacho' | 'clientes' | 'recibos-cobro' | 'anticipos'
             | 'notas-credito' | 'gastos' | 'cierre-caja' | 'ventas-hoy' | 'pro-formas' | 'compras';

// ── Helpers de panel ─────────────────────────────────────────────────────────

function PanelHeader({ title, icon, C, onVolver, onNuevo, labelNuevo }:
  { title: string; icon: string; C: Palette; onVolver: () => void; onNuevo?: () => void; labelNuevo?: string }) {
  return (
    <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 10 }}>
      <button onClick={onVolver} style={{ background: 'none', border: 'none', color: C.blue,
        cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>←</button>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontWeight: 700, color: C.text, fontSize: 15, flex: 1 }}>{title}</span>
      {onNuevo && (
        <button onClick={onNuevo} style={{ background: C.green, border: 'none', borderRadius: 8,
          color: '#fff', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 700 }}>
          + {labelNuevo ?? 'Nuevo'}
        </button>
      )}
    </div>
  );
}

function PanelInput({ label, C: _C, ...props }: { label?: string; C?: Palette } & React.InputHTMLAttributes<HTMLInputElement>) {
  const C = _C ?? darkC;
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>{label}</div>}
      <input {...props} style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
        border: `1px solid ${C.border2}`, fontSize: 13, boxSizing: 'border-box',
        background: C.inputBg, color: C.text, outline: 'none', ...props.style }} />
    </div>
  );
}

function PanelSelect({ label, children, C: _C, ...props }: { label?: string; C?: Palette } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const C = _C ?? darkC;
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>{label}</div>}
      <select {...props} style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
        border: `1px solid ${C.border2}`, fontSize: 13, background: C.inputBg, color: C.text, cursor: 'pointer',
        boxSizing: 'border-box', outline: 'none', ...props.style }}>
        {children}
      </select>
    </div>
  );
}

// ── Panel Inventario — catálogo de productos con CRUD supervisado ─────────────
function POSInventarioPanel({ C, onVolver, requireSupervisor }: {
  C: Palette;
  onVolver: () => void;
  requireSupervisor?: (action: string, detail?: string) => Promise<boolean>;
}) {
  const qc = useQueryClient();
  const userRole = useAuthStore(s => s.user?.role);
  const isAdmin  = userRole === 'admin' || userRole === 'super_admin';

  // ── estados producto CRUD ─────────────────────────────────────────────────
  const [busq, setBusq] = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editingProd, setEditingProd] = useState<any>(null);
  const [saving, setSaving]           = useState(false);
  const [fTipo,           setFTipo]           = useState<'producto'|'servicio'>('producto');
  const [fNombre,         setFNombre]         = useState('');
  const [fCodigo,         setFCodigo]         = useState('');
  const [fPrecio,         setFPrecio]         = useState('');
  const [fPrecio2,        setFPrecio2]        = useState('');
  const [fPrecio3,        setFPrecio3]        = useState('');
  const [fPrecioConItbis, setFPrecioConItbis] = useState(false);
  const [fItbis,          setFItbis]          = useState('18');
  const [fStock,          setFStock]          = useState('0');
  const [fStockMin,       setFStockMin]       = useState('0');
  const [fCategoria,      setFCategoria]      = useState('');

  // ── estados movimientos ───────────────────────────────────────────────────
  const [movLimit, setMovLimit] = useState(20);
  const [movModal, setMovModal] = useState<{ tipo: 'entrada'|'salida' } | null>(null);
  const [mSearch,  setMSearch]  = useState('');
  const [mProd,    setMProd]    = useState<{ id: number; nombre: string } | null>(null);
  const [mCant,    setMCant]    = useState('');
  const [mMotivo,  setMMotivo]  = useState('');
  const [mSaving,  setMSaving]  = useState(false);
  const [activeTab, setActiveTab] = useState<'productos'|'movimientos'>('productos');

  // ── queries ───────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<any>({
    queryKey: ['pos-productos', busq],
    queryFn: () => api.get(`/productos?limit=50${busq ? '&search='+encodeURIComponent(busq) : ''}`)
      .then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    staleTime: 30_000,
  });
  const productos = data ?? [];

  const { data: movData, isLoading: movLoading } = useQuery<any>({
    queryKey: ['pos-movimientos', movLimit],
    queryFn:  () => inventarioApi.movimientos(1, movLimit),
    staleTime: 15_000,
  });
  const movimientos = movData?.data ?? [];
  const movTotal    = movData?.meta?.total ?? 0;

  const { data: mProdData } = useQuery<any>({
    queryKey: ['pos-mov-prods', mSearch],
    queryFn:  () => api.get(`/productos?limit=10${mSearch ? '&search='+encodeURIComponent(mSearch) : ''}`)
      .then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    enabled:  !!movModal && mSearch.length > 0,
    staleTime: 15_000,
  });
  const mProdOpts: any[] = mProdData ?? [];

  // ── handlers producto ─────────────────────────────────────────────────────
  const openForm = (prod?: any) => {
    setEditingProd(prod ?? null);
    setFTipo((prod?.tipo ?? 'producto') as 'producto'|'servicio');
    setFNombre(prod?.nombre ?? '');
    setFCodigo(prod?.codigo ?? '');
    setFPrecio(prod ? String(prod.precio ?? '') : '');
    setFPrecio2(prod?.precio2 != null ? String(prod.precio2) : '');
    setFPrecio3(prod?.precio3 != null ? String(prod.precio3) : '');
    setFPrecioConItbis(false);
    setFItbis(String(prod?.porcentajeIva ?? 18));
    setFStock(String(prod?.stock ?? 0));
    setFStockMin(String(prod?.stockMinimo ?? 0));
    setFCategoria(prod?.categoria ?? '');
    setShowForm(true);
  };

  const handleNuevo = async () => {
    if (requireSupervisor) { const ok = await requireSupervisor('Nuevo producto'); if (!ok) return; }
    openForm();
  };

  const handleEditar = async (prod: any) => {
    if (requireSupervisor) { const ok = await requireSupervisor('Editar producto', prod.nombre); if (!ok) return; }
    openForm(prod);
  };

  const handleSave = async () => {
    if (!fNombre.trim() || !fPrecio.trim()) { message.error('Nombre y precio son obligatorios'); return; }
    setSaving(true);
    try {
      const esServicio = fTipo === 'servicio';
      const itbis  = Number(fItbis) || 0;
      const pBase  = fPrecioConItbis && itbis > 0
        ? Math.round(Number(fPrecio) / (1 + itbis / 100) * 100) / 100
        : Number(fPrecio);
      const body: Record<string, unknown> = {
        nombre: fNombre.trim(), codigo: fCodigo.trim() || (editingProd ? null : undefined),
        precio: pBase, porcentajeIva: itbis,
        precio2: fPrecio2 && Number(fPrecio2) > 0 ? Number(fPrecio2) : null,
        precio3: fPrecio3 && Number(fPrecio3) > 0 ? Number(fPrecio3) : null,
        stockMinimo: esServicio ? 0 : Number(fStockMin),
        categoria: fCategoria.trim() || undefined, tipo: fTipo,
      };
      if (!editingProd && !esServicio) body.stock = Number(fStock);
      const tipoLabel = esServicio ? 'Servicio' : 'Producto';
      if (editingProd) {
        await api.patch(`/productos/${editingProd.id}`, body);
        message.success(`${tipoLabel} actualizado`);
      } else {
        await api.post('/productos', body);
        message.success(`${tipoLabel} creado`);
      }
      qc.invalidateQueries({ queryKey: ['pos-productos'] });
      qc.invalidateQueries({ queryKey: ['productos-catalogo'] });
      setShowForm(false);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al guardar producto');
    } finally { setSaving(false); }
  };

  // ── handlers movimientos ──────────────────────────────────────────────────
  const handleMovModal = (tipo: 'entrada'|'salida') => {
    if (!isAdmin) { message.warning('Se requiere rol administrador'); return; }
    setMovModal({ tipo });
    setMSearch(''); setMProd(null); setMCant(''); setMMotivo('');
  };

  const handleMovSave = async () => {
    if (!mProd) { message.error('Selecciona un producto'); return; }
    const cant = Number(mCant);
    if (!Number.isInteger(cant) || cant <= 0) { message.error('Cantidad debe ser un entero mayor a 0'); return; }
    if (!mMotivo.trim()) { message.error('Motivo es obligatorio'); return; }
    setMSaving(true);
    try {
      if (movModal?.tipo === 'entrada') {
        await inventarioApi.entrada(mProd.id, cant, mMotivo.trim());
      } else {
        await inventarioApi.salida(mProd.id, cant, mMotivo.trim());
      }
      message.success(`${movModal?.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada`);
      qc.invalidateQueries({ queryKey: ['pos-movimientos'] });
      qc.invalidateQueries({ queryKey: ['pos-productos'] });
      setMovModal(null);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al registrar movimiento');
    } finally { setMSaving(false); }
  };

  // ── render ────────────────────────────────────────────────────────────────
  const tabExtra = activeTab === 'productos'
    ? (
        <button onClick={handleNuevo}
          style={{ background: C.green, border: 'none', borderRadius: 8, marginRight: 8,
            color: '#fff', cursor: 'pointer', padding: '5px 13px', fontSize: 12, fontWeight: 700 }}>
          + Nuevo Producto
        </button>
      )
    : isAdmin
      ? (
          <div style={{ display: 'flex', gap: 6, marginRight: 8 }}>
            <button onClick={() => handleMovModal('entrada')}
              style={{ padding: '4px 12px', borderRadius: 6, border: 'none',
                background: '#dcfce7', color: '#15803d', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              + Entrada
            </button>
            <button onClick={() => handleMovModal('salida')}
              style={{ padding: '4px 12px', borderRadius: 6, border: 'none',
                background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
              − Salida
            </button>
          </div>
        )
      : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header: botón volver + título */}
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none', color: C.blue,
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>←</button>
        <span style={{ fontSize: 16 }}>📦</span>
        <span style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Inventario</span>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as 'productos'|'movimientos')}
        tabBarExtraContent={tabExtra}
        tabBarStyle={{ margin: 0, paddingLeft: 14 }}
        size="small"
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
        items={[
          {
            key: 'productos',
            label: '📦 Productos',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* buscador */}
                <div style={{ padding: '6px 14px 8px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ position: 'relative' }}>
                    <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%',
                      transform: 'translateY(-50%)', color: C.textSub, fontSize: 13 }} />
                    <input value={busq} onChange={e => setBusq(e.target.value)}
                      placeholder="Buscar por código, nombre o categoría..."
                      style={{ width: '100%', height: 34, paddingLeft: 30, background: C.card,
                        border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
                        fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                {/* tabla */}
                <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
                  {isLoading ? <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div> :
                   productos.length === 0
                    ? <Empty style={{ marginTop: 30 }} description={<span style={{ color: C.textSub }}>Sin productos</span>} />
                    : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr style={{ background: C.card, position: 'sticky', top: 0, zIndex: 1 }}>
                          {['Tipo','Código','Nombre','Precio','ITBIS%','Stock','Mín.','Categoría',''].map(h => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: C.textSub,
                              fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{productos.map((p: any, i: number) => (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: i%2===0?'transparent':C.card }}
                            onMouseEnter={e=>(e.currentTarget.style.background=C.sidebarHov)}
                            onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?'transparent':C.card)}>
                            <td style={{ padding: '7px 10px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: p.tipo === 'servicio' ? '#dbeafe' : '#dcfce7',
                                color: p.tipo === 'servicio' ? '#1d4ed8' : '#15803d' }}>
                                {p.tipo === 'servicio' ? '⚙️ SVC' : '📦 PRD'}
                              </span>
                            </td>
                            <td style={{ padding: '7px 10px', color: C.textSub, fontFamily: 'monospace', fontSize: 11 }}>{p.codigo}</td>
                            <td style={{ padding: '7px 10px', color: C.text, fontWeight: 600 }}>{p.nombre}</td>
                            <td style={{ padding: '7px 10px', color: C.green, fontWeight: 700 }}>{fmt.money(p.precio)}</td>
                            <td style={{ padding: '7px 10px', color: C.textSub }}>{p.porcentajeIva ?? 18}%</td>
                            <td style={{ padding: '7px 10px', fontWeight: 700,
                              color: p.tipo === 'servicio' ? C.textMuted : (Number(p.stock) <= Number(p.stockMinimo||0) ? C.red : C.text) }}>
                              {p.tipo === 'servicio' ? '∞' : p.stock}
                            </td>
                            <td style={{ padding: '7px 10px', color: C.textSub }}>{p.tipo === 'servicio' ? '—' : (p.stockMinimo ?? '—')}</td>
                            <td style={{ padding: '7px 10px', color: C.textSub, fontSize: 11 }}>{p.categoria ?? '—'}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                              <button onClick={() => handleEditar(p)}
                                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
                                  color: C.textSub, cursor: 'pointer', fontSize: 12, padding: '3px 8px' }}>
                                ✏️
                              </button>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )
                  }
                </div>
              </div>
            ),
          },
          {
            key: 'movimientos',
            label: '📋 Movimientos',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
                  {movLoading ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
                  ) : movimientos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 30, color: C.textSub, fontSize: 12 }}>Sin movimientos registrados</div>
                  ) : (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr style={{ background: C.card }}>
                          {['Fecha','Tipo','Producto','Cant.','Stock','Motivo'].map(h => (
                            <th key={h} style={{ padding: '7px 8px', textAlign: 'left', color: C.textSub,
                              fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}`,
                              position: 'sticky', top: 0, background: C.card }}>
                              {h}
                            </th>
                          ))}
                        </tr></thead>
                        <tbody>{movimientos.map((m: any, i: number) => (
                          <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}`, background: i%2===0?'transparent':C.card }}>
                            <td style={{ padding: '6px 8px', color: C.textSub, whiteSpace: 'nowrap', fontSize: 10 }}>
                              {dayjs(m.createdAt).format('DD/MM HH:mm')}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: m.tipo === 'entrada' ? '#dcfce7' : m.tipo === 'salida' ? '#fee2e2' : '#f3f4f6',
                                color:      m.tipo === 'entrada' ? '#15803d' : m.tipo === 'salida' ? '#dc2626' : '#374151' }}>
                                {m.tipo.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', color: C.text, maxWidth: 140,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.producto?.nombre ?? `#${m.productoId}`}
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 700,
                              color: m.tipo === 'entrada' ? '#16a34a' : '#dc2626' }}>
                              {m.tipo === 'entrada' ? '+' : '−'}{Number(m.cantidad)}
                            </td>
                            <td style={{ padding: '6px 8px', color: C.textSub, whiteSpace: 'nowrap', fontSize: 10 }}>
                              {Number(m.cantidadAnterior)}→{Number(m.cantidadNueva)}
                            </td>
                            <td style={{ padding: '6px 8px', color: C.textSub, maxWidth: 120,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.motivo ?? '—'}
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                      {movimientos.length < movTotal && (
                        <div style={{ textAlign: 'center', padding: '10px 0' }}>
                          <button onClick={() => setMovLimit(l => l + 20)}
                            style={{ padding: '5px 18px', borderRadius: 6, border: `1px solid ${C.border}`,
                              background: 'transparent', color: C.textSub, cursor: 'pointer', fontSize: 12 }}>
                            Ver más ({movTotal - movimientos.length} pendientes)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Modal — formulario de producto */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.card, width: '100%', maxWidth: 420, borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '92vh' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>
                {editingProd
                  ? `Editar ${fTipo === 'servicio' ? 'Servicio' : 'Producto'}`
                  : `Nuevo ${fTipo === 'servicio' ? 'Servicio' : 'Producto'}`}
              </span>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none',
                color: C.textSub, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: C.text }}>Tipo</div>
                <Segmented
                  value={fTipo}
                  onChange={v => setFTipo(v as 'producto'|'servicio')}
                  options={[
                    { label: '📦 Producto', value: 'producto' },
                    { label: '⚙️ Servicio', value: 'servicio' },
                  ]}
                  block
                />
              </div>
              <PanelInput C={C} label="Nombre *" value={fNombre}
                onChange={e => setFNombre(e.target.value)}
                placeholder={fTipo === 'servicio' ? 'Nombre del servicio' : 'Nombre del producto'} />
              <PanelInput C={C} label="Código" value={fCodigo}
                onChange={e => setFCodigo(e.target.value)} placeholder="Código (opcional)" />
              {/* ── Precios P1 / P2 / P3 ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {/* P1 + toggle Sin/Con ITBIS */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: C.text }}>
                    Precio * (RD$)
                  </div>
                  <div style={{ display: 'flex' }}>
                    <input type="number" min="0" step="0.01" value={fPrecio}
                      onChange={e => setFPrecio(e.target.value)}
                      style={{ flex: 1, minWidth: 0, height: 36, padding: '0 6px', fontSize: 13,
                        borderRadius: '8px 0 0 8px', border: `1px solid ${C.border}`, borderRight: 'none',
                        background: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setFPrecioConItbis(v => !v)}
                      style={{ height: 36, padding: '0 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        borderRadius: '0 8px 8px 0', border: `1px solid ${C.border}`, cursor: 'pointer',
                        background: fPrecioConItbis ? C.blue : C.card, color: fPrecioConItbis ? '#fff' : C.textSub,
                        flexShrink: 0 }}>
                      {fPrecioConItbis ? 'Con ITBIS' : 'Sin ITBIS'}
                    </button>
                  </div>
                  {fPrecioConItbis && Number(fPrecio) > 0 && Number(fItbis) > 0 && (
                    <div style={{ fontSize: 10, color: C.textSub, marginTop: 3 }}>
                      Base: {fmt.money(Math.round(Number(fPrecio) / (1 + Number(fItbis) / 100) * 100) / 100)}
                    </div>
                  )}
                </div>
                {/* P2 */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: C.textSub }}>
                    Precio 2 <span style={{ fontWeight: 400, fontSize: 10 }}>(Mayorista)</span>
                  </div>
                  <input type="number" min="0" step="0.01" value={fPrecio2}
                    onChange={e => setFPrecio2(e.target.value)} placeholder="Opcional"
                    style={{ width: '100%', height: 36, padding: '0 8px', fontSize: 13,
                      borderRadius: 8, border: `1px solid ${C.border}`,
                      background: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {/* P3 */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: C.textSub }}>
                    Precio 3 <span style={{ fontWeight: 400, fontSize: 10 }}>(Especial)</span>
                  </div>
                  <input type="number" min="0" step="0.01" value={fPrecio3}
                    onChange={e => setFPrecio3(e.target.value)} placeholder="Opcional"
                    style={{ width: '100%', height: 36, padding: '0 8px', fontSize: 13,
                      borderRadius: 8, border: `1px solid ${C.border}`,
                      background: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <PanelInput C={C} label="ITBIS %" type="number" min="0" max="100"
                  value={fItbis} onChange={e => setFItbis(e.target.value)} />
                <div />{/* espaciador */}
                {fTipo !== 'servicio' && (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>
                        {editingProd ? 'Stock actual' : 'Stock'}
                      </div>
                      <input type="number" min="0" value={fStock}
                        onChange={e => setFStock(e.target.value)}
                        disabled={!!editingProd}
                        style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                          border: `1px solid ${C.border2}`, fontSize: 13, boxSizing: 'border-box',
                          background: editingProd ? C.border : C.inputBg,
                          color: editingProd ? C.textSub : C.text, cursor: editingProd ? 'not-allowed' : 'text',
                          outline: 'none' }} />
                      {editingProd && (
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>
                          El stock se ajusta mediante movimientos de inventario
                        </div>
                      )}
                    </div>
                    <PanelInput C={C} label="Stock Mín." type="number" min="0"
                      value={fStockMin} onChange={e => setFStockMin(e.target.value)} />
                  </>
                )}
              </div>
              <PanelInput C={C} label="Categoría" value={fCategoria}
                onChange={e => setFCategoria(e.target.value)} placeholder="Categoría (opcional)" />
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, height: 40, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 2, height: 40, borderRadius: 8, border: 'none',
                  background: saving ? '#9ca3af' : C.green, color: '#fff',
                  cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                {saving ? 'Guardando...' : editingProd
                  ? 'Guardar Cambios'
                  : `Crear ${fTipo === 'servicio' ? 'Servicio' : 'Producto'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — entrada / salida de stock */}
      {movModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.card, width: '100%', maxWidth: 380, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>
                {movModal.tipo === 'entrada' ? '📥 Entrada de Stock' : '📤 Salida de Stock'}
              </span>
              <button onClick={() => setMovModal(null)} style={{ background: 'none', border: 'none',
                color: C.textSub, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Selector de producto */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>Producto *</div>
                {mProd ? (
                  <div style={{ padding: '9px 12px', border: `1px solid ${C.border2}`, borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 8, background: C.inputBg }}>
                    <span style={{ flex: 1, color: C.text, fontSize: 13 }}>{mProd.nombre}</span>
                    <button onClick={() => setMProd(null)} style={{ background: 'none', border: 'none',
                      color: C.textSub, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input value={mSearch} onChange={e => setMSearch(e.target.value)}
                      placeholder="Buscar producto..."
                      style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                        border: `1px solid ${C.border2}`, background: C.inputBg, color: C.text,
                        fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    {mProdOpts.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card,
                        border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 180,
                        overflowY: 'auto', zIndex: 100, marginTop: 2 }}>
                        {mProdOpts.slice(0, 8).map((p: any) => (
                          <div key={p.id}
                            onClick={() => { setMProd({ id: p.id, nombre: p.nombre }); setMSearch(''); }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.sidebarHov)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            style={{ padding: '8px 12px', cursor: 'pointer',
                              borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 12 }}>
                            <strong>{p.nombre}</strong>
                            {p.tipo !== 'servicio' && (
                              <span style={{ color: C.textSub, marginLeft: 6 }}>Stock: {p.stock ?? 0}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <PanelInput C={C} label="Cantidad *" type="number" min="1" step="1"
                value={mCant} onChange={e => setMCant(e.target.value)} placeholder="0" />

              {/* Motivo */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>Motivo *</div>
                <input value={mMotivo} onChange={e => setMMotivo(e.target.value)}
                  placeholder={movModal.tipo === 'entrada'
                    ? 'Ej: Compra proveedor, devolución cliente...'
                    : 'Ej: Merma, daño, ajuste...'}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                    border: `1px solid ${C.border2}`, background: C.inputBg, color: C.text,
                    fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setMovModal(null)}
                style={{ flex: 1, height: 40, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={handleMovSave} disabled={mSaving}
                style={{ flex: 2, height: 40, borderRadius: 8, border: 'none',
                  background: mSaving ? '#9ca3af' : movModal.tipo === 'entrada' ? '#16a34a' : '#dc2626',
                  color: '#fff', cursor: mSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                {mSaving ? 'Guardando...' : `Confirmar ${movModal.tipo === 'entrada' ? 'Entrada' : 'Salida'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal detalle OC (dentro del POS) ────────────────────────────────────────
function POSCompraDetailModal({ id, onClose, onRecibir, onRefresh }: {
  id: number;
  onClose: () => void;
  onRecibir: (compra: any) => void;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const { data: compra, isLoading } = useQuery<any>({
    queryKey: ['compra-pos-detail', id],
    queryFn: () => api.get(`/compras/${id}`).then(r => r.data?.data ?? r.data),
    enabled: !!id,
  });

  const [pendingEstado, setPendingEstado] = useState<string | null>(null);

  const cambiarEstado = async (estado: string) => {
    setPendingEstado(estado);
    try {
      await api.patch(`/compras/${id}/estado`, { estado });
      qc.invalidateQueries({ queryKey: ['compra-pos-detail', id] });
      qc.invalidateQueries({ queryKey: ['compras-pos'] });
      onRefresh();
      message.success(`Orden marcada como ${estado}`);
      if (estado === 'cancelada') onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al cambiar estado');
    } finally { setPendingEstado(null); }
  };

  const fmt2 = (v: number) => `RD$ ${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

  if (isLoading) return (
    <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  );
  if (!compra) return <div style={{ padding: 16, color: '#ef4444' }}>No se encontró la orden</div>;

  const estado = compra.estado as string;
  const isBorrador = estado === 'borrador';
  const isEnviada  = estado === 'enviada';

  const ESTADO_COLOR: Record<string, string> = {
    borrador: '#6b7280', enviada: '#3b82f6', recibida: '#10b981',
    pagada: '#059669', cancelada: '#ef4444',
  };

  return (
    <div style={{ fontSize: 13 }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16,
        padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{compra.folio}</div>
          <div style={{ color: '#6b7280', fontSize: 12 }}>
            {compra.proveedor?.nombre ?? `Proveedor #${compra.proveedorId}`} · {String(compra.fecha).substring(0, 10)}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
          background: (ESTADO_COLOR[estado] ?? '#6b7280') + '22', color: ESTADO_COLOR[estado] ?? '#6b7280' }}>
          {estado.toUpperCase()}
        </span>
      </div>

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>Artículos</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Producto', 'Cant.', 'Precio', 'ITBIS %', 'Total'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280',
                  fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(compra.detalles ?? []).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '7px 10px' }}>{d.descripcion ?? d.producto?.nombre ?? `#${d.productoId}`}</td>
                <td style={{ padding: '7px 10px' }}>{d.cantidad}</td>
                <td style={{ padding: '7px 10px' }}>{fmt2(d.precioUnitario)}</td>
                <td style={{ padding: '7px 10px' }}>{d.porcentajeItbis ?? 18}%</td>
                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{fmt2(d.total ?? d.precioUnitario * d.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#6b7280' }}>
            <span>Subtotal</span><span>{fmt2(compra.subtotal ?? 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#6b7280' }}>
            <span>ITBIS</span><span>{fmt2(compra.itbis ?? 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15 }}>
            <span>Total</span><span style={{ color: '#1677ff' }}>{fmt2(compra.total ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {compra.notas && (
        <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6,
          border: '1px solid #e5e7eb', marginBottom: 16, color: '#374151', fontSize: 12 }}>
          <strong>Notas:</strong> {compra.notas}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cerrar</Button>
        {isBorrador && (
          <>
            <Button danger loading={pendingEstado === 'cancelada'}
              onClick={() => cambiarEstado('cancelada')}>
              Cancelar OC
            </Button>
            <Button type="primary" loading={pendingEstado === 'enviada'}
              onClick={() => cambiarEstado('enviada')}>
              Enviar al Proveedor
            </Button>
          </>
        )}
        {isEnviada && (
          <>
            <Button danger loading={pendingEstado === 'cancelada'}
              onClick={() => cambiarEstado('cancelada')}>
              Cancelar OC
            </Button>
            <Button type="primary" style={{ background: '#10b981' }}
              onClick={async () => {
                const full = await api.get(`/compras/${id}`).then(r => r.data?.data ?? r.data);
                onClose();
                onRecibir(full);
              }}>
              Recibir Mercancía
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Panel Compras (Órdenes de Compra) ────────────────────────────────────────
function POSComprasPanel({ C, onVolver, supervisorActive, requireSupervisorForced }: {
  C: Palette;
  onVolver: () => void;
  supervisorActive: boolean;
  requireSupervisorForced: (action: string, detail?: string) => Promise<boolean>;
}) {
  const qc       = useQueryClient();
  const [busq,         setBusq]         = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [recibirData,  setRecibirData]  = useState<any>(null);
  const [notasRecibir, setNotasRecibir] = useState('');
  const [recibiendo,   setRecibiendo]   = useState(false);
  const [pendingEnviar, setPendingEnviar] = useState<number | null>(null);
  const [pendingCancel, setPendingCancel] = useState<number | null>(null);
  const [modalNuevaOC,  setModalNuevaOC]  = useState(false);
  const [detailOCId,    setDetailOCId]    = useState<number | null>(null);
  const [imprimiendoOC, setImprimiendoOC] = useState<number | null>(null);

  // Fetch compras — disabled until supervisor is active
  const { data: comprasData, isLoading, refetch } = useQuery<any>({
    queryKey: ['compras-pos', busq, estadoFiltro],
    enabled:  supervisorActive,
    queryFn:  () => {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (busq)         params.set('search', busq);
      if (estadoFiltro) params.set('estado', estadoFiltro);
      return api.get(`/compras?${params}`).then(r => {
        const d = r.data?.data ?? r.data;
        return d?.data ?? d ?? [];
      });
    },
    staleTime: 15_000,
  });
  const compras = comprasData ?? [];

  const handleEnviar = async (compra: any) => {
    setPendingEnviar(compra.id);
    try {
      await api.patch(`/compras/${compra.id}/estado`, { estado: 'enviada' });
      qc.invalidateQueries({ queryKey: ['compras-pos'] });
      message.success('Orden enviada al proveedor');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al enviar orden');
    } finally { setPendingEnviar(null); }
  };

  const handleCancelar = async (compra: any) => {
    setPendingCancel(compra.id);
    try {
      await api.patch(`/compras/${compra.id}/estado`, { estado: 'cancelada' });
      qc.invalidateQueries({ queryKey: ['compras-pos'] });
      message.success('Orden cancelada');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al cancelar');
    } finally { setPendingCancel(null); }
  };

  const handleRecibir = async () => {
    if (!recibirData) return;
    setRecibiendo(true);
    try {
      const body: Record<string, unknown> = { estado: 'recibida' };
      if (notasRecibir.trim()) body.notas = notasRecibir;
      await api.patch(`/compras/${recibirData.id}/estado`, body);
      qc.invalidateQueries({ queryKey: ['compras-pos'] });
      qc.invalidateQueries({ queryKey: ['pos-productos'] });
      qc.invalidateQueries({ queryKey: ['productos-catalogo'] });
      message.success('Mercancía recibida y stock actualizado');
      setRecibirData(null); setNotasRecibir('');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al recibir mercancía');
    } finally { setRecibiendo(false); }
  };

  const handleImprimirOC = async (id: number) => {
    setImprimiendoOC(id);
    try {
      const [ocRes, empRes] = await Promise.all([
        api.get(`/compras/${id}`).then(r => r.data?.data ?? r.data),
        api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({})),
      ]);
      const empConf = (empRes.configuracion ?? {}) as any;
      const gd: GenericDocData = {
        tipo:    'ORDEN DE COMPRA',
        numero:  ocRes.folio ?? String(id),
        fecha:   String(ocRes.fecha ?? '').substring(0, 10),
        empresa: {
          nombre:    empRes.razonSocial ?? empRes.nombre,
          rnc:       empRes.rnc,
          direccion: empRes.direccion,
          telefono:  empRes.telefono,
        },
        cliente:    ocRes.proveedor?.nombre,
        rncCliente: ocRes.proveedor?.rnc,
        items: (ocRes.detalles ?? []).map((d: any) => ({
          desc:  d.descripcion ?? d.nombre ?? '',
          cant:  Number(d.cantidad),
          precio: Number(d.precioUnitario ?? 0),
          total: Number(d.subtotal ?? d.total ?? 0),
        })),
        subtotal: ocRes.subtotal,
        itbis:    ocRes.iva ?? ocRes.itbis,
        total:    ocRes.total,
        nota1:    ocRes.proveedor?.email   ? `Email: ${ocRes.proveedor.email}`   : undefined,
        nota2:    ocRes.proveedor?.telefono ? `Tel: ${ocRes.proveedor.telefono}` : undefined,
        notas:    ocRes.notas,
      };
      imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora: empConf.posTipoImpresora }));
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al imprimir orden de compra');
    } finally {
      setImprimiendoOC(null);
    }
  };

  const ESTADO_CFG: Record<string, { label: string; color: string }> = {
    borrador:  { label: 'BORRADOR',  color: C.textSub },
    enviada:   { label: 'ENVIADA',   color: C.blue    },
    recibida:  { label: 'RECIBIDA',  color: C.green   },
    pagada:    { label: 'PAGADA',    color: C.green   },
    cancelada: { label: 'CANCELADA', color: C.red     },
  };

  // Locked screen when supervisor is not active
  if (!supervisorActive) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PanelHeader title="Compras" icon="🛒" C={C} onVolver={onVolver} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, lineHeight: 1 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Módulo Restringido</div>
          <div style={{ fontSize: 13, color: C.textSub }}>
            Órdenes de Compra requiere autorización de supervisor
          </div>
          <button onClick={async () => { await requireSupervisorForced('Órdenes de Compra'); refetch(); }}
            style={{ padding: '10px 28px', borderRadius: 8, border: 'none',
              background: C.blue, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            Activar Supervisor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHeader title="Órdenes de Compra" icon="🛒" C={C} onVolver={onVolver}
        onNuevo={() => setModalNuevaOC(true)} labelNuevo="Nueva OC" />

      {/* Filtros */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, fontSize: 12 }} />
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar proveedor o N°..."
            style={{ width: '100%', height: 34, paddingLeft: 28, background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
          style={{ height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.card, color: C.text, fontSize: 12, cursor: 'pointer' }}>
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="enviada">Enviada</option>
          <option value="recibida">Recibida</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : compras.length === 0 ? (
          <Empty style={{ marginTop: 40 }} description={<span style={{ color: C.textSub }}>Sin órdenes de compra</span>} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.card, position: 'sticky', top: 0, zIndex: 2 }}>
                {['N°','Proveedor','Total','Estado','Fecha','Acciones'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textSub,
                    fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map((c: any, i: number) => {
                const cfg   = ESTADO_CFG[c.estado] ?? { label: c.estado.toUpperCase(), color: C.textSub };
                const isBorrador  = c.estado === 'borrador';
                const isEnviada   = c.estado === 'enviada';
                const isTerminada = ['recibida','pagada','cancelada'].includes(c.estado);
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: i%2===0?'transparent':C.card }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{c.folio}</td>
                    <td style={{ padding: '8px 10px', color: C.text, fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.proveedor?.nombre ?? `#${c.proveedorId}`}
                    </td>
                    <td style={{ padding: '8px 10px', color: C.green, fontWeight: 700 }}>{fmt.money(c.total)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color,
                        background: cfg.color + '22', padding: '2px 7px', borderRadius: 4 }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: C.textSub, whiteSpace: 'nowrap' }}>
                      {String(c.fecha).substring(0, 10)}
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isBorrador && (<>
                          <button onClick={() => handleEnviar(c)} disabled={pendingEnviar === c.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none',
                              background: C.blue, color: '#fff', cursor: pendingEnviar === c.id ? 'not-allowed' : 'pointer' }}>
                            Enviar
                          </button>
                          <button onClick={() => setDetailOCId(c.id)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                              border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer' }}>
                            Editar
                          </button>
                          <button onClick={() => handleCancelar(c)} disabled={pendingCancel === c.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none',
                              background: C.red + 'cc', color: '#fff', cursor: pendingCancel === c.id ? 'not-allowed' : 'pointer' }}>
                            ✕
                          </button>
                        </>)}
                        {isEnviada && (<>
                          <button onClick={async () => {
                            const full = await api.get(`/compras/${c.id}`).then(r => r.data?.data ?? r.data);
                            setRecibirData(full);
                            setNotasRecibir((full as any).notas ?? '');
                          }}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none',
                              background: C.green, color: '#fff', cursor: 'pointer' }}>
                            Recibir
                          </button>
                          <button onClick={() => handleCancelar(c)} disabled={pendingCancel === c.id}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none',
                              background: C.red + 'cc', color: '#fff', cursor: pendingCancel === c.id ? 'not-allowed' : 'pointer' }}>
                            ✕
                          </button>
                        </>)}
                        {isTerminada && (
                          <button onClick={() => setDetailOCId(c.id)}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                              border: `1px solid ${C.border}`, background: 'transparent', color: C.textSub, cursor: 'pointer' }}>
                            Ver
                          </button>
                        )}
                        <button onClick={() => handleImprimirOC(c.id)}
                          disabled={imprimiendoOC === c.id}
                          title="Imprimir orden de compra"
                          style={{ fontSize: 13, padding: '3px 7px', borderRadius: 6,
                            border: `1px solid ${C.border}`, background: 'transparent',
                            color: C.text, cursor: imprimiendoOC === c.id ? 'not-allowed' : 'pointer' }}>
                          {imprimiendoOC === c.id ? '…' : '🖨'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — Detalle / Editar OC */}
      <Modal
        title={detailOCId ? `Orden de Compra` : ''}
        open={detailOCId !== null}
        onCancel={() => setDetailOCId(null)}
        footer={null}
        width={780}
        destroyOnClose
        style={{ top: 30 }}
      >
        {detailOCId !== null && (
          <POSCompraDetailModal
            id={detailOCId}
            onClose={() => setDetailOCId(null)}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['compras-pos'] })}
            onRecibir={(compra) => {
              setDetailOCId(null);
              setRecibirData(compra);
              setNotasRecibir(compra.notas ?? '');
            }}
          />
        )}
      </Modal>

      {/* Modal — Nueva Orden de Compra */}
      <Modal
        title="Nueva Orden de Compra"
        open={modalNuevaOC}
        onCancel={() => setModalNuevaOC(false)}
        footer={null}
        width={960}
        destroyOnClose
        style={{ top: 20 }}
        styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', padding: '16px 24px' } }}
      >
        {modalNuevaOC && (
          <CompraFormInner
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['compras-pos'] });
              setModalNuevaOC(false);
              message.success('Orden de compra creada');
            }}
            onCancel={() => setModalNuevaOC(false)}
          />
        )}
      </Modal>

      {/* Modal — Recibir Mercancía */}
      {recibirData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: C.card, width: '100%', maxWidth: 480, borderRadius: 12,
            display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '88vh' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>
                Recibir Mercancía — {recibirData.folio}
              </span>
              <button onClick={() => { setRecibirData(null); setNotasRecibir(''); }}
                style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 10 }}>
                Proveedor: <strong style={{ color: C.text }}>{recibirData.proveedor?.nombre ?? '—'}</strong>
              </div>
              {/* Items de la compra */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Artículos a recibir:</div>
                {(recibirData.detalles ?? []).map((d: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 10px', background: C.bg, borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.text, flex: 1 }}>
                      {d.producto?.nombre ?? `Producto #${d.productoId}`}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.green, marginLeft: 12 }}>
                      × {d.cantidad}
                    </span>
                  </div>
                ))}
                {(!recibirData.detalles || recibirData.detalles.length === 0) && (
                  <div style={{ fontSize: 12, color: C.textSub, textAlign: 'center', padding: 12 }}>
                    Sin artículos registrados
                  </div>
                )}
              </div>
              {/* Notas */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>Notas de recepción</div>
                <textarea value={notasRecibir} onChange={e => setNotasRecibir(e.target.value)}
                  rows={3} placeholder="Observaciones sobre la recepción..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border2}`,
                    fontSize: 12, background: C.inputBg, color: C.text, resize: 'vertical',
                    boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ fontSize: 11, color: C.textSub, background: C.bg, padding: '8px 12px', borderRadius: 6 }}>
                Al confirmar, el stock de cada artículo se actualizará en el almacén destino.
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => { setRecibirData(null); setNotasRecibir(''); }}
                style={{ flex: 1, height: 40, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={handleRecibir} disabled={recibiendo}
                style={{ flex: 2, height: 40, borderRadius: 8, border: 'none',
                  background: recibiendo ? '#9ca3af' : C.green, color: '#fff',
                  cursor: recibiendo ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                {recibiendo ? 'Procesando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel Clientes ────────────────────────────────────────────────────────────
// ── Panel Conduces completo ───────────────────────────────────────────────────
function POSConducePanel({ C, onVolver, initClienteId, initFacturaId }: {
  C: Palette; onVolver: () => void; initClienteId?: number; initFacturaId?: number;
}) {
  const qc = useQueryClient();
  const [modoForm,   setModoForm]   = useState(!!initClienteId);
  const [busq,       setBusq]       = useState('');
  const [busqCli,    setBusqCli]    = useState('');
  const [fClienteId, setFClienteId] = useState<number|null>(initClienteId ?? null);
  const [fDireccion, setFDireccion] = useState('');
  const [fNotas,     setFNotas]     = useState('');
  const [fItems,     setFItems]     = useState([{ desc: '', cant: '1', um: 'PZA' }]);
  const [imprimiendo,setImprimiendo]= useState<number|null>(null);

  const { data: conduces = [], isLoading } = useQuery<any[]>({
    queryKey: ['pos-conduces', busq],
    queryFn: () => api.get(`/conduces?limit=50${busq ? '&search=' + encodeURIComponent(busq) : ''}`)
      .then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['pos-cli-conduce', busqCli],
    queryFn: () => api.get(`/clientes?limit=30${busqCli ? '&search=' + encodeURIComponent(busqCli) : ''}`)
      .then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    staleTime: 30_000,
  });

  const { data: resumen } = useQuery<any>({
    queryKey: ['pos-conduces-resumen'],
    queryFn: () => api.get('/conduces/resumen').then(r => r.data?.data ?? r.data),
    refetchInterval: 30_000,
  });

  const pendientes = (resumen?.generado ?? 0) + (resumen?.en_transito ?? 0);

  const crearMut = useMutation({
    mutationFn: () => api.post('/conduces', {
      clienteId:       fClienteId,
      fecha:           new Date().toISOString().split('T')[0],
      direccionEntrega: fDireccion.trim(),
      notas:           fNotas || undefined,
      facturaId:       initFacturaId || undefined,
      detalles: fItems.filter(i => i.desc.trim()).map(i => ({
        descripcion: i.desc.trim(), cantidad: parseFloat(i.cant) || 1, unidadMedida: i.um || 'PZA',
      })),
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['pos-conduces'] });
      qc.invalidateQueries({ queryKey: ['pos-conduces-resumen'] });
      const num = res.data?.data?.numero ?? res.data?.numero ?? '';
      message.success(`Conduce ${num} creado`);
      setModoForm(false);
      setFClienteId(null); setFDireccion(''); setFNotas('');
      setFItems([{ desc: '', cant: '1', um: 'PZA' }]);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear conduce', 5),
  });

  const cambiarEstadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => {
      if (estado === 'en_transito') return api.patch(`/conduces/${id}/en-transito`);
      if (estado === 'entregado')   return api.patch(`/conduces/${id}/entregado`);
      return api.patch(`/conduces/${id}/devuelto`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-conduces'] });
      qc.invalidateQueries({ queryKey: ['pos-conduces-resumen'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const imprimirTermico = async (id: number) => {
    setImprimiendo(id);
    try {
      const [docRes, empRes] = await Promise.all([
        api.get(`/conduces/${id}`).then(r => r.data?.data ?? r.data),
        api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({})),
      ]);
      const empInfo = {
        nombre:    empRes.razonSocial ?? empRes.nombre,
        rnc:       empRes.rnc,
        direccion: empRes.direccion,
        telefono:  empRes.telefono,
      };
      const gd: GenericDocData = {
        tipo:    'CONDUCE',
        numero:  docRes.numero ?? String(id),
        fecha:   String(docRes.fecha ?? '').substring(0, 10),
        empresa: empInfo,
        cliente: docRes.cliente?.nombre,
        items:   (docRes.detalles ?? []).map((d: any) => ({ desc: d.descripcion, cant: Number(d.cantidad) })),
        nota1:   docRes.direccionEntrega ? `Entrega: ${docRes.direccionEntrega}` : undefined,
        nota2:   docRes.contactoEntrega  ? `Contacto: ${docRes.contactoEntrega}` : undefined,
        notas:   docRes.notas,
      };
      const empConf = (empRes.configuracion ?? {}) as any;
      imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora: empConf.posTipoImpresora }));
    } catch { message.error('Error al imprimir conduce'); }
    finally   { setImprimiendo(null); }
  };

  const canCreate = !!fClienteId && !!fDireccion.trim() && fItems.some(i => i.desc.trim());

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHeader
        title={pendientes > 0 ? `Conduces (${pendientes} pend.)` : 'Conduces'}
        icon="🚚" C={C} onVolver={onVolver}
        onNuevo={() => setModoForm(v => !v)}
        labelNuevo={modoForm ? 'Ver lista' : 'Nuevo'}
      />

      {modoForm ? (
        /* ── FORMULARIO ────────────────────────────────────────────── */
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ maxWidth: 480, color: C.text }}>

            {/* Cliente */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>Cliente *</div>
              <select value={fClienteId ?? ''} onChange={e => setFClienteId(e.target.value ? Number(e.target.value) : null)}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8,
                  border: `1px solid ${C.border2}`, fontSize: 13, background: C.inputBg, color: C.text,
                  outline: 'none', boxSizing: 'border-box' as const, cursor: 'pointer' }}>
                <option value="">Seleccionar cliente...</option>
                {(clientes ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <input value={busqCli} onChange={e => setBusqCli(e.target.value)} placeholder="Escribir para buscar..."
                style={{ width: '100%', height: 30, padding: '0 10px', marginTop: 4, borderRadius: 7,
                  border: `1px solid ${C.border}`, fontSize: 11, outline: 'none', background: C.inputBg,
                  color: C.text, boxSizing: 'border-box' as const }} />
            </div>

            <PanelInput C={C} label="Dirección de entrega *" placeholder="Dirección completa de entrega"
              value={fDireccion} onChange={e => setFDireccion(e.target.value)} />

            {/* Ítems */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: C.text,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Ítems a despachar</span>
                <button onClick={() => setFItems(p => [...p, { desc: '', cant: '1', um: 'PZA' }])}
                  style={{ fontSize: 11, background: C.inputBg, border: `1px solid ${C.border2}`,
                    borderRadius: 5, color: C.blue, padding: '2px 8px', cursor: 'pointer' }}>
                  + Agregar ítem
                </button>
              </div>
              {fItems.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 24px', gap: 5, marginBottom: 6 }}>
                  <input placeholder="Descripción del producto" value={item.desc}
                    onChange={e => setFItems(p => p.map((x, i) => i === idx ? { ...x, desc: e.target.value } : x))}
                    style={{ height: 34, padding: '0 10px', borderRadius: 7, border: `1px solid ${C.border2}`,
                      fontSize: 12, background: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' as const }} />
                  <input type="number" placeholder="Cant" value={item.cant}
                    onChange={e => setFItems(p => p.map((x, i) => i === idx ? { ...x, cant: e.target.value } : x))}
                    style={{ height: 34, padding: '0 4px', borderRadius: 7, border: `1px solid ${C.border2}`,
                      fontSize: 12, background: C.inputBg, color: C.text, outline: 'none', textAlign: 'center' as const }} />
                  <input placeholder="UM" value={item.um}
                    onChange={e => setFItems(p => p.map((x, i) => i === idx ? { ...x, um: e.target.value } : x))}
                    style={{ height: 34, padding: '0 4px', borderRadius: 7, border: `1px solid ${C.border2}`,
                      fontSize: 11, background: C.inputBg, color: C.text, outline: 'none', textAlign: 'center' as const }} />
                  {fItems.length > 1 && (
                    <button onClick={() => setFItems(p => p.filter((_, i) => i !== idx))}
                      style={{ height: 34, background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18, padding: 0 }}>×</button>
                  )}
                </div>
              ))}
            </div>

            <PanelInput C={C} label="Notas de entrega (opcional)" placeholder="Instrucciones, referencias, horario..."
              value={fNotas} onChange={e => setFNotas(e.target.value)} />

            <button onClick={() => crearMut.mutate()} disabled={crearMut.isPending || !canCreate}
              style={{ width: '100%', height: 44, borderRadius: 10, border: 'none',
                background: !canCreate ? '#ccc' : '#059669', color: '#fff',
                fontWeight: 700, fontSize: 15, cursor: !canCreate ? 'not-allowed' : 'pointer' }}>
              {crearMut.isPending ? 'Creando...' : '🚚 Crear Conduce'}
            </button>
          </div>
        </div>
      ) : (
        /* ── LISTA ─────────────────────────────────────────────────── */
        <>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar por número o cliente..."
              style={{ width: '100%', height: 34, padding: '0 12px', background: C.card,
                border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
                fontSize: 12, outline: 'none', boxSizing: 'border-box' as const }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' as const }}>
            {isLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              : (conduces ?? []).length === 0
                ? <Empty style={{ marginTop: 40 }} description={<span style={{ color: C.textSub }}>Sin conduces</span>} />
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: C.card, position: 'sticky', top: 0 }}>
                      {['Número', 'Cliente', 'Dirección', 'Estado', 'Acciones'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textSub,
                          fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{(conduces ?? []).map((r: any, i: number) => {
                      const eColor = r.estado === 'entregado' ? C.green
                        : r.estado === 'en_transito' ? C.blue
                        : r.estado === 'devuelto' ? C.red : C.orange;
                      const eLabel = r.estado === 'en_transito' ? 'EN RUTA'
                        : (r.estado ?? '').replace('_', ' ').toUpperCase();
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.card }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: C.blue, fontWeight: 700 }}>{r.numero}</td>
                          <td style={{ padding: '8px 10px', color: C.text, fontSize: 11, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {r.cliente?.nombre ?? '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: C.textSub, fontSize: 10, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {r.direccionEntrega ?? '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                              background: eColor + '22', color: eColor }}>
                              {eLabel}
                            </span>
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                              <button onClick={() => imprimirTermico(r.id)} disabled={imprimiendo === r.id}
                                title="Imprimir recibo térmico"
                                style={{ background: 'none', border: `1px solid ${C.border2}`, borderRadius: 5,
                                  color: C.blue, cursor: 'pointer', padding: '3px 6px', fontSize: 12 }}>
                                {imprimiendo === r.id ? '⏳' : '🖨️'}
                              </button>
                              {r.estado === 'generado' && (
                                <button onClick={() => cambiarEstadoMut.mutate({ id: r.id, estado: 'en_transito' })}
                                  title="Marcar En Ruta"
                                  style={{ background: C.blue + '22', border: `1px solid ${C.blue}55`, borderRadius: 5,
                                    color: C.blue, cursor: 'pointer', padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>
                                  🚚 En Ruta
                                </button>
                              )}
                              {r.estado === 'en_transito' && (<>
                                <button onClick={() => cambiarEstadoMut.mutate({ id: r.id, estado: 'entregado' })}
                                  title="Marcar Entregado"
                                  style={{ background: C.green + '22', border: `1px solid ${C.green}55`, borderRadius: 5,
                                    color: C.green, cursor: 'pointer', padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>
                                  ✅ Entregado
                                </button>
                                <button onClick={() => cambiarEstadoMut.mutate({ id: r.id, estado: 'devuelto' })}
                                  title="Marcar Devuelto"
                                  style={{ background: C.orange + '22', border: `1px solid ${C.orange}55`, borderRadius: 5,
                                    color: C.orange, cursor: 'pointer', padding: '3px 6px', fontSize: 10, fontWeight: 700 }}>
                                  ↩ Dev.
                                </button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                )}
          </div>
        </>
      )}
    </div>
  );
}

function POSClientesPanel({ C, onVolver }: { C: Palette; onVolver: () => void }) {
  const qc = useQueryClient();
  const [form,      setForm]      = useState(false);
  const [editando,  setEditando]  = useState<any>(null);  // cliente que se está editando
  const [f, setF] = useState({ nombre:'', telefono:'', email:'', rnc:'', empresa:'' });
  const [busq, setBusq] = useState('');
  const { datos: rncDatos, loading: rncLoading, consultarDebounced, limpiar: limpiarRnc } = useRncLookup();
  const { data, isLoading } = useQuery<any>({
    queryKey: ['pos-clientes', busq],
    queryFn: () => api.get(`/clientes?limit=40${busq?'&search='+encodeURIComponent(busq):''}`)
      .then(r=>{ const d=r.data?.data??r.data; return d?.data??d??[]; }),
    staleTime: 30_000,
  });
  const resetForm = () => { setForm(false); setEditando(null); setF({ nombre:'',telefono:'',email:'',rnc:'',empresa:'' }); limpiarRnc(); };

  const crearMut = useMutation({
    mutationFn: () => api.post('/clientes', {
      nombre:      f.nombre.trim(),
      telefono:    f.telefono   || undefined,
      email:       f.email      || undefined,
      rfc:         f.rnc.trim() || undefined,
      razonSocial: f.empresa    || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos-clientes'] }); resetForm(); message.success('Cliente registrado'); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al guardar';
      message.error(Array.isArray(msg) ? msg[0] : msg, 5);
    },
  });

  const actualizarMut = useMutation({
    mutationFn: () => api.patch(`/clientes/${editando.id}`, {
      nombre:      f.nombre.trim(),
      telefono:    f.telefono   || undefined,
      email:       f.email      || undefined,
      rfc:         f.rnc.trim() || undefined,
      razonSocial: f.empresa    || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pos-clientes'] }); resetForm(); message.success('Cliente actualizado'); },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al actualizar';
      message.error(Array.isArray(msg) ? msg[0] : msg, 5);
    },
  });

  const abrirEditar = (c: any) => {
    setEditando(c);
    setF({ nombre: c.nombre||'', telefono: c.telefono||'', email: c.email||'',
           rnc: c.rncReceptor||c.rfc||'', empresa: c.razonSocial||'' });
    setForm(true);
    limpiarRnc();
  };

  const isPending = editando ? actualizarMut.isPending : crearMut.isPending;
  const guardar   = () => editando ? actualizarMut.mutate() : crearMut.mutate();

  const inp = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [key]: e.target.value }));

  // Cuando llegan datos de DGII, autocompletar nombre y empresa
  useEffect(() => {
    if (!rncDatos?.encontrado) return;
    setF(p => ({
      ...p,
      nombre:  p.nombre  || rncDatos.nombre          || '',
      empresa: p.empresa || rncDatos.nombreComercial  || rncDatos.nombre || '',
    }));
  }, [rncDatos]);

  const rncOk    = rncDatos?.encontrado === true;
  const rncError = rncDatos?.encontrado === false;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PanelHeader title="Clientes" icon="👤" C={C} onVolver={onVolver}
        onNuevo={() => { if (form) resetForm(); else setForm(true); }}
        labelNuevo={form ? 'Ver lista' : 'Nuevo'} />
      {form ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ maxWidth: 480, color: C.text }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
              <PanelInput C={C} label="Nombre *" placeholder="Nombre del cliente" value={f.nombre} onChange={inp('nombre')} />
              <PanelInput C={C} label="Teléfono" placeholder="Teléfono" value={f.telefono} onChange={inp('telefono')} />
              <PanelInput C={C} label="Correo electrónico" placeholder="correo@email.com" value={f.email} onChange={inp('email')} />
              {/* RNC / Cédula con consulta DGII (Mega Plus) */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, marginBottom: 4 }}>
                  RNC / Cédula
                  {rncLoading && <span style={{ marginLeft: 6, color: C.blue, fontSize: 10 }}>Consultando DGII...</span>}
                  {rncOk    && <span style={{ marginLeft: 6, color: C.green, fontSize: 10 }}>✓ Verificado</span>}
                  {rncError && <span style={{ marginLeft: 6, color: C.orange, fontSize: 10 }}>No encontrado</span>}
                </div>
                <input
                  value={f.rnc}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
                    setF(p => ({ ...p, rnc: val }));
                    consultarDebounced(val);
                  }}
                  placeholder="RNC (9) o Cédula (11)"
                  maxLength={11}
                  style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 8,
                    border: `1px solid ${rncOk ? C.green : rncError ? C.orange : C.border}`,
                    background: C.card, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
                />
              </div>
            </div>
            {/* Empresa con badge si autocompleted */}
            <div style={{ marginTop: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, marginBottom: 4 }}>
                Empresa / Compañía
                {rncOk && f.empresa && (
                  <span style={{ marginLeft: 6, background: C.green + '22', color: C.green,
                    fontSize: 10, padding: '1px 6px', borderRadius: 4 }}>Autocompletado DGII</span>
                )}
              </div>
              <input
                value={f.empresa}
                onChange={inp('empresa')}
                placeholder="Nombre de la empresa"
                style={{ width: '100%', height: 38, padding: '0 10px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.card, color: C.text,
                  fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, marginBottom: 12 }}
              />
            </div>
            {editando && (
              <div style={{ fontSize: 12, color: C.blue, fontWeight: 600, marginBottom: 12,
                background: C.blue + '15', padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.blue}30` }}>
                ✏️ Editando: {editando.nombre}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {editando && (
                <button onClick={resetForm}
                  style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.border}`,
                    background: 'transparent', color: C.textSub, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  Cancelar
                </button>
              )}
              <button onClick={guardar} disabled={isPending || !f.nombre.trim()}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none',
                  background: !f.nombre.trim() ? '#ccc' : editando ? C.blue : '#059669', color: '#fff',
                  fontWeight: 700, fontSize: 15, cursor: !f.nombre.trim() ? 'not-allowed' : 'pointer' }}>
                {isPending ? 'Guardando...' : editando ? 'Actualizar' : 'Grabar'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar cliente..."
              style={{ width:'100%', height:34, padding:'0 12px', background:C.card,
                border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:12, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin' }}>
            {isLoading ? <div style={{textAlign:'center',padding:40}}><Spin/></div> :
             (data??[]).length===0 ? <Empty style={{marginTop:40}} description={<span style={{color:C.textSub}}>Sin clientes</span>}/> : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{background:C.card,position:'sticky',top:0}}>
                  {['Nombre','RNC/Cédula','Teléfono',''].map(h=>(
                    <th key={h} style={{padding:'8px 12px',textAlign:'left',color:C.textSub,fontWeight:600,fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{(data??[]).map((c:any,i:number)=>(
                  <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?'transparent':C.card}}>
                    <td style={{padding:'8px 12px',color:C.text,fontWeight:600}}>
                      <div>{c.nombre}</div>
                      {c.email && <div style={{fontSize:10,color:C.textSub}}>{c.email}</div>}
                    </td>
                    <td style={{padding:'8px 12px',color:C.textSub,fontFamily:'monospace',fontSize:11}}>{c.rncReceptor||c.rfc||'—'}</td>
                    <td style={{padding:'8px 12px',color:C.textSub}}>{c.telefono||'—'}</td>
                    <td style={{padding:'6px 8px',textAlign:'right'}}>
                      <button onClick={() => abrirEditar(c)}
                        style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6,
                          color:C.textSub, padding:'3px 10px', fontSize:11, cursor:'pointer' }}>
                        ✏️ Editar
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Panel Recibo / Anticipo (formulario + lista) ───────────────────────────────
function POSReciboAnticipoPanel({ tipo, C, onVolver }: { tipo: 'recibos-cobro'|'anticipos'; C: Palette; onVolver: () => void }) {
  const qc = useQueryClient();
  const esAnticipo = tipo === 'anticipos';
  const METODOS_PAGO = ['Efectivo','Tarjeta','Cheque','Transferencia','Depósito'];
  const [imprimiendoId, setImprimiendoId] = useState<number|null>(null);

  const imprimirTermicoRecibo = async (id: number, r: any) => {
    setImprimiendoId(id);
    try {
      const empRes = await api.get('/configuracion/empresa')
        .then(x => x.data?.data ?? x.data).catch(() => ({}));
      const empInfo = {
        nombre:    empRes.razonSocial ?? empRes.nombre,
        rnc:       empRes.rnc,
        direccion: empRes.direccion,
        telefono:  empRes.telefono,
      };
      const tipoDoc = esAnticipo ? 'ANTICIPO' : 'RECIBO DE COBRO';
      const gd: GenericDocData = {
        tipo:    tipoDoc,
        numero:  r.numero ?? String(id),
        fecha:   String(r.fecha ?? '').substring(0, 10),
        empresa: empInfo,
        cliente: r.clienteNombre ?? r.cliente?.nombre,
        items:   [{ desc: r.concepto ?? tipoDoc, total: Number(r.monto ?? 0) }],
        total:   Number(r.monto ?? 0),
        nota1:   `Método: ${r.tipoPago ?? r.metodoPago ?? '—'}`,
      };
      const empConf = (empRes.configuracion ?? {}) as any;
      imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora: empConf.posTipoImpresora }));
    } catch { /* silencio */ }
    finally { setImprimiendoId(null); }
  };
  const [form, setForm]           = useState(false);
  const [busqCliente, setBusqCliente] = useState('');
  const [clienteId, setClienteId] = useState<number|null>(null);
  const [monto, setMonto]         = useState('');
  const [metodo, setMetodo]       = useState('Efectivo');
  const [referencia, setRef]      = useState('');
  const [descripcion, setDesc]    = useState('');
  const [facturaId,           setFacturaId]           = useState<number|null>(null);
  const [facturaFolio,        setFacturaFolio]        = useState('');
  const [facturaSearch,       setFacturaSearch]       = useState('');
  const [showFacturaDropdown, setShowFacturaDropdown] = useState(false);
  const { data: clientes } = useQuery<any>({
    queryKey: ['pos-cli-sel', busqCliente],
    queryFn: () => api.get(`/clientes?limit=20${busqCliente?'&search='+encodeURIComponent(busqCliente):''}`)
      .then(r=>{ const d=r.data?.data??r.data; return d?.data??d??[]; }),
    staleTime: 30_000,
  });
  const { data: facturasCliente = [], isFetching: loadingFacturas } = useQuery<any[]>({
    queryKey: ['pos-facturas-cli', clienteId],
    queryFn:  () => api.get(`/facturas?clienteId=${clienteId}&limit=100`)
      .then(r => {
        const d   = r.data?.data ?? r.data;
        const arr = Array.isArray(d) ? d : (d?.data ?? []);
        return arr.filter((f: any) => f.estado !== 'pagada' && f.estado !== 'anulada');
      }),
    enabled: !!clienteId && !esAnticipo,
    staleTime: 0,
  });
  const { data: lista, isLoading } = useQuery<any>({
    queryKey: ['pos-panel', tipo],
    queryFn: () => api.get(`/${tipo}?limit=20`)
      .then(r=>{ const d=r.data?.data??r.data; return d?.data??d??[]; }),
    staleTime: 30_000,
    enabled: !form,
  });
  const resetForm = () => {
    setForm(false); setMonto(''); setMetodo('Efectivo'); setRef(''); setDesc('');
    setClienteId(null); setBusqCliente(''); setFacturaId(null); setFacturaFolio('');
    setFacturaSearch(''); setShowFacturaDropdown(false);
  };

  const buildBody = (extras: Record<string, any> = {}) => {
    const metodoPagoNorm = metodo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Vendedor activo del turno POS (guardado en localStorage al abrir turno)
    const posVendedorId = localStorage.getItem('pos_vendedor_id');
    const body: any = {
      monto:      Number(monto),
      metodoPago: metodoPagoNorm,
      concepto:   descripcion || (esAnticipo ? 'Anticipo' : 'Recibo de cobro'),
      fecha:      new Date().toISOString().split('T')[0],
      ...extras,
    };
    if (clienteId)    body.clienteId   = clienteId;
    if (referencia)   body.referencia  = referencia;
    if (facturaId)    { body.facturaId = facturaId; body.facturaFolio = facturaFolio; }
    // Pasar vendedorId para imputar el cobro al cierre de caja correcto
    if (posVendedorId) body.vendedorId = Number(posVendedorId);
    return body;
  };

  const guardarMut = useMutation({
    mutationFn: (extras: Record<string, any> = {}) => api.post(`/${tipo}`, buildBody(extras)),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['pos-panel', tipo] });
      qc.refetchQueries({ queryKey: ['pos-panel', tipo] });
      qc.invalidateQueries({ queryKey: ['pos-panel', 'anticipos'] });
      const d = res.data?.data ?? res.data;
      const anticipo = d?.anticipo;
      if (anticipo) {
        message.success(`Recibo registrado + Anticipo ${anticipo.numero} (RD$ ${Number(anticipo.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })})`, 5);
      } else {
        message.success(esAnticipo ? 'Anticipo registrado' : 'Recibo registrado');
      }
      resetForm();
    },
    onError: (e: any) => {
      const msg: string = e?.response?.data?.message ?? 'Error al guardar';
      if (msg.startsWith('EXCEDENTE:')) {
        const [, exStr, penStr] = msg.split(':');
        Modal.confirm({
          title: 'Monto superior al saldo pendiente',
          icon: null,
          content: (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
              <p>El saldo pendiente de la factura es <strong>RD$ {Number(penStr).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong>.</p>
              <p>El excedente de <strong>RD$ {Number(exStr).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong> puede registrarse como anticipo del cliente.</p>
              <p>¿Deseas registrarlo como anticipo?</p>
            </div>
          ),
          okText: 'Sí, registrar anticipo',
          cancelText: 'Cobrar solo el saldo',
          onOk:    () => guardarMut.mutate({ registrarExcedente: true }),
          onCancel: () => guardarMut.mutate({ registrarExcedente: false, monto: Number(penStr) }),
          centered: true,
          width: 400,
        });
      } else {
        message.error(msg, 4);
      }
    },
  });
  const title = esAnticipo ? 'Anticipos' : 'Recibos de Cobro';
  const icon  = esAnticipo ? '💰' : '🧾';
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <PanelHeader title={title} icon={icon} C={C} onVolver={onVolver}
        onNuevo={() => setForm(v=>!v)} labelNuevo={form ? 'Ver lista' : 'Nuevo'} />
      {form ? (
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          <div style={{ maxWidth:440, color:C.text }}>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Buscar Cliente</div>
              <select value={clienteId??''} onChange={e=>{ setClienteId(e.target.value?Number(e.target.value):null); setFacturaId(null); setFacturaFolio(''); setFacturaSearch(''); setShowFacturaDropdown(false); }}
                style={{ width:'100%', height:38, padding:'0 12px', borderRadius:8,
                  border:`1px solid ${C.border2}`, fontSize:13, background:C.inputBg, color:C.text, cursor:'pointer', outline:'none', boxSizing:'border-box' }}>
                <option value="">Sin cliente específico</option>
                {(clientes??[]).map((c:any)=>(<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
              <input value={busqCliente} onChange={e=>setBusqCliente(e.target.value)} placeholder="Escribir para buscar..."
                style={{ width:'100%', height:32, padding:'0 12px', marginTop:4, borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, outline:'none', boxSizing:'border-box', background:C.inputBg, color:C.text }} />
            </div>
            <PanelInput C={C} label="Monto" type="number" placeholder="Monto" value={monto} onChange={e=>setMonto(e.target.value)} />
            {!esAnticipo && (() => {
              const term = facturaSearch.trim().toLowerCase();
              const filtradas = facturasCliente.filter((f: any) =>
                !term || (f.numero ?? f.folio ?? '').toLowerCase().includes(term)
              );
              const totalFmt = (f: any) => {
                const v = Number(f.total ?? f.montoTotal ?? f.monto ?? 0);
                return v.toLocaleString('es-DO', { minimumFractionDigits: 2 });
              };
              return (
                <div style={{ marginBottom: 12, position: 'relative' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: C.text }}>
                    Factura de referencia (opcional)
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={!clienteId ? 'Selecciona un cliente primero' : loadingFacturas ? 'Cargando facturas...' : 'Escribe el número de factura...'}
                      disabled={!clienteId}
                      value={facturaSearch}
                      onChange={e => {
                        setFacturaSearch(e.target.value);
                        setFacturaId(null);
                        setFacturaFolio('');
                        setShowFacturaDropdown(true);
                      }}
                      onFocus={() => { if (clienteId) setShowFacturaDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowFacturaDropdown(false), 180)}
                      style={{
                        width: '100%', height: 38, padding: '0 36px 0 12px', borderRadius: 8,
                        border: `1px solid ${facturaId ? '#10B981' : C.border2}`,
                        fontSize: 13, boxSizing: 'border-box' as const,
                        background: C.inputBg, color: C.text, outline: 'none',
                      }}
                    />
                    {facturaId && (
                      <button
                        onClick={() => { setFacturaId(null); setFacturaFolio(''); setFacturaSearch(''); }}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: C.textSub, fontSize: 16, lineHeight: 1, padding: 0 }}
                        title="Quitar factura"
                      >×</button>
                    )}
                  </div>
                  {facturaId && (
                    <div style={{ fontSize: 11, color: '#10B981', marginTop: 3 }}>
                      ✓ {facturaFolio} seleccionada
                    </div>
                  )}
                  {showFacturaDropdown && clienteId && (
                    <div style={{
                      position: 'absolute', zIndex: 999, width: '100%', maxHeight: 220,
                      overflowY: 'auto', borderRadius: 8, marginTop: 2,
                      background: C.card, border: `1px solid ${C.border2}`,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                    }}>
                      {filtradas.length === 0 ? (
                        <div style={{ padding: '10px 14px', color: C.textSub, fontSize: 12 }}>
                          {loadingFacturas ? 'Cargando...' : 'No se encontraron facturas pendientes'}
                        </div>
                      ) : filtradas.map((f: any) => (
                        <div
                          key={f.id}
                          onMouseDown={() => {
                            setFacturaId(f.id);
                            setFacturaFolio(f.numero ?? f.folio ?? '');
                            setFacturaSearch(f.numero ?? f.folio ?? '');
                            setShowFacturaDropdown(false);
                          }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                            borderBottom: `1px solid ${C.border}`,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.inputBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: C.text }}>
                            {f.numero ?? f.folio}
                          </span>
                          <span style={{ color: '#10B981', fontSize: 12 }}>
                            RD$ {totalFmt(f)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <PanelSelect C={C} label="Tipo de Pago" value={metodo} onChange={e=>setMetodo(e.target.value)}>
              {METODOS_PAGO.map(m=><option key={m} value={m}>{m}</option>)}
            </PanelSelect>
            {metodo === 'Cheque' && (
              <PanelInput C={C} label="Número de Cheque" placeholder="Número de Cheque" value={referencia} onChange={e=>setRef(e.target.value)} />
            )}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Descripción</div>
              <textarea value={descripcion} onChange={e=>setDesc(e.target.value)} placeholder="Descripción / Concepto"
                rows={3} style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:`1px solid ${C.border2}`,
                  fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', background:C.inputBg, color:C.text }} />
            </div>
            <button onClick={() => guardarMut.mutate({})} disabled={guardarMut.isPending || !monto}
              style={{ width:'100%', height:44, borderRadius:10, border:'none',
                background: !monto?'#ccc':'#059669', color:'#fff',
                fontWeight:700, fontSize:15, cursor:!monto?'not-allowed':'pointer' }}>
              {guardarMut.isPending ? 'Guardando...' : 'Grabar'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin' }}>
          {isLoading ? <div style={{textAlign:'center',padding:40}}><Spin/></div> :
           (lista??[]).length===0 ? <Empty style={{marginTop:40}} description={<span style={{color:C.textSub}}>Sin registros</span>}/> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{background:C.card,position:'sticky',top:0}}>
                {(esAnticipo
                  ? ['Número','Cliente','Monto','Pendiente','Estado','']
                  : ['Número','Cliente','Monto','Método','']
                ).map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',color:C.textSub,fontWeight:600,fontSize:11,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{(lista??[]).map((r:any,i:number)=>(
                <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?'transparent':C.card}}>
                  <td style={{padding:'8px 12px',color:C.blue,fontFamily:'monospace',fontSize:11}}>{r.numero||r.id}</td>
                  <td style={{padding:'8px 12px',color:C.text}}>{r.clienteNombre||r.cliente?.nombre||'—'}</td>
                  <td style={{padding:'8px 12px',color:C.green,fontWeight:700}}>{fmt.money(r.monto??r.total??0)}</td>
                  {esAnticipo ? (
                    <>
                      <td style={{padding:'8px 12px',color:Number(r.montoPendiente??0)>0?C.green:C.textSub,fontWeight:700}}>
                        {fmt.money(Number(r.montoPendiente??0))}
                      </td>
                      <td style={{padding:'8px 12px'}}>
                        <span style={{
                          fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:10,
                          background: r.estado==='activo'?'rgba(59,130,246,.15)':r.estado==='aplicado'?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)',
                          color: r.estado==='activo'?C.blue:r.estado==='aplicado'?C.green:'#EF4444',
                        }}>{(r.estado??'').toUpperCase()}</span>
                      </td>
                    </>
                  ) : (
                    <td style={{padding:'8px 12px',color:C.textSub,fontSize:11}}>{r.tipoPago||r.metodoPago||'—'}</td>
                  )}
                  <td style={{padding:'4px 8px',textAlign:'right'}}>
                    <button onClick={() => imprimirTermicoRecibo(r.id, r)}
                      disabled={imprimiendoId === r.id}
                      title="Imprimir recibo térmico"
                      style={{background:'none',border:`1px solid ${C.border2}`,borderRadius:5,
                        color:C.blue,cursor:'pointer',padding:'3px 6px',fontSize:12}}>
                      {imprimiendoId === r.id ? '⏳' : '🖨️'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel Cierre de Caja ──────────────────────────────────────────────────────
const BILLETES_RD = [2000, 1000, 500, 200, 100, 50, 25, 20, 10, 5, 1];

type DesglosePago = {
  efectivo: string; tarjetaCredito: string; tarjetaDebito: string;
  cheque: string; transferencia: string; otro: string;
  deposito: string; documentos: string;
};

function CierreField({ label, value, editable, onChange, highlight }:
  { label: string; value: string; editable?: boolean; onChange?: (v:string)=>void; highlight?: boolean }) {
  const color = highlight ? '#059669' : 'inherit';
  return (
    <div>
      <div style={{ fontSize:10, color:'#94A3B8', marginBottom:2 }}>{label}</div>
      {editable ? (
        <input type="number" value={value} onChange={e=>onChange?.(e.target.value)}
          style={{ width:'100%', height:36, textAlign:'right', padding:'0 8px',
            borderRadius:6, border:'1px solid #ddd', fontSize:13, outline:'none',
            boxSizing:'border-box', fontWeight:600, color }} />
      ) : (
        <div style={{ height:36, display:'flex', alignItems:'center', justifyContent:'flex-end',
          padding:'0 8px', background:'#F8FAFC', borderRadius:6, border:'1px solid #E2E8F0',
          fontSize:13, fontWeight:600, color }}>
          {value}
        </div>
      )}
    </div>
  );
}

// ── Ganancias / Ventas de Hoy ─────────────────────────────────────────────────
function POSVentasHoyPanel({ C, onVolver }: { C: Palette; onVolver: () => void }) {
  const hoy        = dayjs().format('YYYY-MM-DD');
  const vendedorId = localStorage.getItem('pos_vendedor_id');
  const qc         = useQueryClient();
  const user       = useAuthStore(s => s.user);
  const esAdmin    = user?.role === 'admin' || user?.role === 'contador';
  const [tab, setTab] = useState<'hoy' | 'historial'>('hoy');

  // ── Facturas del día (ambos roles — admin para la lista, vendedor para el total)
  const url = `/facturas?desde=${hoy}&hasta=${hoy}&limit=100${vendedorId ? `&vendedorId=${vendedorId}` : ''}`;
  const { data: raw, isLoading, refetch } = useQuery<any>({
    queryKey: ['pos-ventas-hoy', hoy, vendedorId],
    queryFn:  () => api.get(url).then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const ventas: any[] = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
  const totalDia = ventas.reduce((s: number, v: any) => s + Number(v.total ?? 0), 0);

  // ── Ganancias del día (solo admin/contador)
  const { data: ganData, isLoading: ganLoading, refetch: ganRefetch } = useQuery<any>({
    queryKey: ['pos-ganancias-dia', hoy],
    queryFn:  () => api.get(`/reportes/ganancias-dia?fecha=${hoy}`).then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
    enabled: esAdmin,
  });

  // ── Historial últimos 30 días (solo admin/contador, se carga al abrir el tab)
  const desde30 = dayjs().subtract(29, 'day').format('YYYY-MM-DD');
  const { data: histData, isLoading: histLoading, refetch: histRefetch } = useQuery<any[]>({
    queryKey: ['pos-ganancias-historial', desde30, hoy],
    queryFn:  () => api.get(`/reportes/ganancias-historial?desde=${desde30}&hasta=${hoy}`).then(r => r.data?.data ?? r.data),
    staleTime: 5 * 60_000,
    enabled: esAdmin && tab === 'historial',
  });

  const fmt2 = (n: number) => `RD$${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  const pct  = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—';

  const handleReimprimir = async (id: number, folio: string) => {
    // En móvil/tablet la app BT intercepta la pestaña antes de document.write() → about:blank.
    // En móvil usamos overlay+window.print() directo (imprimirReciboTermico lo detecta solo).
    const _esMovilReimpr = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    const printWin = _esMovilReimpr ? null : window.open('', '_blank', 'width=360,height=640,toolbar=0,menubar=0,location=0,scrollbars=yes');
    if (printWin) {
      printWin.document.write('<html><head><title>Cargando...</title></head><body style="font-family:monospace;padding:20px;text-align:center">Cargando recibo...</body></html>');
    }
    try {
      const empresa = await api.get('/configuracion/empresa')
        .then(x => x.data?.data ?? x.data).catch(() => ({}));
      const f = await api.get(`/facturas/${id}`).then(r => r.data?.data ?? r.data);
      const sale: Sale = {
        folio: f.folio, total: Number(f.total ?? 0), cambio: 0,
        metodo: f.notas?.includes('Tarjeta') ? 'tarjeta' : f.notas?.includes('Transferencia') ? 'transferencia' : 'efectivo',
        items: (f.detalles ?? []).map((d: any) => ({
          produto: { id: d.productoId, nombre: d.descripcion, precio: Number(d.precioUnitario),
                     stock: 999, porcentajeIva: Number(d.porcentajeIva ?? 18), codigo: '', categoria: '', unidadMedida: '' } as any,
          cantidad: Number(d.cantidad), precio: Number(d.precioUnitario), descuentoMonto: 0,
        })),
        cliente: f.cliente?.nombre, iva: Number(f.iva ?? 0), subtotal: Number(f.subtotal ?? 0),
        facturaId: f.id, tipoNcf: f.tipoNcf ?? 'E32',
        encf: f.ecf?.numero, ecfPendiente: !f.ecf?.numero,
        securityCode: f.ecf?.codigoSeguridad, qrUrl: f.ecf?.qrUrl,
        rncComprador: f.cliente?.rncReceptor, razonSocial: f.cliente?.nombre,
        cajero: f.usuario?.nombre ?? f.nombreVendedor,
        sucursalNombre: (f as any).sucursal?.nombre ?? sucursalNombreFromCache(qc),
        empresaNombreComercial: empresa.razonSocial ?? empresa.nombre,
        empresaRnc: empresa.rnc, empresaDireccion: empresa.direccion, empresaTelefono: empresa.telefono,
      };
      let qrDUrl: string | null = null;
      if (f.ecf?.qrUrl && f.ecf?.numero) {
        try { qrDUrl = await QRCode.toDataURL(f.ecf.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }); }
        catch { /* sin QR */ }
      }
      const empConf = (empresa.configuracion ?? {}) as any;
      const html = buildReciboTermicoHTML(sale, qrDUrl, {
        tipoImpresora: empConf.posTipoImpresora,
        mensajeTicket: empConf.posMensajeTicket,
        politicaDev:   empConf.posPoliticaDev,
      });
      if (printWin && !printWin.closed) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
          printWin.addEventListener('afterprint', () => printWin.close(), { once: true });
          setTimeout(() => { try { printWin.close(); } catch { /* noop */ } }, 60_000);
        }, 400);
      } else {
        imprimirReciboTermico(html);
      }
    } catch {
      if (printWin && !printWin.closed) printWin.close();
      message.error('Error al reimprimir');
    }
  };

  // ── Lista de facturas (compartida entre tabs HOY para admin y único view para vendedor)
  const listaFacturas = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.textSub }}>Cargando...</div>
      ) : ventas.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>No hay ventas hoy</div>
      ) : ventas.map((v: any) => (
        <div key={v.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {v.folio} · <span style={{ fontWeight: 400, color: C.textSub }}>{v.cliente?.nombre ?? 'Consumidor Final'}</span>
            </div>
            <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
              {v.createdAt ? dayjs(v.createdAt).format('HH:mm') : '—'} · {v.metodoPago ?? v.tipoPago ?? 'Efectivo'}
              {v.tipoNcf ? ` · ${v.tipoNcf}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{fmt2(Number(v.total ?? 0))}</div>
            <div style={{ fontSize: 10, color: v.estado === 'pagada' ? C.green : C.orange, fontWeight: 600, marginTop: 2 }}>{v.estado?.toUpperCase()}</div>
          </div>
          <button onClick={() => handleReimprimir(v.id, v.folio)} title="Reimprimir recibo"
            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border2}`,
              background: C.card, color: C.textSub, cursor: 'pointer', fontSize: 14, outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🖨
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', fontSize: 18, outline: 'none', lineHeight: 1, padding: 0 }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{esAdmin ? 'Ganancias de Hoy' : 'Ventas de Hoy'}</div>
          <div style={{ fontSize: 11, color: C.textSub }}>{dayjs().format('DD/MM/YYYY')}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.textSub }}>Total acumulado</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{fmt2(totalDia)}</div>
        </div>
      </div>

      {/* Tabs — solo para admin/contador */}
      {esAdmin && (
        <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
          <Segmented
            value={tab}
            onChange={v => setTab(v as 'hoy' | 'historial')}
            options={[{ label: '📊 Hoy', value: 'hoy' }, { label: '📅 Historial', value: 'historial' }]}
            block
            size="small"
            style={{ marginBottom: 8 }}
          />
        </div>
      )}

      {/* ── Tab HOY (admin: desglose de ganancias + lista) ── */}
      {(!esAdmin || tab === 'hoy') && (
        <>
          {/* Desglose de ganancias (solo admin/contador) */}
          {esAdmin && (
            <div style={{ padding: '10px 16px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
              {ganLoading ? (
                <div style={{ textAlign: 'center', color: C.textSub, fontSize: 12 }}>Calculando...</div>
              ) : (
                <>
                  {/* Tarjeta ganancia neta */}
                  <div style={{ background: C.totalsBg, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.textSub, marginBottom: 2 }}>Ganancia neta estimada</div>
                    <div style={{ fontSize: 22, fontWeight: 800,
                      color: (ganData?.gananciaNeta ?? 0) >= 0 ? C.green : C.red }}>
                      {fmt2(ganData?.gananciaNeta ?? 0)}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                      Margen: {pct(ganData?.gananciaNeta ?? 0, ganData?.totalVentas ?? 0)}
                    </div>
                  </div>
                  {/* Desglose */}
                  {[
                    { label: 'Ventas (neto s/ITBIS)', val: ganData?.totalVentas ?? 0, color: C.blue },
                    { label: '− Costo productos',     val: -(ganData?.totalCosto ?? 0), color: C.red },
                    { label: '− Gastos del día',      val: -(ganData?.totalGastos ?? 0), color: C.red },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: C.textSub }}>{row.label}</span>
                      <span style={{ fontWeight: 600, color: row.color }}>{fmt2(Math.abs(row.val))}</span>
                    </div>
                  ))}
                  {/* Advertencia productos sin costo */}
                  {ganData?.gananciaEsParcial && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: C === darkC ? 'rgba(234,179,8,0.12)' : '#fef9c3',
                      borderRadius: 8, border: `1px solid ${C.orange}`, fontSize: 11, color: C.orange }}>
                      ⚠️ {ganData.advertencia}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {listaFacturas}
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => { refetch(); esAdmin && ganRefetch(); }}
              style={{ width: '100%', height: 36, borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.textSub, cursor: 'pointer', fontSize: 13, outline: 'none' }}>
              🔄 Actualizar
            </button>
          </div>
        </>
      )}

      {/* ── Tab HISTORIAL (solo admin/contador) ── */}
      {esAdmin && tab === 'historial' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {histLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textSub }}>Cargando historial...</div>
            ) : !histData || histData.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Sin datos en los últimos 30 días</div>
            ) : (histData as any[]).map((d: any) => {
              const positiva = d.gananciaNeta >= 0;
              return (
                <div key={d.dia} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                      {dayjs(d.dia).format('DD MMM YYYY')}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: positiva ? C.green : C.red }}>
                      {positiva ? '' : '−'}{fmt2(Math.abs(d.gananciaNeta))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.textSub }}>
                    <span>Ventas {fmt2(d.ventas)}</span>
                    <span>Costo {fmt2(d.costo)}</span>
                    <span>Gastos {fmt2(d.gastos)}</span>
                    <span>{d.facturas} fact.</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => histRefetch()}
              style={{ width: '100%', height: 36, borderRadius: 8, border: `1px solid ${C.border2}`, background: C.card, color: C.textSub, cursor: 'pointer', fontSize: 13, outline: 'none' }}>
              🔄 Actualizar historial
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Recibo térmico de gasto ──────────────────────────────────────────────────
function buildGastoReciboHTML(
  g: any,
  empresaNombre: string,
  empresaRnc: string,
  cajero: string,
  sucursalNombre?: string,
  qrDataUrl?: string | null,
  tipoImpresora?: string,
): string {
  const IMP_CFG: Record<string,{width:string;fontSize:string;paddingLR:string}> = {
    '58mm':    { width:'58mm',  fontSize:'10pt', paddingLR:'3mm' },
    '80mm':    { width:'80mm',  fontSize:'11pt', paddingLR:'5mm' },
    'carta':   { width:'210mm', fontSize:'12pt', paddingLR:'15mm' },
    'ninguna': { width:'80mm',  fontSize:'11pt', paddingLR:'5mm' },
  };
  const prn = IMP_CFG[tipoImpresora ?? '80mm'] ?? IMP_CFG['80mm'];
  const e    = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtM = (n: number) => `RD$${Number(n??0).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const ahora = dayjs();
  const row   = (l: string, v: string) => `<div class="row"><span>${e(l)}</span><span>${e(v)}</span></div>`;
  const rowB  = (l: string, v: string) => `<div class="row bold"><span>${e(l)}</span><span>${e(v)}</span></div>`;
  const numGasto = `GAS-${String(g.id??0).padStart(5,'0')}`;
  const catLabel = (g.categoria??'').replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase());
  const qrW = tipoImpresora === '58mm' ? 28 : 34;

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Gasto ${e(numGasto)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word}
@media print{@page{size:${prn.width} auto;margin:0}}
html,body{width:${prn.width};margin:0}
body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
  width:${prn.width};padding:3mm ${prn.paddingLR};color:#000;background:#fff;
  -webkit-font-smoothing:none;font-smooth:never}
.center{text-align:center}
.bold{font-weight:900}
.large{font-size:1.15em;font-weight:900}
.small{font-size:0.85em}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0;width:100%}
.row span:first-child{flex:1;overflow:hidden}
.row span:last-child{text-align:right;white-space:nowrap}
.line{border-top:1px dashed #000;margin:4px 0}
.dbl{border-top:2px solid #000;margin:4px 0}
</style></head><body>

<div class="center large">${e(empresaNombre)}</div>
${empresaRnc ? `<div class="center small">RNC: ${e(empresaRnc)}</div>` : ''}
<div class="dbl"></div>
<div class="center bold">COMPROBANTE DE GASTO</div>
<div class="dbl"></div>

${row('No.:',    numGasto)}
${row('Fecha:',  g.fecha ? String(g.fecha).substring(0,10) : ahora.format('DD/MM/YYYY'))}
${row('Hora:',   ahora.format('hh:mm a'))}
${cajero ? row('Cajero:', cajero) : ''}
${sucursalNombre ? row('Sucursal:', sucursalNombre) : ''}
<div class="line"></div>

<div style="margin:2px 0"><span class="bold">Descripción:</span> ${e(g.descripcion??'')}</div>
<div style="margin:2px 0"><span class="bold">Categoría:</span> ${e(catLabel)}</div>
<div class="line"></div>

${g.proveedor    ? row('Proveedor:',    g.proveedor)    : ''}
${g.rncProveedor ? row('RNC Prov.:',    g.rncProveedor) : ''}
${g.comprobante  ? row('NCF recibido:', g.comprobante)  : ''}
${(g.proveedor||g.rncProveedor||g.comprobante) ? '<div class="line"></div>' : ''}

${row('Monto:', fmtM(Number(g.monto??0)))}
${row('ITBIS:', fmtM(Number(g.itbis??0)))}
<div class="dbl"></div>
${rowB('TOTAL:', fmtM(Number(g.total??0)))}
<div class="dbl"></div>
${g.ecfNumero ? `<div class="center bold small">&#8212; COMPROBANTE FISCAL &#8212;</div>
${row('e-NCF E43:', g.ecfNumero)}
${g.ecfFecha           ? row('Fecha ECF:',  g.ecfFecha)          : ''}
${g.ecfCodigoSeguridad ? row('Cód. Seg.:',  g.ecfCodigoSeguridad): ''}
${qrDataUrl ? `<div class="center" style="margin:4px 0"><img src="${qrDataUrl}" style="width:${qrW}mm;height:${qrW}mm"></div>` : ''}
<div class="dbl"></div>` : ''}
<div class="center small">Registrado en HiCloud ERP</div>

</body></html>`;
}

// ── Panel Gastos (formulario completo igual que módulo admin) ─────────────────
function POSGastosPanel({ C, onVolver }: { C: Palette; onVolver: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const sucursalActual = useAuthStore(s => s.sucursalActual);
  const [showForm,    setShowForm]    = useState(false);
  const [busq,        setBusq]        = useState('');
  const [imprimiendo, setImprimiendo] = useState<number|null>(null);
  const [f, setF] = useState({
    fecha: dayjs().format('YYYY-MM-DD'),
    categoria: '', descripcion: '', monto: '',
    itbis: '', proveedor: '', rncProveedor: '', comprobante: '',
  });

  // Categorías desde la misma API que el módulo admin
  const { data: categorias = [] } = useQuery<any[]>({
    queryKey: ['gasto-cats'],
    queryFn: () => api.get('/gastos/categorias').then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
    enabled: showForm,
  });

  const { data: gastos = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['pos-gastos', busq, sucursalActual],
    queryFn: () => api.get(`/gastos?limit=30${busq ? `&search=${encodeURIComponent(busq)}` : ''}`)
      .then(r => { const d = r.data?.data ?? r.data; return d?.data ?? d ?? []; }),
    staleTime: 30_000,
  });

  const catInfo   = (categorias as any[]).find((c: any) => c.value === f.categoria);
  const generaE43 = catInfo?.generaE43 === true;

  const imprimirGasto = async (g: any) => {
    setImprimiendo(g.id);
    try {
      const empRes   = await api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({}));
      const empConf  = (empRes.configuracion ?? {}) as any;
      const tipoImp  = empConf.posTipoImpresora as string | undefined;
      const qrW      = tipoImp === '58mm' ? 160 : 200;

      let qrDataUrl: string | null = null;
      if (g.ecfNumero) {
        // Preferir el qrUrl oficial devuelto por la DGII al emitir el e-CF;
        // si no existe (e-CF antiguo), construir el URL de consulta manualmente.
        const urlQR = g.ecfQrUrl
          ?? (`https://ecf.dgii.gov.do/ECF/ConsultaResultado?RNCEmisor=${encodeURIComponent(empRes.rnc ?? '')}&eNCF=${encodeURIComponent(g.ecfNumero)}`
             + (g.ecfCodigoSeguridad ? `&CodigoSeguridadNCF=${encodeURIComponent(g.ecfCodigoSeguridad)}` : ''));
        qrDataUrl = await QRCode.toDataURL(urlQR, { width: qrW, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
          .catch(() => null);
      }

      const html = buildGastoReciboHTML(
        g,
        empRes.razonSocial ?? empRes.nombre ?? 'Mi Empresa',
        empRes.rnc ?? '',
        user?.nombre ?? localStorage.getItem('pos_cajero_nombre') ?? '',
        sucursalNombreFromCache(qc),
        qrDataUrl,
        tipoImp,
      );
      imprimirReciboTermico(html);
    } catch (err: any) {
      message.error(`Error al imprimir: ${err?.message}`, 2);
    } finally {
      setImprimiendo(null);
    }
  };

  const crearMut = useMutation({
    mutationFn: () => {
      const monto = Number(f.monto);
      const itbis = f.itbis ? Number(f.itbis) : 0;
      return api.post('/gastos', {
        fecha:        f.fecha,
        categoria:    f.categoria,
        descripcion:  f.descripcion.trim(),
        monto,
        itbis,
        proveedor:    f.proveedor  || undefined,
        rncProveedor: f.rncProveedor || undefined,
        comprobante:  f.comprobante  || undefined,
      });
    },
    onSuccess: () => {
      message.success('Gasto registrado ✓');
      qc.invalidateQueries({ queryKey: ['pos-gastos'] });
      qc.invalidateQueries({ queryKey: ['gastos'] });
      refetch();
      setShowForm(false);
      setF({ fecha: dayjs().format('YYYY-MM-DD'), categoria:'', descripcion:'', monto:'', itbis:'', proveedor:'', rncProveedor:'', comprobante:'' });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar gasto'),
  });

  const inp = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const inputS: React.CSSProperties = { width:'100%', height:36, padding:'0 10px', borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.text, fontSize:13, outline:'none', boxSizing:'border-box' };
  const labelS: React.CSSProperties = { fontSize:11, fontWeight:700, color:C.textSub, display:'block', marginBottom:3 };
  const canSubmit = f.categoria && f.descripcion.trim() && Number(f.monto) > 0;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <PanelHeader title="Gastos" icon="💸" C={C} onVolver={onVolver}
        onNuevo={() => setShowForm(v => !v)} labelNuevo={showForm ? 'Ver lista' : 'Registrar gasto'} />

      {showForm ? (
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ maxWidth:480, color:C.text }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {/* Fecha */}
              <div>
                <span style={labelS}>Fecha *</span>
                <input type="date" value={f.fecha} onChange={inp('fecha')} style={inputS} />
              </div>
              {/* Categoría */}
              <div>
                <span style={labelS}>Categoría *</span>
                <select value={f.categoria} onChange={e => setF(p => ({ ...p, categoria: e.target.value }))}
                  style={{ ...inputS, appearance:'auto' as any }}>
                  <option value="">Seleccionar...</option>
                  {(categorias as any[]).map((c: any) => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Descripción */}
            <div style={{ marginBottom:10 }}>
              <span style={labelS}>Descripción *</span>
              <input value={f.descripcion} onChange={inp('descripcion')} placeholder="Descripción del gasto"
                style={inputS} maxLength={300} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {/* Monto */}
              <div>
                <span style={labelS}>Monto RD$ *</span>
                <input type="number" value={f.monto} onChange={inp('monto')} placeholder="0.00"
                  min="0" step="0.01" style={{ ...inputS, textAlign:'right' }} />
              </div>
              {/* ITBIS */}
              {!generaE43 && (
                <div>
                  <span style={labelS}>ITBIS RD$ <span style={{ fontWeight:400, color:C.textSub }}>(opcional)</span></span>
                  <input type="number" value={f.itbis} onChange={inp('itbis')} placeholder="0.00"
                    min="0" step="0.01" style={{ ...inputS, textAlign:'right' }} />
                </div>
              )}
            </div>

            {!generaE43 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <span style={labelS}>Proveedor</span>
                  <input value={f.proveedor} onChange={inp('proveedor')} placeholder="Nombre del proveedor" style={inputS} />
                </div>
                <div>
                  <span style={labelS}>RNC Proveedor</span>
                  <input value={f.rncProveedor} onChange={inp('rncProveedor')} placeholder="9 dígitos"
                    maxLength={9} style={inputS} />
                </div>
              </div>
            )}

            <div style={{ marginBottom:14 }}>
              <span style={labelS}>{generaE43 ? 'Referencia' : 'No. Comprobante (NCF recibido)'}</span>
              <input value={f.comprobante} onChange={inp('comprobante')}
                placeholder={generaE43 ? 'Referencia o número' : 'E310000000001 o referencia'}
                style={inputS} />
            </div>

            {generaE43 && (
              <div style={{ background: C.blue + '15', border:`1px solid ${C.blue}30`, borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, color:C.blue }}>
                💡 Esta categoría genera un e-CF E43 (Gastos Menores) automáticamente.
              </div>
            )}

            <button onClick={() => crearMut.mutate()} disabled={crearMut.isPending || !canSubmit}
              style={{ width:'100%', height:44, borderRadius:10, border:'none',
                background: !canSubmit ? '#ccc' : '#DC2626', color:'#fff',
                fontWeight:700, fontSize:15, cursor: !canSubmit ? 'not-allowed' : 'pointer' }}>
              {crearMut.isPending ? 'Registrando...' : 'Registrar gasto'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.border}` }}>
            <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar gasto..."
              style={{ width:'100%', height:34, padding:'0 12px', background:C.card,
                border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:12, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin' }}>
            {isLoading ? <div style={{ textAlign:'center', padding:40 }}><Spin/></div>
             : (gastos.length === 0 ? <Empty style={{ marginTop:40 }} description={<span style={{ color:C.textSub }}>Sin gastos registrados</span>} />
             : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:C.card, position:'sticky', top:0 }}>
                  {['Descripción','Categoría','Total','Fecha',''].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:C.textSub, fontWeight:600, fontSize:11, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{gastos.map((g: any, i: number) => (
                  <tr key={g.id} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?'transparent':C.card }}>
                    <td style={{ padding:'8px 12px', color:C.text }}>{g.descripcion}</td>
                    <td style={{ padding:'8px 12px', color:C.textSub, fontSize:11 }}>{g.categoria?.replace(/_/g,' ')}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, color:C.red }}>{fmt.money(g.total??0)}</td>
                    <td style={{ padding:'8px 12px', color:C.textSub, fontSize:11 }}>{g.fecha?.substring(0,10)??'—'}</td>
                    <td style={{ padding:'6px 8px', textAlign:'right' }}>
                      <button onClick={() => imprimirGasto(g)} title="Imprimir recibo"
                        disabled={imprimiendo === g.id}
                        style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6,
                          color: imprimiendo===g.id ? C.textMuted : C.textSub,
                          padding:'3px 8px', fontSize:14, cursor:'pointer', outline:'none' }}>
                        {imprimiendo === g.id ? '⏳' : '🖨'}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function POSCierreCajaPanel({ C, onVolver }: { C: Palette; onVolver: () => void }) {
  const qc = useQueryClient();
  const [nota,     setNota]     = useState('');
  const [billetes, setBilletes] = useState<Record<number,number>>({});
  const [pago, setPago] = useState<DesglosePago>({
    efectivo:'', tarjetaCredito:'', tarjetaDebito:'',
    cheque:'', transferencia:'', otro:'', deposito:'', documentos:'',
  });
  const [imprimiendoCierre, setImprimiendoCierre] = useState(false);

  const totalBilletes   = BILLETES_RD.reduce((s,b) => s + (billetes[b]??0)*b, 0);
  const totalDesglosePago = Object.values(pago).reduce((s,v) => s + (Number(v)||0), 0);
  const totalFisico     = totalBilletes || totalDesglosePago;

  const { data: cajaHoy, isLoading } = useQuery<any>({
    queryKey: ['pos-caja-hoy'],
    queryFn:  () => {
      // Usar vendedorId del turno activo para obtener la caja correcta
      const vid = localStorage.getItem('pos_vendedor_id');
      const url = vid ? `/caja/hoy?vendedorId=${vid}` : '/caja/hoy';
      return api.get(url).then(r => {
        const d = r.data?.data ?? r.data;
        // GET /caja/hoy?vendedorId=X → objeto único o { estado:'sin_apertura' }
        // GET /caja/hoy             → { cajas:[...], totalCajas:N }
        if (d?.cajas) return d.cajas.find((c:any) => c.estado === 'abierta') ?? null;
        if (Array.isArray(d)) return d.find((c:any) => c.estado === 'abierta') ?? null;
        return d?.estado === 'sin_apertura' ? null : d;
      });
    },
    staleTime:            0,
    refetchOnWindowFocus: true,
  });

  // Auto-llenar efectivo del desglose con ventas en efectivo
  useEffect(() => {
    if (cajaHoy?.ventasEfectivo) {
      const ef = Number(cajaHoy.ventasEfectivo) + Number(cajaHoy.saldoApertura ?? 0);
      setPago(p => ({ ...p, efectivo: ef.toFixed(2) }));
    }
  }, [cajaHoy?.id]);

  const cerrarMut = useMutation({
    mutationFn: () => {
      const id = cajaHoy?.id;
      if (!id) throw new Error('No hay caja abierta');
      return api.patch(`/caja/${id}/cerrar`, {
        saldoFisico:       totalFisico,
        notas:             nota || undefined,   // DTO espera 'notas' (plural)
        desgloseBilletes:  billetes,
        desglosePago:      pago,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-caja-hoy'] });
      message.success('¡Caja cerrada exitosamente!');
      onVolver();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cerrar caja'),
  });

  const m = (v: any) => fmt.money(Number(v ?? 0));
  const setBillete = (b: number, val: string) => setBilletes(p => ({ ...p, [b]: Number(val)||0 }));
  const setPagoKey = (k: keyof DesglosePago) => (v: string) => setPago(p => ({ ...p, [k]: v }));

  // Operaciones calculadas
  const vendidoContado  = Number(cajaHoy?.ventasEfectivo ?? 0);
  const vendidoCredito  = Number(cajaHoy?.ventasTarjeta ?? 0) + Number(cajaHoy?.ventasTransferencia ?? 0);
  const totalVendido    = vendidoContado + vendidoCredito;
  const totalRecibos    = Number(cajaHoy?.cobrosRecibidos ?? 0);
  const efectivoInicial = Number(cajaHoy?.saldoApertura ?? 0);
  const efectivoEnCaja  = efectivoInicial + vendidoContado + totalRecibos;

  const grid3: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 };

  const handleImprimirCierre = async () => {
    if (!cajaHoy) return;
    setImprimiendoCierre(true);
    try {
      const empRes = await api.get('/configuracion/empresa')
        .then(r => r.data?.data ?? r.data)
        .catch(() => ({}));
      const empConf = (empRes.configuracion ?? {}) as any;
      imprimirReciboTermico(buildCierreCajaHTML({
        empresa:  { nombre: empRes.razonSocial ?? empRes.nombre, rnc: empRes.rnc, direccion: empRes.direccion, telefono: empRes.telefono },
        caja:     { id: cajaHoy.id, numero: cajaHoy.numero, fecha: cajaHoy.fecha, vendedorNombre: cajaHoy.vendedorNombre, cantidadTransacciones: cajaHoy.cantidadTransacciones },
        ops:      { efectivoInicial, vendidoContado, vendidoCredito, totalVendido, totalRecibos, totalAnticipos: Number(cajaHoy.totalAnticipos ?? 0), gastosEfectivo: Number(cajaHoy.gastosEfectivo ?? 0), efectivoEnCaja },
        billetes: Object.fromEntries(Object.entries(billetes).map(([k,v]) => [k, Number(v)])),
        pago,
        totalBilletes,
        totalFisico,
        nota:     nota || undefined,
        tipoImpresora: empConf.posTipoImpresora,
      }));
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al imprimir cierre');
    } finally {
      setImprimiendoCierre(false);
    }
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <PanelHeader title="Cierre de Caja" icon="🏧" C={C} onVolver={onVolver} />
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
        {isLoading ? <div style={{textAlign:'center',padding:40}}><Spin/></div> :
        !cajaHoy || cajaHoy.estado !== 'abierta' ? (
          <div style={{ textAlign:'center', padding:40, color:C.textSub }}>
            No hay caja abierta hoy
          </div>
        ) : (
        <div style={{ maxWidth:560, color:C.text }}>

          {/* ID de caja + billetes */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <div style={{ background:C.card, border:`1px solid ${C.border2}`, borderRadius:8,
              padding:'6px 14px', fontSize:13, fontWeight:700 }}>
              {cajaHoy.numero ?? `Caja #${cajaHoy.id}`}
            </div>
            {BILLETES_RD.slice(0,5).map(b => (
              <input key={b} type="number" min="0" value={billetes[b]??''}
                onChange={e=>setBillete(b,e.target.value)}
                title={`Billetes de ${b}`}
                style={{ width:50, height:32, textAlign:'center', borderRadius:6,
                  border:'1px solid #ddd', fontSize:12, outline:'none' }} />
            ))}
          </div>

          {/* Desglose de Operaciones */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Desglose de Operaciones</div>
            <div style={grid3}>
              <CierreField label="Efectivo Inicial"  value={m(efectivoInicial)} />
              <CierreField label="Vendido Contado"   value={m(vendidoContado)} />
              <CierreField label="Vendido Crédito"   value={m(vendidoCredito)} />
            </div>
            <div style={grid3}>
              <CierreField label="Total Vendido"     value={m(totalVendido)} highlight />
              <CierreField label="Total Recibos"     value={m(totalRecibos)} />
              <CierreField label="Total Anticipos"   value={m(cajaHoy.totalAnticipos ?? 0)} />
            </div>
            <div style={grid3}>
              <CierreField label="Total Dev. y Des"  value={m(cajaHoy.gastosEfectivo ?? 0)} />
              <CierreField label="Total NC. Aplicadas" value="0.00" />
              <CierreField label="Efectivo en Caja"  value={m(efectivoEnCaja)} highlight />
            </div>
          </div>

          {/* Desglose de Billetes */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:10 }}>Desglose de Billetes</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:8 }}>
              {BILLETES_RD.slice(0,6).map(b => (
                <div key={b} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:C.textSub, marginBottom:3 }}>{b.toLocaleString()}</div>
                  <input type="number" min="0" value={billetes[b]??''}
                    onChange={e=>setBillete(b,e.target.value)}
                    style={{ width:'100%', height:34, textAlign:'center', borderRadius:6,
                      border:'1px solid #ddd', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
              {BILLETES_RD.slice(6).map(b => (
                <div key={b} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:C.textSub, marginBottom:3 }}>{b}</div>
                  <input type="number" min="0" value={billetes[b]??''}
                    onChange={e=>setBillete(b,e.target.value)}
                    style={{ width:'100%', height:34, textAlign:'center', borderRadius:6,
                      border:'1px solid #ddd', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            {totalBilletes > 0 && (
              <div style={{ textAlign:'right', marginTop:8, fontSize:12, color:C.green, fontWeight:700 }}>
                Total billetes: {fmt.money(totalBilletes)}
              </div>
            )}
          </div>

          {/* Desglose de Pago */}
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>Desglose de Pago</div>
            <div style={grid3}>
              <CierreField label="Efectivo"        value={pago.efectivo}        editable onChange={setPagoKey('efectivo')} />
              <CierreField label="Tarjeta Crédito" value={pago.tarjetaCredito}  editable onChange={setPagoKey('tarjetaCredito')} />
              <CierreField label="Tarjeta Débito"  value={pago.tarjetaDebito}   editable onChange={setPagoKey('tarjetaDebito')} />
            </div>
            <div style={grid3}>
              <CierreField label="Cheque"          value={pago.cheque}          editable onChange={setPagoKey('cheque')} />
              <CierreField label="Transferencia"   value={pago.transferencia}   editable onChange={setPagoKey('transferencia')} />
              <CierreField label="Otro"            value={pago.otro}            editable onChange={setPagoKey('otro')} />
            </div>
            <div style={grid3}>
              <CierreField label="Depósito"        value={pago.deposito}        editable onChange={setPagoKey('deposito')} />
              <CierreField label="Documentos"      value={pago.documentos}      editable onChange={setPagoKey('documentos')} />
              <CierreField label="Efectivo en Sistema" value={m(totalDesglosePago)} highlight />
            </div>
          </div>

          {/* Nota */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Nota de cierre</div>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Nota de cierre..."
              rows={2} style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #ddd',
                fontSize:13, resize:'vertical', outline:'none', boxSizing:'border-box', background:'#fff' }} />
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleImprimirCierre} disabled={imprimiendoCierre}
              style={{ height:46, padding:'0 18px', borderRadius:10,
                border:`1px solid ${C.border}`, background:'transparent',
                color:C.text, fontWeight:700, fontSize:15, cursor: imprimiendoCierre ? 'not-allowed' : 'pointer',
                whiteSpace:'nowrap' }}>
              {imprimiendoCierre ? '…' : '🖨 Imprimir'}
            </button>
            <button onClick={() => cerrarMut.mutate()} disabled={cerrarMut.isPending}
              style={{ flex:1, height:46, borderRadius:10, border:'none',
                background:'#059669', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer' }}>
              {cerrarMut.isPending ? 'Cerrando...' : 'Grabar'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// ── Paneles inline del POS ────────────────────────────────────────────────────

const PANEL_TITLES: Record<PanelId, { label: string; icon: string }> = {
  'items':          { label: 'Ítems',            icon: '🛒' },
  'inventario':     { label: 'Inventario',        icon: '📦' },
  'facturas':       { label: 'Facturas',          icon: '📄' },
  'pre-facturas':   { label: 'Pre-Facturas',      icon: '📋' },
  'cotizaciones':   { label: 'Cotizaciones',      icon: '💬' },
  'conduce':        { label: 'Conduces',          icon: '🚚' },
  'despacho':       { label: 'Despacho',          icon: '📦' },
  'clientes':       { label: 'Clientes',          icon: '👤' },
  'recibos-cobro':  { label: 'Recibos de Cobro',  icon: '🧾' },
  'anticipos':      { label: 'Anticipos',          icon: '💰' },
  'notas-credito':  { label: 'Notas de Crédito',  icon: '📝' },
  'gastos':         { label: 'Gastos',            icon: '💸' },
  'cierre-caja':    { label: 'Cierre de Caja',    icon: '🏧' },
  'ventas-hoy':     { label: 'Ganancias',           icon: '📈' },
  'pro-formas':     { label: 'Pro Formas',         icon: '📋' },
  'compras':        { label: 'Órdenes de Compra',  icon: '🛍️' },
};

function POSPanel({ panel, palette, onVolver, confirmarAnulacion, permitirAnularFacturas, tiempoLimiteAnular, requireSupervisor, supervisorActive, requireSupervisorForced }: {
  panel:              PanelId;
  palette:            Palette;
  onVolver:           () => void;
  confirmarAnulacion?:     boolean;
  permitirAnularFacturas?: boolean;
  tiempoLimiteAnular?:     number;
  requireSupervisor?:      (action: string, detail?: string) => Promise<boolean>;
  supervisorActive?:       boolean;
  requireSupervisorForced?: (action: string, detail?: string) => Promise<boolean>;
}) {
  const C  = palette;
  const qc = useQueryClient();
  const [busq,          setBusq]          = useState('');
  const [anulando,      setAnulando]      = useState<number | null>(null);
  const [imprimiendo,   setImprimiendo]   = useState<number | null>(null);
  const [cambEstado,    setCambEstado]    = useState<number | null>(null);
  const [cobrarPF,      setCobrarPF]      = useState<{ id: number; folio: string; total: number; cliente: string } | null>(null);
  const [cobrarPFMetodo, setCobrarPFMetodo] = useState<string>('Efectivo');
  const [cobrarPFMonto,  setCobrarPFMonto]  = useState<string>('');
  const [cobrarCot,      setCobrarCot]      = useState<{ id: number; numero: string; total: number; cliente: string } | null>(null);
  const [cobrarCotMetodo, setCobrarCotMetodo] = useState<string>('Efectivo');
  const [cobrarCotMonto,  setCobrarCotMonto]  = useState<string>('');
  const [genericDoc,     setGenericDoc]     = useState<GenericDocData | null>(null);
  const PANEL_GENERIC_ID  = 'hc-pos-panel-generic';

  // Imprimir documento genérico (cotización, conduce, etc.)
  useEffect(() => {
    if (!genericDoc) return;
    const t = setTimeout(() => {
      imprimirElemento(PANEL_GENERIC_ID, '80mm auto');
      setTimeout(() => setGenericDoc(null), 2000);
    }, 150);
    return () => clearTimeout(t);
  }, [genericDoc]);

  // ── Endpoints de anulación por módulo ──────────────────────────────
  const anularMutation = useMutation({
    mutationFn: async ({ id, mod }: { id: number; mod: string }) => {
      // FIX 2: usar 'cancelada' (valor correcto del enum FacturaEstado)
      if (mod === 'facturas')        return api.patch(`/facturas/${id}/estado`, { estado: 'cancelada' });
      if (mod === 'cotizaciones')    return api.patch(`/cotizaciones/${id}/estado`, { estado: 'rechazada' });
      if (mod === 'pre-facturas')    return api.patch(`/pre-facturas/${id}/rechazar`);
      if (mod === 'conduce' || mod === 'despacho') return api.delete(`/conduces/${id}`);
      if (mod === 'notas-credito')   return api.patch(`/notas-credito/${id}/anular`);
      if (mod === 'gastos')          return api.delete(`/gastos/${id}`);
      if (mod === 'pro-formas')      return api.delete(`/pro-formas/${id}`);
      throw new Error('Módulo no soporta anulación');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-panel', panel] }); qc.refetchQueries({ queryKey: ['pos-panel', panel] });
      message.success('Registro anulado');
      setAnulando(null);
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? 'No se pudo anular');
      setAnulando(null);
    },
  });

  // ── Cobrar Pre-Factura desde POS ─────────────────────────────────────────────
  const cobrarPFMut = useMutation({
    mutationFn: async ({ id, metodoPago }: { id: number; metodoPago: string }) =>
      api.post(`/pre-facturas/${id}/cobrar-pos`, { metodoPago }).then(r => r.data?.data ?? r.data),
    onSuccess: async (data: { facturaId: number; folio: string }) => {
      message.success(`Factura ${data.folio} generada`);
      setCobrarPF(null); setCobrarPFMonto(''); setCobrarPFMetodo('Efectivo');
      qc.invalidateQueries({ queryKey: ['pos-panel', 'pre-facturas'] });
      qc.refetchQueries({    queryKey: ['pos-panel', 'pre-facturas'] });
      qc.invalidateQueries({ queryKey: ['pos-panel', 'facturas'] });
      // Imprimir recibo de la factura generada
      if (data.facturaId) {
        try {
          const empRes = await api.get('/configuracion/empresa').then(x => x.data?.data ?? x.data).catch(() => ({}));
          const f = await api.get(`/facturas/${data.facturaId}`).then(r => r.data?.data ?? r.data);
          const metodo = f.notas?.includes('Tarjeta') ? 'tarjeta' : f.notas?.includes('Transferencia') ? 'transferencia' : 'efectivo';
          const saleObj: Sale = {
            folio: f.folio, total: Number(f.total ?? 0), cambio: 0, metodo,
            items: (f.detalles ?? []).map((d: any) => ({
              produto: { id: d.productoId, nombre: d.descripcion, precio: Number(d.precioUnitario), stock: 999, porcentajeIva: Number(d.porcentajeIva ?? 18), codigo: '', categoria: '', unidadMedida: '' } as any,
              cantidad: Number(d.cantidad), precio: Number(d.precioUnitario), descuentoMonto: 0,
            })),
            cliente: f.cliente?.nombre, iva: Number(f.iva ?? 0), subtotal: Number(f.subtotal ?? 0),
            facturaId: f.id, tipoNcf: f.tipoNcf ?? 'E32',
            encf: f.ecf?.numero, ecfPendiente: !f.ecf?.numero,
            securityCode: f.ecf?.codigoSeguridad, qrUrl: f.ecf?.qrUrl,
            rncComprador: f.cliente?.rncReceptor || f.cliente?.rfc, razonSocial: f.cliente?.nombre,
            cajero: f.usuario?.nombre, sucursalNombre: (f as any).sucursal?.nombre ?? sucursalNombreFromCache(qc),
            empresaNombreComercial: empRes.razonSocial ?? empRes.nombre, empresaRnc: empRes.rnc,
            empresaDireccion: empRes.direccion, empresaTelefono: empRes.telefono,
          };
          let qrDUrl: string | null = null;
          if (f.ecf?.qrUrl && f.ecf?.numero) {
            try { qrDUrl = await QRCode.toDataURL(f.ecf.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }); }
            catch { /* sin QR */ }
          }
          const empConf = (empRes.configuracion ?? {}) as any;
          imprimirReciboTermico(buildReciboTermicoHTML(saleObj, qrDUrl, {
            tipoImpresora: empConf.posTipoImpresora,
            mensajeTicket: empConf.posMensajeTicket,
            politicaDev:   empConf.posPoliticaDev,
          }));
        } catch { /* error de impresión no bloquea */ }
      }
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? 'Error al cobrar pre-factura');
    },
  });

  // ── Cobrar Cotización desde POS ───────────────────────────────────────────────
  const cobrarCotMut = useMutation({
    mutationFn: async ({ id, metodoPago }: { id: number; metodoPago: string }) =>
      api.post(`/cotizaciones/${id}/cobrar-pos`, { metodoPago }).then(r => r.data?.data ?? r.data),
    onSuccess: async (data: { facturaId: number; folio: string }) => {
      message.success(`Factura ${data.folio} generada`);
      setCobrarCot(null); setCobrarCotMonto(''); setCobrarCotMetodo('Efectivo');
      qc.invalidateQueries({ queryKey: ['pos-panel', 'cotizaciones'] });
      qc.refetchQueries({    queryKey: ['pos-panel', 'cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['pos-panel', 'facturas'] });
      if (data.facturaId) {
        try {
          const empRes = await api.get('/configuracion/empresa').then(x => x.data?.data ?? x.data).catch(() => ({}));
          const f = await api.get(`/facturas/${data.facturaId}`).then(r => r.data?.data ?? r.data);
          const metodo = f.notas?.includes('Tarjeta') ? 'tarjeta' : f.notas?.includes('Transferencia') ? 'transferencia' : 'efectivo';
          const saleObj: Sale = {
            folio: f.folio, total: Number(f.total ?? 0), cambio: 0, metodo,
            items: (f.detalles ?? []).map((d: any) => ({
              produto: { id: d.productoId, nombre: d.descripcion, precio: Number(d.precioUnitario), stock: 999, porcentajeIva: Number(d.porcentajeIva ?? 18), codigo: '', categoria: '', unidadMedida: '' } as any,
              cantidad: Number(d.cantidad), precio: Number(d.precioUnitario), descuentoMonto: 0,
            })),
            cliente: f.cliente?.nombre, iva: Number(f.iva ?? 0), subtotal: Number(f.subtotal ?? 0),
            facturaId: f.id, tipoNcf: f.tipoNcf ?? 'E32',
            encf: f.ecf?.numero, ecfPendiente: !f.ecf?.numero,
            securityCode: f.ecf?.codigoSeguridad, qrUrl: f.ecf?.qrUrl,
            rncComprador: f.cliente?.rncReceptor || f.cliente?.rfc, razonSocial: f.cliente?.nombre,
            cajero: f.usuario?.nombre, sucursalNombre: (f as any).sucursal?.nombre ?? sucursalNombreFromCache(qc),
            empresaNombreComercial: empRes.razonSocial ?? empRes.nombre, empresaRnc: empRes.rnc,
            empresaDireccion: empRes.direccion, empresaTelefono: empRes.telefono,
          };
          let qrDUrl: string | null = null;
          if (f.ecf?.qrUrl && f.ecf?.numero) {
            try { qrDUrl = await QRCode.toDataURL(f.ecf.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }); }
            catch { /* sin QR */ }
          }
          const empConf = (empRes.configuracion ?? {}) as any;
          imprimirReciboTermico(buildReciboTermicoHTML(saleObj, qrDUrl, {
            tipoImpresora: empConf.posTipoImpresora,
            mensajeTicket: empConf.posMensajeTicket,
            politicaDev:   empConf.posPoliticaDev,
          }));
        } catch { /* error de impresión no bloquea */ }
      }
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? 'Error al cobrar cotización');
    },
  });

  // FIX 3: Cambiar estado de conduce desde el POS
  const cambiarEstadoConduce = useMutation({
    mutationFn: async ({ id, nuevoEstado }: { id: number; nuevoEstado: string }) => {
      const endpoint: Record<string, string> = {
        en_transito: `/conduces/${id}/en-transito`,
        entregado:   `/conduces/${id}/entregado`,
        devuelto:    `/conduces/${id}/devuelto`,
      };
      return api.patch(endpoint[nuevoEstado], {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-panel', panel] });
      qc.refetchQueries({ queryKey: ['pos-panel', panel] });
      message.success('Estado actualizado');
      setCambEstado(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo cambiar el estado'),
  });

  // ── Impresión térmica para TODOS los módulos ───────────────────────
  const handleImprimir = async (id: number, folio: string) => {
    setImprimiendo(id);
    try {
      const empresa = await api.get('/configuracion/empresa')
        .then(x => x.data?.data ?? x.data).catch(() => ({}));
      const empInfo = {
        nombre:    empresa.razonSocial ?? empresa.nombre,
        rnc:       empresa.rnc,
        direccion: empresa.direccion,
        telefono:  empresa.telefono,
      };

      // ── Facturas → recibo estándar del POS (con e-CF y QR) ──────────
      if (panel === 'facturas') {
        const f = await api.get(`/facturas/${id}`).then(r => r.data?.data ?? r.data);
        const sale: Sale = {
          folio:       f.folio, total: Number(f.total??0), cambio: 0,
          metodo:      f.notas?.includes('Tarjeta') ? 'tarjeta' : f.notas?.includes('Transferencia') ? 'transferencia' : 'efectivo',
          items:       (f.detalles??[]).map((d: any) => ({
            produto:   { id: d.productoId, nombre: d.descripcion, precio: Number(d.precioUnitario),
                         stock: 999, porcentajeIva: Number(d.porcentajeIva??18), codigo:'', categoria:'', unidadMedida:'' } as any,
            cantidad: Number(d.cantidad), precio: Number(d.precioUnitario), descuentoMonto: 0,
          })),
          cliente:   f.cliente?.nombre, iva: Number(f.iva??0), subtotal: Number(f.subtotal??0),
          facturaId: f.id, tipoNcf: f.tipoNcf ?? 'E32',
          encf:      f.ecf?.numero, ecfPendiente: !f.ecf?.numero,
          securityCode: f.ecf?.codigoSeguridad, qrUrl: f.ecf?.qrUrl,
          rncComprador: f.cliente?.rncReceptor || f.cliente?.rfc,
          razonSocial:  f.cliente?.nombre,
          cajero: f.usuario?.nombre ?? f.nombreVendedor,
          sucursalNombre: (f as any).sucursal?.nombre ?? sucursalNombreFromCache(qc),
          empresaNombreComercial: empInfo.nombre, empresaRnc: empInfo.rnc,
          empresaDireccion: empInfo.direccion, empresaTelefono: empInfo.telefono,
        };
        // Generar QR antes de construir el HTML
        let qrDUrl: string | null = null;
        if (f.ecf?.qrUrl && f.ecf?.numero) {
          try { qrDUrl = await QRCode.toDataURL(f.ecf.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }); }
          catch { /* sin QR */ }
        }
        const empConfPanel = (empresa.configuracion ?? {}) as any;
        imprimirReciboTermico(buildReciboTermicoHTML(sale, qrDUrl, {
          tipoImpresora: empConfPanel.posTipoImpresora,
          mensajeTicket: empConfPanel.posMensajeTicket,
          politicaDev:   empConfPanel.posPoliticaDev,
        }));
        return;
      }

      // ── Pre-Facturas y Cotizaciones → mismo HTML térmico que facturas (sin ECF) ──
      if (panel === 'pre-facturas' || panel === 'cotizaciones') {
        const ep2 = panel === 'pre-facturas' ? `/pre-facturas/${id}` : `/cotizaciones/${id}`;
        const doc = await api.get(ep2).then(r => r.data?.data ?? r.data);
        const tipoDoc: 'PRE-FACTURA' | 'COTIZACIÓN' = panel === 'pre-facturas' ? 'PRE-FACTURA' : 'COTIZACIÓN';
        const docSale: Sale = {
          folio:                   doc.folio ?? doc.numero ?? folio,
          total:                   Number(doc.total ?? 0),
          cambio:                  0,
          metodo:                  'efectivo',
          items:                   (doc.detalles ?? []).map((d: any) => ({
            produto:   { id: d.productoId ?? 0, nombre: d.descripcion, precio: Number(d.precioUnitario),
                         stock: 999, porcentajeIva: Number(d.porcentajeIva ?? 18),
                         codigo: '', categoria: '', unidadMedida: '' } as any,
            cantidad:  Number(d.cantidad),
            precio:    Number(d.precioUnitario),
            descuentoMonto: 0,
          })),
          iva:                     Number(doc.iva ?? 0),
          subtotal:                Number(doc.subtotal ?? 0),
          rncComprador:            doc.cliente?.rncReceptor ?? doc.cliente?.rfc,
          razonSocial:             doc.cliente?.nombre,
          cajero:                  doc.nombreVendedor ?? doc.vendedorNombre,
          sucursalNombre:          doc.sucursal?.nombre ?? sucursalNombreFromCache(qc),
          empresaNombreComercial:  empInfo.nombre,
          empresaRnc:              empInfo.rnc,
          empresaDireccion:        empInfo.direccion,
          empresaTelefono:         empInfo.telefono,
        };
        const empConfPanel = (empresa.configuracion ?? {}) as any;
        imprimirReciboTermico(buildReciboTermicoHTML(docSale, null, {
          tipoImpresora: empConfPanel.posTipoImpresora,
          tipoDoc,
          validezDias:   doc.validezDias,
        }));
        return;
      }

      // ── Pro Formas → recibo térmico (sin ECF, sin pago) ────────────
      if (panel === 'pro-formas') {
        const doc = await api.get(`/pro-formas/${id}`).then(r => r.data?.data ?? r.data);
        const pfSale: Sale = {
          folio:                   doc.numero ?? folio,
          total:                   Number(doc.total ?? 0),
          cambio:                  0,
          metodo:                  'efectivo',
          items:                   (doc.items ?? []).map((i: any) => ({
            produto:   { id: i.productoId ?? 0, nombre: i.descripcion, precio: Number(i.precio),
                         stock: 999, porcentajeIva: Number(i.porcentajeItbis ?? 18),
                         codigo: '', categoria: '', unidadMedida: '' } as any,
            cantidad:  Number(i.cantidad),
            precio:    Number(i.precio),
            descuentoMonto: 0,
          })),
          iva:                     Number(doc.itbis ?? 0),
          subtotal:                Number(doc.subtotal ?? 0),
          razonSocial:             doc.clienteNombre,
          sucursalNombre:          doc.sucursalNombre ?? sucursalNombreFromCache(qc),
          empresaNombreComercial:  empInfo.nombre,
          empresaRnc:              empInfo.rnc,
          empresaDireccion:        empInfo.direccion,
          empresaTelefono:         empInfo.telefono,
        };
        const empConfPanel = (empresa.configuracion ?? {}) as any;
        imprimirReciboTermico(buildReciboTermicoHTML(pfSale, null, {
          tipoImpresora: empConfPanel.posTipoImpresora,
          tipoDoc:       'PRO-FORMA',
          validezDias:   doc.validezDias,
        }));
        return;
      }

      // ── Notas de Crédito → recibo térmico con datos fiscales E34 ────
      if (panel === 'notas-credito') {
        const doc = await api.get(`/notas-credito/${id}`).then(r => r.data?.data ?? r.data);
        const ncSale: Sale = {
          folio:                  doc.numero ?? folio,
          total:                  Number(doc.total ?? 0),
          cambio:                 0,
          metodo:                 'credito',
          items:                  (doc.detalles ?? []).map((d: any) => ({
            produto:   { id: d.productoId ?? 0, nombre: d.descripcion, precio: Number(d.precioUnitario),
                         stock: 999, porcentajeIva: Number(d.porcentajeIva ?? 18),
                         codigo: '', categoria: '', unidadMedida: '' } as any,
            cantidad:  Number(d.cantidad),
            precio:    Number(d.precioUnitario),
            descuentoMonto: 0,
          })),
          iva:                    Number(doc.iva ?? 0),
          subtotal:               Number(doc.subtotal ?? 0),
          tipoNcf:                'E34',
          encf:                   doc.ecf?.numero ?? undefined,
          ecfPendiente:           !doc.ecf?.numero,
          securityCode:           doc.ecf?.codigoSeguridad,
          qrUrl:                  doc.ecf?.qrUrl ?? null,
          rncComprador:           doc.cliente?.rncReceptor ?? doc.cliente?.rfc,
          razonSocial:            doc.cliente?.nombre,
          facturaOriginalFolio:   doc.facturaOriginalFolio,
          ncfOriginal:            doc.ecf?.ncfModificado,
          codigoModificacion:     doc.ecf?.codigoModificacion ? String(doc.ecf.codigoModificacion) : undefined,
          descripcionMotivo:      doc.descripcionMotivo,
          empresaNombreComercial: empInfo.nombre,
          empresaRnc:             empInfo.rnc,
          empresaDireccion:       empInfo.direccion,
          empresaTelefono:        empInfo.telefono,
        };
        let qrDUrl: string | null = null;
        if (doc.ecf?.qrUrl && doc.ecf?.numero) {
          try { qrDUrl = await QRCode.toDataURL(doc.ecf.qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }); }
          catch { /* sin QR */ }
        }
        const empConfPanel = (empresa.configuracion ?? {}) as any;
        imprimirReciboTermico(buildReciboTermicoHTML(ncSale, qrDUrl, {
          mostrarEcf:    true,
          tipoImpresora: empConfPanel.posTipoImpresora,
          mensajeTicket: empConfPanel.posMensajeTicket,
          politicaDev:   empConfPanel.posPoliticaDev,
        }));
        return;
      }

      // ── Para todos los demás: construir GenericThermalDoc ──────────
      const apiMap: Record<string, string> = {
        cotizaciones:    `/cotizaciones/${id}`,
        'pre-facturas':  `/pre-facturas/${id}`,
        conduce:         `/conduces/${id}`,
        despacho:        `/conduces/${id}`,
        'recibos-cobro': `/recibos-cobro/${id}`,
        gastos:          `/gastos/${id}`,
        'notas-debito':  `/notas-debito/${id}`,
      };
      const ep = apiMap[panel];
      if (!ep) { message.info('Impresión no disponible para este módulo'); return; }
      const doc = await api.get(ep).then(r => r.data?.data ?? r.data);

      let gd: GenericDocData;

      if (panel === 'recibos-cobro') {
        gd = {
          tipo: 'RECIBO DE COBRO', numero: doc.numero ?? String(doc.id),
          fecha: String(doc.fecha ?? '').substring(0,10),
          empresa: empInfo,
          cliente: doc.clienteNombre ?? doc.cliente?.nombre,
          items: [{ desc: doc.concepto ?? 'Cobro recibido', total: Number(doc.monto??0) }],
          total: Number(doc.monto??0),
          nota1: `Método: ${doc.metodoPago ?? '—'}`,
        };
      } else if (panel === 'gastos') {
        gd = {
          tipo: 'COMPROBANTE DE GASTO', numero: `GAS-${String(doc.id).padStart(5,'0')}`,
          fecha: String(doc.fecha ?? '').substring(0,10),
          empresa: empInfo,
          items: [{ desc: doc.descripcion, total: Number(doc.monto??0) }],
          subtotal: Number(doc.monto??0), itbis: Number(doc.itbis??0), total: Number(doc.total??0),
          nota1: `Categoría: ${doc.categoria?.replace(/_/g,' ')}`,
          nota2: doc.proveedor ? `Proveedor: ${doc.proveedor}` : undefined,
        };
      } else if (panel === 'conduce' || panel === 'despacho') {
        gd = {
          tipo: 'CONDUCE', numero: doc.numero ?? String(doc.id),
          fecha: String(doc.fecha ?? '').substring(0,10),
          empresa: empInfo,
          cliente: doc.cliente?.nombre,
          items: (doc.detalles ?? []).map((d: any) => ({
            desc: d.descripcion, cant: Number(d.cantidad),
          })),
          nota1: `Entrega: ${doc.direccionEntrega ?? '—'}`,
          nota2: doc.contactoEntrega ? `Contacto: ${doc.contactoEntrega}` : undefined,
          notas: doc.notas,
        };
      } else if ((panel as string) === 'notas-debito') {
        gd = {
          tipo: 'NOTA DE DÉBITO', numero: doc.numero ?? String(doc.id),
          fecha: String(doc.fecha ?? '').substring(0,10),
          empresa: empInfo,
          cliente: doc.cliente?.nombre, rncCliente: doc.cliente?.rncReceptor,
          items: (doc.detalles ?? []).map((d: any) => ({
            desc: d.descripcion, cant: Number(d.cantidad),
            precio: Number(d.precioUnitario), total: Number(d.total??0),
          })),
          subtotal: Number(doc.subtotal??0), itbis: Number(doc.iva??0), total: Number(doc.total??0),
          nota1: doc.facturaOriginalFolio ? `Ref. factura: ${doc.facturaOriginalFolio}` : undefined,
        };
      } else {
        // cotizaciones, pre-facturas (fallback genérico — nunca deberían llegar aquí)
        const tipoLabel = (panel as string) === 'cotizaciones' ? 'COTIZACIÓN' : 'PRE-FACTURA';
        gd = {
          tipo: tipoLabel, numero: doc.numero ?? doc.folio ?? String(doc.id),
          fecha: String(doc.fecha ?? '').substring(0,10),
          empresa: empInfo,
          cliente: doc.cliente?.nombre, rncCliente: doc.cliente?.rncReceptor,
          items: (doc.detalles ?? []).map((d: any) => ({
            desc: d.descripcion, cant: Number(d.cantidad),
            precio: Number(d.precioUnitario), total: Number(d.total??0),
          })),
          subtotal: Number(doc.subtotal??0), itbis: Number(doc.iva??0), total: Number(doc.total??0),
          notas: doc.notas,
        };
      }

      const empConfPanel = (empresa.configuracion ?? {}) as any;
      imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora: empConfPanel.posTipoImpresora }));
    } catch (e: any) {
      message.error('Error al imprimir: ' + (e.message ?? ''));
    } finally {
      setImprimiendo(null);
    }
  };

  // ── ¿Puede anularse este registro? ────────────────────────────────
  const puedeAnular = (row: any): boolean => {
    const estado = row.estado ?? '';
    // FIX 2: permitir anular facturas emitidas Y pagadas
    if (panel === 'facturas')       return estado === 'emitida' || estado === 'pagada';
    if (panel === 'pre-facturas')   return !['convertida', 'anulada', 'rechazada'].includes(estado);
    if (panel === 'cotizaciones')   return !['convertida', 'rechazada', 'anulada'].includes(estado);
    if ((panel as string) === 'pro-formas') return true;
    // FIX 3: conduces — permitir cambio de estado en cualquier estado no final
    if ((panel as string) === 'conduce' || (panel as string) === 'despacho') return estado !== 'entregado' && estado !== 'devuelto';
    if ((panel as string) === 'notas-credito') return estado === 'emitida';
    if ((panel as string) === 'gastos')        return true;
    return false;
  };

  const { data: rows, isLoading } = useQuery<any>({
    queryKey: ['pos-panel', panel, busq],
    queryFn: async () => {
      const s = busq ? `&search=${encodeURIComponent(busq)}` : '';
      const endpoints: Record<string, string> = {
        inventario:       `/inventario/movimientos?limit=40${s}`,
        facturas:         `/facturas?limit=30${s}`,
        'pre-facturas':   `/pre-facturas?limit=30${s}`,
        cotizaciones:     `/cotizaciones?limit=30${s}`,
        conduce:          `/conduces?limit=30${s}`,
        despacho:         `/conduces?limit=30${s}`,
        clientes:         `/clientes?limit=40${s}`,
        'recibos-cobro':  `/recibos-cobro?limit=30${s}`,
        'notas-credito':  `/notas-credito?limit=30${s}`,
        gastos:           `/gastos?limit=30${s}`,
        'cierre-caja':    `/caja/cierres?limit=20${s}`,
        'pro-formas':     `/pro-formas?limit=30${s}`,
      };
      const url = endpoints[panel];
      if (!url) return [];
      const r = await api.get(url);
      const d = r.data?.data ?? r.data;
      return d?.data ?? d ?? [];
    },
    staleTime:       0,
    gcTime:          0,
    refetchOnMount: 'always',
    enabled: panel !== 'items',
    // Polling automático cuando hay facturas con ECF en estado ENVIADO
    refetchInterval: (query: any) => {
      if (panel !== 'facturas') return false;
      const data: any[] = query.state?.data ?? [];
      return data.some((r: any) => (r.ecf?.estadoDGII ?? '').toLowerCase() === 'enviado') ? 8000 : false;
    },
  });

  // Forzar consulta inmediata de estados ECF cuando hay filas ENVIADO
  const forcePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (panel !== 'facturas') return;
    const hasEnviado = (rows ?? []).some((r: any) => (r.ecf?.estadoDGII ?? '').toLowerCase() === 'enviado');
    if (!hasEnviado) return;
    if (forcePollRef.current) return;
    forcePollRef.current = setTimeout(() => {
      api.post('/ecf/consultar-estados').catch(() => {});
      forcePollRef.current = null;
    }, 800);
    return () => {
      if (forcePollRef.current) { clearTimeout(forcePollRef.current); forcePollRef.current = null; }
    };
  }, [panel, rows]);

  const colsConfig: Record<string, Array<{ label: string; key: string; render?: (v: any, row: any) => React.ReactNode }>> = {
    inventario: [
      { label: 'Producto',  key: 'producto',  render: (_,r) => r.producto?.nombre ?? r.descripcion ?? '—' },
      { label: 'Tipo',      key: 'tipo',      render: (v) => <span style={{ color: v === 'entrada' ? C.green : C.orange, fontWeight: 600, fontSize: 11 }}>{v?.toUpperCase()}</span> },
      { label: 'Cant.',     key: 'cantidad',  render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span> },
      { label: 'Fecha',     key: 'fecha',     render: (v) => v?.substring(0,10) ?? '—' },
    ],
    facturas: [
      { label: 'Folio',    key: 'folio',    render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',  key: 'cliente',  render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Total',    key: 'total',    render: (v) => <span style={{ fontWeight: 700, color: C.green }}>{fmt.money(v)}</span> },
      { label: 'Estado',   key: 'estado',   render: (v: string) => {
        const colMap: Record<string,string> = { pagada: C.green, emitida: C.blue, cancelada: C.red };
        const label = v === 'cancelada' ? 'ANULADA' : v?.toUpperCase();
        return <span style={{ fontSize: 10, fontWeight: 700, color: colMap[v] ?? C.textSub }}>{label}</span>;
      }},
      { label: 'DGII', key: 'ecf', render: (v: any) => {
        const est: string = (v?.estadoDGII ?? '').toUpperCase();
        if (!est) return <span style={{ fontSize: 10, color: C.textSub }}>—</span>;
        const cfg: Record<string, { color: string; bg: string; label: string }> = {
          ACEPTADO:   { color: '#fff', bg: '#16a34a', label: '✓ ACEPTADO' },
          RECHAZADO:  { color: '#fff', bg: '#dc2626', label: '✗ RECHAZADO' },
          OBSERVADO:  { color: '#fff', bg: '#d97706', label: '⚠ OBSERVADO' },
          ENVIADO:    { color: '#1e3a5f', bg: '#bfdbfe', label: '⏳ ENVIADO' },
          PENDIENTE:  { color: '#fff', bg: '#6b7280', label: '… PENDIENTE' },
          PENDIENTE_ENVIO: { color: '#fff', bg: '#6b7280', label: '… PENDIENTE' },
          CONTINGENCIA: { color: '#fff', bg: '#7c3aed', label: '⚡ CONTINGENCIA' },
        };
        const c = cfg[est] ?? { color: C.text, bg: 'transparent', label: est };
        return (
          <span style={{ fontSize: 9, fontWeight: 700, color: c.color, background: c.bg,
            borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
            {c.label}
          </span>
        );
      }},
    ],
    'pre-facturas': [
      { label: 'Folio',    key: 'folio',    render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',  key: 'cliente',  render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Total',    key: 'total',    render: (v) => <span style={{ fontWeight: 700, color: C.orange }}>{fmt.money(v)}</span> },
      { label: 'Estado',   key: 'estado',   render: (v: string) => {
        const est = (v ?? '').toLowerCase();
        const colMap: Record<string, string> = { convertida: C.green, aprobada: C.green, enviada: C.blue, borrador: C.orange, rechazada: C.red };
        return <span style={{ fontSize: 10, fontWeight: 700, color: colMap[est] ?? C.textSub }}>{est === 'convertida' ? '✓ CONVERTIDA' : v?.toUpperCase()}</span>;
      }},
    ],
    cotizaciones: [
      { label: 'Número',   key: 'numero',   render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',  key: 'cliente',  render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Total',    key: 'total',    render: (v) => <span style={{ fontWeight: 700, color: C.orange }}>{fmt.money(v)}</span> },
      { label: 'Estado',   key: 'estado',   render: (v: string) => {
        const est = (v ?? '').toLowerCase();
        const colMap: Record<string, string> = { convertida: C.green, aceptada: C.green, enviada: C.blue, borrador: C.orange, rechazada: C.red, vencida: C.textSub };
        return <span style={{ fontSize: 10, fontWeight: 700, color: colMap[est] ?? C.textSub }}>{est === 'convertida' ? '✓ CONVERTIDA' : v?.toUpperCase()}</span>;
      }},
    ],
    conduce: [
      { label: 'Número',    key: 'numero',          render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',   key: 'cliente',          render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Dirección', key: 'direccionEntrega', render: (v) => <span style={{ fontSize: 11 }}>{v ?? '—'}</span> },
      { label: 'Estado',    key: 'estado',           render: (v) => <span style={{ fontSize: 10, fontWeight: 700, color: v==='entregado'?C.green:v==='en_transito'?C.blue:C.orange }}>{v?.replace('_',' ')?.toUpperCase()}</span> },
    ],
    despacho: [
      { label: 'Número',    key: 'numero',          render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',   key: 'cliente',          render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Dirección', key: 'direccionEntrega', render: (v) => <span style={{ fontSize: 11 }}>{v ?? '—'}</span> },
      { label: 'Estado',    key: 'estado',           render: (v) => <span style={{ fontSize: 10, fontWeight: 700, color: v==='entregado'?C.green:v==='en_transito'?C.blue:C.orange }}>{v?.replace('_',' ')?.toUpperCase()}</span> },
    ],
    clientes: [
      { label: 'Nombre',  key: 'nombre',      render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
      { label: 'RNC/Céd', key: 'rncReceptor', render: (v,r) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v || r.rfc || '—'}</span> },
      { label: 'Teléfono',key: 'telefono',    render: (v) => v ?? '—' },
      { label: 'Email',   key: 'email',       render: (v) => <span style={{ fontSize: 11 }}>{v ?? '—'}</span> },
    ],
    'recibos-cobro': [
      { label: 'Número',  key: 'numero',      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente', key: 'clienteNombre', render: (v) => v ?? '—' },
      { label: 'Monto',   key: 'monto',       render: (v) => <span style={{ fontWeight: 700, color: C.green }}>{fmt.money(v)}</span> },
      { label: 'Método',  key: 'metodoPago',  render: (v) => <span style={{ fontSize: 10, fontWeight: 700 }}>{v?.toUpperCase()}</span> },
    ],
    'notas-credito': [
      { label: 'Número',  key: 'numero',      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente', key: 'cliente',     render: (_,r) => r.cliente?.nombre ?? '—' },
      { label: 'Total',   key: 'total',       render: (v) => <span style={{ fontWeight: 700, color: C.orange }}>{fmt.money(v)}</span> },
      { label: 'Estado',  key: 'estado',      render: (v) => <span style={{ fontSize: 10, fontWeight: 700, color: v==='emitida'?C.blue:v==='anulada'?C.red:C.textSub }}>{v?.toUpperCase()}</span> },
    ],
    gastos: [
      { label: 'Descripción', key: 'descripcion', render: (v) => <span style={{ fontSize: 12 }}>{v}</span> },
      { label: 'Categoría',   key: 'categoria',   render: (v) => <span style={{ fontSize: 11 }}>{v?.replace(/_/g,' ')}</span> },
      { label: 'Total',       key: 'total',       render: (v) => <span style={{ fontWeight: 700, color: C.red }}>{fmt.money(v)}</span> },
      { label: 'Fecha',       key: 'fecha',       render: (v) => v?.substring(0,10) ?? '—' },
    ],
    'cierre-caja': [
      { label: 'Fecha',     key: 'fecha',       render: (v) => v?.substring(0,10) ?? '—' },
      { label: 'Apertura',  key: 'montoApertura', render: (v) => fmt.money(v ?? 0) },
      { label: 'Ventas',    key: 'totalVentas',   render: (v) => <span style={{ fontWeight: 700, color: C.green }}>{fmt.money(v ?? 0)}</span> },
      { label: 'Cierre',    key: 'montoCierre',   render: (v) => fmt.money(v ?? 0) },
    ],
    'pro-formas': [
      { label: 'Número',      key: 'numero',          render: (v) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue }}>{v}</span> },
      { label: 'Cliente',     key: 'clienteNombre',   render: (v) => v ?? '—' },
      { label: 'Total',       key: 'total',           render: (v) => <span style={{ fontWeight: 700, color: C.blue }}>{fmt.money(v)}</span> },
      { label: 'Válida hasta', key: 'fechaVencimiento', render: (v) => v ? String(v).substring(0,10) : '—' },
      { label: 'Estado',      key: 'estado',          render: (v: string) => {
        const colMap: Record<string,string> = { ACTIVA: C.green, VENCIDA: C.textSub };
        return <span style={{ fontSize: 10, fontWeight: 700, color: colMap[v] ?? C.textSub }}>{v}</span>;
      }},
    ],
  };

  // Despachar a componentes especializados — DESPUÉS de todos los hooks
  if (panel === 'ventas-hoy')   return <POSVentasHoyPanel  C={C} onVolver={onVolver} />;
  if (panel === 'inventario')   return <POSInventarioPanel C={C} onVolver={onVolver} requireSupervisor={requireSupervisor} />;
  if (panel === 'clientes')     return <POSClientesPanel   C={C} onVolver={onVolver} />;
  if (panel === 'cierre-caja')  return <POSCierreCajaPanel C={C} onVolver={onVolver} />;
  if (panel === 'conduce')      return <POSConducePanel    C={C} onVolver={onVolver} />;
  if (panel === 'gastos')       return <POSGastosPanel     C={C} onVolver={onVolver} />;
  if (panel === 'recibos-cobro' || panel === 'anticipos')
    return <POSReciboAnticipoPanel tipo={panel as 'recibos-cobro'|'anticipos'} C={C} onVolver={onVolver} />;
  if (panel === 'compras')
    return <POSComprasPanel C={C} onVolver={onVolver}
      supervisorActive={supervisorActive ?? false}
      requireSupervisorForced={requireSupervisorForced ?? (async () => true)} />;

  const cols  = (colsConfig as any)[panel] ?? [];
  const title = PANEL_TITLES[panel];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header del panel */}
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onVolver} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>←</button>
        <span style={{ fontSize: 16 }}>{title.icon}</span>
        <span style={{ fontWeight: 700, color: C.text, fontSize: 15, flex: 1 }}>{title.label}</span>
        <div style={{ position: 'relative', width: 220 }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, fontSize: 13 }} />
          <input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar..."
            style={{ width: '100%', height: 34, paddingLeft: 30, paddingRight: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Tabla de contenido */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: C.border + ' transparent' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
            <Spin />
          </div>
        ) : (rows ?? []).length === 0 ? (
          <Empty description={<span style={{ color: C.textSub, fontSize: 13 }}>Sin registros</span>} style={{ marginTop: 40 }} />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.card, position: 'sticky', top: 0, zIndex: 2 }}>
                {cols.map((c: any) => (
                  <th key={c.key} style={{ padding: '8px 14px', textAlign: 'left', color: C.textSub, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    {c.label}
                  </th>
                ))}
                {true && (
                  <th style={{ padding: '8px 14px', textAlign: 'right', color: C.textSub, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', width: 100 }}>
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row: any, i: number) => {
                const folio = row.folio ?? row.numero ?? row.id;
                const yaAnulado = ['anulada','cancelada','rechazada'].includes(row.estado ?? '');
                return (
                  <tr key={row.id ?? i}
                    style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.card }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.sidebarHov)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : C.card)}
                  >
                    {cols.map((c: any) => (
                      <td key={c.key} style={{ padding: '9px 14px', color: C.text, verticalAlign: 'middle', opacity: yaAnulado ? 0.5 : 1 }}>
                        {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                    {true && (
                      <td style={{ padding: '6px 14px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {/* Cobrar Pre-Factura */}
                        {panel === 'pre-facturas' && !['convertida', 'rechazada'].includes((row.estado ?? '').toLowerCase()) && (
                          <button
                            onClick={() => {
                              const clienteNombre = row.cliente?.nombre ?? row.clienteNombre ?? 'Consumidor Final';
                              setCobrarPF({ id: row.id, folio, total: Number(row.total ?? 0), cliente: clienteNombre });
                              setCobrarPFMetodo('Efectivo'); setCobrarPFMonto(String(Number(row.total ?? 0).toFixed(2)));
                            }}
                            title="Cobrar pre-factura"
                            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontWeight: 700, marginRight: 6 }}
                          >
                            Cobrar
                          </button>
                        )}
                        {/* Cobrar Cotización */}
                        {panel === 'cotizaciones' && !['convertida', 'rechazada', 'vencida'].includes((row.estado ?? '').toLowerCase()) && (
                          <button
                            onClick={() => {
                              const clienteNombre = row.cliente?.nombre ?? row.clienteNombre ?? 'Consumidor Final';
                              setCobrarCot({ id: row.id, numero: row.numero, total: Number(row.total ?? 0), cliente: clienteNombre });
                              setCobrarCotMetodo('Efectivo'); setCobrarCotMonto(String(Number(row.total ?? 0).toFixed(2)));
                            }}
                            title="Cobrar cotización"
                            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontWeight: 700, marginRight: 6 }}
                          >
                            Cobrar
                          </button>
                        )}
                        {/* Imprimir */}
                        <button
                          onClick={() => handleImprimir(row.id, folio)}
                          disabled={imprimiendo === row.id}
                          title="Imprimir / Descargar PDF"
                          style={{
                            background: 'none', border: `1px solid ${C.border2}`, borderRadius: 6,
                            color: C.blue, cursor: 'pointer', padding: '4px 8px', fontSize: 14,
                            marginRight: 6, opacity: imprimiendo === row.id ? 0.5 : 1,
                          }}
                        >
                          {imprimiendo === row.id ? '⏳' : '🖨️'}
                        </button>
                        {/* Botones de estado para despacho (conduce usa POSConducePanel) */}
                        {panel === 'despacho' && row.estado !== 'entregado' && row.estado !== 'devuelto' && (
                          cambEstado === row.id ? (
                            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                              {row.estado === 'generado' && (
                                <button onClick={() => cambiarEstadoConduce.mutate({ id: row.id, nuevoEstado: 'en_transito' })}
                                  style={{ background: C.blue, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 10, fontWeight: 700 }}>
                                  🚚 En Ruta
                                </button>
                              )}
                              {row.estado === 'en_transito' && (<>
                                <button onClick={() => cambiarEstadoConduce.mutate({ id: row.id, nuevoEstado: 'entregado' })}
                                  style={{ background: C.green, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 10, fontWeight: 700 }}>
                                  ✅ Entregado
                                </button>
                                <button onClick={() => cambiarEstadoConduce.mutate({ id: row.id, nuevoEstado: 'devuelto' })}
                                  style={{ background: C.orange, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 10, fontWeight: 700 }}>
                                  ↩ Devuelto
                                </button>
                              </>)}
                              <button onClick={() => setCambEstado(null)}
                                style={{ background: 'none', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.textSub, cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}>
                                ✕
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => setCambEstado(row.id)} title="Cambiar estado"
                              style={{ background: 'none', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.blue, cursor: 'pointer', padding: '4px 8px', fontSize: 13, marginRight: 4 }}>
                              🔄
                            </button>
                          )
                        )}
                        {/* Anular */}
                        {!yaAnulado && puedeAnular(row) && panel !== 'despacho' &&
                          panel !== 'facturas' && (
                          anulando === row.id ? (
                            <span style={{ fontSize: 11, color: C.textSub }}>
                              <button onClick={() => { anularMutation.mutate({ id: row.id, mod: panel }); }}
                                style={{ background: C.red, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 11, marginRight: 4, fontWeight: 700 }}>
                                ✓ Confirmar
                              </button>
                              <button onClick={() => setAnulando(null)}
                                style={{ background: 'none', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.textSub, cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}>
                                ✕
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                // Verificar límite de tiempo para anulación
                                if (tiempoLimiteAnular && tiempoLimiteAnular > 0 && row.createdAt) {
                                  const mins = dayjs().diff(dayjs(row.createdAt), 'minute');
                                  if (mins > tiempoLimiteAnular) {
                                    message.error(`No se puede anular — han transcurrido más de ${tiempoLimiteAnular} minutos`);
                                    return;
                                  }
                                }
                                if (requireSupervisor) {
                                  const ok = await requireSupervisor(
                                    `Anular documento`,
                                    `ID: ${row.id} — Monto: ${(row as any).total ?? (row as any).monto ?? ''}`,
                                  );
                                  if (!ok) return;
                                }
                                // Si confirmarAnulacion = false → anular directo sin modal de confirmación
                                if (confirmarAnulacion === false) {
                                  anularMutation.mutate({ id: row.id, mod: panel });
                                } else {
                                  setAnulando(row.id);
                                }
                              }}
                              title="Anular"
                              style={{ background: 'none', border: `1px solid ${C.border2}`, borderRadius: 6, color: C.red, cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}
                            >
                              🚫
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recibo térmico genérico — cotizaciones, conduce, recibos, etc. */}
      <div id={PANEL_GENERIC_ID} style={{ display: 'none' }}>
        {genericDoc && <GenericThermalDoc doc={genericDoc} />}
      </div>

      {/* ── Modal cobrar Pre-Factura ────────────────────────────────────────── */}
      {cobrarPF && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setCobrarPF(null); setCobrarPFMonto(''); } }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 360, maxWidth: '92vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: C.text }}>Cobrar Pre-Factura</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>{cobrarPF.folio} · {cobrarPF.cliente}</div>
            <div style={{ background: C.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.textSub, fontSize: 13 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.green }}>RD${Number(cobrarPF.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>Método de pago</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['Efectivo', 'Tarjeta', 'Transferencia'] as const).map(m => (
                  <button key={m} onClick={() => setCobrarPFMetodo(m)}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${cobrarPFMetodo === m ? C.green : C.border2}`, background: cobrarPFMetodo === m ? '#dcfce7' : C.card, color: cobrarPFMetodo === m ? '#15803d' : C.text, cursor: 'pointer', fontSize: 12, fontWeight: cobrarPFMetodo === m ? 700 : 400 }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {cobrarPFMetodo === 'Efectivo' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>Monto recibido</div>
                <input type="number" min="0" step="0.01" value={cobrarPFMonto}
                  onChange={e => setCobrarPFMonto(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border2}`, borderRadius: 8, fontSize: 16, background: C.bg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                {cobrarPFMonto && Number(cobrarPFMonto) >= cobrarPF.total && (
                  <div style={{ marginTop: 6, fontSize: 14, color: C.green, fontWeight: 700 }}>
                    Cambio: RD${(Number(cobrarPFMonto) - cobrarPF.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => { setCobrarPF(null); setCobrarPFMonto(''); }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: `1px solid ${C.border2}`, background: 'none', color: C.textSub, cursor: 'pointer', fontSize: 14 }}>
                Cancelar
              </button>
              <button disabled={cobrarPFMut.isPending}
                onClick={() => cobrarPFMut.mutate({ id: cobrarPF.id, metodoPago: cobrarPFMetodo })}
                style={{ flex: 2, padding: '11px 0', borderRadius: 9, border: 'none', background: cobrarPFMut.isPending ? '#9ca3af' : '#16a34a', color: '#fff', cursor: cobrarPFMut.isPending ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {cobrarPFMut.isPending ? 'Procesando...' : 'Confirmar Cobro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cobrar Cotización ───────────────────────────────────────────── */}
      {cobrarCot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setCobrarCot(null); setCobrarCotMonto(''); } }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 360, maxWidth: '92vw', boxShadow: '0 8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: C.text }}>Cobrar Cotización</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>{cobrarCot.numero} · {cobrarCot.cliente}</div>
            <div style={{ background: C.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.textSub, fontSize: 13 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.green }}>RD${Number(cobrarCot.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>Método de pago</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['Efectivo', 'Tarjeta', 'Transferencia'] as const).map(m => (
                  <button key={m} onClick={() => setCobrarCotMetodo(m)}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${cobrarCotMetodo === m ? C.green : C.border2}`, background: cobrarCotMetodo === m ? '#dcfce7' : C.card, color: cobrarCotMetodo === m ? '#15803d' : C.text, cursor: 'pointer', fontSize: 12, fontWeight: cobrarCotMetodo === m ? 700 : 400 }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {cobrarCotMetodo === 'Efectivo' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>Monto recibido</div>
                <input type="number" min="0" step="0.01" value={cobrarCotMonto}
                  onChange={e => setCobrarCotMonto(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border2}`, borderRadius: 8, fontSize: 16, background: C.bg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                {cobrarCotMonto && Number(cobrarCotMonto) >= cobrarCot.total && (
                  <div style={{ marginTop: 6, fontSize: 14, color: C.green, fontWeight: 700 }}>
                    Cambio: RD${(Number(cobrarCotMonto) - cobrarCot.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => { setCobrarCot(null); setCobrarCotMonto(''); }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: `1px solid ${C.border2}`, background: 'none', color: C.textSub, cursor: 'pointer', fontSize: 14 }}>
                Cancelar
              </button>
              <button disabled={cobrarCotMut.isPending}
                onClick={() => cobrarCotMut.mutate({ id: cobrarCot.id, metodoPago: cobrarCotMetodo })}
                style={{ flex: 2, padding: '11px 0', borderRadius: 9, border: 'none', background: cobrarCotMut.isPending ? '#9ca3af' : '#16a34a', color: '#fff', cursor: cobrarCotMut.isPending ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {cobrarCotMut.isPending ? 'Procesando...' : 'Confirmar Cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS: Array<{ id: PanelId | 'menu'; label: string; icon: string }> = [
  { id: 'items',        label: 'Ítems',      icon: '🛒' },
  { id: 'inventario',   label: 'Inventario', icon: '📦' },
  { id: 'facturas',     label: 'Facturas',   icon: '📄' },
  { id: 'pre-facturas', label: 'Pre-Fact.',  icon: '📋' },
  { id: 'cotizaciones', label: 'Cotizac.',   icon: '💬' },
  { id: 'compras',      label: 'Compras',    icon: '🛍️' },
  { id: 'menu',         label: 'Menú',       icon: '⋮'  },
];

const MENU_EXTRAS: Array<{ label: string; icon: string; panel: PanelId }> = [
  { label: 'Ganancias',         icon: '📈', panel: 'ventas-hoy' },
  { label: 'Conduce',          icon: '🚚', panel: 'conduce' },
  { label: 'Despacho',         icon: '📦', panel: 'despacho' },
  { label: 'Clientes',         icon: '👤', panel: 'clientes' },
  { label: 'Recibos de Cobro', icon: '🧾', panel: 'recibos-cobro' },
  { label: 'Anticipos',        icon: '💰', panel: 'anticipos' },
  { label: 'Pro Formas',        icon: '📋', panel: 'pro-formas' },
  { label: 'Notas de Crédito', icon: '📝', panel: 'notas-credito' },
  { label: 'Nueva NC',         icon: '➕', panel: 'nueva-nc' as any },
  { label: 'Gastos',           icon: '💸', panel: 'gastos' },
  { label: 'Cierre de Caja',   icon: '🏧', panel: 'cierre-caja' },
];

function POSBottomNav({
  palette, menuAbierto, panelActivo, onMenuToggle, onPanelChange, onNavigate,
}: {
  palette:        Palette;
  menuAbierto:    boolean;
  panelActivo:    PanelId;
  onMenuToggle:   () => void;
  onPanelChange:  (panel: PanelId) => void;
  onNavigate:     (ruta: string) => void;
}) {
  const C = palette;
  const isDarkMode = C === darkC;

  // Topbar siempre es azul (light) u oscuro (dark) — texto siempre blanco semi-transparente
  const navTextInactive = 'rgba(255,255,255,0.65)';
  const navTextActive   = '#ffffff';
  const navHoverBg      = isDarkMode ? C.sidebarHov : 'rgba(255,255,255,0.12)';
  const navActiveBg     = isDarkMode ? 'rgba(59,130,246,.15)' : 'rgba(255,255,255,0.20)';

  const btnBase: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 3, height: '100%', border: 'none',
    background: 'transparent', color: navTextInactive, fontSize: 10, fontWeight: 600,
    cursor: 'pointer', outline: 'none', padding: '0 2px',
    transition: 'background 0.12s, color 0.12s',
    letterSpacing: '0.2px', userSelect: 'none',
  };

  return (
    <>
      {/* Overlay — cierra el menú al tocar fuera */}
      {menuAbierto && (
        <div
          onClick={onMenuToggle}
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'transparent' }}
        />
      )}

      {/* Panel de menú adicional */}
      {menuAbierto && (
        <div style={{
          position: 'fixed', bottom: 57, left: 'calc(100vw - 590px)', zIndex: 200,
          width: 210, background: C.card,
          border: `1px solid ${C.border2}`,
          borderRadius: '10px 0 0 0',
          boxShadow: isDarkMode
            ? '-4px -4px 20px rgba(0,0,0,.5)'
            : '-2px -4px 12px rgba(0,0,0,.12)',
          overflow: 'hidden',
        }}>
          {MENU_EXTRAS.map((item, i) => (
            <button
              key={item.label}
              onClick={() => { onMenuToggle(); onPanelChange(item.panel); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '11px 16px',
                border: 'none', borderBottom: i < MENU_EXTRAS.length - 1 ? `1px solid ${C.border}` : 'none',
                background: 'transparent', color: C.text, fontSize: 13,
                cursor: 'pointer', outline: 'none', textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.sidebarHov)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ fontWeight: 500 }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Barra inferior — flujo normal, se queda en la columna izquierda */}
      <nav style={{
        flexShrink: 0,
        height: 56, display: 'flex', alignItems: 'stretch',
        background: C.topbar,
        borderTop: `1px solid ${C.border2}`,
        zIndex: 100,
      }}>
        {NAV_ITEMS.map(item => {
          const isMenu   = item.id === 'menu';
          const isActive = !isMenu && panelActivo === item.id;
          const showActive = isActive || (isMenu && menuAbierto);
          return (
            <button
              key={item.id}
              style={{
                ...btnBase,
                color:     showActive ? navTextActive : navTextInactive,
                borderTop: showActive ? '2px solid rgba(255,255,255,0.9)' : '2px solid transparent',
                background: showActive ? navActiveBg : 'transparent',
              }}
              onClick={() => {
                if (isMenu) { onMenuToggle(); }
                else { onPanelChange(item.id as PanelId); }
              }}
              onMouseEnter={e => {
                if (!showActive) e.currentTarget.style.background = navHoverBg;
              }}
              onMouseLeave={e => {
                if (!showActive) e.currentTarget.style.background = 'transparent';
              }}
              title={item.label}
            >
              <span style={{ fontSize: isMenu ? 20 : 18, lineHeight: 1 }}>
                {item.icon}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1px' }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function POSPage() {
  const navigate     = useNavigate();
  const { isDark }   = useThemeStore();
  const palette      = isDark ? darkC : lightC;
  const C            = palette;
  const qc           = useQueryClient();
  const user               = useAuthStore(s => s.user);
  const almacenActual      = useAuthStore(s => s.almacenActual);
  const setSucursalActualPOS = useAuthStore(s => s.setSucursalActual);
  const setAlmacenActualPOS  = useAuthStore(s => s.setAlmacenActual);

  // ── Bloqueo de pantalla ────────────────────────────────────────────────────
  const [pantallaBloqueada,   setPantallaBloqueada]   = useState(() =>
    sessionStorage.getItem('pos_bloqueado') === 'true'
  );
  const [pwDesbloqueo,        setPwDesbloqueo]        = useState('');
  const [errDesbloqueo,       setErrDesbloqueo]       = useState('');
  const [desbloqueando,       setDesbloqueando]       = useState(false);
  const [intentosFallidos,    setIntentosFallidos]    = useState(0);
  const [bloqueadoHasta,      setBloqueadoHasta]      = useState<number>(0);
  // ── Modo supervisor (configurable por tenant) ─────────────────────────────
  const supervisor = useSupervisor();
  // ── Modal supervisor (legacy — se mantiene para el botón manual del TopBar) ─
  const [modalSupervisor,     setModalSupervisor]     = useState(false);
  const [pwSupervisor,        setPwSupervisor]        = useState('');
  const [errSupervisor,       setErrSupervisor]       = useState('');
  const [verificandoSup,      setVerificandoSup]      = useState(false);
  const [supervisorOk,        setSupervisorOk]        = useState(false);
  // Supervisor selector (nuevo modal)
  const [supId,               setSupId]               = useState<number | null>(null);
  const [supPassword,         setSupPassword]         = useState('');
  const [supError,            setSupError]            = useState('');
  const [verificandoSupNuevo, setVerificandoSupNuevo] = useState(false);
  const { data: supervisores, isLoading: supLoading } = useQuery<{ id: number; nombre: string; role: string }[]>({
    queryKey: ['supervisores-pos'],
    queryFn:  () => api.get('/auth/supervisores').then(r => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : [];
    }),
    enabled:   !!supervisor.pendingAction,
    staleTime: 2 * 60_000,
  });
  // ── Modal cambiar usuario ─────────────────────────────────────────────────
  const [modalCambiarUser,    setModalCambiarUser]    = useState(false);
  const [cambiarUserId,       setCambiarUserId]       = useState<number | undefined>();
  const [pwCambio,            setPwCambio]            = useState('');
  const [errCambio,           setErrCambio]           = useState('');
  const [cambiandoUser,       setCambiandoUser]       = useState(false);

  const [turnoAbierto,  setTurnoAbierto]  = useState(() => Boolean(sessionStorage.getItem('pos_turno')));
  const [search,        setSearch]        = useState('');
  const [categoriaTab,  setCategoriaTab]  = useState<string>('__all__');
  // Descuento global del carrito
  const [descGlobal,     setDescGlobal]     = useState('');
  const [descGlobalTipo, setDescGlobalTipo] = useState<'pct' | 'fijo'>('pct');
  // Lista de precios global — se aplica al carrito completo y a nuevos items
  const [listaGlobal, setListaGlobal] = useState<PrecioLista>('precio1');
  const [cart,          setCart]          = useState<CartItem[]>(() => {
    try {
      const guardado = localStorage.getItem('pos-carrito-activo');
      if (!guardado) return [];
      const data = JSON.parse(guardado);
      // Formato legado (array sin empresaId) → limpiar por seguridad multi-tenant
      if (Array.isArray(data)) {
        localStorage.removeItem('pos-carrito-activo');
        return [];
      }
      // Validar que el carrito pertenece a la empresa activa actual
      const empresaIdActual = localStorage.getItem('empresaId');
      if (!empresaIdActual || String(data.empresaId) !== String(empresaIdActual)) {
        localStorage.removeItem('pos-carrito-activo');
        return [];
      }
      return Array.isArray(data.items) ? data.items : [];
    } catch { return []; }
  });
  const [menuNavAbierto, setMenuNavAbierto] = useState(false);
  const [panelActivo, _setPanelActivo] = useState<PanelId>(() => {
    const saved = localStorage.getItem('pos_panel_activo') as PanelId | null;
    const VALID: PanelId[] = ['items','inventario','facturas','pre-facturas','cotizaciones',
      'conduce','despacho','clientes','recibos-cobro','anticipos',
      'notas-credito','gastos','cierre-caja','ventas-hoy','pro-formas','compras'];
    return saved && VALID.includes(saved) ? saved : 'items';
  });
  const setPanelActivo = useCallback((p: PanelId) => {
    localStorage.setItem('pos_panel_activo', p);
    _setPanelActivo(p);
  }, []);
  const isMobile                           = useMobile();
  const [mobileTab, setMobileTab]          = useState<'productos' | 'carrito'>('productos');
  const [clienteId,     setClienteId]     = useState<number | undefined>();
  // Persistir vendedorId y sucursalId en localStorage para sobrevivir recargas
  const [vendedorId,    setVendedorId]    = useState<number | undefined>(() => {
    const v = localStorage.getItem('pos_vendedor_id');
    return v ? Number(v) : undefined;
  });
  const [sucursalId,    setSucursalId]    = useState<number | undefined>(() => {
    // Usar la sucursal del JWT/auth como fuente de verdad; fallback a la local del POS
    const global = localStorage.getItem('sucursalId');
    const local  = localStorage.getItem('pos_sucursal_id');
    return global ? Number(global) : (local ? Number(local) : undefined);
  });
  const [modoFacturacion,    setModoFacturacion]    = useState<ModoFacturacion>('factura');
  const [showNotaCredito,    setShowNotaCredito]    = useState(false);
  // Barra superior — controles
  const [modoBarcode,        setModoBarcode]        = useState(false);
  const [barcodeInput,       setBarcodeInput]       = useState('');
  const [showFiltros,        setShowFiltros]        = useState(false);
  const [filtroStock,        setFiltroStock]        = useState<'todos'|'con-stock'|'sin-stock'|'bajo'>('todos');
  const [showOrden,          setShowOrden]          = useState(false);
  const [orden,              setOrden]              = useState<'nombre-az'|'nombre-za'|'precio-asc'|'precio-desc'|'stock-asc'|'stock-desc'>('nombre-az');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [showPago,           setShowPago]           = useState(false);
  const [metodoPago,         setMetodoPago]         = useState<MetodoPago>('efectivo');
  const [monedaPOS,          setMonedaPOS]          = useState<'DOP' | 'USD'>('DOP');
  const [tasaCambioPOS,      setTasaCambioPOS]      = useState<number>(1);
  const [montoRecibido,      setMontoRecibido]      = useState(0);
  const montoInputRef = useRef<HTMLInputElement>(null);
  const [tipoPagoPos,        setTipoPagoPos]        = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [propinaValor,       setPropinaValor]       = useState<string>('');
  const [propinaTipo,        setPropinaTipo]        = useState<'%' | 'fijo'>('%');
  const [diasCreditoPos,     setDiasCreditoPos]     = useState(30);
  const [sale,               setSale]               = useState<Sale | null>(null);
  const [idsRecientes, setIdsRecientes] = useState<number[]>(() => {
    try { const eid = localStorage.getItem('empresaId') ?? ''; return JSON.parse(localStorage.getItem(`pos_recientes_${eid}`) ?? '[]'); } catch { return []; }
  });
  const [contextoActualId,   setContextoActualId]   = useState<number | null>(null);
  const [tipoNcf,            setTipoNcf]            = useState('E32');
  const [ventasEnEspera,     setVentasEnEspera]     = useState<ParkedSale[]>([]);
  const [isOffline,          setIsOffline]          = useState(!navigator.onLine);
  // e-CF: datos del comprador y estado del loader
  const [rncComprador,       setRncComprador]       = useState('');
  const [razonSocialComp,    setRazonSocialComp]    = useState('');
  const rncDGII = useRncLookup();
  const [numeroOrdenCompra,  setNumeroOrdenCompra]  = useState('');
  const [guardarRncPerfil,   setGuardarRncPerfil]   = useState(false);
  const [ecfStatus,          setEcfStatus]          = useState<'idle'|'loading'|'ok'|'pendiente'>('idle');
  const [ecfEncf,            setEcfEncf]            = useState<string>('');
  const printWinRef      = useRef<Window | null>(null); // ventana pre-abierta para auto-imprimir en tablets
  const autoYaPrintedRef = useRef(false);

  // ── Módulos add-on disponibles en el POS (una sola llamada) ──────────────
  const { data: misModulosData } = useQuery({
    queryKey: ['mis-modulos-pos'],
    queryFn: () => modulosAddonApi.misModulos(),
    staleTime: 5 * 60_000,
    gcTime:    10 * 60_000,
  });
  const misModulos: string[] = Array.isArray((misModulosData as any)?.modulos)
    ? (misModulosData as any).modulos
    : Array.isArray(misModulosData) ? (misModulosData as any) : [];
  const hasAddon = (cod: string) => misModulos.some(m => m.toUpperCase() === cod.toUpperCase());

  const MODOS_POS = [
    { codigo: 'general',     label: 'General',     icono: '🏪' },
    ...(hasAddon('RESTAURANTE') ? [{ codigo: 'restaurante', label: 'Restaurante', icono: '🍽️' }] : []),
    ...(hasAddon('TALLER')      ? [{ codigo: 'taller',      label: 'Taller',      icono: '🔧' }] : []),
    ...(hasAddon('FARMACIA')    ? [{ codigo: 'farmacia',    label: 'Farmacia',    icono: '💊' }] : []),
    ...(hasAddon('OPTICA')      ? [{ codigo: 'optica',      label: 'Óptica',      icono: '👓' }] : []),
    ...(hasAddon('CLINICA')     ? [{ codigo: 'clinica',     label: 'Clínica',     icono: '🏥' }] : []),
    ...(hasAddon('GIMNASIO')    ? [{ codigo: 'gimnasio',    label: 'Gimnasio',    icono: '🏋️' }] : []),
  ];

  const [modoContexto, setModoContexto] = useState<string>(() => {
    const eid = localStorage.getItem('empresaId') ?? '';
    return localStorage.getItem(`pos_modo_contexto_${eid}`) ?? 'general';
  });

  // Validar modo contra módulos activos cuando cargan — evita modo óptica/restaurante
  // en empresas que no tienen esos módulos (bug de contaminación entre empresas/usuarios)
  useEffect(() => {
    if (!misModulosData || modoContexto === 'general') return;
    const mods: string[] = Array.isArray((misModulosData as any)?.modulos)
      ? (misModulosData as any).modulos
      : Array.isArray(misModulosData) ? (misModulosData as any) : [];
    const tieneModulo = mods.some(m => m.toUpperCase() === modoContexto.toUpperCase());
    if (!tieneModulo) {
      const eid = localStorage.getItem('empresaId') ?? '';
      setModoContexto('general');
      localStorage.setItem(`pos_modo_contexto_${eid}`, 'general');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misModulosData]);

  const searchRef         = useRef<any>(null);
  const lastKeyTimeRef    = useRef<number>(0);
  const fastCharCountRef  = useRef<number>(0);
  // Scanner HID — buffer en refs independiente del DOM y del ciclo de render de React
  const scanBuffer        = useRef<string>('');
  const scanTimer         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const { pendingCount, isSyncing, enqueue, sync } = useOfflineQueue();

  // Autocompletar/sustituir razón social desde DGII cuando se consulta el RNC del comprador
  useEffect(() => {
    if (rncDGII.datos?.encontrado && rncDGII.datos?.nombre) {
      setRazonSocialComp(rncDGII.datos.nombre);  // siempre sustituye aunque haya texto previo
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rncDGII.datos]);

  // Autofocus en campo de monto al abrir panel de cobro en efectivo
  useEffect(() => {
    if (showPago && metodoPago === 'efectivo' && tipoPagoPos === 'CONTADO') {
      const t = setTimeout(() => montoInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [showPago, metodoPago, tipoPagoPos]);

  // Offline detection
  useEffect(() => {
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Al cargar, si hay un vendedorId guardado, verificar si su caja sigue abierta
  // para omitir el modal de apertura automáticamente
  useEffect(() => {
    if (!vendedorId || turnoAbierto) return;
    api.get(`/caja/hoy?vendedorId=${vendedorId}`)
      .then((res: any) => {
        const payload = res.data?.data ?? res.data;
        const caja    = payload?.cajas ? payload.cajas[0] : payload;
        if (caja?.estado === 'abierta') {
          setTurnoAbierto(true);
          sessionStorage.setItem('pos_turno', '1');
        }
      })
      .catch(() => {});
  }, []);   // solo al montar

  // Verificar que la caja del cajero activo esté abierta.
  // vendedorId está en el queryKey → se re-ejecuta automáticamente cuando cambia el estado.
  const { data: cajaActivaHoy } = useQuery<any>({
    queryKey: ['pos-caja-abierta', vendedorId],
    queryFn:  () => {
      if (!vendedorId) return null;
      return api.get(`/caja/hoy?vendedorId=${vendedorId}`).then(r => {
        const d = r.data?.data ?? r.data;
        const caja = Array.isArray(d) ? d.find((c: any) => c.estado === 'abierta') ?? null : d;
        return caja?.estado === 'abierta' ? caja : null;
      }).catch(() => null);
    },
    refetchInterval:      10_000,
    refetchOnWindowFocus: true,
    staleTime:            0,
    enabled:              turnoAbierto && !!vendedorId,
  });

  // Queries
  // almacenActual en queryKey → invalida automáticamente al cambiar sucursal
  const { data: produtos, isLoading, refetch: refetchProductos } = useQuery({
    queryKey: ['pos-products', search, almacenActual],
    queryFn:  () => productosApi.list(1, 120, search),
    refetchInterval: 30_000,   // FIX 1: refrescar catálogo cada 30s
    staleTime: 20_000,
  });

  // FIX 1: también refrescar al recuperar el foco (el cajero vuelve de otra pestaña)
  useEffect(() => {
    const onFocus = () => { refetchProductos(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchProductos]);
  const { data: clientes } = useQuery({
    queryKey: ['clientes-pos'],
    queryFn:  () => clientesApi.list(1, 100),
  });
  const { data: vendedores = [] } = useQuery<any[]>({
    queryKey: ['vendedores-sel'],
    queryFn:  () => api.get('/vendedores').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    staleTime: 5 * 60_000,
    retry: 3,
    retryDelay: 1_000,
  });
  // Usuarios activos de la empresa con email — para Cambiar Usuario
  const { data: usuariosEmpresa = [] } = useQuery<any[]>({
    queryKey: ['pos-cajeros'],
    queryFn:  () => api.get('/caja/cajeros').then((r: any) => r.data?.data ?? r.data ?? []),
    enabled:  modalCambiarUser,
    staleTime: 60_000,
  });
  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['sucursales-pos'],
    queryFn:  () => api.get('/sucursales').then((r: any) => r.data?.data ?? r.data ?? []),
  });
  const { data: empresa } = useQuery<any>({
    queryKey: ['empresa-config-pos'],
    queryFn:  () => configuracionApi.getEmpresa(),
    staleTime: 5 * 60 * 1000,
  });

  // tu proveedor e-CF health — null=checking, true=online, false=offline
  // Usamos /ecf/tipos (accesible a todos los roles) en lugar de /ecf/secuencias
  // que solo tienen ADMIN/CONTADOR — evita mostrar "Contingencia" al vendedor.
  const { data: ecfOnline } = useQuery<boolean>({
    queryKey: ['pos-ecf-health'],
    queryFn: async () => {
      try { await api.get('/ecf/tipos'); return true; }
      catch { return false; }
    },
    staleTime: 0, refetchInterval: 30_000,
  });

  // Derived
  const categorias = ['__all__', ...new Set((produtos?.data ?? [])
    .map((p: any) => p.categoria).filter(Boolean) as string[])];
  const productosFiltrados = (() => {
    let list = (produtos?.data ?? []) as any[];
    // Filtro categoría
    if (categoriaTab !== '__all__') list = list.filter(p => p.categoria === categoriaTab);
    // Filtro stock
    if (filtroStock === 'con-stock')  list = list.filter(p => Number(p.stock) > 0);
    if (filtroStock === 'sin-stock')  list = list.filter(p => (p as any).tipo !== 'servicio' && Number(p.stock) <= 0);
    if (filtroStock === 'bajo')       list = list.filter(p => Number(p.stock) > 0 && Number(p.stock) <= Number(p.stockMinimo ?? 3));
    // Ordenar
    list = [...list].sort((a, b) => {
      if (orden === 'nombre-az')    return a.nombre.localeCompare(b.nombre);
      if (orden === 'nombre-za')    return b.nombre.localeCompare(a.nombre);
      if (orden === 'precio-asc')   return Number(a.precio) - Number(b.precio);
      if (orden === 'precio-desc')  return Number(b.precio) - Number(a.precio);
      if (orden === 'stock-asc')    return Number(a.stock) - Number(b.stock);
      if (orden === 'stock-desc')   return Number(b.stock) - Number(a.stock);
      return 0;
    });
    return list;
  })();

  // Últimos 12 productos facturados (persistido en localStorage por empresa)
  const productosRecientes = idsRecientes
    .map(id => ((produtos?.data ?? []) as any[]).find((p: any) => p.id === id))
    .filter(Boolean)
    .slice(0, 12) as any[];

  // Obtiene el id del consumidor final de la lista de clientes
  const consumidorFinalId = clientes?.data?.find((c: Cliente) =>
    c.nombre?.toLowerCase().includes('consumidor') ||
    c.rfc === '000000000' || c.rfc === '00000000000' ||
    c.rncReceptor === '000000000' || c.rncReceptor === '00000000000'
  )?.id as number | undefined;

  // Helper: restablecer al consumidor final (en lugar de undefined)
  const resetCliente = () => setClienteId(consumidorFinalId);
  const resetDescGlobal = () => { setDescGlobal(''); setDescGlobalTipo('pct'); };

  const cambiarModoContexto = useCallback((modo: string) => {
    setCart([]);
    setClienteId(consumidorFinalId);
    setDescGlobal('');
    setDescGlobalTipo('pct');
    setModoContexto(modo);
    const eid = localStorage.getItem('empresaId') ?? '';
    localStorage.setItem(`pos_modo_contexto_${eid}`, modo);
  }, [consumidorFinalId]);

  // Auto-seleccionar "Consumidor Final" como cliente por defecto al cargar
  useEffect(() => {
    if (!consumidorFinalId) return;
    setClienteId(prev => prev === undefined ? consumidorFinalId : prev);
  }, [consumidorFinalId]);

  // Cliente seleccionado — RNC desde rncReceptor o rfc
  const clienteSeleccionado = clientes?.data.find((c: Cliente) => c.id === clienteId);
  const rncCliente = String(clienteSeleccionado?.rncReceptor ?? clienteSeleccionado?.rfc ?? '').trim();
  const RNC_GENERICOS = new Set(['000000000', '00000000000', '']);
  const clienteTieneRNC = /^\d{9}$/.test(rncCliente) && !RNC_GENERICOS.has(rncCliente);
  const esClienteGenerico = !clienteId
    || !clienteSeleccionado
    || clienteSeleccionado.nombre?.toLowerCase().includes('consumidor')
    || ['00000000000', '000000000', ''].includes(rncCliente);

  // Totals — si posPrecioIncluyeItbis, el precio ya lleva ITBIS incluido
  const precioIncluyeItbis = (empresa?.configuracion as any)?.posPrecioIncluyeItbis === true;
  const subtotal = round2(cart.reduce((s, i) => {
    const linea = (i.precio - i.descuentoMonto) * i.cantidad;
    if (precioIncluyeItbis) {
      const pct = Number((i.produto as any).porcentajeIva ?? 0) / 100;
      return pct > 0 ? s + linea / (1 + pct) : s + linea;
    }
    return s + linea;
  }, 0));
  const iva = round2(cart.reduce((s, i) => {
    const linea = (i.precio - i.descuentoMonto) * i.cantidad;
    const pct   = Number((i.produto as any).porcentajeIva ?? 0) / 100;
    return precioIncluyeItbis
      ? s + linea * pct / (1 + pct)
      : s + linea * pct;
  }, 0));
  // Descuento global — se aplica sobre el subtotal (antes del ITBIS, base imponible)
  const descGlobalVal   = Math.max(0, parseFloat(descGlobal) || 0);
  const descGlobalMonto = round2(descGlobalTipo === 'pct'
    ? subtotal * descGlobalVal / 100
    : Math.min(descGlobalVal, subtotal));
  const subtotalConDesc = round2(subtotal - descGlobalMonto);
  // ITBIS se recalcula sobre el subtotal descontado (proporcional por ítem)
  const descRatio      = subtotal > 0 ? subtotalConDesc / subtotal : 1;
  const ivaConDesc     = round2(iva * descRatio);
  const total          = round2(subtotalConDesc + ivaConDesc);
  // E44 (Zona Franca): ITBIS = 0 — Opción B: precio base sin ITBIS
  const ivaEfectivo   = tipoNcf === 'E44' ? 0 : ivaConDesc;
  const totalEfectivo = tipoNcf === 'E44' ? subtotalConDesc : total;
  const totalItems    = cart.reduce((s, i) => s + i.cantidad, 0);

  // Config POS — leída aquí para que propina y cambio puedan usarla
  const posConf                  = (empresa?.configuracion ?? {}) as Record<string, unknown>;
  // Aplicar modo por defecto desde configuración si no hay preferencia guardada
  const posModoPorDefecto = (posConf.posModoPorDefecto as string | undefined) ?? 'general';
  useEffect(() => {
    const eid = localStorage.getItem('empresaId') ?? '';
    if (!localStorage.getItem(`pos_modo_contexto_${eid}`) && posModoPorDefecto !== 'general') {
      setModoContexto(posModoPorDefecto);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posModoPorDefecto]);
  const posPermitirStockNegativo = posConf.posPermitirStockNegativo === true;
  const posDescuentoMaximo       = typeof posConf.posDescuentoMaximo === 'number' ? posConf.posDescuentoMaximo : 100;
  const propinaActiva            = posConf.posPropinaActiva === true && tipoPagoPos === 'CONTADO';
  const propinaDefPct    = typeof posConf.posPorcentajePropina === 'number' ? posConf.posPorcentajePropina : 10;
  const propinaNum       = propinaActiva ? (Number(propinaValor) || 0) : 0;
  const propinaMontoCalc = propinaActiva && propinaNum > 0
    ? (propinaTipo === '%' ? +(totalEfectivo * propinaNum / 100).toFixed(2) : +propinaNum.toFixed(2))
    : 0;
  const totalAPagar      = +(totalEfectivo + propinaMontoCalc).toFixed(2);
  // Cambio basado en totalAPagar (incluye propina)
  const cambio           = metodoPago === 'efectivo' ? round2(Math.max(0, montoRecibido - totalAPagar)) : 0;

  // Auto-foco en el input de búsqueda cuando el panel de ítems está activo
  // (mantiene el foco para escaneo continuo con scanner HID)
  useEffect(() => {
    if (panelActivo === 'items' && !showPago && !pantallaBloqueada) {
      const t = setTimeout(() => searchRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [panelActivo, showPago, pantallaBloqueada]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F9' && cart.length > 0) {
        e.preventDefault();
        if (modoFacturacion === 'factura') {
          setMontoRecibido(round2(totalEfectivo));
          if (posConf.posPropinaActiva === true) setPropinaValor(String(propinaDefPct));
          setShowPago(true);
        } else {
          modoAltMut.mutate();
        }
      }
      if (e.key === 'F4') { e.preventDefault(); setCart([]); }
      if (e.key === 'Escape') setSearch('');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, total, totalEfectivo]);

  // Persistir carrito en localStorage — incluye empresaId para validación multi-tenant
  useEffect(() => {
    try {
      const empresaId = localStorage.getItem('empresaId');
      localStorage.setItem('pos-carrito-activo', JSON.stringify({ empresaId, items: cart }));
    }
    catch { /* quota exceeded — ignorar */ }
  }, [cart]);

  // NCF auto-select + reset campos comprador al cambiar cliente
  const onClienteChange = (id: number | undefined) => {
    setClienteId(id);
    setRncComprador(''); setRazonSocialComp(''); setNumeroOrdenCompra(''); setGuardarRncPerfil(false);
    if (!id) { setTipoNcf('E32'); return; }
    const cli = clientes?.data.find((c: Cliente) => c.id === id);
    const rnc = String(cli?.rncReceptor ?? cli?.rfc ?? '').trim();
    setTipoNcf(/^\d{9}$/.test(rnc) ? 'E31' : 'E32');
  };

  // Pre-llenar razón social con el nombre del cliente cuando no tiene RNC registrado
  useEffect(() => {
    if (tipoNcf === 'E32' || clienteTieneRNC) return;
    if (razonSocialComp === '' && clienteSeleccionado?.nombre) {
      setRazonSocialComp(clienteSeleccionado.nombre);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoNcf, clienteId]);

  // Special price
  // Cache de precios especiales por cliente — evita llamadas repetidas
  const precioCache = useRef<Map<string, number | null>>(new Map());
  useEffect(() => { precioCache.current.clear(); }, [clienteId]);

  // Add to cart — agrega inmediatamente al precio base, luego actualiza en background
  const addToCart = useCallback((produto: Prod) => {
    const precioBase = Number(produto.precio);
    const esServicio = (produto as any).tipo === 'servicio';
    const sinStock   = !esServicio && Number(produto.stock) <= 0;

    if (sinStock && !posPermitirStockNegativo) {
      message.error('Stock insuficiente — no hay unidades disponibles');
      return;
    }

    // 1. Agregar al carrito de forma inmediata (sin esperar API)
    setCart(prev => {
      const idx = prev.findIndex(i => i.produto.id === produto.id);
      if (idx >= 0) {
        const u = [...prev];
        const esServicio = (produto as any).tipo === 'servicio';
        // Servicios no tienen límite de stock; productos físicos respetan el stock disponible
        if (esServicio || u[idx].cantidad < Number(produto.stock)) u[idx].cantidad++;
        return u;
      }
      const precioConLista =
        listaGlobal === 'precio2' && (produto as any).precio2 ? Number((produto as any).precio2) :
        listaGlobal === 'precio3' && (produto as any).precio3 ? Number((produto as any).precio3) :
        precioBase;
      return [{ produto, cantidad: 1, precio: precioConLista, descuentoMonto: 0, precioLista: listaGlobal }, ...prev];
    });

    // 2. Si hay cliente, consultar precio especial en background y actualizar
    if (!clienteId) return;
    const cacheKey = `${produto.id}-${clienteId}`;
    if (precioCache.current.has(cacheKey)) {
      const precioEsp = precioCache.current.get(cacheKey);
      if (precioEsp !== null && precioEsp !== undefined) {
        const descPct = Math.round(((precioBase - precioEsp) / precioBase) * 100);
        setCart(prev => prev.map(i =>
          i.produto.id === produto.id ? { ...i, precio: precioEsp, descuento: descPct } : i
        ));
      }
      return;
    }
    api.get(`/precios/calcular?productoId=${produto.id}&clienteId=${clienteId}`)
      .then(r => {
        const d = r.data?.data ?? r.data;
        const precioEsp = d?.origen !== 'precio_base' ? Number(d?.precioFinal) : null;
        precioCache.current.set(cacheKey, precioEsp);
        if (precioEsp) {
          const descPct = Math.round(((precioBase - precioEsp) / precioBase) * 100);
          setCart(prev => prev.map(i =>
            i.produto.id === produto.id ? { ...i, precio: precioEsp, descuento: descPct } : i
          ));
        }
      })
      .catch(() => { precioCache.current.set(cacheKey, null); });
  }, [clienteId, posPermitirStockNegativo, listaGlobal]);

  const updateQty          = (idx: number, delta: number) => setCart(prev => { const u=[...prev]; u[idx].cantidad = Math.min(Number(u[idx].produto.stock), Math.max(1, u[idx].cantidad + delta)); return u; });
  const removeItem         = (idx: number) => setCart(p => p.filter((_, i) => i !== idx));
  const actualizarPrecioItem = (idx: number, nuevoPrecio: number) => {
    if (nuevoPrecio <= 0) return;
    setCart(prev => prev.map((it, i) => i === idx ? { ...it, precio: nuevoPrecio, precioModificado: true } : it));
  };
  const cambiarListaItem = (idx: number, lista: PrecioLista) => {
    setCart(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const p = it.produto;
      const nuevoPrecio =
        lista === 'precio2' && p.precio2 ? Number(p.precio2) :
        lista === 'precio3' && p.precio3 ? Number(p.precio3) :
        Number(p.precio);
      return { ...it, precioLista: lista, precio: nuevoPrecio, precioModificado: false };
    }));
  };

  const aplicarListaGlobal = (lista: PrecioLista) => {
    setListaGlobal(lista);
    setCart(prev => prev.map(it => {
      const p = it.produto;
      const nuevoPrecio =
        lista === 'precio2' && p.precio2 ? Number(p.precio2) :
        lista === 'precio3' && p.precio3 ? Number(p.precio3) :
        Number(p.precio);
      return { ...it, precioLista: lista, precio: nuevoPrecio, precioModificado: false };
    }));
  };
  const setDescuentoMonto = async (idx: number, monto: number) => {
    const precio       = cart[idx]?.precio ?? 0;
    const nombreItem   = cart[idx]?.produto.nombre ?? 'ítem';
    const pct          = precio > 0 ? (monto / precio) * 100 : 0;
    // Verificar descuento máximo configurado (en % internamente, mostrar RD$ al usuario)
    if (posDescuentoMaximo < 100 && pct > posDescuentoMaximo) {
      const maxMonto = precio * posDescuentoMaximo / 100;
      message.error(`Descuento máximo: RD$${maxMonto.toFixed(2)} para este producto`);
      return;
    }
    // Si el modo supervisor está activo y el descuento supera el máximo → pedir autorización
    if (supervisor.supervisorModeEnabled && pct > supervisor.maxDiscountPercent) {
      const maxMonto = precio * supervisor.maxDiscountPercent / 100;
      const ok = await supervisor.requireSupervisor(
        `Descuento de RD$${monto.toFixed(2)} en ${nombreItem}`,
        `Máximo permitido sin supervisor: RD$${maxMonto.toFixed(2)}`,
      );
      if (!ok) return; // cancelado
    }
    setCart(p => { const u=[...p]; u[idx].descuentoMonto = monto; return u; });
  };

  // Búsqueda por código de barras → agrega al carrito directamente
  // handleBarcode: búsqueda en cache local (campo barcode separado — no scanner)
  const handleBarcode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const found = (produtos?.data ?? []).find((p: any) =>
      p.codigo?.toLowerCase() === trimmed.toLowerCase() || String(p.id) === trimmed
    );
    if (found) {
      addToCart(found as Prod);
      setBarcodeInput('');
      message.success(`${(found as any).nombre} agregado`, 1);
    } else {
      message.warning(`Código "${trimmed}" no encontrado`, 2);
      setBarcodeInput('');
    }
  }, [produtos, addToCart]);

  // ── SCANNER HID — listener global con buffer + timeout 500ms ─────────────────
  const procesarScan = useCallback((codigo: string) => {
    const trimmed = codigo.replace(/[\r\n]/g, '').trim();
    if (!trimmed) return;
    console.log('[SCAN] procesarScan código:', trimmed);
    setSearch('');
    api.get(`/productos?search=${encodeURIComponent(trimmed)}&limit=5`)
      .then((r: any) => {
        const raw = r.data?.data ?? r.data;
        const lista: any[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        console.log('[SCAN] lista:', lista.length, lista.map((p: any) => p.codigo));
        const producto = lista.find(
          (p: any) => p.codigo?.toString().trim() === trimmed
        ) ?? (lista.length === 1 ? lista[0] : null);
        console.log('[SCAN] producto:', producto?.nombre ?? 'NO ENCONTRADO');
        if (producto) {
          const esServicio = (producto as any).tipo === 'servicio';
          if (!esServicio && Number(producto.stock) <= 0 && !posPermitirStockNegativo) {
            message.warning(`${producto.nombre}: sin stock`, 2);
            return;
          }
          console.log('[SCAN] llamando addToCart id:', producto.id);
          addToCart(producto as Prod);
          message.success(`✓ ${producto.nombre}`, 1);
          setScanFlash(true);
          setTimeout(() => setScanFlash(false), 600);
        } else {
          message.error(`Código ${trimmed} no encontrado`, 2);
        }
      })
      .catch((err: any) => {
        console.error('[SCAN] error API:', err?.response?.status, err?.message);
        message.error(`Error buscando: ${err?.message}`, 2);
      })
      .finally(() => setTimeout(() => searchRef.current?.focus(), 50));
  }, [addToCart]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target  = e.target as HTMLElement;
      const isModal = !!target.closest('.ant-modal');
      const tag     = target.tagName;

      if (isModal) return;
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && target !== searchRef.current) return;

      if (e.key === 'Enter') {
        const codigo = scanBuffer.current.trim();
        if (scanTimer.current) clearTimeout(scanTimer.current);
        scanBuffer.current = '';

        if (target === searchRef.current) {
          // Distinguir scanner (chars rápidos < 100ms) de tipeo manual (lento)
          const msSinceLastChar = Date.now() - lastKeyTimeRef.current;
          const esScanner = fastCharCountRef.current >= 3 && msSinceLastChar < 150;
          fastCharCountRef.current = 0;
          if (esScanner && codigo.length >= 4) {
            e.preventDefault();
            e.stopPropagation();
            procesarScan(codigo);
          }
          // Si no es scanner → dejar que onKeyDown del input maneje el Enter
          return;
        }

        // Enter desde fuera del buscador (scanner con foco en otro lado)
        if (codigo.length >= 4) {
          e.preventDefault();
          e.stopPropagation();
          procesarScan(codigo);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now();
        const delta = now - lastKeyTimeRef.current;
        lastKeyTimeRef.current = now;
        if (delta < 100) { fastCharCountRef.current++; }
        else { fastCharCountRef.current = 1; }
        if (scanBuffer.current.length === 0) console.log('[SCAN] inicio buffer...');
        scanBuffer.current += e.key;
        if (scanTimer.current) clearTimeout(scanTimer.current);
        // Si en 400ms no llega más input → procesar como scan (scanner sin Enter)
        scanTimer.current = setTimeout(() => {
          const codigo = scanBuffer.current.trim();
          scanBuffer.current = '';
          console.log('[SCAN] timeout → procesar:', JSON.stringify(codigo), 'len:', codigo.length);
          if (codigo.length >= 4) {
            procesarScan(codigo);
          }
        }, 400);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (scanTimer.current) clearTimeout(scanTimer.current);
    };
  }, [procesarScan]);

  // Hold sales
  const parkSale = () => {
    if (!cart.length) return;
    setVentasEnEspera(prev => [...prev, { id: Date.now().toString(), items: [...cart], clienteId, label: `Venta ${prev.length + 1} — ${fmt.money(total)}` }]);
    setCart([]); resetCliente();
    message.info('Venta guardada en espera');
  };
  const restoreSale = (id: string) => {
    const v = ventasEnEspera.find(x => x.id === id);
    if (!v) return;
    setCart(v.items); setClienteId(v.clienteId);
    setVentasEnEspera(prev => prev.filter(x => x.id !== id));
  };

  // Sale mutation — con soporte offline
  const ventaMut = useMutation({
    mutationFn: async () => {
      const vendedor = vendedores.find((v: any) => v.id === vendedorId);
      const tipoEcfNum = Number(tipoNcf.replace('E', ''));
      const payload = {
        clienteId: clienteId ?? (
          clientes?.data?.find((c: Cliente) =>
            c.nombre?.toLowerCase().includes('consumidor') ||
            c.rfc === '00000000000' || c.rfc === '000000000'
          )?.id ?? clientes?.data?.[0]?.id ?? 1
        ),
        fecha:          dayjs().format('YYYY-MM-DD'),
        tipoNcf,
        tipoPago:       tipoPagoPos,
        diasCredito:    tipoPagoPos === 'CREDITO' ? diasCreditoPos : 0,
        notas:          tipoPagoPos === 'CREDITO'
          ? `POS · Crédito ${diasCreditoPos} días`
          : `POS · ${METODOS.find(m => m.key === metodoPago)?.label ?? metodoPago}${propinaMontoCalc > 0 ? ` · Propina: RD$${propinaMontoCalc.toFixed(2)}` : ''}`,
        vendedorId,
        nombreVendedor: vendedor?.nombre,
        sucursalId,
        moneda:      monedaPOS,
        tipoCambio:  monedaPOS !== 'DOP' ? tasaCambioPOS : undefined,
        detalles: cart.map(i => ({
          productoId:          i.produto.id > 0 ? i.produto.id : undefined,
          opticaInventarioId:  (i.produto as any).opticaInventarioId ?? undefined,
          cantidad:            i.cantidad,
          precioUnitario:      i.precio - i.descuentoMonto,
          descripcion:         i.produto.nombre,
          descuentoMonto:      i.descuentoMonto,
          precioOriginal:      i.descuentoMonto > 0 ? i.precio : undefined,
          // E44 (Zona Franca): ITBIS = 0 en todos los ítems
          ...(tipoNcf === 'E44' ? { porcentajeIva: 0 } : {}),
        })),
      };

      // Si offline → encolar localmente
      if (!navigator.onLine) {
        const offlineId = await enqueue(payload);
        return {
          id:    -1,
          folio: `POS-OFFLINE-${offlineId.slice(-6).toUpperCase()}`,
          _offline: true,
        } as any;
      }

      const factura = await facturasApi.create(payload);

      // Emitir desde POS (síncrono 8s — la venta no se bloquea si tu proveedor e-CF falla)
      setEcfStatus('loading');

      // Guardar RNC en el perfil del cliente si el cajero marcó el checkbox
      if (guardarRncPerfil && clienteId && rncComprador && !clienteTieneRNC) {
        clientesApi.update(clienteId, { rfc: rncComprador }).then(() => {
          qc.invalidateQueries({ queryKey: ['clientes-pos'] });
        }).catch(() => {});
      }

      // Construir datosComprador: desde el cliente si tiene RNC, o desde el formulario
      const datosComprador = clienteTieneRNC
        ? {
            rnc:         rncCliente,
            razonSocial: clienteSeleccionado?.nombre,
            direccion:   clienteSeleccionado?.direccion,
          }
        : {
            ...(rncComprador    ? { rnc:              rncComprador }    : {}),
            ...(razonSocialComp ? { razonSocial:       razonSocialComp } : {}),
            ...(tipoNcf === 'E45' && numeroOrdenCompra ? { numeroOrdenCompra } : {}),
          };

      try {
        const emitResult = await facturasApi.emitirPos(factura.id, {
          tipoEcf:          tipoEcfNum,
          datosComprador:   Object.keys(datosComprador).length ? datosComprador : undefined,
          // Modo contingencia proactivo: no intentar MSeller, guardar directamente en CONTINGENCIA
          modoContingencia: posConf.posModoContingencia === true || undefined,
        }) as any;
        const encf  = emitResult?.encf ?? emitResult?.numero ?? '';
        const estado = emitResult?.estado ?? emitResult?.estadoDGII ?? '';
        setEcfEncf(encf);
        setEcfStatus(['pendiente_envio', 'pendiente', 'contingencia'].includes(estado) ? 'pendiente' : 'ok');
        return { factura, ecfResult: emitResult };
      } catch {
        setEcfStatus('pendiente');
        return { factura, ecfResult: null };
      }
    },
    onSuccess: (result) => {
      const factura = (result as any)?.factura ?? result;
      const ecfResult = (result as any)?.ecfResult;
      if ((factura as any)._offline) {
        message.warning(`Venta guardada offline (${factura.folio}). Se sincronizará al reconectarse.`, 5);
      }
      const encfFinal    = ecfResult?.encf ?? (ecfEncf || undefined);
      const securityCode = ecfResult?.securityCode ?? undefined;
      const qrUrl        = ecfResult?.qrUrl ?? undefined;
      const estadoEcf    = ecfResult?.estado ?? ecfResult?.estadoDGII ?? '';
      const ecfFecha     = ecfResult?.ecf?.ultimoIntentoEnvio
        ? dayjs(ecfResult.ecf.ultimoIntentoEnvio).format('DD-MM-YYYY HH:mm:ss')
        : dayjs().format('DD-MM-YYYY HH:mm:ss');
      const saleObj: Sale = {
        folio:                   factura.folio,
        total:                   totalAPagar,
        cambio,
        pagoRecibido:            metodoPago === 'efectivo' && montoRecibido > 0 ? montoRecibido : undefined,
        propina:                 propinaMontoCalc > 0 ? propinaMontoCalc : undefined,
        metodo:                  tipoPagoPos === 'CREDITO' ? 'credito' : metodoPago,
        notas:                   tipoPagoPos === 'CREDITO' ? `Crédito ${diasCreditoPos} días` : undefined,
        diasCredito:             tipoPagoPos === 'CREDITO' ? diasCreditoPos : undefined,
        clienteId:               clienteId ?? undefined,
        items:                   [...cart],
        cliente:                 clientes?.data.find((c: Cliente) => c.id === clienteId)?.nombre,
        iva:                     ivaEfectivo,
        subtotal,
        descuentoGlobal:         descGlobalMonto > 0 ? descGlobalMonto : undefined,
        facturaId:               factura.id > 0 ? factura.id : undefined,
        tipoNcf,
        encf:                    encfFinal,
        ecfPendiente:            ['pendiente_envio', 'pendiente', 'contingencia'].includes(estadoEcf),
        ecfFecha,
        rncComprador:            clienteTieneRNC ? rncCliente : (rncComprador || undefined),
        razonSocial:             clienteTieneRNC ? clienteSeleccionado?.nombre : (razonSocialComp || undefined),
        securityCode,
        qrUrl,
        cajero:                  cajeroNombre,
        sucursalNombre:          sucursalNombreFromCache(qc),
        empresaNombreComercial:  empresa?.nombre ?? empresaNombre,
        empresaRnc:              empresa?.rnc ?? undefined,
        empresaDireccion:        empresa?.direccion ?? undefined,
        empresaTelefono:         empresa?.telefono ?? undefined,
        modoContexto,
      };
      // Auto-imprimir con ventana pre-abierta — mantiene el gesto del usuario en tablets iOS/Android
      if (printWinRef.current && !printWinRef.current.closed) {
        const pw = printWinRef.current;
        printWinRef.current = null;
        autoYaPrintedRef.current = true;
        const _mostrarEcf = posConf.posMostrarEcfEnRecibo !== false;
        const _pCfg = { tipoImpresora: posConf.posTipoImpresora as string | undefined, mensajeTicket: posConf.posMensajeTicket as string | undefined, politicaDev: posConf.posPoliticaDev as string | undefined };
        const doprint = (qr: string | null) => {
          const html = buildReciboTermicoHTML(saleObj, qr, { mostrarEcf: _mostrarEcf, ..._pCfg });
          if (pw.closed) { imprimirReciboTermico(html); return; }
          pw.document.open(); pw.document.write(html); pw.document.close(); pw.focus();
          // El HTML del recibo auto-imprime en load y cierra en afterprint.
          pw.addEventListener('afterprint', () => { try { pw.close(); } catch { /* noop */ } }, { once: true });
          setTimeout(() => { try { if (!pw.closed) pw.close(); } catch { /* noop */ } }, 30_000);
        };
        if (qrUrl && !saleObj.ecfPendiente) {
          QRCode.toDataURL(qrUrl, { width: 130, margin: 1, errorCorrectionLevel: 'M' }).then(doprint).catch(() => doprint(null));
        } else {
          doprint(null);
        }
      }
      setSale(saleObj);
      // Persistir los últimos 12 productos facturados por empresa
      const _eid = localStorage.getItem('empresaId') ?? '';
      const _nuevosIds = saleObj.items.map((i: CartItem) => i.produto.id as number);
      const _prevIds: number[] = (() => { try { return JSON.parse(localStorage.getItem(`pos_recientes_${_eid}`) ?? '[]'); } catch { return []; } })();
      const _merged = [..._nuevosIds, ..._prevIds.filter((id: number) => !_nuevosIds.includes(id))].slice(0, 12);
      localStorage.setItem(`pos_recientes_${_eid}`, JSON.stringify(_merged));
      setIdsRecientes(_merged);
      setShowPago(false);
      setRncComprador(''); setRazonSocialComp(''); setNumeroOrdenCompra(''); setGuardarRncPerfil(false);
      setCart([]); resetCliente(); setMontoRecibido(0);
      setTipoPagoPos('CONTADO'); setDiasCreditoPos(30); setPropinaValor(''); resetDescGlobal();

      // ── Acciones post-cobro por modo de contexto ───────────────────────────
      if (contextoActualId) {
        if (modoContexto === 'taller') {
          tallerApi.actualizarOrden(contextoActualId, { estado: 'entregada' })
            .then(() => qc.invalidateQueries({ queryKey: ['pos-taller-ordenes'] }))
            .catch((e: any) => console.error('[POS Taller post-cobro]', e));
        } else if (modoContexto === 'optica') {
          opticaApi.entregarOrden(contextoActualId, { montoCobrado: totalAPagar, metodoPago })
            .then(() => qc.invalidateQueries({ queryKey: ['pos-optica-ordenes'] }))
            .catch((e: any) => console.error('[POS Óptica post-cobro]', e));
        } else if (modoContexto === 'clinica') {
          clinicaApi.cambiarEstadoCita(contextoActualId, 'atendida')
            .then(() => qc.invalidateQueries({ queryKey: ['pos-clinica-citas'] }))
            .catch((e: any) => console.error('[POS Clínica post-cobro]', e));
        }
        setContextoActualId(null);
      }

      qc.invalidateQueries({ queryKey: ['pos-panel', 'facturas'] });
      qc.refetchQueries({    queryKey: ['pos-panel', 'facturas'] });
    },
    onError: (e: any) => {
      if (printWinRef.current && !printWinRef.current.closed) { printWinRef.current.close(); printWinRef.current = null; autoYaPrintedRef.current = false; }
      setEcfStatus('idle');
      const msg: string = e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? '';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('23505')) {
        message.error('Error al generar el número de factura. Intente nuevamente.', 5);
      } else {
        message.error(msg || 'Error al procesar la venta');
      }
    },
  });

  // ── Mutación para modos alternativos (sin cobro) ────────────────────────────
  const modoAltMut = useMutation({
    mutationFn: async () => {
      const detalles = cart.map(i => ({
        productoId:         i.produto.id > 0 ? i.produto.id : undefined,
        descripcion:        i.produto.nombre,
        cantidad:           i.cantidad,
        precioUnitario:     i.precio - i.descuentoMonto,
        porcentajeIva:      Number((i.produto as any).porcentajeIva ?? 18),
      }));
      const base = {
        clienteId: clienteId ?? undefined,
        fecha:     dayjs().format('YYYY-MM-DD'),
        detalles,
        vendedorId, nombreVendedor: vendedores.find((v: any) => v.id === vendedorId)?.nombre,
        sucursalId,
        notas: `POS · ${MODOS_FACTURACION.find(m => m.id === modoFacturacion)?.label}`,
      };

      if (modoFacturacion === 'cotizacion') {
        return api.post('/cotizaciones', { ...base, validezDias: 30 });
      }
      if (modoFacturacion === 'pro-forma') {
        return api.post('/pro-formas', { ...base, validezDias: 30 });
      }
      if (modoFacturacion === 'pre-factura') {
        return api.post('/pre-facturas', { ...base, tipoNcf: tipoNcf });
      }
      if (modoFacturacion === 'conduce') {
        const cliente = clientes?.data.find((c: Cliente) => c.id === clienteId);
        return api.post('/conduces', {
          ...base,
          direccionEntrega: cliente?.direccion ?? 'Por definir',
          contactoEntrega:  cliente?.nombre,
        });
      }
      // valor-fiscal → factura normal
      return facturasApi.create({ ...base, tipoNcf, clienteId: base.clienteId ?? 1 });
    },
    onSuccess: () => {
      const modo = MODOS_FACTURACION.find(m => m.id === modoFacturacion);
      message.success(`${modo?.icon} ${modo?.label} creada exitosamente`);
      // Invalidar el panel correspondiente para que se actualice automáticamente
      const panelMap: Record<string, string> = {
        'cotizacion':  'cotizaciones',
        'pro-forma':   'pro-formas',
        'pre-factura': 'pre-facturas',
        'conduce':     'conduce',
      };
      const panelKey = panelMap[modoFacturacion];
      if (panelKey) {
        // invalidate (marca stale) + refetch (fuerza actualización inmediata si está montado)
        qc.invalidateQueries({ queryKey: ['pos-panel', panelKey] });
        qc.refetchQueries({ queryKey: ['pos-panel', panelKey] });
        // Navegar al panel recién creado para que el usuario vea el resultado
        setPanelActivo(panelKey as PanelId);
      }
      setCart([]); resetCliente();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear documento'),
  });

  // User info
  const empresaNombre = localStorage.getItem('empresa_nombre') || localStorage.getItem('empresaNombre') || 'HiCloud ERP';
  const cajeroNombreResuelto = vendedores.find((v: any) => v.id === vendedorId)?.nombre;
  // Cachear en localStorage cuando se resuelve para que persista si vendedores se vacía
  useEffect(() => {
    if (cajeroNombreResuelto) localStorage.setItem('pos_cajero_nombre', cajeroNombreResuelto);
  }, [cajeroNombreResuelto]);
  const cajeroNombre = cajeroNombreResuelto
    || localStorage.getItem('pos_cajero_nombre')
    || user?.nombre
    || 'Cajero';

  // ── Desbloquear pantalla (verifica contra backend) ─────────────────────────
  const desbloquearPantalla = async () => {
    if (!pwDesbloqueo.trim()) { setErrDesbloqueo('Ingresa tu contraseña'); return; }
    // Bloqueo temporal tras 3 intentos fallidos
    if (bloqueadoHasta > Date.now()) {
      const seg = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
      setErrDesbloqueo(`Demasiados intentos. Espera ${seg}s o llama a tu supervisor.`);
      return;
    }
    setDesbloqueando(true); setErrDesbloqueo('');
    try {
      await api.post('/auth/verificar-password', { password: pwDesbloqueo });
      // Éxito → limpiar contadores y desbloquear
      sessionStorage.removeItem('pos_bloqueado');
      setPantallaBloqueada(false); setPwDesbloqueo('');
      setIntentosFallidos(0); setBloqueadoHasta(0);
    } catch (e: any) {
      // 400 = contraseña incorrecta (NO cierra sesión)
      // 401 = sesión realmente expirada (el interceptor lo maneja)
      const nuevoConteo = intentosFallidos + 1;
      setIntentosFallidos(nuevoConteo);
      setPwDesbloqueo('');
      if (nuevoConteo >= 3) {
        setBloqueadoHasta(Date.now() + 30_000);
        setErrDesbloqueo('Demasiados intentos fallidos. Espera 30 segundos o llama a tu supervisor.');
        setIntentosFallidos(0);
      } else {
        const msg = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Contraseña incorrecta';
        setErrDesbloqueo(`${msg} (intento ${nuevoConteo}/3)`);
      }
    } finally { setDesbloqueando(false); }
  };

  // ── Cambiar usuario: login con credenciales del nuevo usuario ─────────────
  const ejecutarCambioUsuario = async () => {
    if (!cambiarUserId) { setErrCambio('Selecciona un usuario'); return; }
    if (!pwCambio.trim()) { setErrCambio('Ingresa la contraseña'); return; }
    setCambiandoUser(true); setErrCambio('');
    const usuario = usuariosEmpresa.find((u: any) => u.id === cambiarUserId);
    if (!usuario?.email) { setErrCambio('Usuario inválido'); setCambiandoUser(false); return; }
    try {
      await api.post('/auth/login', { email: usuario.email, password: pwCambio });
      // Login exitoso → limpiar datos del cajero anterior y recargar
      sessionStorage.removeItem('pos_bloqueado');
      localStorage.removeItem('pos_cajero_nombre');
      localStorage.removeItem('pos_vendedor_id');
      setModalCambiarUser(false);
      window.location.reload();
    } catch (e: any) {
      setErrCambio(e?.response?.data?.errors?.[0] ?? 'Usuario o contraseña incorrectos');
      setPwCambio('');
    } finally { setCambiandoUser(false); }
  };

  // ── Verificar supervisor (admin password) ──────────────────────────────────
  const verificarSupervisor = async () => {
    if (!pwSupervisor.trim()) { setErrSupervisor('Ingresa tu contraseña'); return; }
    setVerificandoSup(true); setErrSupervisor('');
    try {
      await api.post('/auth/verificar-password', { password: pwSupervisor });
      setSupervisorOk(true); setModalSupervisor(false); setPwSupervisor('');
      message.success('Modo supervisor activo');
    } catch {
      setErrSupervisor('Contraseña incorrecta');
      setPwSupervisor('');
    } finally { setVerificandoSup(false); }
  };

  // ── Confirmar salida ────────────────────────────────────────────────────────
  // Salir del POS → dashboard (sin cerrar sesión)
  const salirDelPOS = () => {
    Modal.confirm({
      title: '¿Salir del Punto de Venta?',
      content: 'Serás redirigido al dashboard. La sesión permanece activa.',
      okText: 'Salir', cancelText: 'Cancelar',
      onOk: () => {
        sessionStorage.removeItem('pos_turno');
        navigate('/dashboard');
      },
    });
  };

  // Cerrar sesión completa → login (solo desde pantalla bloqueada)
  const cerrarSesion = async () => {
    sessionStorage.removeItem('pos_bloqueado');
    await api.post('/auth/logout').catch(() => {});
    navigate('/login');
  };

  // ── Timer de inactividad (5 min) ───────────────────────────────────────────
  const inactividadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const INACTIVIDAD_MS = 5 * 60 * 1000;
    const reset = () => {
      if (inactividadRef.current) clearTimeout(inactividadRef.current);
      if (!pantallaBloqueada && turnoAbierto) {
        inactividadRef.current = setTimeout(() => {
          sessionStorage.setItem('pos_bloqueado', 'true');
          setPantallaBloqueada(true);
          setPwDesbloqueo('');
          setErrDesbloqueo('');
        }, INACTIVIDAD_MS);
      }
    };
    const eventos = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    eventos.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      if (inactividadRef.current) clearTimeout(inactividadRef.current);
      eventos.forEach(e => window.removeEventListener(e, reset));
    };
  }, [pantallaBloqueada, turnoAbierto]);

  // necesitaRnc: el tipo lo exige Y el cliente no lo aporta automáticamente
  const posCedulaMonto = typeof posConf.posCedulaMonto === 'number' ? posConf.posCedulaMonto : 250_000;
  const tipoExigeRnc = tipoNcf === 'E31' || tipoNcf === 'E44' || tipoNcf === 'E45' || totalEfectivo >= posCedulaMonto;
  const necesitaRnc  = tipoExigeRnc && !clienteTieneRNC;
  const rncValido    = clienteTieneRNC || /^\d{9}$|^\d{11}$/.test(rncComprador);
  const canPay       = tipoPagoPos === 'CREDITO' || metodoPago !== 'efectivo' || montoRecibido >= totalAPagar;
  const cajaAbierta  = cajaActivaHoy?.estado === 'abierta';
  // Crédito requiere cliente real seleccionado (no consumidor final por defecto)
  const clienteParaCredito = tipoPagoPos === 'CONTADO' || clienteId != null;
  const canCheckout  = canPay && (!tipoExigeRnc || rncValido) && cajaAbierta && clienteParaCredito;

  // Enter / NumpadEnter confirma el cobro cuando el modal de pago está abierto
  useEffect(() => {
    if (!showPago) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.code !== 'NumpadEnter') return;
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (!canCheckout || ventaMut.isPending) return;
      ventaMut.mutate();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showPago, canCheckout, ventaMut.isPending]);

  return (
    <ThemeCtx.Provider value={palette}>
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column',
      background: palette.bg, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      color: palette.text, overflow: 'hidden',
    }}>
      <ModalAperturaTurno open={!turnoAbierto} vendedores={vendedores} sucursales={sucursales}
        onAbrir={async (m, vid, sid) => {
          if (vid) {
            setVendedorId(vid);
            localStorage.setItem('pos_vendedor_id', String(vid));
          }
          if (sid) {
            try {
              const res = await api.post('/auth/cambiar-sucursal', { sucursalId: sid });
              const data = res.data?.data ?? res.data;
              setSucursalActualPOS(data.sucursalActual ?? sid);
              setAlmacenActualPOS(data.almacenActual ?? null);
              if (data.sucursalNombre) localStorage.setItem('pos_sucursal_nombre', data.sucursalNombre);
              const sucId = data.sucursalActual ?? sid;
              setSucursalId(sucId);
              localStorage.setItem('sucursalId', String(sucId));
              localStorage.setItem('pos_sucursal_id', String(sucId));
              qc.clear();
            } catch (err: any) {
              message.error(err?.response?.data?.message ?? 'Error al cambiar sucursal');
              setSucursalId(sid);
              localStorage.setItem('sucursalId', String(sid));
              localStorage.setItem('pos_sucursal_id', String(sid));
            }
          }
          setTurnoAbierto(true);
          sessionStorage.setItem('pos_turno', '1');
          qc.invalidateQueries({ queryKey: ['pos-caja-hoy'] });
          if (vid) qc.invalidateQueries({ queryKey: ['pos-caja-abierta', vid] });
        }}
        onCancelar={() => navigate('/dashboard')} />
      <ModalExito sale={sale} onNueva={() => setSale(null)}
        onCrearConduce={() => { setSale(null); setPanelActivo('conduce'); }}
        autoImprimir={empresa?.configuracion?.posImpresionAuto === true && !autoYaPrintedRef.current}
        mostrarEcf={posConf.posMostrarEcfEnRecibo !== false}
        posConfig={{
          tipoImpresora: posConf.posTipoImpresora as string | undefined,
          mensajeTicket: posConf.posMensajeTicket as string | undefined,
          politicaDev:   posConf.posPoliticaDev   as string | undefined,
        }} />
      <POSNotaCreditoModal open={showNotaCredito} onClose={() => setShowNotaCredito(false)} palette={palette}
        requireSupervisor={supervisor.supervisorModeEnabled ? supervisor.requireSupervisor : undefined} />

      {/* Indicador de ventas offline pendientes */}
      {pendingCount > 0 && (
        <div style={{ position:'fixed', bottom:16, right:16, zIndex:300,
          background: isSyncing ? '#2563EB' : '#D97706', color:'#fff',
          borderRadius:12, padding:'10px 16px', boxShadow:'0 4px 16px rgba(0,0,0,.3)',
          display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:600 }}>
          {isSyncing ? '⏳ Sincronizando...' : `📶 ${pendingCount} venta(s) offline`}
          {!isSyncing && navigator.onLine && (
            <button onClick={sync} style={{ background:'rgba(255,255,255,.2)', border:'none',
              borderRadius:6, color:'#fff', cursor:'pointer', padding:'3px 8px', fontSize:12 }}>
              Sincronizar
            </button>
          )}
        </div>
      )}

      <TopBar empresaNombre={empresaNombre} cajeroNombre={cajeroNombre} isOffline={isOffline}
        modoFacturacion={modoFacturacion} onModoChange={setModoFacturacion}
        tipoNcf={tipoNcf} onTipoNcfChange={setTipoNcf}
        ecfOnline={ecfOnline ?? null}
        supervisorActiveBadge={supervisor.supervisorActive ? supervisor.supervisorName : undefined}
        onDesactivarSupervisor={supervisor.supervisorActive ? () => { supervisor.clearSupervisor(); message.info('Modo supervisor desactivado'); } : undefined}
        onBloquear={() => { sessionStorage.setItem('pos_bloqueado', 'true'); setPantallaBloqueada(true); setPwDesbloqueo(''); setErrDesbloqueo(''); }}
        onSupervisor={() => supervisor.openSupervisorModal('Activar modo supervisor')}
        onCambiarUsuario={() => { setModalCambiarUser(true); setCambiarUserId(undefined); setPwCambio(''); setErrCambio(''); }}
        requireSupervisor={supervisor.supervisorModeEnabled ? supervisor.requireSupervisor : undefined}
        onExit={salirDelPOS}
        modosPOS={MODOS_POS}
        modoContexto={modoContexto}
        onModoContextoChange={cambiarModoContexto}
        listaGlobal={listaGlobal}
        onListaGlobalChange={aplicarListaGlobal} />

      {/* Tab bar mobile — cambia entre productos y carrito */}
      {isMobile && (
        <div style={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: C.topbar }}>
          {(['productos', 'carrito'] as const).map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: mobileTab === tab ? C.blue : C.textSub,
              fontSize: 13, fontWeight: mobileTab === tab ? 700 : 500,
              borderBottom: mobileTab === tab ? `2px solid ${C.blue}` : '2px solid transparent',
              outline: 'none',
            }}>
              {tab === 'productos'
                ? '🛍️ Productos'
                : `🛒 Carrito${totalItems > 0 ? ` (${totalItems})` : ''}`}
            </button>
          ))}
        </div>
      )}

      {/* Layout principal: columna izquierda (productos + nav) y columna derecha (carrito) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Columna izquierda: productos + barra nav inferior */}
        <div style={{ flex: 1, display: isMobile && mobileTab === 'carrito' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Center: productos o panel activo */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
        {panelActivo !== 'items' && (
          <POSPanel
            panel={panelActivo}
            palette={palette}
            onVolver={() => setPanelActivo('items')}
            confirmarAnulacion={posConf.posConfirmarAnulacion !== false}
            permitirAnularFacturas={posConf.posPermitirAnularFacturas !== false}
            tiempoLimiteAnular={typeof posConf.posTiempoLimiteAnular === 'number' ? posConf.posTiempoLimiteAnular : 0}
            requireSupervisor={supervisor.supervisorModeEnabled ? supervisor.requireSupervisor : undefined}
            supervisorActive={supervisor.supervisorActive || !supervisor.supervisorModeEnabled}
            requireSupervisorForced={supervisor.requireSupervisorForced}
          />
        )}
        {panelActivo === 'items' && (<>
          {modoContexto === 'restaurante' ? (
            <RestaurantePOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} />
          ) : modoContexto === 'taller' ? (
            <TallerPOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} onContextoLoaded={setContextoActualId} />
          ) : modoContexto === 'farmacia' ? (
            <FarmaciaPOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} />
          ) : modoContexto === 'optica' ? (
            <OpticaPOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} onContextoLoaded={setContextoActualId} />
          ) : modoContexto === 'clinica' ? (
            <ClinicaPOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} onContextoLoaded={setContextoActualId}
              precioConsultaDefault={Number(posConf.posPrecioConsultaClinica ?? 0) || undefined} />
          ) : modoContexto === 'gimnasio' ? (
            <GimnasioPOS palette={palette} addToCart={addToCart} empresaId={String(localStorage.getItem('empresaId') ?? '')} />
          ) : (<>

          {/* ── Barra superior modernizada ─────────────────────────────── */}
          <div style={{ padding: '10px 14px 0', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
            {/* Fila 1: búsqueda + acciones */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {/* Search */}
              <div style={{ flex: 1, position: 'relative' }}>
                <SearchOutlined style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color: C.textSub, fontSize:14, zIndex:1 }} />
                <input ref={searchRef} value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto... (F2)"
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    const q = search.trim();
                    if (!q) return;
                    const all = (produtos?.data ?? []) as any[];
                    const qL = q.toLowerCase();
                    // 1. Coincidencia exacta por código o código de barras
                    const exacto = all.find((p: any) =>
                      p.codigo?.trim().toLowerCase() === qL ||
                      p.codigoBarras?.trim().toLowerCase() === qL
                    );
                    if (exacto) { addToCart(exacto as Prod); setSearch(''); return; }
                    // 2. Una sola coincidencia en la grilla filtrada → agregar directo
                    if (productosFiltrados.length === 1) { addToCart(productosFiltrados[0] as Prod); setSearch(''); return; }
                    // 3. Varias coincidencias → la grilla ya muestra las opciones, no hacer nada
                    if (productosFiltrados.length > 1) return;
                    // 4. Cero resultados
                    message.warning(`No se encontraron productos con "${q}"`, 2);
                  }}
                  style={{ width:'100%', height:38, paddingLeft:34, paddingRight:search?30:12,
                    background: scanFlash ? (C===darkC ? '#064e3b' : '#d1fae5') : C.card,
                    border:`1px solid ${scanFlash ? '#10B981' : C.border}`,
                    borderRadius:10, color:C.text, fontSize:13, outline:'none', boxSizing:'border-box',
                    transition: 'background 0.2s, border-color 0.2s' }} />
                {search && (
                  <button onClick={()=>setSearch('')} style={{ position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',color:C.textSub,cursor:'pointer',fontSize:14,outline:'none' }}>✕</button>
                )}
              </div>
              {/* ── Botón FILTRAR ── */}
              <div style={{ position:'relative' }}>
                <button
                  onClick={() => { setShowFiltros(v=>!v); setShowOrden(false); }}
                  style={{
                    height:38, padding:'0 14px', borderRadius:10,
                    border:`1px solid ${filtroStock!=='todos'||showFiltros ? C.blue : C.border2}`,
                    background: filtroStock!=='todos'||showFiltros ? (C===darkC?'rgba(59,130,246,.2)':'#EFF6FF') : C.card,
                    color: filtroStock!=='todos'||showFiltros ? C.blue : C.text,
                    fontSize:12, fontWeight:600, cursor:'pointer', outline:'none',
                    display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                  }}>
                  <span style={{fontSize:14}}>⊟</span> Filtrar
                  {filtroStock!=='todos' && <span style={{ background:C.blue, color:'#fff', borderRadius:10, padding:'0 5px', fontSize:10 }}>1</span>}
                </button>
                {showFiltros && (
                  <>
                    <div onClick={()=>setShowFiltros(false)} style={{position:'fixed',inset:0,zIndex:200}}/>
                    <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, zIndex:201,
                      background:C.card, border:`1px solid ${C.border2}`, borderRadius:10,
                      overflow:'hidden', minWidth:180, boxShadow:'0 8px 24px rgba(0,0,0,.15)' }}>
                      {[
                        { id:'todos',      label:'Todos los productos', icon:'📦' },
                        { id:'con-stock',  label:'Con stock disponible',icon:'✅' },
                        { id:'sin-stock',  label:'Sin stock',           icon:'❌' },
                        { id:'bajo',       label:'Stock bajo mínimo',   icon:'⚠️' },
                      ].map((f,i) => (
                        <button key={f.id}
                          onClick={()=>{ setFiltroStock(f.id as any); setShowFiltros(false); }}
                          style={{
                            width:'100%', padding:'10px 14px', border:'none',
                            borderBottom:i<3?`1px solid ${C.border}`:'none',
                            background:filtroStock===f.id?(C===darkC?'rgba(59,130,246,.15)':'#EFF6FF'):'transparent',
                            color:filtroStock===f.id?C.blue:C.text,
                            cursor:'pointer', outline:'none', textAlign:'left',
                            display:'flex', alignItems:'center', gap:10, fontSize:13,
                          }}>
                          <span style={{fontSize:16}}>{f.icon}</span>
                          <span style={{fontWeight:filtroStock===f.id?700:400}}>{f.label}</span>
                          {filtroStock===f.id && <span style={{marginLeft:'auto',color:C.blue}}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* ── Botón ORDENAR ── */}
              <div style={{ position:'relative' }}>
                <button
                  onClick={() => { setShowOrden(v=>!v); setShowFiltros(false); }}
                  style={{
                    height:38, padding:'0 14px', borderRadius:10,
                    border:`1px solid ${orden!=='nombre-az'||showOrden ? C.blue : C.border2}`,
                    background: orden!=='nombre-az'||showOrden ? (C===darkC?'rgba(59,130,246,.2)':'#EFF6FF') : C.card,
                    color: orden!=='nombre-az'||showOrden ? C.blue : C.text,
                    fontSize:12, fontWeight:600, cursor:'pointer', outline:'none',
                    display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                  }}>
                  <span style={{fontSize:14}}>⇅</span> Ordenar
                </button>
                {showOrden && (
                  <>
                    <div onClick={()=>setShowOrden(false)} style={{position:'fixed',inset:0,zIndex:200}}/>
                    <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, zIndex:201,
                      background:C.card, border:`1px solid ${C.border2}`, borderRadius:10,
                      overflow:'hidden', minWidth:200, boxShadow:'0 8px 24px rgba(0,0,0,.15)' }}>
                      {[
                        { id:'nombre-az',   label:'Nombre A → Z',       icon:'🔤' },
                        { id:'nombre-za',   label:'Nombre Z → A',       icon:'🔤' },
                        { id:'precio-asc',  label:'Precio: menor a mayor', icon:'💲' },
                        { id:'precio-desc', label:'Precio: mayor a menor', icon:'💲' },
                        { id:'stock-desc',  label:'Mayor stock primero', icon:'📦' },
                        { id:'stock-asc',   label:'Menor stock primero', icon:'📦' },
                      ].map((o,i) => (
                        <button key={o.id}
                          onClick={()=>{ setOrden(o.id as any); setShowOrden(false); }}
                          style={{
                            width:'100%', padding:'9px 14px', border:'none',
                            borderBottom:i<5?`1px solid ${C.border}`:'none',
                            background:orden===o.id?(C===darkC?'rgba(59,130,246,.15)':'#EFF6FF'):'transparent',
                            color:orden===o.id?C.blue:C.text,
                            cursor:'pointer', outline:'none', textAlign:'left',
                            display:'flex', alignItems:'center', gap:10, fontSize:12,
                          }}>
                          <span style={{fontSize:15}}>{o.icon}</span>
                          <span style={{fontWeight:orden===o.id?700:400}}>{o.label}</span>
                          {orden===o.id && <span style={{marginLeft:'auto',color:C.blue}}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Fila 2: conteo + categorías */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:12, color:C.textSub, whiteSpace:'nowrap', flexShrink:0 }}>
                {(() => {
                  const vd = !search && categoriaTab === '__all__' && filtroStock === 'todos';
                  if (vd && productosRecientes.length > 0)
                    return <><b style={{color:C.text}}>{productosRecientes.length}</b> recientes</>;
                  if (vd && productosFiltrados.length > 12)
                    return <><b style={{color:C.text}}>12</b> de {productosFiltrados.length} productos</>;
                  return <><b style={{color:C.text}}>{productosFiltrados.length}</b> productos</>;
                })()}
                {categoriaTab !== '__all__' && <> · <span style={{color:C.blue}}>{categoriaTab}</span></>}
              </span>
              {/* Categorías scroll */}
              <div style={{ flex:1, display:'flex', gap:6, overflowX:'auto', paddingBottom:2, scrollbarWidth:'none' }}>
                {categorias.map(cat => {
                  const active = categoriaTab === cat;
                  return (
                    <button key={cat} onClick={()=>setCategoriaTab(cat)} style={{
                      flexShrink:0, height:28, padding:'0 12px', borderRadius:20,
                      border: active ? 'none' : `1px solid ${C.border2}`,
                      background: active ? C.blue : 'transparent',
                      color: active ? '#fff' : C.textSub,
                      fontSize:11, fontWeight: active?700:500,
                      cursor:'pointer', outline:'none', whiteSpace:'nowrap',
                      transition:'all 0.12s',
                    }}>
                      {cat === '__all__' ? 'Todos' : cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Grid de productos modernizado ─────────────────────────── */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 14px', scrollbarWidth:'thin', scrollbarColor: C.border+' transparent' }}>
            {isLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
                <Spin size="large" />
              </div>
            ) : (() => {
              const vistaDefecto   = !search && categoriaTab === '__all__' && filtroStock === 'todos';
              const mostrarRecientes = vistaDefecto && productosRecientes.length > 0;
              // En vista defecto sin recientes limitamos a 12 — buscar para ver más
              const lista = mostrarRecientes
                ? productosRecientes
                : vistaDefecto
                  ? productosFiltrados.slice(0, 12)
                  : productosFiltrados;
              return lista.length === 0 ? (
                <Empty description={<span style={{color:C.textSub}}>Sin productos</span>} style={{marginTop:60}} />
              ) : (
                <>
                  {mostrarRecientes && (
                    <div style={{ marginBottom:10 }}>
                      <span style={{ fontSize:11, color:C.textSub, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                        ⏱ Últimos facturados
                      </span>
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
                    {lista.map((p: any) => (
                      <ProductCard key={p.id} produto={p} onAdd={addToCart}
                        mostrarStock={posConf.posMostrarStock !== false}
                        permitirStockNegativo={posPermitirStockNegativo} />
                    ))}
                  </div>
                  {/* Hint cuando hay más productos no mostrados */}
                  {vistaDefecto && !mostrarRecientes && productosFiltrados.length > 12 && (
                    <div style={{ textAlign:'center', marginTop:14, fontSize:11, color:C.textSub }}>
                      Busca o filtra por categoría para ver todos ({productosFiltrados.length})
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </>)}
        </>)}
        </div>{/* /center productos */}

        {/* Barra nav — solo bajo la columna izquierda */}
        <POSBottomNav
          palette={palette}
          menuAbierto={menuNavAbierto}
          panelActivo={panelActivo}
          onMenuToggle={() => setMenuNavAbierto(v => !v)}
          onPanelChange={async (p) => {
            if ((p as string) === 'nueva-nc') { setShowNotaCredito(true); setMenuNavAbierto(false); return; }
            if (p === 'cierre-caja' && posConf.posSupervisorCierreCaja !== false) {
              const fecha = new Date().toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const ok = await supervisor.requireSupervisorForced('Cierre de Caja', fecha);
              if (!ok) return;
            }
            if (p === 'inventario' && supervisor.supervisorModeEnabled) {
              const ok = await supervisor.requireSupervisor('Acceder a Inventario');
              if (!ok) return;
            }
            if (p === 'gastos' && supervisor.supervisorModeEnabled && posConf.posSupervisorGastos !== false) {
              const ok = await supervisor.requireSupervisor('Gastos');
              if (!ok) return;
            }
            if (p === 'ventas-hoy' && supervisor.supervisorModeEnabled) {
              const ok = await supervisor.requireSupervisorForced('Ver Ganancias');
              if (!ok) return;
            }
            setPanelActivo(p); setMenuNavAbierto(false);
          }}
          onNavigate={(ruta) => { setMenuNavAbierto(false); navigate(ruta); }}
        />

        </div>{/* /columna izquierda */}

        {/* Right: carrito — altura completa de pantalla, Cobrar pegado al fondo */}
        <div style={{ width: isMobile ? '100%' : 380, flexShrink: 0, background: C.sidebar, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`, display: isMobile && mobileTab === 'productos' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Cart header */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {/* Customer */}
            <Select showSearch allowClear placeholder="Cliente (opcional)" style={{ width: '100%', marginBottom: 8 }}
              value={clienteId} onChange={onClienteChange}
              filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
              options={clientes?.data.map((c: Cliente) => ({ value: c.id, label: c.nombre }))} />
            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCartOutlined style={{ color: C.blue, fontSize: 16 }} />
                <span style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>Carrito</span>
                {totalItems > 0 && <Badge count={totalItems} style={{ background: C.blue }} />}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {cart.length > 0 && (
                  <Tooltip title="Apartar venta">
                    <button onClick={parkSale} style={{ height: 26, padding: '0 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, cursor: 'pointer', fontSize: 11, outline: 'none' }}>⏸</button>
                  </Tooltip>
                )}
                {ventasEnEspera.length > 0 && (
                  <Popover placement="bottomRight" title="Ventas en espera"
                    content={
                      <div style={{ minWidth: 220 }}>
                        {ventasEnEspera.map(v => (
                          <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <span style={{ fontSize: 12 }}>{v.label}</span>
                            <button onClick={() => restoreSale(v.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', background: C.blue, color: '#fff', cursor: 'pointer', outline: 'none' }}>Recuperar</button>
                          </div>
                        ))}
                      </div>
                    } trigger="click">
                    <button style={{ height: 26, padding: '0 8px', borderRadius: 6, border: `1px solid ${C.orange}55`, background: C.orange+'11', color: C.orange, cursor: 'pointer', fontSize: 11, fontWeight: 600, outline: 'none' }}>
                      ⏭ {ventasEnEspera.length}
                    </button>
                  </Popover>
                )}
                {cart.length > 0 && (
                  <Tooltip title="Vaciar (F4)">
                    <button onClick={() => setCart([])} style={{ height: 26, width: 26, borderRadius: 6, border: `1px solid ${C.red}33`, background: C.red+'11', color: C.red, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>✕</button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px', scrollbarWidth: 'thin', scrollbarColor: C.border + ' transparent' }}>
            {cart.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.3 }}>
                <ShoppingCartOutlined style={{ fontSize: 48, color: C.textMuted }} />
                <span style={{ color: C.textSub, fontSize: 13 }}>Selecciona productos</span>
                <span style={{ color: C.textMuted, fontSize: 11 }}>F2 buscar · F9 cobrar · F4 limpiar</span>
              </div>
            ) : (
              <AnimatePresence>
                {cart.map((item, idx) => (
                  <CartRow key={item.produto.id} item={item}
                    onQty={d => updateQty(idx, d)}
                    onRemove={() => removeItem(idx)}
                    onDescuento={p => setDescuentoMonto(idx, p)}
                    onPrecio={p => actualizarPrecioItem(idx, p)}
                    onLista={lista => cambiarListaItem(idx, lista)}
                    permitirModificarPrecio={posConf.posModificarPrecio === true}
                    permitirDescuentos={posConf.posPermitirDescuentos !== false}
                    requireSupervisor={supervisor.supervisorModeEnabled && posConf.posModificarPrecio === true ? supervisor.requireSupervisor : undefined} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Descuento global — entre carrito y totales */}
          {cart.length > 0 && posConf.posPermitirDescuentos !== false && (
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.textSub, flexShrink: 0 }}>Descuento</span>
                {/* Toggle % / RD$ */}
                <button
                  onClick={() => setDescGlobalTipo(t => t === 'pct' ? 'fijo' : 'pct')}
                  style={{ height: 24, padding: '0 7px', borderRadius: 6,
                    border: `1px solid ${C.border2}`, background: C.card,
                    color: descGlobal ? C.orange : C.textSub, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
                  {descGlobalTipo === 'pct' ? '%' : 'RD$'}
                </button>
                <input
                  type="number" min="0"
                  max={descGlobalTipo === 'pct' ? 100 : undefined}
                  value={descGlobal}
                  onChange={e => setDescGlobal(e.target.value)}
                  placeholder={descGlobalTipo === 'pct' ? '0' : '0.00'}
                  style={{ flex: 1, height: 28, borderRadius: 7, border: `1px solid ${descGlobal ? C.orange : C.border}`,
                    background: C.card, color: C.text, fontSize: 12, padding: '0 8px', outline: 'none' }} />
                {descGlobal && (
                  <span style={{ fontSize: 11, color: C.orange, fontWeight: 700, flexShrink: 0 }}>
                    −{fmt.money(descGlobalMonto)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Totals + checkout — siempre visible al fondo, contenido condicional */}
          <div style={{ padding: cart.length > 0 ? '14px' : '10px 14px', borderTop: `1px solid ${C.border}`, flexShrink: 0, background: C.totalsBg }}>
          {cart.length > 0 && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: C.textSub }}>Subtotal</span>
                <span style={{ fontSize: 12, color: C.text }}>{fmt.money(subtotal)}</span>
              </div>
              {descGlobalMonto > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: C.orange }}>Descuento</span>
                  <span style={{ fontSize: 12, color: C.orange, fontWeight: 600 }}>−{fmt.money(descGlobalMonto)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: C.textSub }}>
                  {tipoNcf === 'E44' ? 'ITBIS (Exento)' : 'ITBIS (18%)'}
                </span>
                <span style={{ fontSize: 12, color: tipoNcf === 'E44' ? C.green : C.text }}>
                  {tipoNcf === 'E44' ? 'RD$ 0.00' : fmt.money(ivaConDesc)}
                </span>
              </div>
              {tipoNcf === 'E44' && (
                <div style={{ fontSize: 10, color: C.green, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ background: C.green+'22', border: `1px solid ${C.green}44`, borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>EXENTO DE ITBIS</span>
                  <span>−{fmt.money(ivaConDesc)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Total</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: C.blue, fontVariantNumeric: 'tabular-nums' }}>{fmt.money(totalEfectivo)}</span>
              </div>


              {/* Botón de acción principal */}
              {modoFacturacion === 'factura' ? (
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={async () => {
                    if (posConf.posRequerirCliente === true && !clienteId) {
                      message.error('Debe seleccionar un cliente para continuar');
                      return;
                    }
                    if (posConf.posBloquearFueraHorario === true) {
                      const inicio = String(posConf.posHorarioInicio ?? '08:00');
                      const fin    = String(posConf.posHorarioFin ?? '20:00');
                      const ahora  = dayjs().format('HH:mm');
                      if (ahora < inicio || ahora > fin) {
                        message.error(`POS bloqueado fuera de horario permitido (${inicio} – ${fin})`);
                        return;
                      }
                    }
                    const montoMax = typeof posConf.posMontoMaximoSinSupervisor === 'number'
                      ? posConf.posMontoMaximoSinSupervisor : 0;
                    if (montoMax > 0 && totalEfectivo > montoMax) {
                      const ok = await supervisor.requireSupervisor(
                        `Venta de ${fmt.money(totalEfectivo)}`,
                        `Monto máximo sin supervisor: ${fmt.money(montoMax)}`,
                      );
                      if (!ok) return;
                    }
                    setMontoRecibido(round2(totalEfectivo));
                    if (posConf.posPropinaActiva === true) setPropinaValor(String(propinaDefPct));
                    setShowPago(true);
                  }}
                  style={{ width: '100%', height: 52, borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#059669,#10B981)', color: '#fff',
                    fontSize: 16, fontWeight: 700, cursor: 'pointer', outline: 'none',
                    boxShadow: '0 4px 16px rgba(16,185,129,.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Cobrar {fmt.money(totalEfectivo)}
                  <span style={{ fontSize: 10, opacity: 0.7, background: 'rgba(0,0,0,.25)', borderRadius: 4, padding: '1px 6px' }}>F9</span>
                </motion.button>
              ) : (
                <motion.button whileTap={{ scale: 0.97 }}
                  onClick={() => modoAltMut.mutate()}
                  disabled={modoAltMut.isPending}
                  style={{ width: '100%', height: 52, borderRadius: 12, border: 'none',
                    background: modoAltMut.isPending ? '#94A3B8' : 'linear-gradient(135deg,#2563EB,#3B82F6)',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    cursor: modoAltMut.isPending ? 'not-allowed' : 'pointer',
                    outline: 'none', boxShadow: modoAltMut.isPending ? 'none' : '0 4px 16px rgba(37,99,235,.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {modoAltMut.isPending ? '⏳ Creando...' : (
                    <>
                      {MODOS_FACTURACION.find(m => m.id === modoFacturacion)?.icon}{' '}
                      Crear {MODOS_FACTURACION.find(m => m.id === modoFacturacion)?.label}
                      {' · '}{fmt.money(totalEfectivo)}
                    </>
                  )}
                </motion.button>
              )}
            </>)}
            {cart.length === 0 && (
              <motion.button disabled
                style={{ width: '100%', height: 52, borderRadius: 12, border: 'none',
                  background: C.border2, color: C.textMuted,
                  fontSize: 15, fontWeight: 700, cursor: 'not-allowed', outline: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.45 }}>
                Cobrar
                <span style={{ fontSize: 10, background: 'rgba(0,0,0,.12)', borderRadius: 4, padding: '1px 6px' }}>F9</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* ── Payment modal ─────────────────────────────────────────────────────── */}
      <Modal open={showPago} onCancel={() => setShowPago(false)} footer={null} width={420} centered closable={false} destroyOnClose
        styles={{ body: { padding: 0 }, content: { borderRadius: 20, overflow: 'hidden', padding: 0, background: C.card } }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: 'min(90vh,590px)', overflow: 'hidden', fontFamily: "'Inter',sans-serif" }}>

          {/* Header */}
          <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#0F172A,#1E40AF)', padding: '10px 16px', borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                COBRO · {cart.length} ítem{cart.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', fontVariantNumeric: 'tabular-nums' }}><LiveClock /></span>
                <button onClick={() => setShowPago(false)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', outline: 'none', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt.money(totalAPagar)}</div>
            {monedaPOS === 'USD' && tasaCambioPOS > 1 && (
              <div style={{ fontSize: 13, color: '#FCD34D', marginTop: 2, fontWeight: 700 }}>
                US$ {(totalAPagar / tasaCambioPOS).toFixed(2)} @ RD$ {tasaCambioPOS.toFixed(2)}
              </div>
            )}
            {propinaMontoCalc > 0 && (
              <div style={{ fontSize: 11, color: '#FCD34D', marginTop: 2 }}>
                Total factura {fmt.money(totalEfectivo)} + Propina {fmt.money(propinaMontoCalc)}
              </div>
            )}
            {tipoNcf === 'E44' && iva > 0 && (
              <div style={{ fontSize: 11, color: '#6EE7B7', marginTop: 2 }}>
                EXENTO DE ITBIS · ahorro {fmt.money(iva)}
              </div>
            )}
          </div>

          {/* ── Controles compactos: Tipo · Moneda · Método (fila 1 + fila 2) ── */}
          <div style={{ flexShrink: 0, padding: '6px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>

            {/* Fila 1: Tipo de cobro + Moneda en la misma línea */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
              {/* Tipo de cobro */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>Pago</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([
                    { key: 'CONTADO', icon: '💵', label: 'Contado', color: '#15803D', bg: '#F0FDF4', border: '#86EFAC' },
                    { key: 'CREDITO', icon: '📋', label: 'Crédito', color: '#0F3460', bg: '#EEF2FF', border: '#A5B4FC' },
                  ] as const).map(t => {
                    const act = tipoPagoPos === t.key;
                    return (
                      <button key={t.key} onClick={() => setTipoPagoPos(t.key)}
                        style={{ flex: 1, height: 26, borderRadius: 6, border: act ? `1.5px solid ${t.border}` : '1.5px solid #E2E8F0',
                          background: act ? t.bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 3, outline: 'none', transition: 'all 0.12s' }}>
                        <span style={{ fontSize: 11 }}>{t.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: act ? t.color : '#475569' }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Moneda */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>Moneda</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['DOP', 'USD'] as const).map(m => {
                    const act = monedaPOS === m;
                    return (
                      <button key={m} onClick={async () => {
                        setMonedaPOS(m);
                        if (m !== 'DOP') {
                          try {
                            const eid = localStorage.getItem('empresaId') ?? '';
                            const res = await fetch(`/api/v1/divisas/tasa-publica/${m}`, { credentials: 'include', headers: { 'X-Empresa-ID': eid } });
                            const d = await res.json();
                            const tasa = d?.data?.tasaVenta ?? d?.tasaVenta;
                            if (tasa) setTasaCambioPOS(Number(tasa));
                          } catch { /* mantiene tasa */ }
                        } else { setTasaCambioPOS(1); }
                      }}
                        style={{ flex: 1, height: 26, borderRadius: 6, border: act ? `1.5px solid ${m === 'USD' ? '#FCD34D' : '#86EFAC'}` : '1.5px solid #E2E8F0',
                          background: act ? (m === 'USD' ? '#FFFBEB' : '#F0FDF4') : '#fff', cursor: 'pointer',
                          fontSize: 10, fontWeight: 700, color: act ? (m === 'USD' ? '#B45309' : '#15803D') : '#475569', outline: 'none' }}>
                        {m === 'USD' ? '🇺🇸 US$' : '🇩🇴 RD$'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tasa USD (solo si USD activo) */}
            {monedaPOS === 'USD' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontSize: 10, color: '#92400E' }}>
                <span>Tasa:</span>
                <input type="number" min={1} step={0.01} value={tasaCambioPOS}
                  onChange={e => setTasaCambioPOS(Math.max(1, Number(e.target.value)))}
                  style={{ width: 60, height: 22, border: '1px solid #FCD34D', borderRadius: 5, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#92400E', outline: 'none', background: '#FFFBEB' }} />
                <span>RD$/US$1 → US$ {(totalAPagar / tasaCambioPOS).toFixed(2)}</span>
              </div>
            )}

            {/* Crédito: días */}
            {tipoPagoPos === 'CREDITO' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: clienteId ? '#EEF2FF' : '#FEF2F2',
                borderRadius: 7, border: `1px solid ${clienteId ? '#A5B4FC' : '#FECACA'}`, fontSize: 11, marginBottom: 4 }}>
                {clienteId ? (
                  <>
                    <span style={{ color: '#4338CA', fontWeight: 600 }}>📋</span>
                    <input type="number" min={1} max={365} value={diasCreditoPos}
                      onChange={e => setDiasCreditoPos(Math.max(1, Math.min(365, Number(e.target.value))))}
                      style={{ width: 46, height: 22, border: '1px solid #A5B4FC', borderRadius: 5, textAlign: 'center',
                        fontSize: 11, fontWeight: 700, color: '#3730A3', outline: 'none', background: '#EEF2FF' }} />
                    <span style={{ color: '#6B7280', fontSize: 10 }}>días · vence {
                      new Date(Date.now() + diasCreditoPos * 86400000).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })
                    }</span>
                  </>
                ) : (
                  <span style={{ color: '#DC2626', fontWeight: 600, fontSize: 10 }}>⚠ Selecciona un cliente para crédito</span>
                )}
              </div>
            )}

            {/* Fila 2: Método de pago (solo contado) */}
            {tipoPagoPos === 'CONTADO' && (
              <>
                <div style={{ fontSize: 8, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>Método</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(([
                    { key: 'efectivo',      icon: '💵', label: 'Efectivo',  color: '#15803D', bg: '#F0FDF4', border: '#86EFAC', flag: 'posEfectivo'       },
                    { key: 'tarjeta',       icon: '💳', label: 'Tarjeta',   color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD', flag: 'posTarjetaCredito'  },
                    { key: 'transferencia', icon: '🏦', label: 'Transfer.', color: '#6D28D9', bg: '#F5F3FF', border: '#C4B5FD', flag: 'posTransferencia'   },
                    { key: 'cheque',        icon: '📄', label: 'Cheque',    color: '#B45309', bg: '#FFFBEB', border: '#FCD34D', flag: 'posCheque'          },
                    { key: 'vale',          icon: '🎫', label: 'Vale',      color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', flag: 'posVale'            },
                  ] as const).filter(m =>
                    posConf[m.flag] !== false && (posConf[m.flag] === true || ['posEfectivo','posTarjetaCredito','posTransferencia'].includes(m.flag))
                  )).map(m => {
                    const act = metodoPago === m.key;
                    return (
                      <button key={m.key} onClick={() => setMetodoPago(m.key as MetodoPago)}
                        style={{ flex: 1, minWidth: 52, height: 26, borderRadius: 6, border: act ? `1.5px solid ${m.border}` : '1.5px solid #E2E8F0',
                          background: act ? m.bg : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 3, outline: 'none', transition: 'all 0.12s' }}>
                        <span style={{ fontSize: 11 }}>{m.icon}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: act ? m.color : '#475569' }}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Propina (solo si posPropinaActiva = true y CONTADO) ─────── */}
          {propinaActiva && (
          <div style={{ flexShrink: 0, padding: '8px 16px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
              🙏 Propina (opcional)
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* Toggle % / Fijo */}
              <button
                onClick={() => { setPropinaTipo(t => t === '%' ? 'fijo' : '%'); setPropinaValor(''); }}
                style={{ flexShrink: 0, height: 30, borderRadius: 7, border: '1px solid #FCD34D', background: '#FEF3C7', color: '#92400E', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '0 10px', outline: 'none' }}>
                {propinaTipo === '%' ? '%' : 'RD$'}
              </button>
              {/* Input */}
              <input
                type="number" min={0} max={propinaTipo === '%' ? 50 : undefined}
                value={propinaValor}
                onChange={e => setPropinaValor(e.target.value)}
                placeholder={propinaTipo === '%' ? `${propinaDefPct}%` : 'Monto'}
                style={{ flex: 1, height: 30, borderRadius: 7, border: '1px solid #FCD34D', background: '#fff', fontSize: 13, fontWeight: 700, color: '#92400E', textAlign: 'right', padding: '0 10px', outline: 'none' }}
              />
              {/* Botones rápidos */}
              {propinaTipo === '%' && [5, 10, 15, 18].map(p => (
                <button key={p}
                  onClick={() => setPropinaValor(String(p))}
                  style={{ flexShrink: 0, height: 30, borderRadius: 7, border: `1.5px solid ${propinaValor === String(p) ? '#D97706' : '#FDE68A'}`, background: propinaValor === String(p) ? '#FEF3C7' : '#fff', color: '#B45309', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 7px', outline: 'none' }}>
                  {p}%
                </button>
              ))}
              {/* Limpiar */}
              {propinaValor && (
                <button onClick={() => setPropinaValor('')}
                  style={{ flexShrink: 0, height: 30, width: 30, borderRadius: 7, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#94A3B8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>✕</button>
              )}
            </div>
            {propinaMontoCalc > 0 && (
              <div style={{ fontSize: 11, color: '#B45309', marginTop: 5, fontWeight: 600, textAlign: 'right' }}>
                Propina: {fmt.money(propinaMontoCalc)} → Total a cobrar: {fmt.money(totalAPagar)}
              </div>
            )}
          </div>
          )}

          {/* ── Sección datos del comprador — dinámica según escenario ───── */}
          {tipoExigeRnc && (
            <div style={{ flexShrink: 0, padding: '8px 16px', background: '#FAFBFF', borderBottom: '1px solid #E2E8F0' }}>

              {/* Badge de tipo (siempre visible cuando aplica) */}
              {tipoNcf === 'E44' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 6, padding: '2px 8px', marginBottom: 6, fontSize: 10, fontWeight: 700, color: '#059669' }}>
                  ✓ EXENTO DE ITBIS — Zona Franca
                </div>
              )}
              {tipoNcf === 'E45' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, padding: '2px 8px', marginBottom: 6, fontSize: 10, fontWeight: 700, color: '#D97706' }}>
                  ⚑ ENTIDAD GUBERNAMENTAL
                </div>
              )}

              {/* ── ESCENARIO 1: cliente seleccionado CON RNC → bloque informativo ── */}
              {clienteTieneRNC ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 1 }}>
                      {NCF_OPTS.find(o => o.code === tipoNcf)?.label ?? tipoNcf} a nombre de:
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46', fontFamily: 'monospace' }}>RNC: {rncCliente}</div>
                    <div style={{ fontSize: 11, color: '#047857', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {clienteSeleccionado?.nombre}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── ESCENARIO 2 y 3: sin RNC → formulario de captura ── */
                <>
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 5 }}>
                    {tipoNcf === 'E32' ? 'Identificación del comprador (obligatorio ≥ RD$250K)' : 'Datos del comprador *'}
                  </div>

                  {/* RNC */}
                  <input
                    placeholder={tipoNcf === 'E32' ? 'RNC o Cédula (9 u 11 dígitos) *' : 'RNC del comprador (9 dígitos) *'}
                    value={rncComprador}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '');
                      setRncComprador(v);
                      rncDGII.consultarDebounced(v);
                    }}
                    maxLength={11}
                    autoFocus={tipoNcf !== 'E32'}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${necesitaRnc && rncComprador.length > 0 && !rncValido ? '#FCA5A5' : rncDGII.datos?.encontrado ? '#86EFAC' : '#E2E8F0'}`, fontSize: 13, fontFamily: 'monospace', outline: 'none', letterSpacing: 2, marginBottom: 3, boxSizing: 'border-box', background: '#fff' }}
                  />

                  {/* Feedback DGII */}
                  {rncDGII.loading && (
                    <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #94A3B8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      Consultando DGII…
                    </div>
                  )}
                  {rncDGII.datos?.encontrado && !rncDGII.loading && (
                    <div style={{ fontSize: 11, color: '#059669', marginBottom: 4, fontWeight: 600 }}>
                      ✓ {rncDGII.datos.nombre}
                      {rncDGII.datos.estado && rncDGII.datos.estado !== 'ACTIVO' && (
                        <span style={{ marginLeft: 6, color: rncDGII.datos.estado.includes('BAJA') ? '#DC2626' : '#D97706', fontWeight: 400 }}>
                          ({rncDGII.datos.estado})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Razón Social — E31/E44/E45 */}
                  {tipoNcf !== 'E32' && (
                    <input
                      placeholder="Razón Social / Nombre de la empresa *"
                      value={razonSocialComp}
                      onChange={e => setRazonSocialComp(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', marginBottom: 5, boxSizing: 'border-box', background: '#fff' }}
                    />
                  )}

                  {/* Orden de Compra — E45 */}
                  {tipoNcf === 'E45' && (
                    <input
                      placeholder="Número de Orden de Compra (opcional)"
                      value={numeroOrdenCompra}
                      onChange={e => setNumeroOrdenCompra(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', marginBottom: 5, boxSizing: 'border-box', background: '#fff' }}
                    />
                  )}

                  {/* Guardar RNC en perfil — solo si hay cliente seleccionado que no es genérico */}
                  {clienteId && !esClienteGenerico && tipoNcf !== 'E32' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#475569' }}>
                      <input
                        type="checkbox"
                        checked={guardarRncPerfil}
                        onChange={e => setGuardarRncPerfil(e.target.checked)}
                        style={{ width: 13, height: 13, cursor: 'pointer' }}
                      />
                      Guardar RNC en el perfil de {clienteSeleccionado?.nombre}
                    </label>
                  )}

                  {/* Validación */}
                  {necesitaRnc && rncComprador.length > 0 && !rncValido && (
                    <div style={{ fontSize: 10, color: '#EF4444', marginTop: 3 }}>
                      Ingresa un RNC válido (9 dígitos) o cédula (11 dígitos)
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Numpad / card confirm / crédito */}
          <div style={{ flex: 1, padding: '10px 16px 0', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {tipoPagoPos === 'CREDITO' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <div style={{ fontSize: 40 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3730A3' }}>Venta a Crédito</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(totalEfectivo)}</div>
                <div style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  {clienteId ? <>Plazo: <strong>{diasCreditoPos} días</strong> · vence {
                    new Date(Date.now() + diasCreditoPos * 86400000).toLocaleDateString('es-DO', { weekday: 'short', day: '2-digit', month: 'short' })
                  }</> : <span style={{ color: '#DC2626' }}>Selecciona un cliente para continuar</span>}
                </div>
              </div>
            ) : metodoPago === 'efectivo' ? (
              <>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 4, borderBottom: '2px solid #3B82F6', paddingBottom: 4, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>RD$</span>
                  <input
                    ref={montoInputRef}
                    type="number"
                    min={0}
                    step={0.01}
                    value={montoRecibido === 0 ? '' : montoRecibido}
                    placeholder="0.00"
                    onChange={e => setMontoRecibido(Math.max(0, Number(e.target.value) || 0))}
                    onFocus={e => e.target.select()}
                    style={{ flex: 1, textAlign: 'right', fontSize: 22, fontWeight: 700, color: '#0F172A',
                      fontVariantNumeric: 'tabular-nums', background: 'transparent', border: 'none',
                      outline: 'none', width: '100%', WebkitAppearance: 'none', MozAppearance: 'textfield' as any }}
                  />
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 4, marginBottom: 5 }}>
                  {[200, 500, 1000, 2000].map(a => (
                    <button key={a} onClick={() => setMontoRecibido(a)} style={{ flex: 1, height: 26, borderRadius: 6, border: '1px solid #E2E8F0', background: '#F1F5F9', fontSize: 11, fontWeight: 700, color: '#475569', cursor: 'pointer', outline: 'none' }}>{a >= 1000 ? `${a/1000}K` : a}</button>
                  ))}
                  <button onClick={() => setMontoRecibido(round2(totalAPagar))} style={{ flex: 1, height: 26, borderRadius: 6, border: '1px solid #86EFAC', background: '#F0FDF4', fontSize: 11, fontWeight: 700, color: '#15803D', cursor: 'pointer', outline: 'none' }}>Exacto</button>
                </div>
                <div style={{ flexShrink: 0, height: 168 }}>
                  <Numpad value={montoRecibido} onChange={setMontoRecibido} />
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>{metodoPago === 'tarjeta' ? '💳' : '🏦'}</div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Confirma el pago de</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(totalEfectivo)}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>vía {metodoPago === 'tarjeta' ? 'tarjeta de crédito/débito' : 'transferencia bancaria'}</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '6px 16px 14px', background: '#fff', borderTop: '1px solid #F1F5F9' }}>
            <AnimatePresence>
              {/* Cambio */}
              {metodoPago === 'efectivo' && montoRecibido >= totalEfectivo && cambio > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 7, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>Cambio · recibido {fmt.money(montoRecibido)}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(cambio)}</span>
                  </div>
                </motion.div>
              )}
              {/* Monto exacto */}
              {metodoPago === 'efectivo' && montoRecibido > 0 && Math.abs(montoRecibido - totalAPagar) < 0.01 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 7, padding: '5px 10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>✓ Monto exacto</span>
                  </div>
                </motion.div>
              )}
              {/* Falta */}
              {metodoPago === 'efectivo' && montoRecibido > 0 && montoRecibido < totalAPagar - 0.01 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Falta para completar</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(totalAPagar - montoRecibido)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!cajaAbierta && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
                padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🔒</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>Caja no registrada</div>
                  <div style={{ fontSize: 11, color: '#B91C1C' }}>Abre tu turno en Caja Diaria antes de facturar</div>
                </div>
              </div>
            )}
            <Tooltip
              title={!cajaAbierta ? 'Debes abrir la caja diaria antes de facturar' : necesitaRnc && !rncValido ? 'Ingresa el RNC del comprador para continuar' : ''}
            >
              <motion.button whileTap={{ scale: canCheckout ? 0.97 : 1 }}
                onClick={() => {
                  if (!canCheckout) return;
                  if (empresa?.configuracion?.posImpresionAuto === true) {
                    autoYaPrintedRef.current = false;
                    // En móvil no abrir popup — imprimirReciboTermico usará overlay+window.print()
                    const _esMovilPago = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
                    if (!_esMovilPago) {
                      const pw = window.open('', '_blank', 'width=360,height=640,toolbar=0,menubar=0,location=0,scrollbars=yes');
                      if (pw) { pw.document.write('<html><head><title>Procesando venta...</title></head><body style="font-family:monospace;padding:20px;text-align:center">Procesando venta...</body></html>'); printWinRef.current = pw; }
                    }
                  }
                  ventaMut.mutate();
                }}
                disabled={ventaMut.isPending || !canCheckout}
                style={{ width: '100%', height: 46, borderRadius: 11, border: 'none', background: !canCheckout ? '#D1D5DB' : 'linear-gradient(135deg,#059669,#10B981)', color: !canCheckout ? '#9CA3AF' : '#fff', fontSize: 14, fontWeight: 700, cursor: !canCheckout ? 'not-allowed' : 'pointer', boxShadow: !canCheckout ? 'none' : '0 4px 14px rgba(16,185,129,.35)', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '0.2px' }}>
                {ventaMut.isPending
                  ? (<><span style={{ fontSize: 16 }}>⏳</span>
                      {ecfStatus === 'loading'
                        ? 'Enviando comprobante a DGII...'
                        : 'Procesando venta...'}
                     </>)
                  : (<><span style={{ fontSize: 16 }}>✓</span> Confirmar cobro · {fmt.money(totalEfectivo)}<span style={{ fontSize: 11, opacity: 0.65, marginLeft: 8 }}>(Enter)</span></>)}
              </motion.button>
            </Tooltip>
          </div>
        </div>
      </Modal>

    </div>

    {/* ── Pantalla de bloqueo ─────────────────────────────────────────────── */}
    {pantallaBloqueada && (
      <div style={{ position: 'fixed', inset: 0, background: '#1E40AF', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {/* Logo HiCloud */}
        <div style={{ marginBottom: 40, background: '#fff', borderRadius: 20, padding: '16px 32px', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}>
          <img src="/logo-hicloud.png" alt="HiCloud ERP" style={{ height: 72, display: 'block' }} />
        </div>
        {/* Avatar */}
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 40, color: 'rgba(255,255,255,.7)' }}>
          {cajeroNombre.charAt(0).toUpperCase()}
        </div>
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 600, margin: '0 0 24px' }}>{cajeroNombre}</h2>

        {/* Password */}
        <div style={{ width: 300, marginBottom: 8 }}>
          <Input.Password
            placeholder="Contraseña"
            value={pwDesbloqueo}
            onChange={e => { setPwDesbloqueo(e.target.value); setErrDesbloqueo(''); }}
            onPressEnter={desbloquearPantalla}
            autoFocus
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore
            size="large"
            style={{ borderRadius: 8, background: 'rgba(255,255,255,.15)', border: errDesbloqueo ? '1px solid #EF4444' : '1px solid rgba(255,255,255,.3)', color: '#fff' }}
            iconRender={v => v ? <EyeOutlined style={{ color: 'rgba(255,255,255,.6)' }} /> : <EyeInvisibleOutlined style={{ color: 'rgba(255,255,255,.6)' }} />}
          />
          {errDesbloqueo && <div style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{errDesbloqueo}</div>}
        </div>
        <button onClick={desbloquearPantalla} disabled={desbloqueando} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 48 }}>
          {desbloqueando ? 'Verificando...' : 'Desbloquear'}
        </button>
        <div onClick={cerrarSesion} style={{ position: 'absolute', bottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 14 }}>
          <LogoutOutlined /> Salir
        </div>
      </div>
    )}

    {/* ── Modal supervisor (botón manual TopBar — verifica usuario actual) ──── */}
    <Modal
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserSwitchOutlined style={{ color: '#F59E0B' }} /> Acceso de Supervisor</span>}
      open={modalSupervisor} onCancel={() => { setModalSupervisor(false); setPwSupervisor(''); setErrSupervisor(''); }}
      footer={null} width={360} destroyOnClose>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 12 }}>Ingresa tu contraseña para acceder a funciones privilegiadas.</p>
      <Input.Password placeholder="Contraseña de supervisor" value={pwSupervisor}
        onChange={e => { setPwSupervisor(e.target.value); setErrSupervisor(''); }}
        onPressEnter={verificarSupervisor} autoFocus
        autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        data-form-type="other" data-lpignore="true" data-1p-ignore />
      {errSupervisor && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errSupervisor}</div>}
      <button onClick={verificarSupervisor} disabled={verificandoSup}
        style={{ width: '100%', marginTop: 12, padding: '10px 0', background: '#F59E0B', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
        {verificandoSup ? 'Verificando...' : 'Verificar'}
      </button>
    </Modal>

    {/* ── Modal supervisor nuevo (modo supervisor configurable) ────────────── */}
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserSwitchOutlined style={{ color: '#F59E0B' }} />
          Autorización de Supervisor
        </span>
      }
      open={!!supervisor.pendingAction}
      onCancel={() => { supervisor.resolveModal(false); setSupId(null); setSupPassword(''); setSupError(''); }}
      footer={null} width={420} destroyOnClose
    >
      {supervisor.pendingAction && (
        <form autoComplete="off" onSubmit={e => e.preventDefault()}>
          {/* Banner de acción — rojo para Cierre de Caja, amarillo para el resto */}
          {(() => {
            const isCierre = supervisor.pendingAction?.action === 'Cierre de Caja';
            return (
              <div style={{
                background: isCierre ? '#FEF2F2' : '#FFFBEB',
                border: `1px solid ${isCierre ? '#FECACA' : '#FCD34D'}`,
                borderRadius: 8, padding: '8px 12px', marginBottom: 16,
                fontSize: 12, color: isCierre ? '#991B1B' : '#92400E',
              }}>
                <strong>Acción:</strong> {supervisor.pendingAction.action}
                {supervisor.pendingAction.detail && <> — {supervisor.pendingAction.detail}</>}
              </div>
            );
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Selector de supervisor */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Seleccionar supervisor</div>
              {supLoading ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}><Spin size="small" /></div>
              ) : !supervisores?.length ? (
                <div style={{ fontSize: 12, color: '#EF4444', padding: '6px 0' }}>
                  No hay administradores o contadores activos en esta empresa.
                </div>
              ) : (
                <Select
                  style={{ width: '100%' }}
                  placeholder="Seleccionar supervisor..."
                  showSearch
                  optionFilterProp="label"
                  value={supId}
                  onChange={(v: number) => { setSupId(v); setSupError(''); }}
                  options={(supervisores ?? []).map(u => ({
                    value: u.id,
                    label: u.nombre,
                    role:  u.role,
                  }))}
                  optionRender={(option) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar size={22} style={{
                        background: option.data.role === 'admin' ? '#1E3A8A' : '#065F46',
                        fontSize: 11, flexShrink: 0,
                      }}>
                        {(option.data.label as string)?.charAt(0).toUpperCase()}
                      </Avatar>
                      <span style={{ flex: 1 }}>{option.data.label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color:      option.data.role === 'admin' ? '#1E40AF' : '#065F46',
                        background: option.data.role === 'admin' ? '#DBEAFE' : '#D1FAE5',
                        borderRadius: 4, padding: '1px 6px',
                      }}>
                        {(option.data.role as string)?.toUpperCase()}
                      </span>
                    </span>
                  )}
                />
              )}
            </div>
            {/* Contraseña */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Contraseña</div>
              <Input.Password placeholder="Contraseña del supervisor" value={supPassword}
                autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                data-form-type="other" data-lpignore="true" data-1p-ignore
                onChange={e => { setSupPassword(e.target.value); setSupError(''); }}
                onPressEnter={async () => {
                  if (!supId || !supPassword) { setSupError('Selecciona un supervisor e ingresa su contraseña'); return; }
                  setVerificandoSupNuevo(true); setSupError('');
                  try {
                    const res: any = await api.post('/auth/verificar-supervisor', {
                      supervisorId: supId, password: supPassword,
                      action: supervisor.pendingAction?.action,
                      detail: supervisor.pendingAction?.detail,
                    });
                    const d = res.data?.data ?? res.data;
                    supervisor.resolveModal(true, d.nombre, d.role);
                    message.success(`✓ Autorizado por ${d.nombre}`);
                    setSupId(null); setSupPassword('');
                  } catch (e: any) {
                    setSupError(e?.response?.data?.message ?? 'Credenciales inválidas');
                  } finally { setVerificandoSupNuevo(false); }
                }} />
            </div>
            {supError && <div style={{ color: '#EF4444', fontSize: 12 }}>{supError}</div>}
            <button
              type="button"
              disabled={verificandoSupNuevo || !supId || !supPassword}
              onClick={async () => {
                if (!supId || !supPassword) { setSupError('Selecciona un supervisor e ingresa su contraseña'); return; }
                setVerificandoSupNuevo(true); setSupError('');
                try {
                  const res: any = await api.post('/auth/verificar-supervisor', {
                    supervisorId: supId, password: supPassword,
                    action: supervisor.pendingAction?.action,
                    detail: supervisor.pendingAction?.detail,
                  });
                  const d = res.data?.data ?? res.data;
                  supervisor.resolveModal(true, d.nombre, d.role);
                  message.success(`✓ Autorizado por ${d.nombre}`);
                  setSupId(null); setSupPassword('');
                } catch (e: any) {
                  setSupError(e?.response?.data?.message ?? 'Credenciales inválidas');
                } finally { setVerificandoSupNuevo(false); }
              }}
              style={{ padding: '10px 0', background: (!supId || !supPassword) ? '#ccc' : '#F59E0B',
                border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700,
                cursor: (!supId || !supPassword) ? 'not-allowed' : 'pointer', fontSize: 14 }}>
              {verificandoSupNuevo ? 'Verificando...' : 'Autorizar'}
            </button>
          </div>
        </form>
      )}
    </Modal>

    {/* ── Modal cambiar usuario ────────────────────────────────────────────── */}
    <Modal
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600 }}><SwapOutlined style={{ color: '#0EA5E9' }} /> Cambio De Usuario</span>}
      open={modalCambiarUser}
      onCancel={() => { setModalCambiarUser(false); setCambiarUserId(undefined); setPwCambio(''); setErrCambio(''); }}
      footer={null} width={420} destroyOnClose
      closeIcon={<div style={{ width: 24, height: 24, borderRadius: '50%', background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>✕</div>}
    >
      {/* Campo USUARIO */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>USUARIO</label>
        <Select
          style={{ width: '100%' }} size="large" placeholder="Seleccione un usuario"
          value={cambiarUserId} onChange={(v) => { setCambiarUserId(v); setErrCambio(''); }}
          showSearch filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
          options={usuariosEmpresa.map((u: any) => ({ value: u.id, label: u.nombre }))}
        />
      </div>
      {/* Campo CONTRASEÑA */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>CONTRASEÑA</label>
        <Input.Password size="large" placeholder="••••••••"
          value={pwCambio}
          onChange={e => { setPwCambio(e.target.value); setErrCambio(''); }}
          onPressEnter={ejecutarCambioUsuario}
          autoFocus={!!cambiarUserId}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
        />
        {errCambio && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{errCambio}</div>}
      </div>
      <Button type="primary" block size="large" onClick={ejecutarCambioUsuario} loading={cambiandoUser} style={{ height: 44 }}>
        Iniciar sesión
      </Button>
    </Modal>

    </ThemeCtx.Provider>
  );
}

