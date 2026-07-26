/** Hero — sección 2. Título sobre lo que hace el producto, no sobre su categoría. */
import Icon from './LandingIcons';
import LandingLink from './LandingLink';
import ProductShot from './ProductShot';
import { HERO, HERO_SHOT, LANDING_ROUTES } from '../../config/landing-content';

export default function Hero() {
  return (
    <section className="hcl-hero">
      <div className="hcl-wrap hcl-hero-grid">
        <div>
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

        <ProductShot
          url={HERO_SHOT.url}
          label={HERO_SHOT.label}
          chipLeft={HERO_SHOT.chipLeft}
          chipRight={HERO_SHOT.chipRight}
          rows={HERO_SHOT.rows}
          totalLabel={HERO_SHOT.totalLabel}
          total={HERO_SHOT.total}
          meta={HERO_SHOT.meta}
          ariaLabel="Captura del punto de venta de HiCloud con un comprobante e-CF aceptado"
        />
      </div>
    </section>
  );
}
