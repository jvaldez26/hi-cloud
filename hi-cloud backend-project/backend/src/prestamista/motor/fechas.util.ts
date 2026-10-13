import { esDiaHabil, primerDiaHabilDesde, siguienteDiaHabilEstricto, sumarDias, ConfigDiaHabil } from './feriados.util';

/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §1.
 */

export type Frecuencia =
  | 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'bimestral'
  | 'trimestral' | 'semestral' | 'anual' | 'unico' | 'personalizado';

export type ModoQuincenal = 'dias_fijos' | 'cada_15_dias';

export interface ParametrosFechas {
  frecuencia: Frecuencia;
  fechaPrimerPago: string;
  n: number;
  diaria?: ConfigDiaHabil;              // solo si frecuencia='diaria'
  quincenal?: { modo: ModoQuincenal };  // solo si frecuencia='quincenal'
  fechasPersonalizadas?: string[];      // solo si frecuencia='personalizado'
}

function partes(fecha: string): { anio: number; mes0: number; dia: number } {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio, mes0: mes - 1, dia };
}

function diasEnMes(anio: number, mes0: number): number {
  return new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();
}

function fmt(anio: number, mes0: number, dia: number): string {
  return `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** §1.4 — mismo día del mes, `pasoMeses` meses después, sin arrastrar el recorte de un mes corto a los siguientes. */
function fechaConDiaFijo(anioBase: number, mes0Base: number, diaFijo: number, pasoMeses: number): string {
  const totalMes = mes0Base + pasoMeses;
  const anio = anioBase + Math.floor(totalMes / 12);
  const mes0 = ((totalMes % 12) + 12) % 12;
  const dia = Math.min(diaFijo, diasEnMes(anio, mes0));
  return fmt(anio, mes0, dia);
}

const PASO_MESES: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

/** §1.3 — secuencia de fechas de corte (15 y último día de cada mes), desde el mes de `desde` en adelante. */
function* fechasCorteQuincenales(desde: string): Generator<string> {
  let { anio, mes0 } = partes(desde);
  while (true) {
    yield fechaConDiaFijo(anio, mes0, 15, 0);
    yield fechaConDiaFijo(anio, mes0, 31, 0); // 31 clampa al último día real del mes
    mes0 += 1;
    if (mes0 === 12) { mes0 = 0; anio += 1; }
  }
}

/**
 * Genera las `n` fechas de cuota según §1. Única función de fechas del
 * motor — el resto (desembolso, simulador, abonos) la reutiliza.
 */
export function generarFechas(params: ParametrosFechas): string[] {
  const { frecuencia, fechaPrimerPago, n } = params;

  if (frecuencia === 'unico') return [fechaPrimerPago];

  if (frecuencia === 'personalizado') {
    const fechas = params.fechasPersonalizadas ?? [];
    for (let k = 1; k < fechas.length; k++) {
      if (fechas[k] <= fechas[k - 1]) {
        throw new Error('Las fechas personalizadas deben estar en orden estrictamente creciente, sin repetir.');
      }
    }
    return fechas;
  }

  if (frecuencia === 'diaria') {
    const config = params.diaria ?? { excluirDomingos: false, excluirFeriados: false };
    const fechas: string[] = [];
    let anterior: string | null = null;
    for (let k = 1; k <= n; k++) {
      const candidato = k === 1 ? fechaPrimerPago : sumarDias(anterior!, 1);
      let ajustado = primerDiaHabilDesde(candidato, config);
      if (anterior !== null && ajustado <= anterior) {
        ajustado = siguienteDiaHabilEstricto(anterior, config);
      }
      fechas.push(ajustado);
      anterior = ajustado;
    }
    return fechas;
  }

  if (frecuencia === 'semanal') {
    return Array.from({ length: n }, (_, idx) => sumarDias(fechaPrimerPago, idx * 7));
  }

  if (frecuencia === 'quincenal') {
    const modo = params.quincenal?.modo ?? 'cada_15_dias';
    if (modo === 'cada_15_dias') {
      return Array.from({ length: n }, (_, idx) => sumarDias(fechaPrimerPago, idx * 15));
    }
    // dias_fijos: primeras n fechas de corte >= fechaPrimerPago
    const resultado: string[] = [];
    for (const candidata of fechasCorteQuincenales(fechaPrimerPago)) {
      if (candidata >= fechaPrimerPago) resultado.push(candidata);
      if (resultado.length === n) break;
    }
    return resultado;
  }

  // mensual / bimestral / trimestral / semestral / anual
  const paso = PASO_MESES[frecuencia];
  const { anio, mes0, dia } = partes(fechaPrimerPago);
  return Array.from({ length: n }, (_, idx) => fechaConDiaFijo(anio, mes0, dia, paso * idx));
}

/** Días de calendario reales entre dos fechas 'YYYY-MM-DD' (b > a). */
export function diasReales(a: string, b: string): number {
  const msPorDia = 86_400_000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPorDia);
}

export { esDiaHabil };
