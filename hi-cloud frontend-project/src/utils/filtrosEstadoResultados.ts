/**
 * Estado de Resultados v2 (2026-09-21) — filtros de la barra superior ⇄
 * query params de la URL, mismo patrón que filtrosBalanceGeneral.ts: los
 * valores por defecto NUNCA se escriben en la URL, para que un link sin
 * filtro quede limpio y sea compartible/sobreviva a un refresh (F5). Incluye
 * "detalle" (Resumido/Detallado) aunque sea un toggle solo de frontend — el
 * usuario pidió que CADA combinación de vista sobreviva al refresh, no solo
 * las que el backend necesita.
 */
import dayjs from 'dayjs';

export type ComparacionEstadoResultados = 'ninguna' | 'mes-vs-acumulado' | 'anio-anterior' | 'por-mes';
export type DetalleEstadoResultados = 'resumido' | 'detallado';

export const OPCIONES_COMPARACION: { value: ComparacionEstadoResultados; label: string }[] = [
  { value: 'ninguna',           label: 'Ninguna' },
  { value: 'mes-vs-acumulado',  label: 'Mes vs. Acumulado del año' },
  { value: 'anio-anterior',     label: 'Mismo período del año anterior' },
  { value: 'por-mes',           label: 'Por mes' },
];

export const OPCIONES_DETALLE: { value: DetalleEstadoResultados; label: string }[] = [
  { value: 'resumido',  label: 'Resumido (solo totales)' },
  { value: 'detallado', label: 'Detallado (con cuentas)' },
];

export interface FiltrosEstadoResultados {
  desde:                  string; // YYYY-MM-DD
  hasta:                  string; // YYYY-MM-DD
  comparacion:            ComparacionEstadoResultados;
  detalle:                DetalleEstadoResultados;
  mostrarCodigo:           boolean;
  ocultarCuentasEnCero:    boolean;
  redondearSinDecimales:   boolean;
  mostrarPorcentajes:      boolean;
}

const DEFAULT_COMPARACION: ComparacionEstadoResultados = 'ninguna';
const DEFAULT_DETALLE: DetalleEstadoResultados          = 'detallado';
const DEFAULT_MOSTRAR_CODIGO                            = false;
const DEFAULT_OCULTAR_CEROS                             = true;
const DEFAULT_REDONDEAR                                 = false;
const DEFAULT_MOSTRAR_PCT                               = true;

const COMPARACION_VALIDAS = OPCIONES_COMPARACION.map(o => o.value);
const DETALLE_VALIDOS     = OPCIONES_DETALLE.map(o => o.value);

function boolDesdeURL(v: string | null, def: boolean): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return def;
}

/** Período rápido → { desde, hasta } — nunca se guarda como tal, solo alimenta el desde/hasta manual. */
export function rangoRapido(clave: 'mes-actual' | 'trimestre-actual' | 'anio-actual' | 'anio-anterior'): { desde: string; hasta: string } {
  const hoy = dayjs();
  switch (clave) {
    case 'mes-actual':
      return { desde: hoy.startOf('month').format('YYYY-MM-DD'), hasta: hoy.format('YYYY-MM-DD') };
    case 'trimestre-actual': {
      const inicioTrimestre = hoy.startOf('month').subtract(hoy.month() % 3, 'month');
      return { desde: inicioTrimestre.format('YYYY-MM-DD'), hasta: hoy.format('YYYY-MM-DD') };
    }
    case 'anio-actual':
      return { desde: hoy.startOf('year').format('YYYY-MM-DD'), hasta: hoy.format('YYYY-MM-DD') };
    case 'anio-anterior': {
      const anioAnt = hoy.year() - 1;
      return { desde: `${anioAnt}-01-01`, hasta: `${anioAnt}-12-31` };
    }
  }
}

/** Lee los filtros de un URLSearchParams — un valor desconocido o ausente cae al default, nunca explota. */
export function filtrosERDesdeURL(params: URLSearchParams): FiltrosEstadoResultados {
  const comparacionRaw = params.get('comparacion');
  const detalleRaw     = params.get('detalle');
  const hoy = dayjs();

  return {
    desde: params.get('desde') || hoy.startOf('year').format('YYYY-MM-DD'),
    hasta: params.get('hasta') || hoy.format('YYYY-MM-DD'),
    comparacion: (COMPARACION_VALIDAS as string[]).includes(comparacionRaw ?? '')
      ? (comparacionRaw as ComparacionEstadoResultados) : DEFAULT_COMPARACION,
    detalle: (DETALLE_VALIDOS as string[]).includes(detalleRaw ?? '')
      ? (detalleRaw as DetalleEstadoResultados) : DEFAULT_DETALLE,
    mostrarCodigo:          boolDesdeURL(params.get('mostrarCodigo'), DEFAULT_MOSTRAR_CODIGO),
    ocultarCuentasEnCero:   boolDesdeURL(params.get('ocultarCuentasEnCero'), DEFAULT_OCULTAR_CEROS),
    redondearSinDecimales:  boolDesdeURL(params.get('redondearSinDecimales'), DEFAULT_REDONDEAR),
    mostrarPorcentajes:     boolDesdeURL(params.get('mostrarPorcentajes'), DEFAULT_MOSTRAR_PCT),
  };
}

/** Arma los query params — omite lo que ya es el default, para no ensuciar la URL. */
export function filtrosERAURLParams(filtros: FiltrosEstadoResultados): URLSearchParams {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.comparacion !== DEFAULT_COMPARACION) params.set('comparacion', filtros.comparacion);
  if (filtros.detalle !== DEFAULT_DETALLE) params.set('detalle', filtros.detalle);
  if (filtros.mostrarCodigo !== DEFAULT_MOSTRAR_CODIGO) params.set('mostrarCodigo', String(filtros.mostrarCodigo));
  if (filtros.ocultarCuentasEnCero !== DEFAULT_OCULTAR_CEROS) params.set('ocultarCuentasEnCero', String(filtros.ocultarCuentasEnCero));
  if (filtros.redondearSinDecimales !== DEFAULT_REDONDEAR) params.set('redondearSinDecimales', String(filtros.redondearSinDecimales));
  if (filtros.mostrarPorcentajes !== DEFAULT_MOSTRAR_PCT) params.set('mostrarPorcentajes', String(filtros.mostrarPorcentajes));
  return params;
}
