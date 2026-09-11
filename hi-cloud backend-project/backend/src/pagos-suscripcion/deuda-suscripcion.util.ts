/**
 * Cuánto debe una suscripción por PERÍODOS de plan ya vencidos — no cargos por
 * servicios, esa es otra cifra (ver imputacion-pago.util.ts / CargoLiquidado).
 *
 * Cuenta cuántos períodos (mensual o anual, anclados al diaCorte) ya pasaron
 * desde fechaVencimiento hasta hoy, reutilizando `calcularNuevaFecha` tal cual
 * — sin tocar su fórmula (a8128146) — y multiplica por el precio del período.
 * Nunca negativa: una suscripción al día o adelantada es RD$0.00, eso no es
 * deuda — es abono, y el abono ya tiene su propia columna
 * (`suscripciones.abonoDisponible`).
 *
 * Deliberadamente parte de `fechaVencimiento`, NUNCA de `fechaFinPrueba`: ese
 * campo no se limpia al activar un plan pagado, así que una empresa que pasó
 * por trial lo arrastra indefinidamente — usarlo aquí inflaría la deuda de
 * cualquier cliente que alguna vez probó gratis. (Bug real, ya reportado —
 * fuera del alcance de esta cuenta: no se corrige aquí.)
 *
 * Pura y exportada para poder verificarla — ver deuda-suscripcion.util.spec.ts.
 * Un solo cálculo, reutilizado por getMiResumen (cliente) y resumenCobros
 * (panel de cobros del super admin, de donde también lee la tarjeta del modal
 * "Registrar pago") — nunca se repite en el frontend.
 */
import { calcularNuevaFecha, fechaDeVencimiento } from './preview-pago.util';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { redondearMoneda } from '../common/utils/moneda.util';

/**
 * Tope de seguridad: contar períodos es un loop acotado por fechas reales,
 * pero una suscripción con años de abandono (o un dato corrupto) no debe
 * colgar el cálculo. 120 períodos mensuales son 10 años — más que eso y algo
 * más grave ya debió pasar (cancelación, limpieza de datos).
 */
export const MAX_PERIODOS_VENCIDOS = 120;

/** Estados que NO acumulan deuda de suscripción: en prueba (aún no paga) o
 *  cancelada (dejó de devengar por decisión explícita del super admin). */
const ESTADOS_SIN_DEVENGO = new Set(['prueba', 'cancelada']);

export interface EntradaDeudaSuscripcion {
  estado:           string;
  fechaVencimiento: string | Date;
  diaCorte:         number;
  modalidad:        string;
  /** Precio del plan por MES. En modalidad anual se multiplica por 12. */
  precioMensual:    number;
  /** Hoy en RD ('YYYY-MM-DD'). Solo se pasa en los tests. */
  hoy?:             string;
}

export interface DeudaSuscripcion {
  periodosVencidos: number;
  monto:            number;
  /** true si se alcanzó MAX_PERIODOS_VENCIDOS — el monto quedó incompleto;
   *  el caller decide si lo reporta (ver resumenCobros/getMiResumen). */
  tope:             boolean;
}

export function calcularDeudaSuscripcion(e: EntradaDeudaSuscripcion): DeudaSuscripcion {
  const vacio: DeudaSuscripcion = { periodosVencidos: 0, monto: 0, tope: false };

  if (ESTADOS_SIN_DEVENGO.has(e.estado)) return vacio;

  const precioPorPeriodo = e.modalidad === 'anual'
    ? Number(e.precioMensual ?? 0) * 12
    : Number(e.precioMensual ?? 0);
  if (!Number.isFinite(precioPorPeriodo) || precioPorPeriodo <= 0) return vacio;

  const hoy = e.hoy ?? fechaHoyRD();
  let fechaActual = fechaDeVencimiento(e.fechaVencimiento);
  if (fechaActual >= hoy) return vacio; // al día o adelantada: no es deuda

  let periodos = 0;
  let tope = false;
  while (fechaActual < hoy) {
    if (periodos >= MAX_PERIODOS_VENCIDOS) { tope = true; break; }
    fechaActual = calcularNuevaFecha(fechaActual, Number(e.diaCorte), 1, e.modalidad);
    periodos++;
  }

  return {
    periodosVencidos: periodos,
    monto:            redondearMoneda(periodos * precioPorPeriodo),
    tope,
  };
}
