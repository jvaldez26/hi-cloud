/**
 * NCF recibido de un proveedor (el que se reporta en el Formato 606) — NO es
 * el e-CF que HiCloud emite (ese tiene su propio motor en declaraciones/).
 *
 * Dos formatos vigentes en RD, letra LITERAL (no cualquiera):
 *   - NCF impreso: B0100000001    → 'B' + 10 dígitos (11 caracteres)
 *   - e-NCF:       E310000000001  → 'E' + 12 dígitos (13 caracteres)
 *
 * Las posiciones 2-3 son el tipo de comprobante (31/32/33/34/41/43/44/46/47)
 * pero aquí NO se valida contra esa lista — es responsabilidad de la lógica
 * específica de cada flujo (606/607). Este util solo valida FORMATO: letra +
 * longitud + solo dígitos en el resto.
 */
const RE_NCF_IMPRESO = /^B\d{10}$/;
const RE_ENCF        = /^E\d{12}$/;

/** Mayúsculas y sin espacios — la DGII no acepta minúsculas en el 606. */
export const normalizarNcf = (valor: string): string =>
  valor.toUpperCase().replace(/\s+/g, '');

/** true solo cuando el NCF está completo (11 o 13 caracteres con formato válido). */
export const esNcfCompleto = (valor: string): boolean => {
  const n = normalizarNcf(valor ?? '');
  return RE_NCF_IMPRESO.test(n) || RE_ENCF.test(n);
};

const MENSAJE_NCF_INVALIDO =
  'NCF inválido — debe ser E + 12 dígitos (13 caracteres) o B + 10 dígitos (11 caracteres)';

/**
 * Mensaje de error para mostrar en el campo, o null si el NCF es válido.
 * Un valor VACÍO también da null a propósito — la obligatoriedad la decide
 * el `required` de cada formulario, no este validador de formato.
 */
export const errorNcf = (valor: string | undefined | null): string | null => {
  const n = normalizarNcf(valor ?? '');
  if (!n) return null;
  return esNcfCompleto(n) ? null : MENSAJE_NCF_INVALIDO;
};

/**
 * Regla de AntD Form lista para usar: `rules={[reglaFormatoNcf, ...]}`.
 * Valida formato sin duplicar el validator en cada formulario que captura
 * un NCF de proveedor (Compras, Gastos, Notas de Crédito de Compras).
 */
export const reglaFormatoNcf = {
  validator: (_: unknown, value: string) => {
    const err = errorNcf(value);
    return err ? Promise.reject(new Error(err)) : Promise.resolve();
  },
};
