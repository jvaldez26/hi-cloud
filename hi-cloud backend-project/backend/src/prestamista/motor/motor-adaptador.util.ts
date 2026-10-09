import { ParametrosPrestamo, Cargo, ParametrosGracia, CuotaManual, MetodoAmortizacion } from './amortizacion-v2.util';
import { Frecuencia, ModoQuincenal } from './fechas.util';
import { ParametrosTasa, PeriodoTasa, TipoTasa, BaseDias } from './tasas.util';
import { ParametrosMora } from './mora-v2.util';

/**
 * Motor v2 (Etapa 2, Fase 2B) — puente entre lo que se guarda en BD
 * (`pr_productos_prestamo.motorConfig` / `pr_prestamos.motorConfig`, JSONB)
 * y los parámetros que espera el motor puro (amortizacion-v2.util.ts).
 *
 * Nada aquí toca la BD directamente — el service resuelve el calendario de
 * feriados (si aplica) y lo pasa como `feriados`.
 */

export interface ConfigFiscalConcepto {
  generaComprobante: boolean | null;
  tipoEcf: string | null;
  tratamientoItbis: 0 | 16 | 18 | 'exento' | null;
}

export const CONCEPTOS_FISCALES_BASE = ['interes', 'mora', 'apertura', 'gastos', 'seguro'] as const;

const FISCAL_VACIO: ConfigFiscalConcepto = { generaComprobante: null, tipoEcf: null, tratamientoItbis: null };

export function configFiscalVacia(): Record<string, ConfigFiscalConcepto> {
  const r: Record<string, ConfigFiscalConcepto> = {};
  for (const c of CONCEPTOS_FISCALES_BASE) r[c] = { ...FISCAL_VACIO };
  return r;
}

export interface MotorConfigAlmacenado {
  frecuencia: Frecuencia;
  frecuenciaDiaria?: { excluirDomingos: boolean; excluirFeriados: boolean };
  frecuenciaQuincenal?: { modo: ModoQuincenal };
  tasa: { valor: number; periodoExpresado: PeriodoTasa; tipo: TipoTasa; baseDias: BaseDias };
  metodo: MetodoAmortizacion;
  metodoPosteriorGracia?: 'frances' | 'aleman';
  periodosSoloInteres?: number;
  gracia?: ParametrosGracia;
  cargos?: Cargo[];
  mora?: ParametrosMora;
  fiscal?: Record<string, ConfigFiscalConcepto>;
  /** Si la solicitud puede ajustar tasa/plazo/frecuencia del producto. Default: true. */
  permiteAjusteSolicitud?: boolean;
}

/**
 * Para productos creados antes de la Fase 2B (sin `motorConfig`): sintetiza
 * un equivalente a partir de los campos planos ya existentes — francés/
 * alemán mensual nominal, sin gracia, sin cargos (el `cargoCierre` de estos
 * productos nunca se cobró — Etapa 1 — y NO se traduce aquí a un cargo real,
 * para no empezar a cobrar algo que antes no se cobraba). Mora: base
 * 'cuota_vencida', 360 días — igual que el motor de Etapa 1.
 */
export function motorConfigLegacyDesdeProducto(producto: any): MotorConfigAlmacenado {
  return {
    frecuencia: 'mensual',
    tasa: { valor: Number(producto.tasaInteresMensual) / 100, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
    metodo: producto.metodoAmortizacion === 'aleman' ? 'aleman' : 'frances',
    mora: { base: 'cuota_vencida', tasaOMonto: Number(producto.porcentajeMora ?? 0), baseDiasMora: 360 },
    permiteAjusteSolicitud: true,
  };
}

export function resolverMotorConfig(producto: any): MotorConfigAlmacenado {
  return (producto.motorConfig as MotorConfigAlmacenado | undefined) ?? motorConfigLegacyDesdeProducto(producto);
}

export interface OverridesSolicitud {
  tasaInteresMensual?: number; // % mensual nominal, vocabulario de siempre — se traduce a tasa.valor
  frecuencia?: Frecuencia;
  /** Override de método — solo para el desembolso directo (Etapa 1, C4); no es parte del ajuste de la solicitud (§3 del punto 3 de Fase 2B). */
  metodo?: MetodoAmortizacion;
  // plazoMeses/plazoPeriodos NO se maneja aquí — PrestamosService ya lo
  // resuelve directo (`data.plazoMeses ?? sol.plazoMeses`) antes de llegar a
  // este override, porque plazoPeriodos no es parte de la "config" del
  // motor (§0 del motor): es un dato propio del préstamo, no del producto.
}

/** Aplica los ajustes de la solicitud (si el producto lo permite) sobre la config del producto. */
export function aplicarOverridesSolicitud(config: MotorConfigAlmacenado, overrides: OverridesSolicitud): MotorConfigAlmacenado {
  if (!overrides || Object.keys(overrides).length === 0) return config;
  if (config.permiteAjusteSolicitud === false) return config;
  const resultado: MotorConfigAlmacenado = { ...config, tasa: { ...config.tasa } };
  // == null (no !== undefined): los overrides suelen llegar de un merge con
  // "?? null" (solicitud sin tasaAprobada/frecuencia definida) — tratar
  // null como "sí, cámbialo" ponía la tasa en 0 (null/100) cada vez que la
  // solicitud no traía una tasa aprobada explícita.
  if (overrides.tasaInteresMensual != null) {
    resultado.tasa.valor = overrides.tasaInteresMensual / 100;
    resultado.tasa.periodoExpresado = 'mensual';
  }
  if (overrides.frecuencia != null) resultado.frecuencia = overrides.frecuencia;
  if (overrides.metodo != null) resultado.metodo = overrides.metodo;
  return resultado;
}

export interface DatosPrestamo {
  montoPrincipal: number;
  fechaDesembolso: string;
  fechaPrimerPago: string;
  plazoPeriodos: number;
  cuotasPersonalizadas?: CuotaManual[];
}

/**
 * Años candidatos a consultar en el calendario de feriados para un préstamo
 * diario — margen generoso (plazoPeriodos días, +1 año) para no quedarnos
 * cortos si el desembolso cae a fin de año.
 */
export function aniosDelPlazo(fechaDesembolso: string, plazoPeriodos: number): number[] {
  const anioInicio = Number(fechaDesembolso.slice(0, 4));
  const aniosDeMargen = Math.ceil(plazoPeriodos / 365) + 1;
  return Array.from({ length: aniosDeMargen + 1 }, (_, i) => anioInicio + i);
}

/** Construye los `ParametrosPrestamo` que espera `calcularTablaAmortizacion`. */
export function construirParametrosPrestamo(
  config: MotorConfigAlmacenado,
  datos: DatosPrestamo,
  feriados?: Set<string>,
): ParametrosPrestamo {
  const diaria = config.frecuenciaDiaria
    ? { ...config.frecuenciaDiaria, feriados }
    : undefined;

  return {
    montoPrincipal: datos.montoPrincipal,
    frecuencia: config.frecuencia,
    fechaDesembolso: datos.fechaDesembolso,
    fechaPrimerPago: datos.fechaPrimerPago,
    plazoPeriodos: datos.plazoPeriodos,
    tasa: config.tasa,
    metodo: config.metodo,
    metodoPosteriorGracia: config.metodoPosteriorGracia,
    periodosSoloInteres: config.periodosSoloInteres,
    diaria,
    quincenal: config.frecuenciaQuincenal,
    gracia: config.gracia,
    cargos: config.cargos,
    cuotasPersonalizadas: datos.cuotasPersonalizadas,
  };
}
