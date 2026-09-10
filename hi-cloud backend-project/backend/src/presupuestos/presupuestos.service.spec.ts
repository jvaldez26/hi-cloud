/**
 * Regresion P0 — FUGA CROSS-TENANT en Presupuestos (obtenerRealGastos).
 *
 * Mismo patron de bug que balance-comprobacion.service.ts: el JOIN contra
 * cuentas_contables filtraba a."empresaId" (el asiento) pero nunca
 * c."empresaId" (el catalogo).
 */

import { PresupuestosService } from './presupuestos.service';

interface QueryCapturada { sql: string; params: unknown[] }

/** DataSource mock que captura el SQL y los parametros de cada query. */
function makeDataSource(captured: QueryCapturada[]) {
  return {
    query: (sql: string, params: unknown[] = []) => {
      captured.push({ sql, params });
      return Promise.resolve([]);
    },
  } as any;
}

function makeService(empresaId: number, captured: QueryCapturada[]) {
  const tenantSvc = { getEmpresaId: () => empresaId } as any;
  return new PresupuestosService({} as any, {} as any, makeDataSource(captured), tenantSvc);
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('PresupuestosService.obtenerRealGastos — aislamiento multi-tenant', () => {
  it('filtra el catalogo de cuentas (c) por empresaId, no solo el asiento (a)', async () => {
    const captured: QueryCapturada[] = [];
    const svc = makeService(7, captured) as any;
    await svc.obtenerRealGastos(2026);

    const sql = norm(captured[0].sql);
    expect(sql).toContain('a."empresaId" = $2');
    expect(sql).toContain('c."empresaId" = $2');
  });

  it('pasa anio como $1 y empresaId como $2', async () => {
    const captured: QueryCapturada[] = [];
    const svc = makeService(7, captured) as any;
    await svc.obtenerRealGastos(2026);

    expect(captured[0].params).toEqual([2026, 7]);
  });

  it('empresas distintas reciben su propio empresaId', async () => {
    const capA: QueryCapturada[] = [];
    const capB: QueryCapturada[] = [];
    await (makeService(7,  capA) as any).obtenerRealGastos(2026);
    await (makeService(42, capB) as any).obtenerRealGastos(2026);

    expect(capA[0].params).toEqual([2026, 7]);
    expect(capB[0].params).toEqual([2026, 42]);
  });
});
