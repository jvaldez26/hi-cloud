/**
 * Regla: un comprador con RNC no vigente ante la DGII normalmente no debería
 * recibir un comprobante que otorgue crédito fiscal.
 *
 * Los tipos 31 (Crédito Fiscal), 44 (Regímenes Especiales) y 45 (Gubernamental)
 * identifican al comprador para que use el ITBIS. Si su RNC está SUSPENDIDO o
 * DADO DE BAJA, ese crédito puede no ser válido y el comprobante le crea un
 * problema fiscal a ambas partes.
 *
 * ── ADVIERTE, no impide ────────────────────────────────────────────────────
 * El estado del padrón es un dato de un tercero que puede estar desactualizado,
 * y la vigencia puede resolverse entre la venta y la declaración. Quien está en
 * el mostrador con el cliente delante tiene información que el padrón no tiene.
 * Por eso la regla exige una CONFIRMACIÓN EXPLÍCITA en vez de rechazar: se
 * advierte con claridad, y si el usuario confirma, se emite y queda registrado
 * quién lo confirmó. Bloquear convertía un juicio de negocio en un muro.
 *
 * ── Falla ABIERTA a propósito ──────────────────────────────────────────────
 * Si el padrón no responde, no encuentra el RNC o devuelve un estado que no
 * reconocemos, se emite sin siquiera advertir: un servicio de terceros caído no
 * puede parar la facturación. Esto incluye los RNC que no están inscritos como
 * contribuyentes — p. ej. la serie gubernamental 401xxxxxx, que el padrón
 * responde con 404 y que usan entidades públicas y distritos educativos.
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
  /** true solo si hay que pedir confirmación y aún no se dio. */
  bloquear: boolean;
  /** Mensaje para el usuario final; vacío si no hay nada que advertir. */
  motivo?: string;
  /** Estado normalizado, para logs y auditoría. */
  estado?: string;
  /**
   * El padrón dice que no está vigente. Se llenan tanto cuando falta la
   * confirmación como cuando ya se dio — en el segundo caso `bloquear` es
   * false pero el emisor debe dejar rastro de que se emitió advertido.
   */
  requiereConfirmacion?: boolean;
  confirmado?: boolean;
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
 * @param tipoEcf     31, 32, 44, 45…
 * @param padron      respuesta del padrón (o undefined si no se pudo consultar)
 * @param confirmado  el usuario ya vio la advertencia y decidió emitir igual
 */
export function evaluarCompradorFiscal(
  tipoEcf: number,
  padron?: CompradorPadron | null,
  confirmado = false,
): ResultadoComprador {
  // Los tipos que no otorgan crédito fiscal (E32 consumo, E43, E46…) no dependen
  // de la vigencia del comprador.
  if (!esCreditoFiscal(tipoEcf)) return { bloquear: false };

  // Sin respuesta del padrón, o RNC no encontrado → se permite sin advertir.
  // Aquí caen los RNC no inscritos como contribuyentes (serie 401xxxxxx de
  // entidades públicas y distritos educativos): el padrón responde 404 y eso no
  // dice nada sobre la validez de la operación.
  if (!padron || padron.encontrado === false) return { bloquear: false };

  const estado = normalizarEstado(padron.estado);
  if (!estadoNoVigente(estado)) return { bloquear: false };

  const motivo =
    `El RNC del comprador figura como ${estado} ante la DGII. Un comprobante de ` +
    `crédito fiscal (E${tipoEcf}) a un contribuyente no vigente puede ser objetado, ` +
    `y el crédito del ITBIS podría no serle reconocido. Si sabes que la situación ` +
    `está resuelta o vas a asumirlo, confírmalo para emitir; si no, usa una Factura ` +
    `de Consumo (E32) o corrige el RNC.`;

  // Confirmado: se emite, pero el resultado conserva el motivo para que quien
  // llama lo registre. Una emisión advertida no puede pasar sin dejar rastro.
  if (confirmado) {
    return { bloquear: false, estado, motivo, requiereConfirmacion: true, confirmado: true };
  }

  return { bloquear: true, estado, motivo, requiereConfirmacion: true, confirmado: false };
}
