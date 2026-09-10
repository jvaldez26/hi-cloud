/**
 * DistribucionCostosService.ejecutarRegla — el asiento de distribución debe
 * quedar correctamente contabilizado y con empresaId en TODAS sus filas.
 *
 * Bugs corregidos en el mismo bloque de 15 líneas (sin arreglarlos juntos, el
 * fix de empresaId nunca llegaba a ejecutarse):
 * 1. `{ rows: [asiento] } = await dataSource.query(...)` — TypeORM devuelve
 *    el array de filas directamente, no { rows: [...] } — lanzaba en cada
 *    ejecución.
 * 2. Columna "tipo" no existe en asientos_contables — es "tipoOrigen".
 * 3. estado 'borrador' nunca aparece en ningún reporte (filtran
 *    'contabilizado').
 * 4. INSERT a asiento_lineas sin empresaId — líneas huérfanas.
 */

import { DistribucionCostosService } from './distribucion-costos.service';

function makeService(regla: any) {
  const queries: { sql: string; params: any[] }[] = [];
  const dataSource = {
    query: jest.fn((sql: string, params: any[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO asientos_contables')) {
        return Promise.resolve([{ id: 999 }]); // TypeORM: array de filas, no { rows }
      }
      return Promise.resolve([]);
    }),
  };
  const reglaRepo = { update: jest.fn().mockResolvedValue({}) };
  const tenantService = { getEmpresaId: () => 7 };

  const svc: any = Object.create(DistribucionCostosService.prototype);
  svc.dataSource    = dataSource;
  svc.reglaRepo     = reglaRepo;
  svc.tenantService = tenantService;
  svc.findReglaById = jest.fn().mockResolvedValue(regla);
  return { svc, queries };
}

describe('DistribucionCostosService.ejecutarRegla', () => {
  const regla = {
    id: 1, nombre: 'Renta oficina', cuentaOrigenId: 10, vecesEjecutada: 0,
    lineas: [
      { cuentaDestinoId: 20, cuentaDestinoNombre: 'Sucursal A', porcentaje: 60 },
      { cuentaDestinoId: 21, cuentaDestinoNombre: 'Sucursal B', porcentaje: 40 },
    ],
  };

  it('no revienta con la desestructuración de dataSource.query() y retorna el asientoId', async () => {
    const { svc } = makeService(regla);
    const r = await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    expect(r.asientoId).toBe(999);
    expect(r.lineasDistribuidas).toBe(2);
  });

  it('el INSERT a asientos_contables usa "tipoOrigen" (no "tipo") y estado contabilizado', async () => {
    const { svc, queries } = makeService(regla);
    await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    const q = queries.find(q => q.sql.includes('INSERT INTO asientos_contables'));
    expect(q!.sql).toContain('"tipoOrigen"');
    expect(q!.sql).not.toMatch(/[^"]tipo[^O]/); // no la columna "tipo" suelta
    expect(q!.sql).toContain(`'contabilizado'`);
  });

  it('cada INSERT a asiento_lineas incluye empresaId — ya no quedan líneas huérfanas', async () => {
    const { svc, queries } = makeService(regla);
    await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    const lineas = queries.filter(q => q.sql.includes('INSERT INTO asiento_lineas'));
    expect(lineas).toHaveLength(3); // 1 crédito origen + 2 débitos destino
    for (const l of lineas) {
      expect(l.sql).toContain('"empresaId"');
      expect(l.params[0]).toBe(7); // empresaId es el primer parámetro
    }
  });
});
