/**
 * SolicitudesService.decidir() — no tenía ningún spec dedicado. Etapa 6
 * (Seguridad) encontró una ventana de carrera real: el SELECT de orFail()
 * no bloquea la fila, así que dos llamadas concurrentes a /decidir sobre la
 * MISMA solicitud podían leer ambas "pendiente" y ambas ejecutar el UPDATE
 * — la segunda sobrescribía en silencio el resultado de la primera, sin
 * ningún error. El fix repite la condición de estado dentro del propio
 * UPDATE (atómico a nivel de fila) — ver docs/prestamista/etapa-6-seguridad.md.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';

function buildService(responder: (sql: string, params: any[]) => any) {
  const ds = { query: jest.fn(async (sql: string, params: any[] = []) => responder(sql, params)) };
  const tenantSvc = { getUserId: () => 1 };
  const svc = new SolicitudesService(ds as any, tenantSvc as any);
  return { svc, ds };
}

const SOLICITUD_PENDIENTE = {
  id: 10, estado: 'pendiente', creadoPor: 2, deudorId: 3, numero: 'SOL-0001',
};

describe('SolicitudesService.decidir', () => {
  it('aprueba una solicitud pendiente — otra persona distinta de quien la creó', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('FROM pr_solicitudes s')) return [SOLICITUD_PENDIENTE];
      if (sql.includes('UPDATE pr_solicitudes SET')) return [{ ...SOLICITUD_PENDIENTE, estado: 'aprobada' }];
      return [];
    });
    const r: any = await svc.decidir(7, 10, { aprobado: true });
    expect(r.estado).toBe('aprobada');
    // La condición de estado va dentro del propio UPDATE, no solo chequeada antes.
    const update = ds.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_solicitudes SET'));
    expect(update[0]).toMatch(/estado IN \('pendiente','en_revision'\)/);
  });

  it('solicitud inexistente: NotFoundException', async () => {
    const { svc } = buildService(() => []);
    await expect(svc.decidir(7, 999, { aprobado: true })).rejects.toThrow(NotFoundException);
  });

  it('solicitud ya decidida (estado no pendiente/en_revision): se rechaza antes de llegar al UPDATE', async () => {
    const { svc, ds } = buildService((sql: string) =>
      sql.includes('FROM pr_solicitudes s') ? [{ ...SOLICITUD_PENDIENTE, estado: 'aprobada' }] : []);
    await expect(svc.decidir(7, 10, { aprobado: true })).rejects.toThrow(BadRequestException);
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE pr_solicitudes SET'))).toBe(false);
  });

  // Decisión de negocio (2026-10-13): la segregación de funciones en la
  // decisión de solicitudes ya NO es obligatoria — es una config opcional
  // por empresa (`empresa.configuracion.solicitudesExigirOtroAprobador`),
  // desactivada por defecto.
  it('por defecto (config desactivada): quien creó la solicitud SÍ puede aprobarla', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('FROM pr_solicitudes s')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1 }]; // uid del tenantSvc mock es 1
      if (sql.includes('SELECT configuracion FROM empresa')) return [{ configuracion: {} }];
      if (sql.includes('UPDATE pr_solicitudes SET')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1, estado: 'aprobada' }];
      return [];
    });
    const r: any = await svc.decidir(7, 10, { aprobado: true });
    expect(r.estado).toBe('aprobada');
    // Ninguna empresa que nunca tocó esta config nota un cambio: sin fila en
    // `empresa` (configuracion ausente) también debe permitir, no reventar.
    const { svc: svc2 } = buildService((sql: string) => {
      if (sql.includes('FROM pr_solicitudes s')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1 }];
      if (sql.includes('SELECT configuracion FROM empresa')) return [];
      if (sql.includes('UPDATE pr_solicitudes SET')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1, estado: 'aprobada' }];
      return [];
    });
    await expect(svc2.decidir(7, 10, { aprobado: true })).resolves.toMatchObject({ estado: 'aprobada' });
  });

  it('con la opción "Exigir que otra persona apruebe" activada: quien creó la solicitud NO puede aprobarla', async () => {
    const { svc } = buildService((sql: string) => {
      if (sql.includes('FROM pr_solicitudes s')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1 }]; // uid del tenantSvc mock es 1
      if (sql.includes('SELECT configuracion FROM empresa')) return [{ configuracion: { solicitudesExigirOtroAprobador: true } }];
      return [];
    });
    await expect(svc.decidir(7, 10, { aprobado: true })).rejects.toThrow(ForbiddenException);
  });

  it('con la opción activada: rechazar SÍ lo puede hacer quien creó la solicitud (la restricción es solo para aprobar)', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('FROM pr_solicitudes s')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1 }];
      if (sql.includes('SELECT configuracion FROM empresa')) return [{ configuracion: { solicitudesExigirOtroAprobador: true } }];
      if (sql.includes('UPDATE pr_solicitudes SET')) return [{ ...SOLICITUD_PENDIENTE, creadoPor: 1, estado: 'rechazada' }];
      return [];
    });
    const r: any = await svc.decidir(7, 10, { aprobado: false });
    expect(r.estado).toBe('rechazada');
    // Rechazar nunca consulta la config — la restricción solo aplica a aprobar.
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes('SELECT configuracion FROM empresa'))).toBe(false);
  });

  // Regresión del hueco real (TOCTOU): si entre el SELECT y el UPDATE otra
  // request ya decidió la solicitud, el UPDATE con la condición de estado
  // repetida no afecta ninguna fila — RETURNING * viene vacío — y eso debe
  // rechazarse explícitamente, nunca devolver `undefined` como si hubiera
  // ido bien.
  it('carrera: la solicitud cambió de estado ENTRE el SELECT y el UPDATE — se rechaza, no se sobrescribe en silencio', async () => {
    const { svc, ds } = buildService((sql: string) => {
      // orFail() todavía ve "pendiente" (leído antes de que ganara la otra request)...
      if (sql.includes('FROM pr_solicitudes s')) return [SOLICITUD_PENDIENTE];
      // ...pero el UPDATE, con la condición de estado real en la BD, ya no afecta
      // ninguna fila porque la otra request ya la dejó en 'rechazada'.
      if (sql.includes('UPDATE pr_solicitudes SET')) return [];
      return [];
    });
    await expect(svc.decidir(7, 10, { aprobado: true })).rejects.toThrow(BadRequestException);
    await expect(svc.decidir(7, 10, { aprobado: true })).rejects.toThrow(/ya fue decidida/);
  });
});
