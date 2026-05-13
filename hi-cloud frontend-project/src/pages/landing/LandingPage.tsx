import { useState, useEffect, useRef } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import api from '../../api/client';

// ── Paleta ──────────────────────────────────────────────────────────────────────
const L = {
  dark:    '#0A1628',
  darkAlt: '#0d1f3c',
  primary: '#1565C0',
  accent:  '#00BFA5',
  accentD: '#009688',
  text:    '#1A1A1A',
  muted:   '#64748B',
  gray:    '#F5F7FA',
  border:  '#E2E8F0',
  white:   '#FFFFFF',
};

// ── Fade in al scroll ────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, y = 24 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

// ── CountUp animado ──────────────────────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let cur = 0;
    const step = to / 50;
    const t = setInterval(() => {
      cur += step;
      if (cur >= to) { setN(to); clearInterval(t); } else setN(Math.floor(cur));
    }, 20);
    return () => clearInterval(t);
  }, [inView, to]);
  return <span ref={ref}>{n.toLocaleString('es-DO')}{suffix}</span>;
}

// ── Navbar ───────────────────────────────────────────────────────────────────────
function Navbar({ onDemo }: { onDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mopen,    setMopen]    = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMopen(false);
  };

  const navLinks = [
    { label: 'Características', id: 'caracteristicas' },
    { label: 'Precios',         id: 'precios' },
    { label: 'e-CF',            id: 'ecf' },
    { label: 'FAQ',             id: 'faq' },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: scrolled ? 'rgba(10,22,40,.97)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,.08)' : 'none',
      transition: 'all .3s', padding: '0 clamp(16px,4vw,48px)', height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <img src="/logo-hicloud.png" alt="HiCloud ERP"
          style={{ height: 44, width: 'auto', objectFit: 'contain',
            filter: 'drop-shadow(0 2px 8px rgba(0,170,255,0.35))' }} />
        <span style={{ background: '#00BFA5', color: '#fff', fontSize: 9, fontWeight: 700,
          padding: '1px 6px', borderRadius: 4, letterSpacing: '0.5px' }}>BETA</span>
      </div>

      {/* Desktop links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, ['@media(max-width:768px)' as any]: { display: 'none' } }}
        className="nav-desktop">
        {navLinks.map(l => (
          <button key={l.id} onClick={() => scrollTo(l.id)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.75)',
              fontSize: 14, cursor: 'pointer', padding: '6px 12px', borderRadius: 6,
              transition: 'color .15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.75)')}>
            {l.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate('/login')}
          style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
            color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8,
            cursor: 'pointer', transition: 'all .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}>
          Iniciar sesión
        </button>
        <button onClick={onDemo}
          style={{ background: 'linear-gradient(135deg,#00BFA5,#009688)', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,191,165,.35)', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,191,165,.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,191,165,.35)'; }}>
          Demo gratis →
        </button>

        {/* Mobile hamburger */}
        <button onClick={() => setMopen(v => !v)} className="nav-hamburger"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer',
            display: 'none', padding: 4 }}>
          {mopen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mopen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ position: 'absolute', top: 64, left: 0, right: 0, background: 'rgba(10,22,40,.98)',
              borderBottom: '1px solid rgba(255,255,255,.1)', padding: '12px 24px 20px' }}>
            {navLinks.map(l => (
              <button key={l.id} onClick={() => scrollTo(l.id)}
                style={{ display: 'block', width: '100%', background: 'none', border: 'none',
                  color: 'rgba(255,255,255,.8)', fontSize: 16, textAlign: 'left',
                  padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}>
                {l.label}
              </button>
            ))}
            <button onClick={() => { navigate('/login'); setMopen(false); }}
              style={{ marginTop: 16, width: '100%', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
                color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 8, cursor: 'pointer' }}>
              Iniciar sesión
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '⚡', title: 'e-CF Automático',    desc: 'E31-E47 en tiempo real. Comprobantes aceptados por DGII al instante, sin pasos manuales.' },
  { icon: '🛒', title: 'POS + e-CF',         desc: 'Vende y emite comprobante en menos de 30 segundos. Funciona sin conexión.' },
  { icon: '📊', title: 'Reportes DGII',       desc: '606, 607, 608 automáticos. Archivos TXT listos para el portal DGII en un clic.' },
  { icon: '📄', title: 'Facturación',         desc: 'Facturas, cotizaciones, notas de crédito y débito. Flujo completo de ventas.' },
  { icon: '📦', title: 'Inventario',          desc: 'Stock en tiempo real con alertas. Trazabilidad de lotes y seriales.' },
  { icon: '👥', title: 'Clientes y CRM',      desc: 'Historial completo, estado de cuenta, cuentas por cobrar automáticas.' },
  { icon: '🛍️', title: 'Compras',             desc: 'Órdenes de compra con e-CF E41. Cuentas por pagar automatizadas.' },
  { icon: '🏢', title: 'Multi-empresa',       desc: 'Una plataforma para todas tus empresas con aislamiento completo de datos.' },
  { icon: '☁️', title: 'Backups S3',          desc: 'Copias de seguridad diarias en AWS S3. Restauración en menos de 30 minutos.' },
];

const ECF_TYPES = [
  { code: 'E31', name: 'Crédito Fiscal',         color: '#1565C0' },
  { code: 'E32', name: 'Consumo',                color: '#6B7280' },
  { code: 'E33', name: 'Nota de Débito',         color: '#7C3AED' },
  { code: 'E34', name: 'Nota de Crédito',        color: '#DC2626' },
  { code: 'E41', name: 'Compras',                color: '#059669' },
  { code: 'E43', name: 'Gastos Menores',         color: '#D97706' },
  { code: 'E44', name: 'Zona Franca',            color: '#0891B2' },
  { code: 'E45', name: 'Gubernamental',          color: '#7C3AED' },
  { code: 'E46', name: 'Exportaciones',          color: '#BE185D' },
  { code: 'E47', name: 'Pagos al Exterior',      color: '#9333EA' },
];

// Colores y configuración visual por clave de plan
const PLAN_VISUAL: Record<string, { color: string; highlight: boolean; badge?: string; cta: string }> = {
  basico:      { color: L.primary,  highlight: false, cta: 'Solicitar Demo' },
  profesional: { color: '#00BFA5',  highlight: true,  badge: 'MÁS POPULAR', cta: 'Empezar' },
  empresarial: { color: '#7C3AED',  highlight: false, cta: 'Contactar' },
};

// Convierte los datos de la API al formato de la landing
function mapPlanApi(p: any) {
  const v = PLAN_VISUAL[p.clave] ?? { color: L.primary, highlight: false, cta: 'Solicitar Demo' };
  const usuarios = p.maxUsuarios === -1 ? 'Usuarios ilimitados' : `${p.maxUsuarios} usuarios`;
  const facturas = p.maxFacturasMes === -1 ? 'Facturas ilimitadas' : `${p.maxFacturasMes} facturas/mes`;
  const features = [
    usuarios,
    facturas,
    'Todos los módulos',
    'e-CF E31-E47 incluido',
    'Backups S3 automáticos',
    p.soporte ? `Soporte: ${p.soporte}` : 'Soporte incluido',
  ];
  const precio = Number(p.precio);
  const precioFmt = precio === 0 ? 'Gratis'
    : `RD$${precio.toLocaleString('es-DO')}`;

  return { ...v, clave: p.clave, name: p.nombre, price: precioFmt, period: precio > 0 ? '/mes' : '', features };
}

const FAQ_DATA = [
  { q: '¿HiCloud me certifica ante la DGII?', a: 'HiCloud se conecta con tu proveedor e-CF (MSeller u otro) ya certificado ante la DGII. El proceso de certificación lo realizas con tu proveedor e-CF en 4 pasos sencillos.' },
  { q: '¿Necesito una cuenta en MSeller?', a: 'Sí. HiCloud se integra con MSeller y otros proveedores certificados DGII. MSeller ofrece 200 documentos gratis al mes para empezar.' },
  { q: '¿Qué pasa con mis datos si cancelo?', a: 'Tus datos son tuyos. Puedes exportar toda tu información en cualquier momento. Realizamos backups diarios en AWS S3 en la región us-east-2.' },
  { q: '¿Puedo migrar desde mi sistema actual?', a: 'Sí. Ofrecemos importación masiva de clientes, productos y proveedores desde Excel/CSV. El equipo de soporte te acompaña durante la migración.' },
  { q: '¿Funciona en móvil?', a: 'Sí. HiCloud es 100% responsive. El POS funciona perfectamente en tablet y móvil, incluyendo modo offline para ventas sin conexión.' },
  { q: '¿Cuánto tiempo toma implementarlo?', a: 'Una PYME típica está operando en 1-3 días. Para empresas más complejas con varios usuarios y flujos, de 1 a 2 semanas.' },
  { q: '¿Los reportes 606/607/608 son automáticos?', a: 'Sí. HiCloud genera los archivos TXT oficiales en el formato exacto del portal DGII con un solo clic, incluyendo validaciones previas.' },
  { q: '¿Puedo manejar varias empresas?', a: 'Sí. HiCloud es multi-empresa con aislamiento total de datos. Puedes cambiar entre empresas desde el mismo login.' },
];

// ── Sección FAQ ──────────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${L.border}`, padding: '0' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', background: 'none', border: 'none', textAlign: 'left',
        padding: '18px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: L.text }}>{q}</span>
        <span style={{ fontSize: 18, color: L.primary, flexShrink: 0, transition: 'transform .2s',
          transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}>
            <p style={{ margin: '0 0 18px', color: L.muted, fontSize: 14, lineHeight: 1.7 }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Formulario de Demo ────────────────────────────────────────────────────────────
function DemoForm() {
  const [form, setForm]       = useState({ nombre: '', empresa: '', rnc: '', email: '', telefono: '', usuarios: '1-5', mensaje: '' });
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.empresa || !form.email || !form.telefono) {
      message.error('Por favor completa los campos requeridos');
      return;
    }
    setLoading(true);
    try {
      await api.post('/demo/solicitar', form);
      setSent(true);
    } catch {
      message.error('Error al enviar. Intenta de nuevo o escríbenos por WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: `1px solid ${L.border}`, fontSize: 14, outline: 'none',
    background: '#fff', color: L.text, boxSizing: 'border-box',
    transition: 'border-color .15s',
  };

  if (sent) return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <h3 style={{ color: L.text, marginBottom: 8 }}>¡Solicitud recibida!</h3>
      <p style={{ color: L.muted }}>Nuestro equipo se contactará contigo en menos de 24 horas.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>Nombre completo *</label>
          <input style={inputStyle} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Juan Pérez" required
            onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>Empresa *</label>
          <input style={inputStyle} value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
            placeholder="Mi Empresa S.R.L." required
            onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>Correo electrónico *</label>
          <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="juan@empresa.com" required
            onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>Teléfono / WhatsApp *</label>
          <input style={inputStyle} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
            placeholder="809-555-0000" required
            onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>RNC (opcional)</label>
          <input style={inputStyle} value={form.rnc} onChange={e => setForm(f => ({ ...f, rnc: e.target.value }))}
            placeholder="132xxxxxx"
            onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>Número de usuarios</label>
          <select style={inputStyle} value={form.usuarios} onChange={e => setForm(f => ({ ...f, usuarios: e.target.value }))}>
            <option value="1-5">1-5 usuarios</option>
            <option value="6-15">6-15 usuarios</option>
            <option value="16-30">16-30 usuarios</option>
            <option value="30+">Más de 30</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: L.muted, display: 'block', marginBottom: 5 }}>¿Qué necesitas? (opcional)</label>
        <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' as const }}
          value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))}
          placeholder="Cuéntanos un poco sobre tu negocio y qué módulos necesitas..."
          onFocus={e => (e.target.style.borderColor = L.primary)} onBlur={e => (e.target.style.borderColor = L.border)} />
      </div>
      <button type="submit" disabled={loading}
        style={{ background: loading ? '#94A3B8' : 'linear-gradient(135deg,#00BFA5,#009688)',
          color: '#fff', border: 'none', borderRadius: 10, padding: '14px 32px',
          fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 4px 16px rgba(0,191,165,.4)', transition: 'all .2s' }}>
        {loading ? 'Enviando…' : 'Solicitar Demo Gratis →'}
      </button>
      <p style={{ margin: 0, color: L.muted, fontSize: 12, textAlign: 'center' }}>Sin compromiso · Sin tarjeta de crédito · Respuesta en 24h</p>
    </form>
  );
}

// ── Landing principal ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  // Planes dinámicos desde la BD
  const [planesDB, setPlanesDB] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/v1/public/planes')
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.data ?? []);
        // Mostrar solo basico, profesional, empresarial (excluir trial y enterprise)
        const visibles = arr.filter((p: any) => ['basico','profesional','empresarial'].includes(p.clave));
        setPlanesDB(visibles);
      })
      .catch(() => { /* usa fallback */ });
  }, []);

  // Si el fetch falla o todavía carga, usar datos de respaldo
  const planesRender = planesDB.length > 0
    ? planesDB.map(mapPlanApi)
    : [
        { clave:'basico',      name:'Básico',      price:'RD$1,500', period:'/mes', color:L.primary, highlight:false, cta:'Solicitar Demo',
          features:['3 usuarios','50 facturas/mes','Todos los módulos','e-CF incluido','Backups S3','Soporte: Documentación'] },
        { clave:'profesional', name:'Profesional',  price:'RD$3,500', period:'/mes', color:'#00BFA5', highlight:true,  cta:'Empezar',        badge:'MÁS POPULAR',
          features:['10 usuarios','1000 facturas/mes','Todos los módulos','e-CF incluido','Backups S3','Soporte: Email + Chat'] },
        { clave:'empresarial', name:'Empresarial',  price:'RD$7,000', period:'/mes', color:'#7C3AED', highlight:false, cta:'Contactar',
          features:['25 usuarios','5000 facturas/mes','Todos los módulos','e-CF incluido','API access','Soporte: Teléfono'] },
      ];

  const scrollToForm = () => {
    document.getElementById('demo-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: L.text, overflowX: 'hidden' }}>
      <Navbar onDemo={scrollToForm} />

      {/* ─── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh', background: L.dark,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(100px,12vw,140px) clamp(16px,5vw,80px) 80px',
        textAlign: 'center',
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(21,101,192,.3), transparent), radial-gradient(ellipse 40% 40% at 80% 60%, rgba(0,191,165,.12), transparent)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid decorativo */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 820, position: 'relative' }}>
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,191,165,.15)', border: '1px solid rgba(0,191,165,.3)', color: '#00BFA5', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 20, marginBottom: 24, letterSpacing: '0.5px' }}>
              🇩🇴 &nbsp;HECHO PARA REPÚBLICA DOMINICANA · LEY 32-23
            </span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            style={{ fontSize: 'clamp(32px,5.5vw,58px)', fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 20px' }}>
            El ERP con Facturación<br />
            <span style={{ background: 'linear-gradient(90deg,#00BFA5,#42A5F5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Electrónica Nativa
            </span><br />para PYMEs Dominicanas
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: 'clamp(16px,2.2vw,19px)', color: 'rgba(255,255,255,.72)', maxWidth: 620, margin: '0 auto 32px', lineHeight: 1.65 }}>
            Gestiona tu negocio completo y emite comprobantes electrónicos (e-CF) automáticamente desde un solo sistema. Cumple con la DGII sin complicaciones.
          </motion.p>

          {/* Badges */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
            {['✅ Certificado DGII', '📋 Ley 32-23', '⚡ e-CF en tiempo real', '🔒 AWS Cloud', '🛒 POS incluido'].map(b => (
              <span key={b} style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)',
                color: 'rgba(255,255,255,.8)', fontSize: 12, padding: '5px 12px', borderRadius: 20 }}>{b}</span>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            <button onClick={scrollToForm}
              style={{ background: 'linear-gradient(135deg,#00BFA5,#009688)', color: '#fff', border: 'none',
                fontSize: 16, fontWeight: 700, padding: '14px 28px', borderRadius: 10, cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,191,165,.45)', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,191,165,.55)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,191,165,.45)'; }}>
              Solicitar acceso gratis →
            </button>
            <button onClick={() => navigate('/login')}
              style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.22)',
                color: '#fff', fontSize: 15, fontWeight: 600, padding: '14px 24px', borderRadius: 10,
                cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}>
              Ver demo en vivo
            </button>
          </motion.div>
        </div>
      </section>

      {/* ─── BANNER DE URGENCIA ──────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(135deg,#B45309,#D97706)', padding: '16px 24px', textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#fff', fontSize: 'clamp(13px,2vw,15px)', fontWeight: 600 }}>
          ⏰ <strong>DGII:</strong> Plazo hasta el 15 de noviembre 2026 para pequeños y micro contribuyentes.
          HiCloud te pone en operación en menos de una semana.
          <button onClick={scrollToForm} style={{ marginLeft: 12, background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)',
            color: '#fff', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>
            Empezar ahora →
          </button>
        </p>
      </section>

      {/* ─── PROBLEMA → SOLUCIÓN ─────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.gray }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, marginBottom: 48, letterSpacing: '-0.02em' }}>
              ¿Sigues usando <span style={{ color: '#DC2626' }}>Excel para facturar</span>?
            </h2>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <FadeIn delay={0.1}>
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 16, padding: 28 }}>
                <div style={{ fontSize: 22, marginBottom: 16, fontWeight: 700, color: '#DC2626' }}>❌ El dolor hoy</div>
                {['Usando Excel o facturación desconectada', 'Sistema de inventario separado del POS', 'Generando el 606/607 manualmente', 'Sin saber si tu e-CF fue aceptado por DGII', 'Pagando por 3-4 sistemas diferentes'].map(t => (
                  <p key={t} style={{ margin: '0 0 8px', color: '#991B1B', fontSize: 14, display: 'flex', gap: 8 }}>
                    <span>✗</span><span>{t}</span>
                  </p>
                ))}
              </div>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 16, padding: 28 }}>
                <div style={{ fontSize: 22, marginBottom: 16, fontWeight: 700, color: '#059669' }}>✅ Con HiCloud</div>
                {['Todo integrado en una sola plataforma', 'e-CF automático desde cualquier módulo', '606/607/608 con un clic — listo para DGII', 'Estado del comprobante en tiempo real', 'Un solo precio — todo incluido'].map(t => (
                  <p key={t} style={{ margin: '0 0 8px', color: '#065F46', fontSize: 14, display: 'flex', gap: 8 }}>
                    <span>✓</span><span>{t}</span>
                  </p>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── CARACTERÍSTICAS ─────────────────────────────────────────────────── */}
      <section id="caracteristicas" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.white }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <h2 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
                Todo lo que necesita tu PYME
              </h2>
              <p style={{ color: L.muted, fontSize: 17, maxWidth: 540, margin: '0 auto' }}>
                Módulos integrados que trabajan juntos. Sin plugins, sin integraciones rotas.
              </p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.06}>
                <div style={{ background: L.gray, border: `1px solid ${L.border}`, borderRadius: 14, padding: '22px 24px',
                  transition: 'all .2s', cursor: 'default' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = L.primary; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.borderColor = L.border; }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>{f.title}</h3>
                  <p style={{ margin: 0, color: L.muted, fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CÓMO FUNCIONA EL e-CF ───────────────────────────────────────────── */}
      <section id="ecf" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.dark, color: '#fff' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <h2 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, marginBottom: 12 }}>
                e-CF en 3 pasos simples
              </h2>
              <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 17 }}>
                Desde cero hasta tu primer comprobante aceptado por la DGII.
              </p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { n: '01', title: 'Configura tu empresa', desc: 'Agrega tu RNC, conecta tus credenciales de MSeller y carga tus secuencias DGII. Todo en minutos.', color: '#42A5F5' },
              { n: '02', title: 'Emite desde cualquier módulo', desc: 'Facturas, POS, compras — todos generan el e-CF automáticamente al confirmar la operación.', color: '#00BFA5' },
              { n: '03', title: 'DGII confirma en segundos', desc: 'El comprobante llega a la DGII vía MSeller. Recibes el eNCF con código QR de validación.', color: '#A78BFA' },
            ].map((s, i) => (
              <FadeIn key={s.n} delay={i * 0.12}>
                <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: 28, position: 'relative' }}>
                  <div style={{ fontSize: 48, fontWeight: 900, color: s.color, opacity: 0.25, position: 'absolute', top: 16, right: 20, lineHeight: 1, fontFamily: 'monospace' }}>{s.n}</div>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: s.color + '22', border: `1px solid ${s.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: s.color, marginBottom: 16 }}>
                    {s.n}
                  </div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700 }}>{s.title}</h3>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.65 }}>{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Tipos de e-CF */}
          <FadeIn delay={0.3}>
            <div style={{ marginTop: 56, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 20 }}>
                Todos los tipos oficiales DGII — Ley 32-23 compliant
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
                {ECF_TYPES.map(t => (
                  <span key={t.code} style={{ background: t.color + '22', border: `1px solid ${t.color}44`,
                    borderRadius: 8, padding: '7px 14px', fontSize: 13 }}>
                    <span style={{ color: t.color, fontWeight: 800, fontFamily: 'monospace' }}>{t.code}</span>
                    <span style={{ color: 'rgba(255,255,255,.6)', marginLeft: 8 }}>{t.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── MÉTRICAS ────────────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(40px,6vw,64px) clamp(16px,5vw,80px)', background: L.primary }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, textAlign: 'center' }}>
          {[
            { label: 'Facturas emitidas', value: 69,   suffix: '+' },
            { label: 'Tipos de e-CF',     value: 10,   suffix: '' },
            { label: 'Módulos activos',   value: 90,   suffix: '+' },
            { label: 'Uptime garantizado',value: 99,   suffix: '%' },
          ].map(m => (
            <FadeIn key={m.label}>
              <div>
                <div style={{ fontSize: 'clamp(36px,5vw,52px)', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                  <CountUp to={m.value} suffix={m.suffix} />
                </div>
                <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginTop: 6 }}>{m.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ─── PLANES ──────────────────────────────────────────────────────────── */}
      <section id="precios" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.gray }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 52 }}>
              <h2 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>Planes simples y transparentes</h2>
              <p style={{ color: L.muted, fontSize: 15 }}>* Los precios no incluyen el costo del proveedor e-CF (MSeller). Puedes usar tu cuenta MSeller existente.</p>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
            {planesRender.map((p, i) => (
              <FadeIn key={p.clave ?? p.name} delay={i * 0.1}>
                <div style={{ background: p.highlight ? L.dark : L.white,
                  border: `2px solid ${p.highlight ? p.color : L.border}`,
                  borderRadius: 18, padding: 32, position: 'relative',
                  boxShadow: p.highlight ? '0 16px 48px rgba(0,0,0,.18)' : 'none',
                  transform: p.highlight ? 'scale(1.03)' : 'none',
                }}>
                  {p.badge && (
                    <span style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                      background: p.color, color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.5px' }}>
                      {p.badge}
                    </span>
                  )}
                  <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: p.highlight ? '#fff' : L.text }}>{p.name}</h3>
                  <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 44, fontWeight: 900, color: p.color }}>{p.price}</span>
                    <span style={{ color: p.highlight ? 'rgba(255,255,255,.5)' : L.muted, fontSize: 14 }}>{p.period}</span>
                  </div>
                  {p.features.map(f => (
                    <p key={f} style={{ margin: '0 0 10px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: p.highlight ? 'rgba(255,255,255,.8)' : L.text }}>
                      <span style={{ color: p.color, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                    </p>
                  ))}
                  <button onClick={scrollToForm}
                    style={{ marginTop: 24, width: '100%', background: p.highlight ? p.color : 'transparent',
                      border: `2px solid ${p.color}`, color: p.highlight ? '#fff' : p.color,
                      fontSize: 14, fontWeight: 700, padding: '12px', borderRadius: 10, cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { if (!p.highlight) { e.currentTarget.style.background = p.color; e.currentTarget.style.color = '#fff'; }}}
                    onMouseLeave={e => { if (!p.highlight) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = p.color; }}}>
                    {p.cta}
                  </button>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.white }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <FadeIn>
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, marginBottom: 44, letterSpacing: '-0.02em' }}>
              Preguntas frecuentes
            </h2>
          </FadeIn>
          {FAQ_DATA.map(item => <FAQItem key={item.q} q={item.q} a={item.a} />)}
        </div>
      </section>

      {/* ─── CTA FINAL + FORMULARIO ──────────────────────────────────────────── */}
      <section id="demo-form" style={{ padding: 'clamp(60px,8vw,96px) clamp(16px,5vw,80px)', background: L.dark }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, color: '#fff', marginBottom: 14, letterSpacing: '-0.02em' }}>
                ¿Listo para modernizar tu negocio?
              </h2>
              <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 17, maxWidth: 520, margin: '0 auto' }}>
                Solicita tu demo gratuita. Nuestro equipo te contacta en menos de 24 horas.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div style={{ background: L.white, borderRadius: 20, padding: 'clamp(24px,4vw,40px)', boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
              <DemoForm />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#060E1A', padding: 'clamp(40px,6vw,64px) clamp(16px,5vw,80px) 24px', color: 'rgba(255,255,255,.55)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 40, marginBottom: 48 }}>
            {/* Logo + tagline */}
            <div>
              <div style={{ marginBottom: 12 }}>
                <img src="/logo-hicloud.png" alt="HiCloud ERP"
                  style={{ height: 48, width: 'auto', objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 6px rgba(0,170,255,0.3))' }} />
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>El ERP para PYMEs dominicanas. Facturación electrónica nativa con la DGII.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {[
                  { label: 'WhatsApp', href: 'https://wa.me/18095550000' },
                  { label: 'Email',    href: 'mailto:hola@hicloudrd.com' },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    style={{ background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.7)',
                      fontSize: 12, padding: '5px 12px', borderRadius: 6, textDecoration: 'none', transition: 'background .15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,.15)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,.08)')}>
                    {s.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Producto */}
            <div>
              <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Producto</h4>
              {['Características', 'Precios', 'e-CF DGII', 'Documentación', 'Demo'].map(l => (
                <p key={l} style={{ margin: '0 0 10px' }}>
                  <a href="#" onClick={e => { e.preventDefault(); scrollToForm(); }}
                    style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, textDecoration: 'none', transition: 'color .15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#fff')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,.55)')}>
                    {l}
                  </a>
                </p>
              ))}
            </div>

            {/* Legal */}
            <div>
              <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Legal</h4>
              {['Términos de uso', 'Privacidad', 'Cookies', 'SLA'].map(l => (
                <p key={l} style={{ margin: '0 0 10px' }}>
                  <a href="#" style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, textDecoration: 'none', transition: 'color .15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#fff')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,.55)')}>
                    {l}
                  </a>
                </p>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span>© 2026 HiCloud ERP — República Dominicana 🇩🇴</span>
            <span>Desarrollado con ❤️ en RD</span>
          </div>
        </div>
      </footer>

      {/* CSS para mobile nav */}
      <style>{`
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-hamburger { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
