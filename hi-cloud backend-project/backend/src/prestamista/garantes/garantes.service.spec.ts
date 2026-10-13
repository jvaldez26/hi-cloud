/**
 * Ciclo de vida de garantes — ver docs/prestamista/etapa-2-resto.md §2.
 * La entidad existía sin servicio ni controller (una tabla sin API).
 */
import { NotFoundException } from '@nestjs/common';
import { GarantesService } from './garantes.service';

function buildService(responder: (sql: string, params: any[]) => any) {
  const ds = { query: jest.fn(async (sql: string, params: any[] = []) => responder(sql, params)) };
  const svc = new GarantesService(ds as any);
  return { svc, ds };
}

const USUARIO = { id: 1, nombre: 'Jean Admin' };
const GARANTE = { id: 10, empresaId: 7, prestamoId: 5, nombre: 'Pedro Pérez', estado: 'activo' };

describe('GarantesService', () => {
  it('create valida que el préstamo sea de la empresa antes de insertar', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('FROM pr_prestamos')) return []; // préstamo de OTRA empresa / inexistente
      return [];
    });
    await expect(svc.create(7, { nombre: 'Pedro', prestamoId: 999 })).rejects.toThrow(NotFoundException);
  });

  it('create inserta con los campos esperados', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('FROM pr_prestamos')) return [{ x: 1 }];
      if (sql.includes('INSERT INTO pr_garantes')) return [GARANTE];
      return [];
    });
    const r = await svc.create(7, { nombre: 'Pedro Pérez', prestamoId: 5 });
    expect(r).toEqual(GARANTE);
  });

  it('findOne: inexistente lanza NotFoundException', async () => {
    const { svc } = buildService(() => []);
    await expect(svc.findOne(7, 404)).rejects.toThrow(NotFoundException);
  });

  it('liberar: marca estado=liberado con quién y cuándo, nunca automático', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantes WHERE id=')) return [GARANTE];
      if (sql.includes("SET estado='liberado'")) return [{ ...GARANTE, estado: 'liberado' }];
      return [];
    });
    const r: any = await svc.liberar(7, 10, 'Préstamo pagado completo', USUARIO);
    expect(r.estado).toBe('liberado');
    const updateCall = ds.query.mock.calls.find(([sql]: any[]) => sql.includes("SET estado='liberado'"));
    expect(updateCall[1]).toEqual([1, 'Jean Admin', 'Préstamo pagado completo', 10, 7]);
  });

  it('liberar: ya liberado es idempotente (no vuelve a escribir)', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantes WHERE id=')) return [{ ...GARANTE, estado: 'liberado' }];
      return [];
    });
    const r: any = await svc.liberar(7, 10, undefined, USUARIO);
    expect(r.estado).toBe('liberado');
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE'))).toBe(false);
  });

  it('remove: baja lógica (isActive=false), no borra la fila', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantes WHERE id=')) return [GARANTE];
      return [];
    });
    await svc.remove(7, 10);
    const updateCall = ds.query.mock.calls.find(([sql]: any[]) => sql.includes('"isActive"=false'));
    expect(updateCall).toBeDefined();
  });
});
