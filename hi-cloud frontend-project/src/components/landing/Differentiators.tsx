/**
 * Lo que nos diferencia — sección 6. Bloque de posicionamiento.
 * Fondo tinta para separarlo del resto de la página.
 */
import Icon from './LandingIcons';
import { DIFFERENTIATORS } from '../../config/landing-content';

export default function Differentiators() {
  return (
    <section className="hcl-sec hcl-sec--ink" id="diferencia">
      <div className="hcl-wrap">
        <div className="hcl-sec-head">
          <p className="hcl-eyebrow">Por qué HiCloud y no otro</p>
          <h2>Lo que aquí está incluido, en otros no existe</h2>
          <p className="hcl-lead">
            La mayoría de los sistemas del mercado le hablan al contador. HiCloud le habla a
            quien abre y cierra el negocio.
          </p>
        </div>

        <div className="hcl-diff-grid">
          {DIFFERENTIATORS.map(d => (
            <article className="hcl-diff" id={d.id} key={d.id}>
              {d.tag && <span className="hcl-tag">{d.tag}</span>}
              <h3>{d.title}</h3>
              <p>{d.desc}</p>
              {d.bullets && (
                <ul>
                  {d.bullets.map(b => (
                    <li key={b}>
                      <Icon name="check" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
