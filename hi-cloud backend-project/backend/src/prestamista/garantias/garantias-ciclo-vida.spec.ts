/**
 * Ciclo de vida de garantías (liberar/ejecutar) — ver
 * docs/prestamista/etapa-2-resto.md §3. Antes 'estado' se editaba por un
 * PATCH genérico sin motivo ni rastro; ahora pasa por estos dos métodos.
 */
import { BadRequestException } from '@nestjs/common';
import { GarantiasService } from './garantias.service';

function buildService(responder: (sql: string, params: any[]) => any) {
  const ds = { query: jest.fn(async (sql: string, params: any[] = []) => responder(sql, params)) };
  const svc = new GarantiasService(ds as any);
  return { svc, ds };
}

const USUARIO = { id: 1, nombre: 'Jean Admin' };
const GARANTIA_ACTIVA = { id: 20, empresaId: 7, estado: 'activa' };

describe('GarantiasService — update() nunca toca estado', () => {
  it('un PATCH con estado en el body lo ignora silenciosamente (no está en la whitelist de columnas)', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [GARANTIA_ACTIVA];
      if (sql.includes('UPDATE pr_garantias SET')) return [{ ...GARANTIA_ACTIVA, ubicacion: 'Santiago' }];
      return [];
    });
    await svc.update(7, 20, { estado: 'ejecutada', ubicacion: 'Santiago' });
    const updateCall = ds.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_garantias SET'));
    expect(updateCall[0]).not.toContain('estado');
  });
});

describe('GarantiasService.liberar', () => {
  it('pasa de activa a liberada, con motivo y quién lo hizo', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [GARANTIA_ACTIVA];
      if (sql.includes("SET estado='liberada'")) return [{ ...GARANTIA_ACTIVA, estado: 'liberada' }];
      return [];
    });
    const r: any = await svc.liberar(7, 20, 'Préstamo pagado', USUARIO);
    expect(r.estado).toBe('liberada');
  });

  it('una garantía ya EJECUTADA no se puede liberar', async () => {
    const { svc } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [{ ...GARANTIA_ACTIVA, estado: 'ejecutada' }];
      return [];
    });
    await expect(svc.liberar(7, 20, 'motivo', USUARIO)).rejects.toThrow(BadRequestException);
  });

  it('ya liberada es idempotente', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [{ ...GARANTIA_ACTIVA, estado: 'liberada' }];
      return [];
    });
    await svc.liberar(7, 20, undefined, USUARIO);
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE'))).toBe(false);
  });
});

describe('GarantiasService.ejecutar', () => {
  it('pasa de activa a ejecutada, registra fechaEjecucion y motivo obligatorio', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [GARANTIA_ACTIVA];
      if (sql.includes("SET estado='ejecutada'")) return [{ ...GARANTIA_ACTIVA, estado: 'ejecutada' }];
      return [];
    });
    const r: any = await svc.ejecutar(7, 20, 'Deudor incumplió 6 cuotas consecutivas', USUARIO);
    expect(r.estado).toBe('ejecutada');
    const updateCall = ds.query.mock.calls.find(([sql]: any[]) => sql.includes("SET estado='ejecutada'"));
    expect(updateCall[1]).toEqual(['Deudor incumplió 6 cuotas consecutivas', 1, 'Jean Admin', 20, 7]);
  });

  it('una garantía ya LIBERADA no se puede ejecutar', async () => {
    const { svc } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [{ ...GARANTIA_ACTIVA, estado: 'liberada' }];
      return [];
    });
    await expect(svc.ejecutar(7, 20, 'motivo', USUARIO)).rejects.toThrow(BadRequestException);
  });

  it('ya ejecutada es idempotente', async () => {
    const { svc, ds } = buildService((sql: string) => {
      if (sql.includes('SELECT * FROM pr_garantias WHERE id=')) return [{ ...GARANTIA_ACTIVA, estado: 'ejecutada' }];
      return [];
    });
    await svc.ejecutar(7, 20, 'motivo', USUARIO);
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes('UPDATE'))).toBe(false);
  });
});
