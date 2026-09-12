/**
 * EquipoSesionesService — el admin de una empresa ve y cierra las sesiones
 * activas de SU equipo. Cobertura de las dos reglas de seguridad
 * innegociables de la tarea:
 *
 * 1. PERTENENCIA VALIDADA EN AMBOS SENTIDOS: no basta con que el solicitante
 *    sea admin de ALGUNA empresa (eso ya lo valida RolesGuard aparte) — el
 *    usuario OBJETIVO (:userId de la ruta) debe pertenecer a la MISMA
 *    empresa. Mismo eje que faltó en la escalada de /multi-empresa
 *    (S-60/S-61): rol sin pertenencia del objetivo.
 * 2. JERARQUÍA: un admin no puede cerrar la sesión de otro admin ni de un
 *    super admin — eso queda reservado al super admin real.
 *
 * El cierre REAL (sessionToken=NULL + revocar refresh tokens) vive en
 * AuthService.forzarLogout(), ya probado en forzar-logout.spec.ts — aquí se
 * verifica que se LLAMA con los argumentos correctos, no se reimplementa.
 */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { EquipoSesionesService } from './equipo-sesiones.service';
import { UserRole } from '../users/enums/user-role.enum';

function makeSvc() {
  const ueRows: any[] = [];
  const ueRepo = {
    findOne: jest.fn(async (opts: any) => {
      const w = opts?.where ?? {};
      return ueRows.find(r =>
        r.userId === w.userId && r.empresaId === w.empresaId && r.isActive === w.isActive,
      ) ?? null;
    }),
  };

  const refreshTokenSvc = {
    sesionesActivasEquipo: jest.fn().mockResolvedValue([]),
  };

  const authService = {
    forzarLogout: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  const svc = new EquipoSesionesService(ueRepo as any, refreshTokenSvc as any, authService as any);
  return { svc, ueRows, ueRepo, refreshTokenSvc, authService };
}

function seedMembresia(ueRows: any[], overrides: any = {}) {
  ueRows.push({ userId: 20, empresaId: 7, rol: UserRole.VENDEDOR, isActive: true, ...overrides });
}

const admin = { id: 1, nombre: 'Ana Admin' };

describe('EquipoSesionesService.cerrarSesionDeUsuario — pertenencia', () => {
  it('admin de la empresa A no puede cerrar la sesión de un usuario de la empresa B', async () => {
    const { svc, ueRows, authService } = makeSvc();
    seedMembresia(ueRows, { userId: 20, empresaId: 99 }); // pertenece a OTRA empresa

    await expect(
      svc.cerrarSesionDeUsuario(7, admin, 20, '10.0.0.1'),
    ).rejects.toThrow(ForbiddenException);

    expect(authService.forzarLogout).not.toHaveBeenCalled();
  });

  it('usuario objetivo que no existe en absoluto en la empresa: rechazado', async () => {
    const { svc, authService } = makeSvc(); // ueRows vacío — nadie pertenece a nada

    await expect(
      svc.cerrarSesionDeUsuario(7, admin, 999, undefined),
    ).rejects.toThrow(ForbiddenException);

    expect(authService.forzarLogout).not.toHaveBeenCalled();
  });

  it('el empresaId decide TODO — nunca llega manipulado desde el request (lo pasa el caller, siempre desde CLS)', async () => {
    const { svc, ueRows, authService } = makeSvc();
    seedMembresia(ueRows, { userId: 20, empresaId: 7, rol: UserRole.VENDEDOR });

    // Mismo usuario, mismo rol, pero el "empresaId" que pasa el caller (que en
    // producción SIEMPRE es tenantService.getEmpresaId(), nunca @Body()) es
    // distinto al de la fila real → debe rechazar igual que un cross-tenant.
    await expect(
      svc.cerrarSesionDeUsuario(999, admin, 20, undefined),
    ).rejects.toThrow(ForbiddenException);
    expect(authService.forzarLogout).not.toHaveBeenCalled();

    // Con el empresaId correcto sí procede.
    await svc.cerrarSesionDeUsuario(7, admin, 20, undefined);
    expect(authService.forzarLogout).toHaveBeenCalledWith(20, expect.objectContaining({ empresaId: 7 }), undefined);
  });
});

describe('EquipoSesionesService.cerrarSesionDeUsuario — jerarquía', () => {
  it('admin NO puede cerrar la sesión de otro admin', async () => {
    const { svc, ueRows, authService } = makeSvc();
    seedMembresia(ueRows, { userId: 20, empresaId: 7, rol: UserRole.ADMIN });

    await expect(
      svc.cerrarSesionDeUsuario(7, admin, 20, '10.0.0.1'),
    ).rejects.toThrow(ForbiddenException);

    expect(authService.forzarLogout).not.toHaveBeenCalled();
  });

  it('admin NO puede cerrar la sesión de un super_admin (aunque de algún modo apareciera con fila en usuario_empresa)', async () => {
    const { svc, ueRows, authService } = makeSvc();
    seedMembresia(ueRows, { userId: 20, empresaId: 7, rol: UserRole.SUPER_ADMIN });

    await expect(
      svc.cerrarSesionDeUsuario(7, admin, 20, undefined),
    ).rejects.toThrow(ForbiddenException);

    expect(authService.forzarLogout).not.toHaveBeenCalled();
  });

  it.each([UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO])(
    'admin SÍ puede cerrar la sesión de un %s',
    async (rol) => {
      const { svc, ueRows, authService } = makeSvc();
      seedMembresia(ueRows, { userId: 20, empresaId: 7, rol });

      await svc.cerrarSesionDeUsuario(7, admin, 20, '190.80.1.1');

      expect(authService.forzarLogout).toHaveBeenCalledWith(
        20,
        { id: admin.id, nombre: admin.nombre, role: UserRole.ADMIN, empresaId: 7 },
        '190.80.1.1',
      );
    },
  );

  it('no permite cerrar la propia sesión desde este endpoint', async () => {
    const { svc, authService } = makeSvc();

    await expect(
      svc.cerrarSesionDeUsuario(7, admin, admin.id, undefined),
    ).rejects.toThrow(BadRequestException);

    expect(authService.forzarLogout).not.toHaveBeenCalled();
  });
});

describe('EquipoSesionesService.listar', () => {
  it('excluye al propio solicitante y marca puedeSerCerrada según el rol', async () => {
    const { svc, refreshTokenSvc } = makeSvc();
    refreshTokenSvc.sesionesActivasEquipo.mockResolvedValue([
      {
        usuarioId: 20, usuarioNombre: 'Vendedor Uno', rol: UserRole.VENDEDOR,
        sucursalNombre: 'Sucursal Centro', sesionId: 's1', deviceInfo: 'Mozilla/5.0 (Windows NT 10.0)',
        ipAddress: '190.80.1.1', creadaEn: new Date('2026-09-01T10:00:00Z'), ultimaActividad: null,
      },
      {
        usuarioId: 21, usuarioNombre: 'Otro Admin', rol: UserRole.ADMIN,
        sucursalNombre: null, sesionId: 's2', deviceInfo: 'Mozilla/5.0 (Android)',
        ipAddress: null, creadaEn: new Date('2026-09-01T09:00:00Z'), ultimaActividad: null,
      },
    ]);

    const filas = await svc.listar(7, 1);

    expect(refreshTokenSvc.sesionesActivasEquipo).toHaveBeenCalledWith(7, 1);
    expect(filas).toHaveLength(2);

    const vendedor = filas.find(f => f.usuarioId === 20)!;
    expect(vendedor.puedeSerCerrada).toBe(true);
    expect(vendedor.dispositivo).toBe('Windows PC');
    expect(vendedor.esMovil).toBe(false);

    const otroAdmin = filas.find(f => f.usuarioId === 21)!;
    expect(otroAdmin.puedeSerCerrada).toBe(false);
    expect(otroAdmin.dispositivo).toBe('Android');
    expect(otroAdmin.esMovil).toBe(true);
  });

  it('nunca expone el deviceInfo crudo (User-Agent) ni la IP completa — solo nombre parseado y país', async () => {
    const { svc, refreshTokenSvc } = makeSvc();
    const uaCrudo = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    refreshTokenSvc.sesionesActivasEquipo.mockResolvedValue([{
      usuarioId: 20, usuarioNombre: 'Vendedor Uno', rol: UserRole.VENDEDOR,
      sucursalNombre: null, sesionId: 's1', deviceInfo: uaCrudo,
      ipAddress: '10.0.0.5', creadaEn: new Date(), ultimaActividad: null,
    }]);

    const [fila] = await svc.listar(7, 1);

    expect(fila.dispositivo).toBe('Windows PC');
    expect(JSON.stringify(fila)).not.toContain(uaCrudo);
    expect(JSON.stringify(fila)).not.toContain('10.0.0.5');
    expect(fila.ubicacion).toBe('Local'); // IP privada → "Local", nunca la IP en sí
  });
});
