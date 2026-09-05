/** Hero — sección 2. Título sobre lo que hace el producto, no sobre su categoría. */
import Icon from './LandingIcons';
import LandingLink from './LandingLink';
import HeroDemo from './HeroDemo';
import { HERO, LANDING_ROUTES } from '../../config/landing-content';

export default function Hero() {
  return (
    <section className="hcl-hero">
      <div className="hcl-wrap hcl-hero-grid">
        <div className="hcl-hero-copy">
          <p className="hcl-eyebrow">{HERO.eyebrow}</p>
          <h1>
            {HERO.titleStart}
            <em>{HERO.titleEm}</em>
          </h1>
          <p className="hcl-lead">{HERO.lead}</p>

          <ul className="hcl-hero-bullets">
            {HERO.bullets.map(b => (
              <li key={b}>
                <Icon name="check" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <div className="hcl-hero-cta">
            <LandingLink to={LANDING_ROUTES.prueba} className="hcl-btn hcl-btn--primary hcl-btn--lg">
              {HERO.ctaPrimary}
            </LandingLink>
            <LandingLink to={LANDING_ROUTES.demo} className="hcl-btn hcl-btn--ghost hcl-btn--lg">
              {HERO.ctaSecondary}
            </LandingLink>
          </div>
          <p className="hcl-hero-note">{HERO.note}</p>
        </div>

        {/* Segunda tarjeta estática detrás (aria-hidden: es puro fondo, la
            demo real ya lleva su propia descripción accesible) + la demo. */}
        <div className="hcl-hero-shot-stack">
          <div className="hcl-hero-shot-shadow" aria-hidden="true" />
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}
