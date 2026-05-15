/**
 * Tests de regresión para TenantMiddleware — extracción de JWT.
 *
 * BUG HISTÓRICO (2026-05-15): S-23 movió el JWT a httpOnly cookie.
 * TenantMiddleware solo leía el Authorization header → usuarios veían
 * sus datos vacíos aunque existían en BD. Commit: ca27e12
 *
 * Estos tests garantizan que el bug no vuelva a ocurrir.
 */

import { TenantMiddleware } from './tenant.middleware';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';

// ── JWT de prueba ─────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-tenant-middleware-spec';

function makeJwt(payload: Record<string, unknown>): string {
  const jwtSvc = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } });
  return jwtSvc.sign(payload);
}

const JWT_EMPRESA_2  = makeJwt({ sub: 3, role: 'admin', empresaId: 2 });
const JWT_EMPRESA_99 = makeJwt({ sub: 99, role: 'admin', empresaId: 99 });
const JWT_SIN_EMP    = makeJwt({ sub: 5, role: 'viewer' }); // sin empresaId

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeMocks() {
  const tenantSvc = {
    setEmpresaId:  jest.fn(),
    setUserId:     jest.fn(),
    setRolEmpresa: jest.fn(),
  } as any;

  const jwtSvc = new JwtService({ secret: JWT_SECRET });
  const cfgSvc = { get: (k: string) => k === 'JWT_SECRET' ? JWT_SECRET : '' } as any;

  const ueRepo     = { findOne: jest.fn().mockResolvedValue({ rol: 'admin' }) } as any;
  const empresaRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 2, isActive: true }),
  } as any;

  const middleware = new TenantMiddleware(tenantSvc, jwtSvc, cfgSvc, ueRepo, empresaRepo);

  const res  = {} as any;
  const next = jest.fn();

  return { middleware, tenantSvc, ueRepo, empresaRepo, res, next };
}

function makeReq(opts: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  path?: string;
}) {
  return {
    path:    opts.path ?? '/facturas',
    cookies: opts.cookies ?? {},
    headers: opts.headers ?? {},
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TenantMiddleware — extracción de JWT (regresión S-23)', () => {

  it('[1] extrae empresaId desde cookie httpOnly (caso principal)', async () => {
    const { middleware, tenantSvc, res, next } = makeMocks();

    const req = makeReq({ cookies: { access_token: JWT_EMPRESA_2 } });
    await middleware.use(req, res, next);

    expect(tenantSvc.setEmpresaId).toHaveBeenCalledWith(2);
    expect(next).toHaveBeenCalled();
  });

  it('[2] extrae empresaId desde Authorization Bearer (compat API)', async () => {
    const { middleware, tenantSvc, res, next } = makeMocks();

    const req = makeReq({
      cookies: {},
      headers: { authorization: `Bearer ${JWT_EMPRESA_2}` },
    });
    await middleware.use(req, res, next);

    expect(tenantSvc.setEmpresaId).toHaveBeenCalledWith(2);
    expect(next).toHaveBeenCalled();
  });

  it('[3] cookie tiene prioridad sobre header cuando ambos presentes', async () => {
    const { middleware, tenantSvc, empresaRepo, res, next } = makeMocks();
    // Empresa 99 en cookie, empresa 2 en header — debe ganar la cookie
    empresaRepo.findOne.mockResolvedValue({ id: 99, isActive: true });

    const req = makeReq({
      cookies: { access_token: JWT_EMPRESA_99 },
      headers: { authorization: `Bearer ${JWT_EMPRESA_2}` },
    });
    await middleware.use(req, res, next);

    expect(tenantSvc.setEmpresaId).toHaveBeenCalledWith(99); // Cookie gana
    expect(next).toHaveBeenCalled();
  });

  it('[4] sin JWT → next() sin setear empresaId (ruta no autenticada)', async () => {
    const { middleware, tenantSvc, res, next } = makeMocks();

    const req = makeReq({ cookies: {}, headers: {} });
    await middleware.use(req, res, next);

    expect(tenantSvc.setEmpresaId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('[5] JWT sin empresaId → next() sin setear empresaId (usuario sin empresa)', async () => {
    const { middleware, tenantSvc, res, next } = makeMocks();

    const req = makeReq({ cookies: { access_token: JWT_SIN_EMP } });
    await middleware.use(req, res, next);

    expect(tenantSvc.setEmpresaId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('[6] rutas públicas (/auth/*) saltan validación aunque haya JWT', async () => {
    const { middleware, tenantSvc, res, next } = makeMocks();

    const req = makeReq({
      path:    '/auth/login',
      cookies: { access_token: JWT_EMPRESA_2 },
    });
    await middleware.use(req, res, next);

    // En rutas públicas no se procesa el JWT
    expect(tenantSvc.setEmpresaId).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('[7] JWT con empresa inactiva → ForbiddenException (no silencioso)', async () => {
    const { middleware, empresaRepo, res, next } = makeMocks();
    empresaRepo.findOne.mockResolvedValue({ id: 2, isActive: false });

    const req = makeReq({ cookies: { access_token: JWT_EMPRESA_2 } });
    await middleware.use(req, res, next);

    // next se llama con el error ForbiddenException
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

