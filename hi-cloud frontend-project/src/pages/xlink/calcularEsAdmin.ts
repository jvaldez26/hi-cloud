/**
 * `user.role` es el rol GLOBAL (de `users.role`). En una empresa SECUNDARIA
 * puede no coincidir con el rol real ahí — ver auth.store.ts: login() no
 * aplica la misma corrección por `empresaInfo.rol` que cambiarEmpresa() y la
 * rehidratación de /auth/me (App.tsx) sí hacen. El backend (RolesGuard)
 * autoriza con el rol de `usuario_empresa` para la empresa activa, así que
 * la UI tiene que decidir con esa misma fuente — nunca con el rol global.
 */
export function calcularEsAdmin(
  rolEnEmpresaActiva: string | undefined | null,
  rolGlobal: string | undefined | null,
): boolean {
  return (rolEnEmpresaActiva ?? rolGlobal) === 'admin';
}
