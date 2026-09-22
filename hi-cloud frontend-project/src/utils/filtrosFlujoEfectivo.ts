/**
 * Estado de Flujo de Efectivo v2 (2026-09-22) — filtros de la barra superior
 * ⇄ query params de la URL, mismo patrón que filtrosEstadoResultados.ts:
 * los valores por defecto NUNCA se escriben en la URL. Reutiliza el mismo
 * eje "comparacion" que Estado de Resultados (Rango) tal cual — sin
 * inventar etiquetas nuevas — y el mismo "detalle" (Resumido/Detallado).
 * Sin ocultarCuentasEnCero/mostrarPorcentajes: el pedido de este reporte
 * solo lista código de cuenta y redondeo como toggles.
 */
import dayjs from 'dayjs';
import { OPCIONES_COMPARACION, type ComparacionEstadoResultados } from './filtrosEstadoResultados';

export type ComparacionFlujoEfectivo = ComparacionEstadoResultados;
export type DetalleFlujoEfectivo = 'resumido' | 'detallado';

export const OPCIONES_COMPARACION_FE = OPCIONES_COMPARACION;

export const OPCIONES_DETALLE_FE: { value: DetalleFlujoEfectivo; label: string }[] = [
  { value: 'resumido',  label: 'Resumido (solo totales)' },
  { value: 'detallado', label: 'Detallado (con cuentas)' },
];

export interface FiltrosFlujoEfectivo {
  desde:                  string; // YYYY-MM-DD
  hasta:                  string; // YYYY-MM-DD
  comparacion:            ComparacionFlujoEfectivo;
  detalle:                DetalleFlujoEfectivo;
  mostrarCodigo:          boolean;
  redondearSinDecimales:  boolean;
}

const DEFAULT_COMPARACION: ComparacionFlujoEfectivo = 'ninguna';
const DEFAULT_DETALLE: DetalleFlujoEfectivo          = 'resumido';
const DEFAULT_MOSTRAR_CODIGO                         = false;
const DEFAULT_REDONDEAR                              = false;

const COMPARACION_VALIDAS = OPCIONES_COMPARACION_FE.map(o => o.value);
const DETALLE_VALIDOS     = OPCIONES_DETALLE_FE.map(o => o.value);

function boolDesdeURL(v: string | null, def: boolean): boolean {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return def;
}

export function filtrosFEDesdeURL(params: URLSearchParams): FiltrosFlujoEfectivo {
  const comparacionRaw = params.get('comparacion');
  const detalleRaw     = params.get('detalle');
  const hoy = dayjs();

  return {
    desde: params.get('desde') || hoy.startOf('year').format('YYYY-MM-DD'),
    hasta: params.get('hasta') || hoy.format('YYYY-MM-DD'),
    comparacion: (COMPARACION_VALIDAS as string[]).includes(comparacionRaw ?? '')
      ? (comparacionRaw as ComparacionFlujoEfectivo) : DEFAULT_COMPARACION,
    detalle: (DETALLE_VALIDOS as string[]).includes(detalleRaw ?? '')
      ? (detalleRaw as DetalleFlujoEfectivo) : DEFAULT_DETALLE,
    mostrarCodigo:         boolDesdeURL(params.get('mostrarCodigo'), DEFAULT_MOSTRAR_CODIGO),
    redondearSinDecimales: boolDesdeURL(params.get('redondearSinDecimales'), DEFAULT_REDONDEAR),
  };
}

export function filtrosFEAURLParams(filtros: FiltrosFlujoEfectivo): URLSearchParams {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.comparacion !== DEFAULT_COMPARACION) params.set('comparacion', filtros.comparacion);
  if (filtros.detalle !== DEFAULT_DETALLE) params.set('detalle', filtros.detalle);
  if (filtros.mostrarCodigo !== DEFAULT_MOSTRAR_CODIGO) params.set('mostrarCodigo', String(filtros.mostrarCodigo));
  if (filtros.redondearSinDecimales !== DEFAULT_REDONDEAR) params.set('redondearSinDecimales', String(filtros.redondearSinDecimales));
  return params;
}
