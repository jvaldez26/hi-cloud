/**
 * ¿Debe el sidebar mostrar Auditoría para este rol? Es SOLO ux — el backend
 * (AuditoriaAccessGuard) es la barrera real: ocultar el ítem de menú evita
 * que el contador entre a algo que igual le daría 403, pero rechazarlo por
 * URL directa nunca depende de esto.
 *
 * Cualquier rol que no sea contador ya lo decide rolPuedeVerRuta (ADMIN_CONT
 * en menuConfig.ts) — esta función solo agrega la condición extra para
 * contador, que además del rol depende del ajuste de empresa
 * contadorPuedeVerAuditoria.
 */
export function puedeVerAuditoria(role: string, contadorPuedeVerAuditoria: boolean): boolean {
  if (role !== 'contador') return true;
  return contadorPuedeVerAuditoria;
}
