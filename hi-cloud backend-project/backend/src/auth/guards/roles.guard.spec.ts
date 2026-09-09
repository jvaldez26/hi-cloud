/**
 * Tests de RolesGuard — verifica que la autorización usa el rol POR EMPRESA
 * (usuario_empresa.rol), no el rol global de `users`.
 *
 * PROPÓSITO PREVENTIVO:
 * `users.role` solo se mantiene sincronizado con la empresa PRINCIPAL de cada
 * usuario (ver `cambiarRolUsuario` en multi-empresa.service.ts) — un usuario
 * admin en una empresa secundaria pero contador en la principal quedaba
 * bloqueado con 403 "Forbidden resource" en cualquier mutación de esa empresa
 * secundaria (caso real: PATCH /fidelidad/programa). Al revés, un admin
 * global solo viewer en una empresa secundaria pasaba como admin ahí — fuga
 * de privilegios silenciosa. Si alguien reintroduce `dbRole` en el chequeo
 * final en vez de `effRole`, estos tests fallan.
 */

import { RolesGuard, membresiaCacheKey } from './roles.guard';
import { UserRole } from '../../users/enums/user-role.enum';
import { UnauthorizedException } from '@nestjs/common';

// ── Cache en memoria (sustituye a CACHE_MANAGER) ──────────────────────────────

function makeCacheManager() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => { store.set(key, value); },
    del: async (key: string) => { store.delete(key); },
  };
}

// ── DataSource fake — responde según la tabla que consulte el SQL ────────────

function makeDataSource(opts: {
  userRole?: string;
  userRoleVersion?: number;
  userActive?: boolean;
  membresia?: { activo: boolean; rol?: string };
}) {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM users')) {
        if (opts.userActive === false) return [];
        return [{ role: opts.userRole ?? UserRole.ADMIN, roleVersion: opts.userRoleVersion ?? 1 }];
      }
      if (sql.includes('FROM usuario_empresa')) {
        const m = opts.membresia ?? { activo: true };
        return m.activo ? [{ rol: m.rol }] : [];
      }
      throw new Error(`Query inesperada en el mock: ${sql}`);
    },
  } as any;
}

function makeReflector(requiredRoles: UserRole[] | undefined) {
  return { getAllAndOverride: () => requiredRoles } as any;
}

function makeContext(user: any): any {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
}

describe('RolesGuard', () => {
  describe('Rol por empresa (usuario_empresa) manda sobre el rol global (users)', () => {
    it('permite la mutación cuando el rol de la EMPRESA es admin aunque el global sea contador', async () => {
      // Caso real: licjeancarlosvaldezg@gmail.com — admin en empresa 57, contador global
      const ds = makeDataSource({
        userRole: UserRole.CONTADOR,
        membresia: { activo: true, rol: UserRole.ADMIN },
      });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 58, empresaId: 57, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
    });

    it('rechaza la mutación cuando el rol de la EMPRESA no alcanza aunque el global sea admin', async () => {
      // Reverso: admin global, pero solo viewer en esta empresa puntual — no debe
      // heredar el privilegio del rol global.
      const ds = makeDataSource({
        userRole: UserRole.ADMIN,
        membresia: { activo: true, rol: UserRole.VIEWER },
      });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 1, empresaId: 57, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).resolves.toBe(false);
    });

    it('usa el rol de caché de membresía en la segunda llamada (no repite el SELECT)', async () => {
      const ds = makeDataSource({ userRole: UserRole.CONTADOR, membresia: { activo: true, rol: UserRole.ADMIN } });
      const cache = makeCacheManager();
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, cache);
      const user = { id: 58, empresaId: 57, roleVersion: 1 };

      await guard.canActivate(makeContext(user));
      expect(await cache.get(membresiaCacheKey(58, 57))).toEqual({ activo: true, rol: UserRole.ADMIN });

      // Segunda vez con un ds que rompe si lo consultan por usuario_empresa —
      // debe resolverse solo con la caché.
      const dsQueBotaria = makeDataSource({ userRole: UserRole.CONTADOR });
      dsQueBotaria.query = async (sql: string) => {
        if (sql.includes('FROM usuario_empresa')) throw new Error('no debía volver a consultar usuario_empresa');
        if (sql.includes('FROM users')) return [{ role: UserRole.CONTADOR, roleVersion: 1 }];
        throw new Error('inesperado');
      };
      const guard2 = new RolesGuard(makeReflector([UserRole.ADMIN]), dsQueBotaria, cache);
      await expect(guard2.canActivate(makeContext(user))).resolves.toBe(true);
    });
  });

  describe('super_admin', () => {
    it('pasa cualquier @Roles() sin importar su rol en la empresa activa', async () => {
      const ds = makeDataSource({
        userRole: UserRole.SUPER_ADMIN,
        membresia: { activo: true, rol: UserRole.VIEWER },
      });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 99, empresaId: 57, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
    });
  });

  describe('Sin empresaId en el JWT (rutas fuera de un tenant)', () => {
    it('autoriza contra el rol global cuando no hay empresa en contexto', async () => {
      const ds = makeDataSource({ userRole: UserRole.ADMIN });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 1, empresaId: null, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
    });

    it('rechaza contra el rol global cuando no alcanza y no hay empresa en contexto', async () => {
      const ds = makeDataSource({ userRole: UserRole.CONTADOR });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 1, empresaId: null, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).resolves.toBe(false);
    });
  });

  describe('Membresía inactiva', () => {
    it('rechaza con 401 "Sin acceso a esta empresa" si la fila usuario_empresa no está activa', async () => {
      const ds = makeDataSource({ userRole: UserRole.ADMIN, membresia: { activo: false } });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 1, empresaId: 57, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Casos base', () => {
    it('permite sin consultar nada si la ruta no tiene @Roles()', async () => {
      const ds = { query: async () => { throw new Error('no debía consultar la BD'); } } as any;
      const guard = new RolesGuard(makeReflector(undefined), ds, makeCacheManager());
      await expect(guard.canActivate(makeContext({ id: 1 }))).resolves.toBe(true);
    });

    it('rechaza si no hay usuario en el request', async () => {
      const ds = makeDataSource({});
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      await expect(guard.canActivate(makeContext(null))).resolves.toBe(false);
    });

    it('fuerza re-login (401 ROLE_CHANGED) si el roleVersion del JWT quedó desactualizado', async () => {
      const ds = makeDataSource({ userRole: UserRole.ADMIN, userRoleVersion: 2 });
      const guard = new RolesGuard(makeReflector([UserRole.ADMIN]), ds, makeCacheManager());
      const user = { id: 1, empresaId: null, roleVersion: 1 };

      await expect(guard.canActivate(makeContext(user))).rejects.toThrow(UnauthorizedException);
    });
  });
});
