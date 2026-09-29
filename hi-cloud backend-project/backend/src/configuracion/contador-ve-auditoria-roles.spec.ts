/**
 * PATCH /configuracion/empresa/contador-ve-auditoria — solo el ADMIN puede
 * cambiar este ajuste. El propio CONTADOR (a quien el ajuste afecta) no
 * puede dárselo a sí mismo. Mismo patrón de regresión que demo-roles.spec.ts:
 * este test falla si alguien alguna vez agrega CONTADOR (u otro rol) a la
 * lista de @Roles() de este endpoint.
 */
import { ConfiguracionController } from './configuracion.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

function rolesDe(metodo: string): UserRole[] {
  return Reflect.getMetadata(ROLES_KEY, (ConfiguracionController.prototype as any)[metodo]) ?? [];
}

describe('ConfiguracionController.updateContadorVeAuditoria — solo ADMIN', () => {
  it('exige exactamente [admin]', () => {
    expect(rolesDe('updateContadorVeAuditoria')).toEqual([UserRole.ADMIN]);
  });

  it('CONTADOR no puede cambiar su propio acceso a Auditoría', () => {
    expect(rolesDe('updateContadorVeAuditoria')).not.toContain(UserRole.CONTADOR);
  });

  it('ningún otro rol de empresa cliente puede cambiarlo', () => {
    const roles = rolesDe('updateContadorVeAuditoria');
    for (const rol of [UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO]) {
      expect(roles).not.toContain(rol);
    }
  });
});
