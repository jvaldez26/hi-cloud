/**
 * S-65 — Tests de regresión: 2FA obligatoria para el Super Admin (enrollment
 * forzado) y escape del HTML en los correos del panel.
 *
 * Diseño del enforcement: el guard rechaza /admin/* mientras la cuenta no tenga
 * segundo factor, PERO el login y /auth/2fa/* (que va con JwtAuthGuard, no con
 * este guard) siguen funcionando. Así la 2FA es obligatoria para operar sin que
 * nadie pueda quedarse fuera del panel.
 */

import { SuperAdminGuard } from './super-admin.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { escapeHtml } from '../common/utils/escape-html.util';

const JWT_SECRET = 'test-secret-hicloud-2026';

function makeToken(payload: Record<string, unknown>): string {
  return new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }).sign(payload);
}

function makeContext(token: string): any {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` }, user: null }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
}

/** Guard con DataSource simulado: controla lo que devuelve la fila de users. */
function buildGuard(dbUser: { role: string; isActive: boolean; twoFactorEnabled: boolean } | null) {
  const jwtSvc = new JwtService({ secret: JWT_SECRET });
  const cfgSvc = { get: (k: string) => (k === 'JWT_SECRET' ? JWT_SECRET : '') } as ConfigService;
  const blacklistSvc = { isBlacklisted: async () => false } as any;
  const ds = { query: jest.fn(async () => (dbUser ? [dbUser] : [])) } as any;
  return new SuperAdminGuard(jwtSvc, cfgSvc, blacklistSvc, ds);
}

const TOKEN_SA = () => makeToken({ sub: 99, role: 'super_admin', email: 'sa@hicloud.com' });

describe('S-65 — 2FA obligatoria en el panel Super Admin', () => {
  it('bloquea /admin/* si el super_admin NO tiene 2FA, con código accionable', async () => {
    const guard = buildGuard({ role: 'super_admin', isActive: true, twoFactorEnabled: false });

    await expect(guard.canActivate(makeContext(TOKEN_SA()))).rejects.toThrow(ForbiddenException);

    // El frontend distingue este caso por el code para mostrar el enrollment
    await guard.canActivate(makeContext(TOKEN_SA())).catch((err) => {
      expect(err.getResponse()).toMatchObject({ code: 'SUPER_ADMIN_2FA_REQUERIDA' });
    });
  });

  it('permite el acceso cuando la 2FA está activa', async () => {
    const guard = buildGuard({ role: 'super_admin', isActive: true, twoFactorEnabled: true });
    await expect(guard.canActivate(makeContext(TOKEN_SA()))).resolves.toBe(true);
  });

  it('consulta twoFactorEnabled en la BD, no confía en el token', async () => {
    const guard = buildGuard({ role: 'super_admin', isActive: true, twoFactorEnabled: false });
    // Aunque el token afirme lo contrario, manda la BD
    const token = makeToken({ sub: 99, role: 'super_admin', twoFactorEnabled: true });
    await expect(guard.canActivate(makeContext(token))).rejects.toThrow(ForbiddenException);
  });

  it('el rechazo por rol sigue teniendo prioridad sobre el de 2FA', async () => {
    const guard = buildGuard({ role: 'admin', isActive: true, twoFactorEnabled: true });
    await guard.canActivate(makeContext(makeToken({ sub: 1, role: 'super_admin' }))).catch((err) => {
      expect(err.getResponse()).not.toMatchObject({ code: 'SUPER_ADMIN_2FA_REQUERIDA' });
    });
  });
});

describe('S-65 — escapeHtml en los correos del panel', () => {
  it('neutraliza etiquetas en nombres elegidos por el cliente', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('Ferretería <b>El Martillo</b>'))
      .toBe('Ferretería &lt;b&gt;El Martillo&lt;/b&gt;');
  });

  it('escapa comillas y ampersands', () => {
    expect(escapeHtml('Pérez & Asociados')).toBe('Pérez &amp; Asociados');
    expect(escapeHtml(`a"b'c`)).toBe('a&quot;b&#39;c');
  });

  it('tolera null y undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('no altera texto normal', () => {
    expect(escapeHtml('Impago reiterado - 3 meses')).toBe('Impago reiterado - 3 meses');
  });
});
