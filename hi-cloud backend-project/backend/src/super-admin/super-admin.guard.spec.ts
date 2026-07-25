/**
 * Tests del SuperAdminGuard — verifica que /admin/* rechaza correctamente
 * a usuarios no super_admin sin necesidad de base de datos.
 *
 * PROPÓSITO PREVENTIVO:
 * Si alguien añade un endpoint en SuperAdminController y por algún bug el guard
 * deja de funcionar a nivel de clase, estos tests fallan y alertan al equipo.
 */

import { SuperAdminGuard } from './super-admin.guard';
import { SuperAdminController } from './super-admin.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

const JWT_SECRET = 'test-secret-hicloud-2026';

// ── Helper para crear payloads JWT reales ─────────────────────────────────────

function makeToken(payload: Record<string, unknown>): string {
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } });
  return jwt.sign(payload);
}

function makeContext(token?: string): any {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, user: null }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
}

// ── Instancia del guard con secrets de prueba ─────────────────────────────────

function buildGuard(opts: { revocado?: boolean } = {}): SuperAdminGuard {
  const jwtSvc = new JwtService({ secret: JWT_SECRET });
  const cfgSvc = { get: (key: string) => key === 'JWT_SECRET' ? JWT_SECRET : '' } as ConfigService;
  // A-02: el guard consulta la blacklist de JTIs revocados (logout previo).
  // Este mock faltaba desde que se añadió el parámetro: el spec pasaba 3 args a
  // un constructor de 4 y todos los casos morían con TypeError sobre null en vez
  // de ejercitar el guard — el test de regresión llevaba tiempo sin proteger nada.
  const blacklistSvc = { isBlacklisted: async () => opts.revocado === true } as any;
  // DataSource = null → @Optional() activa fallback sin DB (solo JWT)
  return new SuperAdminGuard(jwtSvc, cfgSvc, blacklistSvc, null as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = buildGuard();
  });

  // ── Casos que DEBEN pasar ──────────────────────────────────────────────────

  describe('Acceso permitido', () => {
    it('permite acceso a usuario con role super_admin', async () => {
      const token = makeToken({ sub: 99, role: 'super_admin', email: 'sa@hicloud.com' });
      await expect(guard.canActivate(makeContext(token))).resolves.toBe(true);
    });
  });

  // ── Casos que DEBEN rechazarse ─────────────────────────────────────────────

  describe('Acceso denegado — roles de cliente', () => {
    const rolesCliente = ['admin', 'contador', 'vendedor', 'viewer'];

    rolesCliente.forEach(role => {
      it(`rechaza con 403 al role "${role}"`, async () => {
        const token = makeToken({ sub: 1, role, email: `${role}@test.com` });
        await expect(guard.canActivate(makeContext(token))).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Acceso denegado — tokens inválidos', () => {
    it('rechaza con 401 cuando no hay token', async () => {
      await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el header no empieza con Bearer', async () => {
      const ctx = makeContext();
      (ctx.switchToHttp().getRequest() as any).headers.authorization = 'Basic sometoken';
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el token está firmado con otro secret', async () => {
      const badJwt = new JwtService({ secret: 'otro-secret-falso' });
      const badToken = badJwt.sign({ sub: 99, role: 'super_admin' });
      await expect(guard.canActivate(makeContext(badToken))).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el token está expirado', async () => {
      const jwt = new JwtService({ secret: JWT_SECRET });
      const expiredToken = jwt.sign({ sub: 99, role: 'super_admin' }, { expiresIn: '0s' });
      await new Promise(r => setTimeout(r, 50));
      await expect(guard.canActivate(makeContext(expiredToken))).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el token es un string malformado', async () => {
      await expect(guard.canActivate(makeContext('not.a.valid.jwt'))).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza con 401 un token de super_admin cuyo JTI fue revocado (logout)', async () => {
      const revocado = buildGuard({ revocado: true });
      const token = makeToken({ sub: 99, role: 'super_admin', jti: 'jti-revocado' });
      await expect(revocado.canActivate(makeContext(token))).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Test de regresión: guard está aplicado a nivel de clase ───────────────

  describe('Estructura del controller — guard a nivel de clase (no por endpoint)', () => {
    it('SuperAdminController tiene @UseGuards(SuperAdminGuard) a nivel de clase', () => {
      // NestJS almacena los guards en metadata '__guards__' con la key del decorador
      const classGuards: unknown[] = Reflect.getMetadata('__guards__', SuperAdminController) ?? [];
      expect(classGuards).toContain(SuperAdminGuard);
    });

    it('ningún método individual de SuperAdminController tiene @UseGuards propio', () => {
      // Si un método tiene guards propios puede sobreescribir (o ignorar) el de clase.
      // Este test falla si alguien añade @UseGuards en un endpoint específico sin querer.
      const proto = SuperAdminController.prototype;
      const methodNames = Object.getOwnPropertyNames(proto).filter(m => m !== 'constructor');

      const methodsConGuardPropio = methodNames.filter(method => {
        const guards: unknown[] = Reflect.getMetadata('__guards__', (proto as any)[method]) ?? [];
        return guards.length > 0;
      });

      expect(methodsConGuardPropio).toHaveLength(0);
    });
  });
});
