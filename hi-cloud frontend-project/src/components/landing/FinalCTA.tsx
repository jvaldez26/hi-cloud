/** CTA final — sección 9. */
import LandingLink from './LandingLink';
import { FINAL_CTA, LANDING_ROUTES } from '../../config/landing-content';

export default function FinalCTA() {
  return (
    <section className="hcl-sec hcl-sec--paper" id="prueba">
      <div className="hcl-wrap hcl-cta-final">
        <p className="hcl-eyebrow">{FINAL_CTA.eyebrow}</p>
        <h2>{FINAL_CTA.title}</h2>
        <p className="hcl-lead">{FINAL_CTA.lead}</p>
        <div className="hcl-cta-row">
          <LandingLink to={LANDING_ROUTES.registro} className="hcl-btn hcl-btn--primary hcl-btn--lg">
            {FINAL_CTA.primary}
          </LandingLink>
          <LandingLink to={LANDING_ROUTES.whatsapp} className="hcl-btn hcl-btn--ghost hcl-btn--lg">
            {FINAL_CTA.secondary}
          </LandingLink>
        </div>
      </div>
    </section>
  );
}
