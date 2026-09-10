/**
 * Regresion P0 — FUGA CROSS-TENANT en Balance de Comprobacion.
 *
 * balance-comprobacion.service.ts usa SQL crudo (dataSource.query), que NO pasa
 * por TenantAwareRepository ni por el TenantSubscriber: el filtro por empresaId
 * es responsabilidad explicita de la query. Es el reporte que el usuario ve en
 * pantalla (menu "Balance de Comprobacion").
 *
 * Bug original: el JOIN contra cuentas_contables no filtraba cc.empresaId, y el
 * WHERE tenia "OR ac.empresaId IS NULL" — dejaba pasar cuentas y asientos
 * huerfanos de cualquier empresa hacia el balance de TODAS las empresas.
 *
 * COBERTURA:
 * 1. Sin contexto de empresa → lanza (ForbiddenException via TenantService), nunca ejecuta la query.
 * 2. El catalogo de cuentas (cc) va filtrado por empresaId en el WHERE.
 * 3. Los asientos (ac) van filtrados por empresaId dentro del ON del LEFT JOIN.
 * 4. Ya no existe el "OR ... IS NULL" que dejaba pasar huerfanos de cualquier empresa.
 * 5. Dos empresas distintas → cada una recibe su propio empresaId como $2.
 */

import { ForbiddenException } from '@nestjs/common';
import { BalanceComprobacionService } from './balance-comprobacion.service';

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
  const tenantSvc = {
    getEmpresaId: () => {
      if (empresaId == null) {
        throw new ForbiddenException('Se requiere contexto de empresa. Realiza login o cambia de empresa activa.');
      }
      return empresaId;
    },
  } as any;
  return new BalanceComprobacionService(makeDataSource(captured), tenantSvc);
}

/** Normaliza espacios para poder afirmar sobre fragmentos de SQL. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('BalanceComprobacionService — aislamiento multi-tenant', () => {
  it('sin contexto de empresa lanza y NO ejecuta ninguna query', async () => {
    const captured: QueryCapturada[] = [];
    const svc = makeService(null, captured);

    await expect(svc.getBalance('2026-12-31')).rejects.toThrow(ForbiddenException);
    expect(captured).toHaveLength(0); // jamas toca la BD sin empresa
  });

  it('filtra el catalogo de cuentas (cc) por empresaId en el WHERE', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).getBalance('2026-12-31');

    const sql = norm(captured[0].sql);
    expect(sql.slice(sql.indexOf('WHERE'))).toContain('cc."empresaId" = $2');
  });

  it('filtra los asientos (ac) por empresaId dentro del ON del LEFT JOIN (no en el WHERE)', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).getBalance('2026-12-31');

    const sql = norm(captured[0].sql);
    const tramoJoin = sql.slice(sql.indexOf('LEFT JOIN asientos_contables'), sql.indexOf('WHERE'));
    expect(tramoJoin).toContain('ac."empresaId" = $2');
  });

  it('ya no deja pasar cuentas o asientos huerfanos (empresaId IS NULL) de otra empresa', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).getBalance('2026-12-31');

    const sql = norm(captured[0].sql);
    expect(sql).not.toContain('IS NULL');
    expect(sql).not.toMatch(/OR\s+ac\."empresaId"/i);
  });

  it('pasa fechaCorte como $1 y empresaId como $2', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).getBalance('2026-12-31');

    expect(captured[0].params).toEqual(['2026-12-31', 7]);
  });

  it('empresas distintas reciben su propio empresaId', async () => {
    const capA: QueryCapturada[] = [];
    const capB: QueryCapturada[] = [];
    await makeService(7,  capA).getBalance('2026-12-31');
    await makeService(42, capB).getBalance('2026-12-31');

    expect(capA[0].params[1]).toBe(7);
    expect(capB[0].params[1]).toBe(42);
  });

  it('sin fecha "hasta" usa fechaHoyRD() como corte y sigue parametrizado', async () => {
    const captured: QueryCapturada[] = [];
    await makeService(7, captured).getBalance();

    expect(typeof captured[0].params[0]).toBe('string');
    expect(captured[0].params[1]).toBe(7);
  });
});
