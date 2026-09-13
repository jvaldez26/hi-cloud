/**
 * AuthService.login() — login por email O por username, en el mismo campo
 * (`identificador`). Cobertura de la tarea "login por username":
 *
 * 1. Login con email existente / con username existente — ambos caminos
 *    exitosos, mismo resultado.
 * 2. Contraseña incorrecta por email / por username — mismo mensaje
 *    genérico, misma clave de LoginAttemptsService (el email real de la
 *    cuenta, nunca el identificador tal cual se escribió — evita que
 *    alternar "juan@x.com"/"juan" abra dos cubetas de bloqueo distintas).
 * 3. Username inexistente / email inexistente — mismo mensaje genérico,
 *    bcrypt.compare() corre en ambos casos contra el hash dummy (tiempo de
 *    respuesta constante).
 * 4. Usuario existente SIN username (regresión) — sigue entrando por email
 *    exactamente igual que antes de esta tarea.
 *
 * Se instancia AuthService a mano con fakes mínimos (no
 * Test.createTestingModule) y se sobreescriben sus propios métodos de
 * construcción de sesión/token (getEmpresaPrincipal, buildToken,
 * initNewSession, etc.) — son privados en TypeScript pero no en runtime, y
 * este spec no busca volver a probar el armado del JWT ni de la empresa
 * activa (ya cubierto en otros specs); busca aislar la rama email/username
 * y el tiempo constante que son el contenido real de esta tarea.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/enums/user-role.enum';

const PASSWORD_REAL = 'ClaveReal123!';
let HASH_REAL: string;

beforeAll(async () => {
  HASH_REAL = await bcrypt.hash(PASSWORD_REAL, 4); // costo bajo — el spec no valida el costo, solo el compare
});

function makeAuthService(usuarios: any[]) {
  const usersService = {
    findByEmailForAuth: jest.fn(async (email: string) =>
      usuarios.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    ),
    findByUsernameForAuth: jest.fn(async (username: string) =>
      usuarios.find(u => u.username?.toLowerCase() === username.toLowerCase()) ?? null,
    ),
  };

  const bloqueos = new Map<string, number>();
  const intentos = new Map<string, number>();
  const loginAttempts = {
    isBlocked:  jest.fn(async (id: string, ip: string) => ({ blocked: (bloqueos.get(`${id}:${ip}`) ?? 0) > Date.now() })),
    increment:  jest.fn(async (id: string, ip: string) => {
      const k = `${id}:${ip}`; const n = (intentos.get(k) ?? 0) + 1; intentos.set(k, n); return n;
    }),
    block:      jest.fn(async () => 0),
    reset:      jest.fn(async () => {}),
    formatTime: jest.fn((s: number) => `${s}s`),
  };

  const refreshTokenSvc = { verificarSesionActiva: jest.fn().mockResolvedValue(null) };

  const noop = {} as any;
  const svc = new AuthService(
    usersService as any, noop, noop, noop, refreshTokenSvc as any, noop, noop,
    noop, noop, noop, noop, noop, noop, noop, noop,
  );

  // Downstream del login exitoso — no es lo que este spec prueba.
  (svc as any).getEmpresaPrincipal   = jest.fn().mockResolvedValue(undefined);
  (svc as any).getEffectiveMaxIntentos = jest.fn().mockResolvedValue(5);
  (svc as any).getEffectiveSessionMs   = jest.fn().mockResolvedValue(3_600_000);
  (svc as any).resolverContextoSucursal = jest.fn().mockResolvedValue({});
  (svc as any).buildToken            = jest.fn().mockReturnValue('fake-jwt');
  (svc as any).initNewSession        = jest.fn().mockResolvedValue('fake-session-token');
  (svc as any).ueRepository          = { find: jest.fn().mockResolvedValue([]) };

  return { svc, usersService, loginAttempts, refreshTokenSvc };
}

function seedUsuario(overrides: any = {}) {
  return {
    id: 1, nombre: 'Carlos Peña', email: 'carlos@empresa.com', username: 'carlospena',
    password: HASH_REAL, isActive: true, role: UserRole.SUPER_ADMIN, // super_admin: se salta el gate de "empresa activa" — no es lo que este spec prueba
    emailVerifiedAt: new Date('2026-01-01'), twoFactorEnabled: false,
    accountStatus: 'activo', passwordConfigured: true, tourCompletado: false,
    ...overrides,
  };
}

// Nota: `loginAttempts` se inyecta manualmente porque el constructor de
// AuthService no lo expone en la posición usada arriba con `noop` — se
// asigna directo a la instancia, igual que el resto de métodos sobreescritos.
function withLoginAttempts(built: ReturnType<typeof makeAuthService>) {
  (built.svc as any).loginAttempts = built.loginAttempts;
  return built;
}

describe('AuthService.login — email vs username', () => {
  it('login exitoso con email existente', async () => {
    const usuario = seedUsuario();
    const { svc } = withLoginAttempts(makeAuthService([usuario]));

    const r: any = await svc.login({ identificador: 'carlos@empresa.com', password: PASSWORD_REAL } as any, '127.0.0.1');

    expect(r.user.id).toBe(1);
    expect(r.user.username).toBe('carlospena');
    expect(r.accessToken).toBe('fake-jwt');
  });

  it('login exitoso con username existente', async () => {
    const usuario = seedUsuario();
    const { svc } = withLoginAttempts(makeAuthService([usuario]));

    const r: any = await svc.login({ identificador: 'carlospena', password: PASSWORD_REAL } as any, '127.0.0.1');

    expect(r.user.id).toBe(1);
    expect(r.user.email).toBe('carlos@empresa.com');
    expect(r.accessToken).toBe('fake-jwt');
  });

  it('usuario existente SIN username sigue entrando por email (regresión)', async () => {
    const usuario = seedUsuario({ username: null });
    const { svc } = withLoginAttempts(makeAuthService([usuario]));

    const r: any = await svc.login({ identificador: 'carlos@empresa.com', password: PASSWORD_REAL } as any, '127.0.0.1');

    expect(r.user.id).toBe(1);
    expect(r.user.username).toBeNull();
  });

  it('contraseña incorrecta por email: mensaje genérico, cuenta el intento contra el email real', async () => {
    const usuario = seedUsuario();
    const { svc, loginAttempts } = withLoginAttempts(makeAuthService([usuario]));

    await expect(
      svc.login({ identificador: 'carlos@empresa.com', password: 'mala' } as any, '10.0.0.1'),
    ).rejects.toThrow(UnauthorizedException);

    expect(loginAttempts.increment).toHaveBeenCalledWith('carlos@empresa.com', '10.0.0.1');
  });

  it('contraseña incorrecta por username: mismo mensaje, misma cubeta que por email (el email real, no "carlospena")', async () => {
    const usuario = seedUsuario();
    const { svc, loginAttempts } = withLoginAttempts(makeAuthService([usuario]));

    await expect(
      svc.login({ identificador: 'carlospena', password: 'mala' } as any, '10.0.0.1'),
    ).rejects.toThrow(UnauthorizedException);

    // Clave = email real de la cuenta, NO el username escrito — así alternar
    // "carlos@empresa.com"/"carlospena" contra la MISMA cuenta no abre dos
    // cubetas de bloqueo distintas para esquivarlo.
    expect(loginAttempts.increment).toHaveBeenCalledWith('carlos@empresa.com', '10.0.0.1');
  });

  it('username inexistente: mensaje genérico, cuenta el intento contra el identificador tal cual (no hay cuenta que resolver)', async () => {
    const { svc, loginAttempts } = withLoginAttempts(makeAuthService([]));

    await expect(
      svc.login({ identificador: 'nadie_existe', password: 'cualquiera' } as any, '10.0.0.1'),
    ).rejects.toThrow(UnauthorizedException);

    expect(loginAttempts.increment).toHaveBeenCalledWith('nadie_existe', '10.0.0.1');
  });

  it('email inexistente: mensaje genérico idéntico al de username inexistente', async () => {
    const { svc } = withLoginAttempts(makeAuthService([]));

    await expect(
      svc.login({ identificador: 'nadie@existe.com', password: 'cualquiera' } as any, '10.0.0.1'),
    ).rejects.toThrow('Correo/usuario o contraseña incorrectos.');
  });

  it('tiempo de respuesta constante: bcrypt.compare corre exista o no la cuenta', async () => {
    // bcrypt es un binding nativo — jest.spyOn(bcrypt, 'compare') falla con
    // "Cannot redefine property" (propiedad no configurable), así que se
    // verifica sobre el fuente en vez de instrumentar la llamada real: mismo
    // criterio que sesion-unica.spec.ts usa para no arrastrar dependencias
    // pesadas por una guarda de pocas líneas.
    const src   = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8');
    const cuerpo = src.slice(src.indexOf('async login(dto: LoginDto'), src.indexOf('// 3. Credenciales inválidas'));

    // La rama "no existe/inactivo" debe comparar contra DUMMY_PASSWORD_HASH,
    // nunca saltarse bcrypt.compare — eso es justo el oráculo de tiempo.
    expect(cuerpo).toMatch(/await bcrypt\.compare\(dto\.password,\s*user\.password\)/);
    expect(cuerpo).toMatch(/await bcrypt\.compare\(dto\.password,\s*DUMMY_PASSWORD_HASH\)/);
    // Y las dos ramas deben ser mutuamente excluyentes de un mismo condicional
    // (el ternario `user?.isActive ? ... : ...`), no dos ifs independientes
    // donde alguien podría añadir un tercer camino que se salte ambos.
    expect(cuerpo).toMatch(/user\?\.\s*isActive\s*\n?\s*\?\s*await bcrypt\.compare/);
  });
});
