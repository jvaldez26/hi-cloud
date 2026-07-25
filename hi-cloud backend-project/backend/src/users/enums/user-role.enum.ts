export enum UserRole {
  SUPER_ADMIN = 'super_admin', // Administrador global de la plataforma HiCloud
  ADMIN       = 'admin',
  CONTADOR    = 'contador',
  VENDEDOR    = 'vendedor',
  VIEWER      = 'viewer',
  EMPLEADO    = 'empleado',   // Acceso exclusivo al Portal del Empleado (sus propios datos)
}

/**
 * S-60 — Roles que un ADMIN de empresa puede asignar a otros usuarios.
 *
 * SUPER_ADMIN queda DELIBERADAMENTE FUERA: es un rol de plataforma que controla
 * todas las empresas, y solo puede concederse desde un endpoint protegido por
 * SuperAdminGuard (PATCH /admin/usuarios/:id/rol).
 *
 * Cualquier DTO de un endpoint con @Roles(UserRole.ADMIN) que acepte un rol DEBE
 * validar contra esta lista (@IsIn) en vez de contra el enum completo — usar
 * @IsEnum(UserRole) permitiría enviar 'super_admin' y escalar privilegios.
 */
export const ROLES_ASIGNABLES_EMPRESA: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.CONTADOR,
  UserRole.VENDEDOR,
  UserRole.VIEWER,
  UserRole.EMPLEADO,
] as const;

/** true si el rol puede ser asignado por un admin de empresa (nunca super_admin). */
export function esRolAsignablePorEmpresa(rol: unknown): rol is UserRole {
  return typeof rol === 'string' && (ROLES_ASIGNABLES_EMPRESA as readonly string[]).includes(rol);
}
