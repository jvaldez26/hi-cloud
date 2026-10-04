/**
 * AuthService.buildAccessTokenForUser() — usado por POST /auth/refresh.
 *
 * Caso real (caja #714, empresa 44, 2026-10-03): esta función pasaba
 * sucursalId/almacenId como `undefined` SIEMPRE, sin llamar a
 * resolverContextoSucursal() como sí hace login(). Cualquier usuario con
 * una sucursal correctamente asignada en usuario_empresa perdía esa
 * sucursal en el JWT en cuanto el access token vencía y el frontend pedía
 * uno nuevo por /auth/refresh — algo que pasa varias veces al día. Una vez
 * ahí, TenantMiddleware nunca volvía a fijar sucursalId en el CLS (un JWT
 * con sucursalId:null es indistinguible de uno sin la clave) hasta el
 * siguiente login completo, y todo lo creado en ese lapso (cajas,
 * facturas, NC) quedaba con sucursalId NULL.
 *
 * Se instancia AuthService a mano, igual que login-username.spec.ts, y se
 * sobreescriben los métodos downstream que no son el contenido de esta
 * tarea.
 */
import { AuthService } from './auth.service';

function makeAuthService() {
  const usersService = {
    findByIdForAuth: jest.fn().mockResolvedValue({ id: 7, sessionToken: 'tok', role: 'vendedor' }),
  };

  const noop = {} as any;
  const svc = new AuthService(
    usersService as any, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop, noop, noop, noop,
  );

  (svc as any).buildToken = jest.fn().mockReturnValue('fake-jwt');

  return { svc, usersService };
}

describe('AuthService.buildAccessTokenForUser — sucursalId en el refresh', () => {
  it('resuelve sucursalId/almacenId vía resolverContextoSucursal (como login), no undefined fijo', async () => {
    const { svc } = makeAuthService();
    (svc as any).getEmpresaPrincipal = jest.fn().mockResolvedValue({ empresaId: 44, rol: 'admin' });
    (svc as any).resolverContextoSucursal = jest.fn().mockResolvedValue({ sucursalId: 45, almacenId: 9, sucursalNombre: 'Sucursal Principal' });

    await svc.buildAccessTokenForUser(7);

    expect((svc as any).resolverContextoSucursal).toHaveBeenCalledWith(7, 44);
    expect((svc as any).buildToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }), 44, 45, 9, 'admin',
    );
  });

  it('sin empresa principal: no llama a resolverContextoSucursal, token sale sin sucursal (igual que antes)', async () => {
    const { svc } = makeAuthService();
    (svc as any).getEmpresaPrincipal = jest.fn().mockResolvedValue(undefined);
    (svc as any).resolverContextoSucursal = jest.fn();

    await svc.buildAccessTokenForUser(7);

    expect((svc as any).resolverContextoSucursal).not.toHaveBeenCalled();
    expect((svc as any).buildToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }), undefined, undefined, undefined, undefined,
    );
  });
});
