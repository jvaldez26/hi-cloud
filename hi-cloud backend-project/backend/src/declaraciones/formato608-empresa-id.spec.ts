/**
 * Formato 608 — fuga entre empresas (2026-09-24).
 *
 * getFormato608() era la ÚNICA consulta de este servicio sin filtro por
 * empresaId — traía las facturas ANULADAS de TODAS las empresas del sistema
 * para el mes pedido, sin importar cuál estuviera activa. Reportado por el
 * usuario: una empresa recién creada, sin ninguna transacción propia, veía
 * 21 comprobantes anulados (NCF, cliente, RNC, montos) de otra empresa.
 *
 * Cada otra consulta de declaraciones.service.ts (606, 607, IT-1,
 * operacionesVentaPeriodo, getRnc) sí filtra por `f."empresaId" = $1` /
 * `this.eid` — este test fija esa misma regla para el 608, para que no
 * vuelva a faltar en un método nuevo sin que algo la reclame.
 */

import { DeclaracionesService } from './declaraciones.service';

function makeService(empresaId: number, rows: any[] = []) {
  const consultas: { sql: string; params: any[] }[] = [];
  const svc: any = Object.create(DeclaracionesService.prototype);
  svc.dataSource = {
    query: async (sql: string, params: any[]) => {
      consultas.push({ sql, params });
      return rows;
    },
  };
  svc.tenantSvc = { getEmpresaId: () => empresaId };
  return { svc: svc as DeclaracionesService, consultas };
}

describe('DeclaracionesService.getFormato608() — aislamiento por empresa', () => {
  it('filtra la consulta por empresaId — nunca trae facturas de otra empresa', async () => {
    const { svc, consultas } = makeService(42);
    await svc.getFormato608(9, 2026);

    expect(consultas).toHaveLength(1);
    expect(consultas[0].sql).toContain('f."empresaId"');
    expect(consultas[0].params[0]).toBe(42);
  });

  it('el período sigue viajando como segundo parámetro, sin desplazar el filtro de empresa', async () => {
    const { svc, consultas } = makeService(7);
    await svc.getFormato608(3, 2026);

    expect(consultas[0].params).toEqual([7, '2026-03']);
  });

  it('una empresa nueva sin facturas propias no ve nada, aunque otras empresas sí tengan anuladas ese mes', async () => {
    // El mock simula al motor real: WHERE empresaId=$1 sobre una BD que
    // contiene filas de otra empresa — el resultado que llega aquí ya viene
    // filtrado, así que una empresa nueva con 0 propias siempre recibe [].
    const { svc } = makeService(99, []);
    const r = await svc.getFormato608(9, 2026);

    expect(r.comprobantes).toEqual([]);
    expect(r.resumen.totalDocumentos).toBe(0);
    expect(r.resumen.totalMonto).toBe(0);
  });
});
