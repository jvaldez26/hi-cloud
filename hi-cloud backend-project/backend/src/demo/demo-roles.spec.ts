/**
 * S-62 — Test de regresión: los endpoints de administración de demos son de
 * PLATAFORMA, no del ERP del cliente.
 *
 * VULNERABILIDAD ORIGINAL:
 * Los 5 endpoints de gestión del pipeline comercial declaraban
 * @Roles(SUPER_ADMIN, ADMIN). UserRole.ADMIN es el rol del admin de CUALQUIER
 * empresa cliente, así que cualquiera de ellos podía listar los leads de HiCloud
 * (nombre, email, teléfono, notas internas de ventas), ver las estadísticas del
 * pipeline, mover estados y escribir notas.
 *
 * Este test falla si alguien vuelve a añadir un rol de cliente a esos endpoints.
 */

import { DemoController } from './demo.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

/** Métodos de administración — el endpoint público `crear` no lleva @Roles. */
const METODOS_ADMIN = ['listar', 'getEstadisticas', 'findOne', 'actualizarEstado', 'agregarNota'] as const;

function rolesDe(metodo: string): UserRole[] {
  return Reflect.getMetadata(ROLES_KEY, (DemoController.prototype as any)[metodo]) ?? [];
}

describe('S-62 — DemoController: solo super_admin administra el pipeline de demos', () => {
  it.each(METODOS_ADMIN)('%s exige exactamente [super_admin]', (metodo) => {
    expect(rolesDe(metodo)).toEqual([UserRole.SUPER_ADMIN]);
  });

  it.each(METODOS_ADMIN)('%s NO acepta ningún rol de empresa cliente', (metodo) => {
    const roles = rolesDe(metodo);
    for (const rolCliente of [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO]) {
      expect(roles).not.toContain(rolCliente);
    }
  });

  it('el endpoint público de solicitud de demo sigue sin restricción de rol', () => {
    // Es el formulario de la landing — debe seguir siendo accesible sin auth.
    expect(rolesDe('crear')).toEqual([]);
  });
});
