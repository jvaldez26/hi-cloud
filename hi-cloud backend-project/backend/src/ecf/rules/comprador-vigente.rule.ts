/**
 * Regla: un comprador con RNC no vigente ante la DGII no puede recibir un
 * comprobante que otorgue crédito fiscal.
 *
 * Los tipos 31 (Crédito Fiscal), 44 (Regímenes Especiales) y 45 (Gubernamental)
 * identifican al comprador para que use el ITBIS. Si su RNC está SUSPENDIDO o
 * DADO DE BAJA, ese crédito no es válido y el comprobante le crea un problema
 * fiscal a ambas partes.
 *
 * ── Falla ABIERTA a propósito ──────────────────────────────────────────────
 * El padrón se consulta a un servicio externo. Si no responde, si no encuentra
 * el RNC o si devuelve un estado que no reconocemos, se PERMITE emitir: un
 * servicio de terceros caído no puede parar la facturación del negocio. Solo se
 * bloquea cuando el padrón afirma explícitamente que el RNC no está vigente.
 */

/** Tipos de e-CF que otorgan crédito fiscal al comprador identificado. */
export const TIPOS_CREDITO_FISCAL = [31, 44, 45] as const;

/** Estados del padrón que invalidan al comprador. */
const ESTADOS_NO_VIGENTES = ['SUSPENDIDO', 'DADO DE BAJA', 'BAJA'];

export interface CompradorPadron {
  /** El padrón encontró el RNC. */
  encontrado?: boolean;
  /** 'ACTIVO' | 'SUSPENDIDO' | 'DADO DE BAJA' | … */
  estado?: string | null;
}

export interface ResultadoComprador {
  bloquear: boolean;
  /** Mensaje para el usuario final; vacío si no se bloquea. */
  motivo?: string;
  /** Estado normalizado, para logs y auditoría. */
  estado?: string;
}

/** true si el tipo de e-CF otorga crédito fiscal. */
export function esCreditoFiscal(tipoEcf: number): boolean {
  return (TIPOS_CREDITO_FISCAL as readonly number[]).includes(Number(tipoEcf));
}

/** Normaliza el estado del padrón: mayúsculas, sin acentos ni espacios extra. */
export function normalizarEstado(estado?: string | null): string {
  return String(estado ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

/** true si el padrón dice explícitamente que el RNC no está vigente. */
export function estadoNoVigente(estado?: string | null): boolean {
  const e = normalizarEstado(estado);
  if (!e) return false;
  return ESTADOS_NO_VIGENTES.some(malo => e.includes(malo));
}

/**
 * Decide si se puede emitir el comprobante a este comprador.
 *
 * @param tipoEcf  31, 32, 44, 45…
 * @param padron   respuesta del padrón (o undefined si no se pudo consultar)
 */
export function evaluarCompradorFiscal(
  tipoEcf: number,
  padron?: CompradorPadron | null,
): ResultadoComprador {
  // Los tipos que no otorgan crédito fiscal (E32 consumo, E43, E46…) no dependen
  // de la vigencia del comprador.
  if (!esCreditoFiscal(tipoEcf)) return { bloquear: false };

  // Sin respuesta del padrón, o RNC no encontrado → se permite (falla abierta).
  if (!padron || padron.encontrado === false) return { bloquear: false };

  const estado = normalizarEstado(padron.estado);
  if (!estadoNoVigente(estado)) return { bloquear: false };

  return {
    bloquear: true,
    estado,
    motivo:
      `El RNC del comprador figura como ${estado} ante la DGII y no puede recibir ` +
      `un comprobante de crédito fiscal (E${tipoEcf}). Emite una Factura de Consumo (E32) ` +
      `o corrige el RNC.`,
  };
}
