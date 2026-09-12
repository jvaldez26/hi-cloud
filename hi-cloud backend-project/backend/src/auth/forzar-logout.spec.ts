/**
 * AuthService.forzarLogout — cierre REAL de la sesión de otro usuario, con
 * auditoría obligatoria. Único punto que hace este cierre: lo usan tanto el
 * super admin (cualquier usuario) como el admin de empresa, vía
 * EquipoSesionesService (ver equipo-sesiones.service.spec.ts para las reglas
 * de pertenencia/jerarquía que corren ANTES de llegar aquí).
 *
 * Se instancia AuthService a mano con fakes mínimos (no Test.createTestingModule)
 * — mismo criterio que devoluciones.service.spec.ts: instanciar vía DI de Nest
 * arrastraría TypeORM/colas/Redis para probar cuatro líneas de lógica.
 */
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../users/enums/user-role.enum';

function makeAuthService() {
  const users: any[] = [{ id: 20, nombre: 'Vendedor Uno' }];

  const userRepository = {
    findOneBy: jest.fn(async ({ id }: any) => users.find(u => u.id === id) ?? null),
  };

  const queries: { sql: string; params: any[] }[] = [];
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      return [];
    }),
  };

  const refreshTokenSvc = { revocarTodos: jest.fn().mockResolvedValue(undefined) };
  const auditoriaSvc    = { registrar: jest.fn().mockResolvedValue(undefined) };

  // Resto de dependencias del constructor: no las toca forzarLogout, fakes vacíos.
  const noop = {} as any;

  const svc = new AuthService(
    noop,            // usersService
    noop,            // jwtService
    noop,            // emailService
    noop,            // blacklistSvc
    refreshTokenSvc, // refreshTokenSvc
    noop,            // sessionLifetime
    noop,            // twoFactorService
    userRepository,  // userRepository
    noop,            // ueRepository
    noop,            // empresaRepository
    noop,            // sucursalRepository
    noop,            // contabilidadService
    dataSource,      // dataSource
    noop,            // loginAttempts
    auditoriaSvc,    // auditoriaSvc
  );

  return { svc, userRepository, dataSource, refreshTokenSvc, auditoriaSvc, queries };
}

const actor = { id: 1, nombre: 'Ana Admin', role: UserRole.ADMIN, empresaId: 7 };

describe('AuthService.forzarLogout', () => {
  it('usuario inexistente: rechaza sin tocar sesión ni auditoría', async () => {
    const { svc, dataSource, refreshTokenSvc, auditoriaSvc } = makeAuthService();

    await expect(svc.forzarLogout(999, actor, '190.80.1.1')).rejects.toThrow(BadRequestException);

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(refreshTokenSvc.revocarTodos).not.toHaveBeenCalled();
    expect(auditoriaSvc.registrar).not.toHaveBeenCalled();
  });

  it('cierre real: limpia sessionToken en BD y revoca todos los refresh tokens del objetivo', async () => {
    const { svc, dataSource, refreshTokenSvc, queries } = makeAuthService();

    await svc.forzarLogout(20, actor, '190.80.1.1');

    // sessionToken=NULL es lo que hace que JwtStrategy rechace el access
    // token vigente de esa persona en su SIGUIENTE request (SESION_DESPLAZADA)
    // — no hay que esperar a que expire.
    const update = queries.find(q => q.sql.includes('SET "sessionToken" = NULL'));
    expect(update).toBeDefined();
    expect(update!.params).toEqual([20]);

    expect(refreshTokenSvc.revocarTodos).toHaveBeenCalledWith(20);
  });

  it('audita el cierre: quién lo hizo, a quién, desde qué IP y cuándo (vía createdAt de la fila)', async () => {
    const { svc, auditoriaSvc } = makeAuthService();

    await svc.forzarLogout(20, actor, '190.80.1.1');

    expect(auditoriaSvc.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId:      actor.id,          // quién lo hizo
        userName:    actor.nombre,
        empresaId:   actor.empresaId,
        entidadId:   '20',              // a quién
        descripcion: expect.stringContaining('Vendedor Uno'),
        ipAddress:   '190.80.1.1',       // desde qué IP
        exitoso:     true,
      }),
    );
  });

  it('super admin (sin empresaId propio) también audita — empresaId queda undefined, no null falsy raro', async () => {
    const { svc, auditoriaSvc } = makeAuthService();
    const superAdmin = { id: 2, nombre: 'Super Admin', role: UserRole.SUPER_ADMIN, empresaId: null };

    await svc.forzarLogout(20, superAdmin, undefined);

    expect(auditoriaSvc.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, userRole: UserRole.SUPER_ADMIN, empresaId: undefined }),
    );
  });
});
