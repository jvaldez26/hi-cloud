/**
 * PIN de autorización de supervisor — alternativa corta (4-6 dígitos) a la
 * contraseña completa, SOLO para el modal de "Autorización de Supervisor"
 * del POS. Mientras un supervisor no configure su PIN, ese campo sigue
 * aceptando su contraseña normal (fallback sin fecha límite de migración);
 * en cuanto lo configura, el PIN pasa a ser el único credential válido ahí.
 *
 * Mismo criterio que supervisor-log.spec.ts: AuthService instanciado a mano
 * con un fake de dataSource.query que enruta por substrings distintivos —
 * no reimplementa Postgres, solo lo mínimo para que cada método vea filas
 * coherentes. estadoPinSupervisor/setPinSupervisor usan dataSource.query
 * (no el userRepository) a propósito, para poder testearlos con el mismo
 * fake que el resto del dominio de supervisor.
 */
import * as bcrypt from 'bcrypt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

const PASSWORD = 'ClaveCuenta123!';
let HASH_PASSWORD: string;

beforeAll(async () => {
  HASH_PASSWORD = await bcrypt.hash(PASSWORD, 4); // costo bajo — el spec no valida el costo, solo el compare
});

function makeAuthService() {
  const usuarios = [
    { id: 1, nombre: 'Carlos Cajero',  email: 'carlos@empresa.com', password: HASH_PASSWORD, role: 'vendedor', isActive: true, pinSupervisor: null as string | null },
    { id: 2, nombre: 'Ana Supervisor', email: 'ana@empresa.com',    password: HASH_PASSWORD, role: 'admin',    isActive: true, pinSupervisor: null as string | null },
  ];
  const posLog: any[] = [];
  let nextId = 1;

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    // verificarSupervisor: lookup de credenciales
    if (sql.includes('SELECT u.id, u.nombre, u.email, u.password, u.role')) {
      const [ref, empresaId] = params;
      const byId = typeof ref === 'number';
      const u = usuarios.find(x =>
        (byId ? x.id === ref : x.email.toLowerCase() === String(ref).toLowerCase())
        && ['admin', 'contador', 'super_admin'].includes(x.role),
      );
      return u && empresaId === EMPRESA ? [u] : [];
    }

    // verificarSupervisor: insert de activación
    if (sql.includes('INSERT INTO pos_supervisor_log')) {
      const [empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId, action, detail] = params;
      const row = { id: nextId++, empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId, action, detail, sessionId: null };
      posLog.push(row);
      return [{ id: row.id }];
    }

    // estadoPinSupervisor
    if (sql.includes('SELECT ("pinSupervisor" IS NOT NULL) AS "tienePin" FROM users')) {
      const [id] = params;
      const u = usuarios.find(x => x.id === id);
      return u ? [{ tienePin: !!u.pinSupervisor }] : [];
    }

    // setPinSupervisor: lookup
    if (sql.includes('SELECT id, password, "isActive" FROM users')) {
      const [id] = params;
      const u = usuarios.find(x => x.id === id);
      return u ? [u] : [];
    }

    // setPinSupervisor: persistencia
    if (sql.includes('UPDATE users SET "pinSupervisor" = $1')) {
      const [hashed, id] = params;
      const u = usuarios.find(x => x.id === id);
      if (u) u.pinSupervisor = hashed;
      return [];
    }

    // listarSupervisores
    if (sql.includes('SELECT u.id, u.nombre, u.role, (u."pinSupervisor" IS NOT NULL) AS "tienePin"')) {
      const [empresaId] = params;
      return empresaId === EMPRESA
        ? usuarios
            .filter(u => ['admin', 'contador', 'super_admin'].includes(u.role))
            .map(u => ({ id: u.id, nombre: u.nombre, role: u.role, tienePin: !!u.pinSupervisor }))
        : [];
    }

    throw new Error(`Query no reconocida por el fake: ${sql}`);
  });

  const noop = {} as any;
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop,
    { query } as any,
    noop, noop, noop, noop,
  );

  return { svc, usuarios, posLog, query };
}

const EMPRESA = 7;

describe('AuthService — PIN de autorización de supervisor', () => {
  describe('estadoPinSupervisor', () => {
    it('sin PIN configurado: tienePin=false', async () => {
      const { svc } = makeAuthService();
      await expect(svc.estadoPinSupervisor(2)).resolves.toEqual({ tienePin: false });
    });

    it('con PIN configurado: tienePin=true', async () => {
      const { svc, usuarios } = makeAuthService();
      usuarios[1].pinSupervisor = 'algún-hash';
      await expect(svc.estadoPinSupervisor(2)).resolves.toEqual({ tienePin: true });
    });
  });

  describe('setPinSupervisor', () => {
    it('contraseña actual incorrecta: rechaza y no guarda nada', async () => {
      const { svc, usuarios } = makeAuthService();
      await expect(svc.setPinSupervisor(2, 'clave-mala', '1234')).rejects.toThrow(BadRequestException);
      expect(usuarios[1].pinSupervisor).toBeNull();
    });

    it('contraseña actual correcta: guarda el PIN hasheado (no en texto plano)', async () => {
      const { svc, usuarios } = makeAuthService();
      const r = await svc.setPinSupervisor(2, PASSWORD, '1234');
      expect(r.message).toBeTruthy();
      expect(usuarios[1].pinSupervisor).toBeTruthy();
      expect(usuarios[1].pinSupervisor).not.toBe('1234');
      await expect(bcrypt.compare('1234', usuarios[1].pinSupervisor!)).resolves.toBe(true);
    });
  });

  describe('verificarSupervisor — con PIN configurado', () => {
    it('una vez configurado el PIN, la contraseña de la cuenta deja de servir en este campo', async () => {
      const { svc, usuarios } = makeAuthService();
      await svc.setPinSupervisor(2, PASSWORD, '1234');

      await expect(
        svc.verificarSupervisor(2, PASSWORD, /* cajeroId */ 1, EMPRESA, 'Inventario'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('el PIN configurado sí autoriza', async () => {
      const { svc, posLog } = makeAuthService();
      await svc.setPinSupervisor(2, PASSWORD, '1234');

      const r = await svc.verificarSupervisor(2, '1234', /* cajeroId */ 1, EMPRESA, 'Inventario');

      expect(r.ok).toBe(true);
      expect(posLog).toHaveLength(1);
    });

    it('sin PIN configurado: la contraseña de la cuenta sigue funcionando igual que antes', async () => {
      const { svc } = makeAuthService();
      const r = await svc.verificarSupervisor(2, PASSWORD, /* cajeroId */ 1, EMPRESA, 'Inventario');
      expect(r.ok).toBe(true);
    });
  });

  describe('listarSupervisores', () => {
    it('marca tienePin por cada supervisor según si ya lo configuró', async () => {
      const { svc } = makeAuthService();
      await svc.setPinSupervisor(2, PASSWORD, '1234');

      const lista = await svc.listarSupervisores(EMPRESA);

      expect(lista.find(s => s.id === 2)?.tienePin).toBe(true);
    });
  });
});
