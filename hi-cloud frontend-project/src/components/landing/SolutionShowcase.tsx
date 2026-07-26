/**
 * Soluciones con captura — sección 5. Mostrar, no contar.
 * Alterna copy izquierda / captura derecha mediante el flag `flip`.
 */
import Icon from './LandingIcons';
import ProductShot from './ProductShot';
import { SOLUTION_SHOWCASES } from '../../config/landing-content';

export default function SolutionShowcase() {
  return (
    <section className="hcl-sec" id="soluciones">
      <div className="hcl-wrap">
        <div className="hcl-sec-head">
          <p className="hcl-eyebrow">Eje 2 · Para quién</p>
          <h2>Así se ve un día de trabajo</h2>
          <p className="hcl-lead">Cuatro pantallas del sistema real, no ilustraciones.</p>
        </div>

        {SOLUTION_SHOWCASES.map(s => (
          <div className={`hcl-split${s.flip ? ' hcl-split--flip' : ''}`} id={s.id} key={s.id}>
            <div className="hcl-split-copy">
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <ul>
                {s.bullets.map(b => (
                  <li key={b}>
                    <Icon name="check" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <ProductShot
              url={s.shot.url}
              label={s.shot.label}
              rows={s.shot.rows}
              chips={s.shot.chips}
              totalLabel={s.shot.totalLabel}
              total={s.shot.total}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
