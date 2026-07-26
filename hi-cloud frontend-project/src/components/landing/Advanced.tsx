/** Funciones avanzadas — sección 7. Lo que sostiene el crecimiento del negocio. */
import Icon from './LandingIcons';
import { ADVANCED } from '../../config/landing-content';

export default function Advanced() {
  return (
    <section className="hcl-sec hcl-sec--paper" id="avanzadas">
      <div className="hcl-wrap">
        <div className="hcl-sec-head">
          <p className="hcl-eyebrow">Cuando el negocio crece</p>
          <h2>Funciones que aguantan el siguiente paso</h2>
        </div>

        <div className="hcl-adv">
          {ADVANCED.map(a => (
            <div className="hcl-adv-item" key={a.id}>
              <span className="hcl-ico"><Icon name={a.icon} /></span>
              <div>
                <h3>{a.title}</h3>
                <p>{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
