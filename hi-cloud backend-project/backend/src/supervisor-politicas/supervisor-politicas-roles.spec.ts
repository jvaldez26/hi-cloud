/**
 * GET/PATCH /configuracion/supervisor-politicas — solo el ADMIN puede ver y
 * cambiar las políticas de Modo Supervisor. Mismo patrón de regresión que
 * contador-ve-auditoria-roles.spec.ts: falla si alguien agrega otro rol a
 * la lista de @Roles() de estos endpoints.
 */
import { SupervisorPoliticasController } from './supervisor-politicas.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

function rolesDe(metodo: string): UserRole[] {
  return Reflect.getMetadata(ROLES_KEY, (SupervisorPoliticasController.prototype as any)[metodo]) ?? [];
}

describe('SupervisorPoliticasController — solo ADMIN', () => {
  it('listar() exige exactamente [admin]', () => {
    expect(rolesDe('listar')).toEqual([UserRole.ADMIN]);
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
