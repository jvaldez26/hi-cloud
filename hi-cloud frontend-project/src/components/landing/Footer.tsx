/** Footer — sección 10. Repite los 3 ejes para que el pie también sirva de mapa. */
import Icon from './LandingIcons';
import LandingLink from './LandingLink';
import { FOOTER_BRAND, FOOTER_COLUMNS, FOOTER_CONTACT } from '../../config/landing-content';

export default function Footer() {
  return (
    <footer className="hcl-footer">
      <div className="hcl-wrap">
        <div className="hcl-footer-grid">
          <div className="hcl-brand-col">
            <LandingLink to="/" className="hcl-logo">
              <span className="hcl-logo-mark" aria-hidden="true"><Icon name="cloud" /></span>
              HiCloud
            </LandingLink>
            <p>{FOOTER_BRAND.tagline}</p>
            <p style={{ marginTop: '1rem' }}>
              <span className="hcl-chip hcl-chip--ok">
                <span className="hcl-dot" />{FOOTER_BRAND.badge}
              </span>
            </p>
          </div>

          {FOOTER_COLUMNS.map(col => (
            <div key={col.title}>
              <h5>{col.title}</h5>
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    <LandingLink to={l.href}>{l.label}</LandingLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hcl-footer-bottom">
          <span>{FOOTER_BRAND.legal}</span>
          <a href={`mailto:${FOOTER_CONTACT}`}>{FOOTER_CONTACT}</a>
        </div>
      </div>
    </footer>
  );
}
