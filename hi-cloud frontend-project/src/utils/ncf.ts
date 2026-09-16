/**
 * NCF recibido de un proveedor (el que se reporta en el Formato 606).
 *
 * Dos formatos vigentes en RD:
 *   - NCF impreso:  B0100000001    → letra + 10 dígitos  (11 caracteres)
 *   - e-NCF:        E310000000001  → letra + 12 dígitos  (13 caracteres)
 */
const RE_NCF_IMPRESO = /^[A-Z]\d{10}$/;
const RE_ENCF        = /^[A-Z]\d{12}$/;

/** Mayúsculas y sin espacios — la DGII no acepta minúsculas en el 606. */
export const normalizarNcf = (valor: string): string =>
  valor.toUpperCase().replace(/\s+/g, '');

/** true solo cuando el NCF está completo (11 o 13 caracteres con formato válido). */
export const esNcfCompleto = (valor: string): boolean => {
  const n = normalizarNcf(valor ?? '');
  return RE_NCF_IMPRESO.test(n) || RE_ENCF.test(n);
};
