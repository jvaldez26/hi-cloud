/**
 * AuthService.login() — integración con BloqueoAlertaService al bloquear
 * una cuenta por intentos fallidos.
 *
 * Cobertura pedida: 5 fallos bloquean 1 min y avisan al dueño de la
 * cuenta; una cuenta INEXISTENTE da la misma respuesta (nunca se avisa, no
 * hay a quién).
 *
 * Se instancia AuthService a mano, mismo criterio que login-username.spec.ts
 * y supervisor-rate-limit.spec.ts: usa el LoginAttemptsService REAL contra
 * un fake de CACHE_MANAGER, y sobreescribe los métodos downstream que no
 * son el contenido de esta tarea.
 */
import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { UserRole } from '../users/enums/user-role.enum';

const PASSWORD_REAL = 'ClaveReal123!';
let HASH_REAL: string;

beforeAll(async () => {
  HASH_REAL = await bcrypt.hash(PASSWORD_REAL, 4);
});

function fakeCacheManager() {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    get: jest.fn(async (key: string) => {
      const e = store.get(key);
      if (!e) return undefined;
      if (Date.now() > e.expiresAt) { store.delete(key); return undefined; }
      return e.value;
    }),
    set: jest.fn(async (key: string, value: unknown, ttl: number) => {
      store.set(key, { value, expiresAt: Date.now() + ttl });
    }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
  } as any;
}

function seedUsuario(overrides: any = {}) {
  return {
    id: 1, nombre: 'Carlos Peña', email: 'carlos@empresa.com', username: null,
    password: HASH_REAL, isActive: true, role: UserRole.ADMIN,
    emailVerifiedAt: new Date('2026-01-01'), twoFactorEnabled: false,
    accountStatus: 'activo', passwordConfigured: true, tourCompletado: false,
    ...overrides,
  };
}

function makeAuthService(usuarios: any[]) {
  const usersService = {
    findByEmailForAuth: jest.fn(async (email: string) =>
      usuarios.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null),
    findByUsernameForAuth: jest.fn(async () => null),
  };
  const loginAttempts = new LoginAttemptsService(fakeCacheManager());
  const bloqueoAlertaSvc = {
    avisarBloqueoLogin:       jest.fn().mockResolvedValue(undefined),
    avisarBloqueoGlobalLogin: jest.fn().mockResolvedValue(undefined),
  };

  const noop = {} as any;
  const svc = new AuthService(
    usersService as any, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop, noop,
    loginAttempts as any, noop, noop, noop, noop,
    bloqueoAlertaSvc as any,
  );

  (svc as any).getEmpresaPrincipal      = jest.fn().mockResolvedValue(undefined);
  (svc as any).getEffectiveMaxIntentos  = jest.fn().mockResolvedValue(5);
  // Downstream de un login EXITOSO — solo lo necesita el test de aislamiento
  // por IP (que sí llega a loguear bien desde la IP "limpia"); el resto de
  // los tests de este archivo nunca llega tan lejos.
  (svc as any).getEffectiveSessionMs    = jest.fn().mockResolvedValue(3_600_000);
  (svc as any).resolverContextoSucursal = jest.fn().mockResolvedValue({});
  (svc as any).buildToken               = jest.fn().mockReturnValue('fake-jwt');
  (svc as any).initNewSession           = jest.fn().mockResolvedValue('fake-session-token');
  (svc as any).ueRepository = {
    find: jest.fn().mockResolvedValue([{ empresaId: 1, isActive: true, empresa: { isActive: true } }]),
  };
  (svc as any).refreshTokenSvc = { verificarSesionActiva: jest.fn().mockResolvedValue(null) };
  (svc as any).alertaDispositivoSvc = { evaluarLogin: jest.fn() };

  return { svc, bloqueoAlertaSvc };
}

describe('AuthService.login() — aviso de bloqueo', () => {
  it('5 fallos bloquean la cuenta real y avisan al dueño (userId, email, nombre, intentos, duración, bloqueosEn24h, ip)', async () => {
    const usuario = seedUsuario();
    const { svc, bloqueoAlertaSvc } = makeAuthService([usuario]);

    for (let i = 0; i < 4; i++) {
      await expect(
        svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.9', 'Mozilla/5.0'),
      ).rejects.toThrow(UnauthorizedException);
    }
    expect(bloqueoAlertaSvc.avisarBloqueoLogin).not.toHaveBeenCalled();

    await expect(
      svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.9', 'Mozilla/5.0'),
    ).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ message: 'Demasiados intentos. Espera 1 minuto.' }) });

    expect(bloqueoAlertaSvc.avisarBloqueoLogin).toHaveBeenCalledTimes(1);
    expect(bloqueoAlertaSvc.avisarBloqueoLogin).toHaveBeenCalledWith({
      userId: 1, email: 'carlos@empresa.com', nombre: 'Carlos Peña',
      intentos: 5, duracionSegundos: 60, bloqueosEn24h: 1,
      ip: '10.0.0.9', userAgent: 'Mozilla/5.0',
    });
  });

  it('cuenta INEXISTENTE: misma respuesta y mismo bloqueo tras 5 intentos, pero NUNCA se avisa (no hay a quién)', async () => {
    const { svc, bloqueoAlertaSvc } = makeAuthService([]); // ningún usuario existe

    for (let i = 0; i < 4; i++) {
      await expect(
        svc.login({ identificador: 'nadie@existe.com', password: 'cualquiera' } as any, '10.0.0.9'),
      ).rejects.toThrow(UnauthorizedException);
    }

    await expect(
      svc.login({ identificador: 'nadie@existe.com', password: 'cualquiera' } as any, '10.0.0.9'),
    ).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ message: 'Demasiados intentos. Espera 1 minuto.' }) });

    expect(bloqueoAlertaSvc.avisarBloqueoLogin).not.toHaveBeenCalled();
  });

  it('bloqueado: HttpException, no UnauthorizedException — mismo tipo de error para cuenta real e inexistente', async () => {
    const usuario = seedUsuario();
    const { svc: svcReal } = makeAuthService([usuario]);
    const { svc: svcFalso } = makeAuthService([]);

    for (const svc of [svcReal, svcFalso]) {
      for (let i = 0; i < 5; i++) {
        await svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.9').catch(() => {});
      }
      await expect(
        svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.9'),
      ).rejects.toThrow(HttpException);
    }
  });

  it('fallos desde la IP A NO bloquean el login desde la IP B — cada (cuenta, IP) es su propia cubeta', async () => {
    const usuario = seedUsuario();
    const { svc } = makeAuthService([usuario]);

    for (let i = 0; i < 5; i++) {
      await svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.9').catch(() => {});
    }
    // La cuenta quedó bloqueada DESDE LA IP A...
    await expect(
      svc.login({ identificador: 'carlos@empresa.com', password: PASSWORD_REAL } as any, '10.0.0.9'),
    ).rejects.toThrow(HttpException);

    // ...pero desde la IP B, con la clave correcta, entra sin problema.
    const resultado = await svc.login({ identificador: 'carlos@empresa.com', password: PASSWORD_REAL } as any, '10.0.0.10');
    expect(resultado).toBeDefined();
  });

  it('20 fallos repartidos en IPs DISTINTAS (ataque distribuido) bloquean la cuenta aunque ninguna IP individual llegue a 5, y avisan con avisarBloqueoGlobalLogin', async () => {
    const usuario = seedUsuario();
    const { svc, bloqueoAlertaSvc } = makeAuthService([usuario]);

    // 20 IPs, 1 fallo cada una — ninguna cruza el umbral de nivel 1 (5).
    for (let i = 0; i < 19; i++) {
      await expect(
        svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, `10.1.0.${i}`),
      ).rejects.toThrow(UnauthorizedException);
    }
    expect(bloqueoAlertaSvc.avisarBloqueoLogin).not.toHaveBeenCalled();
    expect(bloqueoAlertaSvc.avisarBloqueoGlobalLogin).not.toHaveBeenCalled();

    // El fallo #20, desde una IP #20 que JAMÁS había fallado antes, dispara el nivel global.
    await expect(
      svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.1.0.19'),
    ).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ message: 'Demasiados intentos. Espera 15 minutos.' }) });

    expect(bloqueoAlertaSvc.avisarBloqueoGlobalLogin).toHaveBeenCalledTimes(1);
    expect(bloqueoAlertaSvc.avisarBloqueoGlobalLogin).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, email: 'carlos@empresa.com', intentos: 20, duracionSegundos: 900,
    }));
  });
});
