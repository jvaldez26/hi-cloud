/**
 * S-64 — Tests de regresión: trazabilidad de las acciones del Super Admin y el
 * bug de cobro en la aprobación de solicitudes.
 *
 * Cubre:
 *  - aprobarSolicitudCambioPlan: antes se llamaba con empresaId=0 literal, de
 *    modo que el UPDATE no afectaba a nadie pero la solicitud quedaba 'aprobada'.
 *  - suspender/activar/eliminar empresa: no registraban QUIÉN las ejecutó.
 *  - claveInternaValida: la comparación anterior autorizaba a cualquiera si
 *    INTERNAL_API_KEY no estaba definida en el entorno.
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { claveInternaValida } from './super-admin.controller';

// ── Mock del DataSource, enrutando por el SQL recibido ───────────────────────

function buildService(opts: {
  solicitud?: { empresaId: number; estado: string } | null;
  conSuscripcion?: boolean;
} = {}) {
  const queries: { sql: string; params: any[] }[] = [];

  const ds = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      queries.push({ sql, params });

      if (sql.includes('FROM solicitud_cambio_plan')) {
        return opts.solicitud === undefined ? [] : (opts.solicitud ? [opts.solicitud] : []);
      }
      if (sql.includes('SELECT id FROM suscripciones')) {
        return opts.conSuscripcion === false ? [] : [{ id: 555 }];
      }
      if (sql.includes('SELECT plan, estado')) return [{ plan: 'pyme', estado: 'activa' }];
      if (sql.includes('COUNT(*)')) return [{ count: '0' }];   // el log de eliminarEmpresa lo lee
      if (sql.trimStart().toUpperCase().startsWith('SELECT')) return [];
      return [];
    }),
  };

  const svc = new SuperAdminService(ds as any, { enviar: jest.fn() } as any);

  const buscar = (fragmento: string) => queries.filter(q => q.sql.includes(fragmento));
  return { svc, queries, buscar };
}

// ── Bug de cobro ─────────────────────────────────────────────────────────────

describe('S-64 — aprobarSolicitudCambioPlan resuelve la empresa real', () => {
  it('aplica el plan a la empresa de la solicitud, no a empresaId=0', async () => {
    const { svc, buscar } = buildService({ solicitud: { empresaId: 42, estado: 'pendiente' } });

    await svc.aprobarSolicitudCambioPlan(7, 'pro', 3, 99, 'Solicitud aprobada');

    // El UPDATE del plan debe apuntar a la empresa 42
    const updates = buscar('UPDATE suscripciones SET plan');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some(u => u.params.includes(42))).toBe(true);
    expect(updates.some(u => u.params.includes(0))).toBe(false);
  });

  it('marca la solicitud como aprobada con el id del super admin', async () => {
    const { svc, buscar } = buildService({ solicitud: { empresaId: 42, estado: 'pendiente' } });

    await svc.aprobarSolicitudCambioPlan(7, 'pro', 1, 99, 'ok');

    const upd = buscar('UPDATE solicitud_cambio_plan');
    expect(upd).toHaveLength(1);
    expect(upd[0].params).toEqual([99, 7]);
  });

  it('rechaza una solicitud inexistente', async () => {
    const { svc } = buildService({ solicitud: null });
    await expect(svc.aprobarSolicitudCambioPlan(7, 'pro', 1, 99, 'x'))
      .rejects.toThrow(NotFoundException);
  });

  it('rechaza una solicitud ya procesada (no re-aprueba)', async () => {
    const { svc, buscar } = buildService({ solicitud: { empresaId: 42, estado: 'aprobada' } });
    await expect(svc.aprobarSolicitudCambioPlan(7, 'pro', 1, 99, 'x'))
      .rejects.toThrow(BadRequestException);
    expect(buscar('UPDATE suscripciones SET plan')).toHaveLength(0);
  });
});

// ── Autoría de las acciones sobre empresas ───────────────────────────────────

describe('S-64 — quién suspendió/activó/eliminó la empresa queda registrado', () => {
  it('suspenderEmpresa audita con el superAdminId y el motivo', async () => {
    const { svc, buscar } = buildService({});

    await svc.suspenderEmpresa(10, 77, 'Impago reiterado');

    const audit = buscar('INSERT INTO suscripcion_auditoria');
    expect(audit).toHaveLength(1);
    expect(audit[0].params).toEqual(
      expect.arrayContaining([10, 'SUSPENSION_EMPRESA', 77, 'Impago reiterado']),
    );
  });

  it('activarEmpresa audita la reactivación', async () => {
    const { svc, buscar } = buildService({});
    await svc.activarEmpresa(10, 77);
    const audit = buscar('INSERT INTO suscripcion_auditoria');
    expect(audit[0].params).toEqual(expect.arrayContaining([10, 'ACTIVACION_EMPRESA', 77]));
  });

  it('eliminarEmpresa audita antes de cancelar la suscripción', async () => {
    const { svc, queries } = buildService({});
    await svc.eliminarEmpresa(10, 77);

    const idxAudit  = queries.findIndex(q => q.sql.includes('INSERT INTO suscripcion_auditoria'));
    const idxCancel = queries.findIndex(q => q.sql.includes("estado = 'cancelada'"));
    expect(idxAudit).toBeGreaterThanOrEqual(0);
    expect(idxAudit).toBeLessThan(idxCancel);
  });

  it('si la empresa no tiene suscripción, el rastro va a audit_logs', async () => {
    const { svc, buscar } = buildService({ conSuscripcion: false });

    await svc.suspenderEmpresa(10, 77, 'sin suscripción aún');

    expect(buscar('INSERT INTO suscripcion_auditoria')).toHaveLength(0);
    const global = buscar('INSERT INTO audit_logs');
    expect(global).toHaveLength(1);
    expect(global[0].params).toEqual(expect.arrayContaining([77]));
  });

  it('un fallo al auditar no revierte la acción', async () => {
    const { svc } = buildService({});
    // Forzar error en el INSERT de auditoría
    (svc as any).ds.query = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO')) throw new Error('BD caída');
      if (sql.includes('SELECT id FROM suscripciones')) return [{ id: 555 }];
      return [];
    });

    await expect(svc.suspenderEmpresa(10, 77)).resolves.toMatchObject({ ok: true });
  });
});

// ── Clave interna de los endpoints de backup ─────────────────────────────────

describe('S-64 — claveInternaValida falla cerrado', () => {
  const ORIGINAL = process.env.INTERNAL_API_KEY;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = ORIGINAL;
  });

  it('sin INTERNAL_API_KEY en el entorno, NADIE pasa (antes pasaba todo el mundo)', () => {
    delete process.env.INTERNAL_API_KEY;
    expect(claveInternaValida(undefined)).toBe(false);  // el caso undefined !== undefined
    expect(claveInternaValida('')).toBe(false);
    expect(claveInternaValida('lo-que-sea')).toBe(false);
  });

  it('con la clave configurada, solo el valor exacto pasa', () => {
    process.env.INTERNAL_API_KEY = 'clave-secreta-larga';
    expect(claveInternaValida('clave-secreta-larga')).toBe(true);
    expect(claveInternaValida('clave-secreta-larg')).toBe(false);
    expect(claveInternaValida('otra')).toBe(false);
    expect(claveInternaValida(undefined)).toBe(false);
  });
});
