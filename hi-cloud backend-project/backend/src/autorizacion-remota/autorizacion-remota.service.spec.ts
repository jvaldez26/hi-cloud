import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AutorizacionRemotaService } from './autorizacion-remota.service';

/**
 * Cubre los 7 escenarios pedidos explícitamente: aprobación de punta a
 * punta, rechazo, vencimiento, carrito cambiado tras aprobar (ver también
 * requiere-supervisor.guard.spec.ts — la huella se valida ahí, en el
 * consumo del token, no aquí), aprobar la propia solicitud, política sin
 * remoto, y dos supervisores respondiendo a la vez.
 */
const EMPRESA = 7;
const CAJERO = { id: 10, nombre: 'Cajero Uno', ip: '190.1.1.1', userAgent: 'test-agent' };
const SUPERVISOR = { id: 20, nombre: 'Admin Dos', ip: '190.1.1.2', userAgent: 'test-agent' };

function buildService(opts: {
  politica?: { requerido: boolean; permiteRemoto: boolean; modo?: 'sesion' | 'cada_vez' };
  configEmpresa?: { configuracion: Record<string, any> } | undefined;
  queryImpl?: (sql: string, params: any[]) => any;
  savedRows?: any[];
} = {}) {
  const politica = opts.politica ?? { requerido: true, permiteRemoto: true, modo: 'cada_vez' as const };
  const politicaService = { obtenerPolitica: jest.fn().mockResolvedValue(politica) } as any;

  const savedRows: any[] = opts.savedRows ?? [];
  let nextId = 1;
  const repo = {
    create: jest.fn((x: any) => ({ id: nextId++, createdAt: new Date(), ...x })),
    save: jest.fn(async (x: any) => { savedRows.push(x); return x; }),
    update: jest.fn(async (id: number, patch: any) => {
      const row = savedRows.find(r => r.id === id);
      if (row) Object.assign(row, patch);
    }),
    find: jest.fn(async ({ where }: any) => savedRows.filter(r =>
      r.empresaId === where.empresaId && (where.estado === undefined || r.estado === where.estado))),
    findOne: jest.fn(async ({ where }: any) => savedRows.find(r => r.empresaId === where.empresaId && r.id === where.id) ?? null),
  } as any;

  const defaultQueryImpl = (sql: string, params: any[]) => {
    if (sql.includes('FROM empresa WHERE id')) {
      return Promise.resolve(opts.configEmpresa ? [opts.configEmpresa] : []);
    }
    if (sql.includes('SELECT id FROM solicitudes_autorizacion_remota')) {
      return Promise.resolve([]); // sin pendiente previa, por defecto
    }
    if (sql.includes('COUNT(*)::text AS count')) {
      return Promise.resolve([{ count: '0' }]);
    }
    if (sql.includes('UPDATE usuario_empresa') || sql.includes('FROM usuario_empresa')) {
      return Promise.resolve([]); // sin destinatarios configurados a mano en estos tests
    }
    if (sql.includes('INSERT INTO pos_supervisor_log')) {
      return Promise.resolve([{ id: 999 }]);
    }
    if (sql.includes('INSERT INTO supervisor_autorizaciones')) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };

  const query = jest.fn(opts.queryImpl ?? defaultQueryImpl);
  const dataSource = { query } as any;

  const notificaciones = { notificarSistemaUsuario: jest.fn().mockResolvedValue(undefined) } as any;
  const push = { notificarUsuario: jest.fn().mockResolvedValue(undefined) } as any;
  const realtime = { notify: jest.fn() } as any;
  const auditoria = { registrar: jest.fn().mockResolvedValue(undefined) } as any;

  const svc = new AutorizacionRemotaService(repo, dataSource, politicaService, notificaciones, push, realtime, auditoria);
  return { svc, repo, dataSource, query, politicaService, notificaciones, push, realtime, auditoria, savedRows };
}

describe('AutorizacionRemotaService', () => {
  describe('crear', () => {
    it('política sin remoto permitido (permiteRemoto=false): rechaza — la opción no debería ni mostrarse', async () => {
      const { svc } = buildService({ politica: { requerido: true, permiteRemoto: false } });
      await expect(svc.crear(EMPRESA, CAJERO, null, 5, { clave: 'cierre_caja_descuadre', motivo: 'quiero cerrar igual' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('política no requerida: rechaza (no tiene sentido pedir autorización para algo que no la exige)', async () => {
      const { svc } = buildService({ politica: { requerido: false, permiteRemoto: true } });
      await expect(svc.crear(EMPRESA, CAJERO, null, 5, { clave: 'venta_credito', motivo: 'motivo válido' }))
        .rejects.toThrow(BadRequestException);
    });

    it('empresa con autorización remota desactivada: rechaza', async () => {
      const { svc } = buildService({ configEmpresa: { configuracion: { pos: { autorizacionRemotaActiva: false } } } });
      await expect(svc.crear(EMPRESA, CAJERO, null, 5, { clave: 'venta_credito', motivo: 'motivo válido' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('ya hay una solicitud pendiente para esa caja: rechaza (máximo una por caja)', async () => {
      const { svc } = buildService({
        queryImpl: (sql) => {
          if (sql.includes('SELECT id FROM solicitudes_autorizacion_remota')) return Promise.resolve([{ id: 1 }]);
          return Promise.resolve([]);
        },
      });
      await expect(svc.crear(EMPRESA, CAJERO, null, 5, { clave: 'venta_credito', motivo: 'motivo válido' }))
        .rejects.toThrow(BadRequestException);
    });

    it('más de 5 solicitudes en el último minuto: rechaza (límite por minuto)', async () => {
      const { svc } = buildService({
        queryImpl: (sql) => {
          if (sql.includes('SELECT id FROM solicitudes_autorizacion_remota')) return Promise.resolve([]);
          if (sql.includes('COUNT(*)::text AS count')) return Promise.resolve([{ count: '5' }]);
          return Promise.resolve([]);
        },
      });
      await expect(svc.crear(EMPRESA, CAJERO, null, 5, { clave: 'venta_credito', motivo: 'motivo válido' }))
        .rejects.toThrow(BadRequestException);
    });

    it('caso normal: crea la solicitud pendiente y avisa (mejor esfuerzo) sin bloquear', async () => {
      const { svc, repo, realtime } = buildService();
      const s = await svc.crear(EMPRESA, CAJERO, 3, 5, {
        clave: 'venta_credito', motivo: 'Cliente de confianza, sin supervisor presente', monto: 1500, clienteId: 88,
      });
      expect(s.estado).toBe('pendiente');
      expect(s.cajeroId).toBe(CAJERO.id);
      expect(repo.save).toHaveBeenCalledTimes(1);
      // El aviso es fire-and-forget — dar una vuelta de microtask para que corra.
      await new Promise(r => setTimeout(r, 0));
      expect(realtime.notify).toHaveBeenCalledWith(EMPRESA, 'autorizacion_remota', 'created', s.id);
    });
  });

  describe('decidir — aprobación de punta a punta', () => {
    it('ADMIN aprueba: queda aprobada, se emite un token y estado() lo expone', async () => {
      const solicitud = {
        id: 1, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() + 60_000),
      };
      const { svc, savedRows, query } = buildService({
        savedRows: [solicitud],
        queryImpl: (sql, params) => {
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) {
            // Simula el UPDATE atómico exitoso — devuelve la fila actualizada.
            const actualizada = { ...solicitud, estado: 'aprobada', supervisorId: params[1], supervisorNombre: params[2] };
            Object.assign(solicitud, actualizada);
            return Promise.resolve([actualizada]);
          }
          if (sql.includes('INSERT INTO pos_supervisor_log')) return Promise.resolve([{ id: 555 }]);
          if (sql.includes('INSERT INTO supervisor_autorizaciones')) return Promise.resolve([]);
          return Promise.resolve([]);
        },
      });

      const resultado = await svc.decidir(EMPRESA, 1, SUPERVISOR, { decision: 'aprobada' });
      expect((resultado as any).token).toBeUndefined(); // nunca se devuelve al supervisor
      expect(solicitud.estado).toBe('aprobada');

      const est = await svc.estado(EMPRESA, 1);
      expect(est.estado).toBe('aprobada');
      expect(est.token).toBeTruthy(); // el cajero SÍ puede leer su propio token al consultar estado()
    });
  });

  describe('decidir — rechazo', () => {
    it('ADMIN rechaza con comentario: queda rechazada, sin token, estado() expone el motivo', async () => {
      const solicitud = {
        id: 2, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() + 60_000),
      };
      const { svc } = buildService({
        savedRows: [solicitud],
        queryImpl: (sql, params) => {
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) {
            Object.assign(solicitud, { estado: 'rechazada', supervisorId: params[1], supervisorNombre: params[2], comentario: params[3] });
            return Promise.resolve([{ ...solicitud }]);
          }
          return Promise.resolve([]);
        },
      });

      await svc.decidir(EMPRESA, 2, SUPERVISOR, { decision: 'rechazada', comentario: 'Monto fuera de política' });
      const est = await svc.estado(EMPRESA, 2);
      expect(est.estado).toBe('rechazada');
      expect(est.token).toBeNull();
      expect(est.comentario).toBe('Monto fuera de política');
    });
  });

  describe('decidir — vencimiento', () => {
    it('la solicitud venció sin respuesta: estado() la reporta expirada', async () => {
      const solicitud = {
        id: 3, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() - 1000), // ya pasó
      };
      const { svc } = buildService({ savedRows: [solicitud] });
      const est = await svc.estado(EMPRESA, 3);
      expect(est.estado).toBe('expirada');
    });

    it('intentar decidir una solicitud ya vencida: rechaza con mensaje de vencida', async () => {
      const solicitud = {
        id: 4, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() - 1000),
      };
      const { svc } = buildService({
        savedRows: [solicitud],
        queryImpl: (sql) => {
          // El UPDATE atómico exige expiraEn > NOW(): nunca afecta filas vencidas.
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) return Promise.resolve([]);
          if (sql.includes('SELECT * FROM solicitudes_autorizacion_remota WHERE id')) return Promise.resolve([solicitud]);
          return Promise.resolve([]);
        },
      });
      await expect(svc.decidir(EMPRESA, 4, SUPERVISOR, { decision: 'aprobada' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('decidir — conflicto de interés', () => {
    it('el propio cajero intenta aprobar su solicitud: rechaza, incluso siendo ADMIN/CONTADOR', async () => {
      const solicitud = {
        id: 5, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() + 60_000),
      };
      const { svc } = buildService({
        savedRows: [solicitud],
        queryImpl: (sql) => {
          // El propio UPDATE exige "cajeroId" <> supervisorId — nunca afecta nada aquí.
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) return Promise.resolve([]);
          if (sql.includes('SELECT * FROM solicitudes_autorizacion_remota WHERE id')) return Promise.resolve([solicitud]);
          return Promise.resolve([]);
        },
      });
      // El propio cajero (ADMIN en su empresa, por ejemplo) intenta decidir su propia solicitud.
      await expect(svc.decidir(EMPRESA, 5, { ...CAJERO, nombre: 'Cajero Uno (admin)' }, { decision: 'aprobada' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('decidir — dos supervisores respondiendo a la vez', () => {
    it('solo la primera respuesta cuenta; la segunda ve "ya fue respondida por X"', async () => {
      const solicitud = {
        id: 6, empresaId: EMPRESA, cajeroId: CAJERO.id, cajeroNombre: CAJERO.nombre,
        clave: 'venta_credito', estado: 'pendiente', motivo: 'motivo', sucursalId: null,
        expiraEn: new Date(Date.now() + 60_000),
      };
      let yaRespondida = false;
      const { svc } = buildService({
        savedRows: [solicitud],
        queryImpl: (sql, params) => {
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) {
            if (yaRespondida) return Promise.resolve([]); // la segunda llamada pierde la carrera
            yaRespondida = true;
            Object.assign(solicitud, { estado: 'aprobada', supervisorId: params[1], supervisorNombre: params[2] });
            return Promise.resolve([{ ...solicitud }]);
          }
          if (sql.includes('SELECT * FROM solicitudes_autorizacion_remota WHERE id')) return Promise.resolve([solicitud]);
          if (sql.includes('INSERT INTO pos_supervisor_log')) return Promise.resolve([{ id: 1 }]);
          return Promise.resolve([]);
        },
      });

      const otroSupervisor = { id: 30, nombre: 'Admin Tres' };
      const [r1, r2] = await Promise.allSettled([
        svc.decidir(EMPRESA, 6, SUPERVISOR, { decision: 'aprobada' }),
        svc.decidir(EMPRESA, 6, otroSupervisor, { decision: 'aprobada' }),
      ]);
      const fulfilled = [r1, r2].filter(r => r.status === 'fulfilled');
      const rejected = [r1, r2].filter(r => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
      expect((rejected[0].reason as Error).message).toContain('Admin Dos');
    });
  });

  describe('decidir — solicitud inexistente', () => {
    it('id que no existe: NotFoundException', async () => {
      const { svc } = buildService({
        queryImpl: (sql) => {
          if (sql.includes('UPDATE solicitudes_autorizacion_remota')) return Promise.resolve([]);
          if (sql.includes('SELECT * FROM solicitudes_autorizacion_remota WHERE id')) return Promise.resolve([]);
          return Promise.resolve([]);
        },
      });
      await expect(svc.decidir(EMPRESA, 999, SUPERVISOR, { decision: 'aprobada' })).rejects.toThrow(NotFoundException);
    });
  });
});
