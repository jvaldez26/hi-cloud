/**
 * Registrar Pago (precursor de Etapa 2) — ver docs/prestamista/registrar-pago-rediseno.md.
 *
 * Núcleo de cálculo puro, sin BD, compartido entre registrar() (persiste) y
 * preview() (no persiste) — exactamente lo que ve el cajero en la vista
 * previa es lo que el servidor aplica, nunca dos caminos que puedan divergir.
 */
import { r2, calcularMoraCuota } from '../utils/mora.util';
import { calcularMora as calcularMoraV2, ParametrosMora } from '../motor/mora-v2.util';

export type TipoPago = 'cuotas' | 'abono_parcial' | 'abono_extraordinario_capital' | 'liquidar';
export type DestinoExcedente = 'siguientes_cuotas' | 'capital';

export interface CuotaPendiente {
  id: number;
  numeroCuota: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  capitalPagado: number;
  interesPagado: number;
  moraGenerada: number;
  moraPagada: number;
  cargos: { concepto: string; monto: number }[] | null;
  cargosPagados: number;
}

export interface LineaDistribucion {
  cuotaId: number;
  numeroCuota: number;
  pagMora: number;
  pagInt: number;
  pagCap: number;
  pagCargos: number;
  totalPagado: number;
  quedaPagada: boolean;
}

export interface ResultadoDistribucion {
  lineas: LineaDistribucion[];
  aplicadoMora: number;
  aplicadoInteres: number;
  aplicadoCapital: number;
  aplicadoCargos: number;
  totalAplicado: number;
  restanteSinAplicar: number;
}

function cargosTotalDe(cuota: CuotaPendiente): number {
  return Array.isArray(cuota.cargos) ? cuota.cargos.reduce((a, c) => a + Number(c.monto ?? 0), 0) : 0;
}

/**
 * Mora de una cuota EN UNA FECHA ARBITRARIA (no "hoy") — mismas funciones
 * puras que usa mora.cron.ts, nunca una fórmula nueva. Necesario para pagos
 * con fecha anterior: `moraGenerada` ya refleja hoy (el cron la adelantó),
 * no lo que se debía el día en que el dinero realmente se recibió.
 */
export function moraACuotaEnFecha(
  cuota: CuotaPendiente,
  fechaPago: string,
  diasGracia: number,
  porcentajeMora: number,
  moraConfigV2: ParametrosMora | null,
): number {
  const venc = new Date(cuota.fechaVencimiento);
  const pago = new Date(fechaPago);
  const diasAtraso = Math.max(0, Math.floor((pago.getTime() - venc.getTime()) / 86_400_000));
  if (diasAtraso <= (diasGracia ?? 0)) return 0;

  const saldoCap = Math.max(0, Number(cuota.capital) - Number(cuota.capitalPagado));
  const saldoInt = Math.max(0, Number(cuota.interes) - Number(cuota.interesPagado));

  return moraConfigV2
    ? calcularMoraV2(moraConfigV2, { capitalPendiente: saldoCap, interesPendiente: saldoInt, diasDeAtraso: diasAtraso })
    : calcularMoraCuota(r2(saldoCap + saldoInt), porcentajeMora, diasAtraso);
}

/**
 * Distribuye `montoDisponible` sobre `cuotas` (ya filtradas y ordenadas por
 * numeroCuota ascendente — filtrar/ordenar es responsabilidad del caller,
 * según el tipoPago) en el orden mora → interés → capital → cargos, cuota
 * por cuota. Si sobra dinero después de cubrir una cuota por completo, pasa
 * a la siguiente — igual que el comportamiento histórico del servicio.
 *
 * `moraPorCuota`: mora pendiente YA RESUELTA para cada cuota (la de hoy —
 * moraGenerada-moraPagada — o la recalculada a una fecha anterior vía
 * moraACuotaEnFecha). Decidir cuál usar es responsabilidad del caller.
 */
export function distribuirPago(
  cuotas: CuotaPendiente[],
  montoDisponible: number,
  moraPorCuota: Map<number, number>,
): ResultadoDistribucion {
  let restante = r2(montoDisponible);
  const lineas: LineaDistribucion[] = [];
  let aplicadoMora = 0, aplicadoInteres = 0, aplicadoCapital = 0, aplicadoCargos = 0;

  for (const cuota of cuotas) {
    if (restante <= 0) break;

    const cargosTotal = cargosTotalDe(cuota);
    const moraPend   = r2(moraPorCuota.get(cuota.id) ?? r2(Number(cuota.moraGenerada) - Number(cuota.moraPagada)));
    const intPend    = r2(Number(cuota.interes) - Number(cuota.interesPagado));
    const capPend    = r2(Number(cuota.capital) - Number(cuota.capitalPagado));
    const cargosPend = r2(cargosTotal - Number(cuota.cargosPagados ?? 0));

    if (moraPend <= 0 && intPend <= 0 && capPend <= 0 && cargosPend <= 0) continue;

    let pagMora = 0, pagInt = 0, pagCap = 0, pagCargos = 0;
    if (moraPend > 0 && restante > 0)   { pagMora   = Math.min(moraPend, restante);   aplicadoMora     = r2(aplicadoMora + pagMora);     restante = r2(restante - pagMora); }
    if (intPend > 0 && restante > 0)    { pagInt    = Math.min(intPend, restante);    aplicadoInteres  = r2(aplicadoInteres + pagInt);   restante = r2(restante - pagInt); }
    if (capPend > 0 && restante > 0)    { pagCap    = Math.min(capPend, restante);    aplicadoCapital  = r2(aplicadoCapital + pagCap);   restante = r2(restante - pagCap); }
    if (cargosPend > 0 && restante > 0) { pagCargos = Math.min(cargosPend, restante); aplicadoCargos   = r2(aplicadoCargos + pagCargos); restante = r2(restante - pagCargos); }

    const totalPagadoCuota = r2(pagMora + pagInt + pagCap + pagCargos);
    if (totalPagadoCuota === 0) continue;

    const nuevaIntPag    = r2(Number(cuota.interesPagado) + pagInt);
    const nuevaCapPag    = r2(Number(cuota.capitalPagado) + pagCap);
    const nuevaCargosPag = r2(Number(cuota.cargosPagados ?? 0) + pagCargos);
    const quedaPagada = nuevaCapPag >= Number(cuota.capital) && nuevaIntPag >= Number(cuota.interes) && nuevaCargosPag >= cargosTotal;

    lineas.push({ cuotaId: cuota.id, numeroCuota: cuota.numeroCuota, pagMora, pagInt, pagCap, pagCargos, totalPagado: totalPagadoCuota, quedaPagada });
  }

  return {
    lineas, aplicadoMora, aplicadoInteres, aplicadoCapital, aplicadoCargos,
    totalAplicado: r2(aplicadoMora + aplicadoInteres + aplicadoCapital + aplicadoCargos),
    restanteSinAplicar: restante,
  };
}

/**
 * Saldo exacto para liquidar el préstamo a `fecha`: capital + interés
 * pendiente de TODAS las cuotas no pagadas + mora recalculada a esa fecha +
 * cargos pendientes. Usado por tipoPago='liquidar' y por la validación de
 * "monto mayor al saldo total" (sugiere liquidar en vez de rechazar sin más).
 */
export function calcularSaldoLiquidacion(
  cuotas: CuotaPendiente[],
  fecha: string,
  diasGracia: number,
  porcentajeMora: number,
  moraConfigV2: ParametrosMora | null,
): number {
  let total = 0;
  for (const cuota of cuotas) {
    const capPend    = Math.max(0, Number(cuota.capital) - Number(cuota.capitalPagado));
    const intPend     = Math.max(0, Number(cuota.interes) - Number(cuota.interesPagado));
    const cargosPend = Math.max(0, cargosTotalDe(cuota) - Number(cuota.cargosPagados ?? 0));
    const moraPend    = moraACuotaEnFecha(cuota, fecha, diasGracia, porcentajeMora, moraConfigV2);
    total += capPend + intPend + cargosPend + moraPend;
  }
  return r2(total);
}
