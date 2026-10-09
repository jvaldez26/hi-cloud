/**
 * Motor financiero (Etapa 2, Fase 2A) — ver docs/prestamista/motor-financiero.md §1.2/§1.5.
 *
 * Funciones puras de calendario: cómputo de Pascua, feriados dominicanos, y
 * los helpers de "día hábil" que usa la generación de fechas de §1.2.
 *
 * Fechas siempre como string 'YYYY-MM-DD'. Igual que amortizacion.util.ts:
 * new Date('YYYY-MM-DD') es medianoche UTC — se mantiene así a propósito
 * (no se convierte a hora RD) para no desplazar un día todas las fechas.
 */

function parse(fecha: string): Date {
  return new Date(fecha);
}

function formatear(fecha: Date): string {
  return fecha.toISOString().split('T')[0];
}

export function sumarDias(fecha: string, dias: number): string {
  const f = parse(fecha);
  f.setUTCDate(f.getUTCDate() + dias);
  return formatear(f);
}

export function diaSemana(fecha: string): number {
  return parse(fecha).getUTCDay(); // 0 = domingo
}

/**
 * Domingo de Pascua de un año — algoritmo de Meeus/Jones/Butcher (calendario
 * gregoriano), determinista para cualquier año. Ver §1.5 del documento.
 */
export function calcularPascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export interface Feriado {
  fecha: string;
  nombre: string;
  /** false: la empresa debe confirmar/completar la fecha cada año (Ley 139-97) */
  confirmado: boolean;
}

/**
 * Feriados dominicanos "de fábrica" para un año: los de fecha fija (nunca se
 * trasladan) y los dos de fecha móvil calculados desde Pascua. Los que la
 * Ley 139-97 traslada al lunes más cercano (1° mayo, 16 agosto, 6 noviembre)
 * NO se calculan aquí — la empresa los agrega/confirma cada año (§1.5).
 */
export function feriadosDeFabrica(anio: number): Feriado[] {
  const pascua = calcularPascua(anio);
  return [
    { fecha: `${anio}-01-01`, nombre: 'Año Nuevo', confirmado: true },
    { fecha: `${anio}-01-21`, nombre: 'Virgen de la Altagracia', confirmado: true },
    { fecha: `${anio}-01-26`, nombre: 'Día de Duarte', confirmado: true },
    { fecha: sumarDias(pascua, -2), nombre: 'Viernes Santo', confirmado: true },
    { fecha: sumarDias(pascua, 60), nombre: 'Corpus Christi', confirmado: true },
    { fecha: `${anio}-09-24`, nombre: 'Virgen de las Mercedes', confirmado: true },
    { fecha: `${anio}-12-25`, nombre: 'Navidad', confirmado: true },
    // Trasladables al lunes (Ley 139-97) — la empresa confirma la fecha real cada año.
    { fecha: `${anio}-05-01`, nombre: 'Día del Trabajo (verificar traslado)', confirmado: false },
    { fecha: `${anio}-08-16`, nombre: 'Restauración (verificar traslado)', confirmado: false },
    { fecha: `${anio}-11-06`, nombre: 'Constitución (verificar traslado)', confirmado: false },
  ];
}

export interface ConfigDiaHabil {
  excluirDomingos: boolean;
  excluirFeriados: boolean;
  feriados?: Set<string>; // 'YYYY-MM-DD'
}

export function esDiaHabil(fecha: string, config: ConfigDiaHabil): boolean {
  if (config.excluirDomingos && diaSemana(fecha) === 0) return false;
  if (config.excluirFeriados && config.feriados?.has(fecha)) return false;
  return true;
}

/** Primer día hábil desde `fecha`, inclusive. */
export function primerDiaHabilDesde(fecha: string, config: ConfigDiaHabil): string {
  let f = fecha;
  while (!esDiaHabil(f, config)) f = sumarDias(f, 1);
  return f;
}

/** Siguiente día hábil, estrictamente posterior a `fecha`. */
export function siguienteDiaHabilEstricto(fecha: string, config: ConfigDiaHabil): string {
  return primerDiaHabilDesde(sumarDias(fecha, 1), config);
}
