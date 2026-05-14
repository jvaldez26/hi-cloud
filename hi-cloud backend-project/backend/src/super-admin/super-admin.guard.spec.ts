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

function buildGuard(): SuperAdminGuard {
  const jwtSvc = new JwtService({ secret: JWT_SECRET });
  const cfgSvc = { get: (key: string) => key === 'JWT_SECRET' ? JWT_SECRET : '' } as ConfigService;
  return new SuperAdminGuard(jwtSvc, cfgSvc);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = buildGuard();
  });

  // ── Casos que DEBEN pasar ──────────────────────────────────────────────────

  describe('Acceso permitido', () => {
    it('permite acceso a usuario con role super_admin', () => {
      const token = makeToken({ sub: 99, role: 'super_admin', email: 'sa@hicloud.com' });
      expect(() => guard.canActivate(makeContext(token))).not.toThrow();
      expect(guard.canActivate(makeContext(token))).toBe(true);
    });
  });

  // ── Casos que DEBEN rechazarse ─────────────────────────────────────────────

  describe('Acceso denegado — roles de cliente', () => {
    const rolesCliente = ['admin', 'contador', 'vendedor', 'viewer'];

    rolesCliente.forEach(role => {
      it(`rechaza con 403 al role "${role}"`, () => {
        const token = makeToken({ sub: 1, role, email: `${role}@test.com` });
        expect(() => guard.canActivate(makeContext(token))).toThrow(ForbiddenException);
      });
    });
  });

  describe('Acceso denegado — tokens inválidos', () => {
    it('rechaza con 401 cuando no hay token', () => {
      expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el header no empieza con Bearer', () => {
      const ctx = makeContext();
      (ctx.switchToHttp().getRequest() as any).headers.authorization = 'Basic sometoken';
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el token está firmado con otro secret', () => {
      const badJwt = new JwtService({ secret: 'otro-secret-falso' });
      const badToken = badJwt.sign({ sub: 99, role: 'super_admin' });
      expect(() => guard.canActivate(makeContext(badToken))).toThrow(UnauthorizedException);
    });

    it('rechaza con 401 cuando el token está expirado', () => {
      const jwt = new JwtService({ secret: JWT_SECRET });
      // Token con iat/exp en el pasado
      const expiredToken = jwt.sign({ sub: 99, role: 'super_admin' }, { expiresIn: '0s' });
      // Pequeña espera para asegurar que 0s ya expiró
      return new Promise<void>(resolve => setTimeout(() => {
        expect(() => guard.canActivate(makeContext(expiredToken))).toThrow(UnauthorizedException);
        resolve();
      }, 50));
    });

    it('rechaza con 401 cuando el token es un string malformado', () => {
      expect(() => guard.canActivate(makeContext('not.a.valid.jwt'))).toThrow(UnauthorizedException);
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
