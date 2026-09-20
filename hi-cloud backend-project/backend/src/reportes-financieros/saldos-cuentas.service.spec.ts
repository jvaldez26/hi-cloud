/**
 * Regresion P0 — aislamiento multi-tenant del motor de saldos compartido.
 *
 * Balance/Diagnóstico (2026-09-20): SaldosCuentasService reemplaza las dos
 * consultas SQL independientes que antes vivían por separado en
 * balance-comprobacion.service.ts (Balance de Comprobación) y
 * reportes-financieros.service.ts (Balance General/Estado de Resultados) —
 * ver el comentario en saldos-cuentas.service.ts. Esta suite es la
 * cobertura CANÓNICA de aislamiento multi-tenant para ambos motores ahora
 * que comparten una sola función; es equivalente/reemplaza a la que
 * balance-comprobacion.service.spec.ts cubría solo para ese motor.
 *
 * Usa SQL crudo (dataSource.query), que NO pasa por TenantAwareRepository
 * ni por el TenantSubscriber: el filtro por empresaId es responsabilidad
 * explícita de cada query. Tampoco hay RLS en Postgres.
 *
 * COBERTURA — obtenerSaldos():
 * 1. El catálogo de cuentas (cc) va filtrado por empresaId en el WHERE.
 * 2. Los asientos (ac) van filtrados por empresaId dentro del ON del LEFT JOIN.
 * 3. Sin "OR ... IS NULL" que deje pasar huérfanos de otra empresa.
 * 4. Empresas distintas reciben su propio empresaId como parámetro.
 * 5. Fechas parametrizadas, nunca interpoladas.
 *
 * COBERTURA — obtenerAsientosDescuadrados():
 * 6. Filtra por empresaId, sin "OR ... IS NULL".
 * 7. Empresas distintas reciben su propio empresaId.
 */

import { SaldosCuentasService } from './saldos-cuentas.service';

interface QueryCapturada { sql: string; params: unknown[] }

function makeDataSource(captured: QueryCapturada[]) {
  return {
    query: (sql: string, params: unknown[] = []) => {
      captured.push({ sql, params });
      return Promise.resolve([]);
    },
  } as any;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('SaldosCuentasService — aislamiento multi-tenant', () => {
  describe('obtenerSaldos()', () => {
    it('filtra el catálogo de cuentas (cc) por empresaId en el WHERE', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql.slice(sql.indexOf('WHERE'))).toContain('cc."empresaId" = $1');
    });

    it('filtra los asientos (ac) por empresaId dentro del ON del LEFT JOIN (no en el WHERE)', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      const sql = norm(captured[0].sql);
      const tramoJoin = sql.slice(sql.indexOf('LEFT JOIN asientos_contables'), sql.indexOf('WHERE'));
      expect(tramoJoin).toContain('ac."empresaId" = $1');
    });

    it('no deja pasar cuentas o asientos huérfanos (empresaId IS NULL) de otra empresa', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).not.toContain('IS NULL');
      expect(sql).not.toMatch(/OR\s+ac\."empresaId"/i);
      expect(sql).not.toMatch(/OR\s+cc\."empresaId"/i);
    });

    it('empresas distintas reciben su propio empresaId', async () => {
      const capA: QueryCapturada[] = [];
      const capB: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(capA)).obtenerSaldos(7,  undefined, '2026-12-31');
      await new SaldosCuentasService(makeDataSource(capB)).obtenerSaldos(42, undefined, '2026-12-31');

      expect(capA[0].params[0]).toBe(7);
      expect(capB[0].params[0]).toBe(42);
    });

    it('con "desde" y "hasta" usa BETWEEN parametrizado', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, '2026-01-01', '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha BETWEEN $2 AND $3');
      expect(captured[0].params).toEqual([7, '2026-01-01', '2026-12-31']);
    });

    it('solo "hasta" usa fecha <= parametrizada', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, undefined, '2026-06-30');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha <= $2');
      expect(captured[0].params).toEqual([7, '2026-06-30']);
    });

    it('no interpola una fecha maliciosa en el SQL', async () => {
      const INYECCION = `2026-01-01' OR '1'='1`;
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerSaldos(7, INYECCION, '2026-12-31');

      expect(captured[0].sql).not.toContain(INYECCION);
      expect(captured[0].params).toContain(INYECCION);
    });
  });

  describe('obtenerAsientosDescuadrados()', () => {
    it('filtra por empresaId, sin "OR ... IS NULL"', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerAsientosDescuadrados(7, '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('"empresaId" = $1');
      expect(sql).not.toContain('IS NULL');
      expect(sql).not.toMatch(/OR\s+"empresaId"/i);
    });

    it('empresas distintas reciben su propio empresaId', async () => {
      const capA: QueryCapturada[] = [];
      const capB: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(capA)).obtenerAsientosDescuadrados(7);
      await new SaldosCuentasService(makeDataSource(capB)).obtenerAsientosDescuadrados(42);

      expect(capA[0].params[0]).toBe(7);
      expect(capB[0].params[0]).toBe(42);
    });

    it('sin "hasta" no limita por fecha, pero sigue scopeada por empresa', async () => {
      const captured: QueryCapturada[] = [];
      await new SaldosCuentasService(makeDataSource(captured)).obtenerAsientosDescuadrados(7);

      expect(captured[0].params).toEqual([7]);
    });
  });
});
