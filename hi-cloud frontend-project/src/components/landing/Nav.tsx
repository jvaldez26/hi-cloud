/**
 * Nav de la landing — los 3 ejes.
 *
 * El HTML original usaba <details>/<summary>, que da accesibilidad gratis. Al
 * pasar a React se sustituye por botones con aria-expanded + aria-controls, y
 * se replica a mano lo que <details> daba solo:
 *   · Enter/Espacio abren y cierran (es un <button>, nativo).
 *   · Escape cierra y devuelve el foco al disparador.
 *   · Abrir un eje cierra los otros.
 *   · Clic fuera cierra.
 *   · El menú móvil es un acordeón con el mismo mecanismo.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from './LandingIcons';
import LandingLink from './LandingLink';
import {
  FEATURES, SOLUTIONS_NAV, SIZE_STEPS, LANDING_ROUTES,
} from '../../config/landing-content';

type Eje = 'fx' | 'sol' | 'size' | null;

export default function Nav() {
  const [abierto, setAbierto] = useState<Eje>(null);
  const [movil, setMovil] = useState(false);
  const [ejeMovil, setEjeMovil] = useState<Eje>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});

  // Escape cierra y devuelve el foco al disparador que lo abrió
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (abierto) {
        triggers.current[abierto]?.focus();
        setAbierto(null);
      }
      setMovil(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  // Clic fuera de la nav cierra los paneles
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setAbierto(null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const toggle = (eje: Exclude<Eje, null>) => setAbierto(prev => (prev === eje ? null : eje));

  const Caret = () => <Icon name="chevron" className="hcl-caret" />;

  return (
    <header className="hcl-nav" ref={navRef as React.RefObject<HTMLElement>}>
      <div className="hcl-wrap hcl-nav-inner">
        <LandingLink to="/" className="hcl-logo" aria-label="HiCloud ERP, inicio">
          <span className="hcl-logo-mark" aria-hidden="true">
            <Icon name="cloud" />
          </span>
          HiCloud
        </LandingLink>

        <nav className="hcl-nav-axes" aria-label="Principal">
          {/* ── EJE 1 — Funcionalidades: rejilla ───────────────────────── */}
          <div className="hcl-axis">
            <button
              type="button"
              className="hcl-axis-trigger"
              aria-expanded={abierto === 'fx'}
              aria-controls="panel-fx"
              ref={el => { triggers.current.fx = el; }}
              onClick={() => toggle('fx')}
            >
              Funcionalidades <Caret />
            </button>
            {abierto === 'fx' && (
              <div className="hcl-panel hcl-panel--fx" id="panel-fx">
                <h4>Qué hace el sistema</h4>
                <div className="hcl-panel-grid">
                  {FEATURES.map(f => (
                    <LandingLink key={f.id} to={f.href} onClick={() => setAbierto(null)}>
                      {f.title}
                      <small>{f.blurb}</small>
                    </LandingLink>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── EJE 2 — Soluciones: lista con sellos ───────────────────── */}
          <div className="hcl-axis">
            <button
              type="button"
              className="hcl-axis-trigger"
              aria-expanded={abierto === 'sol'}
              aria-controls="panel-sol"
              ref={el => { triggers.current.sol = el; }}
              onClick={() => toggle('sol')}
            >
              Soluciones <Caret />
            </button>
            {abierto === 'sol' && (
              <div className="hcl-panel hcl-panel--sol" id="panel-sol">
                <h4>Para quién</h4>
                {SOLUTIONS_NAV.map(s => (
                  <LandingLink key={s.id} to={s.href} onClick={() => setAbierto(null)}>
                    {s.title}
                    {s.seal && <span className="hcl-seal">{s.seal}</span>}
                    <small>{s.blurb}</small>
                  </LandingLink>
                ))}
              </div>
            )}
          </div>

          {/* ── EJE 3 — Por tamaño: escalera ───────────────────────────── */}
          <div className="hcl-axis">
            <button
              type="button"
              className="hcl-axis-trigger"
              aria-expanded={abierto === 'size'}
              aria-controls="panel-size"
              ref={el => { triggers.current.size = el; }}
              onClick={() => toggle('size')}
            >
              Por tamaño <Caret />
            </button>
            {abierto === 'size' && (
              <div className="hcl-panel hcl-panel--size" id="panel-size">
                <h4>Según dónde estás</h4>
                {SIZE_STEPS.map((s, i) => (
                  <LandingLink key={s.id} to={s.href} className="hcl-step" onClick={() => setAbierto(null)}>
                    <span className={`hcl-bar hcl-bar--${i + 1}`} aria-hidden="true" />
                    <span>
                      {s.title}
                      <br />
                      <span className="hcl-rung">{s.scope}</span>
                    </span>
                  </LandingLink>
                ))}
              </div>
            )}
          </div>

          <LandingLink to={LANDING_ROUTES.precios} style={{ padding: '.55rem .8rem', fontSize: '.975rem' }}>
            Precios
          </LandingLink>
        </nav>

        <div className="hcl-nav-right">
          <LandingLink to={LANDING_ROUTES.login} className="hcl-btn hcl-btn--ghost">Iniciar sesión</LandingLink>
          <LandingLink to={LANDING_ROUTES.prueba} className="hcl-btn hcl-btn--primary">Prueba gratis</LandingLink>
          <button
            type="button"
            className="hcl-nav-toggle"
            aria-expanded={movil}
            aria-controls="nav-movil"
            aria-label={movil ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMovil(v => !v)}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>

      {/* ── Menú móvil: mismos 3 ejes, en acordeón ───────────────────────── */}
      <div className={`hcl-nav-mobile${movil ? ' is-open' : ''}`} id="nav-movil">
        <div className="hcl-wrap">
          <div className="hcl-axis">
            <button
              type="button" className="hcl-axis-trigger"
              aria-expanded={ejeMovil === 'fx'}
              onClick={() => setEjeMovil(p => (p === 'fx' ? null : 'fx'))}
            >
              Funcionalidades <Caret />
            </button>
            {ejeMovil === 'fx' && (
              <div className="hcl-panel hcl-panel--fx">
                <div className="hcl-panel-grid">
                  {FEATURES.map(f => (
                    <LandingLink key={f.id} to={f.href} onClick={() => setMovil(false)}>{f.title}</LandingLink>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="hcl-axis">
            <button
              type="button" className="hcl-axis-trigger"
              aria-expanded={ejeMovil === 'sol'}
              onClick={() => setEjeMovil(p => (p === 'sol' ? null : 'sol'))}
            >
              Soluciones <Caret />
            </button>
            {ejeMovil === 'sol' && (
              <div className="hcl-panel hcl-panel--sol">
                {SOLUTIONS_NAV.map(s => (
                  <LandingLink key={s.id} to={s.href} onClick={() => setMovil(false)}>
                    {s.title}
                    {s.seal && <span className="hcl-seal">{s.seal}</span>}
                  </LandingLink>
                ))}
              </div>
            )}
          </div>

          <div className="hcl-axis">
            <button
              type="button" className="hcl-axis-trigger"
              aria-expanded={ejeMovil === 'size'}
              onClick={() => setEjeMovil(p => (p === 'size' ? null : 'size'))}
            >
              Por tamaño <Caret />
            </button>
            {ejeMovil === 'size' && (
              <div className="hcl-panel hcl-panel--size">
                {SIZE_STEPS.map(s => (
                  <LandingLink key={s.id} to={s.href} onClick={() => setMovil(false)}>{s.title}</LandingLink>
                ))}
              </div>
            )}
          </div>

          <div className="hcl-m-actions">
            <LandingLink to={LANDING_ROUTES.login} className="hcl-btn hcl-btn--ghost">Iniciar sesión</LandingLink>
            <LandingLink to={LANDING_ROUTES.prueba} className="hcl-btn hcl-btn--primary">Prueba gratis</LandingLink>
          </div>
        </div>
      </div>
    </header>
  );
}
