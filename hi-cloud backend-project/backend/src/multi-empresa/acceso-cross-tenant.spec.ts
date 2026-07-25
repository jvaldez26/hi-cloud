/**
 * S-61 — Tests de regresión: acceso cross-tenant en /multi-empresa (Fase 2).
 *
 * VULNERABILIDAD ORIGINAL (P0):
 * /multi-empresa está protegido con @Roles(ADMIN) — el rol de cualquier admin de
 * cualquier empresa cliente — y ningún método validaba que el solicitante
 * perteneciera al :empresaId de la ruta. El RolesGuard solo valida la membresía
 * de la empresa del JWT, nunca la del parámetro. Resultado: un admin de la
 * empresa A podía listar, modificar, asignarse y remover usuarios en la empresa B.
 *
 * Regla implementada: super_admin pasa siempre (gestiona la plataforma y no tiene
 * filas en usuario_empresa); cualquier otro rol necesita membresía activa.
 */

import { ForbiddenException } from '@nestjs/common';
import { MultiEmpresaService } from './multi-empresa.service';
import { UserRole } from '../users/enums/user-role.enum';

const EMPRESA_A = 10;
const EMPRESA_B = 20;
const ADMIN_A   = 1;    // admin con membresía SOLO en la empresa A
const USER_B    = 3;    // usuario de la empresa B
const SUPER     = 99;   // super_admin, sin membresías

interface Membresia {
  userId: number;
  empresaId: number;
  isPrincipal?: boolean;
  role?: UserRole;
}

function buildService(membresias: Membresia[]) {
  const escrituras: any[] = [];

  const usuarioEmpresaRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const m = membresias.find(x =>
        (where.userId === undefined || x.userId === where.userId) &&
        (where.empresaId === undefined || x.empresaId === where.empresaId),
      );
      if (!m) return null;
      return {
        id:          m.userId * 1000 + m.empresaId,
        userId:      m.userId,
        empresaId:   m.empresaId,
        rol:         UserRole.ADMIN,
        isPrincipal: m.isPrincipal ?? false,
        user:        { id: m.userId, role: m.role ?? UserRole.VIEWER },
        empresa:     { id: m.empresaId, nombre: `Empresa ${m.empresaId}`, rnc: `RNC${m.empresaId}`, isActive: true },
      };
    }),
    find: jest.fn(async ({ where }: any) =>
      membresias
        .filter(x => x.userId === where.userId)
        .map(x => ({ empresaId: x.empresaId, userId: x.userId, rol: UserRole.ADMIN, user: { id: x.userId } })),
    ),
    update: jest.fn(async (id: any, patch: any) => { escrituras.push({ tabla: 'usuario_empresa', id, patch }); }),
    count:  jest.fn(async () => 0),
    create: jest.fn((x: any) => x),
    save:   jest.fn(async (x: any) => { escrituras.push({ tabla: 'usuario_empresa', patch: x }); return x; }),
    manager: { query: jest.fn(async () => []) },
  };

  const TODAS = [EMPRESA_A, EMPRESA_B, 30];
  const empresaRepo = {
    findOne: jest.fn(async ({ where }: any) => ({
      id: where.id, nombre: `Empresa ${where.id}`, rnc: `RNC${where.id}`, isActive: true,
    })),
    find: jest.fn(async ({ where }: any) => {
      // where.id es un FindOperator In(...) cuando se filtra por membresía
      const ids: number[] = where?.id?.value ?? TODAS;
      return ids.map(id => ({ id, nombre: `Empresa ${id}`, rnc: `RNC${id}`, isActive: true }));
    }),
    count: jest.fn(async () => TODAS.length),
    update: jest.fn(async (id: any, patch: any) => { escrituras.push({ tabla: 'empresa', id, patch }); }),
  };

  const usuarioRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const m = membresias.find(x => x.userId === where.id);
      return { id: where.id, isActive: true, role: m?.role ?? (where.id === SUPER ? UserRole.SUPER_ADMIN : UserRole.ADMIN) };
    }),
    update: jest.fn(async (id: any, patch: any) => { escrituras.push({ tabla: 'users', id, patch }); }),
  };

  const svc = new MultiEmpresaService(
    usuarioEmpresaRepo as any,
    empresaRepo as any,
    { findOne: jest.fn(async () => ({ id: 1, empresaId: EMPRESA_A })) } as any, // sucursalRepo
    usuarioRepo as any,
    {} as any,                                                                  // contabilidadSvc
    {} as any,                                                                  // emailSvc
    { query: jest.fn(async () => []) } as any,                                  // dataSource
    { del: jest.fn(), get: jest.fn(), set: jest.fn() } as any,                  // cacheManager
  );

  return { svc, escrituras, empresaRepo, usuarioEmpresaRepo };
}

/** Admin con membresía solo en la empresa A. */
const soloEnA = () => buildService([{ userId: ADMIN_A, empresaId: EMPRESA_A }, { userId: USER_B, empresaId: EMPRESA_B }]);

// ── Prueba 1: admin de A operando sobre la empresa B → 403 ───────────────────

describe('S-61.1 — un admin de la empresa A NO puede operar sobre la empresa B', () => {
  it('GET /:id (detalle) rechaza', async () => {
    const { svc } = soloEnA();
    await expect(svc.getEmpresaDetalle(EMPRESA_B, ADMIN_A, UserRole.ADMIN))
      .rejects.toThrow(ForbiddenException);
  });

  it('PATCH /:id (actualizar) rechaza y no escribe', async () => {
    const { svc, escrituras } = soloEnA();
    await expect(svc.updateEmpresa(EMPRESA_B, { nombre: 'Secuestrada' } as any, ADMIN_A, UserRole.ADMIN))
      .rejects.toThrow(ForbiddenException);
    expect(escrituras).toHaveLength(0);
  });

  it('GET /:empresaId/usuarios rechaza', async () => {
    const { svc } = soloEnA();
    await expect(svc.getUsuariosDeEmpresa(EMPRESA_B, ADMIN_A, UserRole.ADMIN))
      .rejects.toThrow(ForbiddenException);
  });

  it('POST /:empresaId/usuarios (auto-asignarse a empresa ajena) rechaza y no escribe', async () => {
    const { svc, escrituras } = soloEnA();
    await expect(
      svc.asignarUsuario(EMPRESA_B, { userId: ADMIN_A, rol: UserRole.ADMIN } as any, ADMIN_A, UserRole.ADMIN),
    ).rejects.toThrow(ForbiddenException);
    expect(escrituras).toHaveLength(0);
  });

  it('DELETE /:empresaId/usuarios/:userId rechaza y no escribe', async () => {
    const { svc, escrituras } = soloEnA();
    await expect(svc.removerUsuario(EMPRESA_B, USER_B, ADMIN_A, UserRole.ADMIN))
      .rejects.toThrow(ForbiddenException);
    expect(escrituras).toHaveLength(0);
  });

  it('PATCH /:empresaId/usuarios/:userId/sucursal rechaza', async () => {
    const { svc } = soloEnA();
    await expect(svc.asignarSucursalUsuario(EMPRESA_B, USER_B, 1, ADMIN_A, UserRole.ADMIN))
      .rejects.toThrow(ForbiddenException);
  });
});

// ── Prueba 2: el admin sigue gestionando SU empresa ──────────────────────────

describe('S-61.2 — el admin sigue gestionando su propia empresa', () => {
  it('GET /:id de su empresa funciona', async () => {
    const { svc } = soloEnA();
    await expect(svc.getEmpresaDetalle(EMPRESA_A, ADMIN_A, UserRole.ADMIN))
      .resolves.toMatchObject({ id: EMPRESA_A });
  });

  it('PATCH /:id de su empresa funciona', async () => {
    const { svc, empresaRepo } = soloEnA();
    await expect(svc.updateEmpresa(EMPRESA_A, { nombre: 'Nuevo' } as any, ADMIN_A, UserRole.ADMIN))
      .resolves.toBeDefined();
    expect(empresaRepo.update).toHaveBeenCalledWith(EMPRESA_A, { nombre: 'Nuevo' });
  });

  it('listar usuarios de su empresa funciona', async () => {
    const { svc } = soloEnA();
    await expect(svc.getUsuariosDeEmpresa(EMPRESA_A, ADMIN_A, UserRole.ADMIN)).resolves.toBeDefined();
  });

  it('remover un usuario de su empresa funciona', async () => {
    const { svc } = buildService([
      { userId: ADMIN_A, empresaId: EMPRESA_A },
      { userId: USER_B,  empresaId: EMPRESA_A },
    ]);
    await expect(svc.removerUsuario(EMPRESA_A, USER_B, ADMIN_A, UserRole.ADMIN)).resolves.toBeDefined();
  });

  it('asignar sucursal en su empresa funciona', async () => {
    const { svc } = buildService([
      { userId: ADMIN_A, empresaId: EMPRESA_A },
      { userId: USER_B,  empresaId: EMPRESA_A },
    ]);
    await expect(svc.asignarSucursalUsuario(EMPRESA_A, USER_B, 1, ADMIN_A, UserRole.ADMIN)).resolves.toBeDefined();
  });
});

// ── Prueba 3: super_admin conserva acceso global ─────────────────────────────

describe('S-61.3 — el super_admin opera sobre cualquier empresa', () => {
  it('detalle, actualización y listados de una empresa ajena funcionan', async () => {
    const { svc } = soloEnA();
    await expect(svc.getEmpresaDetalle(EMPRESA_B, SUPER, UserRole.SUPER_ADMIN)).resolves.toBeDefined();
    await expect(svc.updateEmpresa(EMPRESA_B, { nombre: 'X' } as any, SUPER, UserRole.SUPER_ADMIN)).resolves.toBeDefined();
    await expect(svc.getUsuariosDeEmpresa(EMPRESA_B, SUPER, UserRole.SUPER_ADMIN)).resolves.toBeDefined();
  });

  it('no necesita membresía para asignar usuarios', async () => {
    const { svc } = soloEnA();
    await expect(
      svc.asignarUsuario(EMPRESA_B, { userId: USER_B, rol: UserRole.CONTADOR } as any, SUPER, UserRole.SUPER_ADMIN),
    ).resolves.toBeDefined();
  });
});

// ── Prueba 4: POST /cambiar exige membresía real ─────────────────────────────

describe('S-61.4 — cambiar de empresa exige membresía real', () => {
  it('un admin sin membresía en la empresa destino es rechazado', async () => {
    const { svc } = buildService([{ userId: ADMIN_A, empresaId: EMPRESA_A, role: UserRole.ADMIN }]);
    await expect(svc.validarAccesoEmpresa(ADMIN_A, EMPRESA_B)).rejects.toThrow(ForbiddenException);
  });

  it('un admin CON membresía entra correctamente', async () => {
    const { svc } = buildService([{ userId: ADMIN_A, empresaId: EMPRESA_A, role: UserRole.ADMIN }]);
    await expect(svc.validarAccesoEmpresa(ADMIN_A, EMPRESA_A))
      .resolves.toMatchObject({ empresaId: EMPRESA_A });
  });

  it('el super_admin entra a cualquier empresa sin membresía', async () => {
    const { svc } = buildService([{ userId: SUPER, empresaId: -1, role: UserRole.SUPER_ADMIN }]);
    await expect(svc.validarAccesoEmpresa(SUPER, EMPRESA_B))
      .resolves.toMatchObject({ empresaId: EMPRESA_B, rol: UserRole.SUPER_ADMIN });
  });
});

// ── Prueba 5: el listado solo muestra las empresas propias ───────────────────

describe('S-61.5 — GET /multi-empresa solo lista las empresas del solicitante', () => {
  it('un admin normal ve solo las suyas', async () => {
    const { svc } = buildService([
      { userId: ADMIN_A, empresaId: EMPRESA_A },
      { userId: USER_B,  empresaId: EMPRESA_B },
    ]);
    const res = await svc.getTodasEmpresas(ADMIN_A, UserRole.ADMIN);
    expect(res.map((e: any) => e.id)).toEqual([EMPRESA_A]);
  });

  it('un admin sin membresías no ve ninguna (antes veía todas)', async () => {
    const { svc } = buildService([]);
    await expect(svc.getTodasEmpresas(ADMIN_A, UserRole.ADMIN)).resolves.toEqual([]);
  });

  it('el super_admin sigue viendo todas', async () => {
    const { svc } = buildService([{ userId: ADMIN_A, empresaId: EMPRESA_A }]);
    const res = await svc.getTodasEmpresas(SUPER, UserRole.SUPER_ADMIN);
    expect(res.length).toBeGreaterThan(1);
  });

  it('sin solicitante identificado, rechaza en vez de devolver todo', async () => {
    const { svc } = buildService([]);
    await expect(svc.getTodasEmpresas(undefined, UserRole.ADMIN)).rejects.toThrow(ForbiddenException);
  });
});

// ── Regresión: empresa-principal no filtra empresas ajenas ───────────────────

describe('S-61.6 — empresa-principal no cae a "la primera del sistema"', () => {
  it('sin membresías devuelve null, no la empresa de otro cliente', async () => {
    const { svc } = buildService([]);
    await expect(svc.getEmpresaPrincipal(ADMIN_A)).resolves.toBeNull();
  });

  it('sin principal explícita, cae a otra empresa DEL PROPIO usuario', async () => {
    const { svc } = buildService([{ userId: ADMIN_A, empresaId: EMPRESA_A }]);
    await expect(svc.getEmpresaPrincipal(ADMIN_A))
      .resolves.toMatchObject({ empresaId: EMPRESA_A });
  });
});
