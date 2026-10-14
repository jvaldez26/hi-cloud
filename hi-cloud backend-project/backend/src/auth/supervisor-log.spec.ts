/**
 * Sesiones de modo supervisor — AuthService.verificarSupervisor (extendido
 * con sessionId + sucursalId), cerrarSesionSupervisor y listarSupervisorLog.
 *
 * Cobertura del pedido: activación registra supervisor+cajero+hora (+ahora
 * sucursal); el sessionId que devuelve la activación es el mismo "id" que
 * luego se usa para vincular transacciones (ver facturas.service.spec para
 * el lado de facturas) y para auditar el cierre; el cierre resuelve
 * supervisorId/cajeroId de la fila de activación, nunca del caller; el
 * reporte filtra por supervisor/cajero/rango de fecha y trae cierre +
 * transacciones por sesión.
 *
 * Se instancia AuthService a mano con fakes mínimos — mismo criterio que
 * forzar-logout.spec.ts / login-username.spec.ts: nada de
 * Test.createTestingModule para probar lógica de dominio sobre SQL crudo.
 * El fake de dataSource simula pos_supervisor_log/facturas en memoria,
 * enrutando por substrings distintivos de cada query — no reimplementa
 * Postgres, solo lo mínimo para que cada método bajo prueba vea filas
 * coherentes.
 */
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

const PASSWORD_SUP = 'ClaveSupervisor123!';
let HASH_SUP: string;

beforeAll(async () => {
  HASH_SUP = await bcrypt.hash(PASSWORD_SUP, 4); // costo bajo — el spec no valida el costo, solo el compare
});

function makeAuthService(opts: { politicas?: Record<string, string> } = {}) {
  const posLog: any[] = [];
  const facturas: any[] = [];
  const supervisorAutorizaciones: any[] = [];
  const politicas = opts.politicas ?? {};
  const usuarios = [
    { id: 1, nombre: 'Carlos Cajero',  email: 'carlos@empresa.com',  password: HASH_SUP, role: 'vendedor' },
    { id: 2, nombre: 'Ana Supervisor', email: 'ana@empresa.com',     password: HASH_SUP, role: 'admin' },
    { id: 3, nombre: 'Otro Admin',     email: 'otro@empresa.com',    password: HASH_SUP, role: 'admin' },
    { id: 4, nombre: 'Rosa Contadora', email: 'rosa@empresa.com',    password: HASH_SUP, role: 'contador' },
    { id: 5, nombre: 'Sara Super',     email: 'sara@empresa.com',    password: HASH_SUP, role: 'super_admin' },
  ];
  const sucursales = [{ id: 5, nombre: 'Sucursal Centro' }];
  let nextId = 1;

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    // 1) Lookup de credenciales del supervisor (verificarSupervisor)
    if (sql.includes('SELECT u.id, u.nombre, u.email, u.password, u.role')) {
      const [ref, empresaId] = params;
      const byId = typeof ref === 'number';
      const u = usuarios.find(x =>
        (byId ? x.id === ref : x.email.toLowerCase() === String(ref).toLowerCase())
        && ['admin', 'contador', 'super_admin'].includes(x.role),
      );
      return u && empresaId === 7 ? [u] : [];
    }

    // 2) Cierre: insert con literal 'Cerrar modo supervisor' (7 params)
    if (sql.includes("'Cerrar modo supervisor'")) {
      const [empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId, detail, sessionId] = params;
      const row = {
        id: nextId++, empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId,
        action: 'Cerrar modo supervisor', detail, sessionId, createdAt: new Date(),
      };
      posLog.push(row);
      return [];
    }

    // 3) Activación: insert genérico con RETURNING id (7 params, sin el literal de arriba)
    if (sql.includes('INSERT INTO pos_supervisor_log')) {
      const [empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId, action, detail] = params;
      const row = {
        id: nextId++, empresaId, cajeroId, supervisorId, supervisorNombre, sucursalId,
        action, detail, sessionId: null, createdAt: new Date(),
      };
      posLog.push(row);
      return [{ id: row.id }];
    }

    // 4) Lookup de la fila de activación por id (cerrarSesionSupervisor)
    if (sql.includes('WHERE id = $1 AND "empresaId" = $2 AND "sessionId" IS NULL')) {
      const [id, empresaId] = params;
      const row = posLog.find(r => r.id === id && r.empresaId === empresaId && r.sessionId === null);
      return row ? [row] : [];
    }

    // 5) ¿Ya está cerrada? (cerrarSesionSupervisor, idempotencia)
    if (sql.includes('SELECT id FROM pos_supervisor_log WHERE "sessionId" = $1')) {
      const [sessionId] = params;
      const row = posLog.find(r => r.sessionId === sessionId);
      return row ? [row] : [];
    }

    // 6) Cierres en batch (listarSupervisorLog)
    if (sql.includes('SELECT "sessionId", detail, "createdAt" FROM pos_supervisor_log')) {
      const [ids] = params;
      return posLog.filter(r => r.sessionId !== null && ids.includes(r.sessionId));
    }

    // 7) COUNT (listarSupervisorLog)
    if (sql.includes('SELECT COUNT(*)::int AS total')) {
      const empresaId = params[0];
      const total = posLog.filter(r => r.sessionId === null && r.empresaId === empresaId).length;
      return [{ total }];
    }

    // 8) Listado principal de sesiones (listarSupervisorLog) — los filtros
    // opcionales se leen de `params` en el MISMO orden en que el service los
    // agrega (supervisorId, cajeroId, desde, hasta), detectando cuáles están
    // presentes por su condición literal en el SQL.
    if (sql.includes('SELECT l.id, l."cajeroId", u.nombre AS "cajeroNombre"')) {
      const empresaId = params[0];
      let rows = posLog.filter(r => r.sessionId === null && r.empresaId === empresaId);
      let idx = 1;
      if (sql.includes('l."supervisorId" = $')) { const v = params[idx++]; rows = rows.filter(r => r.supervisorId === v); }
      if (sql.includes('l."cajeroId" = $'))     { const v = params[idx++]; rows = rows.filter(r => r.cajeroId === v); }
      if (sql.includes('l."createdAt" >= $'))   { const v = params[idx++]; rows = rows.filter(r => r.createdAt >= new Date(v)); }
      if (sql.includes('l."createdAt" <= $'))   { const v = params[idx++]; rows = rows.filter(r => r.createdAt <= new Date(v)); }
      rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows.map(r => ({
        id: r.id, cajeroId: r.cajeroId,
        cajeroNombre: usuarios.find(u => u.id === r.cajeroId)?.nombre ?? null,
        supervisorId: r.supervisorId, supervisorNombre: r.supervisorNombre,
        sucursalId: r.sucursalId,
        sucursalNombre: sucursales.find(s => s.id === r.sucursalId)?.nombre ?? null,
        action: r.action, detail: r.detail, createdAt: r.createdAt,
      }));
    }

    // 9) Política de una clave de Modo Supervisor (finalizarAutorizacionSupervisor)
    if (sql.includes('SELECT modo FROM supervisor_politicas')) {
      const [, clave] = params;
      return politicas[clave] ? [{ modo: politicas[clave] }] : [];
    }

    // 10) Token de un solo uso para modo 'cada_vez' (finalizarAutorizacionSupervisor)
    if (sql.includes('INSERT INTO supervisor_autorizaciones')) {
      const [empresaId, cajeroId, supervisorId, clave, token, posSupervisorLogId] = params;
      supervisorAutorizaciones.push({ empresaId, cajeroId, supervisorId, clave, token, posSupervisorLogId });
      return [];
    }

    // 11) Facturas vinculadas a las sesiones de la página (listarSupervisorLog)
    // — dos caminos, igual que el servicio real: por supervisorSessionId
    // directo (modo 'sesion') y por supervisorToken vía
    // supervisor_autorizaciones.posSupervisorLogId (modo 'cada_vez').
    if (sql.includes('FROM facturas')) {
      const [ids] = params;
      const porSesion = facturas.filter(f => ids.includes(f.supervisorSessionId));
      const porToken = facturas.filter(f => {
        if (!f.supervisorToken) return false;
        const auth = supervisorAutorizaciones.find(a => a.token === f.supervisorToken);
        return auth && ids.includes(auth.posSupervisorLogId);
      }).map(f => ({
        ...f,
        supervisorSessionId: supervisorAutorizaciones.find(a => a.token === f.supervisorToken)!.posSupervisorLogId,
      }));
      const vistos = new Set<number>();
      return [...porSesion, ...porToken].filter(f => (vistos.has(f.id) ? false : (vistos.add(f.id), true))).map(f => ({
        sessionId: f.supervisorSessionId, id: f.id, folio: f.folio,
        total: f.total, estado: f.estado, createdAt: f.createdAt,
      }));
    }

    throw new Error(`Query no reconocida por el fake: ${sql}`);
  });

  const noop = {} as any;
  const supervisorAttempts = {
    isBlocked:      jest.fn().mockResolvedValue({ blocked: false }),
    registrarFallo: jest.fn().mockResolvedValue({ intentos: 1, bloqueado: false }),
    reset:          jest.fn().mockResolvedValue(undefined),
  } as any;
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop,
    { query } as any,
    noop, supervisorAttempts, noop, noop, noop,
  );

  return { svc, posLog, facturas, supervisorAutorizaciones, query };
}

const EMPRESA = 7;

describe('AuthService.verificarSupervisor — sessionId y sucursalId', () => {
  it('activación registra supervisor+cajero+hora+sucursal y devuelve un sessionId', async () => {
    const { svc, posLog } = makeAuthService();

    const r = await svc.verificarSupervisor(
      2, PASSWORD_SUP, /* cajeroId */ 1, EMPRESA,
      'Activar modo supervisor', undefined, /* sucursalId */ 5,
    );

    expect(r.ok).toBe(true);
    expect(r.nombre).toBe('Ana Supervisor');
    expect(r.sessionId).toEqual(expect.any(Number));

    expect(posLog).toHaveLength(1);
    expect(posLog[0]).toMatchObject({
      empresaId: EMPRESA, cajeroId: 1, supervisorId: 2, supervisorNombre: 'Ana Supervisor',
      sucursalId: 5, action: 'Activar modo supervisor', sessionId: null,
    });
    expect(posLog[0].id).toBe(r.sessionId);
  });

  it('contraseña incorrecta: no autoriza ni registra nada', async () => {
    const { svc, posLog } = makeAuthService();
    await expect(
      svc.verificarSupervisor(2, 'mala-clave', 1, EMPRESA, 'Cierre de Caja'),
    ).rejects.toThrow(UnauthorizedException);
    expect(posLog).toHaveLength(0);
  });
});

describe('AuthService.verificarSupervisor — auto-autorización', () => {
  it('un ADMIN SÍ puede autorizarse a sí mismo (flujo normal, no una excepción)', async () => {
    const { svc, posLog } = makeAuthService();
    // Ana (id 2, admin) es a la vez la cajera y la supervisora que se elige.
    const r = await svc.verificarSupervisor(2, PASSWORD_SUP, /* cajeroId */ 2, EMPRESA, 'Modificar precio');
    expect(r.ok).toBe(true);
    expect(posLog).toHaveLength(1);
  });

  it('un CONTADOR SÍ puede autorizarse a sí mismo (flujo normal, no una excepción)', async () => {
    const { svc, posLog } = makeAuthService();
    // Rosa (id 4, contador) es a la vez la cajera y la supervisora que se elige.
    const r = await svc.verificarSupervisor(4, PASSWORD_SUP, /* cajeroId */ 4, EMPRESA, 'Modificar precio');
    expect(r.ok).toBe(true);
    expect(posLog).toHaveLength(1);
  });

  it('un CONTADOR SÍ puede autorizar a OTRO cajero también', async () => {
    const { svc, posLog } = makeAuthService();
    const r = await svc.verificarSupervisor(4, PASSWORD_SUP, /* cajeroId distinto */ 1, EMPRESA, 'Modificar precio');
    expect(r.ok).toBe(true);
    expect(posLog).toHaveLength(1);
  });

  it('un SUPER_ADMIN NO puede autorizarse a sí mismo', async () => {
    const { svc, posLog } = makeAuthService();
    // Sara (id 5, super_admin) es a la vez la cajera y la supervisora que se elige.
    await expect(
      svc.verificarSupervisor(5, PASSWORD_SUP, /* cajeroId */ 5, EMPRESA, 'Modificar precio'),
    ).rejects.toThrow(UnauthorizedException);
    expect(posLog).toHaveLength(0);
  });

  it('un SUPER_ADMIN SÍ puede autorizar a otro cajero (la restricción es solo sobre uno mismo)', async () => {
    const { svc, posLog } = makeAuthService();
    const r = await svc.verificarSupervisor(5, PASSWORD_SUP, /* cajeroId distinto */ 1, EMPRESA, 'Modificar precio');
    expect(r.ok).toBe(true);
    expect(posLog).toHaveLength(1);
  });
});

describe('AuthService.cerrarSesionSupervisor', () => {
  it('cierre manual: resuelve supervisorId/cajeroId de la fila de activación, no del caller', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    const r = await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'manual', 5);

    expect(r.ok).toBe(true);
    expect(posLog).toHaveLength(2);
    const cierre = posLog.find(p => p.sessionId === sessionId);
    expect(cierre).toMatchObject({
      supervisorId: 2, supervisorNombre: 'Ana Supervisor', cajeroId: 1,
      sucursalId: 5, action: 'Cerrar modo supervisor',
    });
    expect(cierre.detail).toContain('manual');
  });

  it('cierre por expiración: detail distingue el motivo', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'expiracion');

    const cierre = posLog.find(p => p.sessionId === sessionId);
    expect(cierre.detail).toContain('Expiración');
  });

  it('sessionId de otra empresa: no encuentra la sesión, no inserta nada', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    const r = await svc.cerrarSesionSupervisor(sessionId!, /* otra empresa */ 999, 'manual');

    expect(r.ok).toBe(false);
    expect(posLog).toHaveLength(1); // solo la activación — el intento de cierre no se registró
  });

  it('idempotente: un segundo cierre sobre la misma sesión no duplica la fila', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'manual');
    await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'manual');

    expect(posLog.filter(p => p.sessionId === sessionId)).toHaveLength(1);
  });
});

describe('AuthService.listarSupervisorLog', () => {
  it('trae la sesión con su cierre y las facturas vinculadas', async () => {
    const { svc, facturas } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor', undefined, 5);
    facturas.push({ id: 100, folio: 'B0100000001', total: 1500, estado: 'EMITIDA', createdAt: new Date(), supervisorSessionId: sessionId });
    await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'manual', 5);

    const { data, meta } = await svc.listarSupervisorLog(EMPRESA, {});

    expect(meta.total).toBe(1); // el conteo es de SESIONES, no de filas (activación + cierre)
    expect(data).toHaveLength(1);
    expect(data[0].cajeroNombre).toBe('Carlos Cajero');
    expect(data[0].sucursalNombre).toBe('Sucursal Centro');
    expect(data[0].cierre).toBeTruthy();
    expect(data[0].transacciones).toHaveLength(1);
    expect(data[0].transacciones[0]).toMatchObject({ folio: 'B0100000001', total: 1500 });
  });

  // Caso real (2026-10-14, empresa VENTAS DIVERSAS ELIDO): Bellamar hizo dos
  // ventas a crédito con autorización de Beatriz, pero nunca aparecían en
  // "Transacciones" — la política 'venta_credito' de esa empresa está en
  // modo 'cada_vez', que deja el vínculo en facturas.supervisorToken (no en
  // supervisorSessionId, que ese modo nunca llena). Ver la migración
  // SupervisorAutorizacionPosLogId y finalizarAutorizacionSupervisor.
  it('modo "cada_vez" (ej. venta_credito): la factura autorizada con el token SÍ aparece en transacciones', async () => {
    const { svc, facturas } = makeAuthService({ politicas: { venta_credito: 'cada_vez' } });
    const r = await svc.verificarSupervisor(
      2, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5,
      undefined, undefined, 'venta_credito',
    );
    expect(r.supervisorToken).toEqual(expect.any(String));

    // La factura NUNCA llena supervisorSessionId en este modo — solo supervisorToken.
    facturas.push({
      id: 1959, folio: 'B0100001959', total: 2500, estado: 'EMITIDA', createdAt: new Date(),
      supervisorSessionId: null, supervisorToken: r.supervisorToken,
    });

    const { data } = await svc.listarSupervisorLog(EMPRESA, {});

    expect(data).toHaveLength(1);
    expect(data[0].transacciones).toHaveLength(1);
    expect(data[0].transacciones[0]).toMatchObject({ folio: 'B0100001959', total: 2500 });
  });

  it('modo "cada_vez": DOS facturas autorizadas en la misma sesión aparecen las dos (FAC-1959 y FAC-1967)', async () => {
    const { svc, facturas } = makeAuthService({ politicas: { venta_credito: 'cada_vez' } });
    const r1 = await svc.verificarSupervisor(
      2, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5,
      undefined, undefined, 'venta_credito',
    );
    facturas.push({ id: 1959, folio: 'B0100001959', total: 2500, estado: 'EMITIDA', createdAt: new Date(), supervisorToken: r1.supervisorToken });

    const r2 = await svc.verificarSupervisor(
      2, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5,
      undefined, undefined, 'venta_credito',
    );
    facturas.push({ id: 1967, folio: 'B0100001967', total: 1800, estado: 'EMITIDA', createdAt: new Date(), supervisorToken: r2.supervisorToken });

    const { data } = await svc.listarSupervisorLog(EMPRESA, {});

    const folios = data.flatMap((d: any) => d.transacciones.map((t: any) => t.folio));
    expect(folios).toEqual(expect.arrayContaining(['B0100001959', 'B0100001967']));
  });

  it('modo "cada_vez": un token de OTRA sesión no se cuela en esta', async () => {
    const { svc, facturas } = makeAuthService({ politicas: { venta_credito: 'cada_vez' } });
    await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5, undefined, undefined, 'venta_credito');
    const r2 = await svc.verificarSupervisor(3, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5, undefined, undefined, 'venta_credito');
    facturas.push({ id: 2000, folio: 'B0100002000', total: 100, estado: 'EMITIDA', createdAt: new Date(), supervisorToken: r2.supervisorToken });

    const { data } = await svc.listarSupervisorLog(EMPRESA, { supervisorId: 2 });

    expect(data).toHaveLength(1);
    expect(data[0].transacciones).toHaveLength(0); // la factura es de la sesión del supervisor 3, no del 2
  });

  it('política en modo "sesion" (default): no emite supervisorToken', async () => {
    const { svc } = makeAuthService({ politicas: { venta_credito: 'sesion' } });
    const r = await svc.verificarSupervisor(
      2, PASSWORD_SUP, 1, EMPRESA, 'Autorizar venta a crédito', undefined, 5,
      undefined, undefined, 'venta_credito',
    );
    expect(r.supervisorToken).toBeUndefined();
  });

  it('filtra por supervisorId', async () => {
    const { svc } = makeAuthService();
    await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');
    await svc.verificarSupervisor(3, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    const { data } = await svc.listarSupervisorLog(EMPRESA, { supervisorId: 3 });

    expect(data).toHaveLength(1);
    expect(data[0].supervisorId).toBe(3);
  });

  it('filtra por cajeroId', async () => {
    const { svc } = makeAuthService();
    await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');
    await svc.verificarSupervisor(2, PASSWORD_SUP, /* otro cajero */ 4, EMPRESA, 'Activar modo supervisor');

    const { data } = await svc.listarSupervisorLog(EMPRESA, { cajeroId: 1 });

    expect(data).toHaveLength(1);
    expect(data[0].cajeroId).toBe(1);
  });

  it('no mezcla sesiones de otra empresa', async () => {
    const { svc } = makeAuthService();
    await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    const { data, meta } = await svc.listarSupervisorLog(999, {});

    expect(data).toHaveLength(0);
    expect(meta.total).toBe(0);
  });

  it('sesión de hace 10 horas SIN cierre registrado: aparece "expirada" (no "activa")', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');
    // El cierre depende de que el navegador de esa caja siga vivo y lo reporte
    // (ver useSupervisor.ts) — simula que esa pestaña nunca volvió a abrirse.
    posLog.find(p => p.id === sessionId)!.createdAt = new Date(Date.now() - 10 * 60 * 60_000);

    const { data } = await svc.listarSupervisorLog(EMPRESA, {});

    expect(data[0].cierre).toBeNull();
    expect(data[0].expirada).toBe(true);
  });

  it('sesión de hace 2 horas sin cierre: sigue "activa" (dentro de la ventana de 8h)', async () => {
    const { svc } = makeAuthService();
    await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');

    const { data } = await svc.listarSupervisorLog(EMPRESA, {});

    expect(data[0].cierre).toBeNull();
    expect(data[0].expirada).toBe(false);
  });

  it('sesión de hace 10 horas con cierre YA registrado: no se marca "expirada" (el cierre manda)', async () => {
    const { svc, posLog } = makeAuthService();
    const { sessionId } = await svc.verificarSupervisor(2, PASSWORD_SUP, 1, EMPRESA, 'Activar modo supervisor');
    posLog.find(p => p.id === sessionId)!.createdAt = new Date(Date.now() - 10 * 60 * 60_000);
    await svc.cerrarSesionSupervisor(sessionId!, EMPRESA, 'expiracion');

    const { data } = await svc.listarSupervisorLog(EMPRESA, {});

    expect(data[0].cierre).toBeTruthy();
    expect(data[0].expirada).toBe(false);
  });
});
