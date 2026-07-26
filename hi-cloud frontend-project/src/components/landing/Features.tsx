/** Funcionalidades core — sección 4. Eje 1 del menú. */
import Icon from './LandingIcons';
import { FEATURES } from '../../config/landing-content';

export default function Features() {
  return (
    <section className="hcl-sec hcl-sec--paper" id="funcionalidades">
      <div className="hcl-wrap">
        <div className="hcl-sec-head">
          <p className="hcl-eyebrow">Eje 1 · Qué hace</p>
          <h2>Todo el negocio en un solo sistema</h2>
          <p className="hcl-lead">
            Del mostrador al balance general. Cada módulo alimenta al siguiente, así que no
            hay que registrar la misma venta dos veces.
          </p>
        </div>

        <div className="hcl-cards">
          {FEATURES.map(f => (
            <article className="hcl-card" id={f.id} key={f.id}>
              <span className="hcl-ico"><Icon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
