/**
 * Soporte de acceso del super admin — "el cliente reporta que no puede
 * entrar y el panel no tiene forma de ayudarlo".
 *
 * Cubre:
 *  - diagnosticoUsuario: junta correo verificado, estado de cuenta,
 *    contraseña configurada, bloqueo por intentos fallidos, empresas
 *    activas/suspendidas y sesión activa en un solo lugar.
 *  - Las 4 acciones de "sí me equivoqué, ayúdame" (recuperar password,
 *    reenviar verificación, marcar verificado a mano, limpiar bloqueo)
 *    quedan auditadas y nunca tocan/leen la contraseña ni el 2FA.
 *  - liberarUsername: solo libera, nunca reasigna, exige confirmación.
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

const ACTOR = { id: 99, nombre: 'Ana Super', role: 'super_admin' };

function buildService(opts: {
  usuario?: any;
  empresas?: any[];
  bloqueo?: { blocked: boolean; remainingSeconds?: number; ip?: string };
} = {}) {
  const queries: { sql: string; params: any[] }[] = [];

  const usuarioDefault = {
    id: 20, nombre: 'Cliente Uno', email: 'cliente@empresa.com', username: 'clienteuno',
    role: 'vendedor', provider: 'LOCAL', passwordConfigured: true,
    accountStatus: 'activo', emailVerifiedAt: null, isActive: true,
    sesionActiva: false, sessionCreatedAt: null,
  };
  const usuario = opts.usuario === undefined ? usuarioDefault : opts.usuario;

  const ds = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM usuario_empresa')) return opts.empresas ?? [];
      if (sql.trimStart().toUpperCase().startsWith('SELECT')) {
        return usuario === null ? [] : [usuario];
      }
      return [];
    }),
  };

  const authService = {
    forgotPassword: jest.fn(async () => ({ mensaje: 'ok' })),
    resendVerificationEmail: jest.fn(async () => ({ mensaje: 'ok' })),
  };

  const loginAttemptsSvc = {
    estado: jest.fn(async () => opts.bloqueo ?? { blocked: false }),
    resetPorIdentificador: jest.fn(async () => ({ ip: '10.0.0.5' })),
    formatTime: jest.fn((s: number) => `${s} segundos`),
  };

  const auditoriaSvc = { registrar: jest.fn(async () => undefined) };

  const svc = new SuperAdminService(
    ds as any,
    { enviar: jest.fn() } as any,
    authService as any,
    loginAttemptsSvc as any,
    auditoriaSvc as any,
  );

  return { svc, queries, authService, loginAttemptsSvc, auditoriaSvc };
}

describe('diagnosticoUsuario', () => {
  it('junta correo, estado de cuenta, contraseña, bloqueo, empresas y sesión', async () => {
    const { svc, loginAttemptsSvc } = buildService({
      empresas: [{ id: 1, nombre: 'Empresa Activa', activa: true }, { id: 2, nombre: 'Empresa Suspendida', activa: false }],
      bloqueo: { blocked: true, remainingSeconds: 300, ip: '10.0.0.1' },
    });

    const r = await svc.diagnosticoUsuario(20);

    expect(r.correoVerificado).toBe(false);
    expect(r.accountStatus).toBe('activo');
    expect(r.passwordConfigured).toBe(true);
    expect(r.bloqueo.bloqueado).toBe(true);
    expect(r.bloqueo.tiempoRestante).toBe('300 segundos');
    expect(r.sesionActiva).toBe(false);
    expect(r.algunaEmpresaActiva).toBe(true);
    expect(r.empresas).toHaveLength(2);
    expect(loginAttemptsSvc.estado).toHaveBeenCalledWith('cliente@empresa.com');
  });

  it('no evalúa "alguna empresa activa" para un super_admin', async () => {
    const { svc } = buildService({
      usuario: { id: 1, nombre: 'SA', email: 'sa@hicloud.com', username: null, role: 'super_admin', provider: 'LOCAL', passwordConfigured: true, accountStatus: 'activo', emailVerifiedAt: new Date(), isActive: true, sesionActiva: true, sessionCreatedAt: new Date() },
      empresas: [],
    });
    const r = await svc.diagnosticoUsuario(1);
    expect(r.algunaEmpresaActiva).toBeNull();
  });

  it('lanza NotFoundException si el usuario no existe', async () => {
    const { svc } = buildService({ usuario: null });
    await expect(svc.diagnosticoUsuario(999)).rejects.toThrow(NotFoundException);
  });

  it('nunca toca password, resetPasswordToken ni 2FA', async () => {
    const { svc, queries } = buildService({});
    await svc.diagnosticoUsuario(20);
    const sql = queries.map(q => q.sql).join('\n');
    expect(sql).not.toMatch(/password[^C]|resetPasswordToken|twoFactorSecret|twoFactorBackupCodes/i);
  });
});

describe('enviarRecuperacionPassword', () => {
  it('delega en AuthService.forgotPassword y audita', async () => {
    const { svc, authService, auditoriaSvc } = buildService({});
    const r = await svc.enviarRecuperacionPassword(20, ACTOR, '10.0.0.9');

    expect(authService.forgotPassword).toHaveBeenCalledWith('cliente@empresa.com');
    expect(r.ok).toBe(true);
    expect(auditoriaSvc.registrar).toHaveBeenCalledTimes(1);
    const call = auditoriaSvc.registrar.mock.calls[0][0];
    expect(call.userId).toBe(99);
    expect(call.entidadId).toBe('20');
    expect(call.ipAddress).toBe('10.0.0.9');
  });

  it('lanza NotFoundException si el usuario no existe', async () => {
    const { svc } = buildService({ usuario: null });
    await expect(svc.enviarRecuperacionPassword(999, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe('reenviarVerificacion', () => {
  it('delega en AuthService.resendVerificationEmail y audita', async () => {
    const { svc, authService, auditoriaSvc } = buildService({});
    const r = await svc.reenviarVerificacion(20, ACTOR, '10.0.0.9');
    expect(authService.resendVerificationEmail).toHaveBeenCalledWith({ userId: 20 });
    expect(r.ok).toBe(true);
    expect(auditoriaSvc.registrar).toHaveBeenCalledTimes(1);
  });

  it('rechaza si el correo ya está verificado', async () => {
    const { svc, authService } = buildService({
      usuario: { id: 20, nombre: 'X', email: 'x@x.com', emailVerifiedAt: new Date() },
    });
    await expect(svc.reenviarVerificacion(20, ACTOR)).rejects.toThrow(BadRequestException);
    expect(authService.resendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('marcarCorreoVerificado', () => {
  it('exige confirmar=true — salta un control de seguridad', async () => {
    const { svc } = buildService({});
    await expect(svc.marcarCorreoVerificado(20, false, ACTOR)).rejects.toThrow(BadRequestException);
  });

  it('con confirmación, marca verificado y audita en IMPORTANTE', async () => {
    const { svc, queries, auditoriaSvc } = buildService({});
    const r = await svc.marcarCorreoVerificado(20, true, ACTOR, '10.0.0.9');
    expect(r.ok).toBe(true);
    expect(queries.some(q => q.sql.includes('UPDATE users SET "emailVerifiedAt"'))).toBe(true);
    const call = auditoriaSvc.registrar.mock.calls[0][0];
    expect(call.nivel).toBe('IMPORTANTE');
  });

  it('rechaza si ya estaba verificado', async () => {
    const { svc } = buildService({
      usuario: { id: 20, nombre: 'X', email: 'x@x.com', emailVerifiedAt: new Date() },
    });
    await expect(svc.marcarCorreoVerificado(20, true, ACTOR)).rejects.toThrow(BadRequestException);
  });
});

describe('limpiarBloqueoLogin', () => {
  it('limpia el bloqueo por email y audita', async () => {
    const { svc, loginAttemptsSvc, auditoriaSvc } = buildService({});
    const r = await svc.limpiarBloqueoLogin(20, ACTOR, '10.0.0.9');
    expect(loginAttemptsSvc.resetPorIdentificador).toHaveBeenCalledWith('cliente@empresa.com');
    expect(r.ok).toBe(true);
    expect(auditoriaSvc.registrar).toHaveBeenCalledTimes(1);
  });
});

describe('liberarUsername', () => {
  it('exige confirmar=true', async () => {
    const { svc } = buildService({});
    await expect(svc.liberarUsername(20, false, ACTOR)).rejects.toThrow(BadRequestException);
  });

  it('libera el username (NULL) sin reasignarlo, y audita', async () => {
    const { svc, queries, auditoriaSvc } = buildService({});
    const r = await svc.liberarUsername(20, true, ACTOR, '10.0.0.9');
    expect(r.ok).toBe(true);
    const upd = queries.find(q => q.sql.includes('UPDATE users SET username'));
    expect(upd).toBeDefined();
    expect(upd!.sql).not.toMatch(/username\s*=\s*\$2/); // solo NULL, nunca reasigna a otro valor
    const call = auditoriaSvc.registrar.mock.calls[0][0];
    expect(call.valorAnterior).toBe('clienteuno');
  });

  it('rechaza si el usuario no tiene username', async () => {
    const { svc } = buildService({
      usuario: { id: 20, nombre: 'X', email: 'x@x.com', username: null },
    });
    await expect(svc.liberarUsername(20, true, ACTOR)).rejects.toThrow(BadRequestException);
  });
});
