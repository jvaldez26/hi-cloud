/**
 * Mockup de captura de producto.
 *
 * PLACEHOLDER: dibuja un esqueleto en CSS con importes y e-NCF de ejemplo para
 * que se vea la composición. Al tener las capturas reales, sustituir el cuerpo
 * por <img src="/img/landing/pos.webp" alt="…" width height loading="lazy" />
 * y borrar la barra .hcl-shot-label.
 */
import { MOSTRAR, type ShotRow } from '../../config/landing-content';

interface Props {
  url: string;
  label: string;
  rows?: ShotRow[];
  chips?: { text: string; state: 'ok' | 'wait' | 'plain' }[];
  chipLeft?: string;
  chipRight?: string;
  totalLabel?: string;
  total?: string;
  meta?: string;
  ariaLabel?: string;
}

const chipClass = (state: 'ok' | 'wait' | 'plain') =>
  `hcl-chip${state === 'ok' ? ' hcl-chip--ok' : state === 'wait' ? ' hcl-chip--wait' : ''}`;

export default function ProductShot({
  url, label, rows, chips, chipLeft, chipRight, totalLabel, total, meta, ariaLabel,
}: Props) {
  return (
    <div className="hcl-shot" role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <div className="hcl-shot-bar">
        <i /><i /><i />
        <span>{url}</span>
      </div>

      <div className="hcl-shot-body">
        {(chipLeft || chipRight) && (
          <div className="hcl-shot-head">
            {chipLeft && <span className="hcl-chip"><span className="hcl-dot" />{chipLeft}</span>}
            {chipRight && <span className="hcl-chip hcl-chip--ok"><span className="hcl-dot" />{chipRight}</span>}
          </div>
        )}

        {chips && (
          <div className="hcl-shot-chips">
            {chips.map(c => (
              <span key={c.text} className={chipClass(c.state)}>
                <span className="hcl-dot" />{c.text}
              </span>
            ))}
          </div>
        )}

        {rows?.map((r, i) => (
          <div className="hcl-sk-row" key={i}>
            <span className={`hcl-sk hcl-sk--${r.width}`} />
            <span className="hcl-sk-amount">{r.amount}</span>
          </div>
        ))}

        {total && (
          <div className="hcl-shot-total">
            <span className="hcl-shot-total-label">{totalLabel}</span>
            <b>{total}</b>
          </div>
        )}

        {meta && <div className="hcl-shot-meta">{meta}</div>}
      </div>

      {MOSTRAR.etiquetasCaptura && <p className="hcl-shot-label">{label}</p>}
    </div>
  );
}
