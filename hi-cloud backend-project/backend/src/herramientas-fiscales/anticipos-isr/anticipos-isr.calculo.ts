import Decimal from 'decimal.js';
import { ParametroFiscalNoEncontradoError, ParametroFiscalPendienteError } from '../../parametros-fiscales/errors/parametro-fiscal.errors';

/**
 * Calculadora de Anticipos ISR (Commit 4 de Herramientas Fiscales) —
 * función PURA. El régimen se elige por el AÑO del ejercicio fiscal, no
 * por la fecha de cálculo: ejercicio ≤ 2026 usa el régimen TET vigente
 * (clave 'anticipos_isr_tet'); ejercicio ≥ 2027 usa el régimen por tamaño
 * de empresa de la Ley 30-26 (clave 'anticipos_isr_ley30_26'). Ambas
 * claves están sembradas desde el Commit 1 con valor NULL —
 * PENDIENTE_VALIDACION — así que esta calculadora no puede producir un
 * monto hasta que Jean cargue las reglas reales; mientras tanto solo
 * puede confirmar qué régimen aplica y por qué falta el parámetro.
 */

export interface TramoParametro<T> {
  valor: T | null;
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  estado: 'VALIDADO' | 'PENDIENTE_VALIDACION';
}

export type TamanoEmpresa = 'microempresa' | 'pequena' | 'personaFisica' | 'medianaGrande';

export type ValorAnticiposTet = {
  numeroCuotas: number;
  periodicidadMeses: number;
  diaVencimiento: number;
  tasaSobreIsrAnterior: number; // % sobre isrEjercicioAnterior para obtener el anticipo anual total
};

export type ValorAnticiposLey3026 = {
  numeroCuotas: number;
  periodicidadMeses: number;
  diaVencimiento: number;
  tramosPorTamano: Record<TamanoEmpresa, { exento: boolean; tasaSobreIsrAnterior: number | null }>;
};

export type Regimen = 'TET' | 'LEY_30_26';

export interface EntradaAnticiposISR {
  isrEjercicioAnterior: number;
  fechaInicioEjercicio: string; // 'YYYY-MM-DD' — su año decide el régimen
  tamanoEmpresa?: TamanoEmpresa; // requerido solo bajo LEY_30_26
}

export interface ParametrosAnticiposISR {
  tramo: TramoParametro<ValorAnticiposTet | ValorAnticiposLey3026> | null;
}

export interface CuotaAnticipoISR {
  numero: number;
  fechaVencimiento: string; // 'YYYY-MM-DD'
  monto: number;
}

export interface ResultadoAnticiposISR {
  regimen: Regimen;
  claveParametro: string;
  exento: boolean;
  anticipoAnualTotal: number;
  numeroCuotas: number;
  montoPorCuota: number;
  calendario: CuotaAnticipoISR[];
  avisos: string[];
}

function claveDelRegimen(regimen: Regimen): string {
  return regimen === 'TET' ? 'anticipos_isr_tet' : 'anticipos_isr_ley30_26';
}

/** Elige el régimen por el AÑO del ejercicio fiscal — nunca por la fecha de hoy. */
export function elegirRegimen(fechaInicioEjercicio: string): Regimen {
  const anio = Number(fechaInicioEjercicio.slice(0, 4));
  return anio <= 2026 ? 'TET' : 'LEY_30_26';
}

/** Suma meses a una fecha 'YYYY-MM-DD' fijando el día, sin usar Date/toISOString (evita desfases de huso horario). */
function sumarMesesConDia(fechaISO: string, meses: number, dia: number): string {
  const [anioBase, mesBase] = fechaISO.split('-').map(Number);
  const totalMeses = mesBase - 1 + meses;
  const anio = anioBase + Math.floor(totalMeses / 12);
  const mes = (totalMeses % 12) + 1;
  const ultimoDiaDelMes = new Date(anio, mes, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaDelMes);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;
}

function generarCalendario(
  fechaInicioEjercicio: string, numeroCuotas: number, periodicidadMeses: number,
  diaVencimiento: number, montoPorCuota: Decimal,
): CuotaAnticipoISR[] {
  const cuotas: CuotaAnticipoISR[] = [];
  for (let i = 1; i <= numeroCuotas; i++) {
    cuotas.push({
      numero: i,
      fechaVencimiento: sumarMesesConDia(fechaInicioEjercicio, periodicidadMeses * i, diaVencimiento),
      monto: montoPorCuota.toNumber(),
    });
  }
  return cuotas;
}

export function calcularAnticiposISR(
  e: EntradaAnticiposISR, parametros: ParametrosAnticiposISR,
): ResultadoAnticiposISR {
  const regimen = elegirRegimen(e.fechaInicioEjercicio);
  const clave = claveDelRegimen(regimen);
  const tramo = parametros.tramo;

  if (!tramo) throw new ParametroFiscalNoEncontradoError(clave, e.fechaInicioEjercicio);
  if (tramo.estado !== 'VALIDADO' || tramo.valor === null) {
    throw new ParametroFiscalPendienteError(clave, e.fechaInicioEjercicio);
  }

  if (regimen === 'TET') {
    const valor = tramo.valor as ValorAnticiposTet;
    const anticipoAnualTotal = new Decimal(e.isrEjercicioAnterior).times(valor.tasaSobreIsrAnterior).div(100).toDecimalPlaces(2);
    const montoPorCuota = anticipoAnualTotal.div(valor.numeroCuotas).toDecimalPlaces(2);
    return {
      regimen, claveParametro: clave, exento: false,
      anticipoAnualTotal: anticipoAnualTotal.toNumber(),
      numeroCuotas: valor.numeroCuotas,
      montoPorCuota: montoPorCuota.toNumber(),
      calendario: generarCalendario(e.fechaInicioEjercicio, valor.numeroCuotas, valor.periodicidadMeses, valor.diaVencimiento, montoPorCuota),
      avisos: [],
    };
  }

  // LEY_30_26 — el tramo aplicable depende del tamaño de empresa declarado
  if (!e.tamanoEmpresa) {
    throw new Error('El régimen de anticipos ISR de la Ley 30-26 (ejercicios desde 2027) requiere indicar el tamaño de la empresa.');
  }
  const valor = tramo.valor as ValorAnticiposLey3026;
  const tramoTamano = valor.tramosPorTamano[e.tamanoEmpresa];
  if (!tramoTamano) {
    throw new Error(`El tamaño de empresa "${e.tamanoEmpresa}" no está en la tabla de anticipos ISR de la Ley 30-26.`);
  }
  if (tramoTamano.exento || tramoTamano.tasaSobreIsrAnterior === null) {
    return {
      regimen, claveParametro: clave, exento: true,
      anticipoAnualTotal: 0, numeroCuotas: 0, montoPorCuota: 0, calendario: [],
      avisos: [`Exenta de anticipos ISR — tamaño de empresa "${e.tamanoEmpresa}" bajo la Ley 30-26.`],
    };
  }

  const anticipoAnualTotal = new Decimal(e.isrEjercicioAnterior).times(tramoTamano.tasaSobreIsrAnterior).div(100).toDecimalPlaces(2);
  const montoPorCuota = anticipoAnualTotal.div(valor.numeroCuotas).toDecimalPlaces(2);
  return {
    regimen, claveParametro: clave, exento: false,
    anticipoAnualTotal: anticipoAnualTotal.toNumber(),
    numeroCuotas: valor.numeroCuotas,
    montoPorCuota: montoPorCuota.toNumber(),
    calendario: generarCalendario(e.fechaInicioEjercicio, valor.numeroCuotas, valor.periodicidadMeses, valor.diaVencimiento, montoPorCuota),
    avisos: [],
  };
}
