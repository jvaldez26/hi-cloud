/**
 * Enlace de la landing.
 *
 * Punto único de migración de anclas a rutas: hoy todos los destinos de
 * landing-content.ts son anclas (#id) dentro de la misma página, así que se
 * renderiza un <a> normal. Cuando existan /funcionalidades/*, /soluciones/* y
 * /por-tamano/*, basta con:
 *
 *   1. cambiar los valores en LANDING_ROUTES, y
 *   2. descomentar la rama <Link> de aquí abajo.
 *
 * Ningún componente de sección construye URLs por su cuenta.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';
// import { Link } from 'react-router-dom';

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

export default function LandingLink({ to, children, ...rest }: Props) {
  const esExterno = to.startsWith('http');

  return (
    <a
      href={to}
      {...(esExterno ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}
