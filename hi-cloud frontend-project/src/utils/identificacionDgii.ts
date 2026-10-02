/**
 * Identificación del contribuyente ante la DGII: RNC o cédula.
 *
 * En el Formato 606 se declaran gastos a personas FÍSICAS (un técnico, un
 * transportista, un alquiler a un particular), que no tienen RNC sino cédula.
 * El backend ya lo contempla — tipoIdDgii() en dgii.constants.ts mapea 9
 * dígitos a tipo '1' (RNC), 11 a tipo '2' (cédula) — y el endpoint
 * /rnc/consultar acepta ambos. Lo que faltaba era dejar escribirla.
 *
 *   RNC    → 9 dígitos
 *   Cédula → 11 dígitos
 */

export type TipoIdentificacion = 'RNC' | 'Cédula';

/** Solo los dígitos: el usuario pega con guiones ("402-2644-82-4") o espacios. */
export const soloDigitos = (valor: string): string => (valor ?? '').replace(/\D/g, '');

/** 'RNC' con 9 dígitos, 'Cédula' con 11, null con cualquier otra cosa. */
export function tipoIdentificacion(valor: string | undefined | null): TipoIdentificacion | null {
  const v = soloDigitos(valor ?? '');
  if (v.length === 9)  return 'RNC';
  if (v.length === 11) return 'Cédula';
  return null;
}

/** true si es un RNC (9) o una cédula (11) completos. El vacío NO es válido. */
export const esRncOCedulaValido = (valor: string | undefined | null): boolean =>
  tipoIdentificacion(valor) !== null;

/** Mensaje de error del formulario — uno solo, para no repetirlo en cada pantalla. */
export const MENSAJE_RNC_CEDULA = 'Debe ser un RNC (9 dígitos) o una cédula (11 dígitos)';
