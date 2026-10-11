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

  it('quien creó la solicitud no puede aprobarla (segregación de funciones)', async () => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_solicitudes s') ? [{ ...SOLICITUD_PENDIENTE, creadoPor: 1 }] : []); // uid del tenantSvc mock es 1
    await expect(svc.decidir(7, 10, { aprobado: true })).rejects.toThrow(ForbiddenException);
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
