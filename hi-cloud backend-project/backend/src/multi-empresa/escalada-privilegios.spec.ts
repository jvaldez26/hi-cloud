/**
 * S-60 — Tests de regresión: escalada de privilegios a super_admin.
 *
 * VULNERABILIDAD ORIGINAL (P0):
 * Tres endpoints con @Roles(UserRole.ADMIN) — es decir, alcanzables por el admin
 * de CUALQUIER empresa cliente — aceptaban 'super_admin' como rol asignable:
 *
 *   1. PATCH /multi-empresa/:empresaId/usuarios/:userId  → users.role = 'super_admin'
 *   2. POST  /multi-empresa/:empresaId/usuarios          → usuario_empresa.rol = 'super_admin'
 *   3. POST  /invitaciones                               → users.role = 'super_admin' al aceptar
 *
 * Además, cambiarRolUsuario no validaba que el solicitante perteneciera a
 * :empresaId — el RolesGuard solo valida la membresía de la empresa del JWT.
 *
 * Estos tests fallan si alguien vuelve a abrir cualquiera de las dos puertas.
 */

import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { MultiEmpresaService } from './multi-empresa.service';
import { InvitacionesService } from '../invitaciones/invitaciones.service';
import {
  UserRole,
  ROLES_ASIGNABLES_EMPRESA,
  esRolAsignablePorEmpresa,
} from '../users/enums/user-role.enum';

// ── Lista blanca ──────────────────────────────────────────────────────────────

describe('ROLES_ASIGNABLES_EMPRESA — lista blanca de roles', () => {
  it('NO incluye super_admin', () => {
    expect(ROLES_ASIGNABLES_EMPRESA).not.toContain(UserRole.SUPER_ADMIN);
    expect(esRolAsignablePorEmpresa('super_admin')).toBe(false);
  });

  it('incluye los roles normales de empresa', () => {
    for (const rol of [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO]) {
      expect(esRolAsignablePorEmpresa(rol)).toBe(true);
    }
  });

  it('rechaza valores basura o inventados', () => {
    for (const rol of ['', 'SUPER_ADMIN', 'root', 'owner', null, undefined, 42, {}]) {
      expect(esRolAsignablePorEmpresa(rol)).toBe(false);
    }
  });
});

// ── Helpers de mocking ────────────────────────────────────────────────────────

const EMPRESA_A = 10;
const EMPRESA_B = 20;
const ADMIN_A   = 1;   // admin legítimo de la empresa A
const VICTIMA   = 2;   // usuario de la empresa A
const AJENO     = 3;   // usuario de la empresa B

/**
 * Construye el servicio con repos mockeados.
 * membresias: pares userId↔empresaId activos.
 */
function buildMultiEmpresaService(opts: {
  membresias: { userId: number; empresaId: number; isPrincipal?: boolean; role?: UserRole }[];
}) {
  const updates: any[] = [];

  const usuarioEmpresaRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const m = opts.membresias.find(
        x => x.userId === where.userId && x.empresaId === where.empresaId,
      );
      if (!m) return null;
      return {
        id:          m.userId * 1000 + m.empresaId,
        userId:      m.userId,
        empresaId:   m.empresaId,
        isPrincipal: m.isPrincipal ?? false,
        user:        { id: m.userId, role: m.role ?? UserRole.VIEWER },
      };
    }),
    update: jest.fn(async (id: any, patch: any) => { updates.push({ repo: 'usuario_empresa', id, patch }); }),
    count:  jest.fn(async () => 0),
    create: jest.fn((x: any) => x),
    save:   jest.fn(async (x: any) => x),
  };

  const usuarioRepo = {
    findOne: jest.fn(async ({ where }: any) => ({ id: where.id, isActive: true })),
    update:  jest.fn(async (id: any, patch: any) => { updates.push({ repo: 'users', id, patch }); }),
  };

  const empresaRepo = {
    findOne: jest.fn(async ({ where }: any) => ({ id: where.id, nombre: `Empresa ${where.id}`, isActive: true })),
  };

  const svc = new MultiEmpresaService(
    usuarioEmpresaRepo as any,
    empresaRepo as any,
    {} as any,                       // sucursalRepo
    usuarioRepo as any,
    {} as any,                       // contabilidadSvc
    {} as any,                       // emailSvc
    {} as any,                       // dataSource
    { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any, // cacheManager
  );

  return { svc, updates, usuarioRepo, usuarioEmpresaRepo };
}

// ── Prueba 1: no se puede asignar super_admin ─────────────────────────────────

describe('S-60.1 — un admin NO puede asignar el rol super_admin', () => {
  it('cambiarRolUsuario rechaza rol=super_admin', async () => {
    const { svc, updates } = buildMultiEmpresaService({
      membresias: [
        { userId: ADMIN_A, empresaId: EMPRESA_A },
        { userId: VICTIMA, empresaId: EMPRESA_A, isPrincipal: true },
      ],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_A, VICTIMA, 'super_admin', ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);

    // Lo importante: no se escribió nada en users.role
    expect(updates).toHaveLength(0);
  });

  it('asignarUsuario rechaza rol=super_admin', async () => {
    const { svc } = buildMultiEmpresaService({
      membresias: [{ userId: ADMIN_A, empresaId: EMPRESA_A }],
    });

    await expect(
      svc.asignarUsuario(EMPRESA_A, { userId: 99, rol: 'super_admin' as UserRole } as any, ADMIN_A),
    ).rejects.toThrow(ForbiddenException);
  });

  it('crear invitación rechaza rol=super_admin', async () => {
    const svc = new InvitacionesService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    await expect(
      svc.crear(EMPRESA_A, 'atacante@mail.com', 'super_admin' as UserRole, ADMIN_A),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ── Prueba 2: no se puede operar sobre otra empresa ───────────────────────────

describe('S-60.2 — un admin de la empresa A NO puede cambiar roles en la empresa B', () => {
  it('rechaza cuando el solicitante no pertenece a :empresaId', async () => {
    const { svc, updates } = buildMultiEmpresaService({
      membresias: [
        { userId: ADMIN_A, empresaId: EMPRESA_A },              // admin solo en A
        { userId: AJENO,   empresaId: EMPRESA_B, isPrincipal: true },
      ],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_B, AJENO, UserRole.VIEWER, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);

    expect(updates).toHaveLength(0);
  });

  it('falla ANTES de consultar al usuario objetivo (no revela si existe)', async () => {
    const { svc, usuarioEmpresaRepo } = buildMultiEmpresaService({
      membresias: [{ userId: ADMIN_A, empresaId: EMPRESA_A }],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_B, 12345, UserRole.VIEWER, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);

    // Solo la consulta de membresía del solicitante, ninguna del objetivo
    expect(usuarioEmpresaRepo.findOne).toHaveBeenCalledTimes(1);
    expect(usuarioEmpresaRepo.findOne).toHaveBeenCalledWith({
      where: { userId: ADMIN_A, empresaId: EMPRESA_B, isActive: true },
    });
  });

  it('un super_admin real SÍ puede operar sin membresía (no tiene usuario_empresa)', async () => {
    const { svc, usuarioRepo } = buildMultiEmpresaService({
      membresias: [{ userId: AJENO, empresaId: EMPRESA_B, isPrincipal: true }],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_B, AJENO, UserRole.CONTADOR, 999, UserRole.SUPER_ADMIN),
    ).resolves.toBeDefined();

    expect(usuarioRepo.update).toHaveBeenCalled();
  });
});

// ── Prueba 3: el caso legítimo sigue funcionando ──────────────────────────────

describe('S-60.3 — el flujo legítimo no se rompe', () => {
  it('un admin cambia el rol de un usuario de SU empresa a vendedor', async () => {
    const { svc, usuarioRepo, usuarioEmpresaRepo } = buildMultiEmpresaService({
      membresias: [
        { userId: ADMIN_A, empresaId: EMPRESA_A },
        { userId: VICTIMA, empresaId: EMPRESA_A, isPrincipal: true },
      ],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_A, VICTIMA, UserRole.VENDEDOR, ADMIN_A, UserRole.ADMIN),
    ).resolves.toBeDefined();

    expect(usuarioEmpresaRepo.update).toHaveBeenCalledWith(
      expect.anything(),
      { rol: UserRole.VENDEDOR },
    );
    // Al ser su empresa principal, se sincroniza users.role e invalida los JWT viejos
    expect(usuarioRepo.update).toHaveBeenCalledWith(
      VICTIMA,
      expect.objectContaining({ role: UserRole.VENDEDOR, roleVersion: expect.any(Function) }),
    );
  });

  it('los demás roles de empresa siguen siendo asignables', async () => {
    for (const rol of [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER, UserRole.EMPLEADO]) {
      const { svc } = buildMultiEmpresaService({
        membresias: [
          { userId: ADMIN_A, empresaId: EMPRESA_A },
          { userId: VICTIMA, empresaId: EMPRESA_A },
        ],
      });
      await expect(
        svc.cambiarRolUsuario(EMPRESA_A, VICTIMA, rol, ADMIN_A, UserRole.ADMIN),
      ).resolves.toBeDefined();
    }
  });

  it('sigue impidiendo la auto-degradación del admin', async () => {
    const { svc } = buildMultiEmpresaService({
      membresias: [{ userId: ADMIN_A, empresaId: EMPRESA_A }],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_A, ADMIN_A, UserRole.VIEWER, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(BadRequestException);
  });

  it('un admin no puede tocar el rol de un super_admin de su empresa', async () => {
    const { svc } = buildMultiEmpresaService({
      membresias: [
        { userId: ADMIN_A, empresaId: EMPRESA_A },
        { userId: VICTIMA, empresaId: EMPRESA_A, role: UserRole.SUPER_ADMIN },
      ],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_A, VICTIMA, UserRole.VIEWER, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sigue devolviendo 404 si el usuario objetivo no pertenece a la empresa', async () => {
    const { svc } = buildMultiEmpresaService({
      membresias: [{ userId: ADMIN_A, empresaId: EMPRESA_A }],
    });

    await expect(
      svc.cambiarRolUsuario(EMPRESA_A, 777, UserRole.VIEWER, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
