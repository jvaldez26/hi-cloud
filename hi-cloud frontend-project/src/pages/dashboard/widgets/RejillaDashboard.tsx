import type { ReactNode } from 'react';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { ALTO_MINIMO, type AnchoWidget } from './tipos';

/**
 * Cuántas columnas caben.
 *
 * Antes el panel metía TODAS las gráficas dentro de una columna del 62,5%
 * (`Col lg={15}`) mientras la izquierda, con dos tarjetas cortas, se quedaba
 * vacía toda esa altura. De ahí la media pantalla desperdiciada.
 *
 * Los cortes son de ventana, no de contenedor: el sidebar se lleva ~220px, así
 * que 1600 de ventana son ~1350 de panel — tres columnas de ~440px, que es donde
 * un donut y un ranking de 8 siguen leyéndose.
 */
export function useColumnasDashboard(): number {
  const muyAncha = useMediaQuery('(min-width: 1600px)');
  const ancha    = useMediaQuery('(min-width: 900px)');
  if (muyAncha) return 3;
  if (ancha)    return 2;
  return 1;
}

/**
 * Rejilla del panel.
 *
 * SIN `grid-auto-flow: dense` a propósito. Con relleno denso el panel reordena
 * las gráficas solo —sube la que quepa, no la que el usuario puso— y eso
 * confunde más de lo que molesta un hueco ocasional en tres columnas. El orden
 * que se ve es el orden que se guardó.
 */
export function RejillaDashboard({ columnas, children }: {
  columnas: number;
  children: ReactNode;
}) {
  return (
    <div
      className="dashboard-rejilla"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
        gap: 16,
        // Las celdas de una misma fila igualan altura; cada tarjeta se estira
        // para llenar la suya en vez de dejar aire debajo.
        alignItems: 'stretch',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Una celda. `ancha` ocupa 2 columnas, pero nunca más de las que hay: en móvil
 * (1 columna) todo ocupa 1, o el navegador desbordaría la rejilla.
 */
export function CeldaWidget({ ancho, columnas, children }: {
  ancho: AnchoWidget;
  columnas: number;
  children: ReactNode;
}) {
  const span = ancho === 'ancha' ? Math.min(2, columnas) : 1;
  return (
    <div style={{
      gridColumn: `span ${span}`,
      minWidth: 0, display: 'flex',
      // Alto minimo por tipo; la fila puede estirarlo mas si otra celda lo pide.
      minHeight: ALTO_MINIMO[ancho],
    }}>
      {/* El hijo llena la celda entera: sin esto, una tarjeta baja en una fila
          alta dejaría el hueco que este rediseño viene a quitar. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}
