/**
 * Autorización de supervisor por tarjeta escaneada —
 * AuthService.verificarSupervisor(..., tarjeta) y el flujo de dos pasos
 * "Tarjeta + PIN" (ver SupervisorTarjetasModule).
 *
 * Mismo criterio que supervisor-log.spec.ts / supervisor-rate-limit.spec.ts:
 * AuthService a mano con fakes mínimos, sin Test.createTestingModule. El
 * fake de SupervisorTarjetasService simula `verificarCodigo`/`obtenerNivel`
 * (la verdad de esa lógica — formato, hash, "una activa por empresa" — ya
 * la prueba supervisor-tarjetas.service.integration.spec.ts contra Postgres
 * real). Lo que se prueba AQUÍ es cómo AuthService reacciona a cada
 * resultado posible de esa verificación: autoriza, pide PIN, cuenta para el
 * bloqueo, o notifica al dueño real de la tarjeta.
 */
import * as bcrypt from 'bcrypt';
import { HttpException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PREFIJO_TARJETA } from '../supervisor-tarjetas/tarjeta-codigo.util';

const EMPRESA = 7;
const CAJERO_ID = 1;
const SUPERVISOR_ID = 2;
const CODIGO_VALIDO = PREFIJO_TARJETA + 'A'.repeat(26);
const PIN = '4321';
let HASH_PIN: string;

beforeAll(async () => {
  HASH_PIN = await bcrypt.hash(PIN, 4);
});

function makeAuthService(nivel: 'solo_tarjeta' | 'tarjeta_pin' = 'solo_tarjeta') {
  const posLog: any[] = [];
  let nextId = 1;

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    // Lookup de PIN/contraseña del supervisor — solo se usa en el paso 2 de Tarjeta+PIN
    if (sql.includes('SELECT u.id, u.nombre, u.email, u.password, u.role')) {
      const [ref, empresaId] = params;
      if (ref === SUPERVISOR_ID && empresaId === EMPRESA) {
        return [{ id: SUPERVISOR_ID, nombre: 'Ana Supervisor', email: 'ana@empresa.com', password: HASH_PIN, role: 'admin', pinSupervisor: HASH_PIN }];
      }
      return [];
    }
    if (sql.includes('INSERT INTO pos_supervisor_log')) {
      const row = { id: nextId++ };
      posLog.push({ params });
      return [row];
    }
    if (sql.includes('SELECT modo FROM supervisor_politicas')) return [];
    if (sql.includes('SELECT nombre FROM users')) return [{ nombre: 'Carlos Cajero' }];
    if (sql.includes('SELECT nombre FROM empresa')) return [{ nombre: 'Empresa Demo' }];
    if (sql.includes('SELECT nombre FROM sucursales')) return [];
    throw new Error(`Query no reconocida por el fake: ${sql}`);
  });

  const supervisorAttempts = {
    isBlocked:      jest.fn().mockResolvedValue({ blocked: false }),
    registrarFallo: jest.fn().mockResolvedValue({ intentos: 1, bloqueado: false }),
    reset:          jest.fn().mockResolvedValue(undefined),
  };

  const supervisorTarjetas = {
    verificarCodigo: jest.fn(),
    obtenerNivel:    jest.fn().mockResolvedValue(nivel),
  };

  const bloqueoAlertaSvc = { avisarBloqueoSupervisor: jest.fn().mockResolvedValue(undefined) };

  const noop = {} as any;
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop,
    noop,
    { query } as any,
    noop, supervisorAttempts as any, noop, noop,
    noop, bloqueoAlertaSvc as any,
    supervisorTarjetas as any,
  );

  return { svc, posLog, query, supervisorAttempts, supervisorTarjetas, bloqueoAlertaSvc };
}

describe('AuthService.verificarSupervisor — por tarjeta (nivel solo_tarjeta)', () => {
  it('escanear una tarjeta válida autoriza directamente, sin PIN', async () => {
    const { svc, supervisorTarjetas } = makeAuthService('solo_tarjeta');
    supervisorTarjetas.verificarCodigo.mockResolvedValue({ ok: true, userId: SUPERVISOR_ID, nombre: 'Ana Supervisor', email: 'ana@empresa.com', role: 'admin' });

    const r: any = await svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, 'Modificar precio', undefined, null, '1.2.3.4', 'agente', undefined, CODIGO_VALIDO);

    expect(r.ok).toBe(true);
    expect(r.metodo).toBe('tarjeta');
    expect(r.nombre).toBe('Ana Supervisor');
    expect(supervisorTarjetas.verificarCodigo).toHaveBeenCalledWith(CODIGO_VALIDO, EMPRESA);
  });

  it('un escaneo sin forma de tarjeta no cuenta como intento real', async () => {
    const { svc, supervisorAttempts } = makeAuthService();
    await expect(svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, 'NO-ES-UNA-TARJETA'))
      .rejects.toThrow(BadRequestException);
    expect(supervisorAttempts.registrarFallo).not.toHaveBeenCalled();
  });

  it('una tarjeta revocada no autoriza y cuenta contra el dueño real', async () => {
    const { svc, supervisorAttempts, supervisorTarjetas } = makeAuthService();
    supervisorTarjetas.verificarCodigo.mockResolvedValue({
      ok: false, motivo: 'revocada', ownerId: SUPERVISOR_ID, ownerNombre: 'Ana Supervisor', ownerEmail: 'ana@empresa.com',
    });

    await expect(svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO))
      .rejects.toThrow(UnauthorizedException);

    expect(supervisorAttempts.isBlocked).toHaveBeenCalledWith(EMPRESA, CAJERO_ID, SUPERVISOR_ID);
    expect(supervisorAttempts.registrarFallo).toHaveBeenCalledWith(EMPRESA, CAJERO_ID, SUPERVISOR_ID);
  });

  it('una tarjeta de otra empresa no autoriza', async () => {
    const { svc, supervisorTarjetas } = makeAuthService();
    supervisorTarjetas.verificarCodigo.mockResolvedValue({
      ok: false, motivo: 'otra_empresa', ownerId: SUPERVISOR_ID, ownerNombre: 'Ana Supervisor', ownerEmail: 'ana@empresa.com',
    });
    await expect(svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO))
      .rejects.toThrow(UnauthorizedException);
  });

  it('un código que no coincide con ninguna tarjeta cuenta contra una clave sintética (no un usuario real)', async () => {
    const { svc, supervisorAttempts } = makeAuthService();
    const fake2 = makeAuthService();
    fake2.supervisorTarjetas.verificarCodigo.mockResolvedValue({ ok: false, motivo: 'no_existe' });

    await expect(fake2.svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO))
      .rejects.toThrow(UnauthorizedException);

    const [, , refUsado] = fake2.supervisorAttempts.registrarFallo.mock.calls[0];
    expect(typeof refUsado).toBe('string');
    expect(refUsado.startsWith('tarjeta:')).toBe(true);
    expect(fake2.bloqueoAlertaSvc.avisarBloqueoSupervisor).not.toHaveBeenCalled();
  });

  it('los fallos de tarjeta, al cruzar el umbral, bloquean con 429 y notifican al dueño real', async () => {
    const { svc, supervisorAttempts, supervisorTarjetas, bloqueoAlertaSvc } = makeAuthService();
    supervisorAttempts.registrarFallo.mockResolvedValue({ intentos: 5, bloqueado: true, duracionSegundos: 300, bloqueosEn24h: 1 });
    supervisorTarjetas.verificarCodigo.mockResolvedValue({
      ok: false, motivo: 'revocada', ownerId: SUPERVISOR_ID, ownerNombre: 'Ana Supervisor', ownerEmail: 'ana@empresa.com',
    });

    await expect(svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO))
      .rejects.toThrow(HttpException);

    expect(bloqueoAlertaSvc.avisarBloqueoSupervisor).toHaveBeenCalledTimes(1);
    expect(bloqueoAlertaSvc.avisarBloqueoSupervisor.mock.calls[0][0]).toMatchObject({ supervisorUserId: SUPERVISOR_ID });
  });

  it('un segundo escaneo contra una tarjeta ya bloqueada responde 429 y nunca autoriza', async () => {
    const { svc, supervisorAttempts, supervisorTarjetas } = makeAuthService();
    // La clave de bloqueo se resuelve DESDE el resultado de verificarCodigo
    // (ver el comentario de verificarSupervisorPorTarjeta) — por eso se
    // consulta primero, incluso para decidir si ya está bloqueado.
    supervisorTarjetas.verificarCodigo.mockResolvedValue({ ok: true, userId: SUPERVISOR_ID, nombre: 'Ana Supervisor', email: 'ana@empresa.com', role: 'admin' });
    supervisorAttempts.isBlocked.mockResolvedValue({ blocked: true, remainingSeconds: 120, bloqueosEn24h: 1 });

    await expect(svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO))
      .rejects.toThrow(HttpException);
    expect(supervisorAttempts.isBlocked).toHaveBeenCalledWith(EMPRESA, CAJERO_ID, SUPERVISOR_ID);
  });
});

describe('AuthService.verificarSupervisor — nivel "tarjeta_pin" (dos pasos)', () => {
  it('paso 1: escanear una tarjeta válida NO autoriza todavía — pide PIN', async () => {
    const { svc, supervisorTarjetas } = makeAuthService('tarjeta_pin');
    supervisorTarjetas.verificarCodigo.mockResolvedValue({ ok: true, userId: SUPERVISOR_ID, nombre: 'Ana Supervisor', email: 'ana@empresa.com', role: 'admin' });

    const r: any = await svc.verificarSupervisor('', '', CAJERO_ID, EMPRESA, undefined, undefined, null, undefined, undefined, undefined, CODIGO_VALIDO);

    expect(r.ok).toBe(false);
    expect(r.requierePin).toBe(true);
    expect(r.supervisorId).toBe(SUPERVISOR_ID);
  });

  it('paso 2: el PIN correcto para ese supervisorId (resuelto por la tarjeta) autoriza — flujo ya existente, sin tarjeta', async () => {
    const { svc } = makeAuthService('tarjeta_pin');

    const r: any = await svc.verificarSupervisor(SUPERVISOR_ID, PIN, CAJERO_ID, EMPRESA, 'Modificar precio');

    expect(r.ok).toBe(true);
    expect(r.metodo).toBe('pin');
  });

  it('paso 2: un PIN incorrecto no autoriza', async () => {
    const { svc } = makeAuthService('tarjeta_pin');
    await expect(svc.verificarSupervisor(SUPERVISOR_ID, 'pin-equivocado', CAJERO_ID, EMPRESA))
      .rejects.toThrow(UnauthorizedException);
  });
});
