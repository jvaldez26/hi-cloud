/**
 * PanelAcceso — Panel lateral izquierdo de las páginas de autenticación.
 *
 * Rota automáticamente cada mes según la fecha LOCAL del navegador (no del
 * servidor, que corre en UTC).  El mes se calcula en el cliente:
 *   mesRD()  →  1 = enero … 12 = diciembre
 *
 * En entornos no-productivos, ?panel=N (1-12) fuerza una variante concreta.
 *
 * Fuentes autoalojadas (206 KB WOFF2 Latin, cacheadas tras el primer login):
 *   IBM Plex Sans 400/500/600/700
 *   IBM Plex Mono 400/500/600
 *   Instrument Serif 400 / 400-italic
 *   Archivo 400/800
 */

// ── Fuentes autoalojadas vía @fontsource ──────────────────────────────────────
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css'; // V02, V06, V08, V12 usan itálica
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-800.css';

// ── Variantes ─────────────────────────────────────────────────────────────────
import V01Enero      from './variants/V01Enero';
import V02Febrero    from './variants/V02Febrero';
import V03Marzo      from './variants/V03Marzo';
import V04Abril      from './variants/V04Abril';
import V05Mayo       from './variants/V05Mayo';
import V06Junio      from './variants/V06Junio';
import V07Julio      from './variants/V07Julio';
import V08Agosto     from './variants/V08Agosto';
import V09Septiembre from './variants/V09Septiembre';
import V10Octubre    from './variants/V10Octubre';
import V11Noviembre  from './variants/V11Noviembre';
import V12Diciembre  from './variants/V12Diciembre';

import { useSearchParams } from 'react-router-dom';
import { mesRD } from '../../../utils/fechaRD';

const VARIANTES = [
  V01Enero, V02Febrero, V03Marzo,   V04Abril,
  V05Mayo,  V06Junio,  V07Julio,    V08Agosto,
  V09Septiembre, V10Octubre, V11Noviembre, V12Diciembre,
] as const;

const IS_PROD = import.meta.env.MODE === 'production';

// ── Keyframes compartidos (cursor consola + reduced-motion) ───────────────────
const GLOBAL_STYLES = `
  @keyframes cur-blink {
    0%, 100% { opacity: 1 }
    50%       { opacity: 0 }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration:   0.001ms !important;
      transition-duration:  0.001ms !important;
    }
  }
`;

// ── Componente principal ──────────────────────────────────────────────────────
export function PanelAcceso() {
  const [searchParams] = useSearchParams();

  // ?panel=N fuerce la variante (solo fuera de producción)
  const forcedRaw = IS_PROD ? NaN : parseInt(searchParams.get('panel') ?? '', 10);
  const forced    = Number.isFinite(forcedRaw) && forcedRaw >= 1 && forcedRaw <= 12
    ? forcedRaw - 1   // convertir a índice 0-based
    : NaN;

  const mes = Number.isFinite(forced) ? forced : mesRD() - 1;

  const Variante = VARIANTES[mes as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11];

  return (
    <div
      className="login-left"
      style={{
        width:    '50%',
        height:   '100%',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <style>{GLOBAL_STYLES}</style>
      <Variante />
    </div>
  );
}
