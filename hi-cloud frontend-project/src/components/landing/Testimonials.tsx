/**
 * Testimonios — sección 8.
 * PLACEHOLDER completo: citas, nombres, negocios y enlaces a caso son de muestra.
 * Requieren cita real y consentimiento del cliente. Ver landing-content.ts.
 */
import LandingLink from './LandingLink';
import { PLACEHOLDER_TESTIMONIALS } from '../../config/landing-content';

export default function Testimonials() {
  return (
    <section className="hcl-sec" id="clientes">
      <div className="hcl-wrap">
        <div className="hcl-sec-head">
          <p className="hcl-eyebrow">Clientes</p>
          <h2>Lo dicen los que están detrás del mostrador</h2>
        </div>

        <div className="hcl-quotes">
          {PLACEHOLDER_TESTIMONIALS.map(t => (
            <figure className="hcl-quote" key={t.id}>
              <blockquote className="hcl-ph" title="Testimonio provisional — reemplazar por cita real y autorizada">
                “{t.quote}”
              </blockquote>
              <footer>
                <span className="hcl-avatar" aria-hidden="true">{t.initials}</span>
                <span>
                  <cite className="hcl-ph" title="Nombre provisional">{t.name}</cite>
                  <span className="hcl-biz hcl-ph" title="Negocio provisional">{t.business}</span>
                </span>
              </footer>
              <LandingLink to={t.href} className="hcl-case hcl-ph" title="Enlace provisional al caso de estudio">
                Ver el caso →
              </LandingLink>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
