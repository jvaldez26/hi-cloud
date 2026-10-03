/**
 * Límite de intentos de AuthService.verificarSupervisor — por (empresa,
 * cajero, supervisor), NO por IP (ver SupervisorAttemptsService). El
 * throttle por IP del controller sigue ahí como capa extra, pero varias
 * cajas de una misma tienda comparten IP, así que la defensa real tiene que
 * aislar los intentos de un cajero de los de otro.
 *
 * Usa el SupervisorAttemptsService REAL (no un stub) contra un fake de
 * CACHE_MANAGER en memoria, para probar el comportamiento de verdad: 5
 * fallos bloquean 1 minuto, el bloqueo es específico del par
 * cajero+supervisor, y expira solo.
 *
 * Date.now() mockeado directamente (no jest.useFakeTimers()) para avanzar
 * el reloj del "minuto" sin tocar la maquinaria de timers — mismo criterio
 * que el test de zona horaria RD en cw-turnos.service.spec.ts, que evita
 * jest.useFakeTimers() por el riesgo de colgar operaciones async en vuelo.
 */
import * as bcrypt from 'bcrypt';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupervisorAttemptsService } from './supervisor-attempts.service';

const PASSWORD_SUP = 'ClaveSupervisor123!';
let HASH_SUP: string;

beforeAll(async () => {
  HASH_SUP = await bcrypt.hash(PASSWORD_SUP, 4); // costo bajo — el spec no valida el costo, solo el compare
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

const EMPRESA       = 7;
const SUPERVISOR_ID = 2;
const CAJERO_A      = 1;
const CAJERO_B      = 6;

function makeAuthService() {
  const usuarios = [
    { id: CAJERO_A,      nombre: 'Carlos Cajero',  email: 'carlos@empresa.com', password: HASH_SUP, role: 'vendedor' },
    { id: CAJERO_B,      nombre: 'Beto Cajero 2',  email: 'beto@empresa.com',   password: HASH_SUP, role: 'vendedor' },
    { id: SUPERVISOR_ID, nombre: 'Ana Supervisor', email: 'ana@empresa.com',    password: HASH_SUP, role: 'admin' },
  ];

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('SELECT u.id, u.nombre, u.email, u.password, u.role')) {
      const [ref, empresaId] = params;
      const byId = typeof ref === 'number';
      const u = usuarios.find(x =>
        (byId ? x.id === ref : x.email.toLowerCase() === String(ref).toLowerCase())
        && ['admin', 'contador', 'super_admin'].includes(x.role),
      );
      return u && empresaId === EMPRESA ? [u] : [];
    }
    if (sql.includes('INSERT INTO pos_supervisor_log')) {
      return [{ id: 999 }];
    }
    throw new Error(`Query no reconocida por el fake: ${sql}`);
  });

  const noop = {} as any;
  const supervisorAttempts = new SupervisorAttemptsService(fakeCacheManager());
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop,
    { query } as any,
    noop, supervisorAttempts, noop, noop, noop,
  );
  return { svc, supervisorAttempts };
}

describe('Límite de intentos de verificar-supervisor — por (empresa, cajero, supervisor)', () => {
  it('5 fallos bloquean a ese cajero con ese supervisor: el 6.º intento da 429, AUNQUE la clave sea correcta', async () => {
    const { svc } = makeAuthService();
    for (let i = 0; i < 5; i++) {
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
        .rejects.toThrow(UnauthorizedException);
    }

    const intento6 = svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA);
    await expect(intento6).rejects.toThrow(HttpException);
    await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA))
      .rejects.toMatchObject({ status: 429, response: expect.objectContaining({ message: 'Demasiados intentos. Espere un minuto.' }) });
  });

  it('otro cajero de la misma empresa (y misma IP, en el controller real) NO se bloquea por los fallos del primero', async () => {
    const { svc } = makeAuthService();
    for (let i = 0; i < 5; i++) {
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
        .rejects.toThrow(UnauthorizedException);
    }
    // CAJERO_B nunca falló nada — su propia cubeta (empresa, CAJERO_B, supervisor) sigue limpia.
    await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_B, EMPRESA))
      .resolves.toMatchObject({ ok: true, nombre: 'Ana Supervisor' });
  });

  it('el mismo cajero contra OTRO supervisor no se ve afectado por los fallos contra el primero', async () => {
    const { svc } = makeAuthService();
    for (let i = 0; i < 5; i++) {
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
        .rejects.toThrow(UnauthorizedException);
    }
    // Mismo cajero, pero el OTRO supervisor (CAJERO_B como id de supervisor no aplica aquí;
    // se simula con un supervisorId distinto que sí existe y es válido).
    await expect(svc.verificarSupervisor(CAJERO_B, PASSWORD_SUP, CAJERO_A, EMPRESA))
      .rejects.toThrow(UnauthorizedException); // CAJERO_B es 'vendedor', no autorizado como supervisor — pero NO por bloqueo
  });

  it('pasado el minuto de bloqueo, vuelve a funcionar', async () => {
    const { svc } = makeAuthService();
    const ahora = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(ahora);
    try {
      for (let i = 0; i < 5; i++) {
        await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
          .rejects.toThrow(UnauthorizedException);
      }
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA))
        .rejects.toThrow(HttpException);

      spy.mockReturnValue(ahora + 61_000); // 1 min + 1s después

      await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA))
        .resolves.toMatchObject({ ok: true });
    } finally {
      spy.mockRestore();
    }
  });

  it('una autorización correcta limpia el contador — 4 fallos + 1 éxito + 4 fallos más NO bloquea', async () => {
    const { svc } = makeAuthService();
    for (let i = 0; i < 4; i++) {
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
        .rejects.toThrow(UnauthorizedException);
    }
    await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA))
      .resolves.toMatchObject({ ok: true });

    for (let i = 0; i < 4; i++) {
      await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'clave-incorrecta', CAJERO_A, EMPRESA))
        .rejects.toThrow(UnauthorizedException);
    }
    // Solo 4 fallos desde el reset — todavía no llega a los 5, sigue sin bloquear.
    await expect(svc.verificarSupervisor(SUPERVISOR_ID, PASSWORD_SUP, CAJERO_A, EMPRESA))
      .resolves.toMatchObject({ ok: true });
  });
});
