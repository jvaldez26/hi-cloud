/**
 * `user.role` es el rol GLOBAL (de `users.role`), que normalmente ya coincide
 * con el rol en la empresa activa (login()/cambiarEmpresa() lo resuelven vía
 * resolverRolPorEmpresa — ver auth.store.ts). Se prefiere igual el rol de
 * `getEmpresaActual()` cuando está disponible porque es la MISMA fuente que
 * usa el RolesGuard del backend para autorizar — la UI nunca debe decidir con
 * una fuente distinta a la que decide el servidor.
 *
 * Activar/desactivar HiCloud Xlink y vincular el directorio son acciones de
 * admin o contador — las dos personas que normalmente gestionan la relación
 * fiscal/comercial con otras empresas.
 */
export function puedeActivarXlink(
  rolEnEmpresaActiva: string | undefined | null,
  rolGlobal: string | undefined | null,
): boolean {
  const rol = rolEnEmpresaActiva ?? rolGlobal;
  return rol === 'admin' || rol === 'contador';
}
