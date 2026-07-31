/**
 * Elimina el caracter Unicode de reemplazo U+FFFD que aparece cuando texto
 * almacenado en Windows-1252 fue leido como UTF-8 durante una importacion.
 * Usar en todos los puntos de salida de texto de usuario (XML e-CF, PDF,
 * HTML de recibo) para evitar que el simbolo llegue al cliente o a DGII.
 *
 * La correccion definitiva es arreglar los datos en la DB y corregir el
 * importador para detectar la codificacion del archivo.
 */
export function sanitizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/�/g, '');
}
