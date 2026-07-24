/**
 * Regresion P0 — FUGA CROSS-TENANT en reportes financieros.
 *
 * Estas consultas usan SQL crudo (dataSource.query), que NO pasa por
 * TenantAwareRepository ni por el TenantSubscriber, y no hay RLS en Postgres.
 * El filtro por empresaId es responsabilidad explicita de cada query.
 *
 * COBERTURA:
 * 1. Sin contexto de empresa → lanza, NUNCA ejecuta la query
 * 2. Estado de Resultados / Balance General → filtran asiento Y catalogo por empresaId
 * 3. El filtro de asientos va en el ON del LEFT JOIN (no en el WHERE, que lo degradaria a INNER)
 * 4. Flujo de Efectivo (queries propias) → filtra ambos lados
 * 5. Fechas parametrizadas ($N), nunca interpoladas → sin SQL injection
 * 6. Dos empresas distintas → cada una recibe su propio empresaId
 */

import { ReportesFinancierosService } from './reportes-financieros.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';

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

function makeService(empresaId: number | null, captured: QueryCapturada[]) {
  const tenantSvc = { getEmpresaIdOrNull: () => empresaId } as any;
  return new ReportesFinancierosService(makeDataSource(captured), {} as any, tenantSvc);
}

/** Normaliza espacios para poder afirmar sobre fragmentos de SQL. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('ReportesFinancierosService — aislamiento multi-tenant', () => {
  // ── 1. Falla cerrado ────────────────────────────────────────────────────────

  describe('sin contexto de empresa', () => {
    it.each([
      ['estadoResultados', (s: ReportesFinancierosService) => s.estadoResultados('2026-01-01', '2026-12-31')],
      ['balanceGeneral',   (s: ReportesFinancierosService) => s.balanceGeneral('2026-12-31')],
      ['flujoEfectivo',    (s: ReportesFinancierosService) => s.flujoEfectivo('2026-01-01', '2026-12-31')],
      ['resumenEjecutivo', (s: ReportesFinancierosService) => s.resumenEjecutivo('2026-01-01', '2026-12-31', '2026-12-31')],
    ])('%s lanza y NO ejecuta ninguna query', async (_nombre, invocar) => {
      const captured: QueryCapturada[] = [];
      const svc = makeService(null, captured);

      await expect(invocar(svc)).rejects.toThrow(TenantContextMissingException);
      expect(captured).toHaveLength(0); // jamas toca la BD sin empresa
    });
  });

  // ── 2 y 3. Query base scopeada ──────────────────────────────────────────────

  describe('getMovimientosCuentas (Estado de Resultados / Balance General)', () => {
    it('filtra asientos por empresaId dentro del ON del LEFT JOIN', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).estadoResultados('2026-01-01', '2026-12-31');

      const sql = norm(captured[0].sql);
      // El filtro debe estar entre el LEFT JOIN de asientos y el WHERE.
      const tramoJoin = sql.slice(sql.indexOf('LEFT JOIN asientos_contables'), sql.indexOf('WHERE'));
      expect(tramoJoin).toContain('ac."empresaId" = $1');
    });

    it('filtra el catalogo de cuentas por empresaId (elimina lineas duplicadas por empresa)', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).estadoResultados('2026-01-01', '2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql.slice(sql.indexOf('WHERE'))).toContain('cc."empresaId" = $1');
    });

    it('pasa el empresaId del contexto como $1', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).estadoResultados('2026-01-01', '2026-12-31');

      expect(captured[0].params[0]).toBe(7);
    });

    it('empresas distintas reciben su propio empresaId', async () => {
      const capA: QueryCapturada[] = [];
      const capB: QueryCapturada[] = [];
      await makeService(7,  capA).estadoResultados('2026-01-01', '2026-12-31');
      await makeService(42, capB).estadoResultados('2026-01-01', '2026-12-31');

      expect(capA[0].params[0]).toBe(7);
      expect(capB[0].params[0]).toBe(42);
    });

    it('balanceGeneral (solo fechaCorte) tambien va scopeado', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).balanceGeneral('2026-12-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac."empresaId" = $1');
      expect(sql).toContain('cc."empresaId" = $1');
      expect(captured[0].params[0]).toBe(7);
    });
  });

  // ── 4. Flujo de Efectivo ────────────────────────────────────────────────────

  it('flujoEfectivo scopea sus 3 queries (movimientos + entradas + salidas)', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).flujoEfectivo('2026-01-01', '2026-12-31');

    expect(captured.length).toBeGreaterThanOrEqual(3);
    for (const q of captured) {
      const sql = norm(q.sql);
      expect(sql).toContain('ac."empresaId" = $1');
      expect(sql).toContain('cc."empresaId" = $1');
      expect(q.params[0]).toBe(7);
    }
  });

  // ── 5. SQL injection ────────────────────────────────────────────────────────

  describe('fechas parametrizadas (sin SQL injection)', () => {
    const INYECCION = `2026-01-01' OR '1'='1`;

    it('no interpola las fechas en el SQL — viajan como parametros', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).estadoResultados(INYECCION, '2026-12-31');

      for (const q of captured) {
        expect(q.sql).not.toContain(INYECCION);
        expect(q.sql).not.toContain("OR '1'='1");
      }
      expect(captured[0].params).toContain(INYECCION);
    });

    it('flujoEfectivo tampoco interpola fechas', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).flujoEfectivo(INYECCION, '2026-12-31');

      for (const q of captured) {
        expect(q.sql).not.toContain(INYECCION);
      }
    });

    it('el rango de fechas sigue aplicandose como BETWEEN parametrizado', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).estadoResultados('2026-03-01', '2026-03-31');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha BETWEEN $2 AND $3');
      expect(captured[0].params).toEqual([7, '2026-03-01', '2026-03-31']);
    });

    it('sin "desde" usa fecha <= $2 parametrizado', async () => {
      const captured: QueryCapturada[] = [];
      await makeService(7, captured).balanceGeneral('2026-06-30');

      const sql = norm(captured[0].sql);
      expect(sql).toContain('ac.fecha <= $2');
      expect(captured[0].params).toEqual([7, '2026-06-30']);
    });
  });
});
