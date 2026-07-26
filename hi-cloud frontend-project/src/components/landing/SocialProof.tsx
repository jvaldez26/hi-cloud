/**
 * Prueba social — sección 3. Va justo tras el hero: la confianza arriba, no al final.
 * TODO el contenido es placeholder (logos y métricas). Ver landing-content.ts.
 */
import { PLACEHOLDER_LOGOS, PLACEHOLDER_METRICS } from '../../config/landing-content';

export default function SocialProof() {
  return (
    <section className="hcl-proof">
      <div className="hcl-wrap">
        <p className="hcl-proof-label">Negocios dominicanos que ya facturan con HiCloud</p>

        <div className="hcl-logos">
          {PLACEHOLDER_LOGOS.map(l => (
            <span key={l} className="hcl-logo-ph hcl-ph" title="Reemplazar por el logo real del cliente (requiere autorización)">
              {l}
            </span>
          ))}
        </div>

        <div className="hcl-metrics">
          {PLACEHOLDER_METRICS.map(m => (
            <div className="hcl-metric" key={m.label}>
              <b className="hcl-ph" title="Cifra provisional — reemplazar por el dato real">{m.value}</b>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
