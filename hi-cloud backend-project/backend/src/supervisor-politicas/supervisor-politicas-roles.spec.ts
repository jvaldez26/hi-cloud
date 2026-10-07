/**
 * GET /configuracion/supervisor-politicas — leído por CUALQUIER rol
 * autenticado del tenant (el propio cajero necesita saber qué claves pedir
 * desde el POS; el enforcement real es 100% del backend, listar las
 * políticas no es información sensible). PATCH sigue siendo solo ADMIN.
 *
 * Antes listar() también era ADMIN-only: un vendedor recibía 403, el
 * catálogo del frontend quedaba vacío y ninguna clave pedía supervisor para
 * un cajero — en silencio (reporte real, 2026-10-07). Mismo patrón de
 * regresión que contador-ve-auditoria-roles.spec.ts: falla si alguien
 * vuelve a agregar @Roles() a listar() o afloja guardar().
 */
import { SupervisorPoliticasController } from './supervisor-politicas.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

function rolesDe(metodo: string): UserRole[] {
  return Reflect.getMetadata(ROLES_KEY, (SupervisorPoliticasController.prototype as any)[metodo]) ?? [];
}

describe('SupervisorPoliticasController — lectura abierta, escritura solo ADMIN', () => {
  it('listar() no exige ningún rol — RolesGuard deja pasar a cualquier autenticado del tenant', () => {
    expect(rolesDe('listar')).toEqual([]);
  });

  it('guardar() exige exactamente [admin]', () => {
    expect(rolesDe('guardar')).toEqual([UserRole.ADMIN]);
  });

  it('ningún otro rol (incluido CONTADOR) puede cambiar la política', () => {
    const roles = rolesDe('guardar');
    for (const rol of [UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO]) {
      expect(roles).not.toContain(rol);
    }
  });
});
