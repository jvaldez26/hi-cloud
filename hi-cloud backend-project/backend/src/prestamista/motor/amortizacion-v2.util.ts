import Decimal from 'decimal.js';
import { d, redondearDecimal, redondearDinero } from './dinero.util';
import { ConfigDiaHabil } from './feriados.util';
import { Frecuencia, ModoQuincenal, generarFechas, diasReales } from './fechas.util';
import { ParametrosTasa, FrecuenciaRegular, periodosPorAnioRegular, tasaPeriodoPagoRegular, tasaDiaria, resumenTasaParaMostrar } from './tasas.util';
import { teaRealDesdeFlujos, FlujoFechado } from './tir.util';

/**
 * Motor financiero central — Etapa 2, Fase 2A.
 * Ver docs/prestamista/motor-financiero.md — esta función implementa §3-§7.
 *
 * Función PURA: nada de BD, nada de Date.now(). Todo parámetro de fecha
 * entra como 'YYYY-MM-DD'. La usan (o la usarán, en una fase de integración
 * posterior) el simulador, el desembolso, el refinanciamiento, los abonos y
 * la mora — nadie más calcula una tabla de amortización por su cuenta.
 */

export type MetodoAmortizacion =
  | 'frances' | 'aleman' | 'americano' | 'flat'
  | 'solo_interes_luego_amortiza' | 'personalizado';

const FRECUENCIAS_REGULARES = new Set<Frecuencia>([
  'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual',
]);

export interface Cargo {
  concepto: string;
  tipo: 'fijo' | 'porcentaje';
  monto: number;
  momento: 'desembolso' | 'por_cuota' | 'unico_diferido';
  /** solo si momento='desembolso' */
  tratamientoDesembolso?: 'descontado' | 'financiado' | 'aparte';
  /** solo si momento='unico_diferido'. Default: 'primera_cuota'. */
  momentoUnicoDiferido?: 'primera_cuota' | 'ultima_cuota' | 'prorrateado';
}

export interface ParametrosGracia {
  tipo: 'capital' | 'total';
  periodos: number;
  /** solo si tipo='total'. Default: 'prorratea'. */
  tratamientoInteresGracia?: 'prorratea' | 'capitaliza' | 'primera_cuota';
}

export interface CuotaManual {
  fecha: string;
  montoTotal: number;
}

export interface ParametrosPrestamo {
  montoPrincipal: number;
  frecuencia: Frecuencia;
  fechaDesembolso: string;
  fechaPrimerPago: string;
  /** ignorado si metodo='personalizado' (se usa cuotasPersonalizadas.length) */
  plazoPeriodos: number;
  tasa: ParametrosTasa;
  metodo: MetodoAmortizacion;
  /** solo si metodo='solo_interes_luego_amortiza' */
  periodosSoloInteres?: number;
  metodoPosteriorGracia?: 'frances' | 'aleman';
  /** solo si frecuencia='diaria' */
  diaria?: ConfigDiaHabil;
  /** solo si frecuencia='quincenal' */
  quincenal?: { modo: ModoQuincenal };
  gracia?: ParametrosGracia;
  cargos?: Cargo[];
  /** solo si metodo='personalizado' */
  cuotasPersonalizadas?: CuotaManual[];
}

export interface LineaAmortizacion {
  numeroCuota: number;
  fecha: string;
  capital: number;
  interes: number;
  cargos: { concepto: string; monto: number }[];
  cuotaTotal: number;
  saldoRestante: number;
  esPeriodoGracia: boolean;
}

export interface TablaAmortizacion {
  tabla: LineaAmortizacion[];
  cuotaFija: number | null;
  totalInteres: number;
  totalCargos: number;
  costoTotalCredito: number;
  totalAPagar: number;
  montoPrincipalFinanciado: number;
  montoRecibidoDeudor: number;
  tasaEquivalentePorPeriodo: number;
  tasaAnualNominal: number;
  tea: number;
  teaReal: number;
}

interface LineaBase {
  capital: Decimal;
  interes: Decimal;
  saldo: Decimal;
}

/** §3.1-3.4 — núcleo de cada método, sobre un tramo de `tasasPeriodo.length` períodos. */
function aplicarMetodoSobreTramo(
  metodo: 'frances' | 'aleman' | 'americano' | 'flat',
  P: Decimal,
  tasaBase: Decimal,
  tasasPeriodo: Decimal[],
): { lineas: LineaBase[]; cuotaFija: Decimal | null } {
  const n = tasasPeriodo.length;
  let saldo = P;
  const lineas: LineaBase[] = [];

  if (metodo === 'frances') {
    const cuotaFijaExacta = tasaBase.eq(0)
      ? P.div(n)
      : P.times(tasaBase.times(d(1).plus(tasaBase).pow(n)))
          .div(d(1).plus(tasaBase).pow(n).minus(1));
    const cuotaFija = redondearDecimal(cuotaFijaExacta);
    for (let k = 0; k < n; k++) {
      const interes = redondearDecimal(saldo.times(tasasPeriodo[k]));
      const capital = redondearDecimal(k === n - 1 ? saldo : cuotaFija.minus(interes));
      saldo = redondearDecimal(saldo.minus(capital));
      lineas.push({ capital, interes, saldo });
    }
    return { lineas, cuotaFija };
  }

  if (metodo === 'aleman') {
    const capitalFijo = redondearDecimal(P.div(n));
    for (let k = 0; k < n; k++) {
      const interes = redondearDecimal(saldo.times(tasasPeriodo[k]));
      const capital = redondearDecimal(k === n - 1 ? saldo : capitalFijo);
      saldo = redondearDecimal(saldo.minus(capital));
      lineas.push({ capital, interes, saldo });
    }
    return { lineas, cuotaFija: null };
  }

  if (metodo === 'americano') {
    for (let k = 0; k < n; k++) {
      const interes = redondearDecimal(saldo.times(tasasPeriodo[k]));
      const capital = redondearDecimal(k === n - 1 ? saldo : d(0));
      saldo = redondearDecimal(saldo.minus(capital));
      lineas.push({ capital, interes, saldo });
    }
    return { lineas, cuotaFija: null };
  }

  // flat — §3.4: el interés SIEMPRE sobre P original del tramo, nunca sobre saldo.
  const capitalFijo = redondearDecimal(P.div(n));
  const cuotaFija = redondearDecimal(capitalFijo.plus(P.times(tasaBase)));
  for (let k = 0; k < n; k++) {
    const interes = redondearDecimal(P.times(tasasPeriodo[k]));
    const capital = redondearDecimal(k === n - 1 ? saldo : capitalFijo);
    saldo = redondearDecimal(saldo.minus(capital));
    lineas.push({ capital, interes, saldo });
  }
  return { lineas, cuotaFija };
}

/** §1/§2 — fechas y tasa por período, según la frecuencia sea regular o irregular (§2.4). */
function resolverFechasYTasas(params: ParametrosPrestamo, n: number, fechasPersonalizadas?: string[]) {
  const fechas = generarFechas({
    frecuencia: params.frecuencia,
    fechaPrimerPago: params.fechaPrimerPago,
    n,
    diaria: params.diaria,
    quincenal: params.quincenal,
    fechasPersonalizadas,
  });

  const esRegular = FRECUENCIAS_REGULARES.has(params.frecuencia);
  let tasasPeriodo: Decimal[];
  let tasaBase: Decimal;
  let periodosPorAnioParaMostrar: number;

  if (esRegular) {
    const i = tasaPeriodoPagoRegular(params.tasa, params.frecuencia as FrecuenciaRegular);
    tasasPeriodo = new Array(n).fill(i);
    tasaBase = i;
    periodosPorAnioParaMostrar = periodosPorAnioRegular(params.frecuencia as FrecuenciaRegular);
  } else {
    // diaria / unico / personalizado — §2.4: por días reales.
    const tDiaria = tasaDiaria(params.tasa);
    tasasPeriodo = fechas.map((fecha, k) => {
      const anterior = k === 0 ? params.fechaDesembolso : fechas[k - 1];
      const dias = diasReales(anterior, fecha);
      return tDiaria.times(dias);
    });
    tasaBase = tDiaria;
    periodosPorAnioParaMostrar = params.tasa.baseDias;
  }

  return { fechas, tasasPeriodo, tasaBase, periodosPorAnioParaMostrar };
}

/** §5.1 — cargos al desembolso: ajusta P (financiado) y lo que el deudor recibe en mano (descontado). */
function resolverCargosDesembolso(montoPrincipalOriginal: Decimal, cargos: Cargo[]) {
  let P = montoPrincipalOriginal;
  let montoRecibidoDeudor = montoPrincipalOriginal;
  let totalCargosDesembolso = d(0);

  for (const cargo of cargos.filter(c => c.momento === 'desembolso')) {
    const montoCargo = redondearDecimal(
      cargo.tipo === 'fijo' ? cargo.monto : montoPrincipalOriginal.times(cargo.monto).div(100),
    );
    totalCargosDesembolso = totalCargosDesembolso.plus(montoCargo);
    if (cargo.tratamientoDesembolso === 'financiado') P = P.plus(montoCargo);
    if (cargo.tratamientoDesembolso === 'descontado') montoRecibidoDeudor = montoRecibidoDeudor.minus(montoCargo);
    if (cargo.tratamientoDesembolso === 'aparte') montoRecibidoDeudor = montoRecibidoDeudor; // no ajusta P ni lo recibido del préstamo
  }

  return { P, montoRecibidoDeudor, totalCargosDesembolso };
}

/** §5.2/§5.3 — cargos por cuota y el cargo único diferido, aplicados sobre la tabla ya construida. */
function aplicarCargosDeCuota(
  tabla: LineaAmortizacion[],
  cargos: Cargo[],
  montoPrincipalOriginal: Decimal,
): Decimal {
  let totalCargosCuota = d(0);

  for (const cargo of cargos.filter(c => c.momento === 'por_cuota')) {
    for (const linea of tabla) {
      if (linea.esPeriodoGracia) continue; // §4.2: durante gracia TOTAL no se paga nada; de capital, el interés ya se paga — ver nota de diseño abajo
      const base = cargo.tipo === 'fijo' ? d(cargo.monto) : d(linea.saldoRestante).plus(linea.capital).times(cargo.monto).div(100);
      const monto = redondearDinero(base);
      linea.cargos.push({ concepto: cargo.concepto, monto });
      linea.cuotaTotal = redondearDinero(d(linea.cuotaTotal).plus(monto));
      totalCargosCuota = totalCargosCuota.plus(monto);
    }
  }

  for (const cargo of cargos.filter(c => c.momento === 'unico_diferido')) {
    const montoTotal = redondearDecimal(
      cargo.tipo === 'fijo' ? cargo.monto : montoPrincipalOriginal.times(cargo.monto).div(100),
    );
    const modo = cargo.momentoUnicoDiferido ?? 'primera_cuota';
    if (modo === 'prorrateado') {
      const porCuota = redondearDecimal(montoTotal.div(tabla.length));
      for (const linea of tabla) {
        linea.cargos.push({ concepto: cargo.concepto, monto: porCuota.toNumber() });
        linea.cuotaTotal = redondearDinero(d(linea.cuotaTotal).plus(porCuota));
      }
    } else {
      const idx = modo === 'primera_cuota' ? 0 : tabla.length - 1;
      tabla[idx].cargos.push({ concepto: cargo.concepto, monto: montoTotal.toNumber() });
      tabla[idx].cuotaTotal = redondearDinero(d(tabla[idx].cuotaTotal).plus(montoTotal));
    }
    totalCargosCuota = totalCargosCuota.plus(montoTotal);
  }

  return totalCargosCuota;
}

function construirTabla(
  fechas: string[],
  lineasBase: LineaBase[],
  gracePeriods: number,
): LineaAmortizacion[] {
  return lineasBase.map((linea, idx) => ({
    numeroCuota: idx + 1,
    fecha: fechas[idx],
    capital: linea.capital.toNumber(),
    interes: linea.interes.toNumber(),
    cargos: [] as { concepto: string; monto: number }[],
    cuotaTotal: redondearDinero(linea.capital.plus(linea.interes)),
    saldoRestante: linea.saldo.toNumber(),
    esPeriodoGracia: idx < gracePeriods,
  }));
}

export function calcularTablaAmortizacion(paramsEntrada: ParametrosPrestamo): TablaAmortizacion {
  const params = normalizarSoloInteresLuegoAmortiza(paramsEntrada);
  const cargos = params.cargos ?? [];
  const montoPrincipalOriginal = d(params.montoPrincipal);

  if (params.metodo === 'personalizado') {
    return calcularPersonalizado(params, cargos, montoPrincipalOriginal);
  }

  const { P, montoRecibidoDeudor, totalCargosDesembolso } = resolverCargosDesembolso(montoPrincipalOriginal, cargos);

  const n = params.plazoPeriodos;
  const G = params.gracia?.periodos ?? 0;
  const { fechas, tasasPeriodo, tasaBase, periodosPorAnioParaMostrar } = resolverFechasYTasas(params, n);

  let lineasBase: LineaBase[];
  let cuotaFija: Decimal | null;
  let cargoGraciaPrimeraCuota = d(0);

  if (G === 0) {
    const r = aplicarMetodoSobreTramo(params.metodo as any, P, tasaBase, tasasPeriodo);
    lineasBase = r.lineas;
    cuotaFija = r.cuotaFija;
  } else if (params.gracia!.tipo === 'capital') {
    // §4.1 — solo interés durante G, método base sobre (n-G) con saldo = P.
    const graciaLineas: LineaBase[] = [];
    let saldo = P;
    for (let k = 0; k < G; k++) {
      const interes = redondearDecimal(saldo.times(tasasPeriodo[k]));
      graciaLineas.push({ capital: d(0), interes, saldo });
    }
    const r = aplicarMetodoSobreTramo(params.metodo as any, P, tasaBase, tasasPeriodo.slice(G));
    lineasBase = [...graciaLineas, ...r.lineas];
    cuotaFija = r.cuotaFija;
  } else {
    // §4.2 — gracia total: capitaliza / prorratea / primera_cuota.
    const tratamiento = params.gracia!.tratamientoInteresGracia ?? 'prorratea';
    const graciaLineas: LineaBase[] = [];
    let interesGraciaTotal = d(0);
    for (let k = 0; k < G; k++) {
      const interes = redondearDecimal(P.times(tasasPeriodo[k]));
      interesGraciaTotal = interesGraciaTotal.plus(interes);
      graciaLineas.push({ capital: d(0), interes: d(0), saldo: P }); // el interés NO se cobra en el período (queda en interesGraciaTotal)
    }

    let saldoInicialPostGracia = P;
    if (tratamiento === 'capitaliza') {
      saldoInicialPostGracia = tasasPeriodo.slice(0, G).reduce((acc, i) => acc.times(d(1).plus(i)), P);
      saldoInicialPostGracia = redondearDecimal(saldoInicialPostGracia);
      graciaLineas.forEach(l => (l.saldo = saldoInicialPostGracia)); // informativo: saldo "real" ya refleja la capitalización
    }

    const r = aplicarMetodoSobreTramo(params.metodo as any, saldoInicialPostGracia, tasaBase, tasasPeriodo.slice(G));
    lineasBase = [...graciaLineas, ...r.lineas];
    cuotaFija = r.cuotaFija;

    if (tratamiento === 'prorratea') {
      const porCuota = redondearDecimal(interesGraciaTotal.div(n - G));
      for (let k = G; k < n; k++) {
        lineasBase[k] = { ...lineasBase[k], interes: lineasBase[k].interes.plus(porCuota) };
      }
    } else if (tratamiento === 'primera_cuota') {
      cargoGraciaPrimeraCuota = interesGraciaTotal;
    }
  }

  const tabla = construirTabla(fechas, lineasBase, G);
  if (cargoGraciaPrimeraCuota.gt(0) && tabla.length > G) {
    tabla[G].cuotaTotal = redondearDinero(d(tabla[G].cuotaTotal).plus(cargoGraciaPrimeraCuota));
    tabla[G].cargos.push({ concepto: 'Interés diferido de gracia', monto: cargoGraciaPrimeraCuota.toNumber() });
  }

  const totalCargosCuota = aplicarCargosDeCuota(tabla, cargos, montoPrincipalOriginal);

  return ensamblarResultado({
    params, tabla, cuotaFija, P, montoRecibidoDeudor,
    totalCargosDesembolso, totalCargosCuota, periodosPorAnioParaMostrar, tasaBase,
  });
}

/** §3.6 — personalizado: no genera montos, solo parte capital/interés de cuotas ya definidas, y valida el cierre. */
function calcularPersonalizado(
  params: ParametrosPrestamo,
  cargos: Cargo[],
  montoPrincipalOriginal: Decimal,
): TablaAmortizacion {
  const cuotas = params.cuotasPersonalizadas ?? [];
  if (!cuotas.length) throw new Error('metodo="personalizado" requiere cuotasPersonalizadas.');

  const { P, montoRecibidoDeudor, totalCargosDesembolso } = resolverCargosDesembolso(montoPrincipalOriginal, cargos);
  const fechas = generarFechas({ frecuencia: 'personalizado', fechaPrimerPago: params.fechaPrimerPago, n: cuotas.length, fechasPersonalizadas: cuotas.map(c => c.fecha) });
  const tDiaria = tasaDiaria(params.tasa);

  let saldo = P;
  const lineasBase: LineaBase[] = [];
  for (let k = 0; k < cuotas.length; k++) {
    const anterior = k === 0 ? params.fechaDesembolso : fechas[k - 1];
    const dias = diasReales(anterior, fechas[k]);
    const interes = redondearDecimal(saldo.times(tDiaria).times(dias));
    const capital = redondearDecimal(d(cuotas[k].montoTotal).minus(interes));
    if (capital.lessThan(0)) {
      throw new Error(
        `La cuota #${k + 1} (RD$${cuotas[k].montoTotal}) no cubre ni el interés del tramo (RD$${interes.toFixed(2)}). ` +
        `No se permite amortización negativa — ajusta el monto de la cuota.`,
      );
    }
    saldo = redondearDecimal(saldo.minus(capital));
    lineasBase.push({ capital, interes, saldo });
  }

  const saldoFinal = lineasBase[lineasBase.length - 1].saldo;
  if (saldoFinal.abs().greaterThan(0.01)) {
    throw new Error(
      `Las cuotas definidas no cierran el préstamo: ${saldoFinal.greaterThan(0) ? 'falta' : 'sobra'} ` +
      `RD$${saldoFinal.abs().toFixed(2)}.`,
    );
  }

  const tabla = construirTabla(fechas, lineasBase, 0);
  const totalCargosCuota = aplicarCargosDeCuota(tabla, cargos, montoPrincipalOriginal);

  return ensamblarResultado({
    params, tabla, cuotaFija: null, P, montoRecibidoDeudor,
    totalCargosDesembolso, totalCargosCuota, periodosPorAnioParaMostrar: params.tasa.baseDias, tasaBase: tDiaria,
  });
}

function ensamblarResultado(args: {
  params: ParametrosPrestamo;
  tabla: LineaAmortizacion[];
  cuotaFija: Decimal | null;
  P: Decimal;
  montoRecibidoDeudor: Decimal;
  totalCargosDesembolso: Decimal;
  totalCargosCuota: Decimal;
  periodosPorAnioParaMostrar: number;
  tasaBase: Decimal;
}): TablaAmortizacion {
  const { params, tabla, cuotaFija, P, montoRecibidoDeudor, totalCargosDesembolso, totalCargosCuota, periodosPorAnioParaMostrar, tasaBase } = args;
  const montoPrincipalOriginal = d(params.montoPrincipal);

  const totalInteres = redondearDinero(tabla.reduce((acc, l) => acc.plus(l.interes), d(0)));
  const totalCargos = redondearDinero(totalCargosDesembolso.plus(totalCargosCuota));
  const costoTotalCredito = redondearDinero(d(totalInteres).plus(totalCargos));
  const totalAPagar = redondearDinero(montoPrincipalOriginal.plus(costoTotalCredito));

  const { tasaEquivalentePorPeriodo, tasaAnualNominal, tea } = resumenTasaParaMostrar(tasaBase, periodosPorAnioParaMostrar);

  // §7.4 — TEA real vía TIR sobre flujos fechados reales.
  const cargosApartDesembolso = (params.cargos ?? [])
    .filter(c => c.momento === 'desembolso' && c.tratamientoDesembolso === 'aparte')
    .reduce((acc, c) => acc.plus(c.tipo === 'fijo' ? d(c.monto) : montoPrincipalOriginal.times(c.monto).div(100)), d(0));
  const flujos: FlujoFechado[] = [
    { fecha: params.fechaDesembolso, monto: -redondearDinero(montoRecibidoDeudor.minus(cargosApartDesembolso)) },
    ...tabla.map(l => ({ fecha: l.fecha, monto: l.cuotaTotal })),
  ];
  const teaReal = redondearDinero(teaRealDesdeFlujos(flujos).times(100)) / 100; // conserva precisión razonable para TEA

  return {
    tabla,
    cuotaFija: cuotaFija ? cuotaFija.toNumber() : null,
    totalInteres,
    totalCargos,
    costoTotalCredito,
    totalAPagar,
    montoPrincipalFinanciado: redondearDinero(P),
    montoRecibidoDeudor: redondearDinero(montoRecibidoDeudor),
    tasaEquivalentePorPeriodo,
    tasaAnualNominal,
    tea,
    teaReal,
  };
}

/** §3.5 — "solo interés por N, luego amortización" = gracia de capital desde el período 1. */
function normalizarSoloInteresLuegoAmortiza(params: ParametrosPrestamo): ParametrosPrestamo {
  if (params.metodo !== 'solo_interes_luego_amortiza') return params;
  if (!params.periodosSoloInteres || !params.metodoPosteriorGracia) {
    throw new Error('solo_interes_luego_amortiza requiere periodosSoloInteres y metodoPosteriorGracia.');
  }
  return {
    ...params,
    metodo: params.metodoPosteriorGracia,
    gracia: { tipo: 'capital', periodos: params.periodosSoloInteres },
  };
}
