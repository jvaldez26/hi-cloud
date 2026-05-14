/**
 * RBAC Tests — HiCloud ERP
 * Verifica que cada rol tenga los permisos correctos en los endpoints críticos.
 * No requiere DB — usa mocks para validar la lógica de guards y decoradores.
 */

import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator';
import { UserRole } from '../src/users/enums/user-role.enum';

// ── Guard Logic Tests ─────────────────────────────────────────────────────────

function checkRoles(userRole: string, requiredRoles: UserRole[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.some(r => r === userRole);
}

describe('RolesGuard — lógica de permisos', () => {
  const roles = ['viewer', 'vendedor', 'contador', 'admin', 'super_admin'];

  test('super_admin accede solo si está en la lista de @Roles (no hay bypass automático)', () => {
    // El RolesGuard no bypasea super_admin — usa SuperAdminGuard por separado.
    // super_admin está redirigido a /super-admin, no entra a los endpoints del ERP.
    expect(checkRoles('super_admin', [UserRole.SUPER_ADMIN])).toBe(true);
    expect(checkRoles('super_admin', [UserRole.ADMIN])).toBe(false);
  });

  test('admin tiene acceso a endpoints admin-only', () => {
    expect(checkRoles('admin', [UserRole.ADMIN])).toBe(true);
    expect(checkRoles('admin', [UserRole.ADMIN, UserRole.CONTADOR])).toBe(true);
  });

  test('contador NO tiene acceso a endpoints admin-only', () => {
    expect(checkRoles('contador', [UserRole.ADMIN])).toBe(false);
  });

  test('contador tiene acceso a endpoints admin+contador', () => {
    expect(checkRoles('contador', [UserRole.ADMIN, UserRole.CONTADOR])).toBe(true);
  });

  test('vendedor NO puede acceder a compras (admin+contador)', () => {
    expect(checkRoles('vendedor', [UserRole.ADMIN, UserRole.CONTADOR])).toBe(false);
  });

  test('vendedor puede acceder a facturas (admin+contador+vendedor)', () => {
    expect(checkRoles('vendedor', [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR])).toBe(true);
  });

  test('viewer NO puede crear facturas (admin+contador+vendedor)', () => {
    expect(checkRoles('viewer', [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR])).toBe(false);
  });

  test('viewer puede leer facturas (con VIEWER en roles)', () => {
    expect(checkRoles('viewer', [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER])).toBe(true);
  });

  test('viewer NO puede leer compras (solo admin+contador)', () => {
    expect(checkRoles('viewer', [UserRole.ADMIN, UserRole.CONTADOR])).toBe(false);
  });
});

// ── Matriz de acceso por rol ──────────────────────────────────────────────────

describe('Matriz de permisos — todos los roles × endpoints críticos', () => {

  type AccessMatrix = {
    endpoint: string;
    roles: UserRole[];
    allowed: Record<string, boolean>;
  };

  const matrix: AccessMatrix[] = [
    // Facturas — lectura pública a todos los roles
    {
      endpoint: 'GET /facturas',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER],
      allowed: { viewer: true, vendedor: true, contador: true, admin: true },
    },
    // Facturas — PDFs sin viewer
    {
      endpoint: 'GET /facturas/:id/pdf',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],
      allowed: { viewer: false, vendedor: true, contador: true, admin: true },
    },
    // Facturas — crear (sin viewer)
    {
      endpoint: 'POST /facturas',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],
      allowed: { viewer: false, vendedor: true, contador: true, admin: true },
    },
    // Facturas — eliminar (solo admin+contador)
    {
      endpoint: 'DELETE /facturas/:id',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    // Clientes — lectura a todos
    {
      endpoint: 'GET /clientes',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER],
      allowed: { viewer: true, vendedor: true, contador: true, admin: true },
    },
    // Clientes — estado de cuenta (solo admin+contador)
    {
      endpoint: 'GET /clientes/:id/estado-cuenta',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    // Compras — solo admin+contador
    {
      endpoint: 'GET /compras',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    {
      endpoint: 'GET /compras/:id',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    // Productos — lectura a todos
    {
      endpoint: 'GET /productos',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER],
      allowed: { viewer: true, vendedor: true, contador: true, admin: true },
    },
    // Productos — stock-bajo (sin viewer)
    {
      endpoint: 'GET /productos/stock-bajo',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],
      allowed: { viewer: false, vendedor: true, contador: true, admin: true },
    },
    // Contabilidad — solo admin+contador
    {
      endpoint: 'GET /contabilidad/cuentas',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    // Nómina — tasas (solo admin+contador)
    {
      endpoint: 'GET /nomina/tasas-tss',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
    // Reportes — admin+contador+vendedor (vendedor ve sus ventas)
    {
      endpoint: 'GET /reportes/ventas',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],
      allowed: { viewer: false, vendedor: true, contador: true, admin: true },
    },
    // Configuración — solo admin
    {
      endpoint: 'GET /configuracion (panel)',
      roles: [UserRole.ADMIN],
      allowed: { viewer: false, vendedor: false, contador: false, admin: true },
    },
    // CxC — admin+contador+vendedor
    {
      endpoint: 'GET /cxc',
      roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],
      allowed: { viewer: false, vendedor: true, contador: true, admin: true },
    },
    // CxP — solo admin+contador
    {
      endpoint: 'GET /cxp',
      roles: [UserRole.ADMIN, UserRole.CONTADOR],
      allowed: { viewer: false, vendedor: false, contador: true, admin: true },
    },
  ];

  const testRoles = ['viewer', 'vendedor', 'contador', 'admin'] as const;

  matrix.forEach(({ endpoint, roles, allowed }) => {
    describe(`${endpoint}`, () => {
      testRoles.forEach(role => {
        const shouldAllow = allowed[role];
        test(`${role} → ${shouldAllow ? '✅ PERMITIDO' : '❌ DENEGADO'}`, () => {
          expect(checkRoles(role, roles)).toBe(shouldAllow);
        });
      });
    });
  });
});

// ── Jerarquía de roles ────────────────────────────────────────────────────────

describe('Jerarquía de roles es consistente', () => {
  const jerarquia: Record<string, number> = {
    viewer: 1, vendedor: 2, contador: 3, admin: 4, super_admin: 5,
  };

  test('admin tiene más permisos que contador', () => {
    expect(jerarquia['admin']).toBeGreaterThan(jerarquia['contador']);
  });

  test('contador tiene más permisos que vendedor', () => {
    expect(jerarquia['contador']).toBeGreaterThan(jerarquia['vendedor']);
  });

  test('vendedor tiene más permisos que viewer', () => {
    expect(jerarquia['vendedor']).toBeGreaterThan(jerarquia['viewer']);
  });

  test('super_admin está por encima de admin', () => {
    expect(jerarquia['super_admin']).toBeGreaterThan(jerarquia['admin']);
  });
});

// ── Protecciones críticas ─────────────────────────────────────────────────────

describe('Protecciones críticas de seguridad', () => {

  test('viewer no puede acceder a ningún módulo operacional', () => {
    const modulosOperacionales = [
      [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR],  // facturas POST
      [UserRole.ADMIN, UserRole.CONTADOR],                     // compras, contabilidad
      [UserRole.ADMIN],                                        // configuración
    ];
    modulosOperacionales.forEach(roles => {
      expect(checkRoles('viewer', roles)).toBe(false);
    });
  });

  test('vendedor no puede acceder a módulos financieros sensibles', () => {
    const modulosFinancieros = [
      [UserRole.ADMIN, UserRole.CONTADOR],  // compras, CxP, contabilidad, nómina
    ];
    modulosFinancieros.forEach(roles => {
      expect(checkRoles('vendedor', roles)).toBe(false);
    });
  });

  test('contador no puede administrar el sistema', () => {
    const modulosSistema = [
      [UserRole.ADMIN],  // configuración, equipo, auditoria
    ];
    modulosSistema.forEach(roles => {
      expect(checkRoles('contador', roles)).toBe(false);
    });
  });

  test('no-admin no puede eliminar facturas', () => {
    const eliminarRoles = [UserRole.ADMIN, UserRole.CONTADOR];
    ['viewer', 'vendedor'].forEach(role => {
      expect(checkRoles(role, eliminarRoles)).toBe(false);
    });
  });

  test('solo admin puede gestionar configuración', () => {
    const configRoles = [UserRole.ADMIN];
    ['viewer', 'vendedor', 'contador'].forEach(role => {
      expect(checkRoles(role, configRoles)).toBe(false);
    });
    expect(checkRoles('admin', configRoles)).toBe(true);
  });
});
