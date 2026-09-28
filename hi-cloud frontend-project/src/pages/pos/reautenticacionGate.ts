/**
 * ¿Este fallo del modal de desbloqueo/reingreso (pantallaBloqueada) es un
 * rechazo REAL de credenciales, o un error técnico? Solo lo primero debe
 * contar como intento fallido (el límite de 3 intentos existe para frenar
 * adivinar la contraseña, no para castigar a un cajero por un bug del
 * cliente o una caída de red).
 *
 * El status que significa "contraseña incorrecta de verdad" depende del
 * endpoint, y cambia según el modo:
 *   - reautenticandoTrasFallo (POST /auth/login): 401 — credenciales
 *     inválidas, genérico a propósito para no filtrar si el usuario existe.
 *   - modo normal (POST /auth/verificar-password): 400 — ahí 401 significa
 *     "usuario no encontrado" (token apuntando a alguien borrado), un caso
 *     aparte que tampoco es "contraseña incorrecta" (ver auth.service.ts).
 *
 * "usuarioDistinto" (el login devolvió otra cuenta) tampoco cuenta: la
 * contraseña SÍ era correcta, solo que para la cuenta equivocada.
 */
export function credencialesFueronRechazadas(params: {
  status: number | undefined;
  reautenticandoTrasFallo: boolean;
  usuarioDistinto: boolean;
}): boolean {
  if (params.usuarioDistinto) return false;
  return params.reautenticandoTrasFallo ? params.status === 401 : params.status === 400;
}
