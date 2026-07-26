/**
 * Iconos de la landing — SVG de trazo, inline, sin dependencia de librería.
 *
 * Se dibujan con `currentColor`, así que heredan el color del contenedor y
 * funcionan igual en claro y en oscuro sin variantes.
 */
import type { IconName } from '../../config/landing-content';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PATHS: Record<IconName, { d: React.ReactNode; sw?: number }> = {
  invoice: { d: <><path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5M9 13h7M9 17h5" /></> },
  pos:     { d: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M9 16v4M15 16v4" /></> },
  box:     { d: <><path d="M3 7 12 3l9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></> },
  cart:    { d: <><path d="M3 4h2l2.5 12h11L21 8H7" /><circle cx="9.5" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /></> },
  ledger:  { d: <><path d="M4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" /><path d="M4 20h16M8 9h8M8 13h8M8 17h4" /></> },
  bank:    { d: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></> },
  chart:   { d: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
  people:  { d: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M17 11h4M17 15h4" /></> },
  trend:   { d: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-5 3 3 5-7" /></> },
  lock:    { d: <><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></> },
  grid:    { d: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /></> },
  gear:    { d: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3.5" /></> },
  check:   { d: <><path d="m4 12 5.5 5.5L20 7" /></>, sw: 2.4 },
  cloud:   { d: <><path d="M4 15a4 4 0 0 1 1.6-7.7 6 6 0 0 1 11.4 1.2A3.6 3.6 0 0 1 20 15Z" /></>, sw: 2.2 },
  chevron: { d: <><path d="m3 4.5 3 3 3-3" /></>, sw: 1.8 },
  menu:    { d: <><path d="M4 7h16M4 12h16M4 17h16" /></>, sw: 2 },
};

interface Props {
  name: IconName;
  className?: string;
  /** Los iconos son decorativos salvo que se les pase un título accesible. */
  title?: string;
}

export default function Icon({ name, className, title }: Props) {
  const { d, sw } = PATHS[name];
  const viewBox = name === 'chevron' ? '0 0 12 12' : '0 0 24 24';

  return (
    <svg
      className={className}
      viewBox={viewBox}
      strokeWidth={sw ?? 1.9}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...S}
    >
      {title ? <title>{title}</title> : null}
      {d}
    </svg>
  );
}

/** Check verde de las listas de beneficios. */
export function CheckIcon() {
  return <Icon name="check" />;
}
