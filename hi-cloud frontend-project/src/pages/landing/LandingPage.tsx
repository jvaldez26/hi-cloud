import { useState, useEffect } from 'react';
import { Button, Typography, Tag, Row, Col, Card, Statistic } from 'antd';
import {
  RocketOutlined, CheckOutlined, ArrowRightOutlined,
  MenuOutlined, CloseOutlined,
} from '@ant-design/icons';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DemoModal from '../auth/DemoModal';

const { Title, Text } = Typography;

// ── Animación de número contando ──────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref  = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = to / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= to) { setN(to); clearInterval(timer); }
      else setN(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, to]);

  return <span ref={ref}>{n.toLocaleString('es-DO')}{suffix}</span>;
}

// ── Módulos del ERP ───────────────────────────────────────────────────────────
const MODULES = [
  { emoji: '🧾', name: 'e-CF DGII',          desc: 'E31–E47 nativos' },
  { emoji: '📊', name: 'Contabilidad',        desc: 'Balance + Resultados' },
  { emoji: '⚡', name: 'POS',                 desc: 'Ventas en mostrador' },
  { emoji: '💰', name: 'CxC / CxP',           desc: 'Cobros automáticos' },
  { emoji: '👥', name: 'Nómina RRHH',         desc: 'Ley 87-01 + TSS' },
  { emoji: '📦', name: 'Inventario',           desc: 'Trazabilidad total' },
  { emoji: '🏦', name: 'Tesorería',            desc: 'Flujo de caja' },
  { emoji: '📝', name: 'Cotizaciones',         desc: 'Quote → Factura' },
  { emoji: '🔄', name: 'Devoluciones',         desc: 'Notas de crédito' },
  { emoji: '📈', name: 'Reportes',             desc: 'KPIs en tiempo real' },
  { emoji: '🏢', name: 'Activos Fijos',        desc: 'Depreciación DGII' },
  { emoji: '🔒', name: 'Auditoría',            desc: 'Logs inmutables' },
];

const STEPS = [
  { n: '01', title: 'Solicita tu demo',   desc: 'Completa el formulario en 2 minutos. Nuestro equipo te contacta en 24 horas.', color: '#1a56db' },
  { n: '02', title: 'Configura tu empresa', desc: 'Ingresa tu RNC, régimen fiscal y datos de la empresa. Listo en minutos.', color: '#0ea5e9' },
  { n: '03', title: 'Empieza a facturar', desc: 'Genera tu primer e-CF en menos de 5 minutos. Cumplimiento DGII garantizado.', color: '#10b981' },
];

const TESTIMONIALS = [
  { empresa: 'Distribuidora Central S.R.L.', nombre: 'Ricardo M.', cargo: 'Gerente General',
    texto: 'Migramos desde un sistema obsoleto. En 2 semanas estábamos facturando electrónicamente y con toda la contabilidad al día.' },
  { empresa: 'Clínica San José', nombre: 'Dra. Carmen V.', cargo: 'Directora',
    texto: 'La nómina con TSS automática nos ahorró 3 horas semanales. El soporte es excelente y siempre disponible.' },
  { empresa: 'Importadora del Caribe', nombre: 'Luis A.', cargo: 'Contador',
    texto: 'Los reportes DGII 606/607 se generan en segundos. Ya no tememos las auditorías fiscales.' },
];

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ onDemo }: { onDemo: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: scrolled ? 'rgba(13,17,23,.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,.08)' : 'none',
      transition: 'all .3s',
      padding: '0 40px', height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff',
        }}>H</div>
        <Text strong style={{ color: '#fff', fontSize: 18 }}>HiCloud ERP</Text>
        <Tag color="blue" style={{ fontSize: 10, padding: '0 6px' }}>v1.0</Tag>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="text" style={{ color: 'rgba(255,255,255,.7)' }}
          onClick={() => navigate('/precios')}>Precios</Button>
        <Button type="text" style={{ color: 'rgba(255,255,255,.7)' }}
          onClick={() => navigate('/login')}>Iniciar sesión</Button>
        <Button type="primary" onClick={onDemo} icon={<RocketOutlined />}
          style={{ background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none', borderRadius: 8 }}>
          Demo gratis
        </Button>
      </div>
    </nav>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);
  const navigate = useNavigate();
  const featRef  = useRef(null);
  const featInView = useInView(featRef, { once: true });

  return (
    <div style={{ background: '#0d1117', color: '#fff', overflowX: 'hidden' }}>
      <Nav onDemo={() => setDemoOpen(true)} />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
        padding: '120px 24px 80px',
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(26,86,219,.35), transparent)',
        position: 'relative',
      }}>
        {/* Estrellas decorativas */}
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div key={i}
            animate={{ opacity: [.2, .8, .2] }}
            transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 4 }}
            style={{
              position: 'absolute', borderRadius: '50%',
              width: Math.random() > .7 ? 3 : 2,
              height: Math.random() > .7 ? 3 : 2,
              background: '#fff',
              top:  `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              pointerEvents: 'none',
            }} />
        ))}

        <motion.div style={{ maxWidth: 760, position: 'relative' }}
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: .7 }}>

          <Tag style={{ marginBottom: 20, fontSize: 13, padding: '5px 14px', borderRadius: 99,
                         background: 'rgba(26,86,219,.2)', border: '1px solid rgba(26,86,219,.5)',
                         color: '#93c5fd' }}>
            🇩🇴 Diseñado para República Dominicana · Cumplimiento DGII 100%
          </Tag>

          <Title style={{ color: '#fff', fontSize: 56, lineHeight: 1.15, marginBottom: 20 }}>
            El ERP más moderno de{' '}
            <span style={{
              background: 'linear-gradient(90deg,#60a5fa,#34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>América Latina</span>
          </Title>

          <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 19, display: 'block', marginBottom: 36, lineHeight: 1.6 }}>
            Facturación electrónica e-CF, contabilidad, nómina, inventario y más.
            Todo en una plataforma cloud, para empresas dominicanas.
          </Text>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: .97 }}>
              <Button type="primary" size="large" icon={<RocketOutlined />}
                onClick={() => setDemoOpen(true)}
                style={{
                  height: 52, padding: '0 28px', fontSize: 16,
                  background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                  border: 'none', borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(26,86,219,.5)',
                }}>
                🚀 Solicitar Demo Gratis
              </Button>
            </motion.div>
            <Button size="large" onClick={() => navigate('/precios')}
              style={{
                height: 52, padding: '0 28px', fontSize: 16,
                background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.2)',
                color: '#fff', borderRadius: 12,
              }}>
              Ver precios
            </Button>
          </div>

          <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 13, marginTop: 16, display: 'block' }}>
            Sin tarjeta de crédito · Sin instalación · Respuesta en 24 h
          </Text>
        </motion.div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '60px 40px', borderTop: '1px solid rgba(255,255,255,.06)',
                        borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <Row justify="center" gutter={[48, 32]}>
          {[
            { to: 500,  suffix: '+', label: 'Empresas activas',    color: '#60a5fa' },
            { to: 18,   suffix: '',  label: 'Módulos integrados',  color: '#34d399' },
            { to: 99,   suffix: '.9%', label: 'Disponibilidad',   color: '#a78bfa' },
            { to: 100,  suffix: '%', label: 'Cumplimiento DGII',   color: '#fb923c' },
          ].map((s, i) => (
            <Col key={s.label} xs={12} sm={6}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .1 }}
                style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: s.color }}>
                  <CountUp to={s.to} suffix={s.suffix} />
                </div>
                <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{s.label}</Text>
              </motion.div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ── MÓDULOS ───────────────────────────────────────────────────────────── */}
      <section ref={featRef} style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <Tag color="blue" style={{ marginBottom: 12 }}>18 módulos incluidos</Tag>
          <Title level={2} style={{ color: '#fff' }}>
            Todo lo que tu empresa necesita,{' '}
            <span style={{ color: '#60a5fa' }}>en un solo lugar</span>
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 16 }}>
            Desde la primera cotización hasta el cierre contable anual.
          </Text>
        </div>

        <Row gutter={[16, 16]}>
          {MODULES.map((m, i) => (
            <Col xs={12} sm={8} md={6} lg={4} key={m.name}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={featInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * .04 }}
                whileHover={{ y: -4 }}
              >
                <div style={{
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 12, padding: '16px 14px',
                  textAlign: 'center',
                  transition: 'all .2s',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{m.emoji}</div>
                  <Text strong style={{ color: '#fff', display: 'block', fontSize: 13 }}>{m.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>{m.desc}</Text>
                </div>
              </motion.div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ── CÓMO FUNCIONA ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 40px',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(26,86,219,.1), transparent)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <Tag color="green" style={{ marginBottom: 12 }}>Fácil de implementar</Tag>
          <Title level={2} style={{ color: '#fff', marginBottom: 48 }}>
            Empieza en 3 pasos
          </Title>
          <Row gutter={[24, 24]}>
            {STEPS.map((s, i) => (
              <Col xs={24} sm={8} key={s.n}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * .15 }}
                >
                  <div style={{
                    background: 'rgba(255,255,255,.04)',
                    border: `1px solid ${s.color}33`,
                    borderRadius: 16, padding: '28px 24px',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
                      background: `${s.color}22`,
                      border: `1px solid ${s.color}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 800, color: s.color,
                    }}>{s.n}</div>
                    <Title level={4} style={{ color: '#fff', marginBottom: 8 }}>{s.title}</Title>
                    <Text style={{ color: 'rgba(255,255,255,.55)', lineHeight: 1.6 }}>{s.desc}</Text>
                  </div>
                </motion.div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* ── TESTIMONIOS ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <Title level={2} style={{ color: '#fff', textAlign: 'center', marginBottom: 48 }}>
          Lo que dicen nuestros clientes
        </Title>
        <Row gutter={[20, 20]}>
          {TESTIMONIALS.map((t, i) => (
            <Col xs={24} md={8} key={i}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * .12 }}
              >
                <div style={{
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 16, padding: 24,
                }}>
                  <Text style={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.7, display: 'block', marginBottom: 20, fontStyle: 'italic' }}>
                    "{t.texto}"
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, color: '#fff',
                    }}>{t.nombre.charAt(0)}</div>
                    <div>
                      <Text strong style={{ color: '#fff', display: 'block', fontSize: 13 }}>{t.nombre}</Text>
                      <Text style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>{t.cargo} · {t.empresa}</Text>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Col>
          ))}
        </Row>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 40px', textAlign: 'center',
        background: 'linear-gradient(135deg,rgba(26,86,219,.2),rgba(14,165,233,.1))',
        margin: '0 40px 60px', borderRadius: 24,
        border: '1px solid rgba(26,86,219,.3)',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: .97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          <Title level={2} style={{ color: '#fff', marginBottom: 12 }}>
            ¿Listo para modernizar tu empresa?
          </Title>
          <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 16, display: 'block', marginBottom: 32 }}>
            Únete a 500+ empresas dominicanas que ya confían en HiCloud ERP.
          </Text>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button type="primary" size="large" icon={<RocketOutlined />}
              onClick={() => setDemoOpen(true)}
              style={{
                height: 52, padding: '0 32px', fontSize: 16,
                background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                border: 'none', borderRadius: 12,
                boxShadow: '0 8px 32px rgba(26,86,219,.5)',
              }}>
              Solicitar Demo Gratuita
            </Button>
            <Button size="large" onClick={() => navigate('/precios')}
              style={{
                height: 52, padding: '0 32px', fontSize: 16,
                background: 'transparent', border: '1px solid rgba(255,255,255,.25)',
                color: '#fff', borderRadius: 12,
              }}>
              Ver planes →
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '32px 40px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
              © 2026 HiCloud ERP · Hecho en República Dominicana 🇩🇴
            </Text>
          </Col>
          <Col>
            <div style={{ display: 'flex', gap: 20 }}>
              {['Precios', 'Login', 'Demo', 'Soporte'].map(l => (
                <Text key={l} style={{ color: 'rgba(255,255,255,.35)', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => l === 'Precios' ? navigate('/precios') : l === 'Login' ? navigate('/login') : setDemoOpen(true)}>
                  {l}
                </Text>
              ))}
            </div>
          </Col>
        </Row>
      </footer>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
