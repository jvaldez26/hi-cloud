import type { EstadoTurnoCw } from './tipos';

export function minutosDesde(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Suma de duracionMinutos de los servicios del turno — 20 min de piso si no hay dato. */
export function duracionEstimadaMin(servicios: Array<{ duracionMinutos?: number }> | undefined): number {
  const suma = (servicios ?? []).reduce((s, x) => s + (x.duracionMinutos ?? 0), 0);
  return suma > 0 ? suma : 20;
}

export type ColorTiempo = 'normal' | 'ambar' | 'rojo';

/** normal hasta la duración estimada; ámbar al pasarla; rojo al duplicarla. */
export function colorTiempo(minutos: number, estimado: number): ColorTiempo {
  if (minutos > estimado * 2) return 'rojo';
  if (minutos > estimado) return 'ambar';
  return 'normal';
}

export const TIMESTAMP_POR_ESTADO: Record<EstadoTurnoCw, string> = {
  en_espera: 'enEsperaAt', en_lavado: 'enLavadoAt', secado: 'secadoAt',
  listo: 'listoAt', entregado: 'entregadoAt', cancelado: 'canceladoAt',
};

/** Calca transiciones-turno.ts del backend — el backend es quien de verdad valida. */
export function siguienteEstado(actual: EstadoTurnoCw, usaSecado: boolean): EstadoTurnoCw | undefined {
  switch (actual) {
    case 'en_espera': return 'en_lavado';
    case 'en_lavado': return usaSecado ? 'secado' : 'listo';
    case 'secado': return 'listo';
    case 'listo': return 'entregado';
    default: return undefined;
  }
}

export const ORDEN_ESTADO: EstadoTurnoCw[] = ['en_espera', 'en_lavado', 'secado', 'listo', 'entregado', 'cancelado'];

export function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}
