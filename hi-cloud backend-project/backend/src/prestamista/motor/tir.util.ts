import Decimal from 'decimal.js';
import { d } from './dinero.util';
import { diasReales } from './fechas.util';

/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §7.4.
 *
 * TIR sobre flujos de caja fechados (equivalente a XIRR de Excel): se
 * resuelve una tasa DIARIA tal que el valor presente de todos los flujos,
 * descontados por los días reales desde el primer flujo, sea cero. Esto
 * evita tener que definir "unidades de período" para frecuencias
 * irregulares (diaria con feriados, personalizado) — los días reales ya
 * son la unidad. Se anualiza al final sobre 365 días.
 *
 * Bisección (no Newton-Raphson): no requiere derivada y nunca diverge —
 * preferible para un motor que debe ser robusto ante cualquier combinación
 * de parámetros, a costa de más iteraciones.
 */
export interface FlujoFechado {
  fecha: string; // 'YYYY-MM-DD'
  monto: number; // negativo = egreso (desembolso), positivo = ingreso (cuota)
}

function valorPresenteNeto(flujos: FlujoFechado[], tasaDiaria: Decimal): Decimal {
  const fecha0 = flujos[0].fecha;
  return flujos.reduce((acc, f) => {
    const dias = diasReales(fecha0, f.fecha);
    const descuento = d(1).plus(tasaDiaria).pow(dias);
    return acc.plus(d(f.monto).div(descuento));
  }, d(0));
}

/**
 * Resuelve la tasa diaria (TIR) de los flujos vía bisección.
 * Rango: -99%/día a 1000%/día. Tolerancia 1e-10. Máximo 200 iteraciones.
 */
export function resolverTirDiaria(flujos: FlujoFechado[]): Decimal {
  if (flujos.length < 2) throw new Error('Se necesitan al menos 2 flujos para calcular la TIR');

  let lo = d(-0.99);
  let hi = d(10);
  const tolerancia = new Decimal('1e-10');

  let vpnLo = valorPresenteNeto(flujos, lo);
  const vpnHi = valorPresenteNeto(flujos, hi);
  if (vpnLo.times(vpnHi).greaterThan(0)) {
    throw new Error('No se encontró una TIR en el rango esperado (-99% a 1000% diario) — revisar los flujos.');
  }

  for (let iter = 0; iter < 200; iter++) {
    const medio = lo.plus(hi).div(2);
    const vpnMedio = valorPresenteNeto(flujos, medio);
    if (vpnMedio.abs().lessThan(tolerancia)) return medio;
    if (vpnLo.times(vpnMedio).lessThan(0)) {
      hi = medio;
    } else {
      lo = medio;
      vpnLo = vpnMedio;
    }
  }
  return lo.plus(hi).div(2);
}

/** TEA real anualizada (365 días) a partir de la TIR diaria. */
export function teaRealDesdeFlujos(flujos: FlujoFechado[]): Decimal {
  const tirDiaria = resolverTirDiaria(flujos);
  return d(1).plus(tirDiaria).pow(365).minus(1);
}
