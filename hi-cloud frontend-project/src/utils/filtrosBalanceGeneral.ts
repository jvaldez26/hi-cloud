/**
 * Balance General detallado (2026-09-21) — filtros de la barra superior ⇄
 * query params de la URL, mismo patrón que filtrosPlanCuentas.ts: los
 * valores por defecto NUNCA se escriben en la URL, para que un link sin
 * filtro quede limpio y sea compartible/sobreviva a un refresh (F5).
 */
import dayjs from 'dayjs';

export type CompararCon = 'ninguno' | 'mismo-mes-anio-anterior' | 'cierre-anio-anterior' | 'fecha-manual';
export type NivelDetalle = 1 | 2 | 3 | 'todos';

export const OPCIONES_COMPARAR_CON: { value: CompararCon; label: string }[] = [
  { value: 'ninguno',                  label: 'Ninguno' },
  { value: 'mismo-mes-anio-anterior',  label: 'Mismo mes año anterior' },
  { value: 'cierre-anio-anterior',     label: 'Cierre del año anterior' },
  { value: 'fecha-manual',             label: 'Fecha manual...' },
];

export const OPCIONES_NIVEL_DETALLE: { value: NivelDetalle; label: string }[] = [
  { value: 1,       label: 'Nivel 1' },
  { value: 2,       label: 'Nivel 2' },
  { value: 3,       label: 'Nivel 3' },
  { value: 'todos', label: 'Todos' },
];

export interface FiltrosBalanceGeneral {
  fechaCorte:                 string;      // YYYY-MM-DD
  compararCon:                CompararCon;
  fechaComparacion?:          string;      // solo si compararCon === 'fecha-manual'
  nivelDetalle:               NivelDetalle;
  mostrarCodigo:              boolean;
  ocultarCuentasEnCero:       boolean;
  redondearSinDecimales:      boolean;
  mostrarPorcentajeVertical:  boolean;
}

const DEFAULT_COMPARAR_CON: CompararCon   = 'ninguno';
const DEFAULT_NIVEL: NivelDetalle          = 2;
const DEFAULT_MOSTRAR_CODIGO               = false;
const DEFAULT_OCULTAR_CEROS                = true;
const DEFAULT_REDONDEAR                    = false;
const DEFAULT_MOSTRAR_PCT                  = true;

const COMPARAR_CON_VALIDOS = OPCIONES_COMPARAR_CON.map(o => o.value);

function boolDesdeURL(v: string | null, def: boolean): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return def;
}

/** Lee los filtros de un URLSearchParams — un valor desconocido o ausente cae al default, nunca explota. */
export function filtrosDesdeURL(params: URLSearchParams): FiltrosBalanceGeneral {
  const compararConRaw = params.get('compararCon');
  const nivelRaw = params.get('nivelDetalle');

  const nivelDetalle: NivelDetalle = nivelRaw === 'todos'
    ? 'todos'
    : (nivelRaw && ['1', '2', '3'].includes(nivelRaw) ? (Number(nivelRaw) as NivelDetalle) : DEFAULT_NIVEL);

  return {
    fechaCorte: params.get('fechaCorte') || dayjs().format('YYYY-MM-DD'),
    compararCon: (COMPARAR_CON_VALIDOS as string[]).includes(compararConRaw ?? '')
      ? (compararConRaw as CompararCon) : DEFAULT_COMPARAR_CON,
    fechaComparacion: params.get('fechaComparacion') ?? undefined,
    nivelDetalle,
    mostrarCodigo:             boolDesdeURL(params.get('mostrarCodigo'), DEFAULT_MOSTRAR_CODIGO),
    ocultarCuentasEnCero:      boolDesdeURL(params.get('ocultarCuentasEnCero'), DEFAULT_OCULTAR_CEROS),
    redondearSinDecimales:     boolDesdeURL(params.get('redondearSinDecimales'), DEFAULT_REDONDEAR),
    mostrarPorcentajeVertical: boolDesdeURL(params.get('mostrarPorcentajeVertical'), DEFAULT_MOSTRAR_PCT),
  };
}

/** Arma los query params — omite lo que ya es el default, para no ensuciar la URL. */
export function filtrosAURLParams(filtros: FiltrosBalanceGeneral): URLSearchParams {
  const params = new URLSearchParams();
  params.set('fechaCorte', filtros.fechaCorte); // la fecha de corte siempre va, ya existía antes de este cambio
  if (filtros.compararCon !== DEFAULT_COMPARAR_CON) params.set('compararCon', filtros.compararCon);
  if (filtros.compararCon === 'fecha-manual' && filtros.fechaComparacion) {
    params.set('fechaComparacion', filtros.fechaComparacion);
  }
  if (filtros.nivelDetalle !== DEFAULT_NIVEL) params.set('nivelDetalle', String(filtros.nivelDetalle));
  if (filtros.mostrarCodigo !== DEFAULT_MOSTRAR_CODIGO) params.set('mostrarCodigo', String(filtros.mostrarCodigo));
  if (filtros.ocultarCuentasEnCero !== DEFAULT_OCULTAR_CEROS) params.set('ocultarCuentasEnCero', String(filtros.ocultarCuentasEnCero));
  if (filtros.redondearSinDecimales !== DEFAULT_REDONDEAR) params.set('redondearSinDecimales', String(filtros.redondearSinDecimales));
  if (filtros.mostrarPorcentajeVertical !== DEFAULT_MOSTRAR_PCT) params.set('mostrarPorcentajeVertical', String(filtros.mostrarPorcentajeVertical));
  return params;
}
