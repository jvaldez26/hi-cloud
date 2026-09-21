/**
 * Filtros de Plan de Cuentas (chips de clasificación/estado + búsqueda) ⇄
 * query params de la URL — para que el filtro sea compartible y sobreviva a
 * un refresh (F5). "activas" y "todas" son los valores por defecto de cada
 * grupo, así que NO se escriben en la URL (un link sin filtro queda limpio,
 * `?clasificacion=gastos` en vez de `?clasificacion=gastos&estado=activas`).
 */
export type ClasificacionCuenta = 'todas' | 'activos' | 'pasivos' | 'capital' | 'ingresos' | 'costos' | 'gastos';
export type EstadoCuenta = 'todas' | 'activas' | 'inactivas' | 'grupo';

export const CLASIFICACIONES: ClasificacionCuenta[] = ['todas', 'activos', 'pasivos', 'capital', 'ingresos', 'costos', 'gastos'];
export const ESTADOS: EstadoCuenta[] = ['todas', 'activas', 'inactivas', 'grupo'];

export interface FiltrosPlanCuentas {
  search: string;
  clasificacion: ClasificacionCuenta;
  estado: EstadoCuenta;
}

const DEFAULT_CLASIFICACION: ClasificacionCuenta = 'todas';
const DEFAULT_ESTADO: EstadoCuenta = 'activas';

/** Lee los filtros de un URLSearchParams — un valor desconocido o ausente cae al default, nunca explota. */
export function filtrosDesdeURL(params: URLSearchParams): FiltrosPlanCuentas {
  const clasificacionRaw = params.get('clasificacion');
  const estadoRaw = params.get('estado');
  return {
    search: params.get('search') ?? '',
    clasificacion: (CLASIFICACIONES as string[]).includes(clasificacionRaw ?? '')
      ? (clasificacionRaw as ClasificacionCuenta) : DEFAULT_CLASIFICACION,
    estado: (ESTADOS as string[]).includes(estadoRaw ?? '')
      ? (estadoRaw as EstadoCuenta) : DEFAULT_ESTADO,
  };
}

/** Arma los query params — omite lo que ya es el default, para no ensuciar la URL. */
export function filtrosAURLParams(filtros: FiltrosPlanCuentas): URLSearchParams {
  const params = new URLSearchParams();
  if (filtros.search.trim()) params.set('search', filtros.search.trim());
  if (filtros.clasificacion !== DEFAULT_CLASIFICACION) params.set('clasificacion', filtros.clasificacion);
  if (filtros.estado !== DEFAULT_ESTADO) params.set('estado', filtros.estado);
  return params;
}
