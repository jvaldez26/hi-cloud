import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../../store/theme.store';
import DemoModal from '../auth/DemoModal';

// ── Paleta ─────────────────────────────────────────────────────────────────────
function buildPalette(isDark: boolean) {
  return {
    bg:      isDark ? '#0A0A0A' : '#FFFFFF',
    bgAlt:   isDark ? '#111111' : '#F8FAFC',
    bgCard:  isDark ? '#161616' : '#FFFFFF',
    border:  isDark ? '#222222' : '#E5E7EB',
    text:    isDark ? '#F9FAFB' : '#111827',
    muted:   isDark ? '#9CA3AF' : '#6B7280',
    blue:    '#1E3A8A',
    blueL:   isDark ? '#3B5FC0' : '#2563EB',
    green:   '#10B981',
    greenL:  '#059669',
    footer:  '#050505',
  };
}

// ── Utilidades ─────────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, y = 20 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}>
      {children}
    </motion.div>
  );
}

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let cur = 0; const step = to / 60;
    const t = setInterval(() => { cur += step; if (cur >= to) { setN(to); clearInterval(t); } else setN(Math.floor(cur)); }, 16);
    return () => clearInterval(t);
  }, [inView, to]);
  return <span ref={ref}>{n.toLocaleString('es-DO')}{suffix}</span>;
}

// ── Navbar ─────────────────────────────────────────────────────────────────────
function Navbar({ onDemo }: { onDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mopen,    setMopen]    = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMopen(false); };
  const links = [
    { label: 'Características', id: 'caracteristicas' },
    { label: 'Precios',         id: 'precios' },
    { label: 'e-CF',            id: 'ecf' },
    { label: 'FAQ',             id: 'faq' },
  ];
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: 64,
      background: scrolled ? 'rgba(5,5,5,.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : 'none',
      transition: 'all .25s', padding: '0 clamp(16px,4vw,48px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <img src="/logo-hicloud.png" alt="HiCloud ERP" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
      </div>
      <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {links.map(l => (
          <button key={l.id} onClick={() => scrollTo(l.id)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.65)', fontSize: 14,
              cursor: 'pointer', padding: '6px 14px', borderRadius: 6, transition: 'color .15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.65)')}>
            {l.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate('/login')} className="nav-cta-hide"
          style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
            color: '#fff', fontSize: 13, fontWeight: 500, padding: '7px 16px', borderRadius: 8, cursor: 'pointer' }}>
          Iniciar sesión
        </button>
        <button onClick={onDemo} className="nav-cta-hide"
          style={{ background: '#10B981', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
            padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>
          Agendar Demo →
        </button>
        <button onClick={() => setMopen(v => !v)} className="nav-hamburger"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'none', padding: 4 }}>
          {mopen ? '✕' : '☰'}
        </button>
      </div>
      <AnimatePresence>
        {mopen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ position: 'absolute', top: 64, left: 0, right: 0, background: 'rgba(5,5,5,.98)',
              borderBottom: '1px solid rgba(255,255,255,.08)', padding: '12px 24px 20px' }}>
            {links.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none',
                  color: 'rgba(255,255,255,.8)', fontSize: 16, textAlign: 'left',
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}>
                {l.label}
              </button>
            ))}
            <button onClick={() => { navigate('/login'); setMopen(false); }}
              style={{ marginTop: 16, width: '100%', background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.12)', color: '#fff', fontSize: 14, fontWeight: 500,
                padding: '12px', borderRadius: 8, cursor: 'pointer' }}>Iniciar sesión</button>
            <button onClick={() => { onDemo(); setMopen(false); }}
              style={{ marginTop: 8, width: '100%', background: '#10B981', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px', borderRadius: 8, cursor: 'pointer' }}>
              Agendar Demo →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────
const MODULES = [
  { icon: '🧾', title: 'Facturación e-CF E31-E47',    desc: 'Todos los tipos de comprobante. Aceptados por DGII en segundos.' },
  { icon: '🖥️', title: 'Punto de Venta (POS)',         desc: 'Vende y emite e-CF en menos de 30s. Offline, scanner y táctil.' },
  { icon: '📦', title: 'Inventario multi-almacén',     desc: 'Stock en tiempo real, alertas y trazabilidad de lotes.' },
  { icon: '📊', title: 'Contabilidad automática',      desc: 'Asientos generados al facturar. Balance y estado de resultados.' },
  { icon: '👥', title: 'Nómina y TSS',                 desc: 'Cálculo automático de ISR, AFP, ARS y TSS. Ley 87-01.' },
  { icon: '📋', title: 'Reportes DGII 606/607/608',    desc: 'Archivos TXT oficiales con un clic. Siempre validados.' },
  { icon: '💰', title: 'Cuentas por cobrar/pagar',     desc: 'Flujo de efectivo claro. Cobros y pagos al día.' },
  { icon: '🏢', title: 'Multi-empresa',                desc: 'Maneja varias RNCs desde un solo login. Datos aislados.' },
  { icon: '📱', title: 'Desde cualquier dispositivo',  desc: '100% web. Funciona en móvil, tablet y desktop.' },
];

const ECF_TYPES = [
  { code: 'E31', name: 'Crédito Fiscal',    color: '#2563EB' },
  { code: 'E32', name: 'Consumo',           color: '#6B7280' },
  { code: 'E33', name: 'Nota de Débito',    color: '#7C3AED' },
  { code: 'E34', name: 'Nota de Crédito',   color: '#DC2626' },
  { code: 'E41', name: 'Compras',           color: '#059669' },
  { code: 'E43', name: 'Gastos Menores',    color: '#D97706' },
  { code: 'E44', name: 'Zona Franca',       color: '#0891B2' },
  { code: 'E45', name: 'Gubernamental',     color: '#7C3AED' },
  { code: 'E46', name: 'Exportaciones',     color: '#BE185D' },
  { code: 'E47', name: 'Pagos al Exterior', color: '#9333EA' },
];

const PLANES = [
  { clave: 'emprendedor', nombre: 'EMPRENDEDOR', precio: 1700, precioAnual: 1530,
    limite: 'RD$125,000', usuarios: 2, color: '#374151', border: '#6B7280', popular: false,
    features: ['Factura electrónica e-CF DGII gratuita', 'Ingresos hasta RD$125,000/mes', '2 usuarios incluidos', 'Todos los módulos', 'Multi-empresa', 'Portal de clientes', 'Soporte 24/7 gratis'],
  },
  { clave: 'pyme', nombre: 'PYME', precio: 3500, precioAnual: 3150,
    limite: 'RD$500,000', usuarios: 3, color: '#047857', border: '#10B981', popular: false,
    features: ['Factura electrónica e-CF DGII gratuita', 'Ingresos hasta RD$500,000/mes', '3 usuarios incluidos', 'Todos los módulos', 'Multi-empresa', 'Portal de clientes', 'Soporte 24/7 gratis'],
  },
  { clave: 'pro', nombre: 'PRO', precio: 5200, precioAnual: 4680,
    limite: 'RD$1,250,000', usuarios: 4, color: '#0d9488', border: '#14B8A6', popular: true,
    features: ['Factura electrónica e-CF DGII gratuita', 'Ingresos hasta RD$1,250,000/mes', '4 usuarios incluidos', 'Todos los módulos', 'Multi-empresa', 'Portal de clientes', 'Soporte 24/7 gratis'],
  },
  { clave: 'plus', nombre: 'PLUS', precio: 7600, precioAnual: 6840,
    limite: 'RD$6,250,000', usuarios: 10, color: '#4F46E5', border: '#818CF8', popular: false,
    features: ['Factura electrónica e-CF DGII gratuita', 'Ingresos hasta RD$6,250,000/mes', '10 usuarios incluidos', 'Todos los módulos', 'Multi-empresa', 'Portal de clientes', 'Soporte 24/7 + Asistente IA'],
  },
];

const TABLA_COMPARATIVA = [
  { feature: 'Factura electrónica e-CF DGII gratuita', vals: [true, true, true, true] },
  { feature: 'Ingresos máx/mes',              vals: ['RD$125K', 'RD$500K', 'RD$1.25M', 'RD$6.25M'] },
  { feature: 'Usuarios incluidos',            vals: [2, 3, 4, 10] },
  { feature: 'Cotizaciones y órdenes',        vals: [true, true, true, true] },
  { feature: 'Compras y proveedores',         vals: [true, true, true, true] },
  { feature: 'Inventario completo',           vals: [true, true, true, true] },
  { feature: 'Contabilidad general',          vals: [true, true, true, true] },
  { feature: 'CxC / CxP',                    vals: [true, true, true, true] },
  { feature: 'Nómina y RRHH',                vals: [true, true, true, true] },
  { feature: 'CRM / Proyectos',              vals: [true, true, true, true] },
  { feature: 'Reportes DGII 606/607',        vals: [true, true, true, true] },
  { feature: 'Multi-sucursal',               vals: [true, true, true, true] },
  { feature: 'Portal de clientes',           vals: [true, true, true, true] },
  { feature: 'Soporte 24/7',                 vals: [true, true, true, true] },
  { feature: 'Asistente IA',                 vals: [false, false, false, true] },
];

const TESTIMONIOS = [
  { nombre: 'María Rodríguez', empresa: 'Ferretería El Constructor', sector: 'Retail', quote: 'En 2 días estábamos facturando electrónicamente. El soporte es excepcional y el sistema es muy fácil de usar.' },
  { nombre: 'Carlos Méndez', empresa: 'Distribuidora Norte SRL', sector: 'Distribución', quote: 'Los reportes 606/607 que antes tomaban horas ahora los genero en segundos. HiCloud cambió la forma en que manejamos el negocio.' },
  { nombre: 'Ana Jiménez', empresa: 'Clínica Vida Sana', sector: 'Salud', quote: 'El multi-empresa nos permite manejar nuestras dos clínicas desde un solo lugar. Excelente inversión.' },
];

const FAQ_DATA = [
  { q: '¿HiCloud está certificado ante la DGII?', a: 'HiCloud incluye integración nativa con la DGII a través de nuestra plataforma fiscal certificada. El proceso de activación se completa en minutos desde el panel de configuración.' },
  { q: '¿Qué necesito para empezar con facturación electrónica?', a: 'Solo tus credenciales de facturación electrónica y las secuencias e-CF de la DGII. Nuestro equipo de soporte te guía paso a paso en la activación.' },
  { q: '¿Qué pasa con mis datos si cancelo?', a: 'Tus datos son tuyos. Puedes exportar toda tu información en cualquier momento. Realizamos backups diarios en AWS S3.' },
  { q: '¿Puedo migrar desde mi sistema actual?', a: 'Sí. Ofrecemos importación masiva de clientes, productos y proveedores desde Excel/CSV. El soporte te acompaña durante la migración sin costo adicional.' },
  { q: '¿Funciona en móvil y tablet?', a: 'Sí. HiCloud es 100% responsive. El POS funciona perfectamente en tablet y móvil, incluyendo modo offline para ventas sin conexión a internet.' },
  { q: '¿Cuánto tiempo toma implementarlo?', a: 'Una PYME típica está operando en 1-3 días. Para empresas más grandes con múltiples usuarios y flujos, de 1 a 2 semanas.' },
  { q: '¿Los reportes 606/607/608 son automáticos?', a: 'Sí. HiCloud genera los archivos TXT oficiales en el formato exacto del portal DGII con un clic, incluyendo validaciones previas para evitar errores.' },
  { q: '¿Puedo manejar varias empresas con el mismo usuario?', a: 'Sí. HiCloud es multi-empresa con aislamiento total de datos. Cambias entre empresas desde el mismo login sin cerrar sesión.' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const { isDark } = useThemeStore();
  const P = buildPalette(isDark);
  return (
    <div style={{ borderBottom: `1px solid ${P.border}` }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left',
          padding: '20px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: P.text }}>{q}</span>
        <span style={{ fontSize: 20, color: P.blueL, flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .2s', lineHeight: 1 }}>+</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
            <p style={{ paddingBottom: 20, margin: 0, color: P.muted, fontSize: 14, lineHeight: 1.7 }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreciosSection({ navigate }: { navigate: (to: string) => void }) {
  const [anual,     setAnual]     = useState(false);
  const [tablaBien, setTablaBien] = useState(false);
  const { isDark } = useThemeStore();
  const P = buildPalette(isDark);

  return (
    <section id="precios" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: P.bgAlt }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ background: P.blueL + '18', color: P.blueL, fontSize: 12, fontWeight: 700,
              padding: '4px 14px', borderRadius: 20, letterSpacing: '0.5px', display: 'inline-block', marginBottom: 16 }}>
              PLANES Y PRECIOS
            </span>
            <h2 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, color: P.text, margin: '0 0 16px' }}>
              Precio justo para cada etapa
            </h2>
            <p style={{ color: P.muted, fontSize: 16, maxWidth: 520, margin: '0 auto 28px' }}>
              Sin sorpresas. Sin comisiones por transacción. Cancela cuando quieras.
            </p>
            {/* Toggle mensual/anual */}
            <div style={{ display: 'inline-flex', background: P.bgCard, border: `1px solid ${P.border}`, borderRadius: 10, padding: 4, gap: 4 }}>
              {[{ v: false, l: 'Mensual' }, { v: true, l: 'Anual -10%' }].map(({ v, l }) => (
                <button key={l} onClick={() => setAnual(v)}
                  style={{ padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
                    background: anual === v ? '#10B981' : 'transparent',
                    color: anual === v ? '#fff' : P.muted }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 }}>
          {PLANES.map((p, i) => (
            <FadeIn key={p.clave} delay={i * 0.07}>
              <div style={{ position: 'relative', background: P.bgCard,
                border: `1px solid ${p.popular ? p.border : P.border}`,
                borderRadius: 16, padding: '28px 24px', height: '100%',
                boxShadow: p.popular ? `0 0 0 2px ${p.border}40, 0 8px 32px ${p.border}20` : 'none',
                display: 'flex', flexDirection: 'column' }}>
                {p.popular && (
                  <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: p.border, color: '#fff', fontSize: 11, fontWeight: 800,
                    padding: '4px 16px', borderRadius: 20, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    ⭐ MÁS ELEGIDO
                  </div>
                )}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: p.border, marginBottom: 8, letterSpacing: '0.5px' }}>{p.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: P.text }}>
                      RD${(anual ? p.precioAnual : p.precio).toLocaleString('es-DO')}
                    </span>
                    <span style={{ color: P.muted, fontSize: 13 }}>/mes</span>
                  </div>
                  <div style={{ fontSize: 12, color: P.muted, marginTop: 4 }}>Ingresos hasta {p.limite}/mes</div>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10, fontSize: 13, color: P.muted }}>
                      <span style={{ color: '#10B981', flexShrink: 0, marginTop: 1 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/registrar')}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: `1px solid ${p.popular ? p.border : P.border}`,
                    background: p.popular ? p.border : 'transparent',
                    color: p.popular ? '#fff' : P.text, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  Probar gratis 15 días →
                </button>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Tabla comparativa */}
        <FadeIn delay={0.3}>
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button onClick={() => setTablaBien(v => !v)}
              style={{ background: 'none', border: `1px solid ${P.border}`, color: P.muted,
                padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              {tablaBien ? '▲ Ocultar comparación' : '▼ Ver comparación completa'}
            </button>
          </div>
          <AnimatePresence>
            {tablaBien && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }} style={{ overflow: 'hidden', marginTop: 24 }}>
                <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${P.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: P.bgAlt }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', color: P.muted, fontWeight: 600, borderBottom: `1px solid ${P.border}` }}>Característica</th>
                        {PLANES.map(p => (
                          <th key={p.clave} style={{ padding: '14px 16px', textAlign: 'center', color: p.border, fontWeight: 700, borderBottom: `1px solid ${P.border}` }}>{p.nombre}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLA_COMPARATIVA.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? P.bgCard : P.bgAlt }}>
                          <td style={{ padding: '12px 16px', color: P.text, borderBottom: `1px solid ${P.border}` }}>{row.feature}</td>
                          {row.vals.map((v, j) => (
                            <td key={j} style={{ padding: '12px 16px', textAlign: 'center', borderBottom: `1px solid ${P.border}`,
                              color: v === true ? '#10B981' : v === false ? P.border : P.muted }}>
                              {v === true ? '✓' : v === false ? '—' : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </FadeIn>
      </div>
    </section>
  );
}

// ── Landing principal ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const { isDark } = useThemeStore();
  const P = buildPalette(isDark);
  const [demoOpen, setDemoOpen] = useState(false);
  const openDemo = () => setDemoOpen(true);

  return (
    <div style={{ background: P.bg, color: P.text, fontFamily: "'IBM Plex Sans','Inter',sans-serif", overflowX: 'hidden' }}>
      <style>{`
        @media(max-width:768px){
          .nav-desktop{display:none!important}
          .nav-cta-hide{display:none!important}
          .nav-hamburger{display:flex!important}
          .hero-ctas{flex-direction:column!important;align-items:stretch!important}
          .stats-grid{grid-template-columns:1fr 1fr!important}
          .modules-grid{grid-template-columns:1fr 1fr!important}
          .testimonios-grid{grid-template-columns:1fr!important}
          .hero-dash-grid{grid-template-columns:1fr 1fr!important;gap:8px!important}
          .prob-sol-grid{flex-direction:column!important;gap:16px!important}
          .prob-sol-arrow{transform:rotate(90deg);font-size:24px!important}
        }
        @media(max-width:480px){
          .stats-grid{grid-template-columns:1fr!important}
          .modules-grid{grid-template-columns:1fr!important}
          .ecf-grid{grid-template-columns:repeat(2,1fr)!important}
          .hero-dash-grid{grid-template-columns:1fr 1fr!important}
        }
        *{box-sizing:border-box}
      `}</style>

      <Navbar onDemo={openDemo} />

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '100vh', background: '#050505', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 'clamp(100px,12vw,140px) clamp(20px,5vw,64px) clamp(60px,8vw,96px)',
        textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Grid background */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.3) 1px,transparent 1px)',
          backgroundSize: '64px 64px' }} />
        {/* Glow */}
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 700, height: 400, background: 'radial-gradient(ellipse at center,rgba(30,58,138,.35) 0%,transparent 70%)',
          pointerEvents: 'none' }} />

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
          style={{ position: 'relative', zIndex: 1, maxWidth: 760 }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)', borderRadius: 100, padding: '6px 16px',
            fontSize: 13, color: 'rgba(255,255,255,.7)', marginBottom: 32, backdropFilter: 'blur(8px)' }}>
            🇩🇴 El ERP hecho para República Dominicana
          </div>

          <h1 style={{ fontSize: 'clamp(36px,6vw,72px)', fontWeight: 800, lineHeight: 1.1,
            color: '#fff', margin: '0 0 24px', letterSpacing: '-1px' }}>
            Factura electrónica,<br />
            <span style={{ color: '#10B981' }}>contabilidad y POS.</span><br />
            Todo en uno. 100% DGII.
          </h1>

          <p style={{ fontSize: 'clamp(16px,2vw,20px)', color: 'rgba(255,255,255,.55)',
            lineHeight: 1.65, maxWidth: 600, margin: '0 auto 40px' }}>
            HiCloud ERP fue construido desde cero para las PYMEs dominicanas.
            e-CF nativo, reportes 606/607/608, nómina con TSS y más.
          </p>

          <div className="hero-ctas" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <button onClick={() => navigate('/registrar')}
              style={{ background: '#10B981', border: 'none', color: '#fff', fontSize: 17, fontWeight: 700,
                padding: '16px 36px', borderRadius: 12, cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(16,185,129,.35)', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#10B981'; e.currentTarget.style.transform = ''; }}>
              Probar gratis 15 días →
            </button>
            <button onClick={openDemo}
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)',
                color: '#fff', fontSize: 16, fontWeight: 600, padding: '16px 32px', borderRadius: 12, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.07)')}>
              Agendar demo
            </button>
          </div>

          <p style={{ color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
            Sin tarjeta de crédito · Sin compromiso · Cancela cuando quieras
          </p>
        </motion.div>

        {/* Dashboard mockup */}
        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
          style={{ position: 'relative', zIndex: 1, marginTop: 64, width: '100%', maxWidth: 900 }}>
          <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 16, padding: '24px 24px 0', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
            {/* Fake browser bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
              {['#FF5F57','#FFBD2E','#28C840'].map(c => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
              ))}
              <div style={{ marginLeft: 10, background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: '4px 14px',
                fontSize: 12, color: 'rgba(255,255,255,.3)', flex: 1 }}>app.hicloudrd.com/dashboard</div>
            </div>
            {/* Mini dashboard preview */}
            <div className="hero-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Ventas del mes', val: 'RD$487K', change: '+12%', color: '#10B981' },
                { label: 'Facturas', val: '234', change: '+8%', color: '#2563EB' },
                { label: 'e-CF pend.', val: '0', change: '100% OK', color: '#10B981' },
                { label: 'Por cobrar', val: 'RD$45K', change: '3 clientes', color: '#F59E0B' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10,
                  padding: 'clamp(8px,2vw,16px)', border: '1px solid rgba(255,255,255,.06)', minWidth: 0 }}>
                  <div style={{ fontSize: 'clamp(9px,1.5vw,11px)', color: 'rgba(255,255,255,.4)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                  <div style={{ fontSize: 'clamp(13px,2.5vw,20px)', fontWeight: 700, color: '#fff', marginBottom: 4 }}>{s.val}</div>
                  <div style={{ fontSize: 'clamp(9px,1.5vw,11px)', color: s.color }}>{s.change}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 120, background: 'rgba(255,255,255,.03)', borderRadius: '8px 8px 0 0',
              border: '1px solid rgba(255,255,255,.06)', borderBottom: 'none', overflow: 'hidden', position: 'relative' }}>
              {/* Fake chart bars */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '16px 20px', height: '100%' }}>
                {[40,65,50,80,70,95,60,85,75,90,55,100].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: i === 11 ? '#10B981' : 'rgba(37,99,235,.4)',
                    borderRadius: '4px 4px 0 0', height: `${h}%`, minWidth: 0 }} />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── SOCIAL PROOF ────────────────────────────────────────────────── */}
      <section style={{ background: isDark ? '#0A0A0A' : '#F8FAFC', padding: 'clamp(40px,6vw,64px) clamp(16px,5vw,80px)',
        borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: P.muted, fontSize: 13, fontWeight: 600, letterSpacing: '1px',
            textTransform: 'uppercase', marginBottom: 32 }}>
            USADO POR EMPRESAS DOMINICANAS EN
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(24px,4vw,56px)', flexWrap: 'wrap', marginBottom: 48 }}>
            {['🏪 Retail', '⚙️ Servicios', '🚚 Distribución', '🏗️ Construcción', '🏥 Salud'].map(s => (
              <span key={s} style={{ fontSize: 'clamp(14px,2vw,17px)', color: P.muted, fontWeight: 500 }}>{s}</span>
            ))}
          </div>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32 }}>
            {[
              { to: 120, suffix: '+', label: 'Empresas activas' },
              { to: 50000, suffix: '+', label: 'Facturas electrónicas emitidas' },
              { to: 99, suffix: '.9%', label: 'Uptime garantizado' },
            ].map(s => (
              <FadeIn key={s.label}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, color: P.text }}>
                    <CountUp to={s.to} suffix={s.suffix} />
                  </div>
                  <div style={{ color: P.muted, fontSize: 14, marginTop: 6 }}>{s.label}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROBLEMA → SOLUCIÓN ─────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: P.bg }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FadeIn>
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800,
              color: P.text, marginBottom: 56 }}>
              ¿Cansado de manejar tu negocio en Excel?
            </h2>
          </FadeIn>
          <div className="prob-sol-grid" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {/* Problemas */}
            <div style={{ flex: 1 }}>
              <FadeIn delay={0.1}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', letterSpacing: '0.5px',
                  marginBottom: 20, textTransform: 'uppercase' }}>Antes de HiCloud</div>
                {[
                  'Facturas manuales que la DGII rechaza',
                  'Contabilidad separada del inventario',
                  'Sin visibilidad real de tu negocio',
                  'Reportes 606 que toman horas',
                  'POS y facturación desconectados',
                ].map(p => (
                  <div key={p} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                    marginBottom: 16, padding: '12px 16px', background: isDark ? '#1a0a0a' : '#FEF2F2',
                    borderRadius: 10, border: '1px solid rgba(239,68,68,.15)' }}>
                    <span style={{ color: '#EF4444', fontSize: 16, flexShrink: 0 }}>✗</span>
                    <span style={{ fontSize: 14, color: P.text }}>{p}</span>
                  </div>
                ))}
              </FadeIn>
            </div>

            {/* Flecha */}
            <FadeIn delay={0.2}>
              <div className="prob-sol-arrow" style={{ textAlign: 'center', fontSize: 32, color: '#10B981', flexShrink: 0 }}>→</div>
            </FadeIn>

            {/* Soluciones */}
            <div style={{ flex: 1 }}>
              <FadeIn delay={0.3}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10B981', letterSpacing: '0.5px',
                  marginBottom: 20, textTransform: 'uppercase' }}>Con HiCloud ERP</div>
                {[
                  'e-CF automático, aceptado por la DGII',
                  'Todo integrado: ventas, inventario, contabilidad',
                  'Dashboard con métricas en tiempo real',
                  'Reportes 606/607/608 en un clic',
                  'POS + facturación en el mismo sistema',
                ].map(s => (
                  <div key={s} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                    marginBottom: 16, padding: '12px 16px', background: isDark ? '#0a1a0a' : '#F0FDF4',
                    borderRadius: 10, border: '1px solid rgba(16,185,129,.15)' }}>
                    <span style={{ color: '#10B981', fontSize: 16, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 14, color: P.text }}>{s}</span>
                  </div>
                ))}
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MÓDULOS ─────────────────────────────────────────────────────── */}
      <section id="caracteristicas" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: P.bgAlt }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <span style={{ background: P.blueL + '18', color: P.blueL, fontSize: 12, fontWeight: 700,
                padding: '4px 14px', borderRadius: 20, letterSpacing: '0.5px', display: 'inline-block', marginBottom: 16 }}>
                MÓDULOS
              </span>
              <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, color: P.text, margin: '0 0 16px' }}>
                Todo lo que necesita tu empresa
              </h2>
              <p style={{ color: P.muted, fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
                Sin módulos adicionales. Sin costos ocultos. Todo incluido desde el primer día.
              </p>
            </div>
          </FadeIn>
          <div className="modules-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {MODULES.map((m, i) => (
              <FadeIn key={m.title} delay={i * 0.05}>
                <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, borderRadius: 14,
                  padding: '24px 20px', transition: 'border-color .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = P.blueL)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = P.border)}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{m.icon}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: P.text, margin: '0 0 8px' }}>{m.title}</h3>
                  <p style={{ fontSize: 13, color: P.muted, margin: 0, lineHeight: 1.6 }}>{m.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DGII SECTION ─────────────────────────────────────────────── */}
      <section id="ecf" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: '#050A18' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <span style={{ background: 'rgba(37,99,235,.2)', color: '#60A5FA', fontSize: 12, fontWeight: 700,
                padding: '4px 14px', borderRadius: 20, letterSpacing: '0.5px', display: 'inline-block', marginBottom: 16 }}>
                CUMPLIMIENTO FISCAL
              </span>
              <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, color: '#fff', margin: '0 0 20px' }}>
                Cumplimiento DGII garantizado
              </h2>
              <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 16, maxWidth: 580, margin: '0 auto 16px' }}>
                Somos el único ERP dominicano con e-CF nativo integrado con la DGII.
                Tus facturas llegan a la DGII en segundos, sin intervención manual.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)',
                padding: '8px 18px', borderRadius: 8 }}>
                <span style={{ color: '#10B981', fontSize: 14 }}>✓</span>
                <span style={{ color: '#6EE7B7', fontSize: 13, fontWeight: 600 }}>Integración certificada con la DGII</span>
              </div>
            </div>
          </FadeIn>

          <div className="ecf-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
            {ECF_TYPES.map((e, i) => (
              <FadeIn key={e.code} delay={i * 0.04}>
                <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 12, padding: '18px 12px', textAlign: 'center',
                  transition: 'all .2s' }}
                  onMouseEnter={el => { el.currentTarget.style.background = `${e.color}15`; el.currentTarget.style.borderColor = `${e.color}40`; }}
                  onMouseLeave={el => { el.currentTarget.style.background = 'rgba(255,255,255,.04)'; el.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: e.color, marginBottom: 6 }}>{e.code}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', lineHeight: 1.4 }}>{e.name}</div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.3}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 24, marginTop: 48 }}>
              {[
                { icon: '⚡', title: 'Envío instantáneo', desc: 'Tu factura llega a la DGII en menos de 5 segundos.' },
                { icon: '🔒', title: 'Firma digital incluida', desc: 'Certificado de firma automático. Sin configuración extra.' },
                { icon: '📋', title: '606/607/608 en un clic', desc: 'Archivos TXT listos para el portal DGII, validados.' },
                { icon: '🔄', title: 'Reintentos automáticos', desc: 'Si falla la conexión, el sistema reintenta solo. Sin pérdida de datos.' },
              ].map(f => (
                <div key={f.title} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '20px' }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{f.title}</h4>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── PRECIOS ─────────────────────────────────────────────────────── */}
      <PreciosSection navigate={navigate} />

      {/* ─── TESTIMONIOS ─────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: P.bg }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, color: P.text, margin: '0 0 12px' }}>
                Lo que dicen nuestros clientes
              </h2>
              <p style={{ color: P.muted, fontSize: 16 }}>Empresas dominicanas que ya digitalizaron su operación</p>
            </div>
          </FadeIn>
          <div className="testimonios-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {TESTIMONIOS.map((t, i) => (
              <FadeIn key={t.nombre} delay={i * 0.1}>
                <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, borderRadius: 16, padding: '28px 24px',
                  display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <p style={{ fontSize: 15, color: P.text, lineHeight: 1.7, margin: '0 0 24px', flex: 1 }}>
                    "{t.quote}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: `hsl(${i * 120},50%,45%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {t.nombre.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: P.text }}>{t.nombre}</div>
                      <div style={{ fontSize: 12, color: P.muted }}>{t.empresa} · {t.sector}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: P.bgAlt }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, color: P.text, margin: '0 0 12px' }}>
                Preguntas frecuentes
              </h2>
              <p style={{ color: P.muted, fontSize: 16 }}>Todo lo que necesitas saber antes de empezar</p>
            </div>
          </FadeIn>
          <div style={{ background: P.bgCard, border: `1px solid ${P.border}`, borderRadius: 16, padding: '0 24px' }}>
            {FAQ_DATA.map((item, i) => (
              <FadeIn key={i} delay={i * 0.04}>
                <FAQItem q={item.q} a={item.a} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ───────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: '#050505', textAlign: 'center' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: '-40%', background: 'radial-gradient(ellipse at center,rgba(16,185,129,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <FadeIn>
            <h2 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, color: '#fff', margin: '0 0 20px', position: 'relative' }}>
              Empieza hoy.<br />
              <span style={{ color: '#10B981' }}>Tu primera factura en menos de 10 minutos.</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 17, marginBottom: 40, position: 'relative' }}>
              Sin configuraciones complejas. Sin instalaciones. Sin tarjeta de crédito.
            </p>
            <button onClick={() => navigate('/registrar')}
              style={{ background: '#10B981', border: 'none', color: '#fff', fontSize: 18, fontWeight: 700,
                padding: '18px 44px', borderRadius: 12, cursor: 'pointer', position: 'relative',
                boxShadow: '0 8px 32px rgba(16,185,129,.35)', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#10B981'; e.currentTarget.style.transform = ''; }}>
              Probar gratis 15 días →
            </button>
            <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 20, position: 'relative' }}>
              Sin compromiso · Sin tarjeta de crédito · Cancela cuando quieras
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ background: '#050505', borderTop: '1px solid rgba(255,255,255,.06)',
        padding: 'clamp(40px,6vw,64px) clamp(16px,5vw,80px) 28px', color: 'rgba(255,255,255,.45)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 40, marginBottom: 48 }}>
            <div>
              <div style={{ marginBottom: 14 }}>
                <img src="/logo-hicloud.png" alt="HiCloud ERP" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>El ERP para PYMEs dominicanas. Facturación electrónica nativa con la DGII.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href="https://wa.me/18093081713" target="_blank" rel="noopener noreferrer"
                  style={{ background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.65)',
                    fontSize: 12, padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }}>
                  💚 WhatsApp
                </a>
                <a href="mailto:soporte@hicloudrd.com"
                  style={{ background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.65)',
                    fontSize: 12, padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }}>
                  📧 Email
                </a>
              </div>
            </div>

            <div>
              <h4 style={{ color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', marginBottom: 16 }}>Producto</h4>
              {[{ l: 'Características', id: 'caracteristicas' }, { l: 'Precios', id: 'precios' },
                { l: 'e-CF DGII', id: 'ecf' }, { l: 'Documentación', id: 'faq' }].map(({ l, id }) => (
                <p key={l} style={{ margin: '0 0 10px' }}>
                  <button onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.45)', fontSize: 13,
                      cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.45)')}>
                    {l}
                  </button>
                </p>
              ))}
            </div>

            <div>
              <h4 style={{ color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', marginBottom: 16 }}>Legal</h4>
              {['Términos de uso', 'Privacidad', 'Cookies', 'SLA'].map(l => (
                <p key={l} style={{ margin: '0 0 10px' }}>
                  <a href="#" style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, textDecoration: 'none' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#fff')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,.45)')}>
                    {l}
                  </a>
                </p>
              ))}
            </div>

            <div>
              <h4 style={{ color: '#fff', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', marginBottom: 16 }}>Contacto</h4>
              <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                <a href="https://wa.me/18093081713" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>
                  💚 809-308-1713
                </a>
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                <a href="mailto:soporte@hicloudrd.com"
                  style={{ color: 'rgba(255,255,255,.45)', textDecoration: 'none' }}>
                  📧 soporte@hicloudrd.com
                </a>
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 24,
            display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span>© 2026 HiCloud ERP — República Dominicana 🇩🇴</span>
            <span>Desarrollado con ❤️ en RD</span>
          </div>
        </div>
      </footer>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
